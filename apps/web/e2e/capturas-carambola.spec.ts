import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./base";
import { contestarC1, irAPaso, mapaFacil, sinRed, tocarEnMetros } from "./ayuda-recorrido";

test.use({ reducedMotion: "reduce" });

/** La carambola de la e2e, guardada como caso (René, 2026-11-25: la causa de «línea base distinta»). Solo la corre el flujo «Capturas». */
const SALIDA = process.env.CROQUIS_CAPTURAS ?? "capturas-carambola";

const CARAMBOLA = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/carambola/carambola-e2e.json"),
    "utf8",
  ),
) as { narracion: string; salida: unknown };

test("capturas de la carambola: el caso guardado", async ({ page }) => {
  // Acerca el mapa, coloca dos impactos y tres finales, reconstruye y abre el 3D.
  test.setTimeout(180_000);
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
      body: JSON.stringify({ metodo: "claude", salida: CARAMBOLA.salida }),
    }),
  );
  await page.goto("/cesvi/casos/nuevo");
  await irAPaso(page, 2);

  // 1. La narración del perito, con la secuencia: A contra B y, por el empuje, B contra C.
  await page.getByTestId("narracion").fill(CARAMBOLA.narracion);
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("3 vehículos · 2 impactos");

  await sinRed(page);
  await irAPaso(page, 3);
  // 2. La escena fácil, a metros: los tres en fila hacia el oriente, B y C detenidos en el semáforo;
  // la misma disposición que la escena canónica `carambola`. Un paso por choque y por vehículo.
  const pregunta = page.getByTestId("escena-pregunta");
  const mapaEscena = await mapaFacil(page);
  const caja = (await mapaEscena.boundingBox())!;
  await expect(pregunta).toHaveText("¿Dónde fue el primer choque?");
  await mapaEscena.click({ position: { x: caja.width * 0.62, y: caja.height * 0.45 } });
  await expect(pregunta).toHaveText("¿Dónde fue el segundo choque?");
  await tocarEnMetros(page, "choque-1", 5.6, 0);
  await expect(page.getByTestId("choque-2")).toHaveCount(1);
  // A venía del oeste (avanzaba al oriente); de B y C se acepta lo que propone Croquis por sus zonas
  // de contacto. Cada uno quedó a lo largo de la calle.
  for (const [nombre, este] of [
    ["V1", -0.5],
    ["V2", 5.4],
    ["V3", 9.8],
  ] as const) {
    await expect(pregunta).toHaveText(/^¿Por dónde venía el /);
    await (
      nombre === "V1"
        ? page.locator('[data-testid^="opcion-flecha-"]', { hasText: "Del oeste" })
        : page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]')
    ).click();
    await expect(pregunta).toHaveText("¿Dónde quedó después del choque?");
    await tocarEnMetros(page, "choque-1", este, 0);
    await expect(page.getByTestId(`coche-${nombre}-final`)).toHaveCount(1);
    await page.getByTestId("listo-final").click();
  }
  await contestarC1(page);
  await expect(page.getByTestId("escena-lista")).toBeVisible();
  await expect(page.getByTestId("avance-ver-reconstruccion")).toBeEnabled();

  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 60_000 });
  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(
    join(SALIDA, "cifra.txt"),
    await page.getByTestId("cifra-reconstruccion").innerText(),
  );
  await page.screenshot({ path: join(SALIDA, "reconstruccion.png") });
  await irAPaso(page, 9);
  const descarga = page.waitForEvent("download");
  await page.getByTestId("guardar-caso").click();
  const archivo = await descarga;
  writeFileSync(join(SALIDA, "carambola.croquis.json"), readFileSync(await archivo.path()));
});
