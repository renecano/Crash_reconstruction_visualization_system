/**
 * Glosario técnico de CESVI (ADR 0055): cuántos de los dictámenes de `data/raw/cesvi/` usan cada
 * término técnico, por categoría (modalidad, zona de contacto, dirección de la fuerza, sentido y
 * carril, maniobras, restos y huellas, posiciones, vía). Lo usa el prompt que lee la descripción
 * técnica del perito.
 *
 * Solo sale la lista de términos con su frecuencia: ni texto de los dictámenes, ni nombres, ni
 * placas. Los términos son una lista cerrada (abajo), elegida revisando los n-gramas más frecuentes
 * del corpus (`--descubrir` los imprime, sin guardarlos); los conteos los mide el script.
 *
 * Uso: `node data/cesvi/scripts/glosario.mjs` → `data/cesvi/glosario.json`
 *      `node data/cesvi/scripts/glosario.mjs --descubrir` → los 300 n-gramas más frecuentes
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CRUDOS = join(RAIZ, "data/raw/cesvi");
const SALIDA = join(RAIZ, "data/cesvi/glosario.json");

/** Sin acentos y en minúsculas, para contar «tallón», «tallon» y «TALLÓN» como lo mismo. */
const plano = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Los términos, por categoría, como se escriben en los dictámenes. Cada uno se busca como frase
 * completa (con sus variantes entre barras: «tallón|tallones»), sin acentos ni mayúsculas.
 */
const TERMINOS = {
  modalidad: [
    "alcance",
    "colisión frontal|choque frontal|impacto frontal",
    "colisión lateral|choque lateral|impacto lateral",
    "crucero",
    "colisión por reversa|impacto por reversa",
    "salida de camino",
    "volcadura",
    "estrellamiento",
    "atropellamiento",
    "colisión contra objeto fijo|impacto contra objeto fijo",
    "cuerpo duro",
    "modalidad de colisión",
    "dinámica de colisión",
  ],
  tipo_de_dano: [
    "hundimiento|hundimientos",
    "tallón|tallónes",
    "ruptura|rupturas",
    "desprendimiento de pintura",
    "impregnación de pintura|impregnaciónes de pintura",
    "intercambio de materiales",
    "deformación|deformaciones",
    "fractura|fracturas",
    "desprendimiento",
    "daño previo|daños previos",
  ],
  zona_de_contacto: [
    "parte frontal|parte delantera",
    "parte posterior|parte trasera",
    "lado derecho|costado derecho",
    "lado izquierdo|costado izquierdo",
    "parte media",
    "parte inferior|partes bajas",
    "parte superior",
    "vértice delantero derecho",
    "vértice delantero izquierdo",
    "vértice posterior derecho|vértice trasero derecho",
    "vértice posterior izquierdo|vértice trasero izquierdo",
    "fascia delantera",
    "fascia trasera|fascia posterior",
    "defensa delantera",
    "defensa trasera|defensa posterior",
    "cofre",
    "parrilla",
    "salpicadera",
    "tapa cajuela",
    "batea",
    "puerta delantera",
    "puerta trasera",
    "unidad de luces|calavera|faro",
  ],
  acentuacion: [
    "acentuación|acentuado|acentuada",
    "mayor magnitud",
    "zona de contacto",
    "área de contacto",
  ],
  direccion_de_la_fuerza: [
    "de adelante hacia atrás",
    "de atrás hacia adelante|de atrás hacia delante",
    "de izquierda a derecha",
    "de derecha a izquierda",
    "de arriba hacia abajo",
    "de abajo hacia arriba",
    "dirección de la fuerza",
  ],
  sentido_y_carril: [
    "sentido de circulación",
    "de norte a sur",
    "de sur a norte",
    "de oriente a poniente",
    "de poniente a oriente",
    "carril izquierdo",
    "carril derecho",
    "carril central",
    "carriles de circulación",
    "dos carriles",
    "tres carriles",
    "acotamiento",
    "arroyo vehicular|arroyo de circulación",
    "camellón",
    "intersección",
    "doble sentido",
  ],
  maniobras: [
    "reversa",
    "frenado|frenada",
    "viraje",
    "vuelta a la izquierda",
    "vuelta a la derecha",
    "cambio de carril",
    "rebase|rebasar",
    "maniobra evasiva|maniobra de evasión",
    "detenido|detenida",
    "alto total",
    "incorporación|incorporarse",
  ],
  restos_y_huellas: [
    "restos",
    "fragmentos",
    "huella de frenado|huellas de frenado",
    "huella de arrastre|huellas de arrastre",
    "derrapamiento|derrape",
    "punto de impacto",
    "zona de impacto|área de impacto",
    "esparcimiento",
    "líquidos|fluidos",
  ],
  posiciones: [
    "posición inicial",
    "posición final|posiciones finales",
    "posición original",
    "posición de impacto",
    "desplazamiento",
    "proyección",
  ],
  via: [
    "carpeta asfáltica",
    "concreto hidráulico",
    "terracería",
    "pavimento",
    "línea continua",
    "línea discontinua",
    "señalamiento",
    "pendiente",
    "curva",
    "tramo recto|en recta",
    "visibilidad",
    "iluminación",
    "superficie seca|pavimento seco",
    "superficie mojada|pavimento mojado",
    "semáforo",
    "tope",
  ],
};

