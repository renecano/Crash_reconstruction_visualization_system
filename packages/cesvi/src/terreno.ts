/**
 * El terreno que declara el perito (C3 y O4, W5; PLAN-CESVI §3.4): zonas de otra superficie
 * (terracería, grava, pasto…), zonas onduladas, topes y si se usa el relieve real del lugar. Vive en
 * `expediente.terreno` y va a `lugar.terreno` de la escena (`especDeExpediente`). Aquí está su
 * edición, pura, y su paso a la escena.
 *
 * De dónde sale cada valor por omisión:
 * - **Fricción de una zona:** `friction.json` para su tipo y el estado del lugar, con su rango (el
 *   pasto, de Cenek, Jamieson y McLarin; lo demás, de las filas de la vía). El perito la puede fijar.
 * - **Medidas de un tope:** NOM-034-SCT2/SEDATU-2022, tabla 38. El perito las puede medir.
 * - **Ondulación:** no hay una fuente que la fije. 0.10 m de valle a cresta y crestas cada 6 m son
 *   un **supuesto** hasta que el perito las mide, y la reconstrucción lo dice.
 */
import { zoneFriction } from "@croquis/solver-ts";
import type { Expediente } from "./corpus";
import { desdeMetros, enMetros, type LonLat } from "./geo";

export type TerrenoExpediente = NonNullable<Expediente["terreno"]>;
export type ZonaTerreno = NonNullable<TerrenoExpediente["superficies"]>[number];
export type OndulacionTerreno = NonNullable<TerrenoExpediente["ondulaciones"]>[number];
export type TopeTerreno = NonNullable<TerrenoExpediente["topes"]>[number];
export type TipoSuperficie = ZonaTerreno["tipo"];
type Punto = { lat: number; lon: number };
type Json = Record<string, unknown>;

/** Las superficies de una zona, como las ve el perito. Las tres primeras van a la vista; el resto, en «Otro». */
export const SUPERFICIES_TERRENO: readonly { tipo: TipoSuperficie; nombre: string }[] = [
  { tipo: "terraceria", nombre: "Terracería" },
  { tipo: "grava", nombre: "Grava" },
  { tipo: "pasto", nombre: "Pasto" },
  { tipo: "tierra", nombre: "Tierra" },
  { tipo: "lodo", nombre: "Lodo" },
  { tipo: "empedrado", nombre: "Empedrado" },
  { tipo: "adoquin", nombre: "Adoquín" },
  { tipo: "concreto", nombre: "Concreto" },
  { tipo: "asfalto", nombre: "Asfalto" },
];

export const nombreSuperficie = (t: TipoSuperficie) =>
  SUPERFICIES_TERRENO.find((s) => s.tipo === t)!.nombre;

/**
 * Los reductores de velocidad de la NOM-034-SCT2/SEDATU-2022 (inciso 7.10, tabla 38), con el largo
 * más corto de cada uno. El solver trata a los tres como un arco con ese largo y esa altura.
 */
export const TOPES_NORMA = [
  { id: "circular", nombre: "Tope (circular)", alto_m: 0.1, largo_m: 1.4 },
  { id: "sinusoidal", nombre: "Reductor sinusoidal", alto_m: 0.12, largo_m: 3.4 },
  { id: "trapecial", nombre: "Reductor trapecial", alto_m: 0.1, largo_m: 5.4 },
] as const;
export type TopeNorma = (typeof TOPES_NORMA)[number]["id"];
export const CITA_TOPES = "NOM-034-SCT2/SEDATU-2022, tabla 38";

/** Medidas de una zona nueva (m): a lo largo de la calle y a lo ancho. */
export const ZONA_NUEVA = { largo: 30, ancho: 12 } as const;
/** «Todo el lugar»: un cuadro de este lado (m) centrado donde tocó el perito. */
export const LADO_TODO_M = 400;
/** La ondulación supuesta: de valle a cresta y entre crestas (m). */
export const ONDULACION_SUPUESTA = { amplitud_m: 0.1, longitud_onda_m: 6 } as const;
/** Largo de la línea de un tope nuevo, de orilla a orilla de la vía (m). */
export const ANCHO_TOPE_M = 8;

