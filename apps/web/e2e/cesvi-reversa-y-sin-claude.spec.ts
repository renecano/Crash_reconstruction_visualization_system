import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { colocarTodo, irAPaso } from "./ayuda-recorrido";

// Como en los demás flujos: la transición entre actos es decorativa y compite con el 3D en CI.
test.use({ reducedMotion: "reduce" });

const MAPA_VACIO = JSON.stringify({
  version: 8,
  sources: {},
  layers: [{ id: "fondo", type: "background", paint: { "background-color": "#eee" } }],
});

/**
 * La lectura grabada de Claude del caso de Yecapixtla (T3.3, `eval/t3_3_reversa.mts`; CI no llama a
 * la API). La narración del reporte no trae la dinámica, así que la reversa entra como la escribiría
 * el perito en «Caso nuevo»: una frase más, y las dos filas de movimiento que la lectura daría de
 * ella (A retrocede, B está detenido), cada una con su cita.
 */
const GRABACION = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/escenas/cesvi-3a0125cb81.json"),
    "utf8",
  ),
) as { narracion: string; salida: { datos: unknown[] } };
const FRASE =
  "El conductor del vehículo A puso en marcha hacia atrás su vehículo sin ver al vehículo B, que estaba detenido detrás de él.";
const REVERSA = {
  narracion: `${GRABACION.narracion} ${FRASE}`,
  salida: {
    datos: [
      ...GRABACION.salida.datos,
      {
        seccion: "movimiento",
        n: 1,
        vehiculo: "V1",
        campo: "maniobra",
        valor: "reversa",
        cita: "puso en marcha hacia atrás su vehículo",
      },
      {
        seccion: "movimiento",
        n: 2,
        vehiculo: "V2",
        campo: "maniobra",
        valor: "se_detiene",
        cita: "estaba detenido detrás de él",
      },
    ],
  },
};

/**
 * Los dos huecos de prueba que marcó la auditoría del 2026-11-15 (I10): la reversa y el camino de
 * falla de Claude. Son cortas: cada una protege un mensaje que el perito lee.
 */
test("@flujo /cesvi: un vehículo en reversa dice a qué velocidad se supone y de dónde sale", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.route("https://tiles.openfreemap.org/**", (r) =>
    r.fulfill({ contentType: "application/json", body: MAPA_VACIO }),
  );
  await page.route("**/api/cesvi/escena", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ metodo: "claude", salida: REVERSA.salida }),
    }),
  );
  // Un caso nuevo con la narración del perito: quien retrocede lo dice la lectura.
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await expect(page.getByTestId("recorrido-caso")).toHaveAttribute("data-origen", "nuevo");
  await irAPaso(page, 2);
  await page.getByTestId("narracion").fill(REVERSA.narracion);
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("2 vehículos");
  await irAPaso(page, 3);
  await colocarTodo(page);
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 60_000 });
  // El supuesto va dicho con su valor, su rango y su fuente (ADR 0136): no es una velocidad medida.
  const limites = page.getByTestId("limites");
  await expect(limites).toContainText("va en reversa");
  await expect(limites).toContainText("5.68 km/h");
  await expect(limites).toContainText("NHTSA");
  expect(errores).toEqual([]);
});

test("@flujo /cesvi: si Claude no está disponible, el perito lee por qué y conserva su narración", async ({
  page,
}) => {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  let pedidos = 0;
  // Lo que responde la ruta cuando no queda tope de gasto (ADR 0140): 200 con el motivo.
  await page.route("**/api/cesvi/escena", (r) => {
    pedidos++;
    return r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        metodo: "no_disponible",
        motivo: "Se alcanzó el tope de gasto diario de la API de Claude.",
      }),
    });
  });
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await expect(page.getByTestId("recorrido-caso")).toHaveAttribute("data-origen", "nuevo");
  await irAPaso(page, 2);
  await page.getByTestId("ejemplo-narracion").click();
  const narracion = page.getByTestId("narracion");
  await expect(narracion).toHaveValue(/vehículo A, marca VW, tipo Jetta/);
  // Un ejemplo sin cambios usa su lectura guardada y no llama a Claude (ronda 2, C): con una frase
  // más ya es la narración del perito, y se manda a leer.
  await narracion.fill(
    `${await narracion.inputValue()} El vehículo A circulaba con las luces encendidas.`,
  );
  await page.getByTestId("leer-narracion").click();
  await expect(
    page.getByTestId("panel-paso").getByRole("status").filter({ hasText: "No se pudo leer" }),
  ).toHaveText(
    "No se pudo leer con Claude (Se alcanzó el tope de gasto diario de la API de Claude.).",
  );
  expect(pedidos).toBe(1);
  // No se inventa una escena y la narración sigue ahí para volver a intentar.
  await expect(page.getByTestId("escena")).toHaveCount(0);
  await expect(narracion).toHaveValue(/vehículo A, marca VW, tipo Jetta/);
  expect(errores).toEqual([]);
});
