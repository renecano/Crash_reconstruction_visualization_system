/**
 * Reconstrucción en el navegador con el solver TS en un Web Worker (sin servidor). Un solo worker
 * por página; cada petición lleva un id para emparejar sus respuestas.
 */
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";

interface Reply {
  id: number;
  fase?: "reconstruccion" | "completo" | "agentes";
  resultado?: Resultado;
  agentes?: Record<string, unknown> | null;
  error?: string;
}

interface Pending {
  completo: boolean;
  onParcial?: (r: Resultado) => void;
  resolve: (r: Resultado) => void;
  reject: (e: Error) => void;
  /** Para `probarConductoresEnNavegador`: recibe el bloque `agentes` (o null). */
  onAgentes?: (a: Record<string, unknown> | null) => void;
  /** Si va al worker de los conductores. */
  agentes?: boolean;
}

/**
 * Dos workers del mismo archivo: el de las reconstrucciones y el de las pruebas de los conductores
 * (R12a), que tardan menos de un segundo y no deben esperar detrás de un resultado completo.
 */
const workers: Partial<Record<"general" | "conductores", Worker>> = {};
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(cual: "general" | "conductores" = "general"): Worker {
  const existente = workers[cual];
  if (existente) return existente;
  // Archivo propio en `public/` (lo empaqueta `scripts/build-worker.mjs`): el service worker lo
  // precarga y sin red arranca igual (ADR 0030).
  const worker = new Worker("/workers/reconstruct.js");
  workers[cual] = worker;
  worker.onmessage = (ev: MessageEvent<Reply>) => {
    const p = pending.get(ev.data.id);
    if (!p) return;
    const { fase, resultado, error } = ev.data;
    if (fase === "agentes" && p.onAgentes) {
      pending.delete(ev.data.id);
      p.onAgentes(ev.data.agentes ?? null);
      return;
    }
    if (!resultado) {
      pending.delete(ev.data.id);
      p.reject(new Error(error ?? "El solver no devolvió resultado."));
      return;
    }
    if (p.completo && fase === "reconstruccion") {
      p.onParcial?.(resultado);
      return;
    }
    pending.delete(ev.data.id);
    p.resolve(resultado);
  };
  worker.onerror = (ev) => {
    for (const [id, p] of pending) {
      if ((p.agentes ?? false) !== (cual === "conductores")) continue;
      p.reject(new Error(ev.message || "El solver falló."));
      pending.delete(id);
    }
  };
  return worker;
}

/** Solo la reconstrucción (trayectorias, daño, personas): lo necesario para dibujar. */
export function reconstruirEnNavegador(spec: EscenaSpec): Promise<Resultado> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { completo: false, resolve, reject });
    getWorker().postMessage({ id, spec });
  });
}

/**
 * Resultado completo (con Monte Carlo, inversión y consistencia). `onParcial` recibe antes la
 * reconstrucción, para dibujar mientras se calcula lo demás.
 */
export function reconstruirCompletoEnNavegador(
  spec: EscenaSpec,
  onParcial?: (r: Resultado) => void,
): Promise<Resultado> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { completo: true, onParcial, resolve, reject });
    getWorker().postMessage({ id, spec, completo: true });
  });
}

/**
 * Los conductores como agentes (R12a): el bloque `agentes` del solver para una escena con algún
 * `conductor`, o null si ninguno lo trae.
 */
export function probarConductoresEnNavegador(
  spec: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, {
      completo: false,
      resolve: () => resolve(null),
      reject,
      onAgentes: resolve,
      agentes: true,
    });
    getWorker("conductores").postMessage({ id, spec, agentes: true });
  });
}

/** Escena con otra velocidad previa para un vehículo (lo demás igual). */
export function withSpeed(spec: EscenaSpec, vehicleId: string, kmh: number): EscenaSpec {
  const next = structuredClone(spec);
  const v = next.vehiculos.find((x) => x.id === vehicleId);
  if (v) {
    v.velocidad_previa = { valor: kmh, unidad: "km/h", fuente: "usuario", confianza: 0.9 };
  }
  return next;
}