const normalizar = (r: number) => ((r % 360) + 360) % 360;
const redondear = (x: number, k = 100) => Math.round(x * k) / k;
const coord = (lonLat: readonly [number, number]): Punto => ({
  lat: Math.round(lonLat[1] * 1e7) / 1e7,
  lon: Math.round(lonLat[0] * 1e7) / 1e7,
});

/** Un rectángulo de `largo` (a lo largo de `rumbo`, grados desde el norte) por `ancho`, centrado en `c`. */
function rectangulo(c: Punto, rumbo: number, largo: number, ancho: number): Punto[] {
  const r = (rumbo * Math.PI) / 180;
  const u = [Math.sin(r), Math.cos(r)] as const; // a lo largo (este, norte)
  const v = [Math.cos(r), -Math.sin(r)] as const; // a la derecha
  const origen: LonLat = [c.lon, c.lat];
  return (
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const
  ).map(([a, b]) =>
    coord(
      desdeMetros(
        (a * largo * u[0]) / 2 + (b * ancho * v[0]) / 2,
        (a * largo * u[1]) / 2 + (b * ancho * v[1]) / 2,
        origen,
      ),
    ),
  );
}

const centroDe = (pts: readonly Punto[]): Punto => ({
  lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length,
  lon: pts.reduce((a, p) => a + p.lon, 0) / pts.length,
});

/** Los puntos después de girarlos `grados` (horario) y escalarlos alrededor de su centro, y de llevar el centro a `a`. */
function transformar(pts: readonly Punto[], a: Punto | null, grados = 0, escala = 1): Punto[] {
  const c = centroDe(pts);
  const destino: LonLat = a ? [a.lon, a.lat] : [c.lon, c.lat];
  const g = (grados * Math.PI) / 180;
  return pts.map((p) => {
    const m = enMetros([p.lon, p.lat], [c.lon, c.lat]);
    // Giro horario visto desde arriba (el rumbo crece hacia el este).
    const este = (m.este * Math.cos(g) + m.norte * Math.sin(g)) * escala;
    const norte = (-m.este * Math.sin(g) + m.norte * Math.cos(g)) * escala;
    return coord(desdeMetros(este, norte, destino));
  });
}

const vacio = (t: TerrenoExpediente) =>
  !t.superficies?.length && !t.ondulaciones?.length && !t.topes?.length && !t.relieve;

function conTerreno(e: Expediente, t: TerrenoExpediente): Expediente {
  const limpio: TerrenoExpediente = {
    ...(t.superficies?.length ? { superficies: t.superficies } : {}),
    ...(t.ondulaciones?.length ? { ondulaciones: t.ondulaciones } : {}),
    ...(t.topes?.length ? { topes: t.topes } : {}),
    ...(t.relieve ? { relieve: t.relieve } : {}),
  };
  if (!vacio(limpio)) return { ...e, terreno: limpio };
  const resto = { ...e };
  delete resto.terreno;
  return resto;
}

function idNuevo(e: Expediente, prefijo: string): string {
  const t = e.terreno ?? {};
  const usados = new Set(
    [...(t.superficies ?? []), ...(t.ondulaciones ?? []), ...(t.topes ?? [])].map((x) => x.id),
  );
  for (let k = 1; ; k++) if (!usados.has(`${prefijo}-${k}`)) return `${prefijo}-${k}`;
}

