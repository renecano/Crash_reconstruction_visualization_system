#!/usr/bin/env node
/**
 * La cadena de medición de U5 (ADR 0115), reanudable: build WebGL, e2e de cámaras, capturas de antes
 * y después y la E6 del visor Unity en media (a varias escalas de dibujo) y en baja.
 *
 * **A prueba de cierres.** Cada paso que termina queda anotado de inmediato en
 * `eval/results/u5_estado.json` (qué build, qué capturas y qué escena, nivel, escala y repetición ya
 * están medidos). Al relanzarla se salta lo hecho y sigue con lo que falta:
 *
 * - **El build** no se rehace si `Build/web` existe y su huella (la de los fuentes del proyecto de
 *   Unity) es la anotada. Si los fuentes cambiaron, se compila otra vez y las mediciones del build
 *   anterior se archivan: no se mezclan cifras de dos builds.
 * - **Cada medición** (un navegador nuevo por escena y repetición) se guarda al terminar. Una que
 *   falla se reintenta una vez y, si vuelve a fallar, queda anotada con su error para el siguiente
 *   intento.
 *
 * No corre dentro de la sesión de Claude Code: la lanza `tools/unity/u5-cadena.ps1 -Lanzar` como una
 * tarea de Windows, que además evita que la laptop se suspenda.
 *
 *   node eval/u5_cadena.mjs            # sigue con lo que falte
 *   node eval/u5_cadena.mjs --estado   # solo dice cómo va (no mide ni compila)
 *   node eval/u5_cadena.mjs --humo     # una medición corta de prueba, sin anotarla
 *
 * Al terminar cada configuración escribe `eval/results/e6_unity_<configuración>.json`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { useBestPerformance } from "./lib/power-mode.mjs";
import { condiciones, medirEscena, resumenPorEscena, servirBuild } from "./lib/unity-e6.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const PROYECTO = join(RAIZ, "apps/visor-unity");
const BUILD = join(PROYECTO, "Build/web");
const CASOS_DIR = join(PROYECTO, "Build/casos");
const REGISTROS = join(PROYECTO, "Logs");
const ESTADO = join(RAIZ, "eval/results/u5_estado.json");
const CANDADO = join(REGISTROS, "u5-cadena.pid");
const VERSION_ESTADO = 1;

const REPETICIONES = 3;
const SEGUNDOS = 12;
const ANCHO = 1920;
const ALTO = 1080;
const PAUSA_ENTRE_CONFIGURACIONES_S = 90;
/** Presupuesto de PLAN §7.8 a 1080p. */
const META = { baja: 30, media: 60 };

/**
 * Lo que se mide, en este orden. `escala` es la escala de dibujo que se deja puesta tras cargar
 * (null: la del perfil del nivel). La escala de media no está decidida: se miden las candidatas
 * para que René elija.
 */
const CONFIGURACIONES = [
  { nombre: "media_escala_1", nivel: "media", escala: null },
  { nombre: "baja", nivel: "baja", escala: null },
  { nombre: "media_escala_0.7", nivel: "media", escala: 0.7 },
  { nombre: "media_escala_0.6", nivel: "media", escala: 0.6 },
  { nombre: "media_escala_0.5", nivel: "media", escala: 0.5 },
];
/** Las tres escenas de las comparaciones de antes y después. */
const ESCENAS_DE_MUESTRA = "axa-dia,lateral_interseccion-noche,nocturno_lluvia-noche";
/** Las capturas a 1080p del build WebGL: las 10 escenas en media y las de muestra por escala. */
const CAPTURAS = [
  { nombre: "media", salida: "docs/cesvi/u5/media", args: [] },
  ...[0.8, 0.7, 0.6, 0.5].map((e) => ({
    nombre: `escala_${e}`,
    salida: `docs/cesvi/u5/escalas/escala_${e}`,
    args: ["--solo", ESCENAS_DE_MUESTRA, "--depurar", JSON.stringify({ escala: e })],
  })),
];
/** Lo que entra al build: si algo de aquí cambia, el build ya no es el mismo. */
const FUENTES_DEL_BUILD = [
  "apps/visor-unity/Assets",
  "apps/visor-unity/ProjectSettings",
  "apps/visor-unity/Packages",
  "apps/web/recursos.json",
  "tools/unity/build-web.ps1",
  "tools/unity/comun.ps1",
];
/** El build los vuelve a generar; se devuelven a como están en git. */
const REGENERADOS = [
  "apps/visor-unity/Assets/Croquis/Escenas/Visor.unity",
  "apps/visor-unity/Assets/UniversalRenderPipelineGlobalSettings.asset",
];

