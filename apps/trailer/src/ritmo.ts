/**
 * El pulso del tráiler: una sola rejilla para la imagen y la música (`ritmo.json`, que también lee
 * `tools/trailer/musica.mjs`). Aquí están las cuentas: de segundos a cuadros, en qué tramo cae un
 * cuadro y cuánto lleva de él.
 */
import datos from "./ritmo.json";

export const RITMO = datos;
export const FPS = datos.cuadros_por_segundo;
export const DURACION_S = datos.duracion;
export const CUADROS = Math.round(DURACION_S * FPS);
export const MOMENTOS = datos.momentos;

export type ClaveTramo = "trazo" | "impacto" | "evidencia" | "trayectorias" | "frases" | "logo";

/** Lo que dura un pulso, en segundos. */
export const PULSO_S = 60 / datos.pulsos_por_minuto;

/** De segundos a cuadros. */
export const cuadroDe = (segundos: number): number => Math.round(segundos * FPS);

/** Si ese instante cae en la rejilla: en un pulso o en una de sus `partes` (2 = medios pulsos). */
export function enLaRejilla(segundos: number, partes = 2): boolean {
  const paso = PULSO_S / partes;
  return Math.abs(segundos / paso - Math.round(segundos / paso)) < 1e-6;
}

/** El tramo del storyboard, con sus cuadros. */
export function tramo(clave: ClaveTramo): { desde: number; hasta: number; cuadros: number } {
  const t = datos.tramos.find((x) => x.clave === clave);
  if (!t) throw new Error(`No hay tramo «${clave}» en ritmo.json`);
  const desde = cuadroDe(t.desde);
  const hasta = cuadroDe(t.hasta);
  return { desde, hasta, cuadros: hasta - desde };
}

/** De 0 a 1 entre dos instantes (segundos), sin salirse. */
export function entre(segundos: number, desde: number, hasta: number): number {
  if (hasta <= desde) return segundos >= hasta ? 1 : 0;
  return Math.min(1, Math.max(0, (segundos - desde) / (hasta - desde)));
}

/** Suavizados: entrada y salida suaves, y salida suave sola. */
export const suave = (x: number): number => x * x * (3 - 2 * x);
export const sale = (x: number): number => 1 - (1 - x) ** 3;
export const entra = (x: number): number => x ** 3;

/** Mezcla lineal. */
export const mezcla = (a: number, b: number, t: number): number => a + (b - a) * t;
