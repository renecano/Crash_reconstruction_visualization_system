/**
 * El `test` de todas las e2e: el de Playwright, con cada contexto del navegador sin Vercel Blob
 * (`sin-blob.ts`, René 2026-11-17). Las pruebas importan `test` y `expect` de aquí.
 */
import { expect, test as base } from "@playwright/test";
import { pedidasABlob, sinBlob } from "./sin-blob";

export const test = base.extend({
  context: async ({ context }, usar) => {
    await sinBlob(context);
    await usar(context);
    const pedidas = pedidasABlob(context);
    if (pedidas.length)
      throw new Error(
        `La prueba pidió ${pedidas.length} archivo(s) a Vercel Blob sin copia local: ${pedidas.slice(0, 3).join(", ")}`,
      );
  },
});

export { expect };
