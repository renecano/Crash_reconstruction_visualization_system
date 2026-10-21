import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Las lecturas grabadas de Claude de la descripción técnica de ejemplo y de la declaración del
 * caso (ADR 0055; CI no llama a la API).
 */
const GRABACION = JSON.parse(
  readFileSync(join(__dirname, "../../../data/cesvi/grabaciones/hecho-A2010930.json"), "utf8"),
) as { lecturas: Record<"descripcion" | "declaracion", { texto: string }> };
const DESCRIPCION = GRABACION.lecturas.descripcion.texto;

/**
 * Sin red externa: un estilo de mapa vacío en lugar de OpenFreeMap, la extracción grabada y un
 * borrador simulado. Overpass queda retenido hasta que la prueba lo suelta, para comprobar que el
 * paso 3 no lo espera (ADR 0053); al soltarlo responde la vía con su ancho.
 */
async function sinRedExterna(page: Page) {
  let soltarOverpass = () => {};
  const overpass = new Promise<void>((r) => {
    soltarOverpass = r;
  });
  await page.route("https://tiles.openfreemap.org/**", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: "fondo", type: "background", paint: { "background-color": "#111" } }],
      }),
    }),
  );
  await page.route("**/api/osm?**", async (r) => {
    await overpass;
    const u = new URL(r.request().url());
    const lat = Number(u.searchParams.get("lat"));
    const lon = Number(u.searchParams.get("lon"));
    await r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        elements: [
          { type: "node", id: 1, lat: lat - 0.002, lon },
          { type: "node", id: 2, lat: lat + 0.002, lon },
          {
            type: "way",
            id: 10,
            nodes: [1, 2],
            tags: { highway: "trunk", ref: "MEX 15", lanes: "2", width: "7.5" },
          },
        ],
      }),
    });
  });
  await page.route("**/api/cesvi/hecho", (r) => {
    const { tipo } = r.request().postDataJSON() as { tipo: "descripcion" | "declaracion" };
    return r.fulfill({
      contentType: "application/json",
      body: JSON.stringify(GRABACION.lecturas[tipo]),
    });
  });
  await page.route("**/api/cesvi/consideraciones", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        texto:
          "1. Se analizará la declaración del conductor.\n\n2. La velocidad de impacto es de 63.15 km/h.",
        numerosNoReconocidos: ["2.40"],
      }),
    }),
  );
  return { soltarOverpass };
}

