import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { acercar, irAPaso } from "./ayuda-recorrido";

/**
 * Las llantas del caso de ejemplo (VW Jetta 2002 contra GM Camaro 1995; René, 2026-11-05): el mismo
 * recorrido que el e2e del caso nuevo hasta el 3D y, en el inicio, el impacto y el reposo, cada
 * rueda contra la salpicadera de la carrocería ya deformada. Corre a mano (no lleva @flujo):
 *
 *   pnpm --filter @croquis/web exec playwright test e2e/ruedas-ejemplo.spec.ts --project=chromium
 *
 * Medidas en `eval/results/t1_ruedas_ejemplo.json`; capturas en `docs/cesvi/t1/ruedas-ejemplo/`.
 */
const RAIZ = resolve(__dirname, "../../..");
const GRABACION = JSON.parse(
  readFileSync(join(RAIZ, "data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"), "utf8"),
) as { salida: unknown };
const CAPTURAS = join(RAIZ, "docs/cesvi/t1/ruedas-ejemplo");
const SALIDA = join(RAIZ, "eval/results/t1_ruedas_ejemplo.json");
/** sharp viene con Next (no es dependencia directa): las capturas van en WebP, ligeras. */
const sharp = createRequire(require.resolve("next/package.json"))("sharp") as (b: Buffer) => {
  webp(o: { quality: number }): { toFile(p: string): Promise<unknown> };
};

async function hastaEl3d(page: Page) {
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
      body: JSON.stringify({ metodo: "claude", salida: GRABACION.salida }),
    }),
  );
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await expect(page.getByTestId("recorrido-caso")).toHaveAttribute("data-origen", "nuevo");
  await irAPaso(page, 2);
  await page.getByTestId("ejemplo-narracion").click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("vehiculos")).toContainText("V1 · VW Jetta 2002");
  await page.getByTestId("confirmar-impacto").click();
  await page.getByTestId("opcion-clase-V1-sedan_compacto").click();
  await page.getByTestId("no-se-masa-V1").click();
  await page.getByTestId("valor-masa-V2").fill("1450");
  await page
    .getByTestId("pregunta-masa-V2")
    .getByRole("button", { name: "Usar", exact: true })
    .click();
  await irAPaso(page, 3);
  const mapa = page.getByTestId("mapa-escena");
  await acercar(page);
  await mapa.click({ position: { x: 300, y: 205 } });
  await page.getByTestId("aceptar-V1").click();
  await page.getByTestId("listo-elemento").click();
  for (const [v, rumbo, x, y] of [
    ["V1", "315", 330, 170],
    ["V2", "90", 345, 185],
  ] as const) {
    await expect(page.getByTestId("item-activo")).toHaveAttribute("data-item", `final:${v}`);
    await mapa.click({ position: { x, y } });
    await page.getByTestId("rumbo-activo").fill(rumbo);
    await page.getByTestId("listo-elemento").click();
  }
  await expect(page.getByTestId("falta-para-seguir")).toHaveCount(0);
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("velocidades")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("ver-3d").click();
  await page.waitForFunction(() => window.__croquisGraphReady === true, null, {
    timeout: 600_000,
  });
  await page.getByTestId("camaras").getByRole("radio", { name: "Libre" }).click();
  await page.waitForFunction(() => !!window.__croquisOrbit, null, { timeout: 30_000 });
}

type Instante = "inicio" | "impacto" | "reposo";

