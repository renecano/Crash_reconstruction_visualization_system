import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { colocarTodo, irAPaso, sinIdentificadoresDeFuente } from "./ayuda-recorrido";

/**
 * El caso de AXA A2010930 en el mismo recorrido que cualquier caso (V2-4, ADR 0080): sus vehículos,
 * su narración, el lugar, la reconstrucción con la declaración del conductor ya escrita, la
 * verificación y el método de CESVI con los números del reporte, y el dictamen.
 */
test("@flujo /cesvi: el caso de AXA desde la lista, del caso al dictamen en PDF", async ({
  page,
}) => {
  test.setTimeout(150_000);
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

  // El caso de AXA es un caso de ejemplo de la lista (ADR 0079).
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page).toHaveURL(/\/cesvi\/casos\/a2010930$/);
  const recorrido = page.getByTestId("recorrido-caso");
  await expect(recorrido).toHaveAttribute("data-origen", "ejemplo");

  // 1. El caso: los dos vehículos con su silueta, la masa de la Tacoma y lo que ya está.
  await expect(page.getByTestId("titulo-caso")).toHaveText("AXA · A2010930");
  await expect(page.getByTestId("tarjeta-V1")).toContainText("Silverado");
  await expect(page.getByTestId("tarjeta-V2")).toContainText("Tacoma");
  await expect(page.getByTestId("tarjeta-V2")).toContainText("1,431.083 kg");
  // La masa sale del reporte y lo dice así, no con el identificador interno de la fuente.
  await expect(page.getByTestId("tarjeta-V2").locator("[data-fuente]")).toHaveText("del reporte");
  await sinIdentificadoresDeFuente(page);
  await expect(page.getByTestId("avance-caso")).toHaveAttribute("data-avance", "2/4");
  // Los pasos futuros esperan: el paso 4 no se abre sin el lugar.
  await expect(page.getByTestId("paso-4")).toBeDisabled();

  // 2. El hecho: la narración del ejemplo, ya leída (el caso trae su expediente).
  await irAPaso(page, 2);
  await expect(page.getByTestId("narracion-texto")).not.toBeEmpty();
  await expect(page.getByTestId("vehiculos")).toContainText("Tacoma");

  // 3. El lugar: el mapa abre en la ubicación ilustrativa; se coloca lo que pide la lista.
  await irAPaso(page, 3);
  await expect(page.getByTestId("dialogo-buscar-lugar")).toHaveCount(0);
  await expect(page.getByTestId("siguiente")).toBeDisabled();
  await colocarTodo(page);
  await sinIdentificadoresDeFuente(page);

  // 4. La reconstrucción, y la declaración del conductor ya escrita para compararla.
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("velocidades")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("abrir-declaracion").click();
  await expect(page.getByTestId("texto-declaracion")).toHaveValue(/revers/);

  // 5. Los daños, con la correspondencia del método de CESVI.
  await irAPaso(page, 5);
  await expect(page.getByTestId("criterios-axa")).toBeVisible();

  // 6. Los números: la verificación con las medidas del reporte reproduce la EBS de la Tacoma.
  await irAPaso(page, 6);
  await expect(page.getByTestId("verificacion-cesvi")).toContainText("63.90 km/h");

  // 7. Contra el reporte de CESVI: la misma modalidad y cada número del reporte con el de Croquis,
  // su diferencia y su porcentaje.
  await irAPaso(page, 7);
  await expect(page.getByTestId("eje-modalidad")).toContainText("coincide");
  const tabla = page.getByTestId("reproduccion");
  await expect(tabla.locator('[data-fila="ebs_kmh_reporte"]')).toContainText("63.15");
  await expect(tabla.locator('[data-fila="v3_kmh"]')).toContainText("60.27");
  await expect(tabla.locator('[data-fila="energia"]')).toContainText("2.39");

  // 8. El dictamen, en PDF.
  await irAPaso(page, 8);
  const descarga = page.waitForEvent("download");
  await page.getByTestId("descargar-dictamen-pdf").click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe("dictamen-reconstruccion-borrador.pdf");
  expect(
    readFileSync(await archivo.path())
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");
  expect(errores).toEqual([]);
});
