/**
 * Las tipografías del tráiler: las mismas de la app (Instrument Serif para títulos, Instrument Sans
 * para la interfaz y Geist Mono), de licencia libre (SIL OFL 1.1, `assets/ASSETS.md`). Se cargan de
 * sus paquetes y el render espera a que estén listas: ningún cuadro sale con la letra de respaldo.
 */
import geistMono from "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2";
import instrumentSans from "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2";
import instrumentSerif from "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2";
import { continueRender, delayRender } from "remotion";

export const SERIF = "Croquis Serif";
export const SANS = "Croquis Sans";
export const MONO = "Croquis Mono";

let cargadas: Promise<void> | null = null;

/** Carga las tres familias una sola vez y detiene el render mientras tanto. */
export function cargarFuentes(): Promise<void> {
  if (cargadas) return cargadas;
  if (typeof document === "undefined") return Promise.resolve();
  const espera = delayRender("Cargando las tipografías");
  const caras = [
    new FontFace(SERIF, `url(${instrumentSerif}) format("woff2")`, { weight: "400" }),
    new FontFace(SANS, `url(${instrumentSans}) format("woff2")`, { weight: "400 700" }),
    new FontFace(MONO, `url(${geistMono}) format("woff2")`, { weight: "100 900" }),
  ];
  cargadas = Promise.all(caras.map((c) => c.load()))
    .then((listas) => {
      for (const c of listas) document.fonts.add(c);
    })
    .then(() => continueRender(espera));
  return cargadas;
}
