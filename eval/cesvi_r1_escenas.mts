/**
 * E-R1 (docs/cesvi/PLAN-CESVI.md, R1): de la narración del perito a la escena completa.
 *
 * Toma 10 narraciones de desarrollo de R0 (`data/cesvi/corpus/narraciones.jsonl`), sin fuga y de
 * modalidades distintas según el corpus de C0: la primera de cada modalidad en el orden del SHA-256
 * de `r1:<id>`. La prueba congelada no se toca.
 *
 * Uso (desde packages/cesvi):
 *   pnpm exec tsx ../../eval/cesvi_r1_escenas.mts grabar   lee con Claude y graba las respuestas
 *        (con la llave en el entorno) en data/cesvi/grabaciones/escenas/, para que CI no use la API
 *   pnpm exec tsx ../../eval/cesvi_r1_escenas.mts medir    valida las escenas grabadas
 *        → eval/results/cesvi_r1_escenas.json
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESQUEMA_CORPUS, type SalidaCorpus } from "../packages/cesvi/src/corpus";
import {
  escenaDeNarracion,
  mensajeEscena,
  SISTEMA_ESCENA,
  VERSION_PROMPT_ESCENA,
} from "../packages/cesvi/src/escena-narracion";
import {
  clienteCorpus,
  leerConPedido,
  pedidoLectura,
  type UsoTokens,
} from "../packages/cesvi/src/server/corpus";
import { sha256Hex } from "../packages/extraction/src/index";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = join(RAIZ, "data/cesvi/corpus");
const GRABACIONES = join(RAIZ, "data/cesvi/grabaciones/escenas");
const N = 10;

interface Narracion {
  id: string;
  descripcion: string;
  fugas: string[];
  solo_conclusiones: boolean;
}

export interface Grabacion {
  id: string;
  modalidad_c0: string;
  version_prompt: string;
  modelo: string;
  uso: UsoTokens;
  costo_usd: number;
  narracion: string;
  salida: SalidaCorpus;
}

const jsonl = <T,>(p: string): T[] =>
  readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as T);

/** Las 10 de desarrollo, una por modalidad, en orden fijo. */
function muestra(): { n: Narracion; modalidad: string }[] {
  const prueba = new Set(
    (JSON.parse(readFileSync(join(CORPUS, "particion.json"), "utf8")) as { prueba: string[] })
      .prueba,
  );
  const modalidad = new Map(
    jsonl<{ id: string; expediente: { caso?: { modalidades?: string[] } } }>(
      join(CORPUS, "expedientes.jsonl"),
    ).map((r) => [r.id, r.expediente.caso?.modalidades?.[0] ?? "sin_modalidad"]),
  );
  const candidatas = jsonl<Narracion>(join(CORPUS, "narraciones.jsonl"))
    .filter((n) => !prueba.has(n.id) && !n.fugas.length && !n.solo_conclusiones)
    .sort((a, b) => (sha256Hex(`r1:${a.id}`) < sha256Hex(`r1:${b.id}`) ? -1 : 1));
  const vistas = new Set<string>();
  const out: { n: Narracion; modalidad: string }[] = [];
  for (const n of candidatas) {
    const m = modalidad.get(n.id) ?? "sin_modalidad";
    if (m === "sin_modalidad" || vistas.has(m)) continue;
    vistas.add(m);
    out.push({ n, modalidad: m });
    if (out.length === N) break;
  }
  return out;
}

async function grabar() {
  mkdirSync(GRABACIONES, { recursive: true });
  const c = clienteCorpus();
  let costo = 0;
  for (const { n, modalidad } of muestra()) {
    const ruta = join(GRABACIONES, `${n.id}.json`);
    if (existsSync(ruta)) {
      const g = JSON.parse(readFileSync(ruta, "utf8")) as Grabacion;
      if (g.version_prompt === VERSION_PROMPT_ESCENA) continue;
    }
    const l = await leerConPedido<SalidaCorpus>(
      pedidoLectura(
        SISTEMA_ESCENA,
        mensajeEscena(n.descripcion),
        ESQUEMA_CORPUS as unknown as Record<string, unknown>,
      ),
      c,
    );
    costo += l.costoUsd;
    writeFileSync(
      ruta,
      `${JSON.stringify(
        {
          id: n.id,
          modalidad_c0: modalidad,
          version_prompt: VERSION_PROMPT_ESCENA,
          modelo: l.modeloRespuesta,
          uso: l.uso,
          costo_usd: l.costoUsd,
          narracion: n.descripcion,
          salida: l.salida,
        } satisfies Grabacion,
        null,
        2,
      )}\n`,
    );
    console.log(
      `${n.id} (${modalidad}): ${l.uso.output_tokens} tokens de salida, ${l.costoUsd.toFixed(4)} USD`,
    );
  }
  console.log(`Grabadas: ${costo.toFixed(4)} USD`);
}

function medir() {
  const grabaciones = readdirSync(GRABACIONES)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(GRABACIONES, f), "utf8")) as Grabacion);
  const escenas = grabaciones.map((g) => {
    const e = escenaDeNarracion(g.salida, g.narracion);
    const x = e.expediente;
    return {
      id: g.id,
      modalidad_c0: g.modalidad_c0,
      valida: e.problemas.length === 0,
      problemas: e.problemas,
      vehiculos: x.vehiculos.length,
      vehiculos_con_masa: x.vehiculos.filter((v) => v.masa).length,
      vehiculos_con_clase: x.vehiculos.filter((v) => v.clase).length,
      danos: x.danos?.length ?? 0,
      impactos: x.impactos?.length ?? 0,
      impactos_con_zonas: x.impactos?.filter((i) => i.zonas?.length).length ?? 0,
      objetos_fijos: x.evidencias?.objetos_fijos_danados?.length ?? 0,
      restos: Boolean(x.evidencias?.restos?.longitud),
      huellas: x.evidencias?.huellas?.length ?? 0,
      posiciones_descritas: e.posiciones.length,
      preguntas: e.preguntas.map((p) => p.clave),
      citas_fuera: `${e.conteos.citas_fuera}/${e.conteos.citas}`,
      numeros_fuera: `${e.conteos.numeros_fuera}/${e.conteos.numeros}`,
    };
  });
  const resultado = {
    fecha: new Date().toISOString(),
    descripcion:
      "E-R1: narraciones de desarrollo de R0 (sin fuga, una por modalidad) leídas a escena del contrato 2.0.0 con Claude; respuestas grabadas. Válida = sin errores del esquema ni del validador semántico.",
    version_prompt: VERSION_PROMPT_ESCENA,
    escenas: escenas.length,
    validas: escenas.filter((e) => e.valida).length,
    modalidades: [...new Set(escenas.map((e) => e.modalidad_c0))].sort(),
    costo_usd: Number(grabaciones.reduce((a, g) => a + g.costo_usd, 0).toFixed(4)),
    detalle: escenas,
  };
  writeFileSync(
    join(RAIZ, "eval/results/cesvi_r1_escenas.json"),
    `${JSON.stringify(resultado, null, 2)}\n`,
  );
  console.log(
    `${resultado.validas}/${resultado.escenas} escenas válidas; ${resultado.modalidades.length} modalidades; ${resultado.costo_usd} USD`,
  );
}

const orden = process.argv[2];
if (orden === "grabar") await grabar();
else if (orden === "medir") medir();
else {
  console.error("Uso: cesvi_r1_escenas.mts grabar | medir");
  process.exit(1);
}
