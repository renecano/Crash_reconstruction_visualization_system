/**
 * Graba el video demo de `/cesvi` (docs/cesvi/video/guion.md) con Playwright en Chromium, 1920×1080,
 * contra el servidor local de producción (`next build` y `next start`, en http://localhost:3000).
 *
 * Una sola página graba todo: la entrada de la marca, el recorrido de ocho pasos, «Caso nuevo» y el
 * cierre. Cada segmento hace sus acciones mientras suena su voz, espera la duración medida de la voz
 * (salida/voz.json) más una pausa de lectura y anota cuándo empezó (salida/linea-de-tiempo.json),
 * para que el montaje ponga cada voz en su lugar. El cursor y la barra de subtítulos se inyectan
 * solo durante la grabación.
 *
 * Las lecturas de Claude son las grabadas (las mismas de las pruebas): el video no gasta API y sale
 * igual cada vez.
 *
 * Uso: node demo/video/grabar.mjs   (con el servidor de producción corriendo)
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { htmlMarca } from "./marca.mjs";
import { RAIZ, SALIDA } from "./comun.mjs";

const require = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const BASE = process.env.CROQUIS_URL ?? "http://localhost:3000";
/** Pausa de lectura después de cada segmento (s). */
const PAUSA = 1.3;
/** Ensayo: sin esperar la voz, para revisar que todas las acciones corren (no sirve para el video). */
const RAPIDO = process.env.CROQUIS_VIDEO_RAPIDO === "1";
const voz = new Map(
  JSON.parse(readFileSync(join(SALIDA, "voz.json"), "utf8")).map((v) => [v.id, v]),
);
const leer = (p) => JSON.parse(readFileSync(join(RAIZ, p), "utf8"));
const HECHO = leer("data/cesvi/grabaciones/hecho-A2010930.json");
// «Caso nuevo»: un crucero (otra modalidad que el alcance del recorrido).
const ESCENA = leer("data/cesvi/grabaciones/escenas/cesvi-e814f085db.json");

const dirVideo = join(SALIDA, "video");
rmSync(dirVideo, { recursive: true, force: true });
mkdirSync(dirVideo, { recursive: true });

// Chromium completo en el headless nuevo: el del shell no trae visor de PDF (la vista previa del
// paso 8 saldría en blanco).
const navegador = await chromium.launch({ channel: "chromium" });
const contexto = await navegador.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: dirVideo, size: { width: 1920, height: 1080 } },
  acceptDownloads: true,
  locale: "es-MX",
  serviceWorkers: "block",
});
// El cursor y la barra de subtítulos (solo para la grabación).
const SIMBOLO = readFileSync(join(RAIZ, "assets/brand/simbolo.svg"), "utf8");
await contexto.addInitScript(
  ({ simbolo, BARRA }) => {
    const montar = () => {
      if (document.getElementById("video-cursor")) return;
      const c = document.createElement("div");
      c.id = "video-cursor";
      c.style.cssText =
        "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;" +
        "background:rgba(255,255,255,.92);border:2px solid #0B0C0F;box-shadow:0 0 0 3px rgba(255,91,46,.55);" +
        "z-index:2147483647;pointer-events:none;transition:transform .12s ease;transform:translate(-100px,-100px)";
      document.body.appendChild(c);
      addEventListener(
        "mousemove",
        (e) => {
          c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
        },
        true,
      );
      addEventListener(
        "mousedown",
        () => (c.style.boxShadow = "0 0 0 9px rgba(255,91,46,.45)"),
        true,
      );
      addEventListener(
        "mouseup",
        () => (c.style.boxShadow = "0 0 0 3px rgba(255,91,46,.55)"),
        true,
      );
      // La barra tiene su propio espacio: el recorrido (fijo a pantalla completa) y las páginas
      // normales terminan arriba de ella, para que no tape la línea de tiempo ni los controles.
      const estilo = document.createElement("style");
      estilo.textContent =
        `[data-testid="recorrido"]{bottom:${BARRA}px!important}` +
        `body{padding-bottom:${BARRA}px!important}`;
      document.head.appendChild(estilo);
      const b = document.createElement("div");
      b.id = "video-subtitulos";
      b.style.cssText =
        `position:fixed;left:0;right:0;bottom:0;height:${BARRA}px;box-sizing:border-box;z-index:2147483646;display:flex;align-items:center;gap:22px;pointer-events:none;` +
        "padding:0 48px;background:rgba(11,12,15,.9);border-top:1px solid #2A2E35;" +
        "font-family:Geist,system-ui,sans-serif;color:#F2F3F5;font-size:29px;line-height:1.3;font-weight:500";
      b.innerHTML = `<span style="flex:none;width:44px;height:44px;display:block">${simbolo}</span><span id="video-texto"></span>`;
      b.querySelector("svg").setAttribute("width", "44");
      b.querySelector("svg").setAttribute("height", "44");
      document.body.appendChild(b);
    };
    if (document.readyState === "loading") addEventListener("DOMContentLoaded", montar);
    else montar();
  },
  { simbolo: SIMBOLO, BARRA: 124 },
);

