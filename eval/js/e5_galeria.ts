/**
 * Galería de E5 (PLAN E5 c, ADR 0032): render de Croquis de cada foto elegida por
 * `uv run croquis-eval e5-galeria` (`eval/results/e5_galeria.json`) y la página
 * `docs/galeria-e5/README.md` con cada par lado a lado.
 *
 * El render arma el vehículo como el visor con el daño que predice Croquis (`e5/galeria-entry.ts`),
 * en Chromium con WebGL por software (SwiftShader), desde la vista de la foto real, con la franja de
 * la leyenda (PLAN §10). La galería es cualitativa: no lleva números que no salgan de E5.
 *
 * Uso: `uv run croquis-eval e5-casos` y `pnpm --filter @croquis/eval-js exec tsx e5_galeria.ts`.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import * as esbuild from "esbuild";
import type { Caso } from "./e5/reproducir";
import { seedFor } from "./e5/reproducir";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const ORIGIN = "https://e5.croquis";
const WIDTH = 960;
const HEIGHT = 640;
/** La leyenda obligatoria (PLAN §10), con el origen real de esta reconstrucción: una prueba. */
const LEGEND =
  "Reconstrucción ilustrativa generada a partir de los datos de la prueba. No es un peritaje.";

interface Foto {
  id: string;
  prueba: number;
  tipo: string;
  lado: string;
  clase: string;
  anio: number | null;
  detalle: string;
  vista: string;
  foto_hallada_por: string;
  foto_url: string;
  foto_archivo: string;
  foto_derivada: string;
  render: string;
}

const TIPO: Record<string, string> = {
  frontal: "Frontal completo",
  frontal_desplazado: "Frontal desplazado",
  lateral: "Lateral",
  alcance: "Alcance (trasero)",
  poste: "Poste",
};
const CARA: Record<string, string> = {
  F: "frente",
  B: "parte trasera",
  L: "costado izquierdo",
  R: "costado derecho",
};

/** Hash de las entradas que recibe Croquis del caso (sin lo medido después de la prueba). */
export function inputHash(c: Caso): string {
  const inputs = {
    clase: c.clase,
    masa_kg: c.masa_kg,
    largo_m: c.largo_m,
    ancho_m: c.ancho_m,
    batalla_m: c.batalla_m,
    lado: c.lado,
    zona: c.zona,
    pdof_deg: c.pdof_deg,
    obstaculo: c.obstaculo,
    velocidad_kmh: c.velocidad_kmh,
    poste_diametro_m: c.poste_diametro_m,
    otro_masa_kg: c.otro_masa_kg,
    otro_velocidad_kmh: c.otro_velocidad_kmh,
  };
  return createHash("sha256").update(JSON.stringify(inputs)).digest("hex").slice(0, 16);
}