const documentos = readdirSync(CRUDOS)
  .filter((f) => /^crash_reports_batch_\d+\.md$/.test(f))
  .sort()
  .flatMap((f) => readFileSync(join(CRUDOS, f), "utf8").split("# Document:").slice(1))
  .map(plano);

if (process.argv.includes("--descubrir")) {
  const PARADA = new Set(
    "de la el los las y a en que se por con del al un una su sus para como lo o es fue no mas este esta dicho dicha entre sobre sin ser son le les ha han hay e".split(
      " ",
    ),
  );
  const df = new Map();
  for (const d of documentos) {
    const w = d.match(/[a-zn]+/g) ?? [];
    const vistos = new Set();
    for (const n of [2, 3]) {
      for (let i = 0; i + n <= w.length; i++) {
        const g = w.slice(i, i + n);
        if (PARADA.has(g[0]) || PARADA.has(g[n - 1])) continue;
        vistos.add(g.join(" "));
      }
    }
    for (const g of vistos) df.set(g, (df.get(g) ?? 0) + 1);
  }
  for (const [g, c] of [...df].sort((a, b) => b[1] - a[1]).slice(0, 300)) console.log(c, g);
  process.exit(0);
}

const glosario = {};
for (const [categoria, terminos] of Object.entries(TERMINOS)) {
  glosario[categoria] = terminos
    .map((t) => {
      const variantes = t.split("|");
      const re = new RegExp(`\\b(?:${variantes.map(plano).join("|")})\\b`, "g");
      let docs = 0;
      let apariciones = 0;
      for (const d of documentos) {
        const n = d.match(re)?.length ?? 0;
        if (n) docs++;
        apariciones += n;
      }
      return {
        termino: variantes[0],
        variantes: variantes.slice(1),
        documentos: docs,
        apariciones,
      };
    })
    .filter((t) => t.documentos > 0)
    .sort((a, b) => b.documentos - a.documentos);
}

const resultado = {
  _fuente: {
    descripcion:
      "Términos técnicos de los dictámenes de CESVI México y en cuántos dictámenes aparece cada uno. Solo términos y conteos: ningún texto de los dictámenes.",
    corpus: `${documentos.length} dictámenes (data/raw/cesvi/, no se versiona)`,
    generado_por: "node data/cesvi/scripts/glosario.mjs",
    busqueda: "frase completa, sin acentos y sin distinguir mayúsculas",
  },
  dictamenes: documentos.length,
  glosario,
};
writeFileSync(SALIDA, `${JSON.stringify(resultado, null, 2)}\n`);
console.log(
  `${SALIDA}: ${documentos.length} dictámenes, ${Object.values(glosario).flat().length} términos`,
);
