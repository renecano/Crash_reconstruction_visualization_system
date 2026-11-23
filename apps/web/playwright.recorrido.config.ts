import { defineConfig, devices } from "@playwright/test";

/**
 * Las fotos del recorrido de la app para las piezas promocionales (René, 2026-11-21), en la demo
 * local de la tanda (la versión que se va a publicar), con el Unity real en calidad alta, a 2560×1440
 * con deviceScaleFactor 2, en PNG:
 *
 *   CROQUIS_URL=http://localhost:3000 CROQUIS_RECORRIDO=recorrido pnpm --filter @croquis/web exec \
 *     playwright test --config playwright.recorrido.config.ts
 *
 * Sin la barra de «software de prueba» de Chrome. No corre en CI: necesita GPU y el Unity real.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /recorrido-fotos\.spec\.ts$/,
  workers: 1,
  reporter: "line",
  timeout: 1_800_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.CROQUIS_URL ?? "http://localhost:3000",
    ...(process.env.CROQUIS_CANAL ? { channel: process.env.CROQUIS_CANAL } : {}),
    serviceWorkers: "block",
    locale: "es-MX",
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    // Un clic que nunca llega (otro elemento encima) falla en 1 min, no al tope de la prueba.
    actionTimeout: 60_000,
    launchOptions: {
      args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--disable-infobars"],
      ignoreDefaultArgs: ["--enable-automation"],
    },
  },
  projects: [{ name: "chromium" }],
});
