/**
 * Los edificios y los muros de OpenStreetMap alrededor del choque, como obstáculos de la
 * reconstrucción (René, 2026-11-24, punto 2): `conObstaculos` de @croquis/cesvi dice que no cuadra si
 * un vehículo los cruza. Vienen de la misma consulta de objetos del lugar que dibuja el 3D
 * (`overpassQueryObjetos`: bardas, muros de contención y edificios).
 */
import type { LonLat, ObstaculoDelMapa } from "@croquis/cesvi";
import type { OsmNode, OsmWay, OverpassResponse } from "@croquis/croquis-2d";

/** Las rejas y cercas ligeras (`fence`) no detienen un auto: solo muros y bardas de mampostería. */
const MURO = /^(?:wall|retaining_wall)$/;

export function obstaculosDelMapa(resp: OverpassResponse | null): ObstaculoDelMapa[] {
  if (!resp) return [];
  const nodos = new Map<number, OsmNode>();
  for (const e of resp.elements) if (e.type === "node") nodos.set((e as OsmNode).id, e as OsmNode);
  const out: ObstaculoDelMapa[] = [];
  for (const e of resp.elements) {
    if (e.type !== "way") continue;
    const w = e as OsmWay;
    const t = w.tags ?? {};
    const edificio = Boolean(t.building) && t.building !== "no" && !t.layer?.startsWith("-");
    const muro = MURO.test(t.barrier ?? "");
    if (!edificio && !muro) continue;
    const puntos = w.nodes.flatMap((id) => {
      const n = nodos.get(id);
      return n ? [[n.lon, n.lat] as LonLat] : [];
    });
    if (puntos.length < (edificio ? 4 : 2)) continue;
    out.push({
      nombre: `${edificio ? "edificio" : t.barrier === "retaining_wall" ? "muro de contención" : "muro"} ${w.id} de OpenStreetMap`,
      tipo: edificio ? "edificio" : "muro",
      puntos,
    });
  }
  return out;
}
