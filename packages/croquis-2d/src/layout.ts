/**
 * Convierte una EscenaSpec en una descripción dibujable del croquis (vista cenital, metros).
 * No muta la escena. Coordenadas: X al este, Y al norte, rumbo en grados antihorario desde +X.
 */
import type { EscenaSpec, Pose2D, TablaClases } from "@croquis/scene-schema";
import { DEFAULT_CLASES, longitudM } from "@croquis/scene-schema";
import { orientedBox, type Vec2 } from "./geometry";

export interface LaneStrip {
  /** Centro del eje de la franja. */
  center: Vec2;
  /** Largo total de la franja a lo largo de su eje (m). */
  length: number;
  /** Ancho total (m). */
  width: number;
  /** Rumbo del eje en grados. */
  heading: number;
  lanes: number;
  /** Separador central (camellón) en metros; 0 si no hay. */
  median: number;
}

export interface Ring {
  center: Vec2;
  innerRadius: number;
  outerRadius: number;
}

export interface RoadLayout {
  tipo: EscenaSpec["lugar"]["tipo_via"]["valor"];
  strips: LaneStrip[];
  rings: Ring[];
  /** Arco de la calzada para vías curvas: centro, radio medio, ancho y ángulos (grados). */
  arcs: { center: Vec2; radius: number; width: number; from: number; to: number }[];
}

export interface VehicleGlyph {
  id: string;
  rol: string;
  colorHex: string;
  clase: string;
  largo: number;
  ancho: number;
  inicial: Pose2D;
  final?: Pose2D;
  corners: Vec2[];
}

export interface PersonGlyph {
  id: string;
  rol: string;
  inicial?: Pose2D;
  final?: Pose2D;
}

export interface ObjectGlyph {
  id: string;
  tipo: string;
  posicion: Vec2;
  rumbo: number;
  largo: number;
  ancho: number;
  /** Para árboles y postes: diámetro del tronco/poste. */
  diametro?: number;
}

export interface DeviceGlyph {
  id: string;
  tipo: string;
  posicion: Vec2;
  orientacion: number;
}

export interface EvidenceGlyph {
  id: string;
  tipo: string;
  puntos: Vec2[];
}

export interface EventMarker {
  id: string;
  tipo: string;
  punto: Vec2;
}

export interface SceneLayout {
  road: RoadLayout;
  vehicles: VehicleGlyph[];
  people: PersonGlyph[];
  objects: ObjectGlyph[];
  devices: DeviceGlyph[];
  evidence: EvidenceGlyph[];
  events: EventMarker[];
  /** Caja envolvente en metros [minX, minY, maxX, maxY] con margen. */
  bounds: [number, number, number, number];
}

/** Dimensiones de respaldo cuando la escena no trae medidas ni hay tabla de clases. */
export const DEFAULT_DIMS: Record<string, { largo: number; ancho: number }> = {
  motocicleta: { largo: 2.0, ancho: 0.8 },
  bicicleta: { largo: 1.8, ancho: 0.6 },
  scooter: { largo: 1.2, ancho: 0.5 },
  autobus: { largo: 12, ancho: 2.55 },
  tractocamion: { largo: 16, ancho: 2.6 },
  camion_unitario: { largo: 8, ancho: 2.4 },
  microbus_combi: { largo: 6, ancho: 2.0 },
  van: { largo: 5.3, ancho: 1.9 },
  pickup: { largo: 5.3, ancho: 1.85 },
  suv_grande: { largo: 5.2, ancho: 2.0 },
  suv_compacta: { largo: 4.35, ancho: 1.78 },
  sedan_mediano: { largo: 4.65, ancho: 1.8 },
  sedan_compacto: { largo: 4.4, ancho: 1.7 },
  hatchback: { largo: 4.0, ancho: 1.7 },
};

