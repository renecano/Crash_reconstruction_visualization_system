/**
 * El peatón y el ciclista dibujados por Croquis (A3, René, 2026-11-18): trazos propios en una caja de
 * 24 × 24, sin recursos de terceros. Los mismos trazos van en la paleta (React, con el color del
 * texto) y en el mapa (HTML del marcador, en blanco sobre su insignia).
 */
import type { RolPersona } from "@croquis/cesvi";

interface Figura {
  /** Círculos: [cx, cy, r, relleno]. */
  circulos: readonly (readonly [number, number, number, boolean])[];
  trazos: readonly string[];
}

export const FIGURA_PERSONA: Record<RolPersona, Figura> = {
  peaton: {
    circulos: [[13, 4.4, 2.4, true]],
    trazos: [
      "M12.4 8 L11 14",
      "M11 14 L8 20.5",
      "M11 14 L14.2 16.8 L15 21",
      "M8.4 11.4 L12.1 8.9 L15.6 11.6",
    ],
  },
  ciclista: {
    circulos: [
      [5.8, 16.6, 3.8, false],
      [18.2, 16.6, 3.8, false],
      [14.6, 4.2, 2, true],
    ],
    trazos: [
      "M5.8 16.6 L10.4 10.2 H15.8 L18.2 16.6",
      "M10.4 10.2 L12.4 16.6 L15.8 10.2",
      "M14 6.8 L11.6 10.2",
    ],
  },
};

/** La figura para la paleta y los avisos: toma el color del texto. */
export function IconoPersona({ rol, tamano = 28 }: { rol: RolPersona; tamano?: number }) {
  const f = FIGURA_PERSONA[rol];
  return (
    <svg viewBox="0 0 24 24" width={tamano} height={tamano} aria-hidden="true" className="shrink-0">
      {f.circulos.map(([cx, cy, r, relleno], k) => (
        <circle
          key={k}
          cx={cx}
          cy={cy}
          r={r}
          fill={relleno ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={relleno ? 0 : 1.8}
        />
      ))}
      {f.trazos.map((d, k) => (
        <path
          key={`t${k}`}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** La figura como HTML, para el marcador del mapa (MapLibre no monta componentes de React). */
export function svgPersona(rol: RolPersona, color: string, tamano = 18): string {
  const f = FIGURA_PERSONA[rol];
  const circulos = f.circulos
    .map(([cx, cy, r, relleno]) =>
      relleno
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`
        : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="1.8"/>`,
    )
    .join("");
  const trazos = f.trazos
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  return `<svg viewBox="0 0 24 24" width="${tamano}" height="${tamano}" aria-hidden="true">${circulos}${trazos}</svg>`;
}
