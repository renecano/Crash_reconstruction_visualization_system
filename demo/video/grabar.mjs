/**
 * Graba el video demo de `/cesvi` (docs/cesvi/video/guion.md) con Playwright en Chromium, 1920×1080,
 * contra el servidor local de producción (`next build` y `next start`, en http://localhost:3000).
 *
 * Una sola página graba todo: la entrada de la marca, el recorrido de ocho pasos, «Caso nuevo» y el
 * cierre. Cada segmento hace sus acciones mientras suena su voz, espera la duración medida de la voz
 * (salida/voz.json) más una pausa de lectura y anota cuándo empezó (salida/linea-de-tiempo.json),
 * para que el montaje ponga cada voz en su lugar. Guarda también el texto visible de cada segmento
 * (salida/textos.json) para la revisión. El cursor y la barra de subtítulos se inyectan
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
  if (!solo && enCurso) {
    const id = await loc.getAttribute("data-testid", { timeout: 2000 }).catch(() => null);
    vistas.get(enCurso).acciones.push(id ?? (await loc.textContent()).trim());
  }
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

/** El texto visible de cada segmento, para revisar el video (`revisar.mjs`). */
const textos = new Map();
/** Por segmento: los clics (su `data-testid`) y si la vista 3D estaba a la vista (`revisar.mjs`). */
const vistas = new Map();
let enCurso = null;
async function anotarTexto(id) {
  const t = await pagina.evaluate(() => document.body.innerText);
  textos.set(id, [...(textos.get(id) ?? []), t]);
  const v3d = await pagina.evaluate(() => {
    const tab = document.querySelector('[data-testid="vista-3d"]');
    const visores = document.querySelectorAll(
      '[data-testid="visor-caso"], [data-testid="visor-3d"]',
    );
    return (
      tab?.getAttribute("aria-selected") === "true" ||
      [...visores].some((v) => v.checkVisibility({ visibilityProperty: true }))
    );
  });
  vistas.get(id).vista3d.push(v3d);
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
  enCurso = id;
  vistas.set(id, { acciones: [], vista3d: [] });
  await subtitulo(v.texto);
  try {
    await acciones();
    await anotarTexto(id);
  } catch (e) {
    // Lo que había en pantalla cuando falló, para corregir el guion de acciones.
    await pagina.screenshot({ path: join(SALIDA, `fallo-${id}.png`) });
    throw e;
  }
  const transcurrido = (Date.now() - inicio) / 1000;
  await espera(v.duracion_s + PAUSA - transcurrido);
  await anotarTexto(id);
  await subtitulo(null);
  enCurso = null;
  console.log(`${id}: ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
}

// --- 1. Entrada ----------------------------------------------------------------------------------
await pagina.setContent(
  htmlMarca("entrada", "El perito narra el hecho. <span>Croquis lo reconstruye.</span>"),
);
await espera(4.4);
await segmento("intro");
await espera(10.5 - (Date.now() - t0) / 1000);

// --- 2. La lista y el caso de AXA, en el recorrido común (V2, ADR 0080) --------------------------
await pagina.goto(`${BASE}/cesvi`);
await pagina.getByTestId("lista-casos").waitFor();
await espera(0.6);
const sig = () => clic(pagina.getByTestId("siguiente"));
/** Acerca el mapa en «Mover mapa» (en «Colocar» el doble clic colocaría) y vuelve a «Colocar». */
async function acercar(veces) {
  const mapa = pagina.getByTestId("mapa-escena");
  await mapa.locator("canvas").waitFor();
  await clic(pagina.getByTestId("herramienta-mover"));
  const b = await mapa.boundingBox();
  for (let k = 0; k < veces; k++) {
    await pagina.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
    await pagina.waitForTimeout(450);
  }
  await clic(pagina.getByTestId("herramienta-colocar"));
}
/** Toca el mapa (desde el centro, en pixeles) y escribe el rumbo del elemento activo. */
async function tocar(dx, dy, rumbo) {
  const b = await pagina.getByTestId("mapa-escena").boundingBox();
  const x = b.x + b.width / 2 + dx;
  const y = b.y + b.height / 2 + dy;
  await pagina.mouse.move(x, y, { steps: 18 });
  await pagina.mouse.click(x, y);
  await espera(0.4);
  if (rumbo !== null) await pagina.getByTestId("rumbo-activo").fill(rumbo);
  await espera(0.4);
  await clic(pagina.getByTestId("listo-elemento"));
}

await segmento("lista", async () => {
  await senalar(pagina.getByTestId("ir-caso-nuevo"));
  await espera(0.8);
  await senalar(pagina.getByTestId("ir-importar"));
  await espera(0.8);
  await clic(pagina.getByTestId("ir-axa"));
  await pagina.getByTestId("recorrido-caso").waitFor();
});
await segmento("caso", async () => {
  await senalar(pagina.getByTestId("tarjeta-V1"));
  await espera(1.2);
  await senalar(pagina.getByTestId("tarjeta-V2"));
  await espera(1.2);
  await senalar(pagina.getByTestId("avance-caso"));
});
await segmento("hecho", async () => {
  await sig();
  await espera(1);
  await senalar(pagina.getByTestId("narracion-texto"));
  await espera(1.5);
  await senalar(pagina.getByTestId("vehiculos"));
});
await segmento("lugar", async () => {
  await sig();
  await espera(1.2);
  await acercar(2);
  // El punto de impacto, con el frente de la Tacoma hacia el norte (la vía va de sur a norte).
  await tocar(0, 0, "0");
});
await segmento("lugar-finales", async () => {
  await tocar(18, -70, "350");
  await tocar(-6, -30, "5");
  await senalar(pagina.getByTestId("siguiente"));
});
await segmento("expandir", async () => {
  await clic(pagina.getByTestId("expandir-mapa"));
  await espera(2);
  await pagina.keyboard.press("Escape");
});
await segmento("reconstruccion", async () => {
  await sig();
  await clic(pagina.getByTestId("reconstruir"));
  await pagina.getByTestId("velocidades").waitFor({ timeout: 60_000 });
  // Sin el 3D (René, 2026-10-23): la reconstrucción se ve en el mapa, con su animación.
  await espera(0.8);
  await senalar(pagina.getByTestId("escenario"));
});
await segmento("declaracion", async () => {
  await clic(pagina.getByTestId("abrir-declaracion"));
  await espera(1.2);
  await senalar(pagina.getByTestId("texto-declaracion"));
});
await segmento("danos", async () => {
  await sig();
  await espera(1);
  await senalar(pagina.getByTestId("criterios-axa"));
});
await segmento("numeros", async () => {
  await sig();
  await espera(1);
  await senalar(pagina.getByTestId("verificacion-cesvi"));
});
await segmento("contra", async () => {
  await sig();
  await espera(1);
  await senalar(pagina.getByTestId("eje-modalidad"));
  await espera(1.2);
  const tabla = pagina.getByTestId("reproduccion");
  for (const f of ["ebs_kmh_reporte", "v3_kmh", "energia"]) {
    await senalar(tabla.locator(`[data-fila="${f}"]`));
    await espera(1);
  }
});
await segmento("dictamen", async () => {
  await sig();
  await espera(1);
  await senalar(pagina.getByTestId("dictamen-caso"));
});
await segmento("tema", async () => {
  await clic(pagina.getByTestId("tema"));
  await espera(1.4);
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
  const dialogo = pagina.getByTestId("dialogo-buscar-lugar");
  await dialogo.waitFor({ timeout: 20_000 });
  await clic(dialogo.getByRole("button", { name: /moviendo el mapa/ }));
  await acercar(8);
  // La narración: el frente de A (por Azucena, hacia el noroeste) pega en el costado trasero
  // derecho de B (por Reforma, hacia el norte); B sale al noroeste girando y A avanza poco.
  await tocar(0, 0, "315");
  await tocar(-36, -78, "320");
  await tocar(-18, -18, "300");
});
await segmento("caso-nuevo-reconstruccion", async () => {
  await clic(pagina.getByTestId("siguiente"));
  await clic(pagina.getByTestId("reconstruir"));
  await pagina.getByTestId("velocidades").waitFor({ timeout: 60_000 });
  await senalar(pagina.getByTestId("velocidades"));
  await espera(1.5);
  await senalar(pagina.getByTestId("evidencia-usada"));
});
await segmento("en-desarrollo", async () => {
  await senalar(pagina.getByTestId("escenario"));
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
    "Todo caso en el mismo recorrido: <span>nuevo, importado o de ejemplo, con su reconstrucción y su dictamen.</span>",
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
writeFileSync(
  join(SALIDA, "vistas.json"),
  `${JSON.stringify(Object.fromEntries(vistas), null, 2)}
`,
);
writeFileSync(
  join(SALIDA, "textos.json"),
  `${JSON.stringify(Object.fromEntries(textos), null, 2)}
`,
);
console.log(`Grabado: ${total.toFixed(1)} s → ${join(SALIDA, "recorrido.webm")}`);
