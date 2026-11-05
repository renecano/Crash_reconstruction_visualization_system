/**
 * Las tipografías del rediseño «Laboratorio» de /cesvi (prompt §2), de Google Fonts y bajo SIL Open
 * Font License 1.1 (assets/ASSETS.md): `next/font` las descarga al compilar y las sirve desde el
 * propio sitio. Instrument Serif para títulos y cifras protagonistas (con su itálica), Instrument
 * Sans para la interfaz; Geist Mono ya viene del documento. El par se cambia solo aquí y en
 * `--fuente-titulo` / `--fuente` de `styles/sistema.css`.
 */
import { Instrument_Sans, Instrument_Serif } from "next/font/google";

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});
const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

/** Las clases que ponen las variables de las dos fuentes en el contenedor. */
export const FUENTES_LABORATORIO = `${serif.variable} ${sans.variable}`;
