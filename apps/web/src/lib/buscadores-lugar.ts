/**
 * La interfaz de los buscadores del lugar del choque (René, 2026-11-27; issue #388: 8 de 10 casos
 * nuevos caían en otro lugar, de 1 a 126 km). El trabajo se reparte: Alberto escribe
 * `buscarKmCarretera` y `buscarReferencia`; la colocación (el orden, la confirmación del perito y
 * `normalizarNombreCalle`) es de René / Claude.
 *
 * Reglas para todos los buscadores:
 * - **Nunca un punto por omisión.** Si no encuentran el lugar, devuelven `{ encontrado: false }` con
 *   su explicación; nunca el centro del municipio, el punto medio de una calle ni «el cruce más
 *   cercano» sin decirlo.
 * - **Todo dato sale de OpenStreetMap** (Nominatim, Overpass) o de la narración; nada inventado. La
 *   red va por `RedLugar`, para probarlos con respuestas grabadas (CI no sale a internet).
 * - **Dicen qué tan seguros están** (`seguridad`) y **cómo lo encontraron** en palabras para el
 *   perito (`explicacion`), que se muestra tal cual: «Croquis encontró: [qué] · [cómo] · [qué tan
 *   seguro]». El perito confirma («Sí, aquí fue» o «Moverlo») antes de La escena.
 * - Si hay varios lugares posibles, van todos en `opciones`, del más al menos probable, y la
 *   explicación dice cómo están ordenados.
 *
 * El orden en que se llaman (cruce → km → referencia → calle) lo decide `buscarLugarNarrado`, en la
 * colocación; cada buscador solo responde por lo suyo y devuelve `encontrado: false` con
 * `aplica: false` si la narración no trae lo que busca (no nombra un kilómetro, no da referencia).
 */

/** Un punto en grados (WGS84). */
export interface PuntoLugar {
  lat: number;
  lon: number;
}

/** Cómo se encontró el lugar. */
export type ComoSeEncontro = "cruce" | "km" | "referencia" | "calle";

/**
 * Qué tan seguro es:
 * - `alta`: un solo lugar posible y lo confirma OSM (el nodo del cruce, el poste del km, la
 *   referencia con nombre exacto en el municipio).
 * - `media`: un lugar posible, pero con algo supuesto (el km interpolado sobre la carretera, el
 *   nombre empató con otra forma escrita).
 * - `baja`: hay varios posibles, o solo se sabe la calle; el perito tiene que elegir o mover.
 */
export type SeguridadLugar = "alta" | "media" | "baja";

/** La zona del caso: el municipio (o alcaldía) y el estado, como los leyó Croquis. */
export interface ZonaCaso {
  municipio?: string;
  estado?: string;
}

export interface LugarEncontrado {
  encontrado: true;
  punto: PuntoLugar;
  como: ComoSeEncontro;
  seguridad: SeguridadLugar;
  /** Para el perito, en una línea: qué se encontró y cómo («El km 23 de la MEX-15D, interpolado
   * entre los postes 22 y 24 de OpenStreetMap»). */
  explicacion: string;
  /** Qué se encontró, corto, para «Croquis encontró: …» («km 23 de la MEX-15D»). */
  que: string;
  /** Otros lugares posibles, del más al menos probable (el primero es `punto`). */
  opciones?: { punto: PuntoLugar; que: string }[];
}

export interface LugarNoEncontrado {
  encontrado: false;
  como: ComoSeEncontro;
  /** false: la narración no trae lo que este buscador busca (no nombra un km, ni una referencia). */
  aplica: boolean;
  /** Para el perito: qué se buscó y por qué no aparece («No encontré el km 23 de la MEX-15D en
   * OpenStreetMap»), o que la red no respondió. */
  explicacion: string;
}

export type ResultadoBuscador = LugarEncontrado | LugarNoEncontrado;

/**
 * La red de los buscadores: lo que piden a OpenStreetMap, inyectable para las pruebas (respuestas
 * grabadas). `fetch` va con el User-Agent de Croquis y respeta una consulta por segundo a Nominatim.
 */
export interface RedLugar {
  fetch: typeof fetch;
  /** Espera entre consultas a Nominatim (ms); en las pruebas, sin espera. */
  pausa?: (ms: number) => Promise<void>;
}

/**
 * El kilómetro de una carretera narrado («a la altura del km 23+500 de la autopista México–Cuernavaca»,
 * «en el kilómetro 120 de la MEX-57»): el punto sobre esa carretera, dentro o cerca del municipio. Si
 * OSM no tiene los postes, interpola sobre la vía y lo dice (`seguridad: "media"`).
 */
export type BuscarKmCarretera = (
  narracion: string,
  zona: ZonaCaso,
  red: RedLugar,
) => Promise<ResultadoBuscador>;

/**
 * Una referencia narrada que no es un cruce («frente a la gasolinera…», «a la altura del puente
 * peatonal», «en la entrada del fraccionamiento X», «junto a la escuela Y»): el lugar con ese nombre o
 * tipo en OSM, dentro del municipio, sobre la calle narrada si la hay.
 */
export type BuscarReferencia = (
  narracion: string,
  zona: ZonaCaso,
  red: RedLugar,
) => Promise<ResultadoBuscador>;

/**
 * Un nombre de calle como lo puede tener OSM: sin su tipo («Av.», «Calle», «Blvd.»), con las
 * abreviaturas y los títulos en sus dos formas («Gral.»/«General»), sin acentos ni mayúsculas, los
 * números en cifra y en letra («5 de Mayo»/«Cinco de Mayo»). No busca nada: devuelve las formas y el
 * patrón con que se busca en Overpass (en `name`, `alt_name`, `old_name`, `official_name`,
 * `short_name`, `ref`).
 */
export type NormalizarNombreCalle = (nombre: string) => {
  /** El nombre sin tipo, en minúsculas y sin acentos («general lazaro cardenas»). */
  base: string;
  /** Las formas que se buscan («lazaro cardenas», «gral lazaro cardenas», …). */
  formas: string[];
  /** El patrón para Overpass (POSIX extendido, sin barras invertidas), o null si no queda nombre. */
  patron: string | null;
};

/** Los buscadores que usa la colocación, para poder probarla con buscadores falsos. */
export interface BuscadoresLugar {
  cruce: (narracion: string, zona: ZonaCaso, red: RedLugar) => Promise<ResultadoBuscador>;
  km: BuscarKmCarretera;
  referencia: BuscarReferencia;
  calle: (narracion: string, zona: ZonaCaso, red: RedLugar) => Promise<ResultadoBuscador>;
}

/** El orden en que la colocación los prueba (René, 2026-11-27). */
export const ORDEN_BUSCADORES: readonly ComoSeEncontro[] = ["cruce", "km", "referencia", "calle"];

/** «Croquis encontró: [qué] · [cómo] · [qué tan seguro]», como se le muestra al perito. */
export function textoEncontrado(r: LugarEncontrado): string {
  const como = {
    cruce: "el cruce de las dos calles en OpenStreetMap",
    km: "el kilómetro sobre la carretera",
    referencia: "la referencia narrada",
    calle: "solo la calle",
  }[r.como];
  const seguro = { alta: "seguro", media: "revisa que sea", baja: "poco seguro: elige o muévelo" }[
    r.seguridad
  ];
  return `Croquis encontró: ${r.que} · ${como} · ${seguro}`;
}

/** El aviso cuando ningún buscador encontró el lugar: nunca un punto por omisión. */
export const NO_ENCONTRADO = "No encontré el lugar narrado: márcalo tú";
