/**
 * Las calles del lugar guardadas con el caso (ronda 4; René, 2026-11-18: «en local, los autos salen
 * de donde no hay carretera»). Las que llegan de Overpass o de las teselas del mapa se guardan en el
 * expediente (`caso.lugar.calles_del_mapa`), y al abrir el caso sin red se usan esas: La escena, la
 * reconstrucción y el 3D tienen siempre las mismas calles, y nadie supone una dirección por los
 * puntos cardinales.
 */
import type { Expediente } from "@croquis/cesvi";
import type { OsmNode, OsmWay, OverpassResponse } from "@croquis/croquis-2d";
import { acotamientoDeTags } from "./escena-facil";
import { nivelDeTags } from "./nivel-via";

type Guardadas = NonNullable<NonNullable<Expediente["caso"]["lugar"]>["calles_del_mapa"]>;
type Punto = { lat: number; lon: number };

const ATRIBUCION = "© OpenStreetMap contributors (ODbL)";
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** La respuesta de Overpass (o de las teselas) en la forma que se guarda con el caso. */
export function callesParaGuardar(
  resp: OverpassResponse,
  centro: Punto,
  radioM: number,
  fuente: "overpass" | "teselas",
  consultado = new Date().toISOString(),
): Guardadas {
  const nodos = new Map<number, OsmNode>();
  for (const e of resp.elements) if (e.type === "node") nodos.set((e as OsmNode).id, e as OsmNode);
  const vias: Guardadas["vias"] = [];
  for (const e of resp.elements) {
    if (e.type !== "way") continue;
    const w = e as OsmWay;
    const tipo = w.tags?.highway;
    if (!tipo) continue;
    const puntos = w.nodes.flatMap((id) => {
      const n = nodos.get(id);
      return n ? [[r6(n.lon), r6(n.lat)] as [number, number]] : [];
    });
    if (puntos.length < 2) continue;
    const t = w.tags ?? {};
    vias.push({
      id: w.id,
      tipo,
      ...(t.name ? { nombre: t.name.slice(0, 200) } : {}),
      ...(t.maxspeed ? { maxspeed: t.maxspeed.slice(0, 20) } : {}),
      ...(t.lanes ? { carriles: t.lanes.slice(0, 10) } : {}),
      ...(t.oneway ? { sentido_unico: t.oneway.slice(0, 10) } : {}),
      ...(t.width ? { ancho: t.width.slice(0, 10) } : {}),
      ...(acotamientoDeTags(t) !== null ? { acotamiento: String(acotamientoDeTags(t)) } : {}),
      // El nivel (René, 2026-11-27): para no colocar abajo lo narrado arriba, ni al revés.
      ...(nivelDeTags(t) !== 0 ? { nivel: nivelDeTags(t) } : {}),
      puntos: puntos.slice(0, 2000),
    });
    if (vias.length >= 600) break;
  }
  return {
    fuente,
    atribucion: ATRIBUCION,
    consultado,
    centro: { lat: r6(centro.lat), lon: r6(centro.lon) },
    radio_m: radioM,
    vias,
  };
}

/** Las calles guardadas como respuesta de Overpass (nodos con ids propios, negativos). */
export function respuestaDeGuardadas(g: Guardadas): OverpassResponse {
  const elements: OverpassResponse["elements"] = [];
  let siguiente = -1;
  // Los puntos que comparten dos vías son el mismo nodo: así los cruces se reconocen igual.
  const ids = new Map<string, number>();
  for (const v of g.vias) {
    const nodos: number[] = [];
    for (const [lon, lat] of v.puntos as [number, number][]) {
      const clave = `${lon},${lat}`;
      let id = ids.get(clave);
      if (id === undefined) {
        id = siguiente--;
        ids.set(clave, id);
        elements.push({ type: "node", id, lat, lon } as OsmNode);
      }
      nodos.push(id);
    }
    elements.push({
      type: "way",
      id: v.id,
      nodes: nodos,
      tags: {
        highway: v.tipo,
        ...(v.nombre ? { name: v.nombre } : {}),
        ...(v.maxspeed ? { maxspeed: v.maxspeed } : {}),
        ...(v.carriles ? { lanes: v.carriles } : {}),
        ...(v.sentido_unico ? { oneway: v.sentido_unico } : {}),
        ...(v.ancho ? { width: v.ancho } : {}),
        ...(v.nivel ? { layer: String(v.nivel) } : {}),
        ...(v.acotamiento ? { "shoulder:width": v.acotamiento } : {}),
      },
    } as OsmWay);
  }
  return { elements } as OverpassResponse;
}

/** Distancia aproximada en metros entre dos puntos (suficiente para comparar centros). */
function metros(a: Punto, b: Punto): number {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 111320);
}

/**
 * El expediente con estas calles guardadas, si cambian algo: no había, son de otro lugar (a más de
 * 30 m) o llegan las de Overpass donde había las de las teselas. Si no, el mismo expediente.
 */
export function conCallesGuardadas(e: Expediente, g: Guardadas): Expediente {
  if (!g.vias.length) return e;
  const antes = e.caso.lugar?.calles_del_mapa;
  // Las de un ejemplo publicado o de AXA nunca se reemplazan (René, 2026-11-27): su cifra no depende
  // de lo que responda la red.
  if (antes?.fija) return e;
  if (
    antes &&
    metros(antes.centro, g.centro) <= 30 &&
    (antes.fuente === "overpass" || g.fuente === "teselas")
  )
    return e;
  return { ...e, caso: { ...e.caso, lugar: { ...e.caso.lugar, calles_del_mapa: g } } };
}

/** Las calles guardadas del caso que sirven alrededor de `p` (a menos de la mitad del radio). */
export function guardadasCerca(e: Expediente | null, p: Punto | null): OverpassResponse | null {
  const g = e?.caso.lugar?.calles_del_mapa;
  if (!g || !p || !g.vias.length) return null;
  return metros(g.centro, p) <= g.radio_m / 2 ? respuestaDeGuardadas(g) : null;
}
