import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { CASOS } from "./casos-perito";

/**
 * El lugar de los 10 casos de la prueba como perito, sin corregir nada (René, 2026-11-28, después de
 * #410 y #413): lo que propone Croquis tal cual, y si lo ubica, pregunta o pide «márcalo tú». Solo
 * lecturas grabadas. Una línea por caso en `<salida>/lugar.jsonl` con la captura del momento.
 *
 *   CROQUIS_PERITO_SALIDA=~/croquis-ensayo/perito pnpm exec playwright test \
 *     -c playwright.produccion.config.ts e2e/lugar-produccion.spec.ts
 */
const SALIDA = process.env.CROQUIS_PERITO_SALIDA ?? join(homedir(), "croquis-ensayo", "perito");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __croquisVisorUnity?: boolean }).__croquisVisorUnity = true;
    localStorage.setItem("croquis.escena", "nueva");
    (window as unknown as { __croquisDiagnostico?: boolean }).__croquisDiagnostico = true;
  });
});

test.use({ viewport: { width: 1600, height: 900 } });

const SOLO = process.env.CROQUIS_LUGAR_SOLO?.split(",");
for (const c of CASOS.filter((x) => !SOLO || SOLO.includes(x.clave)))
  test(`lugar sin corregir: ${c.clave}`, async ({ page }) => {
    test.setTimeout(300_000);
    const grabada = join(SALIDA, "lecturas", `${c.clave}.json`);
    expect(existsSync(grabada), `Sin la lectura grabada de ${c.clave}`).toBe(true);
    await page.route("**/api/cesvi/escena", (r) =>
      r.fulfill({ json: JSON.parse(readFileSync(grabada, "utf8")) }),
    );
    const respuestas: { url: string; json: unknown }[] = [];
    page.on("response", async (r) => {
      if (!/\/api\/lugar/.test(r.url())) return;
      const json = await r.json().catch(() => null);
      respuestas.push({ url: r.url().replace(/^https?:\/\/[^/]+/, ""), json });
    });
    const dir = join(SALIDA, "lugar");
    mkdirSync(dir, { recursive: true });
    await page.goto("/cesvi");
    await page.getByTestId("ir-caso-nuevo").click();
    await irAPaso(page, 2);
    await page.getByTestId("narracion").fill(c.texto);
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toContainText("vehículo", { timeout: 240_000 });
    await irAPaso(page, 3);
    await page.waitForTimeout(4000);
    // Lo que haría el perito: «Buscar el lugar» (no es corregir) y ver qué propone Croquis.
    const buscar = page.getByTestId("marcar-choque-1");
    const t0 = Date.now();
    if (await buscar.isVisible().catch(() => false)) await buscar.click();
    // Hasta que contesta el buscador (o 2 min): cuánto tarda también es parte de lo que ve el perito.
    const contesto = await page
      .waitForResponse((r) => /\/api\/lugar\/narrado/.test(r.url()), { timeout: 120_000 })
      .then(() => true)
      .catch(() => false);
    const msBuscador = Date.now() - t0;
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(dir, `${c.clave}-2.jpg`), quality: 75, type: "jpeg" });
    const lugar = await page.evaluate(() =>
      [...document.querySelectorAll("[data-testid]")]
        .filter((e) =>
          /lugar|ubic|marc|buscar|encontr|opcion|pregunta|choque/i.test(
            e.getAttribute("data-testid")!,
          ),
        )
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => ({
          id: e.getAttribute("data-testid"),
          texto: (e as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 300),
        })),
    );
    const punto = await page.evaluate(
      () =>
        (
          window as unknown as {
            __croquisEscena?: {
              puntos?: Record<number, { lat: number; lon: number }>;
              origen?: unknown;
            };
          }
        ).__croquisEscena ?? null,
    );
    writeFileSync(
      join(dir, `${c.clave}.json`),
      JSON.stringify(
        {
          clave: c.clave,
          lugar,
          puntos: (punto as { puntos?: unknown } | null)?.puntos ?? null,
          respuestas,
        },
        null,
        2,
      ) + "\n",
    );
  });
