/**
 * E6 en el navegador (`/medicion`, PLAN §7.8 y §11.5, ADR 0045): la lógica pura de la medición,
 * la misma que `eval/e6_performance.mjs` y `eval/lib/viewer-measure.mjs`, para medir alta y ultra en
 * la computadora de demo sin Node ni Playwright.
 *
 * - Cada configuración (escena × calidad × renderer) se mide `repeticiones` veces; cada repetición
 *   recorre las escenas en orden alterno (directo, inverso, …) y se reporta la repetición mediana
 *   por fps promedio (ADR 0026).
 * - Un navegador normal limita los cuadros a la frecuencia de la pantalla (vsync). Se estima esa
 *   frecuencia antes de medir y el resultado dice si los fps quedaron topados por ella.
 */

export const ESCENAS_E6 = [
  "alcance",
  "lateral_interseccion",
  "frontal_curva",
  "peaton_cruce",
  "motociclista",
  "objeto_fijo_arbol",
  "poste",
  "volcadura",
  "nocturno_lluvia",
  "glorieta",
  "interseccion_toluca",
] as const;

export type CalidadE6 = "baja" | "media" | "alta" | "ultra";
export type RendererE6 = "webgpu" | "webgl";

/** Meta en la computadora de demo (PLAN §7.8): ≥ 60 fps en alta o ultra en todas las escenas. */
export const META_DEMO_FPS = 60;

export interface ConfigMedicion {
  escenas: readonly string[];
  calidades: readonly CalidadE6[];
  renderers: readonly RendererE6[];
  repeticiones: number;
  /** Segundos de calentamiento y de medición, y pausa entre mediciones (como E6: 2, 6 y 8). */
  calentamiento_s: number;
  segundos: number;
  pausa_s: number;
}

export const CONFIG_DEMO: ConfigMedicion = {
  escenas: ESCENAS_E6,
  calidades: ["alta", "ultra"],
  renderers: ["webgpu", "webgl"],
  repeticiones: 3,
  calentamiento_s: 2,
  segundos: 6,
  pausa_s: 8,
};

export interface PasoMedicion {
  escena: string;
  calidad: CalidadE6;
  renderer: RendererE6;
  repeticion: number;
}

/**
 * El orden de las mediciones: por renderer y calidad, cada repetición recorre las escenas, en
 * orden directo las impares y en orden inverso las pares (la última escena no se mide siempre con
 * el equipo más caliente).
 */
export function planMedicion(c: ConfigMedicion): PasoMedicion[] {
  const pasos: PasoMedicion[] = [];
  for (const renderer of c.renderers) {
    for (const calidad of c.calidades) {
      for (let r = 0; r < c.repeticiones; r++) {
        const orden = r % 2 === 0 ? [...c.escenas] : [...c.escenas].reverse();
        for (const escena of orden) pasos.push({ escena, calidad, renderer, repeticion: r + 1 });
      }
    }
  }
  return pasos;
}

/** Percentil p (0–100) de una lista ordenada, como en `viewer-measure.mjs`. */
export function percentil(ordenados: readonly number[], p: number): number {
  if (ordenados.length === 0) return Number.NaN;
  const i = Math.min(
    ordenados.length - 1,
    Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1),
  );
  return ordenados[i]!;
}

export const redondear = (v: number, d = 2): number | null =>
  Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null;

export interface ResumenCuadros {
  cuadros: number;
  fps_promedio: number | null;
  fps_mediana: number | null;
  fps_p1_bajo: number | null;
  cuadro_p95_ms: number | null;
}

/** Fps promedio, mediano y del 1 % más lento a partir de los tiempos por cuadro (ms). */
export function resumirCuadros(frameMs: readonly number[]): ResumenCuadros {
  const ms = frameMs.filter((x) => x > 0).sort((a, b) => a - b);
  const media = ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length);
  return {
    cuadros: ms.length,
    fps_promedio: ms.length ? redondear(1000 / media, 1) : null,
    fps_mediana: ms.length ? redondear(1000 / percentil(ms, 50), 1) : null,
    fps_p1_bajo: ms.length ? redondear(1000 / percentil(ms, 99), 1) : null,
    cuadro_p95_ms: ms.length ? redondear(percentil(ms, 95), 2) : null,
  };
}

