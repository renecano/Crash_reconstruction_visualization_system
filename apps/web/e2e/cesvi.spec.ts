import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { colocarTodo, irAPaso, sinIdentificadoresDeFuente } from "./ayuda-recorrido";

// La transición entre actos (ADR 0108) es decorativa: estos flujos prueban la función, y en CI (render
// por software) la cortina a pantalla completa compite con el 3D. Con movimiento reducido no se monta.
test.use({ reducedMotion: "reduce" });

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
  // La lista de casos: la línea de estado es real y las cifras de AXA son las de «Contra CESVI».
  await expect(page.getByTestId("estado-casos")).toContainText("7 reportes de CESVI de ejemplo");
  await expect(page.getByTestId("ultimo-pct")).toHaveText("1.2 %");
  await expect(page.getByTestId("ultimo-cifras")).toContainText("63.90 contra 63.15 km/h");
  await page.getByTestId("ir-axa").click();
  await expect(page).toHaveURL(/\/cesvi\/casos\/a2010930(\/hecho)?$/);
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
  await expect(page.getByTestId("relato")).toContainText("Tacoma");
  await expect(page.getByTestId("titulo-hecho")).toHaveText(
    "Alcance en la carretera México-Nogales, km 47+800",
  );
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
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 60_000 });
  // Cada velocidad con su método (prompt del rediseño §0.2).
  await expect(page.getByTestId("metodo-velocidades")).toContainText(
    "Reconstrucción física de Croquis",
  );
  await page.getByTestId("ver-detalle-reconstruccion").click();
  await page.getByTestId("abrir-declaracion").click();
  await expect(page.getByTestId("texto-declaracion")).toHaveValue(/revers/);

  // Los tooltips también salen con el foco de teclado (§9).
  await page.getByTestId("percentil-p50").focus();
  await expect(page.getByTestId("tooltip")).toContainText("La mitad queda abajo");
  await page.getByTestId("percentil-p50").blur();
  await expect(page.getByTestId("tooltip")).toHaveCount(0);

  // Presentar: a pantalla completa, capítulos con ← →, y Esc regresa a Trabajar.
  await page.getByTestId("modo-presentar").click();
  const presentar = page.getByTestId("presentar-caso");
  await expect(presentar).toBeVisible();
  await expect(page.getByTestId("aviso-apoyo")).toContainText("el dictamen es del perito");
  await page.getByTestId("capitulo-contra").click();
  await expect(page.getByTestId("capitulo-titulo")).toHaveText("Contra CESVI");
  await expect(page.getByTestId("capitulo-datos")).toContainText("63.90 km/h");
  await expect(page.getByTestId("capitulo-datos")).toContainText("63.15 km/h");
  await expect(page.getByTestId("capitulo-datos")).toContainText("1.2 %");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("capitulo-titulo")).toHaveText("Posiciones finales");
  await page.keyboard.press("Escape");
  await expect(presentar).toHaveCount(0);
  await expect(recorrido).toHaveAttribute("data-modo", "trabajar");

  // 5. Los daños, con la correspondencia del método de CESVI.
  await irAPaso(page, 5);
  await expect(page.getByTestId("criterios-axa")).toBeVisible();
  // §0.1: el perfil medido de V2 del reporte; V1 sin medida dice «sin dato»; la energía y el Δv de
  // la reconstrucción ya no salen en 0.
  await expect(page.getByTestId("dano-medido-V2")).toContainText("96 · 86 · 52 · 20 cm");
  await expect(page.getByTestId("dano-medido-V1")).toContainText("sin dato");
  await expect(page.getByTestId("dano-calculado-V2")).toContainText("kJ", { timeout: 60_000 });
  await expect(page.getByTestId("dano-calculado-V2")).not.toContainText(" 0.0 kJ");
  // Lo que el reporte no trae va como supuesto declarado, con su justificación (ADR 0091).
  await expect(page.getByTestId("supuestos")).toContainText(
    "Ficha técnica de Chevrolet Silverado 2500 2007",
  );
  // Los criterios se marcan con tres opciones y se cuentan; volver a tocar quita la marca.
  await expect(page.getByTestId("contador-criterios")).toContainText("0 de");
  const forma = page.getByTestId("criterio-A-forma");
  await forma.getByRole("button", { name: "Corresponde", exact: true }).click();
  await expect(page.getByTestId("contador-criterios")).toContainText("1 de");
  // El perfil medido de la Tacoma se ve al cambiar de pestaña.
  await page.getByTestId("pestana-dano-V2").click();
  await expect(page.getByTestId("dano-V2").getByTestId("perfil-deformacion")).toBeVisible();
  // A no trae medidas: no se dibuja un perfil que parezca observado.
  await expect(page.getByTestId("dano-V1").getByTestId("perfil-deformacion")).toHaveCount(0);

  // 6. Los números: la verificación con las medidas del reporte reproduce la EBS de la Tacoma.
  await irAPaso(page, 6);
  await expect(page.getByTestId("verificacion-cesvi")).toContainText("63.90 km/h");
  await expect(page.getByTestId("metodo-verificacion")).toContainText("Método de CESVI");

  // 7. Contra el reporte de CESVI: la misma modalidad y cada número del reporte con el de Croquis,
  // su diferencia y su porcentaje.
  await irAPaso(page, 7);
  await expect(page.getByTestId("eje-modalidad")).toHaveAttribute("data-estado", "coincide");
  await expect(page.getByTestId("cifra-contra-croquis")).toHaveText("63.90");
  await expect(page.getByTestId("cifra-contra-cesvi")).toHaveText("63.15");
  await expect(page.getByTestId("cifra-contra-pct")).toHaveText("1.2 %");
  await expect(page.getByTestId("cifra-contra-kmh")).toContainText("0.75 km/h");
  await expect(page.getByTestId("eje-posiciones")).toContainText("Sin dato en el reporte");
  await expect(page.getByTestId("citas-contra")).toContainText("«");
  const tabla = page.getByTestId("reproduccion");
  await expect(tabla.locator('[data-fila="ebs_kmh_reporte"]')).toContainText("63.15");
  await expect(tabla.locator('[data-fila="v3_kmh"]')).toContainText("60.27");
  await expect(tabla.locator('[data-fila="energia"]')).toContainText("2.39");

  // 8. El dictamen, en PDF.
  await irAPaso(page, 8);
  // §0.5: un solo título en el paso del dictamen.
  await expect(
    page.getByTestId("panel-paso").getByRole("heading", { name: /dictamen/i }),
  ).toHaveCount(1);
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