const require = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
const tiene = (bandera) => process.argv.includes(`--${bandera}`);
const hora = () => new Date().toISOString().slice(11, 19);
const decir = (...a) => console.log(`[${hora()}]`, ...a);
const git = (...a) => execFileSync("git", a, { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 28 });
const powershell = (comando) =>
  execFileSync("powershell", ["-NoProfile", "-Command", comando], { encoding: "utf8" }).trim();
const dormir = (s) => new Promise((ok) => setTimeout(ok, s * 1000));

// ---- El estado ------------------------------------------------------------------------------------

function leerEstado() {
  if (!existsSync(ESTADO)) return { version: VERSION_ESTADO, mediciones: [], capturas: {} };
  const e = JSON.parse(readFileSync(ESTADO, "utf8"));
  if (e.version !== VERSION_ESTADO) throw new Error(`Estado de otra versión: ${e.version}`);
  return e;
}

/** Guarda el estado sin dejarlo a medias: primero a un archivo temporal y luego se renombra. */
function guardarEstado(e) {
  e.actualizado = new Date().toISOString();
  mkdirSync(join(RAIZ, "eval/results"), { recursive: true });
  const temporal = `${ESTADO}.tmp`;
  writeFileSync(temporal, `${JSON.stringify(e, null, 2)}\n`);
  renameSync(temporal, ESTADO);
}

/** La huella de los fuentes del build: lo que está en git, lo cambiado sin commit y lo nuevo. */
function huellaDelBuild() {
  for (const f of REGENERADOS) {
    try {
      git("checkout", "--", f);
    } catch {
      // No estaba cambiado.
    }
  }
  const h = createHash("sha1");
  h.update(git("ls-files", "-s", "--", ...FUENTES_DEL_BUILD));
  h.update(git("diff", "HEAD", "--", ...FUENTES_DEL_BUILD));
  for (const f of git("ls-files", "--others", "--exclude-standard", "--", ...FUENTES_DEL_BUILD)
    .split("\n")
    .filter(Boolean)
    .sort()) {
    h.update(f);
    h.update(readFileSync(join(RAIZ, f)));
  }
  return h.digest("hex");
}

const casosDisponibles = () =>
  existsSync(CASOS_DIR)
    ? readdirSync(CASOS_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -5))
        .sort()
    : [];

const medida = (e, config, caso, rep) =>
  e.mediciones.find(
    (m) => m.configuracion === config && m.caso === caso && m.repeticion === rep && !m.error,
  );

function resumen(e) {
  const casos = casosDisponibles();
  const lineas = [
    `Build: ${e.build ? `${e.build.huella.slice(0, 10)} (${e.build.fecha}, ${e.build.mb} MB)` : "pendiente"}`,
    `e2e de cámaras: ${e.e2e ? (e.e2e.ok ? "en verde" : "FALLÓ") : "pendiente"}`,
    `Capturas: ${CAPTURAS.map((c) => `${c.nombre} ${e.capturas?.[c.nombre] ? "✓" : "…"}`).join(", ")}`,
  ];
  for (const c of CONFIGURACIONES) {
    const hechas = e.mediciones.filter((m) => m.configuracion === c.nombre && !m.error);
    const total = casos.length * REPETICIONES;
    const r = resumenPorEscena(hechas, casos, META[c.nivel]);
    const fps = casos.map((k) => r[k].fps_promedio_mediana ?? "–").join(" / ");
    lineas.push(`${c.nombre}: ${hechas.length}/${total} mediciones · fps por escena: ${fps}`);
  }
  const fallas = e.mediciones.filter((m) => m.error).length;
  if (fallas) lineas.push(`Mediciones con error (se reintentan al relanzar): ${fallas}`);
  lineas.push(`Terminada: ${e.terminada ? "sí" : "no"} · actualizado ${e.actualizado ?? "nunca"}`);
  return lineas.join("\n");
}

// ---- Los pasos ------------------------------------------------------------------------------------

function cerrarLoQueEstorba() {
  // René lo autoriza: Edge abierto se lleva la memoria que falta para medir.
  try {
    powershell("Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force");
  } catch {
    // Sin Edge abierto.
  }
}

