/**
 * Cada valor del caso, contra el texto del dictamen. El lote de CESVI no se versiona
 * (`data/raw/cesvi/`, docs/cesvi/PROTOTIPO.md): donde no está (CI), la prueba que lo lee se salta y
 * lo dice; las que solo revisan el JSON corren siempre.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CASOS, type CasoCesvi } from "./caso";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Cada `{ valor?, cita }` del caso, con su ruta para el mensaje de error. */
function citas(x: unknown, ruta = ""): { ruta: string; cita: string; valor?: unknown }[] {
  if (Array.isArray(x)) return x.flatMap((v, i) => citas(v, `${ruta}[${i}]`));
  if (!x || typeof x !== "object") return [];
  const o = x as Record<string, unknown>;
  const propias =
    typeof o.cita === "string" ? [{ ruta: ruta || "(raíz)", cita: o.cita, valor: o.valor }] : [];
  return [
    ...propias,
    ...Object.entries(o)
      .filter(([k]) => k !== "cita" && k !== "_fuente")
      .flatMap(([k, v]) => citas(v, ruta ? `${ruta}.${k}` : k)),
  ];
}

/** Espacios y saltos de línea del OCR como un solo espacio. */
const plano = (s: string): string => s.replace(/\s+/g, " ").trim();

function documento(c: CasoCesvi): string | null {
  const lote = join(RAIZ, c._fuente.lote);
  if (!existsSync(lote)) return null;
  const texto = readFileSync(lote, "utf8");
  const inicio = texto.indexOf(`# Document: ${c._fuente.documento}`);
  if (inicio < 0) throw new Error(`El lote no tiene el documento ${c._fuente.documento}`);
  const fin = texto.indexOf("\n# Document:", inicio + 1);
  return texto.slice(inicio, fin < 0 ? undefined : fin);
}

for (const c of Object.values(CASOS)) {
  describe(`caso ${c.id}`, () => {
    const lista = citas(c);

    it("cada número del caso aparece en su cita", () => {
      for (const { ruta, cita, valor } of lista) {
        if (typeof valor !== "number") continue;
        const numeros = (cita.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
        expect(numeros, `${ruta}: ${cita}`).toContain(valor);
      }
    });

    const doc = documento(c);
    it.skipIf(doc === null)(
      `cada cita está en el dictamen (${c._fuente.lote}; sin el lote en la máquina, se salta)`,
      () => {
        const texto = plano(doc!);
        for (const { ruta, cita } of lista) {
          expect(texto.includes(plano(cita)), `${ruta}: «${cita}»`).toBe(true);
        }
      },
    );
  });
}
