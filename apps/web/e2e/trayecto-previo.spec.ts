import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VISOR_PUENTE_VERSION } from "@croquis/scene-schema";
import { expect, test } from "./base";
import { irAPaso, tocarEnMetros } from "./ayuda-recorrido";
import { colocarComoPerito, conLaEscenaNueva } from "./recetas-perito";
import { conUnityFalso } from "./visor-unity-ayuda";

/**
 * «¿De dónde venía?» (René, 2026-11-27): el perito marca a unos 2 km de dónde venía un vehículo del
 * ejemplo del crucero. La ruta por las calles es la que dio el enrutador (OSRM sobre OpenStreetMap,
 * grabada en `e2e/datos/ruta-crucero.json`: CI no llama a servicios externos).
 *
 * Comprueba que:
 * - la ruta sigue las calles (más larga que la línea recta y con sus vueltas) y termina justo donde
 *   empieza la reconstrucción de ese vehículo, en su instante;
 * - La escena dice la distancia, la duración y «trayecto ilustrativo: no es evidencia»;
 * - la cifra de la reconstrucción no cambia.
 */
const RUTA = JSON.parse(readFileSync(resolve(__dirname, "datos/ruta-crucero.json"), "utf8")) as {
  puntos: [number, number][];
  distancia_m: number;
};

test.use({ viewport: { width: 1440, height: 900 } });

test("@flujo de dónde venía: la ruta por las calles, ilustrativa, sin cambiar la cifra", async ({
  page,
}) => {
  test.setTimeout(420_000);
  await conUnityFalso(page, VISOR_PUENTE_VERSION);
  await conLaEscenaNueva(page);
  await page.route("**/api/ruta?**", (r) => r.fulfill({ json: RUTA }));
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
  const cifra = page.getByTestId("cifra-reconstruida");
  await expect(cifra).toBeVisible({ timeout: 240_000 });
  await page.waitForTimeout(1500);
  const antes = await cifra.innerText();

  // En La escena, «¿De dónde venía?» del primer vehículo: a unos 2 km al noroeste del choque.
  await irAPaso(page, 3);
  const seccion = page.getByTestId("de-donde-venia");
  await expect(seccion).toBeVisible({ timeout: 30_000 });
  const marcar = seccion.locator('[data-testid^="marcar-previo-"]').first();
  const id = (await marcar.getAttribute("data-testid"))!.replace("marcar-previo-", "");
  await marcar.click();
  await tocarEnMetros(page, "choque-1", -1400, 1400);
  const texto = page.getByTestId(`texto-previo-${id}`);
  await expect(texto).toContainText("km por las calles", { timeout: 30_000 });
  await expect(texto).toContainText("trayecto ilustrativo: no es evidencia");

  // La cifra no cambia.
  await irAPaso(page, 4);
  await expect(cifra).toBeVisible({ timeout: 240_000 });
  await page.waitForTimeout(1500);
  expect(await cifra.innerText()).toBe(antes);

  // El 3D recibe el trayecto previo: por las calles y empalmado con la reconstrucción.
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 90_000,
  });
  const leer = () =>
    page.evaluate(() => {
      const r = (
        window as unknown as {
          __unityFalso: { recibidos: { metodo: string; datos: { json?: string } }[] };
        }
      ).__unityFalso.recibidos.filter((m) => m.metodo === "cargarCaso");
      const j = r.at(-1)?.datos.json;
      const p = j ? JSON.parse(j) : null;
      return p?.escenario?.vehiculos?.some((v: { trayecto_previo?: unknown }) => v.trayecto_previo)
        ? p
        : null;
    });
  await expect.poll(async () => Boolean(await leer()), { timeout: 60_000 }).toBe(true);
  const paquete = (await leer())!;
  type Tr = { x: number[]; y: number[]; t: number[]; v_ms: number[]; distancia_m: number };
  const v = (paquete.escenario.vehiculos as { id: string; trayecto_previo?: Tr }[]).find(
    (x) => x.trayecto_previo,
  )!;
  const tr = v.trayecto_previo!;
  const res = (
    paquete.resultado.vehiculos as {
      id: string;
      trayectoria: { t: number[]; x: number[]; y: number[]; vx: number[]; vy: number[] };
    }[]
  ).find((x) => x.id === v.id)!.trayectoria;
  const n = tr.x.length;
  // Empalma: el último punto es el primero de la reconstrucción, en su instante y a su velocidad.
  expect(tr.x[n - 1]).toBeCloseTo(res.x[0]!, 1);
  expect(tr.y[n - 1]).toBeCloseTo(res.y[0]!, 1);
  expect(tr.t[n - 1]).toBe(res.t[0]);
  const v0 = Math.hypot(res.vx[0]!, res.vy[0]!);
  expect(tr.v_ms[n - 1]).toBeCloseTo(v0, 1);
  expect(Math.max(...tr.v_ms)).toBeLessThanOrEqual(v0 + 0.01);
  // Sigue las calles: más larga que la línea recta, con muchas vueltas.
  const recta = Math.hypot(tr.x[n - 1]! - tr.x[0]!, tr.y[n - 1]! - tr.y[0]!);
  expect(tr.distancia_m).toBeGreaterThan(1.2 * recta);
  expect(n).toBeGreaterThan(RUTA.puntos.length);
});

test("@flujo con un build sin trayecto previo (puente 1.4.0), La escena no pregunta de dónde venía", async ({
  page,
}) => {
  test.setTimeout(240_000);
  // René, 2026-11-27: el build 8a302a no dibuja el trayecto previo; la web no lo ofrece.
  await conUnityFalso(page, "1.4.0");
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
  await expect(page.getByTestId("lista-escena")).toBeVisible();
  await expect(page.getByTestId("de-donde-venia")).toHaveCount(0);
});
