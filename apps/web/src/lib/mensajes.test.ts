import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ask, preguntaToDict } from "@croquis/extraction";
import { FIXTURE_NAMES, loadFixture, loadResultado } from "@croquis/scene-schema";
import { checkConsistencyBasic, reconstruct } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { mensaje, mensajeEn, preguntaVista } from "./mensajes";
import type { Pregunta } from "./relato-api";

type Json = Record<string, unknown>;

/** Escenas de Relatos-MX (dev), con su texto: lo más parecido a lo que llega de la gente. */
function relatosDev(): { spec: Json; texto: string }[] {
  const raw = readFileSync(join(process.cwd(), "../../data/relatos-mx/build/dev.jsonl"), "utf-8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { spec: Json; texto: string });
}

describe("mensajes del sistema en inglés", () => {
  it("todos los avisos y las inconsistencias que de verdad se producen tienen su versión en inglés", async () => {
    const mensajes = new Set<string>();
    for (const n of FIXTURE_NAMES) {
      const r = await loadResultado(n);
      for (const b of r.banderas) mensajes.add(b);
      for (const c of r.consistencia ?? []) mensajes.add(c.mensaje);
      for (const c of checkConsistencyBasic(loadFixture(n) as unknown as Json))
        mensajes.add(c.mensaje);
    }
    for (const { spec } of relatosDev()) {
      for (const b of reconstruct(spec).banderas) mensajes.add(b);
      for (const c of checkConsistencyBasic(spec)) mensajes.add(c.mensaje);
    }
    expect(mensajes.size).toBeGreaterThan(5);
    const sinTraducir = [...mensajes].filter((m) => mensajeEn(m) === null);
    expect(sinTraducir).toEqual([]);
  }, 120_000);

  it("todas las preguntas que se producen salen en inglés, salvo las del glosario", () => {
    const vistas: { id: string; es: string; en: string; lang: string }[] = [];
    for (const { spec, texto } of relatosDev()) {
      for (const p of ask(spec, texto).map(preguntaToDict) as unknown as Pregunta[]) {
        const v = preguntaVista(p, spec as never, "en");
        vistas.push({ id: p.id, es: p.texto, en: v.texto, lang: v.lang });
      }
    }
    expect(vistas.length).toBeGreaterThan(20);
    const enEspanol = vistas.filter((v) => v.lang !== "en" && !v.id.startsWith("glosario:"));
    expect(enEspanol).toEqual([]);
    // Ninguna pregunta en inglés deja palabras del español.
    for (const v of vistas.filter((x) => x.lang === "en")) {
      expect(v.en, v.es).not.toMatch(/¿|vehículo|velocidad|frenar|golpe/);
    }
  }, 120_000);

  it("conserva los números de cada plantilla", () => {
    expect(
      mensajeEn(
        "Para dejar unos 18 m de marcas de frenado, el vehículo A tendría que ir al menos a 52 km/h, aun con el piso más resbaloso posible; la velocidad indicada llega a 40 km/h. ¿Puedes confirmar el largo de las marcas o la velocidad?",
      ),
    ).toBe(
      "To leave about 18 m of skid marks, vehicle A would have to be going at least 52 km/h, even on the most slippery surface; the speed given reaches 40 km/h. Can you confirm the length of the marks or the speed?",
    );
    expect(mensajeEn("Vehículo B: no llegó al reposo en 10 s.")).toBe(
      "Vehicle B: it did not come to rest within 10 s.",
    );
  });

  it("en español todo queda igual, y lo desconocido se muestra en español con su idioma", () => {
    expect(mensaje("Cualquier cosa.", "es")).toEqual({ texto: "Cualquier cosa.", lang: "es-MX" });
    expect(mensaje("Un mensaje nuevo que nadie tradujo.", "en")).toEqual({
      texto: "Un mensaje nuevo que nadie tradujo.",
      lang: "es-MX",
    });
  });
});
