import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { colocar, RECETAS } from "./recetas-ejemplos";

/**
 * Ronda 2, C: las cinco narraciones de ejemplo, de punta a punta, como las usaría un perito: elegir
 * el ejemplo, leerlo (su lectura guardada: no gasta API), colocar la escena como dice la narración,
 * reconstruir, ver el 2D y abrir el dictamen. Anota lo que da cada una (la cifra, su rango, si hay
 * dos hipótesis y los límites que la app declara), para decidir si luce o si deja ver un límite.
 * No corre en CI.
 *
 *   CROQUIS_URL=<sitio> pnpm exec playwright test -c playwright.produccion.config.ts \
 *     e2e/ejemplos-ronda2.spec.ts
 *     → eval/results/ronda2_ejemplos.json y docs/cesvi/ronda-2/ejemplos/
 *
 * Con `CROQUIS_UNITY=1` abre además el 3D de Unity de cada una (pesado: no en una laptop de 8 GB).
 */
const RAIZ = resolve(__dirname, "../../..");
// `CROQUIS_SALIDA` y `CROQUIS_CAPTURAS` (relativas a la raíz) para medir un después sin pisar el antes.
// `resolve`: la ruta puede llegar absoluta (la tanda); `join` la pegaba detrás de la raíz (t5).
const SALIDA = resolve(
  RAIZ,
  process.env.CROQUIS_SALIDA ??
    (process.env.CROQUIS_EJEMPLO
      ? `eval/results/ronda2_ejemplo_${process.env.CROQUIS_EJEMPLO}.json`
      : "eval/results/ronda2_ejemplos.json"),
);
const CAPTURAS = resolve(RAIZ, process.env.CROQUIS_CAPTURAS ?? "docs/cesvi/ronda-2/ejemplos");
/** Escribe el resultado, creando su carpeta si falta («antes»: eval/results/t5 no existía). */
function escribirSalida(texto: string): void {
  mkdirSync(dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, texto);
}
const CON_UNITY = process.env.CROQUIS_UNITY === "1";

// Una acción que no encuentra su control falla pronto, con el nombre de lo que faltó.
test.use({
  actionTimeout: 20_000,
  viewport: { width: 1440, height: 900 },
  locale: "es-MX",
  // t5 (René, 2026-11-19): con CROQUIS_CANAL, en el navegador instalado («chrome»).
  ...(process.env.CROQUIS_CANAL ? { channel: process.env.CROQUIS_CANAL } : {}),
});

const textoDe = async (page: Page, testid: string) => {
  const l = page.getByTestId(testid);
  return (await l.count())
    ? ((await l.first().textContent()) ?? "").replace(/\s+/g, " ").trim()
    : null;
};

