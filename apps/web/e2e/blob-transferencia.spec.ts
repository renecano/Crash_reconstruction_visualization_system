import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { expect, test } from "./base";
import { sinBlob } from "./sin-blob";
import { irAPaso } from "./ayuda-recorrido";

/**
 * Cuánto baja una visita al 3D, por servidor (René, 2026-11-15: el Blob Data Transfer de Vercel). A
 * mano, no lleva @flujo: necesita la GPU y gasta transferencia real.
 *
 * Un perfil de Chrome con caché en disco, como el navegador de la demo, abre AXA, reconstruye y
 * espera a que Unity esté listo (primera visita). En el mismo navegador abre AXA otra vez (segunda
 * visita). En cada una suma, con el protocolo de Chrome, los bytes que llegaron por la red de cada
 * servidor (comprimidos, como se cobran) y los que salieron de la caché sin bajar.
 *
 *   CROQUIS_URL=https://croquis-sage.vercel.app pnpm exec playwright test \
 *     -c playwright.produccion.config.ts e2e/blob-transferencia.spec.ts --headed
 *     → eval/results/blob_transferencia.json (o la ruta de CROQUIS_SALIDA)
 */
const RAIZ = resolve(__dirname, "../../..");
const SALIDA = process.env.CROQUIS_SALIDA ?? join(RAIZ, "eval/results/blob_transferencia.json");

interface Cuenta {
  red_bytes: number;
  peticiones_red: number;
  de_cache: number;
}

/** Abre AXA hasta ver el 3D de Unity y devuelve lo que bajó por servidor. */
async function visita(page: Page): Promise<Record<string, Cuenta>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const hostDe = new Map<string, string>();
  const porHost: Record<string, Cuenta> = {};
  const de = (h: string) => (porHost[h] ??= { red_bytes: 0, peticiones_red: 0, de_cache: 0 });
  cdp.on("Network.requestWillBeSent", (e) => {
    try {
      hostDe.set(e.requestId, new URL(e.request.url).host);
    } catch {
      // data: y blob: no son de un servidor.
    }
  });
  cdp.on("Network.requestServedFromCache", (e) => {
    const h = hostDe.get(e.requestId);
    if (h) de(h).de_cache++;
  });
  cdp.on("Network.responseReceived", (e) => {
    const h = hostDe.get(e.requestId);
    if (h && (e.response.fromDiskCache || e.response.fromPrefetchCache)) de(h).de_cache++;
  });
  cdp.on("Network.loadingFinished", (e) => {
    const h = hostDe.get(e.requestId);
    if (h && e.encodedDataLength > 0) {
      de(h).red_bytes += e.encodedDataLength;
      de(h).peticiones_red++;
    }
  });
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible();
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 240_000,
  });
  // Lo que Unity pide después de «listo» (modelos, cielo): unos segundos más.
  await page.waitForTimeout(8000);
  await cdp.detach();
  return porHost;
}

const mb = (b: number) => Math.round((b / 1e6) * 100) / 100;
const resumen = (c: Record<string, Cuenta>) =>
  Object.fromEntries(
    Object.entries(c)
      .sort((a, b) => b[1].red_bytes - a[1].red_bytes)
      .map(([h, v]) => [
        h,
        { red_mb: mb(v.red_bytes), peticiones_red: v.peticiones_red, de_cache: v.de_cache },
      ]),
  );

test("lo que baja una visita al 3D, primera y segunda vez, por servidor", async ({ baseURL }) => {
  // Mide la transferencia real de Blob: nada la corre sin permiso explícito (René, 2026-11-17).
  test.skip(
    process.env.CROQUIS_PERMITIR_BLOB !== "1",
    "Gasta transferencia real de Vercel Blob: solo con CROQUIS_PERMITIR_BLOB=1 y el visto bueno de René.",
  );
  test.setTimeout(600_000);
  const perfil = mkdtempSync(join(tmpdir(), "croquis-perfil-"));
  const ctx = await chromium.launchPersistentContext(perfil, {
    headless: false,
    args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"],
    baseURL,
    locale: "es-MX",
    serviceWorkers: "block",
    reducedMotion: "reduce",
    viewport: { width: 1600, height: 900 },
  });
  await sinBlob(ctx);
  try {
    await ctx.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
    });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const primera = await visita(page);
    const otra = await ctx.newPage();
    await page.close();
    const segunda = await visita(otra);
    const blob = (c: Record<string, Cuenta>) =>
      Object.entries(c)
        .filter(([h]) => h.endsWith(".blob.vercel-storage.com"))
        .reduce((a, [, v]) => a + v.red_bytes, 0);
    const salida = {
      descripcion:
        "Bytes que llegan por la red (comprimidos, como los cobra Vercel) al abrir AXA hasta ver el 3D de Unity, por servidor, en un perfil de Chrome con caché en disco: primera visita y, en el mismo navegador, segunda.",
      sitio: baseURL,
      fecha: new Date().toISOString(),
      blob_primera_mb: mb(blob(primera)),
      blob_segunda_mb: mb(blob(segunda)),
      primera: resumen(primera),
      segunda: resumen(segunda),
    };
    mkdirSync(join(SALIDA, ".."), { recursive: true });
    writeFileSync(SALIDA, `${JSON.stringify(salida, null, 2)}\n`);
    console.log(
      JSON.stringify({
        blob_primera_mb: salida.blob_primera_mb,
        blob_segunda_mb: salida.blob_segunda_mb,
      }),
    );
  } finally {
    await ctx.close();
    rmSync(perfil, { recursive: true, force: true });
  }
});
