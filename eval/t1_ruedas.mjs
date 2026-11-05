// Capturas de cerca de las ruedas de cada clase con modelo (René, 2026-11-04, C2): el visor en
// `/visor?escena=…&camara=libre`, el reloj en pausa en cada instante (inicio, impacto, reposo) y la
// cámara libre al costado del vehículo, a la altura de las ruedas, y de tres cuartos. Deja las capturas
// (WebP) en `docs/cesvi/t1/ruedas/` y en `eval/results/t1_ruedas.json` dónde quedan las ruedas respecto a
// la carrocería y al piso (coordenadas del vehículo, m).
//
//   node eval/t1_ruedas.mjs [--url http://localhost:3000] [--clases sedan_compacto,pickup]
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const requireWeb = createRequire(resolve(ROOT, "apps/web/package.json"));
const { chromium } = requireWeb("@playwright/test");
// sharp viene con Next (no es dependencia directa): las capturas van en WebP, ligeras.
const sharp = createRequire(requireWeb.resolve("next/package.json"))("sharp");
const SALIDA_DIR = resolve(ROOT, "docs/cesvi/t1/ruedas");
const SALIDA = resolve(ROOT, "eval/results/t1_ruedas.json");
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const url = arg("--url") ?? "http://localhost:3000";

/** Una escena por clase con modelo (las clases sin escena de ejemplo no se capturan). */
const TODOS = [
  { clase: "sedan_compacto", escena: "interseccion_toluca", vehiculo: 0 },
  { clase: "hatchback", escena: "lateral_interseccion", vehiculo: 0 },
  { clase: "pickup", escena: "lateral_interseccion", vehiculo: 1 },
  { clase: "suv_compacta", escena: "alcance", vehiculo: 1 },
  { clase: "van", escena: "frontal_curva", vehiculo: 1 },
  { clase: "microbus_combi", escena: "nocturno_lluvia", vehiculo: 1 },
  { clase: "suv_grande", escena: "volcadura", vehiculo: 0 },
  { clase: "motocicleta", escena: "motociclista", vehiculo: 1 },
];
const filtro = arg("--clases")?.split(",");
const CASOS = filtro ? TODOS.filter((c) => filtro.includes(c.clase)) : TODOS;

/** Pausa el reloj en el instante, coloca la cámara libre respecto al vehículo i y mide sus ruedas. */
const preparar = (page, { instante, i, lado }) =>
  page.evaluate(
    ({ instante, i, lado }) => {
      const reloj = window.__croquisReloj;
      const graph = window.__croquisGrafo;
      const orbit = window.__croquisOrbit;
      if (!reloj || !graph || !orbit) throw new Error("sin reloj, grafo o controles");
      reloj.set((s) => ({
        ...s,
        t: instante === "inicio" ? s.tStart : instante === "reposo" ? s.tEnd : 0,
        playing: false,
      }));
      const t = reloj.get().t;
      graph.update(t);
      const v = graph.vehicles[i] ?? graph.vehicles[0];
      v.group.updateMatrixWorld(true);
      const yaw = v.group.rotation.y;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      // Marco del vehículo: x adelante, −z izquierda.
      const lx = lado.dx;
      const lz = -lado.dz;
      const wx = v.group.position.x + lx * c + lz * s;
      const wz = v.group.position.z - lx * s + lz * c;
      orbit.object.position.set(wx, v.group.position.y + lado.dy, wz);
      orbit.target.set(v.group.position.x, v.group.position.y + 0.5, v.group.position.z);
      orbit.update();
      // Medidas en el marco del vehículo.
      const inv = v.group.matrixWorld.clone().invert();
      const caja = (o) => {
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        const m = o.matrixWorld.clone().premultiply(inv).elements;
        let lo = [Infinity, Infinity];
        let hi = [-Infinity, -Infinity];
        for (const x of [b.min.x, b.max.x])
          for (const y of [b.min.y, b.max.y])
            for (const z of [b.min.z, b.max.z]) {
              const px = m[0] * x + m[4] * y + m[8] * z + m[12];
              const py = m[1] * x + m[5] * y + m[9] * z + m[13];
              lo = [Math.min(lo[0], px), Math.min(lo[1], py)];
              hi = [Math.max(hi[0], px), Math.max(hi[1], py)];
            }
        return { lo, hi };
      };
      const ruedas = [];
      let carroceria = Infinity;
      v.group.traverse((o) => {
        if (!o.geometry || o.type === "SkinnedMesh" || !o.visible) return;
        let rueda = null;
        for (let p = o; p && p !== v.group; p = p.parent)
          if (p.name.startsWith("wheel_")) rueda = p;
        const b = caja(o);
        if (rueda) {
          const r = ruedas.find((x) => x.nombre === rueda.name);
          if (r) {
            r.lo = [Math.min(r.lo[0], b.lo[0]), Math.min(r.lo[1], b.lo[1])];
            r.hi = [Math.max(r.hi[0], b.hi[0]), Math.max(r.hi[1], b.hi[1])];
          } else ruedas.push({ nombre: rueda.name, ...b });
        } else carroceria = Math.min(carroceria, b.lo[1]);
      });
      const r3 = (x) => Math.round(x * 1000) / 1000;
      return {
        t,
        modelo: v.group.userData.modelo ?? null,
        ejesReubicados: v.group.userData.axlesRemapped ?? null,
        dims: v.group.userData.dims ?? null,
        carroceria_piso_y: r3(carroceria),
        ruedas: ruedas.map((r) => ({
          nombre: r.nombre,
          centro_x: r3((r.lo[0] + r.hi[0]) / 2),
          piso_y: r3(r.lo[1]),
          radio: r3((r.hi[1] - r.lo[1]) / 2),
        })),
      };
    },
    { instante, i, lado },
  );

mkdirSync(SALIDA_DIR, { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
});
const resultados = [];
for (const caso of CASOS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const q = new URLSearchParams({
    escena: caso.escena,
    camara: "libre",
    renderer: "webgl",
    calidad: "media",
  });
  await page.goto(`${url}/visor?${q}`);
  await page.waitForFunction(() => window.__croquisGraphReady === true, null, {
    timeout: 300_000,
  });
  const medidas = {};
  for (const instante of ["inicio", "impacto", "reposo"]) {
    for (const [vista, lado] of [
      ["costado", { dx: 0, dz: 4.2, dy: 0.7 }],
      ["tres-cuartos", { dx: 3.4, dz: 3.4, dy: 1.2 }],
    ]) {
      const m = await preparar(page, { instante, i: caso.vehiculo, lado });
      if (vista === "costado") medidas[instante] = m;
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 0));
      const png = await page.getByTestId("marco-visor").screenshot();
      await sharp(png)
        .webp({ quality: 82 })
        .toFile(resolve(SALIDA_DIR, `${caso.clase}-${instante}-${vista}.webp`));
    }
  }
  resultados.push({ ...caso, medidas });
  await page.close();
}
await browser.close();
writeFileSync(
  SALIDA,
  JSON.stringify(
    {
      name: "t1_ruedas",
      descripcion:
        "Ruedas y carrocería de cada clase con modelo, en el inicio, el impacto y el reposo (marco del vehículo, m): centro x, piso y radio de cada rueda y piso de la carrocería; capturas en docs/cesvi/t1/ruedas/.",
      generated_at: new Date().toISOString(),
      casos: resultados,
    },
    null,
    1,
  ) + "\n",
);
console.log(SALIDA);
