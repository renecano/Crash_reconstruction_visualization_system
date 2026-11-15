import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { contestarC1, irAPaso, mapaFacil } from "./ayuda-recorrido";

/**
 * El recorrido de la auditoría del 2026-11-15 (no lleva @flujo y no corre en CI): el sitio publicado
 * como lo usaría un perito, de la portada al dictamen, con el caso de AXA y con un caso nuevo. No
 * comprueba nada: anota lo que ve (texto, cifras, tiempos, errores de consola, peticiones fallidas,
 * descargas) en `docs/auditoria/2026-11-15/recorrido/`, para citarlo como evidencia.
 *
 * El caso nuevo usa la narración de ejemplo de la app y llama una vez a `/api/cesvi/escena`.
 */
const SALIDA = resolve(__dirname, "../../../docs/auditoria/2026-11-15/recorrido");
mkdirSync(SALIDA, { recursive: true });

interface Paso {
  paso: string;
  ms: number;
  url: string;
  captura: string;
  texto: string;
  cifras: string[];
  notas: Record<string, unknown>;
}

function bitacora(page: Page, nombre: string) {
  const pasos: Paso[] = [];
  const consola: { tipo: string; texto: string }[] = [];
  const fallidas: { url: string; estado: number | string }[] = [];
  let reloj = Date.now();
  page.on("pageerror", (e) => consola.push({ tipo: "pageerror", texto: e.message.slice(0, 400) }));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      consola.push({ tipo: m.type(), texto: m.text().slice(0, 400) });
  });
  page.on("response", (r) => {
    if (r.status() >= 400) fallidas.push({ url: r.url().slice(0, 200), estado: r.status() });
  });
  page.on("requestfailed", (r) =>
    fallidas.push({ url: r.url().slice(0, 200), estado: r.failure()?.errorText ?? "falló" }),
  );
  return {
    async anota(paso: string, selector = "body", notas: Record<string, unknown> = {}) {
      const captura = `${nombre}-${String(pasos.length + 1).padStart(2, "0")}-${paso}.jpg`;
      await page.screenshot({ path: join(SALIDA, captura), type: "jpeg", quality: 55 });
      const texto = (
        (await page
          .locator(selector)
          .first()
          .innerText()
          .catch(() => "")) ?? ""
      )
        .replace(/\n{2,}/g, "\n")
        .slice(0, 6000);
      const cifras = [
        ...new Set(texto.match(/-?\d+(?:[.,]\d+)?\s?(?:km\/h|%|m\b|s\b|kg|fps)/g) ?? []),
      ].slice(0, 60);
      pasos.push({ paso, ms: Date.now() - reloj, url: page.url(), captura, texto, cifras, notas });
      reloj = Date.now();
    },
    guarda() {
      writeFileSync(
        join(SALIDA, `${nombre}.json`),
        `${JSON.stringify({ nombre, fecha: new Date().toISOString(), pasos, consola, fallidas }, null, 2)}\n`,
      );
    },
  };
}

async function quieta(page: Page, extra = 2500) {
  await page.waitForTimeout(extra);
  await expect(page.getByTestId("maqueta-calculando")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId("presentar-calculando")).toHaveCount(0, { timeout: 120_000 });
}

/** Los `data-testid` visibles: para saber qué controles tiene cada pantalla. */
const controles = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-testid]")]
      .filter((e) => e.offsetParent !== null)
      .map((e) => e.dataset.testid!)
      .filter((v, i, a) => a.indexOf(v) === i),
  );

function preparar(page: Page) {
  return page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });
}

