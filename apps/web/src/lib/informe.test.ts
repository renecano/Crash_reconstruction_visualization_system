import { LEGEND_TEXT, loadFixture, loadResultado } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import type { Lang } from "@/i18n";
import { informeContenido, sha256Hex } from "./informe";

/** Todo el texto de un contenido de pdfmake, en orden. */
function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if ("svg" in o) return "[croquis]";
    return ["text", "stack", "ul", "columns", "table", "body"]
      .filter((k) => k in o)
      .map((k) => textOf(o[k]))
      .join(" ");
  }
  return "";
}

async function informe(nombre: Parameters<typeof loadFixture>[0], lang?: Lang) {
  const spec = loadFixture(nombre);
  const resultado = await loadResultado(nombre);
  const content = informeContenido({
    spec,
    resultado,
    supuestosEntorno: ["Luz de día por la hora indicada"],
    croquisSvg: "<svg/>",
    hashEscena: "c".repeat(64),
    generado: new Date("2026-10-17T12:00:00Z"),
    ...(lang ? { lang } : {}),
  });
  return { spec, resultado, text: textOf(content).replace(/\s+/g, " "), content };
}

describe("informe PDF", () => {
  it("tiene todas las secciones de PLAN §7.9 y la marca", async () => {
    const { text, spec, resultado } = await informe("lateral_interseccion");
    for (const seccion of [
      "Informe de reconstrucción ilustrativa",
      "Croquis",
      "Línea de tiempo",
      "Vehículos",
      "Lo que dice la evidencia física",
      "Parámetros y su fuente",
      "Supuestos y datos inciertos",
      "Identificación",
    ]) {
      expect(text).toContain(seccion);
    }
    expect(text).toContain(LEGEND_TEXT);
    expect(text).toContain("[croquis]");
    expect(text).toContain(String(spec.meta.semilla));
    expect(text).toContain("c".repeat(64));
    expect(text).toContain(resultado.version_resultado);
    expect(text).toContain("Entorno: Luz de día por la hora indicada");
  });

  it("los rangos del 80 % de Monte Carlo y los parámetros con su fuente", async () => {
    const { text, resultado } = await informe("lateral_interseccion");
    expect(resultado.incertidumbre).toBeDefined();
    expect(text).toMatch(/80 %: [\d.,]+–[\d.,]+ km\/h/);
    expect(text).toContain("Cambio de velocidad (ΔV)");
    const conFuente = Object.values(resultado.parametros).find((p) => p?.fuente);
    expect(text).toContain(conFuente!.fuente!);
  });

  it("los eventos de la línea de tiempo, con quién participa", async () => {
    const { text, resultado } = await informe("lateral_interseccion");
    expect(resultado.eventos.length).toBeGreaterThan(0);
    expect(text).toMatch(/Impacto|impacto/);
  });

  it("con vía de OpenStreetMap, la atribución en la identificación", async () => {
    const { text } = await informe("interseccion_toluca");
    expect(text).toMatch(/OpenStreetMap/);
  });

  it("nunca habla de culpa ni de responsables (PLAN §10)", async () => {
    for (const n of [
      "lateral_interseccion",
      "peaton_cruce",
      "volcadura",
      "motociclista",
    ] as const) {
      const { text } = await informe(n);
      expect(text.toLowerCase()).not.toMatch(/culpa(ble)?\b|responsable|culpable|negligen/);
    }
  });

  it("SHA-256 conocido", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it('en español por omisión y con lang "es" es exactamente el mismo informe', async () => {
    for (const n of [
      "lateral_interseccion",
      "peaton_cruce",
      "volcadura",
      "interseccion_toluca",
    ] as const) {
      const omision = await informe(n);
      const es = await informe(n, "es");
      expect(es.content).toEqual(omision.content);
      expect(omision.text).toContain(LEGEND_TEXT);
      expect(omision.text).toContain("Generado en este dispositivo el");
    }
  });
});

describe("informe PDF en inglés", () => {
  const LEYENDA_EN =
    "Illustrative reconstruction generated from a narrative. It is not a forensic report.";

  it("tiene todas las secciones en inglés y la marca en inglés, sin la española", async () => {
    const { text, spec, resultado } = await informe("lateral_interseccion", "en");
    for (const seccion of [
      "Illustrative reconstruction report",
      "Sketch",
      "Timeline",
      "Vehicles",
      "Change in speed (ΔV)",
      "What the physical evidence says",
      "Parameters and their source",
      "Assumptions and uncertain data",
      "Identification",
      "Generated on this device on",
    ]) {
      expect(text).toContain(seccion);
    }
    expect(text).toContain(LEYENDA_EN);
    expect(text).not.toContain(LEGEND_TEXT);
    expect(text).not.toContain("No es un peritaje");
    expect(text).toContain("[croquis]");
    expect(text).toContain(String(spec.meta.semilla));
    expect(text).toContain("c".repeat(64));
    expect(text).toContain(resultado.version_resultado);
    expect(text).toMatch(/80 %: [\d.,]+–[\d.,]+ km\/h/);
    expect(text).toMatch(/at \d+ o'clock/);
    expect(text).toContain("Impact");
    // Los supuestos de entorno que no tienen traducción se quedan como vienen.
    expect(text).toContain("Environment: Luz de día por la hora indicada");
  });

  it("las mismas cifras que en español", async () => {
    const es = await informe("lateral_interseccion");
    const en = await informe("lateral_interseccion", "en");
    const cifras = (t: string) => t.match(/\d+(?:[.,]\d+)*/g)?.filter((x) => x.length > 1);
    // Fuera de la fecha (que cambia de formato), las cifras del informe son las mismas.
    const sinFecha = (t: string) => t.replace(/(Generado|Generated)[^.]*\./, "");
    expect(cifras(sinFecha(en.text))).toEqual(cifras(sinFecha(es.text)));
  });

  it("los avisos y los datos que no cuadran del solver se traducen", async () => {
    for (const n of ["peaton_cruce", "volcadura", "motociclista"] as const) {
      const { text, resultado } = await informe(n, "en");
      expect(text).toContain("What the physical evidence says");
      for (const b of resultado.banderas) expect(text).not.toContain(b);
      for (const f of resultado.consistencia ?? []) expect(text).not.toContain(f.mensaje);
    }
  });

  it("con vía de OpenStreetMap, la atribución en inglés", async () => {
    const { text } = await informe("interseccion_toluca", "en");
    expect(text).toMatch(/Contains information from OpenStreetMap/);
    expect(text).toContain("Map data");
  });

  it("nunca habla de culpa ni de responsables (PLAN §10)", async () => {
    for (const n of [
      "lateral_interseccion",
      "peaton_cruce",
      "volcadura",
      "motociclista",
    ] as const) {
      const { text } = await informe(n, "en");
      expect(text.toLowerCase()).not.toMatch(/\bfault\b|\bguilty\b|\bnegligen|\bto blame\b|liable/);
    }
  });
});