/** Una zona de otra superficie donde tocó el perito, a lo largo de la calle; con `todo`, todo el lugar. */
export function agregarZona(
  e: Expediente,
  tipo: TipoSuperficie,
  centro: Punto,
  rumbo: number,
  todo = false,
): { expediente: Expediente; id: string } {
  const t = e.terreno ?? {};
  const id = idNuevo(e, "zona");
  if ((t.superficies ?? []).length >= 32) return { expediente: e, id };
  const poligono = todo
    ? rectangulo(centro, 0, LADO_TODO_M, LADO_TODO_M)
    : rectangulo(centro, rumbo, ZONA_NUEVA.largo, ZONA_NUEVA.ancho);
  const zona: ZonaTerreno = { id, tipo, poligono, fuente: "perito" };
  return {
    expediente: conTerreno(e, { ...t, superficies: [...(t.superficies ?? []), zona] }),
    id,
  };
}

/** Una zona ondulada donde tocó el perito, con las crestas atravesadas a la calle y las medidas supuestas. */
export function agregarOndulacion(
  e: Expediente,
  centro: Punto,
  rumbo: number,
): { expediente: Expediente; id: string } {
  const t = e.terreno ?? {};
  const id = idNuevo(e, "onda");
  if ((t.ondulaciones ?? []).length >= 16) return { expediente: e, id };
  const onda: OndulacionTerreno = {
    id,
    poligono: rectangulo(centro, rumbo, ZONA_NUEVA.largo, ZONA_NUEVA.ancho),
    ...ONDULACION_SUPUESTA,
    rumbo_deg: redondear(normalizar(rumbo), 10) % 360,
    fuente: "supuesto",
  };
  return {
    expediente: conTerreno(e, { ...t, ondulaciones: [...(t.ondulaciones ?? []), onda] }),
    id,
  };
}

/** Un tope donde tocó el perito, atravesado a la calle, con las medidas de la norma. */
export function agregarTope(
  e: Expediente,
  centro: Punto,
  rumboCalle: number,
  norma: TopeNorma = "circular",
): { expediente: Expediente; id: string } {
  const t = e.terreno ?? {};
  const id = idNuevo(e, "tope");
  if ((t.topes ?? []).length >= 32) return { expediente: e, id };
  const medidas = TOPES_NORMA.find((n) => n.id === norma)!;
  const r = ((rumboCalle + 90) * Math.PI) / 180;
  const origen: LonLat = [centro.lon, centro.lat];
  const extremo = (s: number) =>
    coord(
      desdeMetros(
        (s * ANCHO_TOPE_M * Math.sin(r)) / 2,
        (s * ANCHO_TOPE_M * Math.cos(r)) / 2,
        origen,
      ),
    );
  const tope: TopeTerreno = {
    id,
    linea: [extremo(-1), extremo(1)],
    alto_m: medidas.alto_m,
    largo_m: medidas.largo_m,
    fuente: "supuesto",
  };
  return { expediente: conTerreno(e, { ...t, topes: [...(t.topes ?? []), tope] }), id };
}

/** Aplica `f` a la pieza del terreno con ese id (zona, ondulación o tope). */
function editar(
  e: Expediente,
  id: string,
  f: {
    zona?: (z: ZonaTerreno) => ZonaTerreno | null;
    onda?: (o: OndulacionTerreno) => OndulacionTerreno | null;
    tope?: (t: TopeTerreno) => TopeTerreno | null;
  },
): Expediente {
  const t = e.terreno;
  if (!t) return e;
  const pasar = <T extends { id: string }>(lista: T[] | undefined, g?: (x: T) => T | null) =>
    (lista ?? []).flatMap((x) => {
      if (x.id !== id) return [x];
      const y = g ? g(x) : x;
      return y ? [y] : [];
    });
  return conTerreno(e, {
    ...t,
    superficies: pasar(t.superficies, f.zona),
    ondulaciones: pasar(t.ondulaciones, f.onda),
    topes: pasar(t.topes, f.tope),
  });
}

const linea = (pts: Punto[]): TopeTerreno["linea"] => [pts[0]!, pts[1]!];

