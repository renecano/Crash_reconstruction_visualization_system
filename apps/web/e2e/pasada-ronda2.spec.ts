import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso, mapaFacil, sinRed } from "./ayuda-recorrido";

/**
 * La pasada de la ronda 2 (René, 2026-11-16): el recorrido completo como perito, pantalla por
 * pantalla, para las capturas de antes y después de `docs/cesvi/ronda-2/pasada.md`. No comprueba:
 * anota en cada pantalla su captura, el texto visible, la jerga interna que asoma (semillas, hashes,
 * ids, agentes, «contrato»…) y los textos que se salen de su caja. No gasta API: las lecturas de
 * Claude son las grabadas de CI. No corre en CI.
 *
 *   CROQUIS_URL=<sitio> CROQUIS_PASADA=antes|despues CROQUIS_VARIANTE=claro|oscuro|chica \
 *     pnpm exec playwright test -c playwright.produccion.config.ts e2e/pasada-ronda2.spec.ts
 *     → docs/cesvi/ronda-2/capturas/<antes|despues>/<variante>/ y su pasada.json
 */
const RAIZ = resolve(__dirname, "../../..");
const CUAL = process.env.CROQUIS_PASADA ?? "antes";
const VARIANTE = (process.env.CROQUIS_VARIANTE ?? "claro") as "claro" | "oscuro" | "chica";
const SALIDA = join(RAIZ, "docs/cesvi/ronda-2/capturas", CUAL, VARIANTE);
const leer = (r: string) =>
  JSON.parse(readFileSync(join(RAIZ, r), "utf8")) as Record<string, unknown>;
const ESCENA = leer("data/cesvi/grabaciones/escenas/cesvi-e814f085db.json") as { salida: unknown };
const LECTURAS = leer("data/cesvi/grabaciones/importar/lecturas-a2010930.json");
const REPORTE = readFileSync(join(RAIZ, "data/cesvi/grabaciones/importar/dictamen-a2010930.md"));
const CARAMBOLA = "cesvi-257e1374a0";

/** Lo que es de la app y no del perito. */
const JERGA =
  /\b(semillas?|seed|hash(es)?|huellas? de|contrato|agentes?|Físico|Preguntador|Revisor|pizarra|R12b|ADR|solver|JSON|schema|Monte ?Carlo|undefined|NaN|null|TODO|cesvi-[0-9a-f]{6,}|[0-9a-f]{12,}|[a-z]+_[a-z_]+)\b/g;

test.use({
  actionTimeout: 15_000,
  reducedMotion: "reduce",
  colorScheme: VARIANTE === "oscuro" ? "dark" : "light",
  viewport: VARIANTE === "chica" ? { width: 900, height: 620 } : { width: 1440, height: 900 },
});

interface Pantalla {
  n: string;
  tarea_mas_larga_ms: number;
  url: string;
  captura: string;
  jerga: string[];
  cortados: string[];
  texto: string;
}

async function simular(page: Page) {
  await sinRed(page);
  await page.route("https://tiles.openfreemap.org/**", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: "fondo", type: "background", paint: { "background-color": "#e9e9e6" } }],
      }),
    }),
  );
  await page.route("**/api/cesvi/escena", (r) =>
    r.fulfill({ json: { metodo: "claude", salida: ESCENA.salida } }),
  );
  await page.route("**/api/cesvi/importar", (r) =>
    r.fulfill({ json: { metodo: "claude", ...LECTURAS } }),
  );
}