export function vehicleDims(
  v: EscenaSpec["vehiculos"][number],
  clases?: TablaClases,
): { largo: number; ancho: number } {
  const clase = (clases ?? DEFAULT_CLASES)[v.clase.valor];
  const fallback = DEFAULT_DIMS[v.clase.valor] ?? { largo: 4.4, ancho: 1.8 };
  return {
    largo: v.largo ? longitudM(v.largo) : (clase?.tipico.largo_m ?? fallback.largo),
    ancho: v.ancho ? longitudM(v.ancho) : (clase?.tipico.ancho_m ?? fallback.ancho),
  };
}

const ROAD_LENGTH = 120;

export function roadLayout(lugar: EscenaSpec["lugar"]): RoadLayout {
  const tipo = lugar.tipo_via.valor;
  const laneW = longitudM(lugar.ancho_carril);
  const lanes = Math.max(1, lugar.carriles_por_sentido.valor);
  const dos = lugar.sentidos.valor === "doble_sentido";
  const median = lugar.camellon?.valor
    ? lugar.ancho_camellon
      ? longitudM(lugar.ancho_camellon)
      : 1.5
    : 0;
  const widthMain = laneW * lanes * (dos ? 2 : 1) + median;
  const lanesSec = Math.max(1, lugar.carriles_por_sentido_secundaria?.valor ?? lanes);
  const widthSec = laneW * lanesSec * (dos ? 2 : 1);
  const main: LaneStrip = {
    center: { x: 0, y: 0 },
    length: ROAD_LENGTH,
    width: widthMain,
    heading: 0,
    lanes: lanes * (dos ? 2 : 1),
    median,
  };
  const secondary: LaneStrip = {
    center: { x: 0, y: 0 },
    length: ROAD_LENGTH,
    width: widthSec,
    heading: 90,
    lanes: lanesSec * (dos ? 2 : 1),
    median: 0,
  };
  const radius = lugar.radio_curva ? longitudM(lugar.radio_curva) : 25;
  switch (tipo) {
    case "interseccion_x":
      return { tipo, strips: [main, secondary], rings: [], arcs: [] };
    case "interseccion_t":
      return {
        tipo,
        strips: [
          main,
          { ...secondary, center: { x: 0, y: -ROAD_LENGTH / 4 }, length: ROAD_LENGTH / 2 },
        ],
        rings: [],
        arcs: [],
      };
    case "glorieta":
      return {
        tipo,
        strips: [
          {
            ...main,
            center: { x: 0, y: -(radius + widthMain / 2 + ROAD_LENGTH / 4) },
            length: ROAD_LENGTH / 2,
            heading: 90,
          },
          {
            ...main,
            center: { x: 0, y: radius + widthMain / 2 + ROAD_LENGTH / 4 },
            length: ROAD_LENGTH / 2,
            heading: 90,
          },
          {
            ...main,
            center: { x: -(radius + widthMain / 2 + ROAD_LENGTH / 4), y: 0 },
            length: ROAD_LENGTH / 2,
          },
          {
            ...main,
            center: { x: radius + widthMain / 2 + ROAD_LENGTH / 4, y: 0 },
            length: ROAD_LENGTH / 2,
          },
        ],
        rings: [
          {
            center: { x: 0, y: radius + widthMain / 2 },
            innerRadius: radius - widthMain / 2,
            outerRadius: radius + widthMain / 2,
          },
        ],
        arcs: [],
      };
    case "curva": {
      const r = Math.max(radius, widthMain);
      return {
        tipo,
        strips: [],
        rings: [],
        arcs: [{ center: { x: 0, y: -r }, radius: r, width: widthMain, from: 60, to: 120 }],
      };
    }
    case "incorporacion":
      return {
        tipo,
        strips: [
          main,
          {
            center: { x: -30, y: -(widthMain / 2 + laneW) },
            length: 60,
            width: laneW,
            heading: 10,
            lanes: 1,
            median: 0,
          },
        ],
        rings: [],
        arcs: [],
      };
    case "retorno":
      return {
        tipo,
        strips: [main],
        rings: [
          {
            center: { x: 20, y: 0 },
            innerRadius: Math.max(1, median / 2),
            outerRadius: widthMain / 2,
          },
        ],
        arcs: [],
      };
    case "estacionamiento":
      return {
        tipo,
        strips: [
          { center: { x: 0, y: 0 }, length: 60, width: 36, heading: 0, lanes: 1, median: 0 },
        ],
        rings: [],
        arcs: [],
      };
    case "autopista":
      return {
        tipo,
        strips: [
          {
            ...main,
            width:
              widthMain + 2 * (lugar.ancho_acotamiento ? longitudM(lugar.ancho_acotamiento) : 2.5),
          },
        ],
        rings: [],
        arcs: [],
      };
    case "carretera_dos_carriles":
    case "recta":
    default:
      return { tipo, strips: [main], rings: [], arcs: [] };
  }
}

