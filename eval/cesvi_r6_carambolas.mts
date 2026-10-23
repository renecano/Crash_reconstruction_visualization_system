/**
 * E-R6 (docs/cesvi/PLAN-CESVI.md, R6): las carambolas del corpus con el solver de producción.
 *
 * Toma los expedientes del corpus de C0 con 3 o más vehículos (los impactos y las zonas que importó
 * C0 de cada dictamen, sin posiciones en el mapa) y los reconstruye como «Caso nuevo»: escena del
 * expediente, solver TS completo (Monte Carlo e inversión) y la escena para el 3D. Mide cuántas
 * escenas son válidas, cuántas se reconstruyen con todos sus vehículos, cuántas dejan un resultado y
 * una escena 3D válidos (lo que carga el visor), y cuántos de sus impactos posteriores entre
 * vehículos pasan a la escena y ocurren. Sin las posiciones del perito, la disposición de los
 * vehículos es la genérica (supuesto): que un impacto posterior no ocurra se dice, no se fuerza.
 *
 * También graba la lectura de Claude de la narración de una carambola para la e2e de «Caso nuevo»
 * (CI no llama a la API).
 *
 * Uso (desde packages/cesvi):
 *   pnpm exec tsx ../../eval/cesvi_r6_carambolas.mts grabar   lee la narración de la e2e con Claude
 *        (con la llave en el entorno) → data/cesvi/grabaciones/carambola/carambola-e2e.json
 *   pnpm exec tsx ../../eval/cesvi_r6_carambolas.mts medir    → eval/results/cesvi_r6_carambolas.json
 *
 * R4b (ADR 0069): `medir <desarrollo|prueba>` mide una partición con la versión vigente: el
 * expediente pasa por `escenaDeConversion` como en «Caso nuevo» (zonas de contacto de los daños) y
 * los vehículos que solo están en impactos posteriores se colocan en la trayectoria del que los
 * golpea → eval/results/cesvi_r4b_carambolas_<particion>.json, con la v1 de la misma partición al
 * lado (de su detalle). La v1 se queda como está.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESQUEMA_CORPUS, type Expediente, type SalidaCorpus } from "../packages/cesvi/src/corpus";
import {
  escenaDeConversion,
  mensajeEscena,
  SISTEMA_ESCENA,
  VERSION_PROMPT_ESCENA,
} from "../packages/cesvi/src/escena-narracion";
import { especReconstruida, reconstruirExpediente } from "../packages/cesvi/src/reconstruccion";
import { clienteCorpus, leerConPedido, pedidoLectura } from "../packages/cesvi/src/server/corpus";
import { validateEscena, validateResultado } from "../packages/scene-schema/src/index";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = join(RAIZ, "data/cesvi/corpus");
const GRABACION = join(RAIZ, "data/cesvi/grabaciones/carambola/carambola-e2e.json");

/**
 * La narración de la e2e: una carambola escrita como la narra un perito, con la secuencia de
 * impactos (la misma disposición que la escena canónica `carambola`). Sintética: sin placas,
 * nombres ni velocidades.
 */
export const NARRACION_CARAMBOLA = `El hecho se ubica sobre Paseo Tollocan, en sentido poniente a oriente, en la ciudad de Toluca, Estado de México, aproximadamente a las 19:40 horas. La vialidad es de corte recto, con tres carriles de circulación en ese sentido, carpeta asfáltica mojada y semáforo.

Intervienen el vehículo A, marca Nissan, tipo Versa, color gris; el vehículo B, marca Mazda, tipo CX-3, color blanco; y el vehículo C, marca Chevrolet, tipo Aveo, color rojo. Los tres circulaban por el carril central. El vehículo B y el vehículo C se encontraban detenidos por el semáforo en rojo, el vehículo C delante del vehículo B.

El vehículo A presenta en su parte frontal derecha un daño tipo hundimiento de magnitud media, de adelante hacia atrás. El vehículo B presenta en su parte posterior un daño tipo hundimiento de magnitud media, de atrás hacia adelante, y en su parte frontal un daño leve tipo hundimiento, de adelante hacia atrás. El vehículo C presenta en su parte posterior un daño leve tipo hundimiento, de atrás hacia adelante.

Primer impacto: la parte frontal del vehículo A contra la parte posterior del vehículo B. Segundo impacto: por el empuje, la parte frontal del vehículo B contra la parte posterior del vehículo C.`;

async function grabar() {
  mkdirSync(dirname(GRABACION), { recursive: true });
  const l = await leerConPedido<SalidaCorpus>(
    pedidoLectura(
      SISTEMA_ESCENA,
      mensajeEscena(NARRACION_CARAMBOLA),
      ESQUEMA_CORPUS as unknown as Record<string, unknown>,
    ),
    clienteCorpus(),
  );
  writeFileSync(
    GRABACION,
    `${JSON.stringify(
      {
        id: "carambola-e2e",
        modalidad_c0: "carambola",
        version_prompt: VERSION_PROMPT_ESCENA,
        modelo: l.modeloRespuesta,
        uso: l.uso,
        costo_usd: l.costoUsd,
        narracion: NARRACION_CARAMBOLA,
        salida: l.salida,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Grabada: ${l.uso.output_tokens} tokens de salida, ${l.costoUsd.toFixed(4)} USD`);
}

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

const SIN_CONTEOS = {
  filas: 0,
  valores_invalidos: 0,
  citas: 0,
  citas_fuera: 0,
  numeros: 0,
  numeros_fuera: 0,
};

