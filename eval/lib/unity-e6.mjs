/**
 * Lo que comparten las mediciones del visor Unity en la web (U5, ADR 0115): servir el build, medir
 * una escena en un navegador nuevo y las condiciones del equipo, con el protocolo de E6 (ADR 0026).
 * Lo usa la cadena reanudable `eval/u5_cadena.mjs`.
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import { extname, join } from "node:path";
import { MEASURE_ARGS, percentile, round } from "./viewer-measure.mjs";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
};

function archivos(dir, base = dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory()
      ? archivos(p, base)
      : [p.slice(base.length + 1).replaceAll("\\", "/")];
  });
}

/**
 * Sirve el build WebGL desde la memoria (y `/modelos/` desde `apps/web/public`, de donde el build
 * toma los cuerpos de las personas). Devuelve la URL y cómo cerrarlo.
 */
export async function servirBuild(build, raiz) {
  const contenido = new Map(archivos(build).map((f) => [f, readFileSync(join(build, f))]));
  const modelos = join(raiz, "apps/web/public");
  const servidor = createServer((req, res) => {
    const f = decodeURIComponent(new URL(req.url, "http://x").pathname.slice(1)) || "index.html";
    let cuerpo = contenido.get(f);
    if (!cuerpo && f.startsWith("modelos/") && existsSync(join(modelos, f))) {
      cuerpo = readFileSync(join(modelos, f));
    }
    if (!cuerpo) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "content-type": TIPOS[extname(f)] ?? "application/octet-stream",
      "content-length": cuerpo.length,
      "cache-control": "no-store",
    });
    res.end(cuerpo);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  return {
    url: `http://127.0.0.1:${servidor.address().port}/`,
    cerrar: () => new Promise((ok) => servidor.close(ok)),
  };
}

/** Condiciones del equipo (Windows: energía, batería, plan, memoria y carga del CPU), como E6. */
export function condiciones() {
  const out = {
    momento: new Date().toISOString(),
    memoria_libre_mb: Math.round(os.freemem() / 1048576),
    memoria_total_mb: Math.round(os.totalmem() / 1048576),
  };
  if (process.platform !== "win32") return out;
  try {
    const ps = [
      "$b = Get-CimInstance Win32_Battery",
      "$c = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average",
      "$p = (powercfg /getactivescheme) -replace '^.*\\((.*)\\).*$', '$1'",
      "[pscustomobject]@{ bateria = $b.EstimatedChargeRemaining; estado_bateria = $b.BatteryStatus; carga_cpu = $c; plan = $p } | ConvertTo-Json -Compress",
    ].join("; ");
    const j = JSON.parse(
      execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }),
    );
    out.conectada = j.estado_bateria === null ? null : j.estado_bateria !== 1;
    out.bateria_pct = j.bateria;
    out.carga_cpu_pct = j.carga_cpu;
    out.plan_energia = j.plan;
  } catch (err) {
    out.error = String(err).slice(0, 200);
  }
  return out;
}

/**
 * Una medición: un navegador nuevo, con la GPU real y sin tope de vsync; carga el caso con el nivel
 * fijo (sin automático), cámara cinematográfica y reproducción en bucle; 3 s de calentamiento y
 * `segundos` de tiempos de cuadro del navegador. `depurar` son interruptores que se dejan puestos
 * después de cargar (la escala de dibujo, por ejemplo); `antes`, antes de cargar.
 *
 * Con la escala automática de media (sin una escala fija en `depurar`), antes de contar cuadros se
 * espera a que el visor avise que ya encontró su escala y a que la reproducción dé al menos una
 * vuelta (`esperaEscalaS`); la escala con que empezó y terminó la medición queda en el resultado.
 *
 * Para diagnosticar: `sincronizada` (con la sincronía vertical de la pantalla), `sinReproducir` (el
 * caso en pausa), `conTiempos` (devuelve cada tiempo entre cuadros) y `conTirones` (lo que el visor
 * midió por dentro, `Tirones.cs`: cuánto duró cada cuadro y en qué tramo se fue).
 */
