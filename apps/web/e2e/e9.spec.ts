import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { simularApi } from "./api-simulada";

/**
 * E9 (F11): la sesión de usabilidad anota solo momentos de eventos y el SUS, y el archivo que se
 * descarga no lleva texto del relato.
 */
test("sesión de E9: del inicio a la primera reconstrucción, SUS y descarga sin texto", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/e9");
  await expect(page.getByTestId("e9-iniciar")).toBeDisabled();
  await page.getByTestId("e9-codigo").fill("p07");
  await page.getByTestId("e9-consentimiento").check();
  await page.getByTestId("e9-iniciar").click();
  await expect(page.getByTestId("e9-activa")).toContainText("P07");

  // La persona arma una escena en el croquis y la ve en 3D.
  await page.goto("/croquis");
  await page.getByTestId("ver-3d").click();
  await expect(page).toHaveURL(/\/visor\?escena=propia/);
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          JSON.parse(localStorage.getItem("croquis:e9") ?? "{}") as { eventos?: { tipo: string }[] }
        ).eventos?.some((e) => e.tipo === "reconstruccion_visible"),
      ),
    )
    .toBe(true);

  await page.goto("/e9");
  for (let i = 1; i <= 10; i++) await page.getByTestId(`e9-sus-${i}-${i % 2 ? 4 : 2}`).click();
  await page.getByTestId("e9-terminar").click();
  await expect(page.getByTestId("e9-resumen")).toContainText("SUS");
  await expect(page.getByTestId("e9-resumen")).toContainText("75");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("e9-descargar").click(),
  ]);
  expect(download.suggestedFilename()).toBe("e9-P07.json");
  const doc = JSON.parse(readFileSync(await download.path(), "utf-8")) as Record<string, unknown>;
  expect(Object.keys(doc).sort()).toEqual(
    ["eventos", "inicio", "participante", "sus", "terminada", "version"].sort(),
  );
  for (const e of doc.eventos as Record<string, unknown>[]) {
    expect(Object.keys(e).sort()).toEqual(["t", "tipo"]);
  }

  await page.getByTestId("e9-borrar").click();
  await expect(page.getByTestId("e9-iniciar")).toBeVisible();
});

test("el flujo guiado anota los cinco eventos de E9", async ({ page }) => {
  test.setTimeout(180_000);
  await simularApi(page);
  await page.goto("/e9");
  await page.getByTestId("e9-codigo").fill("P08");
  await page.getByTestId("e9-consentimiento").check();
  await page.getByTestId("e9-iniciar").click();
  await page.getByRole("link", { name: "Ir a contar qué pasó" }).click();
  await expect(page).toHaveURL(/\/cuenta$/);

  await page.getByTestId("relato").fill("Iba por la glorieta y un auto se me cerró y le pegué.");
  await page.getByRole("button", { name: "Leer mi relato" }).click();
  await page.getByRole("radio", { name: "mojado" }).click();
  await page.getByTestId("responder").click();
  await page.getByRole("button", { name: "Acomodar el croquis" }).click();
  // Una corrección en el croquis: arrastrar un vehículo.
  const vehiculo = page.locator('[data-testid$="-inicial"]').first().locator("rect").first();
  await vehiculo.scrollIntoViewIfNeeded();
  const caja = (await vehiculo.boundingBox())!;
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width / 2 + 30, caja.y + caja.height / 2 + 10, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Ver tu reconstrucción" }).click();
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });

  const tipos = () =>
    page.evaluate(() =>
      [
        ...new Set(
          (
            JSON.parse(localStorage.getItem("croquis:e9") ?? "{}") as {
              eventos?: { tipo: string }[];
            }
          ).eventos?.map((e) => e.tipo),
        ),
      ].sort(),
    );
  await expect
    .poll(tipos, { timeout: 30_000 })
    .toEqual(
      [
        "croquis_abierto",
        "correccion_croquis",
        "preguntas_respondidas",
        "reconstruccion_visible",
        "relato_enviado",
      ].sort(),
    );
});
