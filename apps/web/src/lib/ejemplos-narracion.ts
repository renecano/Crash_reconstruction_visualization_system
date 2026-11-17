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
import crucero from "../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json";

export interface EjemploNarracion {
  clave: string;
  /** «Carambola de noche con lluvia». */
  titulo: string;
  /** Qué muestra, en una línea. */
  linea: string;
  narracion: string;
  /** La lectura que hizo Claude de esta narración, tal como la devuelve la API. */
  salida: SalidaCorpus;
}

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