/** La repetición mediana por fps promedio (con número par, la menor de las dos centrales). */
export function repeticionMediana<T extends { fps_promedio: number | null }>(
  lista: readonly T[],
): T {
  const orden = [...lista].sort((a, b) => (a.fps_promedio ?? 0) - (b.fps_promedio ?? 0));
  return orden[Math.floor((orden.length - 1) / 2)]!;
}

/**
 * Frecuencia de la pantalla (Hz) a partir de intervalos de `requestAnimationFrame` medidos con la
 * página quieta: la mediana, para que un cuadro tardío no la mueva.
 */
export function frecuenciaPantalla(intervalosMs: readonly number[]): number | null {
  const ms = intervalosMs.filter((x) => x > 0).sort((a, b) => a - b);
  if (ms.length < 10) return null;
  return redondear(1000 / percentil(ms, 50), 1);
}

/**
 * ¿El resultado quedó topado por la pantalla? Con vsync, los fps no pasan de la frecuencia; si la
 * mediana llega al 97 % de ella, el visor podría dar más y la cifra es un mínimo.
 */
export function topadoPorPantalla(fpsMediana: number | null, hz: number | null): boolean {
  if (fpsMediana === null || hz === null) return false;
  return fpsMediana >= 0.97 * hz;
}

/** Tirones ajenos al visor, con el mismo criterio que E6 (`externalStutter`). */
export function tironesExternos(r: {
  tareas_largas: number;
  fps_mediana: number | null;
  fps_promedio: number | null;
}): boolean {
  return (
    r.tareas_largas > 0 &&
    (r.fps_mediana ?? 0) > 40 &&
    (r.fps_promedio ?? 0) < 0.85 * (r.fps_mediana ?? 0)
  );
}

/**
 * Configuración desde la URL (`?calidades=alta,ultra&renderers=webgpu&escenas=glorieta&repeticiones=1
 * &calentamiento=2&segundos=6&pausa=8`), para corridas cortas de diagnóstico o de e2e. Lo que no
 * venga o no sea válido se queda como en E6.
 */
export function configDesdeUrl(
  q: URLSearchParams,
  base: ConfigMedicion = CONFIG_DEMO,
): ConfigMedicion {
  const lista = <T extends string>(
    k: string,
    validos: readonly T[],
    def: readonly T[],
  ): readonly T[] => {
    const v = q.get(k);
    if (!v) return def;
    const xs = v.split(",").filter((x): x is T => (validos as readonly string[]).includes(x));
    return xs.length ? [...new Set(xs)] : def;
  };
  const num = (k: string, min: number, max: number, def: number) => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  };
  return {
    escenas: lista("escenas", ESCENAS_E6, base.escenas as readonly (typeof ESCENAS_E6)[number][]),
    calidades: lista<CalidadE6>("calidades", ["baja", "media", "alta", "ultra"], base.calidades),
    renderers: lista<RendererE6>("renderers", ["webgpu", "webgl"], base.renderers),
    repeticiones: Math.round(num("repeticiones", 1, 5, base.repeticiones)),
    calentamiento_s: num("calentamiento", 0, 30, base.calentamiento_s),
    segundos: num("segundos", 1, 60, base.segundos),
    pausa_s: num("pausa", 0, 60, base.pausa_s),
  };
}

/** URL del visor para una medición, con los mismos parámetros que E6. */
export function urlVisor(base: string, p: PasoMedicion): string {
  const q = new URLSearchParams({
    escena: p.escena,
    calidad: p.calidad,
    camara: "cinematica",
    pantalla: "completa",
    auto: "1",
    bucle: "1",
    renderer: p.renderer,
  });
  return `${base}?${q.toString()}`;
}
