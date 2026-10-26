/**
 * La escena de AXA (A2010930) que renderiza el botón de la computadora de la demo (R11).
 *
 * Es la misma reconstrucción que el paso 6 de la app: el caso de ejemplo de /cesvi colocado en el
 * mapa con la versión de la evidencia (`apps/web/src/lib/axa-reconstruccion.ts`), reconstruido con
 * el solver de producción (port TS) y la semilla de la app (`especDeExpediente` con su
 * identificador por omisión). `especReconstruida` le pone las velocidades de la hipótesis que se
 * ve sin elegir (la de menor costo del multiarranque, ADR 0091) o de la que se pida, como el 3D del
 * caso, y la vía es el tramo de MEX 15D del caso (`A2010930-tramo.json`, de
 * OpenStreetMap), con sus calles en el 3D como las que el caso trae de Overpass (`conCallesDelMapa`).
 *
 *   pnpm --filter @croquis/cesvi exec tsx ../../tools/demo/escena-axa.mts [clave de la hipótesis]
 *
 * Escribe `demo/escenas-r11/axa.json` (EscenaSpec) e imprime la vía y las velocidades.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OverpassResponse } from "../../packages/croquis-2d/src/osm.ts";
import { expedienteAxaReconstruccion, viaAxa } from "../../apps/web/src/lib/axa-reconstruccion.ts";
import { conCallesDelMapa } from "../../apps/web/src/lib/calles-del-mapa.ts";
import {
  conHipotesis,
  especReconstruida,
  reconstruirExpediente,
} from "../../packages/cesvi/src/index.ts";

const RAIZ = join(import.meta.dirname, "../..");
const leer = (ruta: string) => JSON.parse(readFileSync(join(RAIZ, ruta), "utf8")) as unknown;

const { via } = viaAxa();
console.log(
  `vía: ${via.calle.nombre}, a ${via.distanciaM.toFixed(1)} m, rumbo ${via.rumbo.toFixed(1)}°`,
);
// El reposo de V2 es el supuesto del método de los restos: con la deformación medida puede haber
// varias hipótesis. Sin argumento, la que se ve sin elegir: la de menor costo del multiarranque
// (ADR 0091); con argumento, la de esa clave («dano-2», «reposo»…).
// La semilla de la app: el identificador por omisión de `especDeExpediente`.
const r0 = reconstruirExpediente(expedienteAxaReconstruccion());
const h = r0.hipotesis?.find((x) => x.clave === process.argv[2]) ?? r0.hipotesis?.[0];
const r = h ? conHipotesis(r0, h.clave) : r0;
for (const x of r0.hipotesis ?? [])
  console.log(
    `hipótesis ${x.clave}${x === h ? " (la del video)" : ""}: «${x.titulo}», costo ${x.costo} (${JSON.stringify(x.velocidades)})`,
  );
if (!h) console.log("sin hipótesis: una sola solución");

// El tramo como respuesta de Overpass, con las vías y etiquetas de OSM tal como se descargaron.
const crudo = leer("data/cesvi/casos/A2010930-tramo.json") as {
  vias: { id_osm: number; tags: Record<string, string>; puntos: [number, number][] }[];
};
let nodo = 0;
const elementos: OverpassResponse["elements"] = [];
for (const v of crudo.vias) {
  const nodos = v.puntos.map(([lon, lat]) => {
    elementos.push({ type: "node", id: ++nodo, lat, lon });
    return nodo;
  });
  elementos.push({ type: "way", id: v.id_osm, nodes: nodos, tags: v.tags });
}
const spec = conCallesDelMapa(especReconstruida(r), r.origen!, { elements: elementos });
const salida = join(RAIZ, "demo/escenas-r11/axa.json");
writeFileSync(salida, `${JSON.stringify(spec, null, 2)}\n`);
for (const v of r.velocidades)
  console.log(v.vehiculo, "previa", v.previa?.mejor, "impacto", JSON.stringify(v.impacto ?? null));
console.log("escrito", salida);
