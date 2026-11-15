/**
 * La animación de la marca para la entrada y el cierre del video (HTML y CSS, sin video ni
 * imágenes): el arco de la C se dibuja, aparece la mira de señal y entra el logotipo CROQUIS, todo
 * tomado de `assets/brand` (`marca.json` y sus SVG; el nombre nunca se escribe con la fuente,
 * BRAND.md). Es el logo de la portada pública (René, 2026-11-15). Fondo grafito y Geist.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ } from "./comun.mjs";

const MARCA = JSON.parse(readFileSync(join(RAIZ, "assets/brand/marca.json"), "utf8"));
const MEDIDAS = JSON.parse(readFileSync(join(RAIZ, "assets/brand/medidas.json"), "utf8"));
const logotipo = readFileSync(join(RAIZ, "assets/brand/logotipo.svg"), "utf8");
/** Las letras CROQUIS: el último grupo del logotipo (antes va el símbolo). */
const letras = logotipo.slice(logotipo.lastIndexOf("<g "), logotipo.lastIndexOf("</svg>"));
/** Dónde pone el logotipo al símbolo (su primer grupo). */
const origen = /<g transform="(translate\([^)]*\))"/.exec(logotipo)[1];
const S = MARCA.simbolo;
const ARCO = MARCA.arco;
const [MX, MY] = MARCA.mira;
const CLARO = MARCA.colores.sobre_oscuro;
const SENAL = MARCA.colores.senal;
const MIRA =
  `<circle cx="${MX}" cy="${MY}" r="${S.mira.radio}" fill="none" stroke="${SENAL}" stroke-width="${S.mira.grosor}"/>` +
  S.mira.rayas
    .map(
      ([x1, y1, x2, y2]) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SENAL}" stroke-width="${S.mira.rayas_grosor}"/>`,
    )
    .join("") +
  `<circle cx="${MX}" cy="${MY}" r="${S.mira.punto}" fill="${SENAL}"/>`;
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
#trazo { stroke-dasharray: 1; stroke-dashoffset: 1; animation: dibuja 1.8s ${t(0.4)} cubic-bezier(.6,0,.2,1) forwards; }
@keyframes dibuja { to { stroke-dashoffset: 0; } }
.x { opacity: 0; transform-box: fill-box; transform-origin: center; transform: scale(.4);
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
<svg class="logo" viewBox="0 0 ${MEDIDAS.logotipo.w} ${MEDIDAS.logotipo.h}" role="img" aria-label="Croquis">
  <defs><mask id="m" maskUnits="userSpaceOnUse" x="-10" y="-10" width="84" height="84"><path id="trazo" d="${ARCO}" fill="none" stroke="#fff" stroke-width="${S.arco_grosor + 3}" pathLength="1"/></mask></defs>
  <g transform="${origen}">
    <path class="arco" d="${ARCO}" fill="none" stroke="${CLARO}" stroke-width="${S.arco_grosor}" mask="url(#m)"/>
    <path d="${S.interior.d}" fill="none" stroke="${CLARO}" stroke-width="${S.interior.grosor}" opacity="${S.interior.opacidad}" stroke-dasharray="${S.interior.guiones}" mask="url(#m)"/>
    <g class="x">${MIRA}</g>
  </g>
  <g class="letras">${letras}</g>
</svg>
<div class="frase">${frase}</div>
</body></html>`;
}
