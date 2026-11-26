import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { colocar, RECETAS } from "./recetas-ejemplos";

/** Diagnóstico de la t9-junta (2026-11-26): por qué el mapa de La escena no queda estable. */
const SALIDA = process.env.CROQUIS_CAPTURAS ?? "diag-ejemplos";

// Como la e2e de los ejemplos: 1440×900 y 20 s por acción.
test.use({ actionTimeout: 20_000, viewport: { width: 1440, height: 900 }, locale: "es-MX" });

test("diagnóstico del mapa en el primer ejemplo", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(SALIDA, { recursive: true });
  const r = RECETAS[0]!;
  const consola: string[] = [];
  page.on("console", (m) => consola.push(`${m.type()}: ${m.text()}`.slice(0, 300)));
  page.on("pageerror", (e) => consola.push(`pageerror: ${e.message}`.slice(0, 300)));
  let llamadas = 0;
  page.on("request", (q) => {
    if (q.url().includes("/api/cesvi/escena")) llamadas++;
  });
  await page.goto("/cesvi");
  // Como la e2e de los ejemplos: un contexto WebGL para leer la tarjeta de video.
  const gpu = await page
    .evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
    })
    .catch(() => null);
  consola.push(`gpu: ${gpu}`);
  await page.getByTestId("ir-caso-nuevo").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible();
  await irAPaso(page, 2);
  await page.locator(`[data-ejemplo="${r.clave}"]`).click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: join(SALIDA, "1-leida.jpg"), type: "jpeg", quality: 80 });
  consola.push(`llamadas a Claude: ${llamadas}`);
  await irAPaso(page, 3);
  const notas: string[] = [];
  let error = "";
  try {
    await colocar(page, r, notas);
  } catch (e) {
    error = (e as Error).message.slice(0, 1500);
  }
  await page.screenshot({ path: join(SALIDA, "falla.png") });
  const cajas: unknown[] = [];
  for (let i = 0; i < 12; i++) {
    cajas.push(
      await page.evaluate(() => {
        const m = document.querySelector('[data-testid="mapa-facil"]');
        const r = m?.getBoundingClientRect();
        const c = m?.querySelector("canvas")?.getBoundingClientRect();
        return {
          t: performance.now(),
          mapa: r && [r.x, r.y, r.width, r.height].map((x) => Math.round(x * 10) / 10),
          canvas: c && [c.x, c.y, c.width, c.height].map((x) => Math.round(x * 10) / 10),
          listo: m?.getAttribute("data-listo"),
          estilo: (m as HTMLElement | null)?.getAttribute("style"),
          clase: m?.getAttribute("class"),
          pregunta: document.querySelector('[data-testid="escena-pregunta"]')?.textContent,
          alertas: [...document.querySelectorAll('[data-testid^="mensaje-"]')].map((x) =>
            x.textContent?.slice(0, 160),
          ),
        };
      }),
    );
    await page.waitForTimeout(150);
  }
  writeFileSync(
    join(SALIDA, "diagnostico.json"),
    JSON.stringify({ error, notas, cajas, consola: consola.slice(-60) }, null, 1),
  );
});