test("las cinco narraciones de ejemplo, de punta a punta", async ({ page, baseURL }) => {
  test.setTimeout(1_500_000);
  mkdirSync(CAPTURAS, { recursive: true });
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  if (CON_UNITY)
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
    });
  let llamadasAClaude = 0;
  page.on("request", (q) => {
    if (q.url().includes("/api/cesvi/escena")) llamadasAClaude++;
  });
  const resultados: Record<string, unknown>[] = [];
  // CROQUIS_EJEMPLO=<clave> recorre solo uno (para ajustar su receta).
  const solo = process.env.CROQUIS_EJEMPLO;
  for (const r of RECETAS.filter((x) => !solo || x.clave === solo)) {
    const notas: string[] = [];
    const foto = (n: string) =>
      page.screenshot({ path: join(CAPTURAS, `${r.clave}-${n}.jpg`), type: "jpeg", quality: 80 });
    await page.goto("/cesvi");
    // t5b (René, 2026-11-20): con qué tarjeta se corrió (el renderer de WebGL), en cada fila.
    const gpu = await page
      .evaluate(() => {
        const gl = document.createElement("canvas").getContext("webgl2");
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
      })
      .catch(() => null);
    await page.getByTestId("ir-caso-nuevo").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await irAPaso(page, 2);
    // 1. El ejemplo y su lectura (guardada: no llama a Claude).
    await page.locator(`[data-ejemplo="${r.clave}"]`).click();
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
    const leido = await textoDe(page, "escena");
    const guardada = (await page.getByTestId("lectura-guardada").count()) > 0;
    await foto("1-leida");
    // 2. La escena, como dice la narración.
    await irAPaso(page, 3);
    const lista = await colocar(page, r, notas);
    await foto("2-escena");
    if (!lista) {
      resultados.push({ clave: r.clave, gpu, leido, guardada, colocada: false, notas });
      continue;
    }
    await page.getByTestId("avance-ver-reconstruccion").click();
    await expect(page.getByTestId("panel-paso")).toHaveAttribute("data-paso", "4");
    await page.waitForTimeout(600);
    await foto("3-planteamiento");
    // 3. La reconstrucción.
    const t0 = Date.now();
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
    const segundos = Math.round((Date.now() - t0) / 100) / 10;
    await page.waitForTimeout(2500);
    await foto("4-reconstruccion");
    await page.getByTestId("ver-detalle-reconstruccion").click();
    const fila = {
      clave: r.clave,
      gpu,
      leido,
      lectura_guardada: guardada,
      colocada: true,
      segundos_reconstruir: segundos,
      cifra: await textoDe(page, "cifra-reconstruida"),
      de_quien: await textoDe(page, "cifra-de-quien"),
      rango: await textoDe(page, "cifra-rango"),
      sin_cifra: await textoDe(page, "sin-cifra"),
      sin_dispersion: (await page.getByTestId("sin-dispersion").count()) > 0,
      hipotesis: await page.getByRole("button", { name: "Elegir esta" }).count(),
      velocidades: await textoDe(page, "velocidades"),
      evidencia: await textoDe(page, "evidencia-usada"),
      impactos: await textoDe(page, "impactos-reconstruidos"),
      limites: await page.getByTestId("limites").locator("li").allTextContents(),
      terreno: await textoDe(page, "terreno-reconstruccion"),
      // «Daños» y «Los números»: lo que dicen del método de CESVI, si hay medidas.
      analisis: [] as string[],
      unity: null as string | null,
      dictamen: false,
      notas,
    };
    // 4. El 3D de Unity, solo si se pide (pesado).
    if (CON_UNITY) {
      await page.getByTestId("vista-3d").click();
      const visor = page.getByTestId("visor-unity");
      await visor
        .waitFor({ timeout: 30_000 })
        .then(() =>
          expect(visor).toHaveAttribute("data-fase", /listo|respaldo/, { timeout: 240_000 }),
        )
        .catch(() => undefined);
      fila.unity = (await visor.count()) ? await visor.getAttribute("data-fase") : "sin visor";
      await page.waitForTimeout(3000);
      await foto("4b-3d");
      await page.getByTestId("vista-maqueta").click();
    }
    for (const n of [6, 7]) {
      await irAPaso(page, n);
      await page.waitForTimeout(1200);
      fila.analisis.push(
        ((await page.getByTestId("panel-paso").textContent()) ?? "")
          .replace(/\s+/g, " ")
          .slice(0, 700),
      );
      await foto(`5-analisis-${n}`);
    }
    // 5. El dictamen.

    await page.getByTestId("exportar-barra").click();
    fila.dictamen = await page
      .getByTestId("dictamen-caso")
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(1500);
    await foto("6-dictamen");
    resultados.push(fila);
  }
  escribirSalida(
    `${JSON.stringify(
      {
        descripcion:
          "Las cinco narraciones de ejemplo de punta a punta (ronda 2, C): la lectura guardada, la escena colocada como dice la narración (receta en el script), la reconstrucción, y el dictamen. Lo que dice la pantalla, sin interpretar. Chromium a 1440×900.",
        script: "apps/web/e2e/ejemplos-ronda2.spec.ts",
        sitio: baseURL,
        fecha: new Date().toISOString(),
        con_unity: CON_UNITY,
        llamadas_a_claude: llamadasAClaude,
        errores_de_pagina: errores,
        ejemplos: resultados,
      },
      null,
      2,
    )}\n`,
  );
  expect(resultados).toHaveLength(solo ? 1 : RECETAS.length);
});
