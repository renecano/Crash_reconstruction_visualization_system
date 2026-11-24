/**
 * El `test` de todas las e2e: el de Playwright, con cada contexto del navegador sin Vercel Blob
 * (`sin-blob.ts`, René 2026-11-17). Las pruebas importan `test` y `expect` de aquí.
 */
import { expect, test as base } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";
import { pedidasABlob, sinBlob } from "./sin-blob";

/**
 * Ronda 4: las e2e de siempre recorren La escena de una pregunta a la vez (`?escena=anterior`); la del
 * flujo nuevo (la escena ya armada, con su lista) pone «nueva» en su página. Y el 2D de Reconstrucción
 * como maqueta (el croquis pericial tiene su propia e2e). También para las pruebas que abren su propio
 * navegador (la medición del arranque), que no pasan por este `test`.
 */
export async function flujoDeSiempre(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      if (!localStorage.getItem("croquis.escena"))
        localStorage.setItem("croquis.escena", "anterior");
      if (!localStorage.getItem("croquis.2d")) localStorage.setItem("croquis.2d", "maqueta");
    } catch {
      // Sin almacenamiento: el flujo nuevo.
    }
  });
}

export const test = base.extend({
  context: async ({ context }, usar) => {
    await sinBlob(context);
    await flujoDeSiempre(context);
    await usar(context);
    const pedidas = pedidasABlob(context);
    if (pedidas.length)
      throw new Error(
        `La prueba pidió ${pedidas.length} archivo(s) a Vercel Blob sin copia local: ${pedidas.slice(0, 3).join(", ")}`,
      );
  },
});

export { expect };
