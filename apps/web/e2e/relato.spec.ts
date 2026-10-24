import { expect, test } from "@playwright/test";
import { simularApi, SPEC_GLORIETA as spec } from "./api-simulada";

test("flujo guiado: redacta en el navegador, pregunta, acomoda el croquis y llega al 3D", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const enviados = await simularApi(page);

  await page.goto("/publico");
  await page.getByTestId("cta-publico").click();
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cuenta qué pasó");

  await page
    .getByTestId("relato")
    .fill("Me llamo Ana López, tel 722 123 4567. Se me cerró una camioneta y le pegué por detrás.");
  await page.getByRole("button", { name: "Ver lo que se envía" }).click();
  await expect(page.getByTestId("texto-redactado")).toHaveText(
    "Me llamo [NOMBRE], tel [TELEFONO]. Se me cerró una camioneta y le pegué por detrás.",
  );
  await page.getByRole("button", { name: "Leer mi relato" }).click();
  await expect(page).toHaveURL(/paso=falta/);
  await expect(page.getByTestId("hechos")).toBeVisible();
  expect(enviados[0]).not.toContain("Ana");
  expect(enviados[0]).not.toContain("722 123 4567");

  await page.getByRole("radio", { name: "mojado" }).click();
  await page.getByTestId("responder").click();
  await expect(page.getByTestId("sin-preguntas")).toBeVisible();
  await expect(page.getByRole("note").first()).toContainText("No es un peritaje");

  await page.getByRole("button", { name: "Acomodar el croquis" }).click();
  await expect(page).toHaveURL(/paso=ubica/);
  await expect(page.getByTestId("croquis-flujo")).toBeVisible();
  await page.getByRole("button", { name: "Ver tu reconstrucción" }).click();
  await expect(page).toHaveURL(/paso=simula/);
  await expect(page.getByTestId("volver-croquis")).toBeVisible();
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
  const guardada = await page.evaluate(() => sessionStorage.getItem("croquis:flujo"));
  expect(guardada).toContain(spec.meta.id);
});
