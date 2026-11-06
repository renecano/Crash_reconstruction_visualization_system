/**
 * Las seis cámaras del visor (René, 2026-11-04: tras el #161, «Conductor A/B» no se ponían en los
 * ojos del conductor y a veces el botón se marcaba sin que la vista cambiara). No bloquea el merge
 * (no es `@flujo`): necesita GPU real (`headless: false`). Para AXA (el caso) y lateral_interseccion
 * (el visor), con WebGPU y con WebGL: con el reloj en pausa antes del impacto, pulsa cada botón y
 * comprueba que la pose de la cámara cambia, que en «Conductor A/B» la cámara queda dentro de la
 * cabina de su vehículo y que ahí no se dibuja la línea de visión. Guarda las capturas en
 * `docs/cesvi/t1/camaras/` (con WebGPU, el backend de la M1).
 *
 *   pnpm --filter @croquis/web exec playwright test e2e/camaras.spec.ts --project=chromium
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { colocarTodo, irAPaso } from "./ayuda-recorrido";

const CAPTURAS = resolve(__dirname, "../../../docs/cesvi/t1/camaras");
const BACKENDS = (process.env.BACKENDS ?? "webgpu,webgl").split(",");
const MODO_DE_BOTON: Record<string, string> = {
  Libre: "libre",
  Cenital: "cenital",
  Cinematográfica: "cinematica",
  Daño: "dano",
};

test.use({
  headless: false,
  launchOptions: { args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"] },
  viewport: { width: 1600, height: 900 },
});
test.describe.configure({ timeout: 900_000 });

interface Pose {
  dibujada: string | null;
  posicion: [number, number, number];
  direccion: [number, number, number];
  /** Si la cámara está dentro de la cabina de cada vehículo (coordenadas del vehículo). */
  dentroDe: Record<string, boolean>;
  /** Líneas de visión dibujadas. */
  lineasVisibles: number;
}

const leerPose = (page: Page) =>
  page.evaluate((): Pose => {
    const cam = window.__croquisCamara3d!;
    const graph = window.__croquisGrafo!;
    cam.updateMatrixWorld(true);
    const p = cam.position.clone();
    const dir = cam.getWorldDirection(p.clone());
    const dentroDe: Record<string, boolean> = {};
    for (const v of graph.vehicles) {
      v.group.updateMatrixWorld(true);
      const local = v.group.worldToLocal(p.clone());
      const dims = v.group.userData.dims as
        { length: number; width: number; height: number } | undefined;
      if (!dims) continue;
      dentroDe[v.id] =
        Math.abs(local.x) < dims.length / 2 &&
        Math.abs(local.z) < dims.width / 2 &&
        local.y > 0.3 &&
        local.y < dims.height;
    }
    let lineasVisibles = 0;
    window.__croquisEscena?.getObjectByName("visibilidad")?.traverse((o) => {
      if (o.name.startsWith("vista_") && o.visible) lineasVisibles++;
    });
    const visible = window.__croquisEscena?.getObjectByName("visibilidad")?.visible ?? false;
    return {
      dibujada: window.__croquisCamaraDibujada ?? null,
      posicion: [p.x, p.y, p.z],
      direccion: [dir.x, dir.y, dir.z],
      dentroDe,
      lineasVisibles: visible ? lineasVisibles : 0,
    };
  });

const distancia = (a: Pose, b: Pose) =>
  Math.hypot(
    a.posicion[0] - b.posicion[0],
    a.posicion[1] - b.posicion[1],
    a.posicion[2] - b.posicion[2],
  ) +
  Math.hypot(
    a.direccion[0] - b.direccion[0],
    a.direccion[1] - b.direccion[1],
    a.direccion[2] - b.direccion[2],
  );

/** Pausa el reloj un segundo antes del impacto (con líneas de visión, y la acción a la vista). */
const pausar = (page: Page) =>
  page.evaluate(() => {
    const reloj = window.__croquisReloj!;
    reloj.set((s) => ({ ...s, t: -1, playing: false }));
  });

async function probarCamaras(page: Page, escena: string, backend: string) {
  await page.waitForFunction(() => window.__croquisGraphReady === true, null, { timeout: 600_000 });
  await pausar(page);
  await page.waitForTimeout(500);
  const botones = page.getByTestId("camaras").getByRole("radio");
  const n = await botones.count();
  expect(n).toBeGreaterThanOrEqual(6);
  let previa = await leerPose(page);
  const vehiculos = await page.evaluate(() => window.__croquisGrafo!.vehicles.map((v) => v.id));
  const resultados: { boton: string; cambio: number; dibujada: string | null }[] = [];
  for (let i = 0; i < n; i++) {
    const b = botones.nth(i);
    const nombre = ((await b.textContent()) ?? "").trim();
    await b.click();
    // La transición entre cámaras dura 1.2 s.
    await page.waitForTimeout(1600);
    const pose = await leerPose(page);
    const cambio = distancia(pose, previa);
    resultados.push({ boton: nombre, cambio, dibujada: pose.dibujada });
    expect
      .soft(cambio, `${escena}/${backend}: «${nombre}» no cambió la vista`)
      .toBeGreaterThan(0.2);
    const esperada = MODO_DE_BOTON[nombre];
    if (esperada)
      expect
        .soft(pose.dibujada, `${escena}/${backend}: «${nombre}» dibuja otra cámara`)
        .toBe(esperada);
    if (nombre.startsWith("Conductor")) {
      const letra = nombre.slice(-1);
      const id = vehiculos[letra.charCodeAt(0) - 65]!;
      expect.soft(pose.dibujada, `${escena}/${backend}: «${nombre}»`).toBe(`conductor-${id}`);
      expect
        .soft(pose.dentroDe[id], `${escena}/${backend}: «${nombre}» fuera de la cabina de ${id}`)
        .toBe(true);
      expect
        .soft(pose.lineasVisibles, `${escena}/${backend}: línea de visión en «${nombre}»`)
        .toBe(0);
    }
    if (backend === "webgpu" || !BACKENDS.includes("webgpu")) {
      const archivo = nombre
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, "-");
      // Arriba de la página: si no, la barra fija del sitio queda encima del visor.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page
        .getByTestId("marco-visor")
        .screenshot({ path: resolve(CAPTURAS, `${escena}-${archivo}.png`) });
    }
    previa = pose;
  }
  const diag = await page.evaluate(() => ({
    backend: window.__croquisDiagnostico?.backend ?? null,
    tareasLargas: (window.__croquisDiagnostico?.tareasLargas ?? []).map((t) => ({
      ms: Math.round(t.duracion),
      causa: t.causa,
    })),
  }));
  console.log(`${escena}/${backend}`, JSON.stringify({ resultados, diag }));
}

mkdirSync(CAPTURAS, { recursive: true });

for (const backend of BACKENDS) {
  test(`cámaras en lateral_interseccion (${backend})`, async ({ page }) => {
    await page.goto(`/visor?escena=lateral_interseccion&camara=cinematica&renderer=${backend}`);
    await probarCamaras(page, "lateral_interseccion", backend);
  });

  test(`cámaras en el caso de AXA (${backend})`, async ({ page }) => {
    await page.goto(`/cesvi/casos/a2010930?renderer=${backend}`);
    await irAPaso(page, 3);
    await colocarTodo(page);
    await irAPaso(page, 4);
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("vista-3d").click();
    await probarCamaras(page, "axa", backend);
  });
}
