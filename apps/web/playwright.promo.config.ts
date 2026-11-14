import { defineConfig, devices } from "@playwright/test";

/**
 * El recorrido para el material promocional (René, 2026-11-13), contra el sitio publicado y con el
 * Unity real de Blob, a 2560×1440 con deviceScaleFactor 2, de día y de noche:
 *
 *   CROQUIS_PROMO=D:\Croquis-promo\recorrido pnpm --filter @croquis/web exec playwright test \
 *     --config playwright.promo.config.ts --headed
 *
 * Las imágenes no entran al repo. No corre en CI: necesita GPU y llama a Claude (el caso nuevo).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /promo-recorrido\.spec\.ts$/,
  workers: 1,
  reporter: "line",
  timeout: 1_200_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.CROQUIS_URL ?? "https://croquis-sage.vercel.app",
    serviceWorkers: "block",
    locale: "es-MX",
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] },
  },
  projects: [{ name: "chromium" }],
});