/** Pausa el reloj, apunta la cámara libre al costado del vehículo y mide cada rueda contra su salpicadera. */
const medir = (page: Page, args: { instante: Instante; i: number; lado: 1 | -1 }) =>
  page.evaluate(({ instante, i, lado }) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const reloj = window.__croquisReloj!;
    const graph = window.__croquisGrafo!;
    const orbit = window.__croquisOrbit!;
    reloj.set((s) => ({
      ...s,
      t: instante === "inicio" ? s.tStart : instante === "reposo" ? s.tEnd : 0,
      playing: false,
    }));
    const t = reloj.get().t;
    graph.update(t);
    const v = graph.vehicles[i]!;
    const g: any = v.group;
    g.updateMatrixWorld(true);
    const yaw = g.rotation.y;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // Cámara a 3.4 m del costado y 1.9 m arriba, por encima de bardas y fachadas (lado 1:
    // izquierdo, −z del vehículo; −1: derecho).
    const lz = -3.4 * lado;
    orbit.object.position.set(g.position.x + lz * s, g.position.y + 1.9, g.position.z + lz * c);
    orbit.target.set(g.position.x, g.position.y + 0.5, g.position.z);
    orbit.update();

    const inv = g.matrixWorld.clone().invert();
    const ruedas: any[] = [];
    g.traverse((o: any) => {
      if (o.name.startsWith("wheel_") && typeof o.userData.radius === "number") ruedas.push(o);
    });
    const enRueda = (o: any) => {
      for (let p = o; p && p !== g; p = p.parent) if (p.name.startsWith("wheel_")) return true;
      return false;
    };
    // Vértices de la carrocería en el marco del vehículo, con el daño de este instante.
    const pts: number[] = [];
    g.traverse((m: any) => {
      if (!m.isMesh || !m.visible || m.type === "SkinnedMesh" || enRueda(m)) return;
      const pos = m.geometry.attributes.position;
      const morphs: any[] = m.geometry.morphAttributes.position ?? [];
      const inf: number[] = m.morphTargetInfluences ?? [];
      const e = m.matrixWorld.clone().premultiply(inv).elements;
      const paso = pos.count > 60000 ? 3 : 1;
      for (let k = 0; k < pos.count; k += paso) {
        let x = pos.getX(k);
        let y = pos.getY(k);
        let z = pos.getZ(k);
        morphs.forEach((mt, j) => {
          const w = inf[j] ?? 0;
          if (!w) return;
          if (m.geometry.morphTargetsRelative) {
            x += w * mt.getX(k);
            y += w * mt.getY(k);
            z += w * mt.getZ(k);
          } else {
            x += w * (mt.getX(k) - x);
            y += w * (mt.getY(k) - y);
            z += w * (mt.getZ(k) - z);
          }
        });
        pts.push(
          e[0] * x + e[4] * y + e[8] * z + e[12],
          e[1] * x + e[5] * y + e[9] * z + e[13],
          e[2] * x + e[6] * y + e[10] * z + e[14],
        );
      }
    });
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    const medidas = ruedas.map((o) => {
      o.updateMatrixWorld(true);
      const w = o.matrixWorld.clone().premultiply(inv).elements;
      const cx: number = w[12];
      const cy: number = w[13];
      const cz: number = w[14];
      const r = o.userData.radius as number;
      // La cara exterior de la llanta (su caja en el marco del vehículo).
      let zExt = 0;
      o.traverse((p: any) => {
        if (!p.isMesh) return;
        p.geometry.computeBoundingBox();
        const b = p.geometry.boundingBox;
        const ee = p.matrixWorld.clone().premultiply(inv).elements;
        for (const zz of [b.min.z, b.max.z]) zExt = Math.max(zExt, Math.abs(ee[14] + ee[10] * zz));
      });
      // La salpicadera sobre la llanta: lo más afuera de la carrocería (ya deformada) arriba del eje,
      // a menos de medio radio de su centro a lo largo del vehículo.
      const signo = Math.sign(cz) || 1;
      let zCarroceria = 0;
      for (let k = 0; k < pts.length; k += 3) {
        const x = pts[k]!;
        const y = pts[k + 1]!;
        const z = pts[k + 2]!;
        if (Math.sign(z) !== signo || Math.abs(x - cx) > 0.5 * r) continue;
        if (y > cy && y < cy + 2.2 * r) zCarroceria = Math.max(zCarroceria, Math.abs(z));
      }
      return {
        nombre: o.name as string,
        centro: [r3(cx), r3(cy), r3(cz)],
        radio: r3(r),
        // La cara exterior de la llanta contra la salpicadera: positivo, sale de la carrocería;
        // negativo, se mete en ella.
        sale_de_lado_m: zCarroceria > 0 ? r3(zExt - zCarroceria) : null,
      };
    });
    return {
      t: r3(t),
      id: v.id,
      modelo: (g.userData.modelo as string | undefined) ?? null,
      clase: g.userData.clase as string,
      dims: g.userData.dims as unknown,
      ruedas: medidas,
    };
  }, args);

test("llantas del caso de ejemplo (Jetta y Camaro) en el inicio, el impacto y el reposo", async ({
  page,
}) => {
  test.setTimeout(900_000);
  await hastaEl3d(page);
  mkdirSync(CAPTURAS, { recursive: true });
  const n = await page.evaluate(() => window.__croquisGrafo!.vehicles.length);
  const vehiculos: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const porInstante: Record<string, unknown> = {};
    for (const instante of ["inicio", "impacto", "reposo"] as const) {
      const lados: Record<string, unknown> = {};
      for (const [nombre, lado] of [
        ["izquierdo", 1],
        ["derecho", -1],
      ] as const) {
        const m = await medir(page, { instante, i, lado });
        lados[nombre] = m;
        await page.waitForTimeout(600);
        await page.evaluate(() => window.scrollTo(0, 0));
        const png = await page.getByTestId("visor-caso").locator("canvas").first().screenshot();
        await sharp(png)
          .webp({ quality: 82 })
          .toFile(join(CAPTURAS, `${m.id}-${instante}-${nombre}.webp`));
      }
      porInstante[instante] = lados;
    }
    vehiculos.push(porInstante);
  }
  writeFileSync(
    SALIDA,
    `${JSON.stringify(
      {
        name: "t1_ruedas_ejemplo",
        descripcion:
          "Caso de ejemplo de /cesvi (Jetta contra Camaro): centro y radio de cada rueda y su cara exterior contra la salpicadera (sale_de_lado_m: positivo, afuera; negativo, adentro), en el inicio, el impacto y el reposo, con el daño de ese instante (marco del vehículo, m). Generado por apps/web/e2e/ruedas-ejemplo.spec.ts.",
        generated_at: new Date().toISOString(),
        vehiculos,
      },
      null,
      1,
    )}\n`,
  );
});