/** Lleva el centro de la pieza a `p`. */
export function moverTerreno(e: Expediente, id: string, p: Punto): Expediente {
  return editar(e, id, {
    zona: (z) => ({ ...z, poligono: transformar(z.poligono, p) }),
    onda: (o) => ({ ...o, poligono: transformar(o.poligono, p) }),
    tope: (t) => ({ ...t, linea: linea(transformar(t.linea, p)) }),
  });
}

/** Gira la pieza `grados` (positivo, en el sentido del reloj). La ondulación gira con sus crestas. */
export function girarTerreno(e: Expediente, id: string, grados: number): Expediente {
  return editar(e, id, {
    zona: (z) => ({ ...z, poligono: transformar(z.poligono, null, grados) }),
    onda: (o) => ({
      ...o,
      poligono: transformar(o.poligono, null, grados),
      rumbo_deg: redondear(normalizar(o.rumbo_deg + grados), 10) % 360,
    }),
    tope: (t) => ({ ...t, linea: linea(transformar(t.linea, null, grados)) }),
  });
}

/** Agranda o achica la pieza alrededor de su centro (las zonas, entre 2 m y 1 km de lado). */
export function escalarTerreno(e: Expediente, id: string, factor: number): Expediente {
  const cabe = (pts: readonly Punto[]) => {
    const c = centroDe(pts);
    const radio = Math.max(
      ...pts.map((p) => {
        const m = enMetros([p.lon, p.lat], [c.lon, c.lat]);
        return Math.hypot(m.este, m.norte);
      }),
    );
    return radio * factor >= 1 && radio * factor <= 700;
  };
  return editar(e, id, {
    zona: (z) =>
      cabe(z.poligono) ? { ...z, poligono: transformar(z.poligono, null, 0, factor) } : z,
    onda: (o) =>
      cabe(o.poligono) ? { ...o, poligono: transformar(o.poligono, null, 0, factor) } : o,
    tope: (t) =>
      cabe(t.linea) ? { ...t, linea: linea(transformar(t.linea, null, 0, factor)) } : t,
  });
}

export interface CambiosTerreno {
  /** Coeficiente de fricción de la zona; null vuelve al de la tabla. */
  friccion?: number | null;
  amplitud_m?: number;
  longitud_onda_m?: number;
  alto_m?: number;
  largo_m?: number;
}

/** Las medidas que fija el perito: desde ese momento son suyas, no un supuesto. */
export function cambiarTerreno(e: Expediente, id: string, c: CambiosTerreno): Expediente {
  const entre = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  return editar(e, id, {
    zona: (z) => {
      if (c.friccion === undefined) return z;
      const resto = { ...z };
      delete resto.friccion;
      return c.friccion === null
        ? resto
        : { ...resto, friccion: redondear(entre(c.friccion, 0.05, 1.5)) };
    },
    onda: (o) =>
      c.amplitud_m === undefined && c.longitud_onda_m === undefined
        ? o
        : {
            ...o,
            amplitud_m: redondear(entre(c.amplitud_m ?? o.amplitud_m, 0.01, 2)),
            longitud_onda_m: redondear(entre(c.longitud_onda_m ?? o.longitud_onda_m, 0.2, 200)),
            fuente: "perito",
          },
    tope: (t) =>
      c.alto_m === undefined && c.largo_m === undefined
        ? t
        : {
            ...t,
            alto_m: redondear(entre(c.alto_m ?? t.alto_m, 0.01, 0.5)),
            largo_m: redondear(entre(c.largo_m ?? t.largo_m, 0.2, 20)),
            fuente: "perito",
          },
  });
}

export function quitarTerreno(e: Expediente, id: string): Expediente {
  return editar(e, id, { zona: () => null, onda: () => null, tope: () => null });
}

/** Usar (o dejar de usar) el relieve real del lugar. La malla se pide a `/api/relieve`. */
export function usarRelieve(e: Expediente, usar: boolean): Expediente {
  const t = { ...e.terreno };
  delete t.relieve;
  return conTerreno(e, usar ? { ...t, relieve: { fuente: "dem" } } : t);
}

