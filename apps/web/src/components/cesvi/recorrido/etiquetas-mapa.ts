/**
 * Dónde van las etiquetas del mapa del recorrido (ADR 0053). Varios puntos de una versión pueden
 * coincidir (en la declarada, el impacto y la posición final de cada vehículo son el mismo punto, y
 * los restos miden 0 m), así que las etiquetas no van encima de su punto: van en dos columnas, a la
 * izquierda y a la derecha de la escena, sin encimarse, y una línea las une con su punto.
 */

export interface PuntoPantalla {
  x: number;
  y: number;
}

export interface EntradaEtiqueta {
  id: string;
  lado: "izq" | "der";
  /** El punto al que se refiere, en píxeles del mapa. */
  punto: PuntoPantalla;
  /** Ancho de la etiqueta en píxeles. */
  ancho: number;
}

export interface EtiquetaColocada {
  id: string;
  /** Esquina superior izquierda de la etiqueta. */
  x: number;
  y: number;
  ancla: PuntoPantalla;
}

export const ALTO_ETIQUETA = 28;
const SEPARACION = 6;
/** Distancia de la columna al punto más cercano de la escena. */
const MARGEN_COLUMNA = 48;

const media = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length;

/** Coloca las etiquetas en dos columnas sin encimarse, dentro del área. */
export function acomodarEtiquetas(
  entradas: readonly EntradaEtiqueta[],
  area: { ancho: number; alto: number },
): EtiquetaColocada[] {
  if (!entradas.length) return [];
  const xs = entradas.map((e) => e.punto.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const paso = ALTO_ETIQUETA + SEPARACION;
  const mitad = ALTO_ETIQUETA / 2;
  const out: EtiquetaColocada[] = [];
  for (const lado of ["izq", "der"] as const) {
    const grupo = entradas
      .filter((e) => e.lado === lado)
      .sort((a, b) => a.punto.y - b.punto.y || a.id.localeCompare(b.id));
    if (!grupo.length) continue;
    // Cada etiqueta a la altura de su punto (dentro del área), empujando hacia abajo las que se
    // enciman, y la columna recentrada en sus puntos.
    const objetivo = grupo.map((e) => Math.min(area.alto - mitad, Math.max(mitad, e.punto.y)));
    const ys = [...objetivo];
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i]!, ys[i - 1]! + paso);
    const d = media(objetivo) - media(ys);
    for (let i = 0; i < ys.length; i++) ys[i] = ys[i]! + d;
    // Dentro del área: desde abajo y luego desde arriba (si no cabe, manda arriba).
    ys[ys.length - 1] = Math.min(ys[ys.length - 1]!, area.alto - mitad);
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i]!, ys[i + 1]! - paso);
    ys[0] = Math.max(ys[0]!, mitad);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i]!, ys[i - 1]! + paso);
    grupo.forEach((e, i) => {
      const x =
        lado === "izq"
          ? Math.max(0, minX - MARGEN_COLUMNA - e.ancho)
          : Math.min(area.ancho - e.ancho, maxX + MARGEN_COLUMNA);
      out.push({ id: e.id, x, y: ys[i]! - mitad, ancla: e.punto });
    });
  }
  return out;
}
