import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Calles reales en el croquis (ADR 0040). CI no consulta Overpass: `/api/osm` responde con el
 * extracto versionado de Toluca (ODbL; data/osm/README.md).
 */
const RESP = readFileSync(
  join(process.cwd(), "../../data/osm/toluca_carranza_juarez.overpass.json"),
  "utf-8",
);

test("con coordenadas del cruce, el croquis toma las calles de OpenStreetMap", async ({ page }) => {
  const pedidas: string[] = [];
  await page.route("**/api/osm?**", (route) => {
    pedidas.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: RESP });
  });
  await page.goto("/croquis");
  await expect(page.getByTestId("road")).not.toHaveAttribute("data-fuente", "mapa");
  await page.getByText("Calles reales (OpenStreetMap)").click();
  await expect(page.getByTestId("mapa-traer")).toBeDisabled();
  await page.getByTestId("mapa-coordenadas").fill("19.27897, -99.65399");
  await page.getByTestId("mapa-traer").click();
  await expect(page.getByTestId("mapa-mensaje")).toContainText("calles de OpenStreetMap");
  expect(pedidas).toHaveLength(1);
  expect(new URL(pedidas[0]!).searchParams.get("radio")).toBe("150");
  await expect(page.getByTestId("road")).toHaveAttribute("data-fuente", "mapa");
  // La atribución de OSM aparece en la leyenda y el JSON trae la red.
  await expect(page.getByTestId("atribucion-mapa")).toContainText("OpenStreetMap");
  await expect(page.getByTestId("json")).toHaveValue(/"red_vial"/);
});

test("sin cruce cerca, explica qué hacer y no cambia la escena", async ({ page }) => {
  await page.route("**/api/osm?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: RESP }),
  );
  await page.goto("/croquis");
  await page.getByText("Calles reales (OpenStreetMap)").click();
  await page.getByTestId("mapa-coordenadas").fill("19.3, -99.6");
  await page.getByTestId("mapa-traer").click();
  await expect(page.getByTestId("mapa-mensaje")).toContainText("cruce");
  await expect(page.getByTestId("road")).not.toHaveAttribute("data-fuente", "mapa");
});
