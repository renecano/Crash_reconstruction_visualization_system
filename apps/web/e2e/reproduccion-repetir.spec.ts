import { VISOR_PUENTE_VERSION } from "@croquis/scene-schema";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { conUnityFalso } from "./visor-unity-ayuda";

/**
 * Al terminar la reproducción (René, 2026-11-27: «el botón se queda en pausa y no deja repetir»): el
 * botón cambia a «Repetir» (↻) y al tocarlo empieza de nuevo. Con el Unity de mentira; el fin de la
 * reproducción lo avisa la prueba como lo hace Unity, con su último aviso de tiempo.
 */
test("@flujo /cesvi: al terminar la reproducción, «Repetir» empieza de nuevo", async ({ page }) => {
  test.setTimeout(300_000);
  await conUnityFalso(page, VISOR_PUENTE_VERSION);
  await page.route("**/api/lugar?**", (r) => r.fulfill({ json: { resultados: [] } }));
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 90_000,
  });
  const boton = page.getByTestId("reproducir-unity");
  const deslizador = page.getByTestId("controles-unity").locator('input[type="range"]');
  const inicio = Number(await deslizador.getAttribute("min"));
  const fin = Number(await deslizador.getAttribute("max"));
  await expect(boton).toHaveAttribute("aria-label", "Pausar");

  // Unity llega al final: su último aviso puede quedar unas décimas antes y luego se detiene.
  await page.evaluate(
    (t) =>
      (window as unknown as { croquisVisorMensaje: (s: string) => void }).croquisVisorMensaje(
        JSON.stringify({ tipo: "tiempo", t }),
      ),
    fin - 0.12,
  );
  await expect(boton).toHaveAttribute("aria-label", "Repetir");
  await expect(boton).toHaveText("↻");

  // «Repetir» lleva al inicio y reproduce.
  const antes = await page.evaluate(
    () =>
      (window as unknown as { __unityFalso: { recibidos: unknown[] } }).__unityFalso.recibidos
        .length,
  );
  await boton.click();
  await expect(boton).toHaveAttribute("aria-label", "Pausar");
  const nuevos = await page.evaluate(
    (d) =>
      (
        window as unknown as {
          __unityFalso: { recibidos: { metodo: string; datos: { t?: number } }[] };
        }
      ).__unityFalso.recibidos.slice(d),
    antes,
  );
  const fijar = nuevos.find((m) => m.metodo === "fijarTiempo");
  expect(fijar?.datos.t).toBeCloseTo(inicio, 2);
  expect(nuevos.map((m) => m.metodo)).toContain("reproducir");
});
