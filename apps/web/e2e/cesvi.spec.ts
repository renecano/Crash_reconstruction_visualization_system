import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { irAPaso, sinIdentificadoresDeFuente } from "./ayuda-recorrido";

// La transición entre actos (ADR 0108) es decorativa: estos flujos prueban la función, y en CI (render
// por software) la cortina a pantalla completa compite con el 3D. Con movimiento reducido no se monta.
test.use({ reducedMotion: "reduce" });

/**
 * El caso de AXA A2010930 en el mismo recorrido que cualquier caso (V2-4, ADR 0080): sus vehículos,
 * su narración, el lugar, la reconstrucción con la declaración del conductor ya escrita, la
 * verificación y el método de CESVI con los números del reporte, y el dictamen.
 */
/**
 * La lectura física de V2 en AXA, leída de `eval/results` (nunca a mano): la escena ya viene colocada
 * y siempre da lo mismo. La cifra del reporte sale de los datos del caso.
 */
const V2 = (() => {
  const raiz = resolve(__dirname, "../../..");
  const leer = <T>(ruta: string) => JSON.parse(readFileSync(join(raiz, ruta), "utf8")) as T;
  const { filas } = leer<{
    filas: { es_la_de_la_app: boolean; V2: { mejor: number; p10: number; p90: number } }[];
  }>("eval/results/axa_rango_estable.json");
  const m = filas.find((f) => f.es_la_de_la_app)!.V2;
  const cesvi = leer<{
    calculos: { deformacion_B: { reporte: { ebs_kmh: { valor: number } } } };
  }>("data/cesvi/casos/A2010930.json").calculos.deformacion_B.reporte.ebs_kmh.valor;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const signo = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;
  return {
    texto: m.mejor.toFixed(2),
    rango: `${m.p10.toFixed(2)}–${m.p90.toFixed(2)}`,
    cesvi: cesvi.toFixed(2),
    difKmh: signo(r2(m.mejor - cesvi)),
    difPct: signo(r2((100 * (m.mejor - cesvi)) / cesvi)),
  };
})();

