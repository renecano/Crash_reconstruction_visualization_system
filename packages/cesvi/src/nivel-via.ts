/**
 * Las calles guardadas del nivel narrado, para la reconstrucción (René, 2026-11-27; auditoría #380):
 * la misma regla que La escena (`apps/web/src/lib/nivel-via.ts`). Sin un puente o un paso a desnivel
 * narrado, ni el eje de la calle ni la vuelta van por una vía elevada o un túnel; con uno, no por una
 * vía a ras del piso que pasa debajo de la elevada (cerca de ella sin compartir un punto; las rampas
 * sí lo comparten).
 */
import type { Expediente } from "./corpus";

type Via = NonNullable<NonNullable<Expediente["caso"]["lugar"]>["calles_del_mapa"]>["vias"][number];

/** m: una vía a ras del piso a menos de esto de una elevada, sin compartir un punto, pasa debajo. */
export const DEBAJO_M = 8;

function metros(a: readonly [number, number], b: readonly [number, number]): number {
  const kx = 111320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111320);
}

function cercaDeTramo(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const kx = 111320 * Math.cos((p[1] * Math.PI) / 180);
  const P = { x: p[0] * kx, y: p[1] * 111320 };
  const A = { x: a[0] * kx, y: a[1] * 111320 };
  const B = { x: b[0] * kx, y: b[1] * 111320 };
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / L2)) : 0;
  return Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy));
}

/** Las vías guardadas del nivel narrado del expediente. */
export function viasDelNivel(e: Expediente): Via[] {
  const vias = e.caso.lugar?.calles_del_mapa?.vias ?? [];
  const elevado = Boolean(e.caso.condiciones?.estructura);
  const nivel = (v: Via) => v.nivel ?? 0;
  if (!elevado) return vias.filter((v) => nivel(v) === 0);
  const elevadas = vias.filter((v) => nivel(v) > 0);
  if (!elevadas.length) return [...vias];
  return vias.filter((v) => {
    if (nivel(v) !== 0) return true;
    const debajo = elevadas.some((u) => {
      const comparte = v.puntos.some((p) => u.puntos.some((q) => metros(p, q) < 0.5));
      if (comparte) return false;
      return v.puntos.some((p) =>
        u.puntos.some((q, i) => i > 0 && cercaDeTramo(p, u.puntos[i - 1]!, q) <= DEBAJO_M),
      );
    });
    return !debajo;
  });
}
