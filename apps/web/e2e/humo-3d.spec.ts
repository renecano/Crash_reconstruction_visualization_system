import { join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";

/**
 * El humo de las tandas (René, 2026-11-20): antes de gastar 2 horas, AXA y el caso de Tollocan pasan
 * por La escena nueva (la de la propuesta 1, como la ve una persona: la guía, la lista y «Ver la
 * reconstrucción» dentro del panel) hasta que el visor Unity está en «listo». Si no llega, la tanda se
 * detiene (`detiene_si_falla`). No lleva @flujo ni corre en CI: necesita el Unity real.
 *
 *   CROQUIS_URL=http://localhost:3000 pnpm exec playwright test -c playwright.produccion.config.ts e2e/humo-3d.spec.ts
 */
const RAIZ = resolve(__dirname, "../../..");

test.use({
  viewport: { width: 1440, height: 900 },
  ...(process.env.CROQUIS_CANAL ? { channel: process.env.CROQUIS_CANAL } : {}),
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __croquisVisorUnity?: boolean }).__croquisVisorUnity = true;
    try {
      localStorage.setItem("croquis.escena", "nueva");
    } catch {
      // Sin almacenamiento: el flujo nuevo es el de omisión.
    }
  });
});

/** De La escena a Reconstrucción y al 3D, hasta «listo». */
async function hastaEl3d(page: Page) {
  await irAPaso(page, 3);
  await expect(page.getByTestId("lista-escena")).toBeVisible({ timeout: 30_000 });
  await irAPaso(page, 4);
  const rec = page.getByTestId("reconstruir");
  if (await rec.isVisible().catch(() => false)) await rec.click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 90_000,
  });
}

test("humo: AXA de La escena nueva al 3D de Unity", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
  await hastaEl3d(page);
});

test("humo: Tollocan de La escena nueva al 3D de Unity", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/cesvi");
  await page
    .getByTestId("abrir-caso-casos")
    .setInputFiles(join(RAIZ, "data/cesvi/casos/tollocan-rene.croquis"));
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
  await hastaEl3d(page);
});
