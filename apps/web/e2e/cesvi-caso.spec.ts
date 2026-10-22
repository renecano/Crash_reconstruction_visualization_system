import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * La lectura grabada de Claude de la narración de ejemplo (E-R1; CI no llama a la API). Es la misma
 * que trae la página como ejemplo.
 */
const GRABACION = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { salida: unknown };

test("@flujo /cesvi/caso: de la narración del perito al mapa y a la escena", async ({ page }) => {
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
  await page.goto("/cesvi/caso");

  // 1. La narración: la de ejemplo, leída a escena.
  await page.getByTestId("ejemplo-narracion").click();
  await expect(page.getByTestId("narracion")).toHaveValue(/vehículo A, marca VW, tipo Jetta/);
  await page.getByTestId("leer-narracion").click();
  const escena = page.getByTestId("escena");
  await expect(escena).toContainText("2 vehículos · 1 impacto");
  await expect(page.getByTestId("vehiculos")).toContainText("V1 · VW Jetta 2002");
  await expect(page.getByTestId("impactos")).toContainText("supuesto");
  await expect(page.getByTestId("validez")).toHaveText("La escena es válida contra el contrato.");

  // 2. Lo que más cambia la reconstrucción: el impacto supuesto se confirma; una masa con «No sé».
  await page.getByTestId("confirmar-impacto").click();
  await expect(page.getByTestId("impactos")).not.toContainText("supuesto");
  await expect(page.getByTestId("impactos")).toContainText("perito");
  await page.getByTestId("no-se-masa-V1").click();
  await expect(page.getByTestId("pregunta-masa-V1")).toHaveCount(0);
  await page.getByTestId("valor-masa-V2").fill("1450");
  await page.getByTestId("pregunta-masa-V2").getByRole("button", { name: "Usar" }).click();
  await expect(page.getByTestId("vehiculos")).toContainText("1450 kg");

  // 3. El mapa: primero se acerca (doble clic; sin rumbo, un clic no coloca nada) para que las
  // posiciones queden a metros. Luego V1 y V2 en el impacto y en su posición final, con su rumbo.
  const mapa = page.getByTestId("mapa-escena");
  await expect(mapa.locator("canvas")).toBeVisible({ timeout: 20_000 });
  for (let k = 0; k < 7; k++) {
    await mapa.dblclick({ position: { x: 300, y: 200 } });
    await page.waitForTimeout(400);
  }
  await expect(page.getByTestId("colocados")).toHaveText("0 posiciones colocadas por el perito.");
  const colocar = async (herramienta: string, rumbo: string, x: number, y: number) => {
    await page.getByTestId("herramienta-escena").selectOption(herramienta);
    await page.getByTestId("rumbo-escena").fill(rumbo);
    await mapa.click({ position: { x, y } });
  };
  await colocar("V1:final", "315", 330, 170);
  await expect(page.getByTestId("colocados")).toHaveText("1 posición colocada por el perito.");
  await expect(page.getByTestId("pregunta-final-V1")).toHaveCount(0);
  await colocar("V1:impacto", "0", 300, 205);
  await colocar("V2:impacto", "90", 305, 200);
  await colocar("V2:final", "80", 345, 185);
  await expect(page.getByTestId("colocados")).toHaveText("4 posiciones colocadas por el perito.");
  await expect(page.getByTestId("validez")).toHaveText("La escena es válida contra el contrato.");

  // 4. La reconstrucción física: las posiciones del perito fijan las velocidades, con percentiles,
  // y al lado la verificación CESVI dice qué le falta.
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("velocidades")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("velocidad-V1")).toContainText(/\d+\.\d \(/);
  await expect(page.getByTestId("evidencia-usada")).toContainText("posición final de V1");
  await expect(page.getByTestId("verificacion-cesvi")).toContainText("Falta:");

  // 5. La escena, descargada: contrato 2.0.0 con lo que marcó el perito.
  const descarga = page.waitForEvent("download");
  await page.getByTestId("descargar-escena").click();
  const archivo = await descarga;
  const d = JSON.parse(readFileSync(await archivo.path(), "utf8")) as {
    expediente: {
      impactos: { fuente: string }[];
      versiones: {
        tipo: string;
        posiciones: { vehiculo: string; fase: string; fuente: string; rumbo: number }[];
      }[];
    };
  };
  expect(d.expediente.impactos[0]!.fuente).toBe("perito");
  const posiciones = d.expediente.versiones[0]!.posiciones;
  expect(posiciones).toHaveLength(4);
  expect(posiciones.every((p) => p.fuente === "perito")).toBe(true);
  expect(posiciones.find((p) => p.vehiculo === "V1" && p.fase === "final")!.rumbo).toBe(315);
  expect(errores).toEqual([]);
});
