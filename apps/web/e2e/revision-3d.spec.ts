import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { colocar, RECETAS } from "./recetas-ejemplos";

/**
 * Revisión visual del 3D de Unity (Alberto, 2026-11-26), a mano y con ventana: el 3D real necesita la
 * GPU. No corre en CI (no lleva @flujo) y se salta si no se pide.
 *
 *   CROQUIS_REVISION_3D=1 pnpm exec playwright test e2e/revision-3d.spec.ts --headed --workers=1 --project=chromium
 *
 * Contra un sitio local con el build que se quiera revisar (`CROQUIS_VISOR=local`, el manifiesto de
 * `visor-local.mjs preparar`). Recorre los cinco ejemplos públicos, Tollocan y Paseo de la Reforma
 * (casos guardados de `data/cesvi/casos/`), y, si se dan, más casos `.croquis` en `CROQUIS_CASOS_3D`
 * (rutas separadas por comas; por ejemplo, uno en carretera árida). Sin AXA.
 *
 * Por caso deja en `CROQUIS_CAPTURAS` (por omisión `test-results/revision-3d/`) las cámaras en el
 * reposo y en el impacto, una cenital cada 0.5 s, la reproducción con la cámara lenta, Presentar y el
 * paquete caso-3d que recibió Unity. En `revision.json`, lo medido sobre ese paquete:
 * - vehículos que se meten en un edificio (rectángulo contra rectángulo, cuadro por cuadro);
 * - árboles, postes, señales, luminarias u objetos del caso a 0.6 m o más dentro de la calzada;
 * - saltos en las trayectorias (avance de más de 1.3 × v·dt o giro de más de 30° entre cuadros);
 * - el paisaje (`escenario.entorno.paisaje`) y el daño por vehículo (C1–C6 y energía).
 */
const RAIZ = resolve(__dirname, "../../..");
const SALIDA = resolve(RAIZ, process.env.CROQUIS_CAPTURAS ?? "apps/web/test-results/revision-3d");
const PEDIDA = process.env.CROQUIS_REVISION_3D === "1";
test.use({ viewport: { width: 1600, height: 900 }, locale: "es-MX", actionTimeout: 20_000 });

type Puente = {
  enviar(m: string, d: object): void;
  enviados: { metodo: string; datos: unknown }[];
};
type Xy = [number, number];

const enviar = (page: Page, m: string, d: object) =>
  page.evaluate(
    ([m, d]) => (window as unknown as { __croquisPuente: Puente }).__croquisPuente.enviar(m, d),
    [m, d] as const,
  );

function rectangulo(cx: number, cy: number, largo: number, ancho: number, rumbo: number): Xy[] {
  const c = Math.cos(rumbo);
  const s = Math.sin(rumbo);
  return [
    [largo / 2, ancho / 2],
    [-largo / 2, ancho / 2],
    [-largo / 2, -ancho / 2],
    [largo / 2, -ancho / 2],
  ].map(([dx, dy]) => [cx + dx! * c - dy! * s, cy + dx! * s + dy! * c]);
}

/** La menor superposición entre dos rectángulos (0 si no se tocan), por ejes separadores. */
function penetracion(a: Xy[], b: Xy[]): number {
  let menor = Infinity;
  for (const poly of [a, b])
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly[i]!;
      const [x2, y2] = poly[(i + 1) % 4]!;
      const l = Math.hypot(y2 - y1, x2 - x1);
      const n: Xy = [(y2 - y1) / l, -(x2 - x1) / l];
      const pa = a.map((p) => p[0] * n[0] + p[1] * n[1]);
      const pb = b.map((p) => p[0] * n[0] + p[1] * n[1]);
      const o =
        Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (o <= 0) return 0;
      menor = Math.min(menor, o);
    }
  return menor;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- el paquete se lee como JSON suelto. */
