// Las tomas de fondo de la portada v3 (pedido de René, 2026-10-24): la propia reconstrucción de
// Croquis, de noche, en calidad alta, con los vehículos de R10. Nada de stock ni de marcas.
//
// - La cámara es la del daño (`camara=dano`): de cerca, con los vehículos en cuadro (la cinemática
//   los deja diminutos de noche).
// - Cada toma sale del exportador de video del visor (`captureSequence`: dibuja instantes exactos,
//   así que la toma es fluida aunque la laptop no llegue a tiempo real) en WebM 1280 × 720 a 30 fps,
//   con la leyenda ilustrativa.
// - ffmpeg la recorta a TOMA_S segundos alrededor del impacto y la pasa a H.264 (MP4) para
//   escritorio (1280 de ancho) y celular (640), cada una de menos de 3 MB, más un póster JPG.
// - La carambola y AXA son de día en sus escenas: aquí solo cambia la iluminación (la física es la
//   misma). nocturno_lluvia y poste ya son de noche.
//
// Una toma a la vez (la RAM de la laptop). Necesita el sitio corriendo y Playwright de apps/web:
//
//   node demo/portada/grabar-tomas.mjs [http://localhost:3000]
//
// Escribe apps/web/public/portada/toma-<n>.mp4, toma-<n>-movil.mp4, toma-<n>.jpg y tomas.json.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FFMPEG, FFPROBE } from "../video/comun.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");
const { chromium } = createRequire(join(RAIZ, "apps/web/package.json"))("@playwright/test");
const base = process.argv[2] ?? "http://localhost:3000";
const SALIDA = join(RAIZ, "demo/portada/salida");
const PUBLICO = join(RAIZ, "apps/web/public/portada");
const TOMA_S = 7.2;
const LIMITE = 3 * 1024 * 1024;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const deNoche = (spec) => {
  const s = structuredClone(spec);
  s.entorno.iluminacion = { valor: "noche_con_alumbrado", fuente: "supuesto", confianza: 0.5 };
  return s;
};
const leer = (ruta) => JSON.parse(readFileSync(join(RAIZ, ruta), "utf8"));

/** Las tomas, en el orden en que las recorre la portada. */
const TOMAS = [
  { escena: "nocturno_lluvia" },
  { escena: "carambola", propia: deNoche(leer("packages/scene-schema/fixtures/carambola.json")) },
  { escena: "poste" },
  { escena: "axa", propia: deNoche(leer("demo/escenas-r11/axa.json")) },
];

async function grabar(browser, toma, n) {
  const p = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
  });
  // Con render por software en calidad alta, el hilo principal tarda: las acciones esperan más.
  p.setDefaultTimeout(900_000);
  p.on("pageerror", (e) => log("ERROR", e.message.slice(0, 300)));
  if (toma.propia)
    await p.addInitScript(
      (s) => sessionStorage.setItem("croquis:escena-propia", s),
      JSON.stringify(toma.propia),
    );
  const escena = toma.propia ? "propia" : toma.escena;
  await p.goto(`${base}/visor?escena=${escena}&calidad=alta&renderer=webgl&camara=dano&t=0`);
  await p.waitForFunction(() => window.__croquisReady === true, null, { timeout: 600_000 });
  await p.waitForFunction(() => window.__croquisVehicleModelsReady === true, null, {
    timeout: 900_000,
  });
  await p.locator('[data-testid="export-video-formato"]').selectOption("webm");
  await p.locator('[data-testid="export-video-tamano"]').selectOption("1280x720");
  await p.locator('[data-testid="export-video-fps"]').selectOption("30");
  const [d] = await Promise.all([
    p.waitForEvent("download", { timeout: 3_600_000 }),
    p.locator('[data-testid="export-video"]').click({ force: true }),
  ]);
  const webm = join(SALIDA, `toma-${n}.webm`);
  await d.saveAs(webm);
  await p.close();
  log("grabada", n, toma.escena);
  return webm;
}

const ffprobe = (f) =>
  Number(
    execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f])
      .toString()
      .trim(),
  );

/** H.264 de menos de 3 MB: sube el CRF hasta que quepa. */
function codificar(webm, salida, ancho, inicio) {
  for (const crf of [26, 28, 30, 32, 34]) {
    execFileSync(FFMPEG, [
      "-y",
      "-v",
      "error",
      "-ss",
      String(inicio),
      "-t",
      String(TOMA_S),
      "-i",
      webm,
      "-vf",
      `scale=${ancho}:-2`,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      String(crf),
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      salida,
    ]);
    const bytes = statSync(salida).size;
    if (bytes < LIMITE) return { bytes, crf };
  }
  throw new Error(`${salida} no cabe en 3 MB`);
}

mkdirSync(SALIDA, { recursive: true });
mkdirSync(PUBLICO, { recursive: true });
const solo = process.argv[3] ? Number(process.argv[3]) : null;
const browser = await chromium.launch();
const manifiesto = [];
try {
  for (const [k, toma] of TOMAS.entries()) {
    const n = k + 1;
    if (solo !== null && solo !== n) continue;
    const webm = await grabar(browser, toma, n);
    const dur = ffprobe(webm);
    // Alrededor del impacto (t = 0), que la reconstrucción pone a 3 s de su inicio.
    const inicio = Math.max(0, Math.min(dur - TOMA_S, 3 - TOMA_S / 2 + 0.6));
    const escritorio = codificar(webm, join(PUBLICO, `toma-${n}.mp4`), 1280, inicio);
    const movil = codificar(webm, join(PUBLICO, `toma-${n}-movil.mp4`), 640, inicio);
    execFileSync(FFMPEG, [
      "-y",
      "-v",
      "error",
      "-ss",
      String(inicio + 2.2),
      "-i",
      webm,
      "-frames:v",
      "1",
      "-vf",
      "scale=1280:-2",
      "-q:v",
      "4",
      join(PUBLICO, `toma-${n}.jpg`),
    ]);
    manifiesto.push({
      toma: n,
      escena: toma.escena,
      iluminacion: toma.propia ? "noche_con_alumbrado (cambiada para la toma)" : "la de la escena",
      duracion_s: TOMA_S,
      escritorio,
      movil,
      poster_bytes: statSync(join(PUBLICO, `toma-${n}.jpg`)).size,
    });
    log("lista", n, escritorio, movil);
  }
} finally {
  await browser.close();
}
const ruta = join(PUBLICO, "tomas.json");
const previo = solo !== null && existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : [];
const todas = [...previo.filter((t) => !manifiesto.some((m) => m.toma === t.toma)), ...manifiesto];
writeFileSync(
  ruta,
  `${JSON.stringify(
    todas.sort((a, b) => a.toma - b.toma),
    null,
    2,
  )}\n`,
);
log("escrito", ruta);
