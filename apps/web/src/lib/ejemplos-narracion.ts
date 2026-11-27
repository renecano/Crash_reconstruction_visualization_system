/**
 * Las narraciones de ejemplo de «Usar una narración de ejemplo» (ronda 2, C): cinco, cada una con
 * una línea de lo que muestra. Entre todas cubren lo que Croquis sabe hacer: un crucero de noche, el
 * método de CESVI con la deformación medida, una carambola con lluvia, una reversa con pendiente y
 * tope, y una salida del camino contra un poste.
 *
 * Cada una trae su lectura guardada: la que hizo Claude con el prompt de la app
 * (`eval/ronda2_narraciones.mts`). Si el perito lee un ejemplo tal cual, la app usa esa lectura y no
 * vuelve a llamar a Claude (y lo dice). Si le cambia una coma, se lee de nuevo.
 */
import type { SalidaCorpus } from "@croquis/cesvi";
import DATOS from "../../../../data/cesvi/ejemplos/narraciones.json";
import alcance from "../../../../data/cesvi/grabaciones/ejemplos/alcance-deformacion.json";
import carambola from "../../../../data/cesvi/grabaciones/ejemplos/carambola-lluvia.json";
import poste from "../../../../data/cesvi/grabaciones/ejemplos/poste-terraceria.json";
import reversa from "../../../../data/cesvi/grabaciones/ejemplos/reversa-pendiente.json";
import crucero from "../../../../data/cesvi/grabaciones/ejemplos/crucero-noche.json";
import callesAlcance from "../../../../data/cesvi/ejemplos/calles/alcance-deformacion.json";
import callesCarambola from "../../../../data/cesvi/ejemplos/calles/carambola-lluvia.json";
import callesCrucero from "../../../../data/cesvi/ejemplos/calles/crucero-noche.json";
import callesPoste from "../../../../data/cesvi/ejemplos/calles/poste-terraceria.json";
import callesReversa from "../../../../data/cesvi/ejemplos/calles/reversa-pendiente.json";

export interface EjemploNarracion {
  clave: string;
  /** «Carambola de noche con lluvia». */
  titulo: string;
  /** Qué muestra, en una línea. */
  linea: string;
  narracion: string;
  /** La lectura que hizo Claude de esta narración, tal como la devuelve la API. */
  salida: SalidaCorpus;
  /**
   * Dónde abre el ejemplo (René, 2026-11-25: «los cinco ejemplos tienen que abrir siempre en su lugar,
   * sin preguntar “¿Dónde fue?”»): guardado con el ejemplo, sin depender del buscador. Ilustrativo.
   */
  lugar: { lat: number; lon: number; nombre: string };
}

/**
 * Las calles de cada lugar, guardadas con el ejemplo (René, 2026-11-25: «en la demo con CESVI no
 * puede salir otra cifra porque OpenStreetMap tardó»). © colaboradores de OpenStreetMap (ODbL);
 * `ejemplos-calles.test.ts` las genera.
 */
const CALLES: Record<string, unknown> = {
  "crucero-noche": callesCrucero,
  "alcance-deformacion": callesAlcance,
  "carambola-lluvia": callesCarambola,
  "reversa-pendiente": callesReversa,
  "poste-terraceria": callesPoste,
};

const GRABADAS: Record<string, { narracion: string; salida: unknown }> = {
  "crucero-noche": crucero,
  "alcance-deformacion": alcance,
  "carambola-lluvia": carambola,
  "reversa-pendiente": reversa,
  "poste-terraceria": poste,
};

export const EJEMPLOS: readonly EjemploNarracion[] = DATOS.ejemplos.flatMap((e) => {
  const g = GRABADAS[e.clave];
  return g
    ? [
        {
          clave: e.clave,
          titulo: e.titulo,
          linea: e.linea,
          narracion: g.narracion,
          salida: g.salida as SalidaCorpus,
          lugar: e.lugar,
        },
      ]
    : [];
});

const igual = (a: string, b: string) => a.trim() === b.trim();

/** El ejemplo cuyo texto es exactamente este (sin contar espacios al principio y al final). */
export function ejemploDe(texto: string): EjemploNarracion | null {
  return EJEMPLOS.find((e) => igual(e.narracion, texto)) ?? null;
}

/** La lectura guardada de una narración de ejemplo sin cambios; null si no es un ejemplo. */
export function lecturaGuardada(texto: string): SalidaCorpus | null {
  return ejemploDe(texto)?.salida ?? null;
}

/** Con el lugar del ejemplo, si la narración es un ejemplo sin cambios: el caso abre ahí. */
export function conLugarDelEjemplo<T extends { caso: { lugar?: object | undefined } }>(
  texto: string,
  e: T,
): T {
  const ej = ejemploDe(texto);
  if (!ej) return e;
  return {
    ...e,
    caso: {
      ...e.caso,
      lugar: {
        ...e.caso.lugar,
        coordenadas: { lat: ej.lugar.lat, lon: ej.lugar.lon },
        // Sus calles guardadas: La escena y la reconstrucción no dependen de que responda la red.
        ...(CALLES[ej.clave] ? { calles_del_mapa: CALLES[ej.clave] } : {}),
      },
    },
  };
}