/** Ningún Unity vivo antes de un paso pesado: se cierra el que quedó en modo batch de otra corrida. */
function sinUnityVivo() {
  const vivos = powershell(
    "Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | ForEach-Object { $_.ProcessId.ToString() + '|' + $_.CommandLine }",
  )
    .split(/\r?\n/)
    .filter(Boolean);
  for (const v of vivos) {
    const [pid, linea] = [v.slice(0, v.indexOf("|")), v.slice(v.indexOf("|") + 1)];
    if (!/-batchmode/i.test(linea)) {
      throw new Error("Hay un Editor de Unity abierto: ciérralo y relanza la cadena.");
    }
    decir(`Cierro un Unity en modo batch que quedó vivo (PID ${pid}).`);
    powershell(`Stop-Process -Id ${pid} -Force`);
  }
}

function correr(titulo, comando, args, opciones = {}) {
  decir(`${titulo}…`);
  const t0 = Date.now();
  const r = spawnSync(comando, args, { cwd: RAIZ, stdio: "inherit", ...opciones });
  const min = ((Date.now() - t0) / 60000).toFixed(1);
  if (r.status !== 0) throw new Error(`${titulo}: terminó con código ${r.status} en ${min} min`);
  decir(`${titulo}: listo en ${min} min.`);
}

function paquetes() {
  const faltan = casosDisponibles().length < 10;
  const sinE2e = !existsSync(join(PROYECTO, "Build/u3/motociclista.json"));
  const tsx = (...a) =>
    correr(`Paquetes ${a[0]}`, "pnpm", ["--filter", "@croquis/scene-schema", "exec", "tsx", ...a], {
      shell: true,
    });
  if (faltan) tsx("../../tools/unity/paquetes-d1.ts");
  if (sinE2e) {
    tsx("../../tools/unity/paquetes-escenas.ts", "u3", "peaton_cruce", "motociclista", "alcance");
  }
}

function construir(e, huella) {
  if (e.build?.huella === huella && existsSync(join(BUILD, "index.html"))) {
    decir(`El build ya está hecho con esta huella (${huella.slice(0, 10)}): no se rehace.`);
    return e;
  }
  if (e.build && e.build.huella !== huella && e.mediciones.length) {
    // No se mezclan cifras de dos builds: lo medido con el anterior se archiva.
    const archivo = ESTADO.replace(/\.json$/, `.${e.build.huella.slice(0, 10)}.json`);
    writeFileSync(archivo, `${JSON.stringify(e, null, 2)}\n`);
    decir(`Los fuentes cambiaron: lo medido con el build anterior queda en ${archivo}.`);
    e = { version: VERSION_ESTADO, mediciones: [], capturas: {} };
  }
  cerrarLoQueEstorba();
  sinUnityVivo();
  correr("Build WebGL", "powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    join(RAIZ, "tools/unity/build-web.ps1"),
  ]);
  sinUnityVivo();
  const registro = join(PROYECTO, "Logs/build-web.log");
  if (existsSync(registro) && /error CS\d+/.test(readFileSync(registro, "utf8"))) {
    throw new Error("El build tiene errores de compilación (Logs/build-web.log).");
  }
  if (!existsSync(join(BUILD, "index.html"))) throw new Error("El build no dejó Build/web.");
  for (const f of REGENERADOS) git("checkout", "--", f);
  const bytes = (dir) =>
    readdirSync(dir).reduce((s, f) => {
      const p = join(dir, f);
      return s + (statSync(p).isDirectory() ? bytes(p) : statSync(p).size);
    }, 0);
  e.build = {
    huella,
    fecha: new Date().toISOString(),
    mb: Math.round(bytes(BUILD) / 1048576),
    commit: git("rev-parse", "HEAD").trim(),
  };
  delete e.e2e;
  e.capturas = {};
  e.terminada = false;
  guardarEstado(e);
  return e;
}

function e2eCamaras(e) {
  if (e.e2e?.huella === e.build.huella && e.e2e.ok) return;
  cerrarLoQueEstorba();
  try {
    correr("e2e de cámaras", "node", [
      "tools/unity/e2e-camaras.mjs",
      "--caso",
      "apps/visor-unity/Build/u3/motociclista.json",
      "--t",
      "0.3",
    ]);
    e.e2e = { huella: e.build.huella, ok: true, fecha: new Date().toISOString() };
  } catch (err) {
    // No detiene la medición, pero queda dicho: hay que verla antes de dar U5 por cerrada.
    e.e2e = { huella: e.build.huella, ok: false, error: String(err).slice(0, 300) };
    decir(`La e2e de cámaras falló: ${e.e2e.error}`);
  }
  guardarEstado(e);
}

