import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { irAPaso } from "./ayuda-recorrido";

// La transición entre actos (ADR 0108) es decorativa; con movimiento reducido no se monta.
test.use({ reducedMotion: "reduce" });

/**
 * T6.3 (W7): en una carambola cuya narración no dice el orden de los impactos, Croquis lo pregunta
 * y el perito lo declara a mano. La lectura es la grabada de «Un tráiler… choca de frente contra una
 * urvan; atrás venía un rabón que alcanza a la urvan» (CI no llama a la API).
 *
 * No lleva `@flujo`: corre a mano o en el flujo completo, no bloquea el merge.
 */
const GRABACION = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/relatos-w2/trailer-urvan.json"),
    "utf8",
  ),
) as { narracion: string; salida: unknown };

test("/cesvi: el perito declara el orden de los impactos de una carambola", async ({ page }) => {
  test.setTimeout(90_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.route("https://tiles.openfreemap.org/**", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: "fondo", type: "background", paint: { "background-color": "#eee" } }],
      }),
    }),
  );
  await page.route("**/api/cesvi/escena", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ metodo: "claude", salida: GRABACION.salida }),
    }),
  );
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await expect(page.getByTestId("recorrido-caso")).toHaveAttribute("data-origen", "nuevo");
  await irAPaso(page, 2);

  // La narración no dice qué pasó primero: solo enumera los dos choques.
  await page.getByTestId("narracion").fill(GRABACION.narracion);
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("3 vehículos · 2 impactos");
  const impactos = page.getByTestId("impactos");
  await expect(impactos).toContainText("Impacto 1: V1 y V2");
  await expect(impactos).toContainText("Impacto 2: V3 y V2");

  // Croquis pregunta el orden, con el que leyó como primera opción.
  const pregunta = page.getByTestId("pregunta-orden-impactos");
  await expect(pregunta).toContainText(
    "La narración no dice en qué orden ocurrieron los impactos. ¿Cuál fue?",
  );
  await expect(page.getByTestId("opcion-orden-impactos-1,2")).toHaveText(
    "V1 con V2, luego V3 con V2",
  );

  // El perito declara el otro: primero el alcance del rabón, después el choque de frente.
  await page.getByTestId("opcion-orden-impactos-2,1").click();
  await expect(impactos).toContainText("Impacto 1: V3 y V2");
  await expect(impactos).toContainText("Impacto 2: V1 y V2");
  // Contestada, no se vuelve a hacer; las demás preguntas siguen.
  await expect(pregunta).toHaveCount(0);
  await expect(page.locator('[data-testid^="pregunta-"]').first()).toBeVisible();
  expect(errores).toEqual([]);
});
