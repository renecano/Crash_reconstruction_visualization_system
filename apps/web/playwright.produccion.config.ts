import { defineConfig, devices } from "@playwright/test";

/**
 * U6: la prueba del flujo completo con el Unity real contra el sitio publicado, sin levantar Next:
 *
 *   CROQUIS_URL=https://croquis-sage.vercel.app pnpm --filter @croquis/web exec playwright test \
 *     --config playwright.produccion.config.ts --headed
 *
 * Usa el build de Unity de Blob que dice el manifiesto del sitio. No corre en CI.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /visor-unity-real\.spec\.ts$/,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: process.env.CROQUIS_URL ?? "https://croquis-sage.vercel.app",
    serviceWorkers: "block",
    locale: "es-MX",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
