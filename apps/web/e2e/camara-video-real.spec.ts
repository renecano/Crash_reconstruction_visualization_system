import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { colocarComoPerito, conLaEscenaNueva } from "./recetas-perito";

/**
 * La cámara «Automática» del video (René, 2026-11-27: «en AXA se ve desde atrás de las camionetas y no
 * se ve el contacto»), con el Unity real: en el cuadro del impacto, el punto de contacto cae dentro del
 * cuadro y nada lo tapa. No es a ojo: Unity proyecta el punto (`depurar` `{"contacto": true}`) y revisa
 * el rayo contra lo construido, las copas y los vehículos. A mano, nunca en CI (necesita GPU).
 *
 *   CROQUIS_URL=http://localhost:3000 pnpm exec playwright test -c playwright.produccion.config.ts \
 *     e2e/camara-video-real.spec.ts --headed
 *
 * Las capturas llevan AXA: quedan fuera del repo (`~/croquis-ensayo/camara-video`).
 */
const SALIDA = resolve(
  process.env.CROQUIS_ENSAYO ?? join(homedir(), "croquis-ensayo", "camara-video"),
);
test.use({ viewport: { width: 1366, height: 768 }, locale: "es-MX" });

type Puente = {
  enviar(m: string, d: object): void;
  depurar(d: object): void;
  recibidos: { tipo: string; pedido?: number; [k: string]: unknown }[];
};

async function contactoEnElImpacto(page: Page, nombre: string) {
  await page.evaluate(() => {
    const p = (window as unknown as { __croquisPuente: Puente }).__croquisPuente;
    p.enviar("pausar", {});
    p.enviar("camara", { modo: "automatica" });
    p.enviar("fijarTiempo", { t: 0 });
  });
  await page.waitForTimeout(1500);
  const pedido = Date.now() % 100000;
  const r = await page.evaluate(async (pedido) => {
    const p = (window as unknown as { __croquisPuente: Puente }).__croquisPuente;
    p.depurar({ contacto: true, pedido });
    for (let i = 0; i < 100; i++) {
      const m = p.recibidos.find((q) => q.tipo === "perfil" && q.pedido === pedido);
      if (m) return m;
      await new Promise((ok) => setTimeout(ok, 100));
    }
    return null;
  }, pedido);
  mkdirSync(SALIDA, { recursive: true });
  await page.screenshot({ path: join(SALIDA, `${nombre}-impacto.jpg`), quality: 85 });
  writeFileSync(join(SALIDA, `${nombre}-contacto.json`), JSON.stringify(r, null, 2));
  expect(r, "Unity no contestó dónde se ve el contacto").toBeTruthy();
  expect(r!.sin_contacto, "el caso no trae punto de impacto").toBeFalsy();
  // Dentro del cuadro, con margen (no en la orilla), y sin nada que lo tape.
  expect(r!.fx as number).toBeGreaterThan(0.1);
  expect(r!.fx as number).toBeLessThan(0.9);
  expect(r!.fy as number).toBeGreaterThan(0.1);
  expect(r!.fy as number).toBeLessThan(0.9);
  expect(r!.despejado).toBe(true);
}

async function abrirEl3d(page: Page) {
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 600_000,
  });
  await page.waitForTimeout(3000);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });
});

for (const ejemplo of ["alcance-deformacion", "crucero-noche"] as const) {
  test(`la automática ve el contacto en el impacto: ${ejemplo}`, async ({ page }) => {
    test.setTimeout(900_000);
    await conLaEscenaNueva(page);
    await page.goto("/cesvi");
    await page.getByTestId("ir-caso-nuevo").click();
    await irAPaso(page, 2);
    await page.locator(`[data-ejemplo="${ejemplo}"]`).click();
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
    await irAPaso(page, 3);
    const notas: string[] = [];
    expect(await colocarComoPerito(page, ejemplo, notas), notas.join(" ")).toBe(true);
    await irAPaso(page, 4);
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruida")).toBeVisible({ timeout: 240_000 });
    await abrirEl3d(page);
    await contactoEnElImpacto(page, ejemplo);
  });
}

test("la automática ve el contacto en el impacto: AXA", async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 60_000 });
  await irAPaso(page, 4);
  const rec = page.getByTestId("reconstruir");
  if (await rec.isVisible().catch(() => false)) await rec.click();
  await expect(page.getByTestId("cifra-reconstruida")).toBeVisible({ timeout: 240_000 });
  await abrirEl3d(page);
  await contactoEnElImpacto(page, "axa");
});
