import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { colocarComoPerito, conLaEscenaNueva } from "./recetas-perito";

/**
 * «¿Y si…?» a otra velocidad (pedido de CESVI; René, 2026-11-26): en la Reconstrucción, el perito
 * cambia la velocidad de un vehículo, simula y ve qué cambia del choque, marcado como hipótesis; la
 * cifra reconstruida no cambia. La hipótesis queda también en «Versiones».
 */
test.use({ viewport: { width: 1440, height: 900 } });

test("@flujo «¿Y si…?»: otra velocidad cambia el choque y no la cifra reconstruida", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await conLaEscenaNueva(page);
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await irAPaso(page, 2);
  await page.locator('[data-ejemplo="crucero-noche"]').click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
  await irAPaso(page, 3);
  const notas: string[] = [];
  expect(await colocarComoPerito(page, "crucero-noche", notas), notas.join(" ")).toBe(true);
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  const cifra = page.getByTestId("cifra-reconstruccion");
  await expect(cifra).toBeVisible({ timeout: 240_000 });
  // La cifra entra contando: se lee cuando ya no cambia.
  const texto = async () => ((await cifra.textContent()) ?? "").replace(/\s+/g, " ").trim();
  await expect
    .poll(
      async () => {
        const a = await texto();
        await page.waitForTimeout(700);
        return a === (await texto());
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const antes = await texto();

  // La hipótesis: el Jetta 40 km/h más rápido que lo reconstruido.
  await page.getByTestId("abrir-ysi").click();
  const campo = page.getByTestId("ysi-kmh-V1");
  const reconstruida = Number(await campo.inputValue());
  await campo.fill(String(reconstruida + 40));
  await page.getByTestId("ysi-simular").click();
  await expect(page.getByTestId("ysi-aviso")).toContainText("la cifra reconstruida no cambia", {
    timeout: 60_000,
  });
  const vel = page
    .getByTestId("ysi-cambios")
    .locator("li", { hasText: "Velocidad al impacto · A" });
  await expect(vel).toContainText("Cambia");
  await expect(vel).toContainText(`${reconstruida + 40} km/h`);
  await expect(
    page.getByTestId("ysi-cambios").locator("li", { hasText: "Energía de la deformación" }).first(),
  ).toContainText("Cambia");
  // La cifra reconstruida es la misma.
  expect(await texto()).toBe(antes);
  // Y en «Versiones», como hipótesis del perito.
  await page.getByTestId("comparar-version").click();
  await expect(page.locator('[data-tipo="hipotesis"]')).toContainText("¿Y si…?");
  expect(errores).toEqual([]);
});