test("pasada de la ronda 2", async ({ page, context }) => {
  test.setTimeout(1_200_000);
  mkdirSync(SALIDA, { recursive: true });
  const pantallas: Pantalla[] = [];
  const fallas: string[] = [];
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message.slice(0, 300)));
  await simular(page);
  // Las tareas largas del hilo principal: si el recorrido se traba, ¿es la página o la captura?
  await page.addInitScript(() => {
    const w = window as unknown as { __largas: number[] };
    w.__largas = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__largas.push(Math.round(e.duration));
    }).observe({ type: "longtask", buffered: true });
  });
  // El visor Unity, como en el ensayo de la demo (sin esto, un navegador automatizado usa el de respaldo).
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });

  const guardar = () =>
    writeFileSync(
      join(SALIDA, "pasada.json"),
      `${JSON.stringify({ cual: CUAL, variante: VARIANTE, fecha: new Date().toISOString(), fallas, errores, pantallas }, null, 2)}\n`,
    );
  // Con CROQUIS_PERFIL, un perfil de CPU continuo: cuando una pantalla tiene una tarea de más de
  // 1 s, se guardan las funciones que más tiempo ocuparon.
  const cdp = process.env.CROQUIS_PERFIL ? await context.newCDPSession(page) : null;
  const perfiles: { pantalla: string; funciones: string[] }[] = [];
  if (cdp) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 2000 });
    await cdp.send("Profiler.start");
  }
  const anota = async (nombre: string) => {
    await page.waitForTimeout(400);
    const n = `${String(pantallas.length + 1).padStart(2, "0")}-${nombre}`;
    await page.screenshot({ path: join(SALIDA, `${n}.jpg`), type: "jpeg", quality: 60 });
    const texto =
      (await page
        .locator("main, body")
        .first()
        .innerText()
        .catch(() => "")) ?? "";
    // Textos que se salen de su caja o quedan tapados (ancho de contenido mayor que el visible).
    const cortados = process.env.CROQUIS_SIN_CORTADOS
      ? []
      : await page.evaluate(() => {
          const r: string[] = [];
          for (const el of Array.from(
            document.querySelectorAll("button, a, label, p, span, h1, h2, h3, li"),
          )) {
            const h = el as HTMLElement;
            if (!h.offsetParent || !h.innerText?.trim()) continue;
            // Lo que es solo para lectores de pantalla (recortado a propósito) no cuenta.
            const caja = h.getBoundingClientRect();
            if (caja.width <= 2 || caja.height <= 2 || h.closest(".sr-only")) continue;
            const s = getComputedStyle(h);
            if (s.overflow === "visible" && s.textOverflow !== "ellipsis") {
              if (
                h.scrollWidth > h.clientWidth + 2 &&
                h.children.length === 0 &&
                s.whiteSpace === "nowrap"
              )
                r.push(h.innerText.trim().slice(0, 80));
              continue;
            }
            if (h.scrollWidth > h.clientWidth + 2 || h.scrollHeight > h.clientHeight + 2)
              r.push(h.innerText.trim().slice(0, 80));
          }
          return [...new Set(r)].slice(0, 30);
        });
    const largas = await page
      .evaluate(() => {
        const w = window as unknown as { __largas: number[] };
        const l = w.__largas ?? [];
        w.__largas = [];
        return l;
      })
      .catch(() => [] as number[]);
    if (cdp) {
      const { profile } = (await cdp.send("Profiler.stop")) as unknown as {
        profile: {
          nodes: {
            id: number;
            callFrame: { functionName: string; url: string; lineNumber: number };
            children?: number[];
          }[];
          samples: number[];
          timeDeltas: number[];
        };
      };
      if (Math.max(0, ...largas) > 1000) {
        const porId = new Map(profile.nodes.map((x) => [x.id, x]));
        const padre = new Map<number, number>();
        for (const x of profile.nodes) for (const h of x.children ?? []) padre.set(h, x.id);
        const total = new Map<string, number>();
        profile.samples.forEach((id, i) => {
          const vistos = new Set<string>();
          for (let x: number | undefined = id; x !== undefined; x = padre.get(x)) {
            const f = porId.get(x)!.callFrame;
            if (!f.url) continue;
            const k = `${f.functionName || "(anónima)"} ${f.url.split("/").slice(-1)[0]}:${f.lineNumber}`;
            if (vistos.has(k)) continue;
            vistos.add(k);
            total.set(k, (total.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
          }
        });
        perfiles.push({
          pantalla: n,
          funciones: [...total]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 40)
            .map(([k, v]) => `${Math.round(v)} ms ${k}`),
        });
        writeFileSync(
          join(SALIDA, "perfiles.json"),
          `${JSON.stringify(perfiles, null, 1)}
`,
        );
      }
      await cdp.send("Profiler.start");
    }
    pantallas.push({
      tarea_mas_larga_ms: Math.max(0, ...largas),
      n,
      url: page.url(),
      captura: `${n}.jpg`,
      jerga: [...new Set(texto.match(JERGA) ?? [])].slice(0, 40),
      cortados,
      texto: texto.replace(/\n{2,}/g, "\n").slice(0, 5000),
    });
    guardar();
  };
  const medirAhora = async () => {
    try {
      const mas = page.getByTestId("mas-herramientas");
      if ((await mas.getAttribute("open")) === null) await mas.locator("summary").click();
      await page.getByTestId("herramienta-medir").filter({ visible: true }).click();
      await anota("medir-activo");
      const mapa = page.getByTestId("mapa-facil");
      const caja = (await mapa.boundingBox())!;
      await mapa.click({ position: { x: caja.width * 0.55, y: caja.height * 0.62 } });
      await page.mouse.move(caja.x + caja.width * 0.66, caja.y + caja.height * 0.5);
      await anota("medir-un-punto");
      await mapa.click({ position: { x: caja.width * 0.75, y: caja.height * 0.42 } });
      await anota("medir-dos-puntos");
      await page.getByTestId("herramienta-medir").filter({ visible: true }).click();
    } catch (e) {
      fallas.push(`medir: ${(e as Error).message.split(/\r?\n/)[0]!.slice(0, 200)}`);
    }
  };
  const tramo = async (nombre: string, f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      fallas.push(`${nombre}: ${(e as Error).message.split("\n")[0]!.slice(0, 200)}`);
      await anota(`falla-${nombre}`).catch(() => undefined);
    }
  };
  const abreDetalles = async () => {
    for (const d of await page
      .locator(
        "main details:not([open]) > summary, [data-testid=panel-paso] details:not([open]) > summary",
      )
      .all())
      if (await d.isVisible()) await d.click({ timeout: 3000 }).catch(() => undefined);
    await page.keyboard.press("Home").catch(() => undefined);
  };
  const pasos = async (prefijo: string, desde: number, hasta: number) => {
    for (let p = desde; p <= hasta; p++) {
      try {
        await irAPaso(page, p);
      } catch (e) {
        // El motivo completo (quién tapa el botón), para la pasada; y se avanza con el evento.
        const m = (e as Error).message.replace(/\s+/g, " ");
        fallas.push(`${prefijo} paso ${p}: ${m.slice(0, 700)}`);
        try {
          for (let k = 0; k < 3; k++) {
            const actual = Number(await page.getByTestId("panel-paso").getAttribute("data-paso"));
            if (actual >= p) break;
            await page.getByTestId("siguiente").dispatchEvent("click");
            await page.waitForTimeout(800);
          }
        } catch {
          continue;
        }
      }
      await page.waitForTimeout(600);
      if (
        p === 4 &&
        (await page
          .getByTestId("reconstruir")
          .isVisible()
          .catch(() => false))
      ) {
        await anota(`${prefijo}-paso4-antes-de-reconstruir`);
        await page.getByTestId("reconstruir").click();
        await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
      }
      await anota(`${prefijo}-paso${p}`);
      if (VARIANTE === "claro") {
        await abreDetalles();
        await anota(`${prefijo}-paso${p}-detalles`);
      }
    }
  };
  const presentar = async (prefijo: string) => {
    await page.getByTestId("modo-presentar").click();
    await expect(page.getByTestId("capitulo-titulo")).toBeVisible({ timeout: 60_000 });
    for (let k = 0; k < 8; k++) {
      await anota(`${prefijo}-presentar-${k + 1}`);
      const antes = await page.getByTestId("capitulo-titulo").innerText();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(700);
      if ((await page.getByTestId("capitulo-titulo").innerText()) === antes) break;
    }
    await page.keyboard.press("Escape");
  };

  await tramo("casos", async () => {
    await page.goto("/cesvi");
    await expect(page.getByTestId("ir-caso-nuevo")).toBeVisible();
    await anota("casos");
  });

  // 1. Un caso nuevo, con la narración de ejemplo.
  await tramo("nuevo", async () => {
    await page.getByTestId("ir-caso-nuevo").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await anota("nuevo-paso1");
    await irAPaso(page, 2);
    await anota("nuevo-narracion-vacia");
    await page.getByTestId("ejemplo-narracion").click();
    await anota("nuevo-narracion-ejemplo");
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toContainText("vehículos", { timeout: 60_000 });
    await anota("nuevo-leida");
    await abreDetalles();
    await anota("nuevo-leida-detalles");
  });
  await tramo("preguntas", async () => {
    await irAPaso(page, 3);
    const mapa = await mapaFacil(page);
    const lista = page.getByTestId("escena-lista");
    const pregunta = page.getByTestId("escena-pregunta");
    for (let k = 0; k < 24; k++) {
      if (await lista.isVisible()) break;
      const texto = ((await pregunta.textContent()) ?? "").trim();
      await anota(`pregunta-${k + 1}`);
      if (k === 1) await medirAhora();
      if (/primer golpe/.test(texto)) await page.getByTestId("golpe-nose").click();
      else if (/algo más/.test(texto)) await page.getByTestId("otros-no").click();
      else if (/por dónde pasó/.test(texto)) await page.getByTestId("paso-listo").click();
      else if (/Cómo es el terreno/.test(texto)) {
        await anota("terreno");
        await page.getByTestId("terreno-liso").click();
      } else if (/^¿Dónde fue/.test(texto)) {
        const caja = (await mapa.boundingBox())!;
        await mapa.click({ position: { x: caja.width * 0.6 + k * 14, y: caja.height * 0.45 } });
      } else if (texto.startsWith("¿Por dónde")) {
        const propuesta = page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]');
        await (
          (await propuesta.count()) ? propuesta.first() : page.getByTestId("opcion-flecha-0")
        ).click();
      } else {
        await page.getByTestId("final-junto").click();
        await page.getByTestId("listo-final").click();
      }
      await expect
        .poll(
          async () =>
            (await lista.isVisible()) || ((await pregunta.textContent()) ?? "").trim() !== texto,
        )
        .toBe(true);
    }
    await anota("escena-lista");
  });
  await tramo("nuevo-pasos", async () => {
    await pasos("nuevo", 4, 7);
    await page
      .getByTestId("exportar")
      .click()
      .catch(() => undefined);
    await anota("nuevo-exportar");
    await page.keyboard.press("Escape");
    await presentar("nuevo");
  });

  // 2. Cargar un reporte de CESVI.
  await tramo("importar", async () => {
    await page.goto("/cesvi");
    await page.getByTestId("ir-importar").click();
    await anota("importar-paso1");
    await page.getByTestId("archivo-dictamen").setInputFiles({
      name: "reporte.md",
      mimeType: "text/markdown",
      buffer: REPORTE,
    });
    await page.getByTestId("leer-dictamen").click();
    await expect(page.getByTestId("panel-paso")).toHaveAttribute("data-paso", "2", {
      timeout: 60_000,
    });
    await anota("importar-leido");
    await abreDetalles();
    await anota("importar-leido-detalles");
  });

  // 3. AXA, el caso de ejemplo, y guardarlo para volver a abrirlo.
  let guardado: string | null = null;
  await tramo("axa", async () => {
    await page.goto("/cesvi");
    await page.getByTestId("ir-axa").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await pasos("axa", 1, 8);
    if (VARIANTE === "claro") {
      await irAPaso(page, 4);
      await page.getByTestId("vista-3d").click();
      await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
        timeout: 180_000,
      });
      await page.waitForTimeout(3000);
      await anota("axa-3d");
    }
    await presentar("axa");
    const descarga = page.waitForEvent("download", { timeout: 20_000 });
    await page.getByTestId("guardar-caso").click();
    const d = await descarga;
    guardado = join(SALIDA, "caso-axa.json");
    await d.saveAs(guardado);
  });
  await tramo("guardado", async () => {
    if (!guardado) throw new Error("sin caso guardado");
    await page.goto("/cesvi");
    await page.getByTestId("abrir-archivo-casos").setInputFiles(guardado);
    await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
    await anota("guardado-abierto");
  });

  // 4. Los casos de ejemplo de los reportes: una carambola y la reproducción.
  await tramo("carambola", async () => {
    await page.goto(`/cesvi/casos/reporte/${CARAMBOLA}`);
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await anota("carambola-paso1");
    await irAPaso(page, 2);
    await anota("carambola-paso2");
  });
  await tramo("reproduccion", async () => {
    await page.goto("/cesvi/reproduccion");
    await page.waitForLoadState("networkidle");
    await anota("reproduccion");
  });

  guardar();
  // Sin captura de la descarga de AXA en el repo.
  if (guardado) rmSync(guardado, { force: true });
});
