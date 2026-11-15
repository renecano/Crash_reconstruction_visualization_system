/**
 * El logo para el PDF y el Word del dictamen: el SVG de la marca (`assets/brand`, de `marca.json`)
 * dibujado tal cual en un PNG. No se redibuja: se carga `/marca/logotipo-sobre-claro.svg` y se pinta
 * en un lienzo, porque Word no acepta SVG. Solo corre en el navegador.
 */
import medidas from "../../../../assets/brand/medidas.json";

/** Proporción del logotipo (alto entre ancho), de las medidas que escribe `make_brand.py`. */
export const PROPORCION_LOGO = medidas.logotipo.h / medidas.logotipo.w;
/** Ancho del logo en la hoja (puntos del PDF y pixeles de Word). */
export const ANCHO_LOGO = 118;

/** El logotipo sobre claro como PNG (data URL), a 4× para que se imprima nítido; null si no se pudo. */
export async function logoDictamen(): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const svg = await (await fetch("/marca/logotipo-sobre-claro.svg")).text();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      await new Promise<void>((ok, falla) => {
        img.onload = () => ok();
        img.onerror = () => falla(new Error("no cargó el logo"));
        img.src = url;
      });
      const lienzo = document.createElement("canvas");
      lienzo.width = Math.round(medidas.logotipo.w * 4);
      lienzo.height = Math.round(medidas.logotipo.h * 4);
      const ctx = lienzo.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      return lienzo.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