const pagina = await contexto.newPage();
// El video empieza con la página: desde aquí se miden los segmentos.
const t0 = Date.now();
// Lecturas grabadas de Claude (sin API).
await pagina.route("**/api/cesvi/hecho", (r) => {
  const { tipo } = r.request().postDataJSON();
  return r.fulfill({ contentType: "application/json", body: JSON.stringify(HECHO.lecturas[tipo]) });
});
await pagina.route("**/api/cesvi/escena", (r) =>
  r.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ metodo: "claude", salida: ESCENA.salida }),
  }),
);

const espera = (s) => pagina.waitForTimeout(Math.max(0, (RAPIDO ? Math.min(s, 0.3) : s) * 1000));
const linea = [];
let posCursor = { x: 960, y: 540 };

async function subtitulo(texto) {
  await pagina.evaluate((t) => {
    const b = document.getElementById("video-subtitulos");
    if (!b) return;
    // En la app la barra se queda (vacía entre segmentos); en la marca solo aparece con su voz.
    b.style.display = t || !document.querySelector("svg.logo") ? "flex" : "none";
    document.getElementById("video-texto").textContent = t ?? "";
  }, texto);
}

/** Lleva el cursor al elemento (despacio, para que se vea) y hace clic. */
async function clic(loc, { solo = false } = {}) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (!b) throw new Error("Elemento sin caja");
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await pagina.mouse.move(x, y, { steps: 28 });
  posCursor = { x, y };
  await espera(0.25);
  if (!solo) await pagina.mouse.click(x, y);
}
const senalar = (loc) => clic(loc, { solo: true });
/** Deja «Comparar con la declaración» como se pide, con un clic visible si hay que cambiarlo. */
async function comparar(v) {
  const c = pagina.getByTestId("comparar-declaracion");
  if ((await c.isChecked()) !== v) await clic(c);
  if ((await c.isChecked()) !== v) await c.setChecked(v);
}

/**
 * Un segmento del guion: muestra su subtítulo, hace sus acciones mientras suena su voz y espera la
 * duración de la voz más la pausa de lectura.
 */
