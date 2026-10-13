/**
 * Análisis de visibilidad sobrepuesto a la vista del conductor (PLAN §6.1.9 y §7.5): una línea de
 * vista del ojo a cada actor, verde si se veía en ese instante y naranja si algo la tapaba, y el
 * contorno del objeto o vehículo que la tapaba. Todo sale de `resultado.visibilidad` (el solver);
 * el visor no recalcula nada.
 */
import type { Resultado } from "@croquis/scene-schema";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Material,
} from "three";
import { toThree } from "./coords";
import { samplePerson, sampleVehicle } from "./sample";
import type { SceneGraph } from "./scene-graph";

export const SIGHT_VISIBLE = "#3fbf7f";
export const SIGHT_BLOCKED = "#f08a24";

type Pair = Resultado["visibilidad"][number];

const FRONT_CAB = new Set(["autobus", "camion_unitario", "tractocamion", "microbus_combi", "van"]);
const TWO_WHEEL = new Set(["motocicleta", "scooter", "bicicleta"]);

/** Ojo del conductor en el marco del vehículo (x adelante, y izquierda), igual que el solver. */
export function eyeOffset(clase: string, length: number, width: number): [number, number] {
  if (TWO_WHEEL.has(clase)) return [-0.1, 0];
  if (FRONT_CAB.has(clase)) return [0.5 * length - 1.0, 0.5 * width - 0.6];
  return [-0.05 * length, Math.max(0, 0.5 * width - 0.55)];
}

/** Altura del ojo que usó el solver para ese vehículo (AASHTO o supuesto por clase). */
export function eyeHeightFor(resultado: Resultado, vehicleId: string): number | undefined {
  return resultado.visibilidad?.find((p) => p.observador === vehicleId)?.altura_ojo_m;
}

/** Índice de la muestra de visibilidad más cercana a t (las muestras cubren hasta el impacto). */
export function sampleIndex(pair: Pair, t: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pair.t.length; i++) {
    const d = Math.abs(pair.t[i]! - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export interface VisibilityOverlay {
  group: Group;
  /** Muestra las líneas del conductor indicado (o ninguna). */
  setObserver(vehicleId: string | undefined): void;
  dispose(): void;
}

export function buildVisibilityOverlay(resultado: Resultado, graph: SceneGraph): VisibilityOverlay {
  const group = new Group();
  group.name = "visibilidad";
  group.visible = false;
  const mats: Material[] = [];
  const geos: BufferGeometry[] = [];
  const visibleMat = new LineBasicMaterial({
    color: SIGHT_VISIBLE,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const blockedMat = new LineBasicMaterial({
    color: SIGHT_BLOCKED,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  mats.push(visibleMat, blockedMat);
  const vehicles = new Map(resultado.vehiculos.map((v) => [v.id, v]));
  const persons = new Map(resultado.personas.map((p) => [p.id, p]));
  const objects = new Map((resultado.objetos ?? []).map((o) => [o.id, o]));
  let observer: string | undefined;
  const lines = (resultado.visibilidad ?? []).map((pair) => {
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(6), 3));
    geos.push(geo);
    const line = new LineSegments(geo, visibleMat);
    line.name = `vista_${pair.observador}_${pair.objetivo}`;
    line.renderOrder = 10;
    line.frustumCulled = false;
    group.add(line);
    return { pair, line, geo };
  });
  // Contorno del oclusor (caja de su huella y su altura).
  const outlineMat = new LineBasicMaterial({ color: SIGHT_BLOCKED, depthTest: false });
  mats.push(outlineMat);
  const outline = new LineSegments(new EdgesGeometry(new BoxGeometry(1, 1, 1)), outlineMat);
  outline.name = "oclusor";
  outline.visible = false;
  outline.renderOrder = 11;
  group.add(outline);

  const targetPoint = (pair: Pair, t: number): [number, number, number] | null => {
    if (pair.tipo_objetivo === "vehiculo") {
      const v = vehicles.get(pair.objetivo);
      if (!v) return null;
      const s = sampleVehicle(v.trayectoria, t);
      return [...toThree(s.x, s.y, 0.6 * v.dimensiones.alto_m)];
    }
    if (pair.tipo_objetivo === "persona") {
      const p = persons.get(pair.objetivo);
      const s = p ? samplePerson(p.trayectoria, t) : null;
      return s && p ? [...toThree(s.x, s.y, 0.55 * p.estatura_m)] : null;
    }
    const o = objects.get(pair.objetivo);
    return o ? [...toThree(o.x, o.y, Math.min(1.5, o.alto_m))] : null;
  };

  graph.addUpdater(
    (t) => {
      outline.visible = false;
      for (const { pair, line, geo } of lines) {
        const on = observer !== undefined && pair.observador === observer && t <= 0;
        line.visible = on;
        if (!on) continue;
        const v = vehicles.get(pair.observador)!;
        const s = sampleVehicle(v.trayectoria, t);
        const [ox, oy] = eyeOffset(v.clase, v.dimensiones.largo_m, v.dimensiones.ancho_m);
        const c = Math.cos(s.yaw);
        const sn = Math.sin(s.yaw);
        const eye = toThree(s.x + c * ox - sn * oy, s.y + sn * ox + c * oy, pair.altura_ojo_m);
        const target = targetPoint(pair, t);
        if (!target) {
          line.visible = false;
          continue;
        }
        const k = sampleIndex(pair, t);
        const seen = pair.visible[k] ?? true;
        line.material = seen ? visibleMat : blockedMat;
        const pos = geo.getAttribute("position") as BufferAttribute;
        pos.setXYZ(0, eye[0], eye[1], eye[2]);
        pos.setXYZ(1, target[0], target[1], target[2]);
        pos.needsUpdate = true;
        const cause = pair.causa[k] ?? "";
        if (!seen && cause.includes(":")) {
          const [kind, id] = cause.split(":") as [string, string];
          if (kind === "objeto") {
            const o = objects.get(id);
            if (o) {
              const w = o.forma === "caja" ? o.largo_m : 2 * (o.copa?.radio_m ?? o.radio_m ?? 0.3);
              const d = o.forma === "caja" ? o.ancho_m : w;
              outline.scale.set(w, o.alto_m, d);
              outline.position.set(...toThree(o.x, o.y, o.alto_m / 2));
              outline.rotation.set(0, (o.rumbo_deg * Math.PI) / 180, 0);
              outline.visible = true;
            }
          } else if (kind === "vehiculo") {
            const ov = vehicles.get(id);
            if (ov) {
              const os = sampleVehicle(ov.trayectoria, t);
              outline.scale.set(
                ov.dimensiones.largo_m,
                ov.dimensiones.alto_m,
                ov.dimensiones.ancho_m,
              );
              outline.position.set(...toThree(os.x, os.y, ov.dimensiones.alto_m / 2));
              outline.rotation.set(0, os.yaw, 0);
              outline.visible = true;
            }
          }
        }
      }
    },
    { after: true },
  );
  graph.root.add(group);
  return {
    group,
    setObserver(id) {
      observer = id;
      group.visible = id !== undefined;
      graph.update(graph.time);
    },
    dispose() {
      for (const g of geos) g.dispose();
      outline.geometry.dispose();
      for (const m of mats) m.dispose();
      group.removeFromParent();
    },
  };
}
