import { VISOR_PUENTE_VERSION } from "@croquis/scene-schema";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { colocarComoPerito, conLaEscenaNueva } from "./recetas-perito";
import { conUnityFalso, recibidosDelPuente } from "./visor-unity-ayuda";

/**
 * «¿Y si…?» en el 3D (pedido de CESVI; René, 2026-11-26): al simular otra velocidad en la
 * Reconstrucción, el 3D muestra la hipótesis de inmediato, encima de la reconstrucción, sin pasar por
 * «Versiones». Con el Unity falso: lo que se revisa es el paquete que la web le manda.
 */
test.use({ viewport: { width: 1440, height: 900 } });

test("@flujo «¿Y si…?»: al simular, el 3D lleva la hipótesis encima sin pasar por «Versiones»", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await conUnityFalso(page, VISOR_PUENTE_VERSION);
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
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });

  // El 3D, antes de la hipótesis: sin fantasma.
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 90_000,
  });
  const fantasmas = async () =>
    (await recibidosDelPuente(page))
      .filter((m) => m.metodo === "cargarCaso")
      .map(
        (m) =>
          (JSON.parse(String(m.datos.json)) as { fantasma?: { etiqueta: string } }).fantasma ??
          null,
      );
  expect((await fantasmas()).at(-1)).toBeNull();

  // Simula A 40 km/h más rápido: el 3D la recibe en seguida, aún en la Reconstrucción.
  await page.getByTestId("abrir-ysi").click();
  const campo = page.getByTestId("ysi-kmh-V1");
  await campo.fill(String(Number(await campo.inputValue()) + 40));
  await page.getByTestId("ysi-simular").click();
  await expect(page.getByTestId("ysi-aviso")).toContainText("la cifra reconstruida no cambia", {
    timeout: 60_000,
  });
  await expect(page.getByTestId("panel-paso")).toHaveAttribute("data-paso", "4");
  await expect
    .poll(async () => (await fantasmas()).at(-1)?.etiqueta ?? null, { timeout: 60_000 })
    .toMatch(/¿y si/i);
  expect(errores).toEqual([]);
});