async function bundle(): Promise<string> {
  const r = await esbuild.build({
    entryPoints: [join(here, "e5", "galeria-entry.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "E5G",
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
    nodePaths: [join(ROOT, "packages", "viewer", "node_modules"), join(ROOT, "node_modules")],
  });
  return r.outputFiles[0]!.text;
}

interface PorTipo {
  candidatas: number;
  elegidas: number;
  probadas?: number;
  reportes_leidos?: number;
  rechazada_en_revision_visual?: number;
}

function page(fotos: Foto[], resumen: Record<string, PorTipo>) {
  const out = [
    "# Galería de E5: Croquis junto a las fotos reales",
    "",
    "Comparación visual de la deformación (PLAN E5 c, ADR 0032). Cada par muestra la foto posterior a una prueba de choque de NHTSA y la reconstrucción de Croquis de esa prueba, con el mismo cálculo de daño que el visor y desde una vista parecida.",
    "",
    "- **Qué recibe Croquis:** la clase, la masa, las dimensiones, la velocidad, el obstáculo y la cara y zona del CDC. No recibe el ancho ni la profundidad medidos.",
    "- **Muestra:** salió del test congelado de NHTSA, con semilla y estratificada por tipo, entre las pruebas con foto de la cara dañada (`uv run croquis-eval e5-galeria` → `eval/results/e5_galeria.json`). Las cifras de E5 están en el README.",
    "- **Color de la carrocería:** es neutro en Croquis.",
    "- **Fotos:** son derivados reducidos y sin metadatos de las originales de la NHTSA Vehicle Crash Test Database (datos públicos del gobierno de EE. UU.; `data/SOURCES.md`). Se cita la fuente de cada una.",
    "- **Renders:** llevan la leyenda ilustrativa (PLAN §10).",
    "",
    "| Tipo | Pruebas del test que Croquis reproduce | Revisadas | Reportes leídos | Fotos rechazadas en la revisión visual | Pares |",
    "| --- | --- | --- | --- | --- | --- |",
    ...Object.entries(resumen).map(
      ([t, r]) =>
        `| ${TIPO[t] ?? t} | ${r.candidatas} | ${r.probadas ?? 0} | ${r.reportes_leidos ?? 0} | ${r.rechazada_en_revision_visual ?? 0} | ${r.elegidas} |`,
    ),
    "",
    "**Tipos sin pares:** en esas pruebas del test no hay una foto posterior de la cara dañada que se pudiera verificar. La mayoría no trae fotos. En las demás, la foto que indica el reporte resultó ser otra vista.",
    "",
    "**Revisión visual:** el número que da el reporte no siempre es el del archivo, así que cada foto elegida se revisó a ojo. Las que no muestran la cara dañada después de la prueba quedan rechazadas, con su motivo, en `eval/e5/galeria_revision.json`, y la selección pasa al siguiente caso.",
    "",
    "**Lo que se ve:**",
    "",
    "- **Frontales:** la deformación de Croquis es mucho menor que la real. Eso coincide con la profundidad máxima de E5 en NHTSA y con el límite de energía del ADR 0033.",
    "- **Laterales y postes:** el lugar y la forma del hundimiento se reconocen, sin el detalle de las piezas rotas.",
    "",
  ];
  for (const f of fotos) {
    out.push(
      `## Prueba ${f.prueba}: ${TIPO[f.tipo] ?? f.tipo}, ${CARA[f.lado] ?? f.lado}`,
      "",
      "| Foto real (NHTSA) | Croquis |",
      "| --- | --- |",
      `| ![Foto posterior a la prueba ${f.prueba}](fotos/v${f.prueba}.jpg) | ![Render de Croquis de la prueba ${f.prueba}](croquis/v${f.prueba}.jpg) |`,
      "",
      `- **Vista de la foto:** ${f.vista}.`,
      `- **Clase en Croquis:** \`${f.clase}\`. **Obstáculo:** ${f.detalle || "—"}.`,
      `- **Fuente:** NHTSA Vehicle Crash Test Database, prueba ${f.prueba}, [foto original](${f.foto_url}) (\`${f.foto_archivo}\`; hallada por ${f.foto_hallada_por === "nombre" ? "el nombre del archivo" : "la lista de fotografías del reporte"}).`,
      "",
    );
  }
  return `${out.join("\n")}\n`;
}

async function main() {
  const manifest = JSON.parse(
    readFileSync(resolve(ROOT, "eval/results/e5_galeria.json"), "utf-8"),
  ) as { fotos: Foto[]; por_tipo: Record<string, PorTipo> };
  const cases = new Map(
    readFileSync(resolve(ROOT, "eval/e5/casos.jsonl"), "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Caso)
      .map((c) => [c.id, c] as const),
  );
  const code = await bundle();
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const p = await browser.newPage();
    await p.route(`${ORIGIN}/**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/") {
        return route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><meta charset=utf-8><title>E5</title>",
        });
      }
      if (path === "/e5g.js") return route.fulfill({ contentType: "text/javascript", body: code });
      return route.fulfill({ status: 404, body: "" });
    });
    await p.goto(`${ORIGIN}/`);
    await p.addScriptTag({ url: `${ORIGIN}/e5g.js` });
    mkdirSync(resolve(ROOT, "docs/galeria-e5/croquis"), { recursive: true });
    for (const f of manifest.fotos) {
      const caso = cases.get(f.id);
      if (!caso) throw new Error(`Falta el caso ${f.id} en eval/e5/casos.jsonl`);
      const lineas = [LEGEND, `semilla ${seedFor(caso.id)} · hash de entradas ${inputHash(caso)}`];
      const url = await p.evaluate(
        (o) =>
          (
            globalThis as unknown as {
              E5G: { render: (x: typeof o) => Promise<string> };
            }
          ).E5G.render(o),
        { caso, vista: f.vista, lineas, width: WIDTH, height: HEIGHT },
      );
      const jpg = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
      writeFileSync(resolve(ROOT, f.render), jpg);
      console.log(f.render, `${Math.round(jpg.length / 1024)} KB`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(
    resolve(ROOT, "docs/galeria-e5/README.md"),
    page(manifest.fotos, manifest.por_tipo),
    "utf-8",
  );
  console.log(resolve(ROOT, "docs/galeria-e5/README.md"));
}

await main();
