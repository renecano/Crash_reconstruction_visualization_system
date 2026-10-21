import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // El service worker (ADR 0030) atiende peticiones que `page.route` no ve; solo la prueba sin red
    // (`sin-red.spec.ts`) lo permite.
    serviceWorkers: "block",
    locale: "es-MX",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Celular (F11a): la portada, el flujo guiado, las páginas y la accesibilidad, en táctil.
    {
      name: "movil",
      use: { ...devices["Pixel 7"] },
      testMatch: /(portada|relato|paginas|e9|accesibilidad|capturas-diseno)\.spec\.ts$/,
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