export const usaRelieve = (e: Expediente) => e.terreno?.relieve?.fuente === "dem";

/** Una pieza del terreno con lo que hace falta para dibujarla y nombrarla. */
export interface PiezaTerreno {
  id: string;
  clase: "zona" | "ondulacion" | "tope";
  nombre: string;
  /** El polígono de la zona o los dos extremos del tope. */
  puntos: Punto[];
  centro: Punto;
  /** Solo las zonas. */
  tipo?: TipoSuperficie;
  friccion?: number;
  amplitud_m?: number;
  longitud_onda_m?: number;
  rumbo_deg?: number;
  alto_m?: number;
  largo_m?: number;
  /** Sus medidas (o su fricción) son un valor por omisión, no del perito. */
  porOmision: boolean;
}

export function piezasTerreno(e: Expediente): PiezaTerreno[] {
  const t = e.terreno ?? {};
  return [
    ...(t.superficies ?? []).map((z): PiezaTerreno => ({
      id: z.id,
      clase: "zona",
      nombre: nombreSuperficie(z.tipo),
      puntos: z.poligono,
      centro: centroDe(z.poligono),
      tipo: z.tipo,
      ...(z.friccion !== undefined ? { friccion: z.friccion } : {}),
      porOmision: z.friccion === undefined,
    })),
    ...(t.ondulaciones ?? []).map((o): PiezaTerreno => ({
      id: o.id,
      clase: "ondulacion",
      nombre: "Zona ondulada",
      puntos: o.poligono,
      centro: centroDe(o.poligono),
      amplitud_m: o.amplitud_m,
      longitud_onda_m: o.longitud_onda_m,
      rumbo_deg: o.rumbo_deg,
      porOmision: o.fuente === "supuesto",
    })),
    ...(t.topes ?? []).map((p): PiezaTerreno => ({
      id: p.id,
      clase: "tope",
      nombre: "Tope",
      puntos: p.linea,
      centro: centroDe(p.linea),
      alto_m: p.alto_m,
      largo_m: p.largo_m,
      porOmision: p.fuente === "supuesto",
    })),
  ];
}

/** La fricción que usa el solver en una zona sin fijar: la de la tabla para su tipo y el estado del lugar. */
export function friccionDeTabla(tipo: TipoSuperficie, estado: string) {
  const mu = zoneFriction(tipo, estado);
  return { valor: mu.nominal, rango: [mu.low, mu.high] as [number, number], fuente: mu.fuente };
}

/**
 * `lugar.terreno` de la escena, en metros desde el punto de impacto (`local`), y lo que el perito
 * debe saber (medidas supuestas). undefined si el expediente no declara terreno.
 */