test("portada y páginas públicas", async ({ page, request }) => {
  const b = bitacora(page, "publico");
  try {
    const t0 = Date.now();
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(7000);
    const enlaces = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => ({
        texto: (a.textContent ?? "").trim().slice(0, 60),
        href: a.getAttribute("href")!,
      })),
    );
    await b.anota("portada", "body", { carga_ms: Date.now() - t0, enlaces });
    // Cada hoja de la portada.
    for (const hoja of ["problema", "prueba", "como", "preguntas"]) {
      const a = page.locator(`header nav a[data-go="${hoja}"]`);
      if (!(await a.count())) continue;
      await a.click();
      await page.waitForTimeout(3500);
      await b.anota(`portada-${hoja}`, `#${hoja}`);
    }
    // Las páginas que existen además de /cesvi: ¿responden y dicen lo mismo que la portada?
    const rutas = [
      "/cesvi",
      "/cesvi/reproduccion",
      "/historia",
      "/recorrido",
      "/demo",
      "/relato",
      "/visor",
      "/croquis",
      "/publico",
      "/cuenta",
      "/en",
      "/en/cesvi",
      "/robots.txt",
      "/sitemap.xml",
      "/api/version",
    ];
    const estados: Record<string, number> = {};
    for (const r of rutas) estados[r] = (await request.get(r, { maxRedirects: 5 })).status();
    for (const r of ["/recorrido", "/historia", "/cesvi/reproduccion"]) {
      await page.goto(r, { waitUntil: "load" });
      await page.waitForTimeout(3000);
      await b.anota(`pagina${r.replace(/\//g, "-")}`, "main", { estados });
    }
    // En un teléfono: ¿se desborda?
    await page.setViewportSize({ width: 390, height: 844 });
    for (const r of ["/", "/cesvi", "/cesvi/casos/a2010930"]) {
      await page.goto(r, { waitUntil: "load" });
      await page.waitForTimeout(5000);
      const desborde = await page.evaluate(() => ({
        ancho: document.documentElement.scrollWidth,
        ventana: window.innerWidth,
      }));
      await b.anota(`telefono${r.replace(/\//g, "-") || "-portada"}`, "body", { desborde });
    }
  } finally {
    b.guarda();
  }
});

test("AXA como perito", async ({ page }) => {
  const b = bitacora(page, "axa");
  await preparar(page);
  try {
    await page.goto("/cesvi");
    await quieta(page);
    await b.anota("casos", "main", { controles: await controles(page) });
    await page.getByTestId("ir-axa").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    const panel = '[data-testid="panel-paso"]';

    for (const [n, nombre] of [
      [1, "el-caso"],
      [2, "el-hecho"],
    ] as const) {
      await irAPaso(page, n);
      await quieta(page);
      await b.anota(nombre, panel, { controles: await controles(page) });
    }
    await irAPaso(page, 3);
    await expect(page.getByTestId("escena-lista")).toBeVisible({ timeout: 60_000 });
    await quieta(page);
    await b.anota("la-escena", '[data-testid="recorrido-caso"]', {
      controles: await controles(page),
    });

    await irAPaso(page, 4);
    const t0 = Date.now();
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 180_000 });
    const cifraMs = Date.now() - t0;
    await expect(page.getByTestId("panel-paso").getByTestId("hipotesis")).toBeVisible({
      timeout: 180_000,
    });
    await quieta(page, 4000);
    await b.anota("reconstruccion", panel, {
      cifra_ms: cifraMs,
      completo_ms: Date.now() - t0,
      cifra: await page.getByTestId("cifra-reconstruccion").innerText(),
      limites: await page
        .getByTestId("limites")
        .innerText({ timeout: 5000 })
        .catch(() => null),
      controles: await controles(page),
    });

    // El 3D con Unity: cuánto tarda, qué controles tiene y cómo se ve el daño en el impacto.
    const t1 = Date.now();
    await page.getByTestId("vista-3d").click();
    const visor = page.getByTestId("visor-unity");
    await expect(visor).toHaveAttribute("data-fase", /listo|respaldo/, { timeout: 300_000 });
    const fase = await visor.getAttribute("data-fase");
    await page.waitForTimeout(8000);
    await b.anota("unity", panel, {
      fase,
      unity_ms: Date.now() - t1,
      controles: await controles(page),
      atributos: await visor.evaluate((e) =>
        Object.fromEntries([...e.attributes].map((a) => [a.name, a.value.slice(0, 120)])),
      ),
    });
    for (const vista of ["vista-detras", "vista-dano", "vista-conductor", "vista-cenital"]) {
      const boton = page.getByTestId(vista);
      if (!(await boton.count())) continue;
      await boton.first().click();
      await page.waitForTimeout(7000);
      await b.anota(`unity-${vista}`, panel);
    }

    for (const [n, nombre] of [
      [5, "los-danos"],
      [6, "los-numeros"],
      [7, "contra-cesvi"],
    ] as const) {
      await irAPaso(page, n);
      await quieta(page, 3500);
      await b.anota(nombre, panel, { controles: await controles(page) });
    }

    await irAPaso(page, 8);
    await expect
      .poll(
        async () =>
          (await page.evaluate(
            () =>
              (window as unknown as { __croquisCuadrosDictamen?: unknown[] })
                .__croquisCuadrosDictamen?.length ?? 0,
          )) as number,
        { timeout: 240_000 },
      )
      .toBe(3)
      .catch(() => undefined);
    await quieta(page, 5000);
    await b.anota("dictamen", panel, { controles: await controles(page) });
    // Las descargas: el PDF y el Word tal como los recibe el perito.
    for (const [boton, archivo] of [
      ["descargar-dictamen-pdf", "axa-dictamen.pdf"],
      ["descargar-dictamen-word", "axa-dictamen.docx"],
    ] as const) {
      const b0 = page.getByTestId(boton);
      if (!(await b0.count())) continue;
      const espera = page.waitForEvent("download", { timeout: 120_000 }).catch(() => null);
      await b0.first().click();
      const d = await espera;
      if (d) await d.saveAs(join(SALIDA, archivo));
      await page.waitForTimeout(2000);
    }

    await page.getByTestId("modo-presentar").click();
    await expect(page.getByTestId("presentar-caso")).toBeVisible({ timeout: 60_000 });
    await quieta(page, 7000);
    await b.anota("presentar-1", '[data-testid="presentar-caso"]', {
      controles: await controles(page),
    });
    for (let k = 2; k <= 4; k++) {
      await page.keyboard.press("ArrowRight");
      await quieta(page, 6000);
      await b.anota(`presentar-${k}`, '[data-testid="presentar-caso"]');
    }
  } finally {
    b.guarda();
  }
});

