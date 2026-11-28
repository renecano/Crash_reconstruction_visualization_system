/**
 * El lugar narrado, con los buscadores en orden (René, 2026-11-27; #388): cruce → km → referencia →
 * calle. Cada uno responde por lo suyo con la interfaz de `buscadores-lugar.ts`; el primero que
 * encuentra, gana. Nunca un punto por omisión: si ninguno encuentra, «No encontré el lugar narrado:
 * márcalo tú», con lo que intentó cada uno.
 *
 * - **Cruce** (`buscarLugar` con las dos calles narradas): el nodo que comparten en OSM. Si la
 *   narración nombra un cruce y no aparece, no se propone una de sus calles sola: se prueban el km y
 *   la referencia y, si tampoco, se dice.
 * - **Km** y **referencia** (Alberto, #394 y #395): Nominatim con su política y Esri de respaldo; sus
 *   resultados no se guardan en la caché persistente (los de Esri no se pueden guardar sin licencia).
 * - **Calle** (`buscarLugar` con la descripción del lugar): seguridad baja, el perito la confirma o la
 *   mueve.
 */
import type { LugarConsulta, LugarDeps, ResultadoLugar } from "./lugar";
import { buscarLugar } from "./lugar";
import {
  type ComoSeEncontro,
  type LugarEncontrado,
  NO_ENCONTRADO,
  type RedLugar,
  type ResultadoBuscador,
  type ZonaCaso,
} from "@/lib/buscadores-lugar";
import { buscarKmCarretera } from "@/lib/buscadores/km-carretera";
import { buscarReferencia } from "@/lib/buscadores/referencia";
import { carreteraNarrada, cruceNarrado } from "@/lib/escena-facil";
import { zonaNarrada } from "@/lib/lugar-texto";
import { separarLugarYSentido } from "@croquis/cesvi";

export interface LugarNarradoIn {
  narracion: string;
  /** La descripción del lugar que leyó Croquis («Boulevard Independencia esquina con …»). */
  lugar?: string | null;
  municipio?: string;
  estado?: string;
}

export interface LugarNarradoOut {
  resultado: ResultadoBuscador;
  /** Lo que intentó cada buscador, en orden, para que el perito vea por qué no se encontró. */
  intentos: { como: ComoSeEncontro; aplica: boolean; explicacion: string }[];
}

/** Los buscadores que usa la colocación (inyectables para las pruebas, con buscadores falsos). */
export interface BuscadoresNarrados {
  km: typeof buscarKmCarretera;
  referencia: typeof buscarReferencia;
}

const DE_ALBERTO: BuscadoresNarrados = { km: buscarKmCarretera, referencia: buscarReferencia };

/** Un resultado de `/api/lugar` en la forma de los buscadores. */
function deResultados(
  como: ComoSeEncontro,
  rs: readonly ResultadoLugar[],
  aviso: string | null,
): LugarEncontrado | null {
  const utiles = rs.filter((r) => r.precision !== "zona");
  const primero = utiles[0];
  if (!primero) return null;
  const varios = utiles.length > 1;
  const seguridad: LugarEncontrado["seguridad"] =
    como === "cruce" && !varios && !/no respondi/i.test(aviso ?? "")
      ? "alta"
      : como === "cruce"
        ? "media"
        : "baja";
  return {
    encontrado: true,
    punto: { lat: primero.lat, lon: primero.lon },
    como,
    seguridad,
    que: primero.nombre,
    explicacion: aviso ?? (como === "cruce" ? `El cruce, en OpenStreetMap.` : primero.nombre),
    ...(varios
      ? { opciones: utiles.map((r) => ({ punto: { lat: r.lat, lon: r.lon }, que: r.nombre })) }
      : {}),
  };
}

export async function buscarLugarNarrado(
  i: LugarNarradoIn,
  clientKey: string,
  deps: LugarDeps,
  buscadores: BuscadoresNarrados = DE_ALBERTO,
): Promise<LugarNarradoOut> {
  const zona: ZonaCaso = {
    ...(i.municipio ? { municipio: i.municipio } : {}),
    ...(i.estado ? { estado: i.estado } : {}),
  };
  const consulta = (q: string): LugarConsulta => ({ q, ...zona });
  const intentos: LugarNarradoOut["intentos"] = [];
  const red: RedLugar = { fetch: deps.fetcher, pausa: deps.pausa };

  // 1. El cruce narrado.
  const cruce = cruceNarrado(i.narracion);
  if (cruce) {
    const colonia = zonaNarrada(i.lugar) ?? zonaNarrada(i.narracion);
    const r = await buscarLugar(
      consulta(`${cruce.calles[0]} y ${cruce.calles[1]}${colonia ? `, ${colonia}` : ""}`),
      clientKey,
      deps,
    ).catch(() => null);
    const hallado = r ? deResultados("cruce", r.resultados, r.aviso) : null;
    if (hallado) return { resultado: hallado, intentos };
    intentos.push({
      como: "cruce",
      aplica: true,
      explicacion:
        r?.aviso ?? `No pude buscar el cruce de ${cruce.calles[0]} con ${cruce.calles[1]}.`,
    });
  } else
    intentos.push({
      como: "cruce",
      aplica: false,
      explicacion: "La narración no nombra un cruce.",
    });

  // 2. El kilómetro de una carretera y 3. una referencia (Alberto).
  for (const [como, buscar] of [
    ["km", buscadores.km],
    ["referencia", buscadores.referencia],
  ] as const) {
    const r = await buscar(i.narracion, zona, red).catch((e: unknown): ResultadoBuscador => ({
      encontrado: false,
      como,
      aplica: true,
      explicacion: `No pude buscar: ${String((e as Error)?.message ?? e).slice(0, 120)}`,
    }));
    if (r.encontrado) return { resultado: r, intentos };
    intentos.push({ como, aplica: r.aplica, explicacion: r.explicacion });
  }

  // 4. La calle de la descripción (si la narración no nombra un cruce: con uno, otra calle sola sería
  //    otra esquina).
  const lugar = separarLugarYSentido(i.lugar ?? null).lugar ?? carreteraNarrada(i.narracion);
  if (!cruce && lugar) {
    const r = await buscarLugar(consulta(lugar), clientKey, deps).catch(() => null);
    const hallado = r ? deResultados("calle", r.resultados, r.aviso) : null;
    if (hallado) return { resultado: hallado, intentos };
    intentos.push({
      como: "calle",
      aplica: true,
      explicacion: r?.aviso ?? `No encontré «${lugar}».`,
    });
  } else
    intentos.push({
      como: "calle",
      aplica: false,
      explicacion: cruce
        ? "Con un cruce narrado no se propone una de sus calles sola."
        : "La narración no describe el lugar.",
    });

  const razon = intentos.filter((x) => x.aplica).map((x) => x.explicacion);
  return {
    resultado: {
      encontrado: false,
      como: "calle",
      aplica: true,
      explicacion: `${NO_ENCONTRADO}.${razon.length ? ` ${razon.join(" ")}` : ""}`,
    },
    intentos,
  };
}
