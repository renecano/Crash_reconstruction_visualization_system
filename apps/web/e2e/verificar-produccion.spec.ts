import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { colocar, RECETAS } from "./recetas-ejemplos";

/**
 * Lo publicado, en producción (René, 2026-11-26): los cinco ejemplos colocados con su receta y AXA dan
 * las cifras del índice, y el ejemplo del poste propone al Sentra por la Calle 16 de Septiembre de
 * poniente a oriente (sin el «¿Seguro?» del #320). Corre con `CROQUIS_URL=https://croquis-sage.vercel.app`;
 * `base.ts` bloquea Vercel Blob (no baja el Unity de producción).
 */
const SALIDA = process.env.CROQUIS_CAPTURAS ?? "verificar-produccion";
/** El sitio publicado («Capturas» no pasa variables: por omisión, producción). */
const SITIO = process.env.CROQUIS_URL ?? "https://croquis-sage.vercel.app";
const RAIZ = resolve(__dirname, "../../..");
const tabla = JSON.parse(
  readFileSync(join(RAIZ, "eval/results/ejemplos_en_su_lugar/cifras.json"), "utf8"),
) as {
  filas: {
    clave: string;
    cifra_de: string | null;
    velocidades: {
      vehiculo: string;
      mejor: number | null;
      p10: number | null;
      p90: number | null;
    }[];
  }[];
};
const indice = (
  JSON.parse(readFileSync(join(RAIZ, "eval/results/cifras.json"), "utf8")) as {
    cifras: Record<string, { mejor?: number; p10?: number; p90?: number }>;
  }
).cifras;

test.use({ actionTimeout: 20_000, viewport: { width: 1440, height: 900 }, locale: "es-MX" });

test("producción: los cinco ejemplos, AXA y el Sentra del poste", async ({ page }) => {
  test.setTimeout(1_200_000);
  mkdirSync(SALIDA, { recursive: true });
  const filas: Record<string, unknown>[] = [];
  const cifra = page.getByTestId("cifra-reconstruccion");
  for (const r of RECETAS) {
    const esperada = tabla.filas.find((f) => f.clave === r.clave)!;
    const v = esperada.velocidades.find((x) => x.vehiculo === esperada.cifra_de)!;
    await page.goto(`${SITIO}/cesvi`);
    await page.getByTestId("ir-caso-nuevo").click();
    await irAPaso(page, 2);
    await page.locator(`[data-ejemplo="${r.clave}"]`).click();
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
    await irAPaso(page, 3);
    const notas: string[] = [];
    await colocar(page, r, notas);
    const resumen = (
      await page
        .getByTestId("escena-lista")
        .innerText()
        .catch(() => "")
    ).replace(/\s+/g, " ");
    await page.screenshot({ path: join(SALIDA, `${r.clave}-escena.png`) });
    await page.getByTestId("avance-ver-reconstruccion").click();
    await page.getByTestId("reconstruir").click();
    await expect(cifra).toBeVisible({ timeout: 120_000 });
    const texto = (await cifra.innerText()).replace(/\s+/g, " ");
    await page.screenshot({ path: join(SALIDA, `${r.clave}-cifra.png`) });
    const quiere = `${v.mejor} km/h`;
    const rango = `${v.p10}–${v.p90}`;
    filas.push({
      clave: r.clave,
      esperada: `${quiere} (${rango})`,
      coincide: texto.includes(` ${v.mejor} km/h`) && texto.includes(rango),
      texto: texto.slice(0, 240),
      notas,
      resumen: resumen.slice(0, 600),
    });
  }
  // AXA: la cifra de V2 y su rango del índice.
  await page.goto(`${SITIO}/cesvi`);
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 60_000 });
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(cifra).toBeVisible({ timeout: 240_000 });
  const axa = (await cifra.innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: join(SALIDA, "axa-cifra.png") });
  const i2 = indice["axa.v2"]!;
  filas.push({
    clave: "axa",
    esperada: `${i2.mejor} (${i2.p10}–${i2.p90})`,
    coincide:
      axa.includes(`${Math.round(i2.mejor!)} km/h`) &&
      axa.includes(`${Math.round(i2.p10!)}–${Math.round(i2.p90!)}`),
    texto: axa.slice(0, 240),
  });
  writeFileSync(join(SALIDA, "verificacion.json"), JSON.stringify(filas, null, 1));
  // El poste: sin «¿Seguro?» y el Sentra por la Calle 16 de Septiembre.
  const poste = filas.find((f) => f.clave === "poste-terraceria")!;
  expect((poste.notas as string[]).some((n) => n.includes("¿Seguro?"))).toBe(false);
  expect(String(poste.resumen)).toContain("Calle 16 de Septiembre");
  for (const f of filas) expect(f.coincide, `${String(f.clave)}: ${String(f.texto)}`).toBe(true);
});