async function textoDelPdf(bytes: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
    .promise;
  let t = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const c = await (await doc.getPage(p)).getTextContent();
    t += ` ${c.items.map((i) => ("str" in i ? i.str : "")).join(" ")}`;
  }
  return t.replace(/\s+/g, " ");
}

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
  await expect(page.getByTestId("ultimo-pct")).toHaveText("+1.19 %");
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
  // AXA ya viene con su escena colocada: la reconstrucción se abre sin contestar nada.
  await expect(page.getByTestId("paso-4")).toBeEnabled();

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
  await expect(page.getByTestId("escena-lista")).toBeVisible();
  await expect(page.getByTestId("siguiente")).toBeEnabled();
  await sinIdentificadoresDeFuente(page);

  // 4. La reconstrucción, y la declaración del conductor ya escrita para compararla.
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 60_000 });
  // Cada velocidad con su método (prompt del rediseño §0.2).
  await expect(page.getByTestId("metodo-velocidades")).toContainText(
    "Reconstrucción física de Croquis",
  );
  // Un número por cantidad: la cifra grande es el mejor ajuste, el de eval/results. La mediana de
  // las simulaciones va aparte, con su nombre, y el histograma marca dónde cae el mejor ajuste.
  await expect(page.getByTestId("cifra-reconstruida")).toHaveText(V2.texto);
  await expect(page.getByTestId("cifra-rango")).toHaveText(`rango ${V2.rango}`);
  await expect(page.getByTestId("metodo-cifra")).toContainText("mejor ajuste");
  await expect(page.getByTestId("fila-mediana")).toHaveText(/^\d+\.\d\d km\/h$/);
  await expect(page.getByTestId("marca-mejor-ajuste")).toHaveAttribute(
    "data-tip",
    `Mejor ajuste: ${V2.texto} km/h`,
  );
  await page.getByTestId("ver-detalle-reconstruccion").click();
  await page.getByTestId("abrir-declaracion").click();
  await expect(page.getByTestId("texto-declaracion")).toHaveValue(/revers/);

  // Los tooltips también salen con el foco de teclado (§9).
  const impacto = page.getByTestId("maqueta-impacto");
  await impacto.focus();
  await expect(page.getByTestId("tooltip")).toContainText("Impacto · t 0.00 s");
  await impacto.blur();
  await expect(page.getByTestId("tooltip")).toHaveCount(0);

  // Presentar: a pantalla completa, capítulos con ← →, y Esc regresa a Trabajar.
  await page.getByTestId("modo-presentar").click();
  const presentar = page.getByTestId("presentar-caso");
  await expect(presentar).toBeVisible();
  await expect(page.getByTestId("aviso-apoyo")).toContainText("el dictamen es del perito");
  await page.getByTestId("capitulo-impacto").click();
  await expect(page.getByTestId("capitulo-datos")).toContainText(`${V2.texto} km/h`);
  await expect(page.getByTestId("capitulo-datos")).toContainText(V2.rango);
  await page.getByTestId("capitulo-contra").click();
  await expect(page.getByTestId("capitulo-titulo")).toHaveText("Contra CESVI");
  // Las dos lecturas (T3.4), cada una con su nombre, y por qué difieren.
  const datosContra = page.getByTestId("capitulo-datos");
  await expect(datosContra).toContainText("Método de CESVI con los datos del reporte");
  await expect(datosContra).toContainText("+1.19 %");
  await expect(datosContra).toContainText("63.90 contra 63.15 km/h");
  await expect(datosContra).toContainText("Reconstrucción física de Croquis");
  await expect(datosContra).toContainText(
    `${V2.texto} (${V2.rango}) contra ${V2.cesvi} km/h · ${V2.difKmh} km/h`,
  );
  await expect(datosContra).toContainText(`${V2.difPct} %`);
  await expect(page.getByTestId("capitulo-nota")).toContainText("la masa de B sola");
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
  await expect(page.getByTestId("lectura-cesvi")).toContainText(
    "Método de CESVI con los datos del reporte",
  );
  await expect(page.getByTestId("cifra-contra-pct")).toHaveText("+1.19 %");
  await expect(page.getByTestId("cifra-contra-kmh")).toContainText("+0.75 km/h");
  await expect(page.getByTestId("cifra-contra-nota")).toContainText("60.27 contra 60.27 km/h");
  // La segunda lectura (T3.4): la del solver, con su diferencia, y la misma cifra del reporte.
  await expect(page.getByTestId("lectura-fisica")).toContainText(
    "Reconstrucción física de Croquis",
  );
  // Es exactamente lo que mide la evaluación (la escena de AXA ya viene colocada).
  await expect(page.getByTestId("fisica-croquis")).toHaveText(V2.texto);
  await expect(page.getByTestId("fisica-rango")).toHaveText(`rango ${V2.rango}`);
  await expect(page.getByTestId("fisica-cesvi")).toHaveText("63.15");
  await expect(page.getByTestId("fisica-kmh")).toContainText(`${V2.difKmh} km/h`);
  await expect(page.getByTestId("fisica-pct")).toHaveText(`${V2.difPct} %`);
  const porQue = page.getByTestId("por-que-difieren");
  await expect(porQue).toContainText("la masa de B sola");
  await expect(porQue).toContainText("el momento de los dos vehículos");
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
  const bytesPdf = readFileSync(await archivo.path());
  expect(bytesPdf.subarray(0, 5).toString()).toBe("%PDF-");
  // En el PDF, las dos lecturas: la misma cifra de la evaluación y la de CESVI con sus datos.
  const pdf = await textoDelPdf(bytesPdf);
  expect(pdf).toContain(`${V2.texto} (${V2.rango})`);
  expect(pdf).toContain(`${V2.difKmh} km/h (${V2.difPct} %)`);
  expect(pdf).toContain("Método de CESVI con los datos del reporte");
  expect(pdf).toContain("+1.19 %");
  expect(errores).toEqual([]);
});
