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
  // Completitud, la frase que respalda cada dato y «por qué importa» (ADR 0057).
  await expect(page.getByTestId("completitud")).toHaveText("9/9");
  await expect(page.getByTestId("frase-vertice_a")).toHaveText("«vértice posterior izquierdo»");
  await expect(page.getByTestId("por-que-carril_a")).toContainText("Por qué importa");
  // «Llenar a mano»: el formulario por si la IA no está disponible.
  await page.getByTestId("llenar-a-mano").click();
  await expect(page.getByTestId("panel-manual")).toBeVisible();
  await page.keyboard.press("Escape");

  // 3. El lugar: el perito marca el punto de impacto sobre la MEX 15. Overpass sigue retenido: las
  // calles salen del tramo precargado en menos de 1 s.
  await page.getByTestId("siguiente").click();
  // El reporte de CESVI no da coordenadas: la ubicación ilustrativa del km 47+800 (ADR 0056).
  await expect(page.getByTestId("ubicacion-ilustrativa")).toContainText("26.20915, -109.05970");
  await page.getByTestId("usar-ilustrativa").click();
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
  await expect(punto).toHaveText("26.20915, -109.05970");
  await expect(page.getByTestId("aviso-ilustrativa")).toContainText("Ubicación ilustrativa");
  await page.getByTestId("cambiar-ubicacion").click();
  await page.getByTestId("coordenadas-nuevas").fill("26.22848, -109.05424");
  await page.getByRole("button", { name: "Mover el punto" }).click();
  await expect(punto).toHaveText("26.22848, -109.05424");
  // Movido por el perito, deja de ser la ubicación ilustrativa.
  await expect(page.getByTestId("aviso-ilustrativa")).toHaveCount(0);
  await page.getByTestId("deshacer").click();
  await expect(punto).toHaveText("26.20915, -109.05970");
  await page.getByTestId("rehacer").click();
  await expect(punto).toHaveText("26.22848, -109.05424");
  await page.keyboard.press("Control+z");
  await expect(punto).toHaveText("26.20915, -109.05970");
  await page.keyboard.press("Control+Shift+z");
  await expect(punto).toHaveText("26.22848, -109.05424");
  await page.getByRole("button", { name: "Listo" }).click();
  await page.getByTestId("quitar-punto").click();
  await expect(page.getByTestId("coordenadas")).toBeVisible();
  await page.getByTestId("deshacer").click();
  await expect(punto).toHaveText("26.22848, -109.05424");
  await page.getByTestId("restablecer").click();
  await expect(punto).toHaveText("26.22848, -109.05424");

  // 4. La reconstrucción de Croquis, por defecto; la declaración es una capa opcional, apagada.
  await page.getByTestId("siguiente").click();
  await expect(frase).toContainText("Reconstrucción de Croquis");
  await expect(page.getByTestId("version-declarada")).toHaveCount(0);
  await expect(page.getByTestId("comparar-declaracion")).not.toBeChecked();
  await expect(page.getByTestId("restos-mapa").locator("[data-valor]")).toHaveAttribute(
    "data-valor",
    "15.89",
  );
  await page.getByTestId("comparar-declaracion").check();
  await page.getByTestId("version-declarada").click();
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

  // Modo Trabajar (ADR 0057): los mismos datos, con herramientas, el objeto elegido, la línea de
  // tiempo con velocidades y qué cambia entre versiones; tema claro por defecto al trabajar.
  const recorrido = page.getByTestId("recorrido");
  await expect(recorrido).toHaveAttribute("data-tema", "oscuro");
  await page.getByTestId("modo-trabajar").click();
  await expect(recorrido).toHaveAttribute("data-modo", "trabajar");
  await expect(recorrido).toHaveAttribute("data-tema", "claro");
  await expect(page.getByTestId("resumen-cambios")).toHaveText(
    "3 de 4 no coinciden con la versión declarada.",
  );
  await page.getByTestId("herramienta-A").click();
  await expect(page.getByTestId("panel-objeto")).toContainText("A · Silverado");
  await expect(page.getByTestId("panel-objeto")).toContainText("posición final");
  await expect(page.getByTestId("eventos")).toContainText("Impacto");
  await page.getByTestId("velocidad-0.25").click();
  await expect(page.getByTestId("velocidad-0.25")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("velocidad-1").click();
  await page.getByTestId("vista-lado").click();
  await expect(page.getByTestId("mapa-trabajo-declarada")).toBeVisible();
  await expect(page.getByTestId("mapa-trabajo-evidencia")).toBeVisible();
  // El tema se cambia con el interruptor y se recuerda por modo.
  await page.getByTestId("tema").click();
  await expect(recorrido).toHaveAttribute("data-tema", "oscuro");
  await page.getByTestId("tema").click();
  await expect(recorrido).toHaveAttribute("data-tema", "claro");
  await page.getByTestId("modo-presentar").click();
  await expect(recorrido).toHaveAttribute("data-tema", "oscuro");

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

  // 7. Croquis contra el reporte de CESVI: punto por punto, con la diferencia en %; la comparación con la
  // declaración va plegada, y su sugerencia solo aparece si el perito la pide.
  await page.getByTestId("siguiente").click();
  await expect(page.getByTestId("titulo-contra")).toHaveText("Croquis contra el reporte de CESVI");
  const contra = page.getByTestId("contra-dictamen");
  await expect(contra.locator('[data-fila="modalidad"]')).toContainText("Coincide");
  await expect(contra.locator('[data-fila="restos"]')).toContainText("60.27 km/h");
  await expect(contra.locator('[data-fila="deformacion"]')).toContainText("63.15 km/h");
  await expect(page.getByTestId("discrepancia-energia")).toContainText("2.39 %");
  await expect(page.getByTestId("sugerencia")).toHaveCount(0);
  await page.getByTestId("comparacion-declaracion").locator("summary").click();
  await page.getByTestId("ver-sugerencia").click();
  await expect(page.getByTestId("sugerencia")).toContainText("Es una sugerencia");
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
  // Word, caso JSON, antes de firmar y trazabilidad (ADR 0057).
  const word = page.waitForEvent("download");
  await page.getByTestId("descargar-word").click();
  const docx = await word;
  expect(docx.suggestedFilename()).toBe("dictamen-A2010930.docx");
  expect(
    readFileSync(await docx.path())
      .subarray(0, 2)
      .toString(),
  ).toBe("PK");
  const json = page.waitForEvent("download");
  await page.getByTestId("descargar-json").click();
  const casoJson = JSON.parse(readFileSync(await (await json).path(), "utf8")) as { caso: string };
  expect(casoJson.caso).toBe("A2010930");
  await expect(page.getByTestId("antes-de-firmar")).toContainText("2.39 %");
  await expect(page.getByTestId("trazabilidad")).toContainText("Perito de prueba");

  expect(errores).toEqual([]);
});
