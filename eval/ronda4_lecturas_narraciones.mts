/**
 * Ronda 4 (René, 2026-11-20): qué sacó la lectura de cada una de las 7 narraciones (las seis de
 * `docs/cesvi/ronda-4/narraciones-fisica.md` y la de Tollocan), cada dato con su cita: el tipo de
 * vehículo, el lugar, el sentido («rumbo a…»), la velocidad, el objeto golpeado y las condiciones.
 * De las lecturas grabadas (`data/cesvi/grabaciones/ronda4/`): sin API.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/ronda4_lecturas_narraciones.mts
 *     → eval/results/ronda4_lecturas_narraciones.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SalidaCorpus } from "../packages/cesvi/src/corpus";
import { escenaDeNarracion, preguntaPendiente } from "../packages/cesvi/src/escena-narracion";
import { separarLugarYSentido } from "../packages/cesvi/src/lugar-narrado";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLAVES = ["arbol", "poste", "puente", "subida", "bajada", "curva", "tollocan"];

const filas = CLAVES.map((clave) => {
  const g = JSON.parse(
    readFileSync(join(RAIZ, `data/cesvi/grabaciones/ronda4/ronda4-${clave}.json`), "utf8"),
  ) as { narracion: string; salida: SalidaCorpus };
  const e = escenaDeNarracion(g.salida, g.narracion);
  const x = e.expediente;
  const lugarTexto = x.caso.lugar?.descripcion?.valor ?? null;
  const ls = separarLugarYSentido(lugarTexto);
  const sentidoNarr = ls.sentido ?? separarLugarYSentido(g.narracion).sentido;
  const cond = x.caso.condiciones ?? {};
  return {
    clave,
    vehiculos: x.vehiculos.map((v) => {
      const m = e.menciones?.find((mm) => mm.vehiculo === v.id);
      return {
        id: v.id,
        marca_modelo: [v.marca?.valor, v.modelo?.valor].filter(Boolean).join(" ") || null,
        clase: v.clase ?? null,
        clase_supuesta: Boolean(m?.claseSupuesta),
        clase_cita: m?.texto ?? null,
        clase_porque: m?.nota ?? null,
        velocidad: v.velocidad_narrada
          ? {
              kmh: v.velocidad_narrada.kmh,
              rango_kmh: v.velocidad_narrada.rango_kmh,
              descripcion: v.velocidad_narrada.descripcion,
              cita: v.velocidad_narrada.cita ?? null,
            }
          : null,
      };
    }),
    lugar_narrado: lugarTexto,
    lugar_para_buscar: ls.lugar,
    sentido: sentidoNarr
      ? {
          tipo: sentidoNarr.tipo,
          ...(sentidoNarr.destino ? { destino: sentidoNarr.destino } : {}),
          ...(sentidoNarr.rumbo !== undefined ? { rumbo_deg: sentidoNarr.rumbo } : {}),
          cita: sentidoNarr.cita,
        }
      : null,
    objetos: (x.impactos ?? [])
      .filter((i) => i.objeto_fijo)
      .map((i) => ({ objeto: i.objeto_fijo, cita: i.cita?.texto ?? null })),
    condiciones: Object.fromEntries(
      Object.entries(cond).map(([k, v]) => [
        k,
        {
          valor: (v as { valor: string }).valor,
          cita: (v as { cita?: { texto: string } }).cita?.texto ?? null,
        },
      ]),
    ),
    relieve_real: x.terreno?.relieve?.fuente === "dem",
    // Las que siguen pendientes con lo ya leído (como las filtra la pantalla).
    preguntas_que_quedan: e.preguntas
      .filter((p) =>
        preguntaPendiente(
          p,
          x,
          e.posiciones.filter((q) => q.fase === "final"),
        ),
      )
      .map((p) => p.clave),
  };
});

writeFileSync(
  join(RAIZ, "eval/results/ronda4_lecturas_narraciones.json"),
  JSON.stringify(
    {
      descripcion:
        "Ronda 4: qué sacó la lectura de cada narración, con su cita (de las lecturas grabadas; sin API).",
      fecha: new Date().toISOString(),
      filas,
    },
    null,
    2,
  ) + "\n",
);
for (const f of filas) console.log(JSON.stringify(f));
