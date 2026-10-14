/**
 * Hipótesis en el visor (PLAN §7: comparar dos o más hipótesis): los vehículos de otra
 * reconstrucción se dibujan como "fantasmas" translúcidos sobre la escena principal, con el mismo
 * reloj, y `compareHypotheses` resume la diferencia de resultados para el panel.
 *
 * Igual que el resto del visor, aquí no hay física: el fantasma sigue la trayectoria que calculó el
 * solver para la hipótesis.
 */
import type { Resultado } from "@croquis/scene-schema";
import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { toThree } from "./coords";
import { sampleVehicle } from "./sample";

export const GHOST_COLOR = 0x2b8cff;
export const GHOST_OPACITY = 0.28;

export interface GhostLayer {
  group: Group;
  update(t: number): void;
  dispose(): void;
}

/** Capa de fantasmas para los vehículos de `hipotesis` (ids iguales a los de la escena). */
export function buildGhostLayer(hipotesis: Resultado, color = GHOST_COLOR): GhostLayer {
  const group = new Group();
  group.name = "hipotesis";
  const fill = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: GHOST_OPACITY,
    depthWrite: false,
  });
  const line = new LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const disposables: { dispose(): void }[] = [fill, line];
  const nodes = hipotesis.vehiculos.map((v) => {
    const { largo_m, ancho_m, alto_m } = v.dimensiones;
    const box = new BoxGeometry(largo_m, alto_m, ancho_m);
    const edges = new EdgesGeometry(box);
    disposables.push(box, edges);
    const g = new Group();
    g.name = `fantasma-${v.id}`;
    const body = new Mesh(box, fill);
    body.position.y = alto_m / 2;
    body.renderOrder = 3;
    const outline = new LineSegments(edges, line);
    outline.position.y = alto_m / 2;
    g.add(body, outline);
    group.add(g);
    return { g, track: v.trayectoria };
  });
  return {
    group,
    update(t: number) {
      for (const n of nodes) {
        const pose = sampleVehicle(n.track, t);
        const [x, y, z] = toThree(pose.x, pose.y, 0);
        n.g.position.set(x, y, z);
        n.g.rotation.set(0, pose.yaw, 0);
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

export interface VehicleDiff {
  id: string;
  rol: string;
  v_impacto_kmh: [number, number];
  delta_v_kmh: [number, number];
  /** Distancia entre las posiciones finales de las dos hipótesis (m). */
  separacion_reposo_m: number;
}

/** Diferencias por vehículo entre la escena (base) y la hipótesis, para el panel. */
export function compareHypotheses(base: Resultado, hipotesis: Resultado): VehicleDiff[] {
  const other = new Map(hipotesis.vehiculos.map((v) => [v.id, v]));
  const out: VehicleDiff[] = [];
  for (const v of base.vehiculos) {
    const h = other.get(v.id);
    if (!h) continue;
    out.push({
      id: v.id,
      rol: v.rol,
      v_impacto_kmh: [v.v_impacto_kmh, h.v_impacto_kmh],
      delta_v_kmh: [v.delta_v_kmh, h.delta_v_kmh],
      separacion_reposo_m: Math.hypot(
        v.pose_final.x - h.pose_final.x,
        v.pose_final.y - h.pose_final.y,
      ),
    });
  }
  return out;
}