// El recorrido del perito (docs/cesvi/PROTOTIPO.md): los ocho pasos, de la declaración al dictamen.
test("@flujo /cesvi: el recorrido del perito, del caso al dictamen en PDF", async ({ page }) => {
  test.setTimeout(90_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  const { soltarOverpass } = await sinRedExterna(page);
  await page.goto("/cesvi");
  const frase = page.getByTestId("frase");

  // 1. El caso.
  await expect(frase).toContainText("Siniestro A2010930 de AXA");
  await expect(page.getByTestId("declaracion")).toContainText("reversie unos metros");
  await expect(page.getByTestId("caso-A")).toHaveText("A · Silverado");
  await expect(page.getByTestId("caso-B")).toHaveText("B · Tacoma");

  // 2. El hecho: la declaración se lee al entrar; el perito escribe la descripción técnica.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("paso-2")).toHaveAttribute("aria-current", "step");
  const declarada = page.getByTestId("datos-declarada");
  await expect(declarada).toContainText("reversa");
  await expect(declarada).toContainText("conductor · IA");
  await expect(page.getByTestId("texto-declaracion").locator("mark")).toContainText([
    "reversie unos metros",
  ]);
  await page.getByTestId("entrada-descripcion").fill(DESCRIPCION);
  await page.getByTestId("leer-descripcion").click();
  const evidencia = page.getByTestId("datos-evidencia");
  await expect(evidencia).toContainText("vértice posterior izquierdo");
  await expect(evidencia).toContainText("de atrás hacia adelante");
  await expect(evidencia).toContainText("perito · IA");
  await expect(
    page.getByTestId("texto-descripcion").locator('mark[data-dato="vertice_a"]'),
  ).toHaveText("vértice posterior izquierdo");
  // Las preguntas son técnicas; lo que contesta el perito entra con su fuente.
  const carril = page.getByTestId("pregunta-carril_a");
  await expect(carril).toContainText("¿Carril de A al momento del impacto?");
  await carril.getByRole("button", { name: "Derecho" }).click();
  await expect(evidencia).toContainText("carril derecho");
  await expect(page.getByTestId("pregunta-reversa")).toContainText("¿Cuántos metros de reversa?");
  await page.getByTestId("respuesta-reversa").fill("4");
  await expect(declarada).toContainText("4 m");

  // 3. El lugar: el perito marca el punto de impacto sobre la MEX 15. Overpass sigue retenido: las
  // calles salen del tramo precargado en menos de 1 s.
  await page.getByTestId("siguiente").click();
  await page.getByTestId("coordenadas").fill("25.97385, -109.03543");
  await page.getByRole("button", { name: "Marcar el impacto" }).click();
  const marcado = page.getByTestId("impacto-marcado");
  await expect(marcado).toHaveAttribute("data-ms", /^\d+$/);
  expect(Number(await marcado.getAttribute("data-ms"))).toBeLessThan(1000);
  await page.getByTestId("ver-detalle").click();
  const via = page.getByTestId("via-cercana");
  await expect(via).toContainText("MEX 15");
  await expect(via).toContainText("tramo precargado");
  // Overpass llega después y solo enriquece (el ancho de la vía).
  soltarOverpass();
  await expect(via).toContainText("7.5 m de ancho");
  await expect(via).toContainText("Overpass");
  await page.keyboard.press("Escape");

  // El perito corrige el punto: lo cambia de lugar, deshace, rehace (botones y teclado) y lo quita.
  const punto = page.getByTestId("coordenadas-impacto");
  await expect(punto).toHaveText("25.97385, -109.03543");
  await page.getByTestId("cambiar-ubicacion").click();
  await page.getByTestId("coordenadas-nuevas").fill("25.97600, -109.03390");
  await page.getByRole("button", { name: "Mover el punto" }).click();
  await expect(punto).toHaveText("25.97600, -109.03390");
  await page.getByTestId("deshacer").click();
  await expect(punto).toHaveText("25.97385, -109.03543");
  await page.getByTestId("rehacer").click();
  await expect(punto).toHaveText("25.97600, -109.03390");
  await page.keyboard.press("Control+z");
  await expect(punto).toHaveText("25.97385, -109.03543");
  await page.keyboard.press("Control+Shift+z");
  await expect(punto).toHaveText("25.97600, -109.03390");
  await page.getByRole("button", { name: "Listo" }).click();
  await page.getByTestId("quitar-punto").click();
  await expect(page.getByTestId("coordenadas")).toBeVisible();
  await page.getByTestId("deshacer").click();
  await expect(punto).toHaveText("25.97600, -109.03390");
  await page.getByTestId("restablecer").click();
  await expect(punto).toHaveText("25.97600, -109.03390");

  // 4. Las dos versiones y la zona de restos.
  await page.getByTestId("siguiente").click();
  await expect(page.getByTestId("version-declarada")).toHaveAttribute("aria-selected", "true");
  await expect(frase).toContainText("retrocede 4 m");
  // Cada vehículo con su nombre, cada marca con lo que es, y la leyenda.
  await expect(page.getByTestId("nombre-A")).toHaveText("A · Silverado");
  await expect(page.getByTestId("nombre-B")).toHaveText("B · Tacoma");
  await expect(page.getByTestId("leyenda")).toContainText("A · Silverado");
  await expect(page.getByTestId("leyenda")).toContainText("B · Tacoma");
  await expect(page.getByTestId("marca-A-final")).toHaveText("A · final", { timeout: 10_000 });
  await expect(page.getByTestId("marca-B-inicial")).toHaveText("B · inicial");
  await expect(page.getByTestId("marca-impacto")).toHaveText("✕ impacto");
  await expect(page.getByTestId("marca-restos-inicio")).toHaveText("R1 restos");
  await expect(page.getByTestId("marca-restos-fin")).toHaveText("R2 restos");
  // Al elegir una marca se resalta y dice qué es y de qué versión.
  await page.getByTestId("marca-B-inicial").click();
  await expect(page.getByTestId("marca-B-inicial")).toHaveClass(/marca-elegida/);
  await expect(page.getByTestId("seleccion-mapa")).toContainText("B · Tacoma · posición inicial");
  await expect(page.getByTestId("seleccion-mapa")).toContainText("Versión declarada");
  await expect(page.getByTestId("restos-mapa").locator("[data-valor]")).toHaveAttribute(
    "data-valor",
    "0.00",
  );
  await page.getByTestId("version-evidencia").click();
  await expect(page.getByTestId("restos-mapa").locator("[data-valor]")).toHaveAttribute(
    "data-valor",
    "15.89",
  );

  // 5. Los daños: dónde están contra dónde estarían.
  await page.getByTestId("siguiente").click();
  await expect(page.getByTestId("silueta-real-A")).toHaveAttribute(
    "aria-label",
    /posterior izquierda/,
  );
  await expect(page.getByTestId("silueta-declarada-A")).toHaveAttribute(
    "aria-label",
    /posterior central/,
  );

  // 6. Los números, y el cálculo completo en «Ver cálculo».
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("numero-impacto")).toHaveAttribute("data-valor", "63.15");
  await expect(page.getByTestId("numero-desplazamiento")).toHaveAttribute("data-valor", "60.27");
  await expect(page.getByTestId("conclusion-numeros")).toContainText(
    "Sin diferencia significativa",
  );
  await page.getByTestId("ver-detalle").click();
  const panel = page.getByTestId("panel-detalle");
  await expect(panel.getByText("V3 = 16.74 m/s = 60.27 km/h")).toBeVisible();
  await expect(panel.locator('[data-fila="energia"]')).toContainText("+2.39 %");
  await page.keyboard.press("Escape");

  // 7. La sugerencia, validada por el perito: «Aceptar y seguir» lleva al dictamen.
  await page.getByTestId("siguiente").click();
  await expect(page.getByTestId("sugerencia")).toContainText("no se sostiene");
  await page.getByTestId("perito").fill("Perito de prueba");
  await page.getByTestId("aceptar").click();

  // 8. El dictamen: validado, con vista previa, borrador de consideraciones y descarga.
  await expect(page.getByTestId("paso-8")).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("validacion")).toContainText("Perito de prueba aceptó");
  await expect(page.getByTestId("vista-previa")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("ver-detalle").click();
  await page.getByTestId("pedir-borrador").click();
  await expect(page.getByTestId("estado-borrador")).toContainText("2.40");
  await page.keyboard.press("Escape");
  const descarga = page.waitForEvent("download");
  await page.getByTestId("descargar-pdf").click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe("dictamen-A2010930.pdf");
  expect(
    readFileSync(await archivo.path())
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");

  expect(errores).toEqual([]);
});