function medir(p: any) {
  const r = p.resultado;
  const e = p.escenario ?? {};
  const edificios: Xy[][] = (e.entorno?.edificios ?? []).map((b: any) =>
    rectangulo(b.x, b.y, b.largo_m, b.fondo_m, b.rumbo_rad),
  );
  const cruces: unknown[] = [];
  const saltos: unknown[] = [];
  for (const v of r.vehiculos) {
    const tr = v.trayectoria;
    const d = v.dimensiones;
    let peor = 0;
    for (let k = 0; k < tr.t.length; k += 2) {
      const q = rectangulo(tr.x[k], tr.y[k], d.largo_m, d.ancho_m, tr.rumbo[k]);
      for (const b of edificios) peor = Math.max(peor, penetracion(q, b));
    }
    if (peor > 0.15) cruces.push({ vehiculo: v.id, metros: Number(peor.toFixed(2)) });
    for (let k = 1; k < tr.t.length; k++) {
      const dt = tr.t[k] - tr.t[k - 1];
      if (dt <= 0) continue;
      const avance = Math.hypot(tr.x[k] - tr.x[k - 1], tr.y[k] - tr.y[k - 1]);
      const vel = Math.max(Math.hypot(tr.vx[k], tr.vy[k]), Math.hypot(tr.vx[k - 1], tr.vy[k - 1]));
      const giro = Math.abs(
        ((tr.rumbo[k] - tr.rumbo[k - 1] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI,
      );
      if (avance > vel * dt * 1.3 + 0.05 || giro > Math.PI / 6)
        saltos.push({ vehiculo: v.id, t: tr.t[k], avance_m: Number(avance.toFixed(2)) });
    }
  }
  const tris: Xy[][] = [];
  for (const c of e.via?.capas ?? []) {
    if (c.nombre !== "calzada") continue;
    for (let k = 0; k + 2 < c.indices.length; k += 3)
      tris.push(
        [0, 1, 2].map(
          (m) => [c.posiciones[2 * c.indices[k + m]], c.posiciones[2 * c.indices[k + m] + 1]] as Xy,
        ),
      );
  }
  const enTri = (x: number, y: number, [a, b, c]: Xy[]) => {
    if (Math.abs((b![0] - a![0]) * (c![1] - a![1]) - (c![0] - a![0]) * (b![1] - a![1])) < 1e-9)
      return false;
    const d1 = (x - b![0]) * (a![1] - b![1]) - (a![0] - b![0]) * (y - b![1]);
    const d2 = (x - c![0]) * (b![1] - c![1]) - (b![0] - c![0]) * (y - c![1]);
    const d3 = (x - a![0]) * (c![1] - a![1]) - (c![0] - a![0]) * (y - a![1]);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const dentro = (x: number, y: number) => tris.some((t) => enTri(x, y, t));
  const enMedio = (x: number, y: number) =>
    [
      [0.6, 0],
      [-0.6, 0],
      [0, 0.6],
      [0, -0.6],
    ].every(([dx, dy]) => dentro(x + dx!, y + dy!));
  const cosas: [string, number, number][] = [
    ...(e.entorno?.arboles ?? []).map((a: any) => ["arbol", a.x, a.y]),
    ...(e.entorno?.postes ?? []).map((a: any) => ["poste", a.x, a.y]),
    ...(e.entorno?.senales ?? []).map((a: any) => ["senal", a.x, a.y]),
    ...(e.luminarias ?? []).map((a: any) => ["luminaria", a.x, a.y]),
    ...(r.objetos ?? []).map((o: any) => [`objeto:${o.tipo}:${o.id}`, o.x, o.y]),
  ];
  return {
    cruces_con_edificios: cruces,
    en_medio_de_la_calzada: cosas.filter(([, x, y]) => tris.length && enMedio(x, y)),
    saltos,
    paisaje: e.entorno?.paisaje ?? null,
    zona: e.entorno?.zona ?? null,
    danos: r.vehiculos.map((v: any) => ({
      id: v.id,
      c_cm: (v.dano?.perfil_m ?? []).map((c: number) => Math.round(c * 1000) / 10),
      energia_kj: Math.round((v.dano?.energia_j ?? 0) / 100) / 10,
    })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const medido: Record<string, unknown> = {};

async function revisar3d(page: Page, clave: string) {
  const dir = join(SALIDA, clave);
  mkdirSync(dir, { recursive: true });
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 240_000,
  });
  await page.waitForTimeout(3000);
  const texto = await page.evaluate(() => {
    const e = (window as unknown as { __croquisPuente: Puente }).__croquisPuente.enviados.filter(
      (x) => x.metodo === "cargarCaso",
    );
    return e.length ? (e[e.length - 1]!.datos as { json: string }).json : null;
  });
  expect(texto, "la web no le mandó el caso a Unity").not.toBeNull();
  writeFileSync(join(dir, "paquete.json"), texto!);
  const paquete = JSON.parse(texto!);
  medido[clave] = medir(paquete);
  writeFileSync(join(SALIDA, "revision.json"), `${JSON.stringify(medido, null, 2)}\n`);
  const fin = Number(paquete.resultado.t_fin);
  const foto = (n: string) => page.screenshot({ path: join(dir, `${n}.png`) });
  const tomas: [number, string[]][] = [
    [fin, ["cenital", "orbita", "cinematica", "acera"]],
    [0.15, ["cinematica", "orbita"]],
  ];
  for (const [t, camaras] of tomas)
    for (const c of camaras) {
      await enviar(page, "fijarTiempo", { t });
      await enviar(page, "camara", { modo: c });
      await page.waitForTimeout(2200);
      await foto(`t${t.toFixed(2)}-${c}`);
    }
  await enviar(page, "camara", { modo: "cenital" });
  for (let t = -1.5; t <= Math.min(fin, 4); t += 0.5) {
    await enviar(page, "fijarTiempo", { t });
    await page.waitForTimeout(700);
    await foto(`serie${t.toFixed(1)}`);
  }
  await enviar(page, "camara", { modo: "cinematica" });
  await enviar(page, "fijarTiempo", { t: -0.6 });
  await page.waitForTimeout(1500);
  await enviar(page, "reproducir", {});
  for (const [k, ms] of [250, 450, 450, 450, 1200].entries()) {
    await page.waitForTimeout(ms);
    await foto(`lenta-${k}`);
  }
  await enviar(page, "pausar", {});
  await page.getByTestId("modo-presentar").click();
  await expect(page.getByTestId("presentar-caso")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(4000);
  await foto("presentar-1");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(4000);
  await foto("presentar-2");
  await page.keyboard.press("Escape");
}

async function conUnity(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });
}

async function reconstruirGuardado(page: Page, archivo: string) {
  await page.goto("/cesvi");
  await page.getByTestId("abrir-caso-casos").setInputFiles(archivo);
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
  await irAPaso(page, 4);
  const rec = page.getByTestId("reconstruir");
  if (await rec.isVisible().catch(() => false)) await rec.click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
  await page.waitForTimeout(2500);
}

test.describe("revisión visual del 3D", () => {
  test.skip(!PEDIDA, "A mano: CROQUIS_REVISION_3D=1, con el 3D real y ventana.");
  test.describe.configure({ mode: "serial" });

  for (const r of RECETAS) {
    test(`ejemplo ${r.clave}`, async ({ page }) => {
      test.setTimeout(900_000);
      await conUnity(page);
      await page.goto("/cesvi/casos/nuevo");
      await page.getByTestId("usar-ejemplo-inicio").click();
      await page.locator(`[data-ejemplo="${r.clave}"]`).click();
      await page.getByTestId("leer-narracion").click();
      await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
      await irAPaso(page, 3);
      const notas: string[] = [];
      expect(await colocar(page, r, notas), notas.join(" ")).toBeTruthy();
      await page.getByTestId("avance-ver-reconstruccion").click();
      await page.getByTestId("reconstruir").click();
      await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
      await page.waitForTimeout(2500);
      await revisar3d(page, r.clave);
    });
  }

  const guardados: [string, string][] = [
    ["tollocan", join(RAIZ, "data/cesvi/casos/tollocan-rene.croquis")],
    ["reforma-camellon", join(RAIZ, "data/cesvi/casos/bateria-reforma-poste.croquis")],
    ...(process.env.CROQUIS_CASOS_3D ?? "")
      .split(",")
      .filter(Boolean)
      .map((f, k): [string, string] => [`extra-${k + 1}`, resolve(f)]),
  ];
  for (const [clave, archivo] of guardados) {
    test(`caso guardado ${clave}`, async ({ page }) => {
      test.setTimeout(900_000);
      await conUnity(page);
      await reconstruirGuardado(page, archivo);
      await revisar3d(page, clave);
    });
  }
});