export function sceneLayout(spec: EscenaSpec, clases?: TablaClases): SceneLayout {
  const vehicles: VehicleGlyph[] = spec.vehiculos.map((v) => {
    const { largo, ancho } = vehicleDims(v, clases);
    return {
      id: v.id,
      rol: v.rol,
      colorHex: v.color.hex,
      clase: v.clase.valor,
      largo,
      ancho,
      inicial: v.posicion_inicial,
      final: v.posicion_final,
      corners: orientedBox(
        { x: v.posicion_inicial.x, y: v.posicion_inicial.y },
        largo,
        ancho,
        (v.posicion_inicial.rumbo_deg * Math.PI) / 180,
      ),
    };
  });
  const people: PersonGlyph[] = spec.personas
    .filter((p) => p.posicion_inicial || p.posicion_final)
    .map((p) => ({
      id: p.id,
      rol: p.rol.valor,
      inicial: p.posicion_inicial,
      final: p.posicion_final,
    }));
  const objects: ObjectGlyph[] = (spec.entorno.objetos ?? []).map((o) => ({
    id: o.id,
    tipo: o.tipo,
    posicion: o.posicion,
    rumbo: o.rumbo_deg ?? 0,
    largo: o.largo ? longitudM(o.largo) : 1,
    ancho: o.ancho ? longitudM(o.ancho) : 1,
    diametro: o.diametro_tronco ? longitudM(o.diametro_tronco) : undefined,
  }));
  const devices: DeviceGlyph[] = (spec.lugar.dispositivos ?? []).map((d) => ({
    id: d.id,
    tipo: d.tipo,
    posicion: d.posicion,
    orientacion: d.orientacion_deg ?? 0,
  }));
  const evidence: EvidenceGlyph[] = spec.evidencias
    .filter((e) => (e.puntos?.length ?? 0) > 0)
    .map((e) => ({ id: e.id, tipo: e.tipo, puntos: e.puntos ?? [] }));
  const events: EventMarker[] = spec.eventos
    .filter((e) => e.punto_impacto)
    .map((e) => ({ id: e.id, tipo: e.tipo, punto: e.punto_impacto as Vec2 }));

  const pts: Vec2[] = [
    ...vehicles.flatMap((v) => [v.inicial, ...(v.final ? [v.final] : [])]),
    ...people.flatMap((p) => [...(p.inicial ? [p.inicial] : []), ...(p.final ? [p.final] : [])]),
    ...objects.map((o) => o.posicion),
    ...devices.map((d) => d.posicion),
    ...evidence.flatMap((e) => e.puntos),
    ...events.map((e) => e.punto),
  ].map((p) => ({ x: p.x, y: p.y }));
  let minX = -20;
  let minY = -15;
  let maxX = 20;
  let maxY = 15;
  for (const p of pts) {
    minX = Math.min(minX, p.x - 6);
    minY = Math.min(minY, p.y - 6);
    maxX = Math.max(maxX, p.x + 6);
    maxY = Math.max(maxY, p.y + 6);
  }
  return {
    road: roadLayout(spec.lugar),
    vehicles,
    people,
    objects,
    devices,
    evidence,
    events,
    bounds: [minX, minY, maxX, maxY],
  };
}
