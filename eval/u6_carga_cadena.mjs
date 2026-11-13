#!/usr/bin/env node
/**
 * La carga del 3D en producción, en primera y segunda visita (U6, René 2026-11-12), como cadena
 * reanudable: cada repetición corre `e2e/visor-unity-real.spec.ts` contra el sitio publicado con
 * `CROQUIS_SEGUNDA=1` (el mismo navegador abre el caso otra vez, ya con el build en su caché) y se
 * anota en `eval/results/u6_carga_estado.json` en cuanto termina. Al relanzarla sigue con lo que falta.
 *
 * La lanza `tools/unity/carga-cadena.ps1 -Lanzar` como tarea de Windows, fuera de la sesión.
 *
 *   node eval/u6_carga_cadena.mjs            # sigue con lo que falte
 *   node eval/u6_carga_cadena.mjs --estado   # cómo va
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const RAIZ = resolve(import.meta.dirname, "..");
const WEB = join(RAIZ, "apps/web");
const ESTADO = join(RAIZ, "eval/results/u6_carga_estado.json");
const SALIDA = join(RAIZ, "eval/results/u6_carga_segunda_visita.json");
const MEDIDO = join(RAIZ, "eval/results/u6_flujo_unity_produccion.json");
const SITIO = process.env.CROQUIS_URL ?? "https://croquis-sage.vercel.app";
const REPETICIONES = 3;
const PAUSA_S = 60;

const leer = () =>
  existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, "utf8")) : { repeticiones: [] };
const guardar = (e) => {
  e.actualizado = new Date().toISOString();
  writeFileSync(`${ESTADO}.tmp`, `${JSON.stringify(e, null, 2)}\n`);
  renameSync(`${ESTADO}.tmp`, ESTADO);
};
const mediana = (xs) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

function resumen(e) {
  const hechas = e.repeticiones.filter((r) => !r.error);
  return {
    repeticiones: `${hechas.length}/${REPETICIONES}`,
    primera_visita_s: mediana(hechas.map((r) => r.unity_listo_s)),
    segunda_visita_s: mediana(hechas.map((r) => r.segunda_visita_listo_s)),
  };
}

if (process.argv.includes("--estado")) {
  console.log(JSON.stringify(resumen(leer()), null, 2));
  process.exit(0);
}

// El candado con el PID: `carga-cadena.ps1 -Estado` lo lee para saber si sigue corriendo.
const CANDADO = join(RAIZ, "apps/visor-unity/Logs/carga-cadena.pid");
mkdirSync(join(RAIZ, "apps/visor-unity/Logs"), { recursive: true });
writeFileSync(CANDADO, String(process.pid));
process.once("exit", () => rmSync(CANDADO, { force: true }));

const e = leer();
e.sitio = SITIO;
for (let rep = 1; rep <= REPETICIONES; rep++) {
  if (e.repeticiones.some((r) => r.repeticion === rep && !r.error)) continue;
  console.log(`[${new Date().toISOString()}] Repetición ${rep}…`);
  const r = spawnSync(
    "pnpm",
    ["exec", "playwright", "test", "--config", "playwright.produccion.config.ts", "--headed"],
    {
      cwd: WEB,
      shell: true,
      stdio: "inherit",
      env: { ...process.env, CROQUIS_URL: SITIO, CROQUIS_SEGUNDA: "1" },
    },
  );
  e.repeticiones = e.repeticiones.filter((x) => x.repeticion !== rep);
  if (r.status === 0 && existsSync(MEDIDO)) {
    const m = JSON.parse(readFileSync(MEDIDO, "utf8"));
    e.repeticiones.push({ repeticion: rep, ...m });
  } else {
    e.repeticiones.push({ repeticion: rep, error: `playwright terminó con ${r.status}` });
  }
  guardar(e);
  if (rep < REPETICIONES) await new Promise((ok) => setTimeout(ok, PAUSA_S * 1000));
}
const doc = {
  fecha: new Date().toISOString(),
  sitio: SITIO,
  metodo:
    "e2e/visor-unity-real.spec.ts contra el sitio publicado, Chromium con ventana, la GPU de la laptop de " +
    "desarrollo y un perfil con caché en disco (como el navegador de la demo) nuevo en cada repetición: " +
    "primera visita (sin caché) y, en el mismo navegador, segunda " +
    "visita (otro caso, con el build en la caché). Tiempo desde el clic en el 3D, justo al terminar la " +
    `reconstrucción, hasta ver el caso. Mediana de ${REPETICIONES}.`,
  ...resumen(e),
  repeticiones: e.repeticiones,
};
writeFileSync(SALIDA, `${JSON.stringify(doc, null, 2)}\n`);
console.log(JSON.stringify(resumen(e)));
process.exit(e.repeticiones.every((r) => !r.error) ? 0 : 3);