export function terrenoDeEscena(
  e: Expediente,
  local: (p: Punto) => { x: number; y: number },
  estado: string,
): { terreno: Json; limites: string[] } | undefined {
  const t = e.terreno;
  if (!t || vacio(t)) return undefined;
  const limites: string[] = [];
  const delPerito = { fuente: "usuario", confianza: 0.9 } as const;
  const superficies = (t.superficies ?? []).map((z) => {
    const tabla = friccionDeTabla(z.tipo, estado);
    return {
      id: z.id,
      tipo: z.tipo,
      poligono: z.poligono.map(local),
      friccion:
        z.friccion !== undefined
          ? { valor: z.friccion, ...delPerito }
          : {
              valor: tabla.valor,
              rango: tabla.rango,
              fuente: "default",
              confianza: 0.5,
              nota: `Tabla de fricción (${tabla.fuente}).`,
            },
      procedencia: { ...delPerito },
    };
  });
  const ondulaciones = (t.ondulaciones ?? []).map((o) => {
    const supuesta = o.fuente === "supuesto";
    if (supuesta)
      limites.push(
        `La zona ondulada lleva medidas supuestas (${o.amplitud_m.toFixed(2)} m de valle a cresta, crestas cada ${o.longitud_onda_m.toFixed(1)} m): mídelas en el lugar y corrígelas.`,
      );
    // Del rumbo del mapa (desde el norte, horario) al de la escena (desde +X, antihorario).
    const r = normalizar(90 - o.rumbo_deg);
    return {
      id: o.id,
      poligono: o.poligono.map(local),
      amplitud_m: o.amplitud_m,
      longitud_onda_m: o.longitud_onda_m,
      rumbo_deg: r > 180 ? r - 360 : r,
      procedencia: supuesta
        ? {
            fuente: "supuesto",
            confianza: 0.5,
            nota: "El perito marcó la zona; la altura y la distancia entre crestas son un supuesto.",
          }
        : { ...delPerito },
    };
  });
  const topes = (t.topes ?? []).map((p) => ({
    id: p.id,
    linea: p.linea.map(local),
    alto_m: p.alto_m,
    largo_m: p.largo_m,
    procedencia:
      p.fuente === "supuesto"
        ? {
            ...delPerito,
            nota: `El perito lo colocó; sus medidas son las de la ${CITA_TOPES}, sin medir.`,
          }
        : { ...delPerito, nota: "El perito lo colocó y le dio sus medidas." },
  }));
  if ((t.topes ?? []).some((p) => p.fuente === "supuesto"))
    limites.push(
      `Los topes sin medir llevan las medidas de la ${CITA_TOPES}: si mediste el tope, corrígelas.`,
    );
  return {
    terreno: {
      ...(t.relieve?.fuente === "dem"
        ? {
            relieve: {
              fuente: "dem",
              ...(t.relieve.malla_id ? { malla_id: t.relieve.malla_id } : {}),
              procedencia: { fuente: "mapa", confianza: 0.7 },
            },
          }
        : {}),
      ...(superficies.length ? { superficies } : {}),
      ...(ondulaciones.length ? { ondulaciones } : {}),
      ...(topes.length ? { topes } : {}),
    },
    limites,
  };
}

// --- Lo que la reconstrucción dice del terreno ---------------------------------------------------

export interface CruceDeTope {
  tope: string;
  vehiculo: string;
  /** Segundos desde el impacto (negativo: antes). */
  t: number;
  kmh: number;
}

export interface SupuestoDeTope {
  clave: "perdida_energia_tope" | "perdida_contacto_tope";
  valor: number;
  rango: [number, number];
  /** En palabras para el perito. */
  texto: string;
}

export interface TerrenoReconstruido {
  cruces: CruceDeTope[];
  /** Los dos supuestos del tope, si algún vehículo cruzó uno. */
  supuestos: SupuestoDeTope[];
  /** La escena pidió el relieve real y la malla no llegó: se reconstruyó en plano. */
  relieveFalta: boolean;
}

const TEXTO_SUPUESTO: Record<SupuestoDeTope["clave"], (v: number, r: [number, number]) => string> =
  {
    perdida_energia_tope: (v, r) =>
      `Al cruzar un tope, cada eje pierde la energía de subir su carga la altura del tope, por ${v} (rango ${r[0]} a ${r[1]}). Es un supuesto: no hay una medición que lo fije.`,
    perdida_contacto_tope: (v, r) =>
      `Sobre el tope, las llantas pierden ${v} de la carga que perdería una rueda rígida (rango ${r[0]} a ${r[1]}). Es un supuesto: la suspensión no se modela.`,
  };

