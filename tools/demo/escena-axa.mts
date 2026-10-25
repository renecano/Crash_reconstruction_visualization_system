/**
 * La escena de AXA (A2010930) que renderiza el botón de la computadora de la demo (R11).
 *
 * - **El expediente** es el del caso de ejemplo de /cesvi (`apps/web/src/lib/caso-axa.ts`): la
 *   lectura grabada del reporte, con las masas y las medidas C y L de la deformación.
 * - **Las posiciones** son las de la reconstrucción de Croquis (`proponerVersiones`, versión de la
 *   evidencia): A queda a 15.89 m del impacto, donde terminan los restos según el dictamen, en el
 *   sentido de la vía. La de B no la da el dictamen: se usa el supuesto de su método de los restos
 *   (los dos avanzan juntos hasta el final de los restos), así que B queda justo detrás de A.
 * - **La vía** es el tramo de MEX 15D precargado del caso (`A2010930-tramo.json`, de OpenStreetMap):
 *   su rumbo en el punto ilustrativo orienta las posiciones, y sus calles van al 3D como las que el
 *   caso trae de Overpass (`conCallesDelMapa`).
 * - **El solver** de producción (port TS) reconstruye la escena, y `especReconstruida` le pone las
 *   velocidades estimadas, como el 3D del caso.
 *
 *   pnpm --filter @croquis/cesvi exec tsx ../../tools/demo/escena-axa.mts [dano|reposo]
 *
 * Escribe `demo/escenas-r11/axa.json` (EscenaSpec) e imprime la vía y las velocidades.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OverpassResponse } from "../../packages/croquis-2d/src/osm.ts";
import { conCallesDelMapa, RADIO_CALLES_M } from "../../apps/web/src/lib/calles-del-mapa.ts";
import {
  avanzar,
  callesCerca,
  caso,
  especReconstruida,
  conMasasDeFicha,
  importarDictamen,
  proponerVersiones,
  conHipotesis,
  reconstruirExpediente,
  tramoDelCaso,
  ubicacionIlustrativa,
  type Expediente,
  type SalidaCorpus,
  type SalidaNarracion,
} from "../../packages/cesvi/src/index.ts";

const RAIZ = join(import.meta.dirname, "../..");
const leer = (ruta: string) => JSON.parse(readFileSync(join(RAIZ, ruta), "utf8")) as unknown;
const lecturas = leer("data/cesvi/grabaciones/importar/lecturas-a2010930.json") as {
  corpus: SalidaCorpus;
  narracion: SalidaNarracion;
};
const ejemplo = leer("data/cesvi/grabaciones/importar/ejemplo.json") as {
  texto: string;
  archivo: string;
};

const c = caso("A2010930");
const u = ubicacionIlustrativa(c.id)!;
const tramo = tramoDelCaso(c.id);
const via = callesCerca(tramo, [u.lon, u.lat], RADIO_CALLES_M).cercana;
if (!via) throw new Error("El punto ilustrativo no está cerca del tramo del caso.");
console.log(
  `vía: ${via.calle.nombre}, a ${via.distanciaM.toFixed(1)} m, rumbo ${via.rumbo.toFixed(1)}°`,
);
const evidencia = proponerVersiones({
  impacto: [u.lon, u.lat],
  rumboVia: via.rumbo,
  medidas: {
    A: { largo: 5.34, ancho: 1.86 },
    B: { largo: 5.34, ancho: 1.86 },
  },
  distanciaRestos: c.evidencia.restos.distancia_m.valor,
  reversaM: 3,
}).evidencia;
const leido = importarDictamen(ejemplo.texto, lecturas.corpus, lecturas.narracion, ejemplo.archivo);
// El reporte no da la masa de V1: la de la ficha técnica de su modelo y año (data/SOURCES.md).
const conFicha = conMasasDeFicha(leido.expediente);
// A es V1 y B es V2, como en el recorrido (`recorrido-3d.ts`).
const ID = { A: "V1", B: "V2" } as const;
// La posición final de B no la da el dictamen. Se usa el supuesto de su método de los restos (la
// velocidad de 60.27 km/h): después del impacto los dos avanzan juntos hasta el final de los
// restos, así que B queda justo detrás de A, tocándolo.
const finalB = {
  punto: avanzar(evidencia.vehiculos.A.final.punto, via.rumbo, -5.34),
  rumbo: evidencia.vehiculos.A.final.rumbo,
};
const posiciones = (["A", "B"] as const).flatMap((l) =>
  (["impacto", "final"] as const).map((fase) => {
    const p = l === "B" && fase === "final" ? finalB : evidencia.vehiculos[l][fase];
    return {
      vehiculo: ID[l],
      fase,
      punto: { lon: p.punto[0], lat: p.punto[1] },
      rumbo: ((p.rumbo % 360) + 360) % 360,
      // El reposo de B no lo da el reporte: es el supuesto del método de los restos (ADR 0091).
      fuente: l === "B" && fase === "final" ? ("supuesto" as const) : ("perito" as const),
    };
  }),
);
const e: Expediente = {
  ...conFicha,
  caso: {
    ...conFicha.caso,
    lugar: {
      ...conFicha.caso.lugar,
      coordenadas: { lat: u.lat, lon: u.lon },
      descripcion: {
        valor: `Ubicación ilustrativa sobre ${u.via.ref}: el reporte no da coordenadas.`,
        fuente: "supuesto",
      },
    },
  },
  versiones: [{ tipo: "evidencia", posiciones }],
};
// Ese reposo supuesto y la deformación medida no caben juntos: hay dos hipótesis y la del video la
// elige René (`dano` por omisión: «cuadra con el daño medido»; `reposo`: «cuadra con el reposo
// supuesto»).
const clave = process.argv[2] === "reposo" ? "reposo" : "dano";
const r0 = reconstruirExpediente(e, "demo-axa");
const r = r0.hipotesis ? conHipotesis(r0, clave) : r0;
console.log(
  r0.hipotesis
    ? `hipótesis: «${r0.hipotesis[clave].titulo}» (${JSON.stringify(r0.hipotesis[clave].velocidades)})`
    : "sin hipótesis: el reposo supuesto cabe con la deformación",
);

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
