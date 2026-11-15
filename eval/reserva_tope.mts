/**
 * ¿Cuánto reserva del tope de gasto diario cada lectura con Claude? (auditoría del 2026-11-15, I1).
 *
 * Desde la Tanda 4 el tope es de verdad: antes de llamar se reserva lo más que puede costar la
 * llamada (`costoMaximoUsd`: los bytes de lo que se manda al precio más caro de entrada, más
 * `max_tokens` completo de salida) y al terminar queda cobrado lo que costó. La reserva es una cota,
 * no una estimación del costo: una lectura cuesta bastante menos. Lo que sí decide la reserva es
 * cuándo se niega una lectura: cuando lo gastado en el día más la reserva pasa del tope.
 *
 * Aquí se calcula, sin llamar a la API (no gasta nada):
 * - Importar un reporte (dos lecturas): sobre los reportes crudos de CESVI (`data/raw/cesvi/`, fuera
 *   de git), ya redactados como los manda la ruta. Solo conteos y cifras: ningún texto.
 * - Leer una narración y una declaración: con el texto más largo que acepta cada ruta.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/reserva_tope.mts
 *     → eval/results/reserva_tope.json
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dividirLote } from "../packages/cesvi/src/corpus.ts";
import { mensajeEscena, SISTEMA_ESCENA } from "../packages/cesvi/src/escena-narracion.ts";
import { ESQUEMA_CORPUS } from "../packages/cesvi/src/corpus.ts";
import {
  pedidoCorpus,
  pedidoLectura,
  pedidoNarracion,
} from "../packages/cesvi/src/server/corpus.ts";
import { redact } from "../packages/extraction/src/pii.ts";
import { costoMaximoUsd } from "../packages/extraction/src/server/budget.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CRUDOS = join(RAIZ, "data/raw/cesvi");
const SALIDA = join(RAIZ, "eval/results/reserva_tope.json");

/** El modelo por omisión de producción (`settingsFromEnv`) y los límites de las rutas. */
const MODELO = "claude-sonnet-5-5";
const MAX_REPORTE = 100_000;
const MAX_NARRACION = 12_000;

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const cuantil = (xs: number[], q: number) => {
  const o = [...xs].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor(q * o.length))]!;
};

const reservaDeImportar = (texto: string) => {
  const c = pedidoCorpus(texto, MODELO);
  const n = pedidoNarracion(texto, MODELO);
  return costoMaximoUsd(MODELO, c, c.max_tokens) + costoMaximoUsd(MODELO, n, n.max_tokens);
};

const resultado: Record<string, unknown> = {
  descripcion:
    "Lo que reserva del tope de gasto diario cada lectura con Claude antes de hacerse (auditoría del 2026-11-15, I1). Es una cota del costo, no el costo: al terminar se cobra lo real. Calculado sin llamar a la API.",
  script: "eval/reserva_tope.mts",
  modelo: MODELO,
};

// Una narración y una declaración: la misma petición (`pedidoLectura`), con el texto más largo.
const narracion = "x".repeat(MAX_NARRACION);
const pedidoEscena = pedidoLectura(
  SISTEMA_ESCENA,
  mensajeEscena(narracion),
  ESQUEMA_CORPUS as unknown as Record<string, unknown>,
  MODELO,
);
resultado.narracion = {
  caracteres_maximos: MAX_NARRACION,
  max_tokens: pedidoEscena.max_tokens,
  reserva_usd: r4(costoMaximoUsd(MODELO, pedidoEscena, pedidoEscena.max_tokens)),
};

if (existsSync(CRUDOS)) {
  const textos = readdirSync(CRUDOS)
    .filter((f) => /^crash_reports_batch_\d+\.md$/.test(f))
    .sort()
    .flatMap((f) => dividirLote(readFileSync(join(CRUDOS, f), "utf8")))
    .map((d) => redact(d.texto.trim(), { conservarCifras: true }).text);
  const largos = textos.map((t) => t.length);
  const caben = textos.filter((t) => t.length <= MAX_REPORTE);
  const reservas = caben.map(reservaDeImportar);
  resultado.importar = {
    reportes: textos.length,
    caracteres_maximos_de_la_ruta: MAX_REPORTE,
    caracteres_del_mas_largo: Math.max(...largos),
    reportes_que_no_caben: textos.length - caben.length,
    lecturas_por_reporte: 2,
    reserva_usd: {
      mediana: r4(cuantil(reservas, 0.5)),
      p90: r4(cuantil(reservas, 0.9)),
      maxima: r4(Math.max(...reservas)),
    },
    reserva_usd_con_el_texto_maximo: r4(reservaDeImportar("x".repeat(MAX_REPORTE))),
  };
} else {
  resultado.importar = null;
  resultado.nota = "Sin data/raw/cesvi en esta máquina: solo se calculó la narración.";
}

writeFileSync(SALIDA, JSON.stringify(resultado, null, 2) + "\n", "utf8");
console.log(JSON.stringify(resultado, null, 2));