function medir(particion: "desarrollo" | "prueba" | null) {
  const prueba = new Set(
    (JSON.parse(readFileSync(join(CORPUS, "particion.json"), "utf8")) as { prueba: string[] })
      .prueba,
  );
  const filas = readFileSync(join(CORPUS, "expedientes.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { id: string; expediente: Expediente })
    .filter((r) => r.expediente.vehiculos.length >= 3)
    .filter((r) => particion === null || (particion === "prueba") === prueba.has(r.id));
  const detalle = filas.map(({ id, expediente: e0 }) => {
    // v2: como en «Caso nuevo», con las zonas de contacto que dan los daños.
    const e =
      particion === null
        ? e0
        : escenaDeConversion({ expediente: e0, posiciones: [], conteos: SIN_CONTEOS }).expediente;
    const t0 = performance.now();
    const r = reconstruirExpediente(e, id);
    const ms = Math.round(performance.now() - t0);
    const res = r.resultado as {
      vehiculos?: { trayectoria?: { t?: unknown[] } }[];
      eventos?: { id: string; tipo: string; t: number }[];
    };
    const posterioresEnEscena = (r.spec.eventos as { id: string; tipo: string }[])
      .filter((ev) => ev.tipo === "segundo_impacto")
      .map((ev) => ev.id);
    const ocurridos = (res.eventos ?? []).filter((ev) => posterioresEnEscena.includes(ev.id));
    const vs = res.vehiculos ?? [];
    return {
      id,
      particion: prueba.has(id) ? "prueba" : "desarrollo",
      vehiculos: e.vehiculos.length,
      impactos_declarados: (e.impactos ?? []).length,
      posteriores_en_escena: posterioresEnEscena.length,
      posteriores_ocurridos: ocurridos.length,
      escena_valida: validateEscena(r.spec).ok,
      reconstruida:
        vs.length === e.vehiculos.length && vs.every((v) => (v.trayectoria?.t ?? []).length > 1),
      resultado_valido: validateResultado(r.resultado).ok,
      escena_3d_valida: validateEscena(especReconstruida(r)).ok,
      velocidades_fijadas: r.velocidades.filter((v) => v.previa !== null).length,
      limites: r.limites,
      ms,
    };
  });
  const n = (f: (d: (typeof detalle)[number]) => boolean) => detalle.filter(f).length;
  const suma = (f: (d: (typeof detalle)[number]) => number) =>
    detalle.reduce((a, d) => a + f(d), 0);
  const out = {
    fecha: new Date().toISOString(),
    descripcion:
      "E-R6: los expedientes del corpus de C0 con 3 o más vehículos (impactos y zonas importados del dictamen, sin posiciones del perito), reconstruidos con el solver TS de producción como «Caso nuevo». En 3D = resultado y escena para el visor válidos contra el contrato.",
    expedientes: detalle.length,
    por_vehiculos: Object.fromEntries(
      [...new Set(detalle.map((d) => d.vehiculos))]
        .sort((a, b) => a - b)
        .map((k) => [k, n((d) => d.vehiculos === k)]),
    ),
    escenas_validas: n((d) => d.escena_valida),
    reconstruidas: n((d) => d.reconstruida),
    en_3d: n((d) => d.resultado_valido && d.escena_3d_valida),
    con_impactos_posteriores: n((d) => d.posteriores_en_escena > 0),
    impactos_posteriores_en_escena: suma((d) => d.posteriores_en_escena),
    impactos_posteriores_ocurridos: suma((d) => d.posteriores_ocurridos),
    ms_mediana: mediana(detalle.map((d) => d.ms)),
    ms_maximo: Math.max(...detalle.map((d) => d.ms)),
    detalle,
  };
  const v1 =
    particion === null
      ? null
      : (() => {
          const d = (
            JSON.parse(
              readFileSync(join(RAIZ, "eval/results/cesvi_r6_carambolas.json"), "utf8"),
            ) as { detalle: (typeof detalle)[number][] }
          ).detalle.filter((x) => x.particion === particion);
          return {
            expedientes: d.length,
            reconstruidas: d.filter((x) => x.reconstruida).length,
            impactos_posteriores_en_escena: d.reduce((a, x) => a + x.posteriores_en_escena, 0),
            impactos_posteriores_ocurridos: d.reduce((a, x) => a + x.posteriores_ocurridos, 0),
          };
        })();
  writeFileSync(
    join(
      RAIZ,
      particion === null
        ? "eval/results/cesvi_r6_carambolas.json"
        : `eval/results/cesvi_r4b_carambolas_${particion}.json`,
    ),
    `${JSON.stringify(
      particion === null
        ? out
        : {
            ...out,
            descripcion:
              "E-R6 v2 (R4b): los expedientes de C0 con 3 o más vehículos de una partición, por «escenaDeConversion» como en «Caso nuevo»; los vehículos que solo están en impactos posteriores, colocados en la trayectoria del que los golpea (supuesto). Al lado, la v1 de la misma partición.",
            particion,
            v1_misma_particion: v1,
          },
      null,
      1,
    )}\n`,
  );
  console.log(
    `${out.reconstruidas}/${out.expedientes} reconstruidas (${out.escenas_validas} válidas, ${out.en_3d} en 3D); impactos posteriores: ${out.impactos_posteriores_ocurridos} de ${out.impactos_posteriores_en_escena} ocurren; mediana ${out.ms_mediana} ms`,
  );
}

const modo = process.argv[2];
if (modo === "grabar") await grabar();
else if (modo === "medir") {
  const p = process.argv[3];
  // Sin partición sería la v1, que ya está medida (y su código cambió): no se reescribe.
  if (p !== "desarrollo" && p !== "prueba") throw new Error("Uso: medir <desarrollo|prueba>");
  medir(p);
} else console.error("Uso: cesvi_r6_carambolas.mts grabar | medir");
