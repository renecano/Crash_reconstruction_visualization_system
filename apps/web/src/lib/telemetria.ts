/**
 * Telemetría del visor (PLAN §11.4): velocidad de cada vehículo en cada instante y su traza en el
 * tiempo, sacadas de la trayectoria que calculó el solver (`vx`, `vy`); nada se estima aquí.
 */
import type { Resultado } from "@croquis/scene-schema";
import type { EventMarker } from "@croquis/viewer";
import type { Lang } from "@/i18n";

type Trayectoria = Resultado["vehiculos"][number]["trayectoria"];

/** Índice del último punto con t ≤ x (búsqueda binaria; `t` está ordenado). */
function indiceAntes(t: readonly number[], x: number): number {
  let lo = 0;
  let hi = t.length - 1;
  if (x <= (t[0] ?? 0)) return 0;
  if (x >= (t[hi] ?? 0)) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((t[mid] ?? 0) <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Rapidez (km/h) interpolada linealmente en el instante t. */
export function velocidadEn(tr: Trayectoria, t: number): number {
  const n = tr.t.length;
  if (n === 0) return 0;
  const i = indiceAntes(tr.t, t);
  const j = Math.min(n - 1, i + 1);
  const t0 = tr.t[i] ?? 0;
  const t1 = tr.t[j] ?? t0;
  const f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  const vx = (tr.vx[i] ?? 0) + f * ((tr.vx[j] ?? 0) - (tr.vx[i] ?? 0));
  const vy = (tr.vy[i] ?? 0) + f * ((tr.vy[j] ?? 0) - (tr.vy[i] ?? 0));
  return Math.hypot(vx, vy) * 3.6;
}

/** La traza de rapidez en `n` puntos parejos entre t0 y t1, para dibujarla. */
export function trazaVelocidad(
  tr: Trayectoria,
  t0: number,
  t1: number,
  n = 160,
): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  for (let k = 0; k < n; k++) {
    const t = t0 + ((t1 - t0) * k) / (n - 1);
    out.push({ t, v: velocidadEn(tr, t) });
  }
  return out;
}

const ETIQUETA: Record<string, { es: string; en: string }> = {
  inicio_frenado: { es: "Inicio de frenado", en: "Braking starts" },
  impacto_vehiculo_vehiculo: { es: "Impacto", en: "Impact" },
  impacto_vehiculo_objeto: { es: "Impacto", en: "Impact" },
  impacto_vehiculo_persona: { es: "Impacto", en: "Impact" },
  reposo: { es: "Reposo", en: "Rest" },
};

/** La etiqueta de un marcador en el idioma de la página (en español, la misma del visor). */
export function etiquetaEvento(m: EventMarker, lang: Lang): string {
  if (lang === "es") return m.etiqueta;
  const base = ETIQUETA[m.tipo]?.en ?? m.tipo.replaceAll("_", " ");
  const quien = /\(([^)]+)\)$/.exec(m.etiqueta)?.[1];
  return quien ? `${base} (${quien})` : base;
}

/** Tiempo relativo al impacto con su signo: «−1.24 s», «0.00 s», «+0.50 s». */
export { formatTime } from "@croquis/viewer";
