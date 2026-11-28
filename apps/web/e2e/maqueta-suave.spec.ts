import type { Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";

/**
 * El 2D no tiembla al reproducir (René, 2026-11-28, en producción, en cualquier caso): cuadro a
 * cuadro, cada vehículo avanza de forma monótona y suave por su trayectoria y la barra de avance
 * también, al ritmo del reloj. Se mide en la página con `requestAnimationFrame` (el centro en
 * pantalla de cada vehículo en movimiento y el valor de la barra en cada cuadro), en el croquis
 * pericial (el 2D de producción) y en la maqueta (Versiones y Presentar).
 */
type Cuadro = { ms: number; t: number; v: Record<string, [number, number]> };

async function medir(page: Page, selector: string, clave: string): Promise<Cuadro[]> {
  return page.evaluate(
    ({ selector, clave }) =>
      new Promise<Cuadro[]>((ok) => {
        const out: Cuadro[] = [];
        const paso = (ms: number) => {
          const v: Record<string, [number, number]> = {};
          document.querySelectorAll(selector).forEach((e) => {
            const r = e.getBoundingClientRect();
            v[e.getAttribute(clave)!] = [r.x + r.width / 2, r.y + r.height / 2];
          });
          const rango = document.querySelector(
            '[data-testid="tiempo-maqueta"]',
          ) as HTMLInputElement;
          out.push({ ms, t: Number(rango.value), v });
          if (out.length < 150) requestAnimationFrame(paso);
          else ok(out);
        };
        requestAnimationFrame(paso);
      }),
    { selector, clave },
  );
}

function revisar(cuadros: Cuadro[]) {
  // La barra: nunca retrocede y avanza lo que pasó de reloj en cada cuadro (a 1×), sin escalones.
  const pasos = cuadros
    .slice(1)
    .map((c, i) => ({ dt: c.t - cuadros[i]!.t, dms: (c.ms - cuadros[i]!.ms) / 1000 }))
    .filter((p) => p.dt !== 0);
  expect(pasos.length).toBeGreaterThan(60);
  for (const p of pasos) {
    expect(p.dt).toBeGreaterThan(0);
    expect(Math.abs(p.dt - p.dms)).toBeLessThan(0.002);
  }
  // Cada vehículo: en pantalla, cada paso va hacia adelante y cambia poco respecto al anterior (sin
  // cuadros repetidos, saltos dobles ni idas y vueltas).
  let movidos = 0;
  const ids = new Set(cuadros.flatMap((c) => Object.keys(c.v)));
  for (const id of ids) {
    const d: [number, number][] = [];
    for (let i = 1; i < cuadros.length; i++) {
      const a = cuadros[i - 1]!.v[id];
      const b = cuadros[i]!.v[id];
      if (a && b) d.push([b[0] - a[0], b[1] - a[1]]);
    }
    const largo = d.map(([x, y]) => Math.hypot(x, y));
    if (largo.filter((l) => l > 0.05).length < 30) continue; // quieto en este tramo
    movidos++;
    for (let i = 1; i < d.length; i++) {
      if (largo[i - 1]! < 0.05 || largo[i]! < 0.05) continue;
      const coseno =
        (d[i - 1]![0] * d[i]![0] + d[i - 1]![1] * d[i]![1]) / (largo[i - 1]! * largo[i]!);
      expect(coseno).toBeGreaterThan(0.9);
      expect(Math.abs(largo[i]! - largo[i - 1]!)).toBeLessThan(
        Math.max(0.15, largo[i - 1]! * 0.25),
      );
    }
  }
  expect(movidos).toBeGreaterThanOrEqual(1);
}

for (const modo of ["pericial", "maqueta"] as const)
  test(`@flujo el 2D (${modo}) avanza suave y sin retroceder al reproducir`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript((m) => localStorage.setItem("croquis.2d", m), modo);
    await page.goto("/cesvi");
    await page.getByTestId("ir-axa").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
    await irAPaso(page, 4);
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("vista-maqueta").click();
    await expect(page.getByTestId("linea-de-tiempo")).toBeVisible();
    // Desde la llegada: lejos del impacto, donde el vehículo se mueve.
    await page.getByTestId("tiempo-maqueta").press("Home");
    await page.getByTestId("reproducir-maqueta").click();
    const cuadros =
      modo === "pericial"
        ? await medir(page, "[data-ahora]", "data-ahora")
        : await medir(page, "[data-vehiculo-maqueta]", "data-vehiculo-maqueta");
    revisar(cuadros);
  });