function capturas(e) {
  for (const c of CAPTURAS) {
    if (e.capturas[c.nombre]?.huella === e.build.huella) continue;
    cerrarLoQueEstorba();
    const salida = join(RAIZ, c.salida);
    rmSync(salida, { recursive: true, force: true });
    try {
      correr(`Capturas ${c.nombre}`, "node", [
        "tools/unity/capturas.mjs",
        "--casos",
        "casos",
        "--vistas",
        "cinematica",
        "--sin-fps",
        "--nivel",
        "media",
        "--ancho",
        String(ANCHO),
        "--alto",
        String(ALTO),
        "--salida",
        c.salida,
        ...c.args,
      ]);
      e.capturas[c.nombre] = {
        huella: e.build.huella,
        archivos: readdirSync(salida).length,
        fecha: new Date().toISOString(),
      };
    } catch (err) {
      decir(`Las capturas ${c.nombre} fallaron (se reintentan al relanzar): ${String(err)}`);
    }
    guardarEstado(e);
  }
}

async function medir(e) {
  const casos = casosDisponibles();
  const servidor = await servirBuild(BUILD, RAIZ);
  const energia = useBestPerformance();
  e.energia = energia.registro;
  try {
    for (const c of CONFIGURACIONES) {
      const faltantes = [];
      for (let rep = 1; rep <= REPETICIONES; rep++) {
        // Orden alterno de escenas entre repeticiones (ADR 0026).
        for (const caso of rep % 2 ? casos : [...casos].reverse()) {
          if (!medida(e, c.nombre, caso, rep)) faltantes.push([caso, rep]);
        }
      }
      if (!faltantes.length) continue;
      decir(`${c.nombre}: faltan ${faltantes.length} mediciones.`);
      e.condiciones ??= {};
      e.condiciones[c.nombre] ??= { inicio: condiciones() };
      if (e.condiciones[c.nombre].inicio.conectada === false) {
        decir("ADVERTENCIA: el equipo está en batería; la medición no es comparable (ADR 0026).");
      }
      for (const [caso, rep] of faltantes) {
        cerrarLoQueEstorba();
        const paquete = readFileSync(join(CASOS_DIR, `${caso}.json`), "utf8");
        let r = null;
        let error = null;
        for (let intento = 1; intento <= 2 && !r; intento++) {
          try {
            r = await medirEscena({
              chromium,
              url: servidor.url,
              paquete,
              nivel: c.nivel,
              depurar: c.escala === null ? null : { escala: c.escala },
              ancho: ANCHO,
              alto: ALTO,
              segundos: SEGUNDOS,
            });
            r.intento = intento;
          } catch (err) {
            error = String(err).slice(0, 300);
            decir(`${c.nombre} ${caso} rep ${rep}, intento ${intento}: ${error}`);
          }
        }
        // Una entrada por medición: la que falló se reemplaza al volver a intentarla.
        e.mediciones = e.mediciones.filter(
          (m) => !(m.configuracion === c.nombre && m.caso === caso && m.repeticion === rep),
        );
        e.mediciones.push({
          configuracion: c.nombre,
          nivel: c.nivel,
          escala: c.escala,
          caso,
          repeticion: rep,
          fecha: new Date().toISOString(),
          ...(r ?? { error }),
        });
        guardarEstado(e);
        if (r) decir(`${c.nombre} ${caso} rep ${rep}: ${r.fps_promedio} fps`);
      }
      e.condiciones[c.nombre].fin = condiciones();
      guardarEstado(e);
      escribirResultado(e, c, casos);
      decir(`Pausa de ${PAUSA_ENTRE_CONFIGURACIONES_S} s para que el equipo se enfríe.`);
      await dormir(PAUSA_ENTRE_CONFIGURACIONES_S);
    }
  } finally {
    await servidor.cerrar();
    energia.restore();
  }
}

