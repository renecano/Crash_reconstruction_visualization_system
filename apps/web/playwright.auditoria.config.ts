import { defineConfig, devices } from "@playwright/test";

/**
 * El recorrido de la auditoría (2026-11-15) contra el sitio publicado, como lo usaría un perito:
 * 1440×900, con el Unity real. No corre en CI: necesita GPU y el caso nuevo llama a Claude una vez.
 *
 *   pnpm --filter @croquis/web exec playwright test --config playwright.auditoria.config.ts --headed
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /auditoria-recorrido\.spec\.ts$/,
  workers: 1,
  reporter: "line",
  timeout: 1_500_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.CROQUIS_URL ?? "https://croquis-sage.vercel.app",
    serviceWorkers: "block",
    locale: "es-MX",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] },
  },
  projects: [{ name: "chromium" }],
});
