/**
 * Lo que Croquis ve en la narración sin IA, mientras el perito escribe (René, 2026-11-04, A2): el
 * conteo de caracteres y lo que se reconoce con reglas simples. No sustituye a la lectura con
 * Claude: solo le dice al perito, antes de leer, si su texto trae lo que la reconstrucción necesita.
 */

/** Mínimo para leer la narración y tope del cuadro de texto (caracteres). */
export const MIN_NARRACION = 20;
export const MAX_NARRACION = 12_000;

export function textoConteo(n: number): string {
  if (n < MIN_NARRACION) return `Escribe al menos ${MIN_NARRACION} caracteres (llevas ${n}).`;
  const fmt = (x: number) => x.toLocaleString("es-MX");
  return `${fmt(n)} de ${fmt(MAX_NARRACION)} caracteres`;
}

export interface DetectadoNarracion {
  /** «A (VW Jetta 2002)», «B», «1»… en el orden en que aparecen. */
  vehiculos: string[];
  /** Medidas con unidad: metros y centímetros (huellas, restos, deformaciones). */
  medidas: number;
  velocidades: number;
  hora: string | null;
  lugar: boolean;
  restos: boolean;
  huellas: boolean;
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;

export function detectarEnNarracion(texto: string): DetectadoNarracion {
  const t = texto.normalize("NFC");
  const vistos = new Map<string, string>();
  const re =
    /veh[ií]culo\s+(?:n[uú]mero\s+)?([A-Z]|\d{1,2})\b(?:\s*,?\s*marca\s+([^,.;\n]+?)\s*,\s*(?:tipo|l[ií]nea)\s+([^,.;\n]+?)(?:\s*,\s*modelo\s+(\d{4}))?(?=[,.;\n]|$))?/gi;
  for (const m of t.matchAll(re)) {
    const id = m[1]!.toUpperCase();
    const desc = [m[2], m[3], m[4]].filter(Boolean).join(" ").trim();
    if (!vistos.has(id) || (desc && !vistos.get(id))) vistos.set(id, desc);
  }
  const medidas = [
    ...t.matchAll(new RegExp(String.raw`\b${NUM}\s*(?:m|mts?|metros?|cm|cent[ií]metros?)\b`, "gi")),
  ].length;
  const velocidades = [
    ...t.matchAll(new RegExp(String.raw`\b${NUM}\s*(?:km/h|kph|kil[oó]metros\s+por\s+hora)`, "gi")),
  ].length;
  const hora = t.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:h(?:oras|rs?)?\b)?/i);
  return {
    vehiculos: [...vistos].map(([id, desc]) => (desc ? `${id} (${desc})` : id)),
    medidas,
    velocidades,
    hora: hora ? `${hora[1]!.padStart(2, "0")}:${hora[2]}` : null,
    lugar:
      /\b(calle|avenida|av\.|carretera|autopista|boulevard|blvd\.?|calzada|km\s*\d|crucero|esquina)\b/i.test(
        t,
      ),
    restos: /\brestos?\b|\bfragmentos?\b|\bderrame\b/i.test(t),
    huellas: /\bhuellas?\b|\bfrenad[ao]\b|\barrastre\b|\bderrape\b/i.test(t),
  };
}

/** Las piezas de lo detectado, en palabras, para mostrarlas como etiquetas. */
export function piezasDetectadas(d: DetectadoNarracion): string[] {
  const p: string[] = [];
  if (d.vehiculos.length)
    p.push(
      `${d.vehiculos.length === 1 ? "1 vehículo" : `${d.vehiculos.length} vehículos`}: ${d.vehiculos.join(", ")}`,
    );
  if (d.lugar) p.push("lugar");
  if (d.hora) p.push(`hora ${d.hora}`);
  if (d.medidas) p.push(d.medidas === 1 ? "1 medida" : `${d.medidas} medidas`);
  if (d.velocidades) p.push(d.velocidades === 1 ? "1 velocidad" : `${d.velocidades} velocidades`);
  if (d.huellas) p.push("huellas");
  if (d.restos) p.push("restos");
  return p;
}