/** El resultado de una configuración, con la forma de los demás `e6_*.json`. */
function escribirResultado(e, c, casos) {
  const corridas = e.mediciones.filter((m) => m.configuracion === c.nombre);
  const buenas = corridas.filter((m) => !m.error);
  if (buenas.length < casos.length * REPETICIONES) return;
  const version = readFileSync(join(PROYECTO, "ProjectSettings/ProjectVersion.txt"), "utf8").match(
    /m_EditorVersion: (.+)/,
  )?.[1];
  const inicio = e.condiciones?.[c.nombre]?.inicio ?? null;
  const fin = e.condiciones?.[c.nombre]?.fin ?? null;
  const doc = {
    fecha: new Date().toISOString(),
    commit: e.build.commit,
    huella_build: e.build.huella,
    unity: version,
    navegador: `Chromium de Playwright ${chromium.name()}`,
    metodo:
      `Build WebGL servido localmente; ${ANCHO}×${ALTO}; un navegador nuevo por medición; ${REPETICIONES} repeticiones ` +
      `en orden alterno; cámara cinematográfica, reproducción en bucle; 3 s de calentamiento y ${SEGUNDOS} s de ` +
      "tiempos de cuadro del navegador (requestAnimationFrame). Se reporta la mediana del promedio de fps. " +
      "Nivel fijo, sin el automático. vsync desactivado (--disable-gpu-vsync --disable-frame-rate-limit) para medir " +
      "capacidad. Medido con la cadena reanudable eval/u5_cadena.mjs: las mediciones pueden venir de más de una corrida.",
    nivel: c.nivel,
    escala_de_dibujo: c.escala ?? "la del perfil del nivel",
    meta: "PLAN §7.8: media ≥ 60 fps y baja ≥ 30 fps a 1080p; alta y ultra en la laptop solo como información.",
    maquina: {
      cpu: os.cpus()[0]?.model,
      nucleos: os.cpus().length,
      ram_gb: Math.round(os.totalmem() / 2 ** 30),
      so: `${os.type()} ${os.release()}`,
      gpu: buenas.find((m) => m.gpu)?.gpu ?? null,
    },
    condiciones: {
      energia: e.energia ?? null,
      inicio,
      fin,
      validas: inicio?.conectada !== false && fin?.conectada !== false,
    },
    resumen: { [c.nivel]: resumenPorEscena(buenas, casos, META[c.nivel]) },
    corridas,
  };
  const salida = join(RAIZ, `eval/results/e6_unity_${c.nombre}.json`);
  writeFileSync(salida, `${JSON.stringify(doc, null, 2)}\n`);
  decir(`Escrito ${salida}`);
}

// ---- El principio -----------------------------------------------------------------------------------

if (tiene("estado")) {
  console.log(resumen(leerEstado()));
  process.exit(0);
}

if (tiene("humo")) {
  // Una medición corta con el build que haya, sin anotarla: para probar que todo conecta.
  const servidor = await servirBuild(BUILD, RAIZ);
  try {
    const caso = casosDisponibles()[0];
    const r = await medirEscena({
      chromium,
      url: servidor.url,
      paquete: readFileSync(join(CASOS_DIR, `${caso}.json`), "utf8"),
      nivel: "media",
      depurar: { escala: 0.6 },
      segundos: 3,
    });
    console.log(`humo ${caso}:`, JSON.stringify(r));
  } finally {
    await servidor.cerrar();
  }
  process.exit(0);
}

// Una sola cadena a la vez: el candado lleva el PID de la que corre.
mkdirSync(REGISTROS, { recursive: true });
if (existsSync(CANDADO)) {
  const pid = Number(readFileSync(CANDADO, "utf8"));
  let viva = false;
  try {
    process.kill(pid, 0);
    viva = true;
  } catch {
    // El proceso ya no existe: el candado quedó de una corrida cortada.
  }
  if (viva) {
    console.error(`Ya hay una cadena corriendo (PID ${pid}).`);
    process.exit(2);
  }
}
writeFileSync(CANDADO, String(process.pid));
const soltar = () => rmSync(CANDADO, { force: true });
process.once("exit", soltar);
for (const s of ["SIGINT", "SIGTERM"]) process.once(s, () => process.exit(130));

let estado = leerEstado();
try {
  decir(`Cadena de U5, PID ${process.pid}. Estado al empezar:\n${resumen(estado)}`);
  paquetes();
  estado = construir(estado, huellaDelBuild());
  e2eCamaras(estado);
  capturas(estado);
  await medir(estado);
  const casos = casosDisponibles();
  for (const c of CONFIGURACIONES) escribirResultado(estado, c, casos);
  estado.terminada = CONFIGURACIONES.every((c) =>
    casos.every((k) =>
      Array.from({ length: REPETICIONES }, (_, i) => i + 1).every((rep) =>
        medida(estado, c.nombre, k, rep),
      ),
    ),
  );
  guardarEstado(estado);
  decir(`Fin de la cadena.\n${resumen(estado)}`);
  process.exit(estado.terminada ? 0 : 3);
} catch (err) {
  guardarEstado(estado);
  decir(`La cadena se detuvo: ${String(err)}`);
  process.exit(1);
}
