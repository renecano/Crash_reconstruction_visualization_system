/**
 * Ronda 2, C: las narraciones de ejemplo de «Usar un ejemplo», leídas con Claude y grabadas, para que
 * la app, la demo y CI las usen sin volver a llamar a la API.
 *
 * Lee cada ejemplo de `data/cesvi/ejemplos/narraciones.json` que todavía no tenga su lectura con el
 * prompt vigente, con el mismo pedido que la app, y la graba en `data/cesvi/grabaciones/ejemplos/`
 * con el formato de E-R1. El gasto real va al libro de W9 (`eval/results/w9_gasto.json`), y no manda
 * nada si la siguiente lectura pudiera pasar del tope.
 *
 * Uso (desde packages/cesvi; la llave, en el `.env.local` de la raíz):
 *   node --env-file=../../.env.local --import tsx ../../eval/ronda2_narraciones.mts grabar [clave…]
 *   node --import tsx ../../eval/ronda2_narraciones.mts medir
 *     → eval/results/ronda2_narraciones.json (qué leyó de cada una; no gasta)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EJEMPLOS = join(RAIZ, "data/cesvi/ejemplos/narraciones.json");
const GRABACIONES = join(RAIZ, "data/cesvi/grabaciones");
const GASTO_W9 = join(RAIZ, "eval/results/w9_gasto.json");
const SALIDA = join(RAIZ, "eval/results/ronda2_narraciones.json");
/** Lo más que ha costado una lectura de narración grabada (USD): la reserva antes de cada pedido. */
const RESERVA_USD = 0.08;

interface Ejemplo {
  clave: string;
  titulo: string;
  linea: string;
  narracion?: string;
  grabacion?: string;
}
interface Grabacion {
  id: string;
  version_prompt: string;
  modelo: string;
  uso: UsoTokens;
  costo_usd: number;
  narracion: string;
  salida: SalidaCorpus;
}

const ejemplos = (JSON.parse(readFileSync(EJEMPLOS, "utf8")) as { ejemplos: Ejemplo[] }).ejemplos;
const rutaDe = (e: Ejemplo) => join(GRABACIONES, e.grabacion ?? `ejemplos/${e.clave}.json`);

function anotarGasto(que: string, usd: number) {
  const libro = JSON.parse(readFileSync(GASTO_W9, "utf8")) as {
    tope_usd: number;
    movimientos: { fecha: string; que: string; usd: number }[];
    total_usd: number;
  };
  libro.movimientos.push({ fecha: new Date().toISOString(), que, usd });
  libro.total_usd = Math.round(libro.movimientos.reduce((a, m) => a + m.usd, 0) * 1e4) / 1e4;
  writeFileSync(GASTO_W9, `${JSON.stringify(libro, null, 2)}\n`);
  return libro;
}

async function grabar(claves: string[]) {
  mkdirSync(join(GRABACIONES, "ejemplos"), { recursive: true });
  const c = clienteCorpus();
  for (const e of ejemplos) {
    if (!e.narracion || (claves.length && !claves.includes(e.clave))) continue;
    const ruta = rutaDe(e);
    // Sin pedirla por su clave, una lectura ya grabada con el prompt vigente no se repite.
    if (!claves.length && existsSync(ruta)) {
      const g = JSON.parse(readFileSync(ruta, "utf8")) as Grabacion;
      if (g.version_prompt === VERSION_PROMPT_ESCENA && g.narracion === e.narracion) continue;
    }
    const libro = JSON.parse(readFileSync(GASTO_W9, "utf8")) as {
      tope_usd: number;
      total_usd: number;
    };
    if (libro.total_usd + RESERVA_USD > libro.tope_usd) {
      console.log(
        `No se lee ${e.clave}: pasaría del tope de W9 (${libro.total_usd} de ${libro.tope_usd} USD).`,
      );
      return;
    }
    const l = await leerConPedido<SalidaCorpus>(
      pedidoLectura(
        SISTEMA_ESCENA,
        mensajeEscena(e.narracion),
        ESQUEMA_CORPUS as unknown as Record<string, unknown>,
      ),
      c,
    );
    writeFileSync(
      ruta,
      `${JSON.stringify(
        {
          id: `ejemplo-${e.clave}`,
          version_prompt: VERSION_PROMPT_ESCENA,
          modelo: l.modeloRespuesta,
          uso: l.uso,
          costo_usd: l.costoUsd,
          narracion: e.narracion,
          salida: l.salida,
        } satisfies Grabacion,
        null,
        2,
      )}\n`,
    );
    const total = anotarGasto(
      `Ronda 2, C: lectura de la narración de ejemplo «${e.clave}»`,
      l.costoUsd,
    );
    console.log(
      `${e.clave}: ${l.costoUsd.toFixed(4)} USD (W9: ${total.total_usd} de ${total.tope_usd})`,
    );
  }
}

/** Qué leyó Claude de cada ejemplo, con las mismas reglas de la app (cada cita contra el texto). */
function medir() {
  const filas = ejemplos.flatMap((e) => {
    const ruta = rutaDe(e);
    if (!existsSync(ruta)) return [{ clave: e.clave, grabada: false }];
    const g = JSON.parse(readFileSync(ruta, "utf8")) as Grabacion;
    const escena = escenaDeNarracion(g.salida, g.narracion);
    const filas = g.salida.datos;
    const cuantos = (seccion: string) =>
      new Set(filas.filter((d) => d.seccion === seccion).map((d) => d.n)).size;
    const valores = (campo: string) =>
      filas.filter((d) => d.campo === campo).map((d) => String(d.valor));
    return [
      {
        clave: e.clave,
        grabada: true,
        version_prompt: g.version_prompt,
        modelo: g.modelo,
        costo_usd: g.costo_usd,
        filas: filas.length,
        vehiculos: cuantos("vehiculo"),
        impactos: cuantos("impacto"),
        danos: cuantos("dano"),
        danos_con_medidas: valores("medidas").length,
        posiciones_finales: valores("fase").filter((v) => v === "final").length,
        huellas: cuantos("huella"),
        maniobras: valores("maniobra"),
        objetos_fijos: valores("objeto_fijo"),
        preguntas: escena.preguntas.length,
        citas: escena.conteos.citas,
        citas_fuera: escena.conteos.citas_fuera,
        numeros_fuera: escena.numerosFuera?.length ?? 0,
      },
    ];
  });
  writeFileSync(
    SALIDA,
    `${JSON.stringify(
      {
        descripcion:
          "Qué leyó Claude de cada narración de ejemplo (ronda 2, C), armado con las reglas de la app: cada dato con su cita revisada contra el texto.",
        script: "eval/ronda2_narraciones.mts",
        fecha: new Date().toISOString(),
        ejemplos: filas,
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify(filas, null, 1));
}

const [modo, ...resto] = process.argv.slice(2);
if (modo === "grabar") await grabar(resto);
else if (modo === "medir") medir();
else console.error("Uso: grabar [clave…] | medir");
