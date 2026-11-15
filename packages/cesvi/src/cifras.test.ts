import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tasa, velocidad, type Tasa } from "./formato";
import { REVERSA_KMH } from "./reversa";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../../..");
interface Cifra {
  texto: string;
  texto_completo?: string;
  mejor?: number;
  p10?: number;
  p90?: number;
  k?: number;
  n?: number;
  pct?: number;
  fuente: string;
  campo: string;
}
const { cifras } = JSON.parse(readFileSync(join(RAIZ, "eval/results/cifras.json"), "utf8")) as {
  cifras: Record<string, Cifra>;
};

/** Auditoría del 2026-11-15, §3.3: una sola fuente de cifras, y nadie se aparta de ella. */
describe("las cifras publicadas (eval/results/cifras.json)", () => {
  it("el índice está al día y los documentos vigentes no traen cifras retiradas ni distintas", () => {
    const r = spawnSync(process.execPath, [join(RAIZ, "eval/verificar_cifras.mjs")], {
      encoding: "utf8",
    });
    expect(r.stderr + r.stdout).toMatch(/^Cifras verificadas/);
    expect(r.status).toBe(0);
  });

  it("cada cifra dice de qué archivo y de qué campo sale", () => {
    for (const [clave, c] of Object.entries(cifras)) {
      expect(c.fuente, clave).toMatch(/^(eval\/results|data|packages)\//);
      expect(c.campo, clave).toBeTruthy();
      expect(c.texto, clave).toBeTruthy();
    }
  });

  it("el texto de cada cifra es el del formateador único", () => {
    for (const clave of ["er4.modalidad_titulo", "er4.regla_simple"]) {
      const c = cifras[clave]!;
      expect(c.texto, clave).toBe(tasa(c as unknown as Tasa));
    }
    for (const clave of ["axa.v2", "axa.v1"]) {
      const c = cifras[clave]!;
      const v = { mejor: c.mejor!, p10: c.p10, p90: c.p90 };
      // La conclusión de la reconstrucción, en enteros; el número completo, aparte.
      expect(c.texto, clave).toBe(velocidad(v));
      expect(c.texto_completo, clave).toBe(velocidad(v, "metodo"));
    }
  });

  it("la reversa del índice es la que usa la app", () => {
    const c = cifras["reversa.velocidad"]!;
    expect([c.mejor, c.p10, c.p90]).toEqual([REVERSA_KMH.p50, REVERSA_KMH.p10, REVERSA_KMH.p90]);
  });
});
