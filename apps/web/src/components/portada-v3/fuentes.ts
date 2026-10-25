/**
 * Las tipografías de la portada v3, de Google Fonts y bajo SIL Open Font License 1.1
 * (assets/ASSETS.md): `next/font` las descarga al compilar y las sirve desde el propio sitio.
 * Anybody y Martian Mono llevan el eje de ancho (`wdth`), que la portada anima. Caveat solo la usa
 * el modo «croquis a mano» (huevo de pascua): no se precarga.
 */
import { Anybody, Caveat, Martian_Mono, Schibsted_Grotesk } from "next/font/google";

const anybody = Anybody({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--pv3-anybody",
  display: "swap",
});
const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--pv3-schibsted",
  display: "swap",
});
const martian = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--pv3-martian",
  display: "swap",
});
const caveat = Caveat({
  subsets: ["latin"],
  variable: "--pv3-caveat",
  display: "swap",
  preload: false,
});

export const FUENTES_PORTADA_V3 = [anybody, schibsted, martian, caveat]
  .map((f) => f.variable)
  .join(" ");
