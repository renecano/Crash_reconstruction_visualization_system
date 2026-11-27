/**
 * Las vías elevadas y los pasos a desnivel en La escena (René, 2026-11-27; auditoría de Alberto, #380:
 * el Periférico con la Autopista Urbana Sur, y los pasos a desnivel de Insurgentes, Viaducto y
 * Circuito Interior salían a ras del piso). Un vehículo narrado sobre la vía de abajo no puede quedar
 * en la de arriba, ni al revés:
 *
 * - Sin un puente o un paso a desnivel narrado, el hecho fue a ras del piso: las vías elevadas y los
 *   túneles no cuentan para colocar ni para la vuelta.
 * - Con uno narrado, fue arriba: las vías a ras del piso que pasan debajo de una elevada (cerca de
 *   ella sin compartir un nodo) no cuentan. Las rampas de acceso, que sí comparten nodo, se quedan.
 */
import type { OsmNode, OsmWay, OverpassResponse } from "@croquis/croquis-2d";

/** m: una vía a ras del piso a menos de esto de una elevada, sin compartir nodo, pasa debajo. */
export const DEBAJO_M = 8;

/** El nivel de una vía de OSM: `layer`; un `bridge` sin `layer`, 1; un `tunnel`, -1; si no, 0. */
export function nivelDeTags(tags: Record<string, string> | undefined): number {
  const layer = Number.parseInt(tags?.layer ?? "", 10);
  if (Number.isFinite(layer)) return Math.max(-5, Math.min(5, layer));
  if (tags?.bridge && tags.bridge !== "no") return 1;
  if (tags?.tunnel && tags.tunnel !== "no") return -1;
  return 0;
}

function enMetros(lon: number, lat: number, lat0: number) {
  const k = (Math.PI / 180) * 6_371_008.8;
  return { x: lon * k * Math.cos((lat0 * Math.PI) / 180), y: lat * k };
}

function distSegmento(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * La respuesta de Overpass solo con las vías del nivel narrado (las que no son calles se quedan). Sin
 * respuesta, la misma.
 */
export function callesDelNivel(
  resp: OverpassResponse | null,
  elevado: boolean,
): OverpassResponse | null {
  if (!resp) return resp;
  const nodos = new Map<number, OsmNode>();
  for (const e of resp.elements) if (e.type === "node") nodos.set((e as OsmNode).id, e as OsmNode);
  const vias = resp.elements.filter(
    (e) => e.type === "way" && (e as OsmWay).tags?.highway,
  ) as OsmWay[];
  const lat0 = nodos.values().next().value?.lat ?? 0;
  const pts = (w: OsmWay) =>
    w.nodes.flatMap((id) => {
      const n = nodos.get(id);
      return n ? [enMetros(n.lon, n.lat, lat0)] : [];
    });
  const elevadas = vias.filter((w) => nivelDeTags(w.tags) > 0);
  const fuera = new Set<number>();
  for (const w of vias) {
    const nivel = nivelDeTags(w.tags);
    if (!elevado) {
      if (nivel !== 0) fuera.add(w.id);
      continue;
    }
    if (nivel !== 0 || !elevadas.length) continue;
    // Abajo de una elevada: cerca de ella, sin compartir un nodo (las rampas sí lo comparten).
    const mios = new Set(w.nodes);
    const p = pts(w);
    const debajo = elevadas.some((u) => {
      if (u.nodes.some((id) => mios.has(id))) return false;
      const q = pts(u);
      return p.some((x) => q.some((a, i) => i > 0 && distSegmento(x, q[i - 1]!, a) <= DEBAJO_M));
    });
    if (debajo) fuera.add(w.id);
  }
  if (!fuera.size) return resp;
  return {
    ...resp,
    elements: resp.elements.filter((e) => !(e.type === "way" && fuera.has((e as OsmWay).id))),
  };
}
