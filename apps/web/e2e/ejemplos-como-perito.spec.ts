import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";

/**
 * La tabla del índice y la app arman la misma escena (René, 2026-11-26: «que no se repita»). Con La
 * escena nueva (la que usa el perito), cada ejemplo abre en su lugar guardado y La escena propone la
 * escena; la prueba la lee (con `__croquisDiagnostico`) y la compara con la propuesta que guardó la
 * tabla (`eval/results/ejemplos_como_perito/<clave>.json`, de `ejemplo-como-perito.ts`): el mismo
 * choque, las mismas poses de impacto. Si la tabla tuviera su propia versión de La escena, falla.
 */
const RAIZ = resolve(__dirname, "../../..");
const EJEMPLOS = [
  "crucero-noche",
  "alcance-deformacion",
  "carambola-lluvia",
  "reversa-pendiente",
  "poste-terraceria",
];
type Pos = { vehiculo: string; fase: string; punto: { lat: number; lon: number }; rumbo: number };
type Escena = {
  puntos: Record<string, { lat: number; lon: number }>;
  versiones?: { posiciones?: Pos[] }[];
};
const metros = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot(
    (a.lat - b.lat) * 111320,
    (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180),
  );
const grados = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

test.use({ viewport: { width: 1440, height: 900 } });

test("@flujo la tabla del índice y La escena proponen la misma escena en los cinco ejemplos", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisDiagnostico = true;
    try {
      localStorage.setItem("croquis.escena", "nueva");
    } catch {
      // Sin almacenamiento: La escena nueva es la de omisión.
    }
  });
  for (const clave of EJEMPLOS) {
    const tabla = JSON.parse(
      readFileSync(join(RAIZ, "eval/results/ejemplos_como_perito", `${clave}.json`), "utf8"),
    ) as { propuesta: Escena };
    await page.goto("/cesvi");
    await page.getByTestId("ir-caso-nuevo").click();
    await irAPaso(page, 2);
    await page.locator(`[data-ejemplo="${clave}"]`).click();
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
    await irAPaso(page, 3);
    // La propuesta: el primer choque puesto y una pose de impacto por vehículo.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as {
              __croquisEscena?: {
                puntos: Record<string, unknown>;
                expediente: { versiones?: { posiciones?: unknown[] }[] };
              };
            };
            return (
              Boolean(w.__croquisEscena?.puntos[1]) &&
              (w.__croquisEscena?.expediente.versiones?.[0]?.posiciones?.length ?? 0) > 0
            );
          }),
        { timeout: 60_000 },
      )
      .toBe(true);
    const app = (await page.evaluate(() => {
      const w = window as unknown as {
        __croquisEscena: { puntos: Record<string, unknown>; expediente: { versiones?: unknown } };
      };
      return {
        puntos: w.__croquisEscena.puntos,
        versiones: w.__croquisEscena.expediente.versiones,
      };
    })) as Escena;
    const t = tabla.propuesta;
    expect(Object.keys(app.puntos).sort(), `${clave}: los choques`).toEqual(
      Object.keys(t.puntos).sort(),
    );
    for (const k of Object.keys(t.puntos))
      expect(metros(app.puntos[k]!, t.puntos[k]!), `${clave}: el choque ${k}`).toBeLessThan(0.3);
    const deApp = app.versiones?.[0]?.posiciones?.filter((p) => p.fase === "impacto") ?? [];
    const deTabla = t.versiones?.[0]?.posiciones?.filter((p) => p.fase === "impacto") ?? [];
    expect(deApp.length, `${clave}: las poses de impacto`).toBe(deTabla.length);
    for (const p of deTabla) {
      const q = deApp.find((x) => x.vehiculo === p.vehiculo)!;
      expect(q, `${clave}: ${p.vehiculo}`).toBeTruthy();
      expect(metros(q.punto, p.punto), `${clave}: ${p.vehiculo} en el impacto`).toBeLessThan(0.3);
      expect(grados(q.rumbo, p.rumbo), `${clave}: rumbo de ${p.vehiculo}`).toBeLessThan(1);
    }
  }
});
