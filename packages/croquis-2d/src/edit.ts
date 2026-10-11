/**
 * Ediciones puras sobre una EscenaSpec desde el croquis. Cada edición devuelve una copia nueva y
 * marca la procedencia del dato como `usuario` con confianza 1 (PLAN §2.2): lo que la persona
 * arrastra deja de ser supuesto.
 */
import type { EscenaSpec, Pose2D, Procedencia } from "@croquis/scene-schema";

export type PoseKind = "inicial" | "final";

export type EditOp =
  | { kind: "move_vehicle"; id: string; pose: PoseKind; x: number; y: number }
  | { kind: "rotate_vehicle"; id: string; pose: PoseKind; rumbo_deg: number }
  | { kind: "move_person"; id: string; pose: PoseKind; x: number; y: number }
  | { kind: "move_object"; id: string; x: number; y: number }
  | { kind: "move_device"; id: string; x: number; y: number }
  | { kind: "move_evidence_point"; id: string; index: number; x: number; y: number }
  | { kind: "move_event_point"; id: string; x: number; y: number };

const USER: Procedencia = { fuente: "usuario", confianza: 1 };

/** Redondea a centímetros para que el JSON no acumule ruido de arrastre. */
export function snap(v: number, step = 0.01): number {
  return Math.round(v / step) * step;
}

export function normalizeHeading(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return Object.is(d, -0) ? 0 : d;
}

function withPose(prev: Pose2D | undefined, patch: Partial<Pick<Pose2D, "x" | "y" | "rumbo_deg">>): Pose2D {
  const base = prev ?? { x: 0, y: 0, rumbo_deg: 0, procedencia: USER };
  return { ...base, ...patch, procedencia: { ...USER, nota: base.procedencia.nota } };
}

function poseKey(kind: PoseKind): "posicion_inicial" | "posicion_final" {
  return kind === "inicial" ? "posicion_inicial" : "posicion_final";
}

/** Aplica una edición y devuelve la escena nueva. Lanza si el id no existe. */
export function applyEdit(spec: EscenaSpec, op: EditOp): EscenaSpec {
  const next = structuredClone(spec);
  switch (op.kind) {
    case "move_vehicle":
    case "rotate_vehicle": {
      const v = next.vehiculos.find((x) => x.id === op.id);
      if (!v) throw new Error(`Vehículo inexistente: ${op.id}`);
      const key = poseKey(op.pose);
      const patch = op.kind === "move_vehicle" ? { x: snap(op.x), y: snap(op.y) } : { rumbo_deg: normalizeHeading(snap(op.rumbo_deg, 0.5)) };
      v[key] = withPose(v[key], patch);
      return next;
    }
    case "move_person": {
      const p = next.personas.find((x) => x.id === op.id);
      if (!p) throw new Error(`Persona inexistente: ${op.id}`);
      const key = poseKey(op.pose);
      p[key] = withPose(p[key], { x: snap(op.x), y: snap(op.y) });
      return next;
    }
    case "move_object": {
      const o = (next.entorno.objetos ?? []).find((x) => x.id === op.id);
      if (!o) throw new Error(`Objeto inexistente: ${op.id}`);
      o.posicion = { x: snap(op.x), y: snap(op.y) };
      o.procedencia = { ...USER, nota: o.procedencia.nota };
      return next;
    }
    case "move_device": {
      const d = (next.lugar.dispositivos ?? []).find((x) => x.id === op.id);
      if (!d) throw new Error(`Dispositivo inexistente: ${op.id}`);
      d.posicion = { x: snap(op.x), y: snap(op.y) };
      d.procedencia = { ...USER, nota: d.procedencia.nota };
      return next;
    }
    case "move_evidence_point": {
      const e = next.evidencias.find((x) => x.id === op.id);
      if (!e?.puntos?.[op.index]) throw new Error(`Punto de evidencia inexistente: ${op.id}[${op.index}]`);
      e.puntos[op.index] = { x: snap(op.x), y: snap(op.y) };
      e.procedencia = { ...USER, nota: e.procedencia.nota };
      return next;
    }
    case "move_event_point": {
      const e = next.eventos.find((x) => x.id === op.id);
      if (!e) throw new Error(`Evento inexistente: ${op.id}`);
      e.punto_impacto = { x: snap(op.x), y: snap(op.y) };
      e.procedencia = { ...USER, nota: e.procedencia.nota };
      return next;
    }
    default:
      return next;
  }
}

export function applyEdits(spec: EscenaSpec, ops: EditOp[]): EscenaSpec {
  return ops.reduce(applyEdit, spec);
}
