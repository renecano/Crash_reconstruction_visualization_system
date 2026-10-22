import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { terminosProhibidos } from "./terminologia";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Los archivos de una carpeta, recursivo, con las extensiones dadas y sin pruebas. */
function archivos(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p, ext);
    return ext.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

// Todo lo que ve el perito o CESVI: la interfaz y el contenido del PDF y el Word, los textos del
// paquete cesvi que llegan a la pantalla, el guion del video (voz y subtítulos) y las maquetas.
const FUENTES = [
  ...archivos(join(RAIZ, "apps/web/src"), /\.tsx?$/),
  ...archivos(join(RAIZ, "packages/cesvi/src"), /\.ts$/),
  join(RAIZ, "docs/cesvi/video/guion.md"),
  ...archivos(join(RAIZ, "docs/cesvi/rediseno"), /\.html$/),
].filter((p) => !p.endsWith(join("lib", "terminologia.ts")));

/** Un prompt de Claude: `export const SISTEMA… = \`…\`` hasta el cierre de la plantilla. */
const PROMPT = /export const SISTEMA\w*\s*=\s*`(?:\\`|[^`])*`/g;

describe("terminología de CESVI: el documento de CESVI es el reporte, no el dictamen", () => {
  it("las frases prohibidas se detectan, también partidas en dos líneas", () => {
    expect(terminosProhibidos("Reproducción de un dictamen de CESVI")).toEqual([
      "dictamen de CESVI",
    ]);
    expect(terminosProhibidos("Croquis contra el\n dictamen")).toEqual(["contra el dictamen"]);
    expect(terminosProhibidos("los dictámenes originales")).toEqual(["dictámenes originales"]);
    expect(terminosProhibidos("Reproducción de dictámenes")).toEqual([
      "Reproducción de dictámenes",
    ]);
    // Lo que produce Croquis sí es el dictamen.
    expect(terminosProhibidos("Paso 8 · Dictamen. Borrador del dictamen.")).toEqual([]);
    expect(terminosProhibidos("Croquis contra el reporte de CESVI")).toEqual([]);
  });

  it("ningún texto visible llama dictamen al reporte de CESVI", () => {
    expect(FUENTES.length).toBeGreaterThan(50);
    let prompts = 0;
    const hallazgos = FUENTES.flatMap((p) => {
      // Los prompts de Claude (`SISTEMA_*`) no se ven y están versionados: cambiarlos invalidaría
      // las evaluaciones medidas con ellos (E-R1, E-R4), así que se quedan como están.
      const texto = readFileSync(p, "utf8").replace(PROMPT, () => {
        prompts += 1;
        return "";
      });
      return terminosProhibidos(texto).map((t) => `${relative(RAIZ, p)}: «${t}»`);
    });
    expect(hallazgos).toEqual([]);
    expect(prompts).toBeGreaterThanOrEqual(5);
  });
});