test("un caso nuevo como perito", async ({ page }) => {
  const b = bitacora(page, "caso-nuevo");
  await preparar(page);
  try {
    await page.goto("/cesvi");
    await page.getByTestId("ir-caso-nuevo").click();
    await expect(page.getByTestId("recorrido-caso")).toHaveAttribute("data-origen", "nuevo");
    const panel = '[data-testid="panel-paso"]';
    await irAPaso(page, 2);
    await b.anota("narracion-vacia", panel, { controles: await controles(page) });
    await page.getByTestId("ejemplo-narracion").click();
    await quieta(page);
    await b.anota("narracion-ejemplo", panel);
    const t0 = Date.now();
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toContainText("vehículos", { timeout: 180_000 });
    await quieta(page, 4000);
    await b.anota("lectura", panel, { lectura_ms: Date.now() - t0 });

    await irAPaso(page, 3);
    const mapa = await mapaFacil(page);
    const pregunta = page.getByTestId("escena-pregunta");
    const lista = page.getByTestId("escena-lista");
    await page.waitForTimeout(5000);
    const preguntas: string[] = [];
    for (let k = 0; k < 20; k++) {
      if (await lista.isVisible()) break;
      const texto = (await pregunta.textContent()) ?? "";
      preguntas.push(texto.slice(0, 160));
      if (preguntas.length <= 6)
        await b.anota(`pregunta-${preguntas.length}`, '[data-testid="recorrido-caso"]');
      if (/^¿Dónde fue/.test(texto)) {
        const caja = (await mapa.boundingBox())!;
        await mapa.click({ position: { x: caja.width * 0.55 + k * 14, y: caja.height * 0.5 } });
      } else if (texto.startsWith("¿Por dónde")) {
        const propuesta = page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]');
        await (
          (await propuesta.count()) ? propuesta.first() : page.getByTestId("opcion-flecha-0")
        ).click();
      } else if (texto.startsWith("¿Dónde quedó")) {
        await page.getByTestId("final-junto").click();
        await page.getByTestId("listo-final").click();
      } else {
        await contestarC1(page);
        continue;
      }
      await expect
        .poll(async () => (await lista.isVisible()) || (await pregunta.textContent()) !== texto)
        .toBe(true);
    }
    await expect(lista).toBeVisible();
    await quieta(page);
    await b.anota("escena-lista", '[data-testid="recorrido-caso"]', { preguntas });

    await irAPaso(page, 4);
    const t1 = Date.now();
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 180_000 });
    await quieta(page, 5000);
    await b.anota("resultado", panel, {
      cifra_ms: Date.now() - t1,
      cifra: await page.getByTestId("cifra-reconstruccion").innerText(),
      limites: await page
        .getByTestId("limites")
        .innerText({ timeout: 5000 })
        .catch(() => null),
    });
    for (const [n, nombre] of [
      [5, "los-danos"],
      [6, "los-numeros"],
      [7, "contra-cesvi"],
      [8, "dictamen"],
    ] as const) {
      await irAPaso(page, n).catch(() => undefined);
      await quieta(page, 5000);
      await b.anota(nombre, panel, { controles: await controles(page) });
    }
  } finally {
    b.guarda();
  }
});

/**
 * Sonda: en las dos pasadas del caso nuevo la captura de pantalla no terminó después de reconstruir.
 * ¿La página deja de pintar (lo vería el perito) o es solo la captura? Anota cuadros por segundo,
 * si responde el hilo principal y si la captura sale al ocultar los lienzos.
 */
