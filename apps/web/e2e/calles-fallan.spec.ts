import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./base";
import { irAPaso, mapaFacil } from "./ayuda-recorrido";

test.use({ reducedMotion: "reduce" });

/** La lectura grabada de Claude de la narración de ejemplo (CI no llama a la API). */
const GRABACION = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { salida: unknown };

/**
 * Si no llegan las calles (René, 2026-11-25): el perito ve «No se pudieron cargar las calles:
 * reintenta» en La escena y en la reconstrucción, y nunca una cifra calculada sin ellas. Al
 * reintentar con la red de vuelta, el aviso se va.
 */
test("@flujo /cesvi: sin las calles del lugar, aviso y reintento; ninguna cifra sin calles", async ({
  page,
}) => {
  test.setTimeout(180_000);
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
  await page.route("**/api/lugar?**", (r) => r.fulfill({ json: { resultados: [] } }));
  // La consulta de calles falla (OpenStreetMap no respondió).
  let red = false;
  await page.route("**/api/osm?**", (r) =>
    red ? r.fulfill({ json: { elements: [] } }) : r.fulfill({ status: 503, body: "" }),
  );
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await irAPaso(page, 2);
  await page.getByTestId("ejemplo-narracion").click();
  // Con una frase más ya no es el ejemplo (que trae sus calles guardadas): un caso nuevo.
  await page.getByTestId("narracion").press("Control+End");
  await page.getByTestId("narracion").pressSequentially(" Sin testigos.");
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("2 vehículos · 1 impacto");
  await irAPaso(page, 3);

  // Marcar el choque pide las calles de ese lugar; no llegan.
  const mapa = await mapaFacil(page);
  const caja = (await mapa.boundingBox())!;
  await mapa.click({ position: { x: caja.width * 0.6, y: caja.height * 0.45 } });
  await expect(page.getByTestId("mensaje-alerta")).toContainText(
    "No se pudieron cargar las calles: reintenta",
    { timeout: 30_000 },
  );

  // En la reconstrucción, el mismo aviso y ninguna cifra.
  await irAPaso(page, 4);
  await expect(page.getByTestId("aviso-sin-calles")).toBeVisible();
  await expect(page.getByTestId("cifra-reconstruccion")).toHaveCount(0);

  // Con la red de vuelta, «Reintentar» las pide otra vez y el aviso se va.
  red = true;
  await page.getByTestId("reintentar-calles").click();
  await expect(page.getByTestId("aviso-sin-calles")).toHaveCount(0, { timeout: 30_000 });
});