async function segmento(id, acciones = async () => {}) {
  const v = voz.get(id);
  if (!v) throw new Error(`Sin voz para «${id}»`);
  const inicio = Date.now();
  linea.push({ id, inicio_s: (inicio - t0) / 1000, duracion_s: v.duracion_s, texto: v.texto });
  await subtitulo(v.texto);
  try {
    await acciones();
  } catch (e) {
    // Lo que había en pantalla cuando falló, para corregir el guion de acciones.
    await pagina.screenshot({ path: join(SALIDA, `fallo-${id}.png`) });
    throw e;
  }
  const transcurrido = (Date.now() - inicio) / 1000;
  await espera(v.duracion_s + PAUSA - transcurrido);
  await subtitulo(null);
  console.log(`${id}: ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
}

// --- 1. Entrada ----------------------------------------------------------------------------------
await pagina.setContent(
  htmlMarca("entrada", "El perito narra el hecho. <span>Croquis lo reconstruye.</span>"),
);
await espera(4.4);
await segmento("intro");
await espera(10.5 - (Date.now() - t0) / 1000);

// --- 2. El recorrido de /cesvi -------------------------------------------------------------------
// Todo caso se abre desde la lista de /cesvi en el mismo recorrido (ADR 0079).
await pagina.goto(`${BASE}/cesvi`);
await pagina.getByTestId("ir-axa").click();
await pagina.getByTestId("frase").waitFor();
await espera(0.8);
const sig = () => clic(pagina.getByTestId("siguiente"));

await segmento("caso", async () => {
  await senalar(pagina.getByTestId("caso-A"));
  await espera(1.5);
  await senalar(pagina.getByTestId("caso-B"));
});
await segmento("hecho-ejemplo", async () => {
  await pagina.keyboard.press("ArrowRight");
  await pagina.getByTestId("paso-2").waitFor();
  await espera(1);
  await clic(pagina.getByTestId("ejemplo-descripcion"));
  await espera(1.2);
  await clic(pagina.getByTestId("leer-descripcion"));
  await pagina.getByTestId("frase-vertice_a").waitFor();
});
await segmento("hecho-datos", async () => {
  await senalar(pagina.getByTestId("datos-evidencia"));
  await espera(1.5);
  await senalar(pagina.getByTestId("texto-descripcion").locator('mark[data-dato="vertice_a"]'));
});
await segmento("hecho-pregunta", async () => {
  await clic(pagina.getByTestId("pregunta-carril_a").getByRole("button", { name: "Derecho" }));
  await espera(1.2);
  await clic(pagina.getByTestId("respuesta-reversa"));
  await pagina.getByTestId("respuesta-reversa").pressSequentially("4", { delay: 80 });
  await pagina.getByTestId("completitud").filter({ hasText: "9/9" }).waitFor();
});
await segmento("lugar", async () => {
  await sig();
  await pagina.getByTestId("ubicacion-ilustrativa").waitFor();
  await espera(1.2);
  await clic(pagina.getByTestId("usar-ilustrativa"));
});
await segmento("lugar-mover", async () => {
  await clic(pagina.getByTestId("cambiar-ubicacion"));
  await pagina.getByTestId("coordenadas-nuevas").fill("26.22848, -109.05424");
  await clic(pagina.getByRole("button", { name: "Mover el punto" }));
  await espera(1.2);
  await clic(pagina.getByTestId("deshacer"));
  const listo = pagina.getByRole("button", { name: "Listo" });
  if (await listo.isVisible()) await clic(listo);
});
await segmento("reconstruccion", async () => {
  await sig();
  await espera(1);
  await clic(pagina.getByTestId("reproducir"));
});
await segmento("declaracion", async () => {
  await comparar(true);
  await espera(1.2);
  await clic(pagina.getByTestId("version-declarada"));
  await espera(3);
  await clic(pagina.getByTestId("version-evidencia"));
  await espera(1);
  await comparar(false);
});
await segmento("trabajar", async () => {
  await clic(pagina.getByTestId("modo-trabajar"));
  await espera(1);
  await comparar(true);
  await clic(pagina.getByTestId("herramienta-A"));
  const y = pagina.getByTestId("objeto-y");
  await clic(y);
  const actual = Number((await y.inputValue()).replace(",", "."));
  await y.fill((actual + 2).toFixed(2));
  await y.press("Enter");
  await espera(1);
  await senalar(pagina.getByTestId("que-cambia"));
  await espera(2.5);
  await clic(pagina.getByTestId("modo-presentar"));
});
await segmento("danos", async () => {
  await sig();
});
await segmento("numeros", async () => {
  await sig();
  await espera(5);
  await clic(pagina.getByTestId("ver-detalle"));
  await espera(7);
  await pagina.keyboard.press("Escape");
});
await segmento("contra", async () => {
  await sig();
  await espera(1.5);
  for (const f of ["modalidad", "deformacion", "restos", "dinamica"]) {
    await senalar(pagina.getByTestId("contra-dictamen").locator(`[data-fila="${f}"]`));
    await espera(1.6);
  }
  await senalar(pagina.getByTestId("discrepancia-energia"));
});
await segmento("dictamen", async () => {
  await clic(pagina.getByTestId("perito"));
  await pagina.getByTestId("perito").pressSequentially("Perito de CESVI", { delay: 60 });
  await clic(pagina.getByTestId("aceptar"));
  await pagina.getByTestId("vista-previa").waitFor({ timeout: 30_000 });
  await espera(1.5);
  const descarga = pagina.waitForEvent("download");
  await clic(pagina.getByTestId("descargar-pdf"));
  await descarga;
});
await segmento("tema", async () => {
  await clic(pagina.getByTestId("tema"));
  await espera(1.2);
  await clic(pagina.getByTestId("tema"));
});

// --- 3. Caso nuevo -------------------------------------------------------------------------------
await pagina.goto(`${BASE}/cesvi`);
await pagina.getByTestId("ir-caso-nuevo").click();
await pagina.getByTestId("recorrido-caso").waitFor();
await pagina.getByTestId("siguiente").click();
await pagina.getByTestId("narracion").waitFor();
await segmento("caso-nuevo", async () => {
  await clic(pagina.getByTestId("narracion"));
  await pagina.getByTestId("narracion").fill(ESCENA.narracion);
  await espera(1);
  await clic(pagina.getByTestId("leer-narracion"));
  await pagina.getByTestId("escena").waitFor();
  await espera(1.5);
  await senalar(pagina.getByTestId("vehiculos"));
});
await segmento("caso-nuevo-mapa", async () => {
  await clic(pagina.getByTestId("siguiente"));
  const mapa = pagina.getByTestId("mapa-escena");
  await mapa.locator("canvas").waitFor();
  const b = await mapa.boundingBox();
  // De zoom 11 a 19 (unos 0.14 m por pixel): las posiciones quedan a metros y no se enciman.
  await pagina.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  for (let k = 0; k < 8; k++) {
    await pagina.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
    await pagina.waitForTimeout(450);
  }
  const colocar = async (herramienta, rumbo, dx, dy) => {
    await pagina.getByTestId("herramienta-escena").selectOption(herramienta);
    await pagina.getByTestId("rumbo-escena").fill(rumbo);
    // La caja se vuelve a medir: al colocar, las preguntas de arriba se van y el mapa sube.
    const c = await mapa.boundingBox();
    const x = c.x + c.width / 2 + dx;
    const y = c.y + c.height / 2 + dy;
    await pagina.mouse.move(x, y, { steps: 18 });
    await pagina.mouse.click(x, y);
  };
  // La narración: el frente de A (por Azucena, hacia el noroeste) pega en el costado trasero
  // derecho de B (por Reforma, hacia el norte). A unos 0.14 m por pixel: B sale unos 12 m al
  // noroeste girando y A avanza unos 3.5 m.
  await colocar("V2:impacto", "0", 0, 0);
  await colocar("V1:impacto", "315", 18, 22);
  await colocar("V2:final", "320", -36, -78);
  await colocar("V1:final", "300", -18, -18);
  await pagina.getByTestId("colocados").filter({ hasText: "4 posiciones" }).waitFor();
});
await segmento("caso-nuevo-reconstruccion", async () => {
  await clic(pagina.getByTestId("siguiente"));
  await clic(pagina.getByTestId("reconstruir"));
  await pagina.getByTestId("velocidades").waitFor({ timeout: 60_000 });
  await senalar(pagina.getByTestId("velocidades"));
  await espera(1.5);
  await senalar(pagina.getByTestId("evidencia-usada"));
});
if (RAPIDO) {
  // En el ensayo se guarda el caso colocado, para revisar la reconstrucción fuera de la página.
  for (let k = 0; k < 3; k++) await pagina.getByTestId("siguiente").click();
  const d = pagina.waitForEvent("download");
  await pagina.getByTestId("guardar-caso").click();
  await (await d).saveAs(join(SALIDA, "escena-ensayo.json"));
}

// --- 4. Cierre -----------------------------------------------------------------------------------
await pagina.setContent(
  htmlMarca(
    "cierre",
    "Todo caso en el mismo recorrido: <span>nuevo, importado o de ejemplo, con su 3D y su dictamen.</span>",
  ),
);
await espera(0.8);
await segmento("cierre");
await espera(0.6);

const total = (Date.now() - t0) / 1000;
const ruta = await pagina.video().path();
await contexto.close();
await navegador.close();
renameSync(ruta, join(SALIDA, "recorrido.webm"));
writeFileSync(
  join(SALIDA, "linea-de-tiempo.json"),
  `${JSON.stringify({ duracion_s: total, segmentos: linea }, null, 2)}\n`,
);
console.log(`Grabado: ${total.toFixed(1)} s → ${join(SALIDA, "recorrido.webm")}`);
