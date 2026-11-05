/**
 * Altura del piso bajo un punto (René, 2026-11-04, C2: un vehículo que acaba sobre la banqueta o el
 * pasto se veía hundido, porque los vehículos iban siempre a altura 0). El piso es lo más alto entre
 * el relieve del terreno y las superficies elevadas (banquetas y camellones a la altura de la
 * guarnición). Las superficies se indexan en una rejilla para que cada consulta revise solo los
 * triángulos de su celda.
 */
import type { Mesh2D } from "./road-geometry";

export interface SuperficieElevada {
  mesh: Mesh2D;
  /** Altura de la superficie sobre la calzada (m). */
  altura: number;
}

/** Lado de la celda de la rejilla (m). */
const CELDA_M = 4;

interface Tri {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  altura: number;
}

function dentro(t: Tri, x: number, y: number): boolean {
  const d1 = (x - t.bx) * (t.ay - t.by) - (t.ax - t.bx) * (y - t.by);
  const d2 = (x - t.cx) * (t.by - t.cy) - (t.bx - t.cx) * (y - t.cy);
  const d3 = (x - t.ax) * (t.cy - t.ay) - (t.cx - t.ax) * (y - t.ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * La función de altura del piso: `relieve(x, y)` es la altura del terreno (0 en el corredor de la
 * vía); el resultado nunca baja de 0 (la calzada).
 */
export function alturaDelPiso(
  superficies: readonly SuperficieElevada[],
  relieve: (x: number, y: number) => number = () => 0,
): (x: number, y: number) => number {
  const rejilla = new Map<string, Tri[]>();
  const clave = (i: number, j: number) => `${i},${j}`;
  for (const { mesh, altura } of superficies) {
    const p = mesh.positions;
    const idx = mesh.indices;
    for (let k = 0; k + 2 < idx.length; k += 3) {
      const a = idx[k]! * 2;
      const b = idx[k + 1]! * 2;
      const c = idx[k + 2]! * 2;
      const t: Tri = {
        ax: p[a]!,
        ay: p[a + 1]!,
        bx: p[b]!,
        by: p[b + 1]!,
        cx: p[c]!,
        cy: p[c + 1]!,
        altura,
      };
      const i0 = Math.floor(Math.min(t.ax, t.bx, t.cx) / CELDA_M);
      const i1 = Math.floor(Math.max(t.ax, t.bx, t.cx) / CELDA_M);
      const j0 = Math.floor(Math.min(t.ay, t.by, t.cy) / CELDA_M);
      const j1 = Math.floor(Math.max(t.ay, t.by, t.cy) / CELDA_M);
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const kk = clave(i, j);
          const lista = rejilla.get(kk);
          if (lista) lista.push(t);
          else rejilla.set(kk, [t]);
        }
    }
  }
  return (x, y) => {
    let h = Math.max(0, relieve(x, y));
    const lista = rejilla.get(clave(Math.floor(x / CELDA_M), Math.floor(y / CELDA_M)));
    if (lista) for (const t of lista) if (t.altura > h && dentro(t, x, y)) h = t.altura;
    return h;
  };
}