/** Los cruces de tope, sus supuestos y si faltó el relieve; null si el terreno no entró en nada. */
export function terrenoReconstruido(
  ids: Record<string, string>,
  resultado: Json,
): TerrenoReconstruido | null {
  const eventos = (resultado.eventos ?? []) as {
    id: string;
    tipo: string;
    t: number;
    actores: string[];
    detalle?: { velocidad_cruce_kmh?: number };
  }[];
  const cruces = eventos
    .filter((ev) => ev.tipo === "cruce_tope")
    .sort((a, b) => a.t - b.t)
    .map((ev) => {
      const sid = ev.actores[0] ?? "";
      return {
        tope: ev.id.slice("tope-".length, ev.id.length - sid.length - 1),
        vehiculo: ids[sid] ?? sid,
        t: ev.t,
        kmh: Number(ev.detalle?.velocidad_cruce_kmh ?? NaN),
      };
    });
  const parametros = (resultado.parametros ?? {}) as Record<
    string,
    { valor: number; rango?: [number, number] } | undefined
  >;
  const supuestos = cruces.length
    ? (["perdida_energia_tope", "perdida_contacto_tope"] as const).flatMap((clave) => {
        const p = parametros[clave];
        if (!p?.rango) return [];
        return [
          { clave, valor: p.valor, rango: p.rango, texto: TEXTO_SUPUESTO[clave](p.valor, p.rango) },
        ];
      })
    : [];
  const relieveFalta = ((resultado.banderas ?? []) as string[]).some((b) =>
    b.startsWith("La escena cita el relieve real"),
  );
  return cruces.length || relieveFalta ? { cruces, supuestos, relieveFalta } : null;
}

export interface PerfilDeElevacion {
  vehiculo: string;
  /** Distancia recorrida (m) y altura (m sobre el punto de impacto) de cada muestra. */
  s: number[];
  z: number[];
  /** La distancia recorrida en el instante del impacto. */
  sImpacto: number;
  cruces: { s: number; kmh: number; tope: string }[];
  /** Pendiente media del camino antes del impacto, en % (positiva: de subida); null si casi no avanzó. */
  pendientePct: number | null;
}

/**
 * El perfil de elevación del camino de cada vehículo: la altura bajo él a lo largo de lo que
 * recorrió. Solo salen los vehículos con altura en su trayectoria (un terreno plano no la lleva).
 */
export function perfilesDeElevacion(
  ids: Record<string, string>,
  resultado: Json,
): PerfilDeElevacion[] {
  const cruces = terrenoReconstruido(ids, resultado)?.cruces ?? [];
  const vehiculos = (resultado.vehiculos ?? []) as {
    id: string;
    trayectoria?: { t: number[]; x: number[]; y: number[]; z?: number[] };
  }[];
  return vehiculos.flatMap((v) => {
    const tr = v.trayectoria;
    if (!tr?.z || tr.z.length < 2) return [];
    const s: number[] = [0];
    for (let i = 1; i < tr.t.length; i++)
      s.push(s[i - 1]! + Math.hypot(tr.x[i]! - tr.x[i - 1]!, tr.y[i]! - tr.y[i - 1]!));
    /** La distancia recorrida en el tiempo `t`, interpolada. */
    const sEn = (t: number) => {
      const k = tr.t.findIndex((x) => x >= t);
      if (k <= 0) return k === 0 ? 0 : s[s.length - 1]!;
      const f = (t - tr.t[k - 1]!) / (tr.t[k]! - tr.t[k - 1]! || 1);
      return s[k - 1]! + (s[k]! - s[k - 1]!) * f;
    };
    const vehiculo = ids[v.id] ?? v.id;
    const sImpacto = sEn(0);
    const kImpacto = Math.max(
      0,
      tr.t.findIndex((x) => x >= 0),
    );
    return [
      {
        vehiculo,
        s: s.map((x) => Math.round(x * 100) / 100),
        z: tr.z.map((x) => Math.round(x * 1000) / 1000),
        sImpacto: Math.round(sImpacto * 100) / 100,
        cruces: cruces
          .filter((c) => c.vehiculo === vehiculo)
          .map((c) => ({ s: Math.round(sEn(c.t) * 100) / 100, kmh: c.kmh, tope: c.tope })),
        pendientePct:
          sImpacto > 5 ? Math.round(((tr.z[kImpacto]! - tr.z[0]!) / sImpacto) * 1000) / 10 : null,
      },
    ];
  });
}