export async function medirEscena({
  chromium,
  url,
  paquete,
  nivel,
  depurar = null,
  antes = null,
  ancho = 1920,
  alto = 1080,
  segundos = 12,
  esperaEscalaS = 8,
  sincronizada = false,
  conTiempos = false,
  conTirones = false,
  sinReproducir = false,
}) {
  // `sincronizada`: con la sincronía vertical de la pantalla, como lo ve el perito (no mide
  // capacidad: los fps tienen el tope de la pantalla).
  const banderas = sincronizada
    ? MEASURE_ARGS.filter((a) => a !== "--disable-gpu-vsync" && a !== "--disable-frame-rate-limit")
    : MEASURE_ARGS;
  const navegador = await chromium.launch({
    headless: false,
    args: [...banderas, "--use-angle=d3d11", `--window-size=${ancho},${alto + 140}`],
  });
  try {
    const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    pagina.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
    const espera = async (tipo, ms) => {
      const fin = Date.now() + ms;
      while (Date.now() < fin) {
        const m = await pagina.evaluate(
          (t) => window.croquisVisorRecibidos.find((x) => x.tipo === t || x.tipo === "error"),
          tipo,
        );
        if (m?.tipo === "error") throw new Error(`Unity: ${m.codigo}: ${m.mensaje}`);
        if (m) return m;
        await pagina.waitForTimeout(100);
      }
      throw new Error(`Sin «${tipo}» en ${ms / 1000} s`);
    };
    const enviar = (metodo, datos) =>
      pagina.evaluate(
        ([m, d]) => window.unityInstance.SendMessage("VisorPuente", m, d),
        [metodo, JSON.stringify(datos)],
      );
    let pedidos = 0;
    /** Los contadores del visor (`depurar` `estadisticas`): entre ellos, la escala de dibujo. */
    const estadisticas = (datos = { estadisticas: true }) => preguntar(datos);
    const preguntar = async (datos) => {
      const pedido = ++pedidos;
      await enviar("depurar", { ...datos, pedido });
      const fin = Date.now() + 20_000;
      while (Date.now() < fin) {
        const m = await pagina.evaluate(
          (n) => window.croquisVisorRecibidos.find((x) => x.tipo === "perfil" && x.pedido === n),
          pedido,
        );
        if (m) return m;
        await pagina.waitForTimeout(100);
      }
      throw new Error("El visor no contestó la consulta");
    };

    await pagina.goto(url);
    await espera("listo", 300_000);
    const gpu = await pagina.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    });
    // El nivel antes del caso: lo del escenario (matas, luminarias, faros) se arma con él.
    await enviar("calidad", { nivel });
    if (antes) await enviar("depurar", antes);
    const t0 = Date.now();
    await enviar("cargarCaso", { json: paquete });
    await espera("cargado", 300_000);
    const cargaS = (Date.now() - t0) / 1000;
    if (depurar) await enviar("depurar", depurar);
    await enviar("camara", { modo: "cinematica" });
    await enviar("depurar", { bucle: true });
    if (!sinReproducir) await enviar("reproducir", {});
    let antesDeMedir = await estadisticas();
    let esperaS = 0;
    if (antesDeMedir.escala_automatica) {
      // La escala automática: se espera a que esté asentada y lleve `esperaEscalaS` sin cambiar (la
      // reproducción da al menos una vuelta, con su impacto), con un tope de un minuto.
      const t1 = Date.now();
      for (;;) {
        const previa = antesDeMedir;
        await pagina.waitForTimeout(esperaEscalaS * 1000);
        antesDeMedir = await estadisticas();
        const quieta =
          antesDeMedir.escala_estable && antesDeMedir.escala_cambios === previa.escala_cambios;
        if (quieta || Date.now() - t1 > 60_000) break;
      }
      esperaS = (Date.now() - t1) / 1000;
    }
    await pagina.waitForTimeout(3000);
    // El diagnóstico de tirones (`Tirones.cs`): se enciende aquí y se consulta al terminar.
    if (conTirones) await preguntar({ tirones: true });
    const cuadros = await pagina.evaluate(
      (ms) =>
        new Promise((ok) => {
          const tiempos = [];
          let previo = performance.now();
          const fin = previo + ms;
          const paso = (ahora) => {
            tiempos.push(ahora - previo);
            previo = ahora;
            if (ahora < fin) requestAnimationFrame(paso);
            else ok(tiempos);
          };
          requestAnimationFrame(paso);
        }),
      segundos * 1000,
    );
    const tirones = conTirones ? await preguntar({ tirones: true }) : null;
    const despuesDeMedir = await estadisticas();
    const orden = [...cuadros].sort((a, b) => a - b);
    const total = cuadros.reduce((s, x) => s + x, 0);
    return {
      gpu,
      carga_s: round(cargaS, 1),
      escala_automatica: antesDeMedir.escala_automatica === true,
      escala_inicio: round(antesDeMedir.escala, 3),
      escala_fin: round(despuesDeMedir.escala, 3),
      escala_estable_al_medir: antesDeMedir.escala_estable !== false,
      escala_cambios_al_medir:
        (despuesDeMedir.escala_cambios ?? 0) - (antesDeMedir.escala_cambios ?? 0),
      escala_en_el_piso_sin_llegar: despuesDeMedir.escala_en_el_piso_sin_llegar === true,
      espera_escala_s: round(esperaS, 1),
      cuadros: cuadros.length,
      fps_promedio: round((cuadros.length * 1000) / total, 1),
      fps_mediana: round(1000 / percentile(orden, 50), 1),
      fps_1pct_bajo: round(1000 / percentile(orden, 99), 1),
      ms_p95: round(percentile(orden, 95), 1),
      cuadros_mas_50ms: cuadros.filter((x) => x > 50).length,
      ...(conTiempos ? { tiempos: cuadros } : {}),
      ...(tirones ? { tirones } : {}),
      errores,
    };
  } finally {
    await navegador.close();
  }
}

export const mediana = (xs) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** El resumen por escena de un nivel: la mediana de las repeticiones y si cumple la meta. */
export function resumenPorEscena(corridas, casos, meta) {
  const out = {};
  for (const caso of casos) {
    const rs = corridas.filter((c) => c.caso === caso && !c.error);
    const promedios = rs.map((c) => c.fps_promedio);
    out[caso] = {
      fps_promedio_mediana: mediana(promedios),
      escala_mediana: mediana(rs.map((c) => c.escala_fin)),
      fps_mediana_mediana: mediana(rs.map((c) => c.fps_mediana)),
      fps_1pct_bajo_mediana: mediana(rs.map((c) => c.fps_1pct_bajo)),
      carga_s_mediana: mediana(rs.map((c) => c.carga_s)),
      repeticiones: rs.length,
      cumple: meta === undefined ? null : (mediana(promedios) ?? 0) >= meta,
    };
  }
  return out;
}
