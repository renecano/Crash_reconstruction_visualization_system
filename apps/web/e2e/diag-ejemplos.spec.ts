import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { colocar, RECETAS } from "./recetas-ejemplos";

/** Diagnóstico de la t9-junta (2026-11-26): por qué el mapa de La escena no queda estable. */
const SALIDA = process.env.CROQUIS_CAPTURAS ?? "diag-ejemplos";

// Como la e2e de los ejemplos: 1440×900 y 20 s por acción.
test.use({ actionTimeout: 20_000, viewport: { width: 1440, height: 900 }, locale: "es-MX" });

test("diagnóstico del mapa en los cinco ejemplos", async ({ page }) => {
  test.setTimeout(900_000);
  mkdirSync(SALIDA, { recursive: true });
  const consola: string[] = [];
  page.on("pageerror", (e) => consola.push(`pageerror: ${e.message}`.slice(0, 300)));
  const filas: unknown[] = [];
  for (const r of RECETAS) {
    await page.goto("/cesvi");
    await page.getByTestId("ir-caso-nuevo").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await irAPaso(page, 2);
    await page.locator(`[data-ejemplo="${r.clave}"]`).click();
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
    await irAPaso(page, 3);
    const notas: string[] = [];
    let error = "";
    try {
      await colocar(page, r, notas);
    } catch (e) {
      error = (e as Error).message.slice(0, 1500);
    }
    let caja: unknown = null;
    if (error) {
      await page.screenshot({ path: join(SALIDA, `${r.clave}-falla.png`) });
      caja = await page.evaluate(() => {
        const m = document.querySelector('[data-testid="mapa-facil"]');
        const b = m?.getBoundingClientRect();
        const enc = [...document.querySelectorAll("body *")]
          .filter((x) => {
            const z = getComputedStyle(x).zIndex;
            const rr = x.getBoundingClientRect();
            return z !== "auto" && Number(z) > 5 && rr.width > 300 && rr.height > 300;
          })
          .map(
            (x) =>
              `${x.tagName}.${String(x.className).slice(0, 80)} z=${getComputedStyle(x).zIndex}`,
          )
          .slice(0, 8);
        return {
          mapa: b && [b.x, b.y, b.width, b.height],
          pregunta: document.querySelector('[data-testid="escena-pregunta"]')?.textContent,
          tarjeta: document.querySelector('[aria-label="La pregunta"]')?.textContent?.slice(0, 200),
          grandesEncima: enc,
        };
      });
    }
    filas.push({ clave: r.clave, error, notas, caja });
    if (error) break;
  }
  writeFileSync(
    join(SALIDA, "diagnostico.json"),
    JSON.stringify({ filas, consola: consola.slice(-30) }, null, 1),
  );
});
