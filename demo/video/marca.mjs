/**
 * La animación de la marca para la entrada y el cierre del video (HTML y CSS, sin video ni
 * imágenes): el arco punteado de la C se dibuja, aparece la X de señal y entra el logotipo CROQUIS,
 * todo tomado de los SVG de `assets/brand` (el nombre nunca se escribe con la fuente, BRAND.md).
 * Fondo grafito y Geist, del sistema visual.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ } from "./comun.mjs";

const logotipo = readFileSync(join(RAIZ, "assets/brand/logotipo.svg"), "utf8");
/** Las letras CROQUIS: el segundo grupo del logotipo (el primero es el símbolo). */
const letras = logotipo.slice(logotipo.indexOf("</g>") + 4, logotipo.lastIndexOf("</svg>"));
const ARCO = "M91.11 28.89 A44 44 0 1 0 91.11 91.11";
const X = "M91 51 L109 69 M109 51 L91 69";
const geist = pathToFileURL(
  join(RAIZ, "apps/web/node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2"),
).href;

/**
 * La página de la marca. `modo` «entrada» dibuja la marca y luego la frase; «cierre» la muestra ya
 * armada y luego la frase.
 */
export function htmlMarca(modo, frase) {
  const entrada = modo === "entrada";
  const t = (s) => `${entrada ? s : Math.max(0, s - 2.4)}s`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@font-face { font-family: Geist; src: url("${geist}") format("woff2"); font-weight: 100 900; }
html, body { margin: 0; width: 1920px; height: 1080px; background: #0B0C0F; overflow: hidden; }
body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 72px;
  font-family: Geist, system-ui, sans-serif; color: #F2F3F5; }
svg.logo { width: 980px; height: auto; overflow: visible; }
.arco { stroke-dasharray: 52 25.6; }
#trazo { stroke-dasharray: 1; stroke-dashoffset: 1; animation: dibuja 1.8s ${t(0.4)} cubic-bezier(.6,0,.2,1) forwards; }
@keyframes dibuja { to { stroke-dashoffset: 0; } }
.x { opacity: 0; transform-origin: 100px 60px; transform: scale(.4);
  animation: aparece .55s ${t(2.2)} cubic-bezier(.2,.8,.2,1.2) forwards; }
@keyframes aparece { to { opacity: 1; transform: scale(1); } }
.letras { opacity: 0; transform: translateX(-28px);
  animation: entra .9s ${t(2.8)} cubic-bezier(.2,.8,.2,1) forwards; }
@keyframes entra { to { opacity: 1; transform: none; } }
.frase { font-size: 44px; font-weight: 600; letter-spacing: -0.02em; text-align: center; max-width: 1400px;
  line-height: 1.25; opacity: 0; transform: translateY(12px);
  animation: entra-frase .8s ${t(4.2)} ease-out forwards; }
.frase span { color: #A4A9B3; }
@keyframes entra-frase { to { opacity: 1; transform: none; } }
${entrada ? "" : "#trazo { animation-duration: .01s; } .x, .letras { animation-duration: .4s; }"}
</style></head><body>
<svg class="logo" viewBox="0 0 809.04 128.00" role="img" aria-label="Croquis">
  <defs><mask id="m" maskUnits="userSpaceOnUse" x="-20" y="-20" width="160" height="160"><path id="trazo" d="${ARCO}" fill="none" stroke="#fff" stroke-width="18" pathLength="1"/></mask></defs>
  <g transform="translate(4 4)">
    <path class="arco" d="${ARCO}" fill="none" stroke="#F4F2EC" stroke-width="13" mask="url(#m)"/>
  </g>
  <g transform="translate(4 4)"><path class="x" d="${X}" fill="none" stroke="#FF5B2E" stroke-width="6" stroke-linecap="round"/></g>
  <g class="letras">${letras}</g>
</svg>
<div class="frase">${frase}</div>
</body></html>`;
}
