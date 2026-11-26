import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import {
  colocarComoPerito,
  conLaEscenaNueva,
  EJEMPLOS_PERITO,
  escenaDeLaTabla,
} from "./recetas-perito";

/**
 * La tabla del índice y la app arman la misma escena (René, 2026-11-26: «que no se repita»). Con La
 * escena nueva (la que usa el perito), cada ejemplo abre en su lugar guardado y:
 *
 * 1. La escena propone la escena: la misma que guardó la tabla (`propuesta`).
 * 2. El perito hace los toques de la tabla (`recetas-perito.ts`): la escena que queda es la misma que
 *    reconstruyó la tabla (`versiones`): choques, poses de impacto y finales.
 *
 * La tabla los guarda en `eval/results/ejemplos_como_perito/<clave>.json` (`ejemplo-como-perito.ts`).
 * Si la tabla tuviera su propia versión de La escena, falla.
 */
type P = { lat: number; lon: number };
type Pos = { vehiculo: string; fase: string; punto: P; rumbo: number };
type Escena = { puntos: Record<string, P>; versiones?: { posiciones?: Pos[] }[] };
const metros = (a: P, b: P) =>
  Math.hypot(
    (a.lat - b.lat) * 111320,
    (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180),
  );
const grados = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

test.use({ viewport: { width: 1440, height: 900 } });

const escenaDeLaApp = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      __croquisEscena: { puntos: Record<string, unknown>; expediente: { versiones?: unknown } };
    };
    return { puntos: w.__croquisEscena.puntos, versiones: w.__croquisEscena.expediente.versiones };
  }) as Promise<Escena>;

/** Las poses de `fases` iguales, a `m` metros y `g` grados. */
function mismasPoses(
  clave: string,
  app: Escena,
  tabla: Escena,
  fases: string[],
  m: number,
  g: number,
) {
  const de = (x: Escena) =>
    (x.versiones?.[0]?.posiciones ?? []).filter((p) => fases.includes(p.fase));
  const a = de(app);
  const t = de(tabla);
  expect(
    a.map((p) => `${p.vehiculo}:${p.fase}`).sort(),
    `${clave}: las poses (${fases.join(", ")})`,
  ).toEqual(t.map((p) => `${p.vehiculo}:${p.fase}`).sort());
  for (const p of t) {
    const q = a.find((x) => x.vehiculo === p.vehiculo && x.fase === p.fase)!;
    expect(metros(q.punto, p.punto), `${clave}: ${p.vehiculo} ${p.fase}`).toBeLessThan(m);
    expect(grados(q.rumbo, p.rumbo), `${clave}: rumbo de ${p.vehiculo} ${p.fase}`).toBeLessThan(g);
  }
}

test("@flujo la tabla del índice y La escena arman la misma escena en los cinco ejemplos", async ({
  page,
}) => {
  test.setTimeout(420_000);
  await conLaEscenaNueva(page);
  for (const clave of EJEMPLOS_PERITO) {
    const tabla = escenaDeLaTabla(clave);
    await page.goto("/cesvi");
    await page.getByTestId("ir-caso-nuevo").click();
    await irAPaso(page, 2);
    await page.locator(`[data-ejemplo="${clave}"]`).click();
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
    await irAPaso(page, 3);
    // 1. La propuesta: el primer choque puesto y una pose de impacto por vehículo.
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
    const propuesta = await escenaDeLaApp(page);
    const t = tabla.propuesta as Escena;
    expect(Object.keys(propuesta.puntos).sort(), `${clave}: los choques propuestos`).toEqual(
      Object.keys(t.puntos).sort(),
    );
    for (const k of Object.keys(t.puntos))
      expect(metros(propuesta.puntos[k]!, t.puntos[k]!), `${clave}: el choque ${k}`).toBeLessThan(
        0.3,
      );
    mismasPoses(clave, propuesta, t, ["impacto"], 0.3, 1);
    // 2. Los toques del perito: la escena que reconstruye la tabla.
    const notas: string[] = [];
    expect(await colocarComoPerito(page, clave, notas), `${clave}: ${notas.join(" ")}`).toBe(true);
    const final = await escenaDeLaApp(page);
    const tf = { puntos: tabla.puntos, versiones: tabla.versiones } as Escena;
    for (const k of Object.keys(tf.puntos))
      expect(metros(final.puntos[k]!, tf.puntos[k]!), `${clave}: el choque ${k}`).toBeLessThan(0.6);
    // Los toques caen en píxeles: medio metro y 3° (el rumbo se alinea a la calle).
    mismasPoses(clave, final, tf, ["impacto", "final"], 0.6, 3);
  }
});