test("sonda del caso nuevo", async ({ page }) => {
  test.setTimeout(480_000);
  const unity = process.env.CROQUIS_SONDA_UNITY !== "no";
  if (unity) await preparar(page);
  const sonda: Record<string, unknown> = { unity };
  const guarda = () =>
    writeFileSync(
      join(SALIDA, `sonda-caso-nuevo${unity ? "" : "-sin-unity"}.json`),
      `${JSON.stringify(sonda, null, 2)}\n`,
    );
  try {
    await page.goto("/cesvi");
    await page.getByTestId("ir-caso-nuevo").click();
    await irAPaso(page, 2);
    await page.getByTestId("ejemplo-narracion").click();
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toContainText("vehículos", { timeout: 180_000 });
    await irAPaso(page, 3);
    const mapa = await mapaFacil(page);
    const pregunta = page.getByTestId("escena-pregunta");
    const lista = page.getByTestId("escena-lista");
    await page.waitForTimeout(4000);
    for (let k = 0; k < 20; k++) {
      if (await lista.isVisible()) break;
      const texto = (await pregunta.textContent()) ?? "";
      if (/^¿Dónde fue/.test(texto)) {
        const caja = (await mapa.boundingBox())!;
        await mapa.click({ position: { x: caja.width * 0.55 + k * 14, y: caja.height * 0.5 } });
      } else if (texto.startsWith("¿Por dónde")) {
        const propuesta = page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]');
        await (
          (await propuesta.count()) ? propuesta.first() : page.getByTestId("opcion-flecha-0")
        ).click();
      } else if (texto.startsWith("¿Dónde quedó")) {
        await page.getByTestId("final-junto").click();
        await page.getByTestId("listo-final").click();
      } else {
        await contestarC1(page);
        continue;
      }
      await expect
        .poll(async () => (await lista.isVisible()) || (await pregunta.textContent()) !== texto)
        .toBe(true);
    }
    const cuadros = () =>
      page
        .evaluate(
          () =>
            new Promise<{ cuadros: number; lienzos: { w: number; h: number; visible: boolean }[] }>(
              (ok) => {
                let n = 0;
                const paso = () => {
                  n++;
                  requestAnimationFrame(paso);
                };
                requestAnimationFrame(paso);
                setTimeout(
                  () =>
                    ok({
                      cuadros: n,
                      lienzos: [...document.querySelectorAll("canvas")].map((c) => ({
                        w: c.width,
                        h: c.height,
                        visible: c.offsetParent !== null,
                      })),
                    }),
                  3000,
                );
              },
            ),
        )
        .catch((e: Error) => `no respondió: ${e.message.slice(0, 80)}`);
    const captura = (nombre: string) =>
      page
        .screenshot({ path: join(SALIDA, nombre), type: "jpeg", quality: 55, timeout: 20_000 })
        .then(() => "sale")
        .catch((e: Error) => `no sale: ${e.message.slice(0, 80)}`);
    sonda.antes_de_reconstruir = {
      cuadros_en_3s: await cuadros(),
      captura: await captura("sonda-1-escena.jpg"),
    };
    guarda();
    await irAPaso(page, 4);
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 180_000 });
    sonda.cifra = (await page.getByTestId("cifra-reconstruccion").innerText()).replace(
      /\n+/g,
      " | ",
    );
    // Se sigue la página tres minutos: cuadros que pinta, si responde y qué dice la cifra.
    const serie: unknown[] = [];
    const t0 = Date.now();
    for (let k = 0; k < 30; k++) {
      const c = await Promise.race([
        cuadros(),
        new Promise<string>((ok) => setTimeout(() => ok("sin respuesta en 12 s"), 12_000)),
      ]);
      const texto = await Promise.race([
        page
          .getByTestId("cifra-reconstruccion")
          .innerText({ timeout: 5000 })
          .then((t) => t.replace(/\s+/g, " ").slice(0, 110))
          .catch(() => "cifra: sin respuesta"),
        new Promise<string>((ok) => setTimeout(() => ok("cifra: sin respuesta en 6 s"), 6000)),
      ]);
      serie.push({
        s: Math.round((Date.now() - t0) / 1000),
        cuadros_en_3s: typeof c === "string" ? c : c.cuadros,
        cifra: texto,
      });
      sonda.serie = serie;
      guarda();
      await page.waitForTimeout(3000);
    }
    sonda.despues_de_reconstruir = {
      cuadros_en_3s: await cuadros(),
      captura: await captura("sonda-2-resultado.jpg"),
    };
    guarda();
    await page.addStyleTag({ content: "canvas { display: none !important; }" });
    await page.waitForTimeout(1500);
    sonda.sin_lienzos = {
      cuadros_en_3s: await cuadros(),
      captura: await captura("sonda-3-sin-lienzos.jpg"),
    };
  } finally {
    guarda();
  }
});
