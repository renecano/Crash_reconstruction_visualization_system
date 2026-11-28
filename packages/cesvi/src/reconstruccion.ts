/**
 * R2 (docs/cesvi/PLAN-CESVI.md, ADR 0062): la reconstrucción física desde la evidencia del perito.
 *
 * El expediente (contrato 2.0.0) se pasa a la escena del solver (v1) en dos capas:
 * 1. `buildSpec` de `@croquis/extraction` da una escena válida, con lo que no dice el expediente
 *    marcado como valor por omisión o supuesto (la clase, la disposición genérica).
 * 2. Encima va la evidencia del perito como declarada (fuente «usuario» en la escena v1), que es la
 *    que la inversión usa: las posiciones de impacto y finales que colocó en el mapa (en metros desde
 *    el punto de impacto), las masas, las medidas C y L como daño declarado y las huellas.
 *
 * El solver no cambia (la paridad Python/TS se conserva). Lo que no cubre se declara como límite.
 *
 * Carambolas (R6, ADR 0066): los impactos entre vehículos después del primero pasan a la escena como
 * eventos posteriores (`segundo_impacto`); el solver los resuelve cuando el par se toca.
 */
import { buildSpec, fact, emptyFacts, type Fact } from "@croquis/extraction";
import {
  ANGLE_BOUND_DEG,
  applyValues,
  fullResult,
  isReverse,
  PRIORIDAD,
  PRODUCTION_SAMPLES,
  reconstruct,
  SIGMA_POSITION_M,
  TURN_RADIUS_M,
} from "@croquis/solver-ts";
import { limiteMejorFuera } from "./mejor-fuera";
import { avisoVelocidadRazonable, UMBRAL_PEATON, umbralDeClase } from "./velocidad-razonable";
import { candadoFisico, type NoCuadra } from "./candado";
import { limiteContraNarracion } from "./contra-narracion";
import { avisoReversaRapida, limiteVelocidadSupuesta, velocidadSupuestaEnReversa } from "./reversa";

/**
 * A partir de qué distancia se le dice al perito que el choque del mejor ajuste quedó lejos del punto
 * que da el relato (ADR 0135, decisión 2): el doble de la σ de una posición medida.
 */
export const CHOQUE_LEJOS_DEL_RELATO_M = 2 * SIGMA_POSITION_M;

/**
 * Dónde quedó el choque en el mejor ajuste, si el punto del evento viene del relato (una estimación,
 * no lo que marcó el perito) y quedó a más de `CHOQUE_LEJOS_DEL_RELATO_M`: la distancia en metros.
 * null si el punto no viene del relato, si no hay ajuste o si quedó cerca.
 */
export function choqueLejosDelRelato(spec: Json, inv: Inversion): number | null {
  const ev = ((spec.eventos ?? []) as Json[])
    .filter((e) => String(e.tipo).startsWith("impacto"))
    .sort((a, b) => Number(a.orden) - Number(b.orden))[0];
  const punto = ev?.punto_impacto as { x: number; y: number } | undefined;
  if (!ev || !punto || (ev.procedencia as Json | undefined)?.fuente !== "relato") return null;
  const valores = new Map<string, number>();
  for (const p of inv.parametros) {
    if (!p.identificable || !p.estimacion) continue;
    const k = p.parametro === "velocidad_previa" ? "velocidad" : "rumbo";
    valores.set(`${k}:${p.vehiculo}`, p.estimacion.mejor);
  }
  if (!valores.size) return null;
  const r = reconstruct(applyValues(spec, valores));
  if (!r.puntoImpacto) return null;
  const d = Math.hypot(r.puntoImpacto[0] - punto.x, r.puntoImpacto[1] - punto.y);
  return d > CHOQUE_LEJOS_DEL_RELATO_M ? d : null;
}
import type { Expediente } from "./corpus";
import { rigidezEnKilo } from "./verificacion";
import { avanzar, desdeMetros, enMetros, rectanguloVehiculo, type LonLat } from "./geo";
import { objetosDe, TIPOS_OBJETO } from "./objetos";
import { medidasDe } from "./poses-impacto";
import { arranqueSobreElEje, ejeDeLaCalle, type EjeCalle } from "./eje-calle";
import { cruceDeLaVuelta } from "./vuelta";
import { viasDelNivel } from "./nivel-via";
import { choqueEnLaOrilla, ladoNarrado, TIPOS_DE_ORILLA } from "./orilla";
import {
  conVelocidadDelPerito,
  enCota,
  esVelocidadMedida,
  MEDIO_EN_PALABRAS,
  velocidadPreviaDeclarada,
  type VelocidadNarrada,
} from "./velocidad-narrada";
import type { MallaRelieve } from "./relieve";
import { terrenoDeEscena, terrenoReconstruido, type TerrenoReconstruido } from "./terreno";
import { limiteDeCobertura } from "./cobertura";
import { iluminacionDeHora } from "./iluminacion";
import { distanciaProyeccion, OBJETO_PERSONA, personaDelAtropello } from "./personas";
import { conObjetosNarrados } from "./objetos-narrados";
import { grados, kmhConUnidad, metros, rangoKmh } from "./formato";

type Json = Record<string, unknown>;
type Id = Expediente["vehiculos"][number]["id"];

const LADO: Record<string, string> = {
  frontal: "F",
  posterior: "B",
  lateral_izquierdo: "L",
  lateral_derecho: "R",
  techo: "T",
  inferior: "U",
};
const SEVERIDAD: Record<string, string> = { leve: "leve", moderada: "moderado", severa: "severo" };
const OBJETO: [RegExp, string][] = [
  [/poste/i, "poste"],
  [/[áa]rbol/i, "arbol"],
  [/barda/i, "barda"],
  [/muro|pared|guarnici[oó]n|muret/i, "muro"],
  [/se[ñn]al/i, "senal"],
];
/**
 * Los objetos de un choque intermedio (C1): lo que el perito elige en la escena fácil. Antes que
 * `OBJETO`, que no distingue la guarnición del muro ni conoce la barrera ni el vehículo estacionado.
 */
const OBJETO_INTERMEDIO: [RegExp, string][] = [
  [/guarnici[oó]n|banqueta/i, "guarnicion"],
  [/barrera|contenci[oó]n|defensa/i, "barrera"],
  [/estacionad/i, "vehiculo_estacionado"],
  ...OBJETO,
];
/**
 * El objeto del primer choque (ronda 4, René: «barrera de concreto» quedaba como «otro»). La
 * barrera antes que el muro; «defensa» sola no (casi siempre es la del vehículo) ni «muro de
 * contención» (es un muro).
 */
const OBJETO_PRIMERO: [RegExp, string][] = [
  [/barrera|defensa\s+met[aá]lica/i, "barrera"],
  ...OBJETO,
];
const SUPUESTA = { unidad: "m", fuente: "default", confianza: 0.5 } as const;

/** Si la cita de un derrape lo pone antes del choque o de la salida del camino. */
export function derrapeAntes(cita: string | undefined): boolean {
  return /\b(?:antes|previo|previas?)\b[^.]{0,40}\b(?:impacto|choque|colisi[oó]n|salida|salir|golpe|contacto)/i.test(
    cita ?? "",
  );
}
/**
 * Si la cita de un derrape lo pone después del choque: «Después del contacto, el vehículo B dejó una
 * huella de derrape … que inicia en el área de contacto». Va como evidencia de lo que recorrió después
 * del impacto (René, 2026-11-26: los 18.40 m del Sentra no entraban a la reconstrucción).
 */
export function derrapeDespues(cita: string | undefined): boolean {
  const t = cita ?? "";
  return (
    /\b(?:despu[eé]s|posterior(?:es|mente)?|tras)\b[^.]{0,20}\b(?:del?|al)\s+(?:impacto|choque|colisi[oó]n|golpe|contacto)/i.test(
      t,
    ) ||
    /\b(?:inicia|empieza|comienza|parte)\s+en\s+(?:el|la)\s+(?:[aá]rea|punto|zona)\s+de\s+(?:contacto|impacto)/i.test(
      t,
    )
  );
}

/**
 * Las medidas de un objeto que el perito marca sin medirlo: valores típicos, declarados como
 * supuesto. El muro, la barda, la barrera y la guarnición son un tramo de 6 m.
 */
const MEDIDAS_OBJETO: Record<string, Json> = {
  poste: {
    alto: { valor: 9, ...SUPUESTA },
    diametro_tronco: { valor: 0.3, ...SUPUESTA },
    material: "concreto",
  },
  arbol: { alto: { valor: 6, ...SUPUESTA }, diametro_tronco: { valor: 0.4, ...SUPUESTA } },
  muro: {
    largo: { valor: 6, ...SUPUESTA },
    ancho: { valor: 0.2, ...SUPUESTA },
    alto: { valor: 2.5, ...SUPUESTA },
  },
  barda: {
    largo: { valor: 6, ...SUPUESTA },
    ancho: { valor: 0.2, ...SUPUESTA },
    alto: { valor: 2.2, ...SUPUESTA },
  },
  barrera: {
    largo: { valor: 6, ...SUPUESTA },
    ancho: { valor: 0.4, ...SUPUESTA },
    alto: { valor: 0.8, ...SUPUESTA },
  },
  guarnicion: {
    largo: { valor: 6, ...SUPUESTA },
    ancho: { valor: 0.3, ...SUPUESTA },
    alto: { valor: 0.15, ...SUPUESTA },
  },
  senal: { alto: { valor: 2.5, ...SUPUESTA }, diametro_tronco: { valor: 0.08, ...SUPUESTA } },
  vehiculo_estacionado: {
    clase_vehiculo: { valor: "sedan_compacto", fuente: "default", confianza: 0.5 },
  },
  otro: {
    largo: { valor: 1, ...SUPUESTA },
    ancho: { valor: 1, ...SUPUESTA },
    alto: { valor: 1, ...SUPUESTA },
  },
};
/** Los objetos alargados se ponen atravesados al avance; los demás no tienen rumbo que importe. */
const ATRAVESADOS = new Set(["muro", "barda", "barrera", "guarnicion"]);
/** Lo que el perito coloca va como declarado en la escena v1. */
const DEL_PERITO = { fuente: "usuario", confianza: 0.9 } as const;
/**
 * Qué tan cerca del punto de un choque intermedio pasa el centro del vehículo (m): medio vehículo más
 * medio objeto y una holgura, es decir, que lo toca. Era 2 m fijos (René, 2026-11-28): un Sentra que
 * queda con el frente contra el poste tiene su centro a 2.5 m de él, y el caso no cuadraba.
 */
const HOLGURA_CHOQUE_M = 0.5;
const precisionDelChoque = (v: Expediente["vehiculos"][number]) =>
  Math.round((medidasDe(v).largo / 2 + HOLGURA_CHOQUE_M) * 100) / 100;
/** Sin posición inicial del perito, el vehículo empieza 12 m antes del impacto en su rumbo. */
const ANTES_DEL_IMPACTO_M = 12;
/** m: lo que avanza derecho después de la vuelta, antes del choque, si no hay calles guardadas. */
const DESPUES_DE_LA_VUELTA_M = 2;
/** m: lo más que se alarga ese tramo para llegar al eje de la calle de llegada. */
const RECTO_MAXIMO_M = 30;

/**
 * Los metros en recta entre el fin del arco de la vuelta y el choque para que el arranque quede sobre
 * el eje de la calle de llegada: la distancia, medida hacia la salida, del choque al eje de la calle
 * paralela a la llegada más cercana, menos el radio del arco. Sin una calle así, `DESPUES_DE_LA_VUELTA_M`.
 */
export function rectoTrasLaVuelta(
  vias: readonly (readonly { x: number; y: number }[])[],
  choque: { x: number; y: number },
  llegada: number,
  salida: number,
): number {
  const A = [Math.cos(llegada), Math.sin(llegada)];
  const H = [Math.cos(salida), Math.sin(salida)];
  let mejor: number | null = null;
  for (const via of vias)
    for (let i = 1; i < via.length; i++) {
      const p = via[i - 1]!;
      const q = via[i]!;
      const ux = q.x - p.x;
      const uy = q.y - p.y;
      const l = Math.hypot(ux, uy);
      if (l < 1) continue;
      // Paralela a la llegada (±25°).
      if (Math.abs((ux * A[0]! + uy * A[1]!) / l) < Math.cos((25 * Math.PI) / 180)) continue;
      // Cerca del choque: a menos de 60 m del tramo.
      const t = Math.max(0, Math.min(1, ((choque.x - p.x) * ux + (choque.y - p.y) * uy) / (l * l)));
      const cx = p.x + t * ux;
      const cy = p.y + t * uy;
      if (Math.hypot(choque.x - cx, choque.y - cy) > 60) continue;
      const dH = (choque.x - cx) * H[0]! + (choque.y - cy) * H[1]!;
      if (dH > 0 && (mejor === null || dH < mejor)) mejor = dH;
    }
  if (mejor === null) return DESPUES_DE_LA_VUELTA_M;
  return Math.min(RECTO_MAXIMO_M, Math.max(DESPUES_DE_LA_VUELTA_M, mejor - TURN_RADIUS_M));
}
/** La maniobra de la escena v1 para cada maniobra narrada que cambia la reconstrucción (R4b). */
const MANIOBRA_ESCENA: Record<string, string> = {
  reversa: "reversa",
  se_detiene: "detenido",
  vira_izquierda: "vuelta_izquierda",
  vira_derecha: "vuelta_derecha",
};

/**
 * La zona horizontal CDC (SAE J224) de una zona del diagrama del perito: en el frente y la parte
 * posterior, L, C o R por el tercio o el vértice; en los costados, F, P o B. null si no la dice.
 */
/** Los objetos planos (el solver los trata como superficie): los demás son angostos (tronco, poste). */
const TIPOS_PLANOS = new Set(["muro", "barda", "vehiculo_estacionado", "contenedor", "puesto"]);

/** Lo que se supone de la velocidad de un vehículo, dicho en los límites del cálculo (ronda 4). */
function limiteDeVelocidadNarrada(id: Id, v: VelocidadNarrada): string {
  const [lo, hi] = v.rango_kmh;
  const rango = `${Math.round(lo)} a ${Math.round(hi)} km/h`;
  if (esVelocidadMedida(v))
    return `${id}: su velocidad previa la midió ${MEDIO_EN_PALABRAS[v.medio ?? "camara"]} (${Math.round(v.kmh)} km/h): es una restricción; lo demás se ajusta a ella.`;
  if (v.origen === "perito")
    return `${id}: su velocidad previa es la que dio el perito (${rango}); solo pesa si la evidencia no la fija.`;
  if (v.origen === "via")
    return `${id}: el perito no sabe su velocidad; se supone la típica de la vía (${rango}, alrededor del límite de ${v.limite_kmh} km/h: ${v.limite_fuente}). Solo pesa si la evidencia no la fija.`;
  if (v.cota)
    return `${id}: la narración dice «${v.descripcion}»; entra como cota: ${enCota(v)} (no un valor). Solo pesa si la reconstrucción quedara del otro lado.`;
  return `${id}: la narración dice «${v.descripcion}»; entra como supuesto de ${rango}${v.respecto_al_limite ? ` (respecto al límite de ${v.limite_kmh} km/h: ${v.limite_fuente})` : ""}. Solo pesa si la evidencia no la fija.`;
}

export function zonaHorizontal(z: {
  cara: string;
  tercio?: string;
  vertice?: string;
}): string | null {
  const frenteAtras = z.cara === "frontal" || z.cara === "posterior";
  const costado = z.cara === "lateral_izquierdo" || z.cara === "lateral_derecho";
  if (frenteAtras) {
    const t = { izquierdo: "L", centro: "C", derecho: "R" }[z.tercio ?? ""];
    if (t) return t;
    if (z.vertice?.endsWith("izquierdo")) return "L";
    if (z.vertice?.endsWith("derecho")) return "R";
  }
  if (costado) {
    const t = { delantero: "F", medio: "P", trasero: "B" }[z.tercio ?? ""];
    if (t) return t;
    if (z.vertice?.startsWith("delantero")) return "F";
    if (z.vertice?.startsWith("posterior")) return "B";
  }
  return null;
}

type PosicionPerito = NonNullable<
  NonNullable<Expediente["versiones"]>[number]["posiciones"]
>[number];

/**
 * El choque contra un árbol, un poste o una señal en la orilla de la calle (René, 2026-11-26; ver
 * `orilla.ts`): si con las calles guardadas el objeto caería dentro de la calzada donde el perito
 * colocó el choque, la pose de impacto del vehículo (y su reposo, si lo dejó junto al choque) pasa al
 * borde compatible con la narración. Se dice en los límites. Sin calles guardadas, igual que antes.
 */
function alBordeDeLaCalle(
  e: Expediente,
  posiciones: PosicionPerito[],
  o: {
    golpea: Id | undefined;
    objeto: string | null;
    cara: string;
    antesM: number;
    textos: (string | undefined)[];
  },
  limites: string[],
): PosicionPerito[] {
  const guardadas = e.caso.lugar?.calles_del_mapa;
  const v = o.golpea ? e.vehiculos.find((x) => x.id === o.golpea) : undefined;
  const imp = posiciones.find((p) => p.vehiculo === o.golpea && p.fase === "impacto");
  if (!guardadas || !v || !imp || !o.objeto || !TIPOS_DE_ORILLA.has(o.objeto)) return posiciones;
  const base: LonLat = [imp.punto.lon, imp.punto.lat];
  const enM = (lon: number, lat: number) => {
    const m = enMetros([lon, lat], base);
    return { x: m.este, y: m.norte };
  };
  const giro =
    o.cara === "posterior"
      ? 180
      : o.cara === "lateral_izquierdo"
        ? 90
        : o.cara === "lateral_derecho"
          ? -90
          : 0;
  const m = medidasDe(v);
  const alcance = (giro === 0 || giro === 180 ? m.largo : m.ancho) / 2 + 0.15;
  const r0 = rumboEscena(imp.rumbo);
  const nuevo = choqueEnLaOrilla({
    impacto: { x: 0, y: 0, rumboDeg: r0 },
    alcance,
    giroCara: giro,
    antesM: o.antesM,
    vias: guardadas.vias.map((via) => ({
      tipo: via.tipo,
      ...(via.nombre ? { nombre: via.nombre } : {}),
      ...(Number.isFinite(Number.parseInt(via.carriles ?? "", 10))
        ? { carriles: Number.parseInt(via.carriles!, 10) }
        : {}),
      ...(Number.isFinite(Number.parseFloat(via.ancho ?? ""))
        ? { ancho_m: Number.parseFloat(via.ancho!) }
        : {}),
      puntos: via.puntos.map(([lon, lat]) => enM(lon, lat)),
    })),
    lado: ladoNarrado(o.textos),
  });
  if (!nuevo) return posiciones;
  const [lon, lat] = desdeMetros(nuevo.impacto.x, nuevo.impacto.y, base);
  const rumboNorte = (((90 - nuevo.impacto.rumboDeg) % 360) + 360) % 360;
  const giroRumbo = nuevo.impacto.rumboDeg - r0;
  const tipo = o.objeto === "arbol" ? "árbol" : o.objeto === "senal" ? "señal" : o.objeto;
  limites.push(
    `Donde colocaste el choque, el ${tipo} quedaba ${metros(nuevo.dentroM)} dentro de la calzada de ${nuevo.via ?? "la calle"}: va en la orilla ${nuevo.lado === "derecha" ? "derecha" : "izquierda"} del vehículo y el choque, en ese borde (${metros(Math.hypot(nuevo.impacto.x, nuevo.impacto.y))} de donde lo colocaste; supuesto).`,
  );
  return posiciones.map((p) => {
    if (p.vehiculo !== o.golpea) return p;
    if (p === imp) return { ...p, punto: { lon, lat }, rumbo: rumboNorte };
    // El reposo junto al choque (a menos de 3 m) se va con él.
    const q = enM(p.punto.lon, p.punto.lat);
    if (p.fase !== "final" || Math.hypot(q.x, q.y) > 3) return p;
    const [lf, af] = desdeMetros(q.x + nuevo.impacto.x, q.y + nuevo.impacto.y, base);
    return {
      ...p,
      punto: { lon: lf, lat: af },
      rumbo:
        Math.abs(p.rumbo - imp.rumbo) < 1
          ? rumboNorte
          : (((p.rumbo - giroRumbo) % 360) + 360) % 360,
    };
  });
}

/** Rumbo del contrato 2.0.0 (grados desde el norte, horario) al de la escena v1 (desde +X, antihorario). */
export function rumboEscena(rumboNorte: number): number {
  const r = (((90 - rumboNorte) % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

export interface EscenaSolver {
  spec: Json;
  /** El vehículo del expediente que corresponde a cada vehículo de la escena v1. */
  ids: Record<string, Id>;
  /** Lo que la reconstrucción no cubre o no fija, en palabras para el perito. */
  limites: string[];
  /** El punto de impacto en el mapa (lon, lat): el origen de la escena. null sin posiciones de impacto. */
  origen: LonLat | null;
  /** La velocidad narrada de cada vehículo del expediente, para decir si las posiciones la contradicen. */
  narradas?: Record<string, VelocidadNarrada>;
  /**
   * La posición de impacto que colocó el perito, por vehículo de la escena v1, de los que arrancan
   * antes de ella (supuesto): si su velocidad reconstruida es 0, el 3D lo deja detenido ahí.
   */
  posesDeImpacto?: Record<string, { x: number; y: number; rumbo_deg: number }>;
}

/** La escena del solver a partir del expediente (sin correr el solver). */
export function especDeExpediente(e0: Expediente, specId = "caso-nuevo"): EscenaSolver {
  // La velocidad DECLARADA por el perito (conductor, testigo) nunca entra al solver (René,
  // 2026-11-28): solo se compara con la física. Para el solver es como «No sé»: la típica de la vía.
  // (En el poste, la declarada del Sentra tiraba del ajuste y lo dejaba dentro de un edificio.)
  // Y el objeto que nombra la narración, donde quedó su vehículo si el perito no lo marcó (René,
  // 2026-11-28): así el solver calcula ese golpe y el 3D lo dibuja.
  const { expediente: e, colocados: objetosColocados } = conObjetosNarrados(
    sinDeclaradasDelPerito(e0),
  );
  const limites: string[] = objetosColocados.map((c) => c.texto);
  const impactos = [...(e.impactos ?? [])].sort((a, b) => a.orden - b.orden);
  const primero = impactos.find((i) => i.orden === 1) ?? impactos[0];
  // Los vehículos del primer impacto van primero (A, B…), como los ordena la escena v1.
  const enImpacto = (primero?.vehiculos ?? []).filter((v) => e.vehiculos.some((x) => x.id === v));
  const orden = [
    ...enImpacto,
    ...e.vehiculos.map((v) => v.id).filter((v) => !enImpacto.includes(v)),
  ];
  const vehiculos = orden.map((id) => e.vehiculos.find((v) => v.id === id)!);
  // Las zonas del primer impacto. Si el reporte no las da (la lectura de AXA, por ejemplo), se
  // toman del primer daño de cada vehículo: sin zonas, el solver supone el centro del frente de
  // los dos y en un alcance los pone uno encima del otro (comentario de René, 2026-10-24).
  const zonasDadas = primero?.zonas ?? [];
  const zonasPrimero = [
    ...zonasDadas,
    ...enImpacto.slice(0, 2).flatMap((v) => {
      if (zonasDadas.some((z) => z.vehiculo === v)) return [];
      // Solo la cara: el daño dice dónde se deformó, no en qué punto de la cara fue el contacto.
      const dano = (e.danos ?? []).find((d) => d.vehiculo === v);
      return dano ? [{ vehiculo: v, zona: { cara: dano.zona.cara } }] : [];
    }),
  ];
  const deDanos = zonasPrimero.filter((z) => !zonasDadas.includes(z)).map((z) => z.vehiculo);
  if (deDanos.length)
    limites.push(
      `El reporte no da las zonas del impacto de ${deDanos.join(" y ")}: se toma la cara de su primer daño.`,
    );

  // 1. Base válida con buildSpec, con la maniobra que dice la narración (R4b): quien retrocede va en
  // reversa (avanza con la parte posterior por delante) y quien estaba detenido empieza quieto.
  const maniobraNarrada = new Map<Id, string>();
  // Lo que miden las huellas de antes del choque de cada vehículo (frenado, o derrape que la narración
  // pone antes): el arranque va detrás de ellas, con 5 m de margen (René, 2026-11-24).
  const arranqueAntes = (id: Id): number => {
    const largos = (e.evidencias?.huellas ?? [])
      .filter(
        (h) =>
          h.vehiculo === id &&
          h.longitud &&
          (h.tipo === "frenado" || (h.tipo === "derrape" && derrapeAntes(h.cita?.texto))),
      )
      .map((h) => (h.longitud!.unidad === "cm" ? h.longitud!.valor / 100 : h.longitud!.valor));
    const l = largos.length ? Math.max(...largos) : 0;
    return l + 5 > ANTES_DEL_IMPACTO_M ? Math.ceil(l + 5) : ANTES_DEL_IMPACTO_M;
  };
  const narradas = (e.versiones ?? []).find((v) => v.tipo === "evidencia")?.maniobras ?? [];
  // El sentido de marcha va aparte de la forma de la maniobra (T3.3): quien retrocede dando vuelta
  // conserva las dos cosas.
  const enReversa = new Set<Id>(
    narradas
      .filter((m) => m.tipo === "reversa" || m.sentido_marcha === "reversa")
      .map((m) => m.vehiculo),
  );
  for (const m of narradas) {
    const k = MANIOBRA_ESCENA[m.tipo];
    if (!k || maniobraNarrada.has(m.vehiculo)) continue;
    // De quien retrocede cuenta la forma (recta o vuelta), no que antes estuviera detenido.
    if (enReversa.has(m.vehiculo) && (k === "reversa" || k === "detenido")) continue;
    maniobraNarrada.set(m.vehiculo, k);
  }
  for (const v of enReversa) if (!maniobraNarrada.has(v)) maniobraNarrada.set(v, "reversa");
  const facts = emptyFacts();
  for (const v of vehiculos) {
    const m = new Map<string, Fact>();
    if (v.clase) m.set("clase", fact(v.clase, null, "supuesto"));
    const man = maniobraNarrada.get(v.id);
    if (man) m.set("maniobra", fact(man, null, "supuesto"));
    facts.vehiculos.push(m);
  }
  for (const z of zonasPrimero) {
    const k = orden.indexOf(z.vehiculo);
    const lado = LADO[z.zona.cara];
    if (k >= 0 && lado && ["F", "B", "L", "R"].includes(lado))
      facts.zonas.set(k, fact(lado, null, "supuesto"));
  }
  // Con alguien en reversa, las caras de contacto que la narración no da se suponen (T3.3): sin
  // ellas la escena supone el frente de los dos, que en una reversa va atrás. Quien retrocede toca
  // con su parte posterior, salvo que sus daños estén solo en otra cara; el otro, con la cara de su
  // primer daño.
  const supuestas: string[] = [];
  if (orden.slice(0, 2).some((v) => enReversa.has(v))) {
    orden.slice(0, 2).forEach((v, k) => {
      if (facts.zonas.has(k)) return;
      const caras = (e.danos ?? [])
        .filter((d) => d.vehiculo === v)
        .map((d) => LADO[d.zona.cara])
        .filter((l): l is string => !!l && ["F", "B", "L", "R"].includes(l));
      const lado = enReversa.has(v)
        ? !caras.length || caras.includes("B")
          ? "B"
          : caras[0]!
        : caras[0];
      if (!lado) return;
      facts.zonas.set(k, fact(lado, null, "supuesto"));
      supuestas.push(
        enReversa.has(v) && lado === "B"
          ? `${v} va en reversa: se supone que toca con su parte posterior`
          : `de ${v} se toma la cara de su primer daño`,
      );
    });
  }
  if (supuestas.length)
    limites.push(`La narración no da las caras de contacto: ${supuestas.join("; ")}.`);
  // Un atropello (A3, René, 2026-11-18): la persona que colocó el perito para el impacto contra un
  // peatón o un ciclista. Entra como hecho para que la escena lleve el evento
  // `impacto_vehiculo_persona`; si el perito marcó dónde quedó, también la distancia de proyección.
  // Solo ella: otra persona a pie convertiría un choque entre vehículos en atropello.
  const atropello = personaDelAtropello(e);
  const contraPersona = Boolean(primero?.objeto_fijo && OBJETO_PERSONA.test(primero.objeto_fijo));
  if (atropello) {
    facts.personas.push(new Map([["rol", fact(atropello.rol, null, "usuario")]]));
    const d = distanciaProyeccion(atropello);
    if (d !== null)
      facts.escalares.set("evidencias.distancia_proyeccion_m", fact(d, null, "usuario"));
  } else if (contraPersona) {
    limites.push(
      "El impacto fue contra una persona y no está en la escena: coloca al peatón o al ciclista donde lo golpearon.",
    );
  }
  const objeto =
    primero?.objeto_fijo && !contraPersona
      ? (OBJETO_PRIMERO.find(([rx]) => rx.test(primero.objeto_fijo!))?.[1] ?? "otro")
      : null;
  if (objeto) {
    facts.escalares.set("evento.objeto", fact(objeto, null, "supuesto"));
    facts.escalares.set("evento.tipo", fact("impacto_vehiculo_objeto", null, "supuesto"));
  }
  // Las condiciones del lugar (René, 2026-11-18). Lo que narró el perito entra como dicho
  // («usuario»): la superficie y su estado fijan la fricción; el clima, la vista del 3D.
  const cond = e.caso?.condiciones;
  if (cond?.superficie)
    facts.escalares.set("lugar.superficie", fact(cond.superficie.valor, null, "usuario"));
  if (cond?.estado_superficie)
    facts.escalares.set(
      "lugar.estado_superficie",
      fact(cond.estado_superficie.valor, null, "usuario"),
    );
  else if (cond?.clima && /^lluvia|granizo/.test(cond.clima.valor)) {
    // Si llovía y no dice cómo estaba la carpeta, se supone mojada.
    facts.escalares.set("lugar.estado_superficie", fact("mojado", null, "supuesto"));
    limites.push(
      "La narración dice que llovía y no dice el estado de la carpeta: se supone mojada (fricción de pavimento mojado).",
    );
  }
  if (cond?.clima) facts.escalares.set("entorno.clima", fact(cond.clima.valor, null, "usuario"));
  // La luz, de la hora del relato (`iluminacion.ts`): supuesto. «Noche sin alumbrado» solo si la
  // narración lo dice y la hora es de noche.
  const luz = iluminacionDeHora(e.caso?.fecha_hora?.valor);
  if (luz === "noche_con_alumbrado" && cond?.iluminacion?.valor === "noche_sin_alumbrado")
    facts.escalares.set("entorno.iluminacion", fact("noche_sin_alumbrado", null, "usuario"));
  else if (luz) facts.escalares.set("entorno.iluminacion", fact(luz, null, "supuesto"));
  const spec = buildSpec(facts, "", { specId, origen: "escrito", sintetico: false }) as Json & {
    vehiculos: Json[];
    eventos: Json[];
    danos_declarados: Json[];
    evidencias: Json[];
  };
  const ids: Record<string, Id> = {};
  spec.vehiculos.forEach((sv, k) => (ids[String(sv.id)] = orden[k]!));
  const idEscena = (v: Id) => String(spec.vehiculos[orden.indexOf(v)]?.id);

  // 2. La evidencia del perito. Las poses de impacto que propone Croquis desde el punto que marcó el
  // perito (fantasmas sin aceptar) también cuentan: solo fijan el origen y el arranque, que en la
  // escena ya van como supuesto.
  const evidenciaVersion = (e.versiones ?? []).find((v) => v.tipo === "evidencia");
  const posiciones = alBordeDeLaCalle(
    e,
    evidenciaVersion?.posiciones?.filter((p) => p.fuente === "perito" || p.fuente === "supuesto") ??
      [],
    {
      golpea: enImpacto.length === 1 ? enImpacto[0] : undefined,
      objeto,
      cara: zonasPrimero.find((z) => z.vehiculo === enImpacto[0])?.zona.cara ?? "frontal",
      antesM: enImpacto[0] ? arranqueAntes(enImpacto[0]) : ANTES_DEL_IMPACTO_M,
      textos: [
        primero?.cita?.texto,
        ...(evidenciaVersion?.maniobras ?? []).map((m) => m.cita?.texto),
      ],
    },
    limites,
  );
  const deImpacto = posiciones.filter((p) => p.fase === "impacto");
  // El origen es el primer impacto: el promedio de las posiciones de impacto de sus vehículos (o
  // de todas, si el perito no colocó a ninguno de ellos).
  const delPrimero = deImpacto.filter((p) => enImpacto.includes(p.vehiculo));
  const base = delPrimero.length ? delPrimero : deImpacto;
  const origen: LonLat | null = base.length
    ? [
        base.reduce((a, p) => a + p.punto.lon, 0) / base.length,
        base.reduce((a, p) => a + p.punto.lat, 0) / base.length,
      ]
    : null;
  const local = (p: { lat: number; lon: number }) => {
    const m = enMetros([p.lon, p.lat], origen!);
    return { x: Math.round(m.este * 1000) / 1000, y: Math.round(m.norte * 1000) / 1000 };
  };
  if (!origen && posiciones.length) {
    limites.push(
      "Sin las posiciones de impacto, las posiciones finales no se pueden medir desde el punto de impacto: coloca a los vehículos en el impacto.",
    );
  }
  const detenidos: Id[] = [];
  const posesDeImpacto: Record<string, { x: number; y: number; rumbo_deg: number }> = {};
  for (const v of vehiculos) {
    const sv = spec.vehiculos[orden.indexOf(v.id)]!;
    if (v.masa && v.masa.unidad === "kg") {
      sv.masa = {
        valor: v.masa.valor,
        unidad: "kg",
        ...(v.masa.fuente === "supuesto" ? { fuente: "supuesto", confianza: 0.5 } : DEL_PERITO),
      };
    }
    // La velocidad que dice o describe la narración, la que dio el perito o la típica de la vía
    // (ronda 4): un supuesto declarado con su rango, que solo pesa si la evidencia no la fija.
    if (v.velocidad_narrada && maniobraNarrada.get(v.id) !== "detenido") {
      sv.velocidad_previa = velocidadPreviaDeclarada(v.velocidad_narrada);
      limites.push(limiteDeVelocidadNarrada(v.id, v.velocidad_narrada));
    }
    if (maniobraNarrada.has(v.id) && sv.maniobra) {
      sv.maniobra = {
        ...(sv.maniobra as Json),
        fuente: "usuario",
        confianza: 0.8,
        nota: "Lo dice la narración del perito.",
      };
    }
    if (enReversa.has(v.id)) {
      sv.sentido_marcha = {
        valor: "reversa",
        fuente: "usuario",
        confianza: 0.8,
        nota: "Lo dice la narración del perito.",
      };
      // La velocidad en reversa que no dio el perito no es la de un vehículo que avanza: va la que
      // se mide en maniobras de reversa, como supuesto con su fuente y su rango (ADR 0136).
      const vp = sv.velocidad_previa as Json | undefined;
      if (!vp || !["usuario", "relato"].includes(String(vp.fuente))) {
        sv.velocidad_previa = velocidadSupuestaEnReversa();
        limites.push(limiteVelocidadSupuesta(v.id));
      }
    }
    if (!origen) continue;
    const imp = deImpacto.find((p) => p.vehiculo === v.id);
    if (imp && enImpacto.length && !enImpacto.includes(v.id)) {
      // Solo está en un impacto posterior: empieza detenido donde el perito lo colocó en su
      // impacto, como el que espera en una fila (supuesto, se dice en los límites).
      const { x, y } = local(imp.punto);
      sv.posicion_inicial = {
        x,
        y,
        rumbo_deg: rumboEscena(imp.rumbo),
        procedencia: {
          fuente: "supuesto",
          confianza: 0.5,
          nota: "Detenido en la posición de impacto que colocó el perito (impacto posterior).",
        },
      };
      sv.velocidad_previa = { valor: 0, unidad: "km/h", fuente: "supuesto", confianza: 0.5 };
      detenidos.push(v.id);
    } else if (imp) {
      const { x, y } = local(imp.punto);
      const r = rumboEscena(imp.rumbo);
      const rad = (r * Math.PI) / 180;
      const man = maniobraNarrada.get(v.id);
      const reversa = enReversa.has(v.id);
      // En reversa llega de frente a su rumbo (avanza hacia atrás); detenido, ya está ahí. Con huellas
      // de antes del choque, empieza detrás de ellas (René, 2026-11-24: 18 m de derrape en 12 m).
      const antes = arranqueAntes(v.id);
      const d = man === "detenido" ? 0 : reversa ? -ANTES_DEL_IMPACTO_M : antes;
      if (d !== 0) posesDeImpacto[String(sv.id)] = { x, y, rumbo_deg: r };
      // Quien da vuelta (René, 2026-11-24: el camión que daba vuelta a la derecha y atropellaba al
      // peatón): el rumbo del choque es el de después de la vuelta; empieza en la calle de donde
      // venía, al principio del cuarto de círculo que traza el solver, y el arco termina
      // DESPUES_DE_LA_VUELTA_M antes del choque. Antes empezaba 12 m atrás en el rumbo del choque y
      // la vuelta salía donde no había calle.
      const giro = reversa
        ? 0
        : man === "vuelta_derecha"
          ? -90
          : man === "vuelta_izquierda"
            ? 90
            : 0;
      if (giro !== 0) {
        const llegada = ((r - giro) * Math.PI) / 180;
        // Con las calles guardadas del caso, el tramo recto después del arco es el que deja el
        // arranque sobre el eje de la calle de llegada (revisión de la cadena, 2026-11-24: arrancaba
        // a 10 m de ella en un cruce ancho). Sin calles, los 2 m de siempre.
        // La vuelta, en un cruce real de la red vial (René, 2026-11-27): donde la calle de llegada
        // toca de verdad la calzada del choque. Sin un cruce así, la regla de antes, y se dice.
        const calles = viasDelNivel(e);
        const cruce = calles.length
          ? cruceDeLaVuelta(
              calles.map((via) => ({
                tipo: via.tipo,
                ...(via.nombre ? { nombre: via.nombre } : {}),
                puntos: via.puntos.map(([lon, lat]) => local({ lat, lon })),
              })),
              { x, y },
              llegada,
              rad,
            )
          : null;
        if (calles.length && !cruce)
          limites.push(
            `${v.id}: la narración dice que dio vuelta, pero en las calles del mapa no hay un cruce antes del choque por donde venía: la vuelta se dibuja ahí como supuesto. Revisa dónde colocaste el choque o de dónde venía.`,
          );
        const recto = cruce
          ? Math.min(RECTO_MAXIMO_M, Math.max(0, cruce.distanciaM - TURN_RADIUS_M))
          : rectoTrasLaVuelta(
              calles.map((via) => via.puntos.map(([lon, lat]) => local({ lat, lon }))),
              { x, y },
              llegada,
              rad,
            );
        const tras = TURN_RADIUS_M + recto;
        sv.posicion_inicial = {
          x:
            Math.round((x - TURN_RADIUS_M * Math.cos(llegada) - tras * Math.cos(rad)) * 1000) /
            1000,
          y:
            Math.round((y - TURN_RADIUS_M * Math.sin(llegada) - tras * Math.sin(rad)) * 1000) /
            1000,
          rumbo_deg: Math.round((r - giro) * 1000) / 1000,
          procedencia: {
            fuente: "supuesto",
            confianza: 0.5,
            nota: `En la calle de donde venía, al empezar la vuelta: el arco del solver (radio de ${TURN_RADIUS_M} m) termina ${Math.round(recto * 10) / 10} m antes de la posición de impacto que colocó el perito.`,
          },
        };
      } else
        sv.posicion_inicial = {
          x: Math.round((x - d * Math.cos(rad)) * 1000) / 1000,
          y: Math.round((y - d * Math.sin(rad)) * 1000) / 1000,
          rumbo_deg: r,
          procedencia: {
            fuente: "supuesto",
            confianza: 0.5,
            nota:
              man === "detenido"
                ? "Detenido en la posición de impacto que colocó el perito."
                : reversa
                  ? `${ANTES_DEL_IMPACTO_M} m delante de la posición de impacto que colocó el perito: llega en reversa.`
                  : `${antes} m antes de la posición de impacto que colocó el perito, en su rumbo${antes > ANTES_DEL_IMPACTO_M ? ", detrás de sus huellas" : ""}.`,
          },
        };
    }
    const fin = posiciones.find((p) => p.vehiculo === v.id && p.fase === "final");
    if (fin?.fuente === "supuesto") {
      // Un reposo que el reporte no da y el perito supone: evidencia blanda (ADR 0091).
      sv.posicion_final = {
        ...local(fin.punto),
        rumbo_deg: rumboEscena(fin.rumbo),
        procedencia: {
          fuente: "supuesto",
          confianza: 0.5,
          nota: "Reposo supuesto por el perito: el reporte no lo da.",
        },
      };
      sv.posicion_final_supuesta = true;
    } else if (fin)
      sv.posicion_final = {
        ...local(fin.punto),
        rumbo_deg: rumboEscena(fin.rumbo),
        procedencia: { ...DEL_PERITO },
      };
  }
  // Un puente o un paso a desnivel narrado (ronda 4): la física va sobre la losa, a nivel; el 3D
  // dibuja la estructura.
  const estructura = e.caso.condiciones?.estructura;
  if (estructura)
    (spec.lugar as Json).estructura = {
      valor: estructura.valor,
      fuente: "usuario",
      confianza: 0.8,
      nota: "Lo dice la narración del perito.",
    };
  // La curva de la calle real (ronda 4; René, 2026-11-19): con las calles guardadas con el caso, si
  // la vía del choque curva cerca de él, el solver sigue su eje (`lugar.eje_via`) y cada vehículo
  // arranca sobre la curva, en su carril, no en línea recta. Sin calles, se reconstruye en recta,
  // como siempre, y si la narración dice «curva» se dice que es un supuesto.
  const trazo = e.caso.condiciones?.trazo;
  const guardadas = e.caso.lugar?.calles_del_mapa;
  const primeraPose = deImpacto[0];
  let ejeReal: EjeCalle | null = null;
  if (origen && guardadas && primeraPose) {
    const choque = local(primeraPose.punto);
    ejeReal = ejeDeLaCalle(
      viasDelNivel(e).map((v) => ({
        tipo: v.tipo,
        ...(v.nombre ? { nombre: v.nombre } : {}),
        puntos: v.puntos.map(([lon, lat]) => local({ lat, lon })),
      })),
      choque,
    );
  }
  if (ejeReal) {
    (spec.lugar as Json).eje_via = {
      puntos: ejeReal.puntos,
      ...(ejeReal.nombre ? { nombre: ejeReal.nombre } : {}),
      fuente: "mapa",
      confianza: 0.8,
      nota: `El trazo de ${ejeReal.nombre ?? "la calle"} en las calles guardadas con el caso (gira ${ejeReal.giro_deg}° cerca del choque).`,
    };
    for (const v of vehiculos) {
      const sv = spec.vehiculos[orden.indexOf(v.id)]!;
      const imp = deImpacto.find((p) => p.vehiculo === v.id);
      const ini = sv.posicion_inicial as Json | undefined;
      if (!imp || !ini || maniobraNarrada.get(v.id) === "detenido" || enReversa.has(v.id)) continue;
      if ((ini.procedencia as Json | undefined)?.fuente !== "supuesto") continue;
      const p = local(imp.punto);
      const a = arranqueSobreElEje(
        ejeReal.puntos,
        p,
        (rumboEscena(imp.rumbo) * Math.PI) / 180,
        arranqueAntes(v.id),
      );
      sv.posicion_inicial = {
        x: Math.round(a.x * 1000) / 1000,
        y: Math.round(a.y * 1000) / 1000,
        rumbo_deg: Math.round(((a.rumboRad * 180) / Math.PI) * 1000) / 1000,
        procedencia: {
          fuente: "supuesto",
          confianza: 0.5,
          nota: `${arranqueAntes(v.id)} m antes de la posición de impacto que colocó el perito, sobre el trazo de la calle${arranqueAntes(v.id) > ANTES_DEL_IMPACTO_M ? ", detrás de sus huellas" : ""}.`,
        },
      };
    }
    limites.push(
      `La trayectoria sigue el trazo real de ${ejeReal.nombre ?? "la calle"}, de las calles guardadas con el caso: gira ${ejeReal.giro_deg}° cerca del choque${trazo ? ` (la narración dice «${trazo.cita?.texto ?? "curva"}»)` : ""}.`,
    );
  } else if (trazo) {
    limites.push(
      `La narración dice «${trazo.cita?.texto ?? "curva"}», pero sin las calles del mapa del lugar no se conoce el trazo de la curva: se reconstruye en recta (supuesto).`,
    );
  }
  // El objeto del primer impacto (árbol, poste, muro…) frente a la cara de contacto del vehículo,
  // donde el perito lo colocó en el choque (ronda 4; René, 2026-11-18). Antes iba en la posición
  // genérica de la plantilla (6, −6) y el solver, que toma el objeto como punto de contacto,
  // desviaba al vehículo hacia ella, fuera de donde lo colocó el perito.
  const objetoPrimero = ((spec.entorno as Json | undefined)?.objetos as Json[] | undefined)?.find(
    (o) => o.id === "obj-1",
  );
  const golpea = enImpacto[0];
  const poseGolpe = golpea ? deImpacto.find((p) => p.vehiculo === golpea) : undefined;
  if (objetoPrimero && origen && poseGolpe && objeto) {
    const { x, y } = local(poseGolpe.punto);
    const r = rumboEscena(poseGolpe.rumbo);
    const cara = zonasPrimero.find((z) => z.vehiculo === golpea)?.zona.cara ?? "frontal";
    const giro =
      cara === "posterior"
        ? 180
        : cara === "lateral_izquierdo"
          ? 90
          : cara === "lateral_derecho"
            ? -90
            : 0;
    const m = medidasDe(vehiculos.find((v) => v.id === golpea)!);
    const lateral = giro === 90 || giro === -90;
    // La barrera del primer choque (ronda 4) es plana: va pegada a la cara, como el muro.
    const angosto =
      !TIPOS_PLANOS.has(String(objetoPrimero.tipo)) && objetoPrimero.tipo !== "barrera";
    // Del centro del vehículo a su cara, más medio objeto (un tronco típico de 0.3 m; un muro, 0.1 m).
    const d = (lateral ? m.ancho : m.largo) / 2 + (angosto ? 0.15 : 0.1);
    const rad = ((r + giro) * Math.PI) / 180;
    objetoPrimero.posicion = {
      x: Math.round((x + d * Math.cos(rad)) * 1000) / 1000,
      y: Math.round((y + d * Math.sin(rad)) * 1000) / 1000,
    };
    // La barrera (René, 2026-11-21): sus medidas típicas (6 × 0.4 × 0.8 m, como en La escena) y
    // atravesada frente a la cara del golpe; sin esto, el solver la hacía una caja de 2 × 1.5 × 2 m.
    if (objetoPrimero.tipo === "barrera") {
      Object.assign(objetoPrimero, MEDIDAS_OBJETO.barrera);
      const atravesada = (((r + giro + 90) % 360) + 360) % 360;
      objetoPrimero.rumbo_deg =
        Math.round((atravesada > 180 ? atravesada - 360 : atravesada) * 10) / 10;
    }
    objetoPrimero.procedencia = {
      fuente: "supuesto",
      confianza: 0.5,
      nota: `Frente a la cara ${cara.replace("_", " ")} del vehículo, donde el perito lo colocó en el choque.`,
    };
    limites.push(
      `El ${String(objetoPrimero.tipo).replace("_", " ")} del primer impacto va frente a la cara ${cara.replace("_", " ")} de ${golpea}, donde lo colocaste en el choque; sus medidas son las típicas (supuesto).`,
    );
  }
  // Sin posiciones del perito, la disposición genérica supone que todos avanzan. Quien retrocede
  // y con eso se alejaría del otro se voltea (T3.3): mismo lugar y mismo recorrido, con la parte
  // posterior por delante.
  if (!origen) {
    type Pose = { x: number; y: number; rumbo_deg: number; procedencia?: Json };
    const par = spec.vehiculos.slice(0, 2);
    const objeto0 = ((spec.entorno as Json | undefined)?.objetos as Json[] | undefined)?.[0];
    par.forEach((sv, k) => {
      if (!enReversa.has(orden[k]!)) return;
      const hacia = (par[1 - k]?.posicion_inicial ?? objeto0?.posicion) as
        { x: number; y: number } | undefined;
      if (!hacia) return;
      const pose = sv.posicion_inicial as Pose;
      const rad = (pose.rumbo_deg * Math.PI) / 180;
      // El sentido de marcha es el contrario al frente.
      const seAcerca =
        -(Math.cos(rad) * (hacia.x - pose.x) + Math.sin(rad) * (hacia.y - pose.y)) >= 0;
      if (seAcerca) return;
      const r = pose.rumbo_deg + 180;
      pose.rumbo_deg = r > 180 ? r - 360 : r;
      pose.procedencia = {
        fuente: "supuesto",
        confianza: 0.3,
        nota: "Disposición genérica, llegando en reversa; ajústala en el croquis.",
      };
    });
  }
  const evento = spec.eventos[0]!;
  if (origen) evento.punto_impacto = { x: 0, y: 0 };
  // El atropello: la persona con su id del expediente, donde la golpearon (ahí fue el impacto, si el
  // perito no marcó otro punto) y donde quedó.
  if (atropello && evento.tipo === "impacto_vehiculo_persona") {
    const personas = (spec.personas ?? []) as Json[];
    const sp = personas.find((x) => !x.vehiculo_id);
    if (sp) {
      const antes = String(sp.id);
      sp.id = atropello.id;
      evento.actores = (evento.actores as string[]).map((a) => (a === antes ? atropello.id : a));
      for (const ev of spec.evidencias) if (ev.persona_id === antes) ev.persona_id = atropello.id;
      if (origen) {
        const r = rumboEscena(atropello.rumbo_deg ?? 0);
        sp.posicion_inicial = {
          ...local(atropello.punto),
          rumbo_deg: r > 180 ? r - 360 : r,
          procedencia: { ...DEL_PERITO, nota: "El perito la colocó donde la golpearon." },
        };
        if (atropello.final)
          sp.posicion_final = {
            ...local(atropello.final),
            rumbo_deg: r > 180 ? r - 360 : r,
            procedencia: { ...DEL_PERITO, nota: "El perito marcó dónde quedó." },
          };
        if (!primero?.punto) {
          evento.punto_impacto = local(atropello.punto);
          evento.procedencia = {
            ...DEL_PERITO,
            nota: "El perito colocó a la persona donde la golpearon.",
          };
        }
      }
    }
  }
  if (origen && primero?.punto) {
    // El perito marcó dónde fue el primer golpe (C1): entra a la inversión como evidencia medida.
    evento.punto_impacto = local(primero.punto);
    evento.procedencia = {
      ...DEL_PERITO,
      nota: "El perito marcó en el mapa dónde fue el primer golpe.",
    };
  }

  // Los puntos de paso que marcó el perito (C1): por dónde pasó cada vehículo.
  const pasos = (e.versiones ?? []).find((v) => v.tipo === "evidencia")?.puntos_paso ?? [];
  if (origen) {
    for (const v of vehiculos) {
      const suyos = pasos
        .filter((q) => q.vehiculo === v.id && q.fuente === "perito")
        .sort((a, b) => a.orden - b.orden);
      if (!suyos.length) continue;
      const sv = spec.vehiculos[orden.indexOf(v.id)]!;
      sv.puntos_paso = suyos.map((q, k) => ({
        id: `pp-${String(sv.id)}-${k + 1}`,
        orden: k + 1,
        posicion: local(q.punto),
        ...(q.precision_m !== undefined ? { precision_m: q.precision_m } : {}),
        ...(q.t_s !== undefined ? { t_s: q.t_s } : {}),
        procedencia: { ...DEL_PERITO },
      }));
    }
  } else if (pasos.length) {
    limites.push(
      "Sin las posiciones de impacto, los puntos de paso no se pueden medir desde el punto de impacto: coloca a los vehículos en el impacto.",
    );
  }
  // La zona dentro de la cara que narró el perito (tercio o vértice) va como zona horizontal CDC:
  // con ella el solver centra el daño ahí y el 3D lo deforma en ese lugar.
  for (const z of (evento.zonas_impacto ?? []) as { vehiculo_id: string; cdc: Json }[]) {
    const id = ids[z.vehiculo_id];
    const zona = zonasPrimero.find((x) => x.vehiculo === id)?.zona;
    const h = zona ? zonaHorizontal(zona) : null;
    if (h) z.cdc.zona_horizontal = h;
  }
  if (detenidos.length) {
    limites.push(
      `${detenidos.join(", ")}: solo ${detenidos.length === 1 ? "está" : "están"} en un impacto posterior y ${detenidos.length === 1 ? "empieza detenido" : "empiezan detenidos"} en la posición de impacto que colocó el perito (supuesto).`,
    );
  }

  // Carambola (R6): los impactos entre vehículos después del primero, como eventos posteriores.
  let ordenEvento = Math.max(...spec.eventos.map((ev) => Number(ev.orden ?? 0)));
  for (const imp of impactos) {
    if (imp === primero) continue;
    const par = (imp.vehiculos ?? []).filter((v) => orden.includes(v)).slice(0, 2);
    if (imp.objeto_fijo && imp.punto && origen && par.length === 1) {
      // Choque intermedio contra un objeto (C1): el objeto va donde el perito lo marcó, y el
      // solver hace que el impacto ocurra ahí, cuando el vehículo lo toca.
      const tipo = OBJETO_INTERMEDIO.find(([rx]) => rx.test(imp.objeto_fijo!))?.[1] ?? "otro";
      const colocadoPorCroquis = objetosColocados.some((c) => c.orden === imp.orden);
      const pos = local(imp.punto);
      const objetoId = `obj-choque-${imp.orden}`;
      const entorno = spec.entorno as Json & { objetos?: Json[] };
      // Un muro o una barrera, atravesado al avance desde el primer golpe: su rumbo no se midió.
      const atravesado = ATRAVESADOS.has(tipo)
        ? Math.round(((Math.atan2(pos.y, pos.x) * 180) / Math.PI + 90) * 10) / 10
        : null;
      (entorno.objetos ??= []).push({
        id: objetoId,
        tipo,
        posicion: pos,
        ...(atravesado !== null
          ? { rumbo_deg: atravesado > 180 ? atravesado - 360 : atravesado }
          : {}),
        ...MEDIDAS_OBJETO[tipo],
        procedencia: {
          ...DEL_PERITO,
          nota: colocadoPorCroquis
            ? "Croquis lo puso donde quedó el vehículo (la narración no dice dónde está); sus medidas son las típicas (supuesto)."
            : "El perito lo marcó en el mapa; sus medidas son las típicas (supuesto).",
        },
      });
      ordenEvento += 1;
      spec.eventos.push({
        id: `ev-impacto-${imp.orden}`,
        orden: ordenEvento,
        tipo: "impacto_vehiculo_objeto",
        actores: [idEscena(par[0]!), objetoId],
        punto_impacto: pos,
        procedencia: { ...DEL_PERITO },
      });
      // Para que la inversión lleve al vehículo hasta ahí: su centro pasa a menos de medio vehículo
      // del punto del golpe.
      const sv = spec.vehiculos[orden.indexOf(par[0]!)]!;
      const previos = (sv.puntos_paso ?? []) as Json[];
      sv.puntos_paso = [
        ...previos,
        {
          id: `pp-choque-${imp.orden}`,
          orden: previos.length + 1,
          posicion: pos,
          precision_m: precisionDelChoque(vehiculos[orden.indexOf(par[0]!)]!),
          nota: colocadoPorCroquis
            ? "Lugar del choque intermedio donde quedó el vehículo (supuesto de Croquis)."
            : "Lugar del choque intermedio que marcó el perito.",
          procedencia: { ...DEL_PERITO },
        },
      ];
      limites.push(
        `El objeto del impacto ${imp.orden} (${imp.objeto_fijo}) va con medidas típicas${atravesado !== null ? " y atravesado al avance del vehículo" : ""}: ${colocadoPorCroquis ? "dónde está es un supuesto de Croquis" : "el perito marcó dónde está"}, no cómo es (supuesto).`,
      );
      continue;
    }
    if (imp.objeto_fijo || par.length < 2) {
      limites.push(
        `El impacto ${imp.orden} no es entre dos vehículos${imp.objeto_fijo ? ` (${imp.objeto_fijo})` : ""}: la reconstrucción no lo calcula.`,
      );
      continue;
    }
    const zonas = par.flatMap((v) => {
      const zona = imp.zonas?.find((x) => x.vehiculo === v)?.zona;
      const lado = zona ? LADO[zona.cara] : undefined;
      if (!zona || !lado || !["F", "B", "L", "R"].includes(lado)) return [];
      const h = zonaHorizontal(zona);
      return [{ vehiculo_id: idEscena(v), cdc: h ? { lado, zona_horizontal: h } : { lado } }];
    });
    ordenEvento += 1;
    spec.eventos.push({
      id: `ev-impacto-${imp.orden}`,
      orden: ordenEvento,
      tipo: "segundo_impacto",
      actores: par.map(idEscena),
      ...(zonas.length ? { zonas_impacto: zonas } : {}),
      procedencia:
        imp.fuente === "perito" ? { ...DEL_PERITO } : { fuente: "supuesto", confianza: 0.5 },
    });
  }

  // Los objetos del lugar que colocó el perito (C2, W4): están en la escena aunque nadie choque
  // contra ellos. Sus medidas son las del perito o, si no las cambió, las típicas (supuesto).
  if (origen) {
    for (const o of objetosDe(e)) {
      const entorno = spec.entorno as Json & { objetos?: Json[] };
      const medida = (valor: number) =>
        o.medido
          ? { valor, unidad: "m", fuente: "usuario", confianza: 0.9 }
          : { valor, ...SUPUESTA };
      const r = rumboEscena(o.rumbo);
      const tipicas = MEDIDAS_OBJETO[o.tipo] ?? {};
      const forma = TIPOS_OBJETO.find((t) => t.tipo === o.tipo)!.alargado
        ? { largo: medida(o.largo), ancho: medida(o.ancho) }
        : { diametro_tronco: medida(o.ancho) };
      (entorno.objetos ??= []).push({
        ...tipicas,
        id: o.id,
        tipo: o.tipo,
        posicion: local(o.punto),
        rumbo_deg: r > 180 ? r - 360 : r,
        ...forma,
        procedencia: {
          ...DEL_PERITO,
          nota: o.medido
            ? "El perito lo colocó en el mapa y le dio sus medidas."
            : "El perito lo colocó en el mapa; sus medidas son las típicas (supuesto).",
        },
      });
    }
  }

  // Las demás personas a pie o en bicicleta que colocó el perito (A3): están en la escena (el 3D las
  // dibuja) aunque nadie las golpee; no cambian el cálculo.
  if (origen) {
    const personas = ((spec as Json).personas ??= []) as Json[];
    for (const p of e.personas ?? []) {
      if (p.id === atropello?.id && evento.tipo === "impacto_vehiculo_persona") continue;
      const r = rumboEscena(p.rumbo_deg ?? 0);
      personas.push({
        id: p.id,
        rol: { valor: p.rol, fuente: "usuario", confianza: 0.9 },
        posicion_inicial: {
          ...local(p.punto),
          rumbo_deg: r > 180 ? r - 360 : r,
          procedencia: { ...DEL_PERITO, nota: "El perito la colocó en el mapa." },
        },
        ...(p.final
          ? {
              posicion_final: {
                ...local(p.final),
                rumbo_deg: r > 180 ? r - 360 : r,
                procedencia: { ...DEL_PERITO, nota: "El perito marcó dónde quedó." },
              },
            }
          : {}),
      });
    }
  }

  // El terreno que declaró el perito (C3, W5): zonas de otra superficie, ondulaciones, topes y el
  // relieve real. La fricción de una zona sin fijar es la de la tabla para el estado del lugar.
  if (origen) {
    const lugar = spec.lugar as Json & { estado_superficie?: { valor?: string } };
    const t = terrenoDeEscena(e, local, String(lugar.estado_superficie?.valor ?? "seco"));
    if (t) {
      lugar.terreno = t.terreno;
      limites.push(...t.limites);
    }
  }

  // La deformación medida (C y L) de cada vehículo: la de la cara del primer impacto o, si el
  // reporte no la dice, la primera. Un reporte mide una sola deformación por vehículo (la del
  // McHenry); si la lectura la repite en otro daño, esa copia no se usa (diagnóstico de AXA, ADR
  // 0091). El perfil C1–Cn completo y la rigidez A y B del reporte van con ella.
  const medidos = (e.danos ?? []).filter((d) => {
    const lado = LADO[d.zona.cara];
    return (
      !d.dano_previo &&
      !!lado &&
      ["F", "B", "L", "R"].includes(lado) &&
      !!d.magnitud?.c_m?.length &&
      d.magnitud.l_m !== undefined &&
      orden.includes(d.vehiculo)
    );
  });
  for (const id of orden) {
    const suyos = medidos.filter((d) => d.vehiculo === id);
    if (!suyos.length) continue;
    const cara = zonasPrimero.find((z) => z.vehiculo === id)?.zona.cara;
    const d = suyos.find((x) => x.zona.cara === cara) ?? suyos[0]!;
    if (suyos.length > 1)
      limites.push(
        `${id}: el reporte trae medidas de deformación en ${suyos.length} daños; se usa la de ${d.zona.cara === cara ? "la cara del impacto" : "la primera"} (${d.zona.cara}).`,
      );
    const c = d.magnitud!.c_m!;
    const v = e.vehiculos.find((x) => x.id === id);
    const rig = v?.rigidez && v.rigidez.fuente !== "nhtsa_e2" ? v.rigidez : undefined;
    // El reporte escribe A y B en kN/m y kN/m² aunque imprima «N/m» (ADR 0048).
    const kilo = rig && rigidezEnKilo(rig.A) ? 1000 : 1;
    spec.danos_declarados.push({
      vehiculo_id: idEscena(id),
      zona: { lado: LADO[d.zona.cara]! },
      severidad: SEVERIDAD[d.magnitud?.cualitativa ?? ""] ?? "moderado",
      profundidad_aplastamiento: { valor: Math.max(...c), unidad: "m", ...DEL_PERITO },
      ancho_danado: { valor: d.magnitud!.l_m!, unidad: "m", ...DEL_PERITO },
      ...(c.length >= 2 && c.length <= 6
        ? { perfil_aplastamiento: { valor: [...c], unidad: "m", ...DEL_PERITO } }
        : {}),
      ...(rig
        ? {
            rigidez: {
              a: rig.A * kilo,
              b: rig.B * kilo,
              ...DEL_PERITO,
              nota: `Del reporte: A = ${rig.A}, B = ${rig.B}${kilo === 1000 ? ". El reporte imprime N/m y J, pero su resultado solo cuadra con kN/m y kJ: se leen así" : ""}.`,
            },
          }
        : {}),
      procedencia: { ...DEL_PERITO },
    });
  }
  (e.evidencias?.huellas ?? []).forEach((h, k) => {
    if (!h.longitud || !h.vehiculo || !orden.includes(h.vehiculo) || h.tipo === "arrastre") return;
    spec.evidencias.push({
      id: `evid-huella-${k + 1}`,
      tipo: h.tipo === "frenado" ? "marcas_frenado" : "marcas_derrape",
      // Un derrape que la narración pone antes del choque («antes de la salida del camino», «previo
      // al impacto») es de antes del impacto, como el frenado (René, 2026-11-24).
      ...(h.tipo === "frenado" || derrapeAntes(h.cita?.texto)
        ? { fase: "antes_impacto" }
        : derrapeDespues(h.cita?.texto)
          ? { fase: "despues_impacto" }
          : {}),
      vehiculo_id: idEscena(h.vehiculo),
      longitud: {
        valor: h.longitud.valor,
        unidad: h.longitud.unidad === "cm" ? "cm" : "m",
        ...DEL_PERITO,
      },
      procedencia: { ...DEL_PERITO },
    });
  });
  // Carambola sin las posiciones del perito (R4b): los vehículos que solo están en impactos
  // posteriores se colocan donde la narración dice que pasó el golpe, no en la disposición genérica.
  const colocados = colocarPosteriores(
    spec,
    new Set([...enImpacto, ...deImpacto.map((p) => p.vehiculo)].map(idEscena)),
    maniobraNarrada.size ? new Set([...maniobraNarrada.keys()].map(idEscena)) : new Set(),
  );
  if (colocados.length) {
    const nombres = colocados.map((v) => ids[v]).join(", ");
    limites.push(
      `${nombres}: sin sus posiciones en el mapa, Croquis ${colocados.length === 1 ? "lo coloca detenido" : "los coloca detenidos"} en la trayectoria del vehículo que los golpea, con la cara que dice la narración (supuesto): coloca a cada uno en el mapa para medirlo.`,
    );
  }
  // Las del expediente que ve el perito (con la declarada, que el solver no usa): para compararlas.
  const velocidadesNarradas = Object.fromEntries(
    e0.vehiculos.flatMap((v) => (v.velocidad_narrada ? [[v.id, v.velocidad_narrada]] : [])),
  );
  return { spec, ids, limites, origen, narradas: velocidadesNarradas, posesDeImpacto };
}

const CARA_POR_OMISION = "B";

/**
 * Coloca a los vehículos que solo aparecen en impactos posteriores (R4b, carambolas sin
 * posiciones del perito). En el orden de los impactos, si uno de los dos ya está colocado y el
 * otro no: con una reconstrucción rápida (sin Monte Carlo) se ve a dónde va el colocado después de
 * su primer golpe, y el otro queda detenido a la mitad de ese recorrido, con la cara de contacto
 * que dice la narración (o la parte posterior, si no la dice) de frente al que llega. Todo como
 * supuesto. Devuelve los ids de escena colocados.
 */
function colocarPosteriores(
  spec: Json & { vehiculos: Json[]; eventos: Json[] },
  colocados: Set<string>,
  conManiobraNarrada: Set<string>,
): string[] {
  const nuevos: string[] = [];
  const posteriores = spec.eventos.filter((ev) => ev.tipo === "segundo_impacto");
  for (const ev of posteriores) {
    const [a, b] = ev.actores as string[];
    if (!a || !b) continue;
    const [fijo, nuevo] =
      colocados.has(a) && !colocados.has(b)
        ? [a, b]
        : colocados.has(b) && !colocados.has(a)
          ? [b, a]
          : [null, null];
    if (!fijo || !nuevo) continue;
    // El recorrido del que golpea, sin los que aún no se colocan: en su disposición genérica (a 40 km/h)
    // chocaban con él y ese empujón entraba en el recorrido; el vehículo quedaba donde, sin ese choque
    // fantasma, el que golpea nunca llega (René, 2026-11-26: 5 carambolas del corpus).
    const sinColocar = structuredClone(spec);
    sinColocar.vehiculos.forEach((v, k) => {
      if (colocados.has(String(v.id))) return;
      v.posicion_inicial = {
        x: 10000 + 100 * k,
        y: 10000,
        rumbo_deg: 0,
        procedencia: { fuente: "supuesto", confianza: 0.3 },
      };
      v.velocidad_previa = { valor: 0, unidad: "km/h", fuente: "supuesto", confianza: 0.3 };
    });
    const r = reconstruct(sinColocar);
    const vf = r.vehiculos.find((v) => v.id === fijo);
    const vn = r.vehiculos.find((v) => v.id === nuevo);
    const golpe = r.eventos
      .filter((x) => x.tipo.startsWith("impacto_") && x.actores.includes(fijo))
      .sort((x, y) => x.t - y.t)[0];
    if (!vf || !vn || !golpe) continue;
    const tr = vf.trajectory;
    const i0 = tr.t.findIndex((t) => t >= golpe.t);
    if (i0 < 0) continue;
    // El recorrido real después del golpe (puede curvarse si gira): a la mitad de su longitud.
    const tramos = [0];
    for (let i = i0 + 1; i < tr.t.length; i++)
      tramos.push(tramos.at(-1)! + Math.hypot(tr.x[i]! - tr.x[i - 1]!, tr.y[i]! - tr.y[i - 1]!));
    const recorrido = tramos.at(-1)!;
    // Si después del golpe casi no se mueve, no alcanza a nadie: se queda la disposición genérica.
    if (recorrido < 0.5) continue;
    const im = i0 + tramos.findIndex((s) => s >= 0.5 * recorrido);
    const v = Math.hypot(tr.vx[im]!, tr.vy[im]!);
    if (v < 0.05) continue;
    // La dirección del movimiento en ese punto, y lo que sobresale el vehículo hacia ella.
    const d: [number, number] = [tr.vx[im]! / v, tr.vy[im]! / v];
    const rel = tr.yaw[im]! - Math.atan2(d[1], d[0]);
    const alcance =
      Math.abs(Math.cos(rel)) * (vf.length / 2) + Math.abs(Math.sin(rel)) * (vf.width / 2);
    const contacto: [number, number] = [tr.x[im]! + d[0] * alcance, tr.y[im]! + d[1] * alcance];
    const zona = (
      ev.zonas_impacto as { vehiculo_id: string; cdc: { lado: string } }[] | undefined
    )?.find((z) => z.vehiculo_id === nuevo);
    const cara = zona?.cdc.lado ?? CARA_POR_OMISION;
    // El rumbo que deja la cara de contacto mirando hacia el que llega (−d).
    const haciaAtras = Math.atan2(-d[1], -d[0]);
    const rumbo =
      cara === "F"
        ? haciaAtras
        : cara === "B"
          ? haciaAtras + Math.PI
          : cara === "L"
            ? haciaAtras - Math.PI / 2
            : haciaAtras + Math.PI / 2;
    const fondo = cara === "F" || cara === "B" ? vn.length / 2 : vn.width / 2;
    const sv = spec.vehiculos.find((v) => v.id === nuevo)!;
    const grados = ((((rumbo * 180) / Math.PI) % 360) + 360) % 360;
    sv.posicion_inicial = {
      x: Math.round((contacto[0] + d[0] * fondo) * 1000) / 1000,
      y: Math.round((contacto[1] + d[1] * fondo) * 1000) / 1000,
      rumbo_deg: Math.round(grados * 1000) / 1000,
      procedencia: {
        fuente: "supuesto",
        confianza: 0.3,
        nota: "Detenido en la trayectoria del vehículo que lo golpea, con la cara de contacto que dice la narración.",
      },
    };
    sv.velocidad_previa = { valor: 0, unidad: "km/h", fuente: "supuesto", confianza: 0.3 };
    if (!conManiobraNarrada.has(nuevo))
      sv.maniobra = { valor: "detenido", fuente: "supuesto", confianza: 0.3 };
    colocados.add(nuevo);
    nuevos.push(nuevo);
  }
  return nuevos;
}

export interface VelocidadReconstruida {
  vehiculo: Id;
  /** Lo que fija la evidencia: mejor estimación y percentiles (km/h). null si no lo fija. */
  previa: {
    mejor: number;
    p10?: number;
    p50?: number;
    p90?: number;
    rango_por?: string;
    /** La midió un instrumento (René, 2026-11-27): no es una cifra del ajuste, es un dato. */
    medida?: boolean;
  } | null;
  impacto: {
    p10?: number;
    p50?: number;
    p90?: number;
    /** La velocidad al impacto de cada simulación (km/h), para su histograma. */
    valores?: number[];
  } | null;
}

/** Un impacto reconstruido, en orden: cuándo (s; el primero es 0) y entre qué vehículos. */
export interface ImpactoReconstruido {
  numero: number;
  t: number;
  vehiculos: Id[];
  /**
   * Ronda 4 (René): el choque ocurre pero no transfiere energía (ningún vehículo cambia su velocidad
   * más de `DV_SIN_TRANSFERENCIA_KMH`): sin daño. Se dice; nunca se ve como un empujón mudo.
   */
  sinTransferencia?: boolean;
}

/** km/h: un cambio de velocidad menor en todos los del choque es un choque que no transfiere nada. */
export const DV_SIN_TRANSFERENCIA_KMH = 2;

interface ParametroAjustado {
  parametro: string;
  vehiculo: string;
  inicial?: number;
  estimacion?: { mejor: number };
}

/** El parámetro que ajustó la inversión para un vehículo, si lo ajustó. */
function ajustadoDe(resultado: Json, vehiculo: string, parametro: string) {
  const ps = ((resultado.inversion as Json | undefined)?.parametros ?? []) as ParametroAjustado[];
  return ps.find((p) => p.parametro === parametro && p.vehiculo === vehiculo) ?? null;
}

/**
 * km/h: la velocidad de cierre del primer choque con las velocidades y los rumbos del mejor ajuste
 * (lo no ajustado, como viene en la escena). Infinito si falta algún dato: nunca da un aviso falso.
 */
function cierreDelAjuste(spec: Json, resultado: Json, actores: readonly string[]): number {
  const vs = (spec.vehiculos ?? []) as Json[];
  const vector = (a: string): [number, number] | null => {
    const v = vs.find((x) => x.id === a);
    const pv = ajustadoDe(resultado, a, "velocidad_previa");
    const pr = ajustadoDe(resultado, a, "rumbo_inicial");
    const kmh =
      pv?.estimacion?.mejor ?? pv?.inicial ?? (v?.velocidad_previa as Json | undefined)?.valor;
    const rumbo =
      pr?.estimacion?.mejor ?? pr?.inicial ?? (v?.posicion_inicial as Json | undefined)?.rumbo_deg;
    if (typeof kmh !== "number" || typeof rumbo !== "number") return null;
    const r = (rumbo * Math.PI) / 180;
    return [kmh * Math.sin(r), kmh * Math.cos(r)];
  };
  const [a, b] = actores.map(vector);
  if (!a || !b) return Infinity;
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * De qué inversión sale una hipótesis (ADR 0091): si un reposo supuesto no cabe con la deformación
 * medida, «la más cercana al daño medido» (la deformación como restricción, el reposo supuesto blando)
 * o «cuadra con el reposo supuesto» (el supuesto pesa como dato); si no, la única inversión
 * («evidencia»).
 */
export type FamiliaHipotesis = "dano" | "reposo" | "evidencia";

/**
 * Una hipótesis de la reconstrucción (ADR 0091): una de las dos familias de arriba o, dentro de
 * una familia, otro mínimo del multiarranque con un costo parecido al del mejor. El perito elige.
 */
export interface HipotesisReconstruccion {
  /** «dano», «reposo» o «evidencia» para el mejor modo; «dano-2», «reposo-2»… para los otros. */
  clave: string;
  familia: FamiliaHipotesis;
  /** 1, el mejor modo de su familia; 2, 3…, otro modo dentro del margen de costo. */
  modo: number;
  titulo: string;
  /**
   * Costo del ajuste (soft_l1: con residuos chicos, ½ χ²); menor es mejor. Solo se comparan los de
   * la misma familia: cada una pesa distinto el reposo supuesto.
   */
  costo: number | null;
  /**
   * Velocidad previa de cada vehículo: la que fija la evidencia o, si no la fija, la del ajuste
   * conjunto (`fijada: false`, con su desviación local).
   */
  velocidades: {
    vehiculo: Id;
    kmh: number | null;
    fijada: boolean;
    sigmaKmh: number | null;
    /**
     * p10–p90 de las reestimaciones con entradas perturbadas alrededor de esta solución (ADR 0091),
     * si la evidencia la fija.
     */
    rango: [number, number] | null;
  }[];
  /** A cuántos metros de su reposo supuesto termina cada vehículo con este ajuste. */
  reposos: { vehiculo: Id; m: number }[];
  /** ¿El ajuste alcanza la deformación medida (dentro de su banda)? */
  alcanzaDano: boolean;
}

export interface Reconstruccion extends EscenaSolver {
  /** El resultado completo del solver (trayectorias, incertidumbre, inversión, consistencia). */
  resultado: Json;
  /**
   * El candado físico (René, 2026-11-24): presente si la cifra no cuadra con la física o con el 3D.
   * Entonces ninguna velocidad trae cifra (`previa` y `impacto` van en null) y el 3D no anima.
   */
  noCuadra?: NoCuadra;
  /**
   * La velocidad medida no cabe con la evidencia (René, 2026-11-28): con ella la reconstrucción no
   * cuadra, así que se muestra la física sin ella (marcada como tal) y el conflicto; el perito decide
   * cuál usa en el dictamen.
   */
  medidaIncompatible?: { vehiculos: { vehiculo: Id; kmh: number }[]; texto: string };
  velocidades: VelocidadReconstruida[];
  /** Los impactos que ocurrieron en la reconstrucción, en orden (más de uno en una carambola). */
  impactos: ImpactoReconstruido[];
  /** La evidencia que usó la inversión, con sus nombres del solver. */
  evidencia: string[];
  /**
   * Las hipótesis, si hay más de una (ADR 0091): un reposo supuesto que no cabe con la deformación
   * medida, u otro modo con un costo parecido al del mejor. En orden: por familia y por costo.
   */
  hipotesis: HipotesisReconstruccion[] | null;
  /** La clave que eligió el perito; null mientras no elija (se muestra la primera). */
  elegida: string | null;
  /**
   * C3 (W5): los cruces de tope con su velocidad y sus supuestos; null si el terreno no entró.
   * Un caso guardado antes de W5 no lo trae.
   */
  terreno?: TerrenoReconstruido | null;
  /**
   * O4 (W5): la malla de relieve con la que se reconstruyó, en metros de la escena; null en plano.
   * No va en la escena: quien vuelve a reconstruir (la maqueta, el 3D) la pasa junto a ella.
   */
  relieve?: MallaRelieve | null;
}

interface Inversion {
  evidencia: string[];
  parametros: {
    parametro: string;
    vehiculo: string;
    identificable: boolean;
    inicial?: number;
    en_limite?: boolean;
    sigma_local?: number;
    estimacion?: {
      mejor: number;
      p10?: number;
      p50?: number;
      p90?: number;
      rango_por?: string;
    };
  }[];
  velocidad_impacto: {
    vehiculo: string;
    p10?: number;
    p50?: number;
    p90?: number;
    valores_kmh?: number[];
  }[];
  residuos: { nombre: string; sigma: number }[];
  ajuste_completo?: {
    valores: { nombre: string; valor: number }[];
    residuos: { nombre: string; sigma: number }[];
  };
  /** Los modos del multiarranque (ADR 0091). */
  multiarranque?: { margen_costo: number; modos: { costo: number; en_margen: boolean }[] };
  /** Los otros modos dentro del margen, cada uno con su estimación. */
  alternativas?: Inversion[];
}

/**
 * Cómo se llama cada hipótesis en todas las vistas. La de la deformación como restricción se llama
 * «La más cercana al daño medido» y no «Cuadra con el daño medido» (René, 2026-11-15): puede quedar
 * en el borde bajo de lo que pide la deformación (AXA: 34 % de la energía de la mediana), y la
 * misma pantalla lo dice (`dano-energia.ts`).
 */
export const TITULOS_DE_HIPOTESIS: Record<FamiliaHipotesis, string> = {
  dano: "La más cercana al daño medido",
  reposo: "Cuadra con el reposo supuesto",
  evidencia: "La que mejor cuadra con la evidencia",
};

/** Las hipótesis de una inversión: su mejor modo y los otros dentro del margen (ADR 0091). */
function hipotesisDe(
  base: EscenaSolver,
  inv: Inversion,
  familia: FamiliaHipotesis,
): HipotesisReconstruccion[] {
  const modos = inv.multiarranque?.modos ?? [];
  const enMargen = modos.filter((m) => m.en_margen);
  return [
    leerHipotesis(base, inv, familia, 1, modos[0]?.costo ?? null),
    ...(inv.alternativas ?? []).map((a, i) =>
      leerHipotesis(base, a, familia, i + 2, enMargen[i]?.costo ?? null),
    ),
  ];
}

/** Una hipótesis leída de su inversión (ADR 0091). */
function leerHipotesis(
  base: EscenaSolver,
  inv: Inversion,
  familia: FamiliaHipotesis,
  modo: number,
  costo: number | null,
): HipotesisReconstruccion {
  const ajuste = inv.ajuste_completo;
  const residuos = new Map((ajuste?.residuos ?? inv.residuos).map((r) => [r.nombre, r.sigma]));
  const valor = (nombre: string) => ajuste?.valores.find((v) => v.nombre === nombre)?.valor;
  // Un reposo supuesto tiene PRIORIDAD veces la σ (1 m) de uno declarado, salvo en su hipótesis.
  const sigmaReposo = familia === "reposo" ? 1 : PRIORIDAD;
  return {
    clave: modo === 1 ? familia : `${familia}-${modo}`,
    familia,
    modo,
    titulo:
      modo === 1
        ? TITULOS_DE_HIPOTESIS[familia]
        : `${TITULOS_DE_HIPOTESIS[familia]} · otra solución`,
    costo,
    velocidades: Object.entries(base.ids).map(([sid, id]) => {
      const p = inv.parametros.find(
        (x) => x.vehiculo === sid && x.parametro === "velocidad_previa",
      );
      const fijada = Boolean(p?.identificable && p.estimacion);
      const e = p?.estimacion;
      return {
        vehiculo: id,
        kmh: fijada ? e!.mejor : (valor(`velocidad:${sid}`) ?? null),
        fijada,
        sigmaKmh: p?.sigma_local ?? null,
        rango: fijada ? rangoInformativo(e!) : null,
      };
    }),
    reposos: Object.entries(base.ids).flatMap(([sid, id]) => {
      const x = residuos.get(`reposo_supuesto:${sid}:x`);
      const y = residuos.get(`reposo_supuesto:${sid}:y`);
      return x === undefined || y === undefined
        ? []
        : [{ vehiculo: id, m: Math.round(Math.hypot(x, y) * sigmaReposo * 10) / 10 }];
    }),
    alcanzaDano: [...residuos].every(
      ([k, r]) => !(k.startsWith("dano:") || k.startsWith("dano_minimo:")) || Math.abs(r) <= 1,
    ),
  };
}

/**
 * La reconstrucción con la hipótesis que eligió el perito (ADR 0091): sus velocidades y su
 * evidencia pasan al paso 6, al 3D y al dictamen.
 */
export function conHipotesis(r: Reconstruccion, clave: string): Reconstruccion {
  const h = r.hipotesis?.find((x) => x.clave === clave);
  if (!h) return r;
  const familia = (
    h.familia === "reposo" ? r.resultado.inversion_reposo_supuesto : r.resultado.inversion
  ) as Inversion;
  const inv = h.modo === 1 ? familia : familia.alternativas![h.modo - 2]!;
  const otra = interpretarResultado(
    r,
    { ...r.resultado, inversion: inv },
    { relieve: r.relieve ?? null },
  );
  return { ...otra, limites: r.limites, hipotesis: r.hipotesis, elegida: clave };
}

/** El encabezado de las hipótesis: por qué hay más de una (ADR 0091). */
export function encabezadoHipotesis(hs: readonly HipotesisReconstruccion[]): string {
  const choque = hs.some((h) => h.familia === "reposo");
  const modos = hs.some((h) => h.modo > 1);
  if (choque && modos)
    return "Hipótesis: el reposo supuesto y el daño medido no caben juntos, y hay más de una solución con costo parecido";
  if (choque) return "Dos hipótesis: el reposo supuesto y el daño medido no caben juntos";
  return "Más de una solución reproduce la evidencia con un costo parecido";
}

/**
 * El p10–p90 de una estimación, o null si no dice nada: sin percentiles, o con p10 = p90. Desde el
 * 2026-10-26 el solver ya no da rangos de ancho cero (cuando las muestras no se apartan de la
 * solución, da el lineal, `rango_por: "laplace"`); queda por si una σ local es cero (ADR 0091).
 */
export function rangoInformativo(e: { p10?: number; p90?: number }): [number, number] | null {
  return e.p10 !== undefined && e.p90 !== undefined && e.p10 !== e.p90 ? [e.p10, e.p90] : null;
}

/** La hipótesis que se ve: la que eligió el perito o, si no eligió, la primera. */
export function hipotesisVisible(r: Reconstruccion): HipotesisReconstruccion | null {
  if (!r.hipotesis) return null;
  return r.hipotesis.find((h) => h.clave === r.elegida) ?? r.hipotesis[0]!;
}

/**
 * La hipótesis «cuadra con el reposo supuesto» cuando no es la que se ve (ADR 0135, decisión 8): va
 * como alternativa, marcada como supuesto, junto a la del daño medido en Reconstrucción, Contra
 * CESVI, Presentar y el dictamen. Su texto, una sola frase con las velocidades y su p10–p90.
 */
export function alternativaSupuesta(
  r: Reconstruccion,
  letraDe: (id: string) => string = (id) => id,
): { clave: string; titulo: string; texto: string; corto: string } | null {
  if (!r.hipotesis) return null;
  const vista = hipotesisVisible(r);
  const alt = r.hipotesis.find((h) => h !== vista && h.familia === "reposo" && h.modo === 1);
  if (!alt) return null;
  const conVel = alt.velocidades.filter((v) => v.kmh !== null);
  const vel = (v: (typeof conVel)[number]) =>
    `${letraDe(String(v.vehiculo))} ${kmhConUnidad(v.kmh, "reconstruccion")}${v.fijada && v.rango ? ` (${rangoKmh(v.rango[0], v.rango[1], "reconstruccion")})` : ""}`;
  const mayor = [...conVel].sort((a, b) => b.kmh! - a.kmh!)[0];
  return {
    clave: alt.clave,
    titulo: alt.titulo,
    texto: `Alternativa, con el reposo supuesto como dato (supuesto, no medición): ${conVel.map(vel).join(", ")}.`,
    corto: mayor
      ? `${letraDe(String(mayor.vehiculo))} ${kmhConUnidad(mayor.kmh, "reconstruccion")}`
      : "",
  };
}

/**
 * Lee el resultado completo del solver (`fullResult`, en el servidor de pruebas o en el Web Worker
 * del navegador) en términos del expediente: velocidades por vehículo y lo que no fija la evidencia.
 */
/**
 * Lo marcado contra lo reconstruido en un atropello: la distancia de proyección que marcó el perito
 * (de donde golpearon a la persona a donde quedó) y la que da la reconstrucción, con su rango. Null si
 * no hay atropello, si el perito no marcó dónde quedó o si lo marcado cae dentro del rango.
 */
export function avisoDeProyeccion(spec: Json, resultado: Json): string | null {
  const marcada = ((spec.evidencias ?? []) as Json[]).find((e) => e.tipo === "distancia_proyeccion")
    ?.longitud as { valor?: number } | undefined;
  const d = (((resultado.eventos ?? []) as { tipo: string; detalle?: Json | null }[]).find(
    (ev) => ev.tipo === "impacto_vehiculo_persona",
  )?.detalle ?? null) as { distancia_proyeccion_m?: number; rango_m?: [number, number] } | null;
  const m = Number(marcada?.valor);
  if (!Number.isFinite(m) || !d?.rango_m || d.distancia_proyeccion_m === undefined) return null;
  const [a, b] = d.rango_m;
  if (m >= a && m <= b) return null;
  return `La persona quedó a ${metros(m)} de donde la golpearon, según lo marcado; con la velocidad reconstruida, la proyección es de ${metros(d.distancia_proyeccion_m)} (de ${metros(a)} a ${metros(b)}). La posición final del vehículo y la de la persona no cuadran juntas: revisa cuál está mejor medida.`;
}

export function interpretarResultado(
  base: EscenaSolver,
  resultado: Json,
  /** La malla de relieve con que se reconstruyó: el candado reproduce el 3D con ella. */
  opciones: { relieve?: unknown } = {},
): Reconstruccion {
  const inv = resultado.inversion as Inversion;
  const limites = [...base.limites];
  if (!inv.evidencia.length) {
    limites.push(
      "La evidencia del perito todavía no fija ninguna velocidad: coloca las posiciones de impacto y finales, o captura las medidas C y L de la deformación.",
    );
  }
  const eventos = (resultado.eventos ?? []) as {
    id: string;
    tipo: string;
    t: number;
    actores: string[];
  }[];
  // Un atropello (A3): si el perito marcó dónde quedó la persona y la reconstrucción la proyecta a
  // otra distancia (fuera de su rango), se dice con las dos cifras. No se esconde ninguna.
  const aviso = avisoDeProyeccion(base.spec, resultado);
  if (aviso) limites.push(aviso);
  const impactos = eventos
    .filter((ev) => ev.tipo.startsWith("impacto_"))
    .sort((a, b) => a.t - b.t)
    .map((ev, k) => {
      const actores = ev.actores.filter((a) => base.ids[a]);
      // Solo el primero: los posteriores llevan su ΔV en `danos_posteriores`.
      const dv = (a: string) =>
        Number(((resultado.vehiculos ?? []) as Json[]).find((v) => v.id === a)?.delta_v_kmh ?? NaN);
      // Si la inversión ajustó la velocidad de alguno, la corrida de `resultado` va con su arranque
      // (40 km/h para todos), no con el mejor ajuste: su ΔV no dice nada del choque reconstruido
      // (AXA salía «sin transferencia» con 57 contra 15 km/h). Entonces se mide la velocidad de cierre
      // con las del mejor ajuste: si es menor que el umbral, ningún ΔV puede pasarlo.
      const ajustado = actores.some((a) => ajustadoDe(resultado, a, "velocidad_previa"));
      const sinTransferencia =
        k === 0 &&
        ev.tipo === "impacto_vehiculo_vehiculo" &&
        actores.length >= 2 &&
        (ajustado
          ? cierreDelAjuste(base.spec, resultado, actores) < DV_SIN_TRANSFERENCIA_KMH
          : actores.every((a) => Number.isFinite(dv(a)) && dv(a) < DV_SIN_TRANSFERENCIA_KMH));
      return {
        numero: k + 1,
        t: ev.t,
        vehiculos: actores.map((a) => base.ids[a]!),
        ...(sinTransferencia ? { sinTransferencia: true } : {}),
      };
    });
  const fantasma = impactos.find((i) => i.sinTransferencia);
  if (fantasma)
    limites.push(
      `El choque entre ${fantasma.vehiculos.join(" y ")} casi no transfiere energía con estas velocidades (ninguno cambia su velocidad más de ${DV_SIN_TRANSFERENCIA_KMH} km/h), así que no deja daño: los dos llegan casi igual de rápido en el mismo sentido. Dile a Croquis a qué velocidad venía cada uno o revisa por dónde venían.`,
    );
  // Un impacto posterior que el solver no alcanzó a resolver se le dice al perito (R6).
  const primerPar = new Set(impactos[0]?.vehiculos ?? []);
  for (const ev of (base.spec.eventos ?? []) as { id: string; tipo: string; actores: string[] }[]) {
    if (ev.tipo !== "segundo_impacto" || eventos.some((x) => x.id === ev.id)) continue;
    const vs = ev.actores.map((a) => base.ids[a] ?? a);
    if (vs.every((v) => primerPar.has(v))) continue; // el mismo par: es el contacto de siempre
    limites.push(
      `El impacto ${ev.id.replace("ev-impacto-", "")} (${vs.join(" con ")}) no ocurre en la reconstrucción: con estas posiciones, sus trayectorias no llegan a tocarse.`,
    );
  }
  // Si el punto del choque es la estimación del relato, no se mueve en silencio (ADR 0135).
  const lejos = choqueLejosDelRelato(base.spec, inv);
  if (lejos !== null)
    limites.push(
      `El choque quedó a ${metros(lejos, 1)} del punto que da el relato: el relato lo estima y la evidencia lo lleva ahí.`,
    );
  // Un rumbo de llegada que la evidencia empuja contra el límite de búsqueda se le dice al perito,
  // no se queda como un número callado (ADR 0135).
  for (const p of inv.parametros) {
    const id = base.ids[p.vehiculo];
    if (p.parametro !== "rumbo_inicial" || !p.en_limite || !p.estimacion || !id) continue;
    limites.push(
      `${id}: la evidencia empuja el rumbo fuera del rango permitido (±${ANGLE_BOUND_DEG}° sobre el que se colocó en el mapa). El mejor ajuste queda en el límite, ${grados(p.estimacion.mejor)}, así que no cabe bien con lo demás: conviene revisar las posiciones y el rumbo de llegada.`,
    );
  }
  const velocidades = Object.entries(base.ids).map(([sid, id]): VelocidadReconstruida => {
    const p = inv.parametros.find((x) => x.vehiculo === sid && x.parametro === "velocidad_previa");
    const i = inv.velocidad_impacto.find((x) => x.vehiculo === sid);
    const vp = ((base.spec.vehiculos as Json[]).find((x) => x.id === sid)?.velocidad_previa ??
      null) as Json | null;
    return {
      vehiculo: id,
      previa:
        vp?.medida === true
          ? { mejor: Number(vp.valor), medida: true }
          : p?.identificable && p.estimacion
            ? p.estimacion
            : null,
      impacto:
        inv.evidencia.length && i
          ? { p10: i.p10, p50: i.p50, p90: i.p90, valores: i.valores_kmh ?? [] }
          : null,
    };
  });
  // La velocidad medida no se cambia (René, 2026-11-27): si lo medido no cuadra con ella, se avisa.
  const medidas = velocidades.filter((v) => v.previa?.medida).map((v) => v.vehiculo);
  if (medidas.length) {
    const fuera = ((inv.residuos ?? []) as { nombre: string; sigma: number }[]).filter(
      (r) =>
        /^(reposo|marcas_despues|proyeccion|dano|dano_minimo):/.test(r.nombre) &&
        Math.abs(r.sigma) > 3,
    );
    if (fuera.length) {
      const que = [
        ...new Set(
          fuera.map((r) =>
            r.nombre.startsWith("reposo:")
              ? "dónde quedaron"
              : r.nombre.startsWith("marcas_despues:")
                ? "las huellas de después del choque"
                : r.nombre.startsWith("proyeccion:")
                  ? "la proyección"
                  : "la deformación medida",
          ),
        ),
      ];
      limites.push(
        `La velocidad medida de ${medidas.join(" y ")} no cuadra con ${que.join(", ")}: con ella, lo medido queda a más de 3σ. Croquis no la cambia; revisa la medida o esa evidencia.`,
      );
    }
  }
  // Un rango no es una garantía: su cobertura medida va con los límites (René, 2026-11-15).
  if (velocidades.some((v) => v.previa?.p10 !== undefined && v.previa.p90 !== undefined))
    limites.push(limiteDeCobertura());
  // Un mejor ajuste fuera de su propio rango se dice, con las dos cifras (hallado el 2026-11-15).
  for (const v of velocidades) {
    const fuera = limiteMejorFuera(v.vehiculo, v.previa);
    if (fuera) limites.push(fuera);
    // Las posiciones contra lo narrado (René, 2026-11-22): las dos cifras, sin forzar ninguna.
    const contra = limiteContraNarracion(v.vehiculo, base.narradas?.[v.vehiculo], v.previa);
    if (contra) limites.push(contra);
  }
  // Una cifra que pasa de lo razonable para su tipo de vehículo (René, 2026-11-25): aviso, no bloqueo.
  for (const sv of (base.spec.vehiculos ?? []) as Json[]) {
    const id = base.ids[String(sv.id)];
    if (!id) continue;
    const clase = ((sv.clase ?? {}) as Json).valor;
    const umbral = umbralDeClase(typeof clase === "string" ? clase : null);
    const mejor = velocidades.find((x) => x.vehiculo === id)?.previa?.mejor;
    const aviso = avisoVelocidadRazonable(id, umbral, mejor);
    if (aviso) limites.push(aviso);
  }
  // Y una persona a pie más rápida que lo que corre una persona (la que dice la escena).
  for (const pe of (base.spec.personas ?? []) as Json[]) {
    if (pe.vehiculo_id) continue;
    const vel = pe.velocidad as Json | undefined;
    const kmh = vel ? Number(vel.valor) * (vel.unidad === "m/s" ? 3.6 : 1) : null;
    const aviso = avisoVelocidadRazonable(
      typeof pe.id === "string" ? pe.id : "Peatón",
      UMBRAL_PEATON,
      kmh,
    );
    if (aviso) limites.push(aviso);
  }
  // Una reversa más rápida que cualquiera de las medidas en uso real se le dice al perito (T3.3).
  for (const sv of (base.spec.vehiculos ?? []) as Json[]) {
    const id = base.ids[String(sv.id)];
    if (!id || !isReverse(sv)) continue;
    const vp = sv.velocidad_previa as Json | undefined;
    const dicha = vp && ["usuario", "relato"].includes(String(vp.fuente)) ? Number(vp.valor) : null;
    const estimada = velocidades.find((x) => x.vehiculo === id)?.previa?.mejor ?? null;
    const aviso = avisoReversaRapida(id, estimada ?? dicha ?? 0);
    if (aviso) limites.push(aviso);
  }
  const terreno = terrenoReconstruido(base.ids, resultado);
  if (terreno?.relieveFalta)
    limites.push(
      "No se pudo obtener el relieve real del lugar: la reconstrucción va en plano. Vuelve a reconstruir cuando haya red.",
    );
  const alterna = resultado.inversion_reposo_supuesto as Inversion | undefined;
  const todas = alterna
    ? [...hipotesisDe(base, inv, "dano"), ...hipotesisDe(base, alterna, "reposo")]
    : hipotesisDe(base, inv, "evidencia");
  const hipotesis = todas.length > 1 ? todas : null;
  const rec: Reconstruccion = {
    ...base,
    limites,
    resultado,
    velocidades,
    impactos,
    evidencia: inv.evidencia,
    hipotesis,
    elegida: null,
    terreno,
  };
  // El candado físico (René, 2026-11-24): si la cifra no cuadra con la física o con lo que reproduce
  // el 3D, no se presenta como resultado; se dice qué no cuadra y qué revisar.
  const { noCuadra } = candadoFisico({
    especAnimada: especReconstruida(rec),
    relieve: opciones.relieve ?? null,
    ids: base.ids,
    velocidades,
  });
  if (!noCuadra) return rec;
  return {
    ...rec,
    noCuadra,
    // Lo que midió un instrumento no es una cifra de Croquis: se sigue viendo (René, 2026-11-27); las
    // demás no se presentan hasta que cuadre.
    velocidades: velocidades.map((v) => ({
      ...v,
      previa: v.previa?.medida ? v.previa : null,
      impacto: null,
    })),
    limites: [
      ...limites,
      ...noCuadra.motivos.map((m) => `No cuadra: ${m}`),
      `Croquis no presenta una velocidad hasta que cuadre. Revisa ${noCuadra.revisar.join("; ")}.`,
    ],
  };
}

/**
 * El expediente para el solver: cada velocidad declarada por el perito (no medida) se cambia por la
 * típica de la vía, como si hubiera dicho «No sé». La declarada sigue en el expediente que ve el perito,
 * para compararla con la física.
 */
export function sinDeclaradasDelPerito(e: Expediente): Expediente {
  const declaradas = e.vehiculos.filter(
    (v) => v.velocidad_narrada?.origen === "perito" && !esVelocidadMedida(v.velocidad_narrada),
  );
  return declaradas.reduce((x, v) => conVelocidadDelPerito(x, v.id, null), e);
}

/** La evidencia del solver en palabras («reposo:veh-a» → «posición final de V1»). */
export function evidenciaEnPalabras(etiqueta: string, ids: Record<string, Id>): string {
  const [tipo, sid] = etiqueta.split(":");
  if (tipo === "punto_inicial") return "punto del primer golpe que marcó el perito";
  if (tipo === "paso") {
    // «pp-veh-a-2» es el segundo punto de paso de ese vehículo; «pp-choque-3», el lugar del
    // choque intermedio del impacto 3.
    const choque = /^pp-choque-(\d+)$/.exec(sid ?? "");
    if (choque) return `lugar del choque intermedio (impacto ${choque[1]})`;
    const paso = /^pp-(.+)-(\d+)$/.exec(sid ?? "");
    if (paso) return `punto de paso ${paso[2]} de ${ids[paso[1]!] ?? paso[1]}`;
    return `punto de paso ${sid}`;
  }
  const v = ids[sid ?? ""] ?? sid;
  const nombre: Record<string, string> = {
    reposo: "posición final",
    rumbo_final: "rumbo final",
    marcas_frenado: "huella de frenado",
    marcas_despues: "huella después del impacto",
    proyeccion: "distancia de proyección",
    dano: "deformación (C y L)",
  };
  return `${nombre[tipo ?? ""] ?? tipo} de ${v}`;
}

/**
 * Corre el solver (port TS) sobre la escena del expediente. Por omisión usa las muestras de
 * **referencia** (12 de la inversión y 64 del Monte Carlo), que son las de las pruebas y las
 * evaluaciones. La app reconstruye en su worker con las de **producción** (`PRODUCTION_SAMPLES`: 32
 * y 128), así que su rango no es idéntico al de aquí (auditoría del 2026-11-15, N3): para el número
 * que ve el perito, pasa `PRODUCTION_SAMPLES`. El resultado dice con cuántas se calculó
 * (`muestrasDe`).
 */
export function reconstruirExpediente(
  e: Expediente,
  specId?: string,
  muestras: { samples?: number; mcSamples?: number } = {},
): Reconstruccion {
  const r = reconstruirUnaVez(e, specId, muestras);
  // La velocidad medida que no cabe: la física sin ella, con el conflicto (René, 2026-11-28).
  if (!r.noCuadra || !hayVelocidadMedida(e)) return r;
  const fisica = reconstruirUnaVez(sinMedidasDelPerito(e), specId, muestras);
  return fisica.noCuadra ? r : conConflictoDeMedida(e, r, fisica);
}

/** Si algún vehículo trae una velocidad medida por un instrumento. */
export function hayVelocidadMedida(e: Expediente): boolean {
  return e.vehiculos.some((v) => esVelocidadMedida(v.velocidad_narrada));
}

/** El expediente sin las velocidades medidas: para el solver, como si el perito dijera «No sé». */
export function sinMedidasDelPerito(e: Expediente): Expediente {
  return e.vehiculos
    .filter((v) => esVelocidadMedida(v.velocidad_narrada))
    .reduce((x, v) => conVelocidadDelPerito(x, v.id, null), e);
}

/**
 * La reconstrucción física (sin las medidas) con el conflicto a la vista: «Con la velocidad medida de
 * X km/h no cuadra: …; la medida no es compatible con las posiciones».
 */
export function conConflictoDeMedida(
  e: Expediente,
  conMedida: Reconstruccion,
  fisica: Reconstruccion,
): Reconstruccion {
  const vehiculos = e.vehiculos
    .filter((v) => esVelocidadMedida(v.velocidad_narrada))
    .map((v) => ({ vehiculo: v.id, kmh: Math.round(v.velocidad_narrada!.kmh) }));
  const motivo = conMedida.noCuadra?.motivos[0] ?? "lo medido y las posiciones no caben juntos";
  const cuales = vehiculos.map((x) => `${x.kmh} km/h (${x.vehiculo})`).join(" y ");
  const texto = `Con la velocidad medida de ${cuales} no cuadra: ${motivo}. La medida no es compatible con las posiciones: revisa la medida o las posiciones. Croquis muestra la reconstrucción física, sin la medida; en el dictamen decides cuál usar.`;
  return {
    ...fisica,
    // Las velocidades que dio el perito, con la medida, para que la hoja diga «medida X; la física Y».
    narradas: conMedida.narradas,
    medidaIncompatible: { vehiculos, texto },
    limites: [texto, ...fisica.limites],
  };
}

/** Una reconstrucción: con lo que dice el expediente y, lo que la evidencia no fija, con la típica. */
function reconstruirUnaVez(
  e: Expediente,
  specId: string | undefined,
  muestras: { samples?: number; mcSamples?: number },
): Reconstruccion {
  const base = especDeExpediente(e, specId);
  const r = interpretarResultado(base, fullResult(base.spec, muestras));
  // Ronda 4: lo que la evidencia no fija va con la velocidad típica de la vía, nunca con el arranque.
  const conTipicas = expedienteConTipicas(e, r);
  if (!conTipicas) return r;
  const base2 = especDeExpediente(conTipicas, specId);
  return interpretarResultado(base2, fullResult(base2.spec, muestras));
}

/**
 * Ronda 4 (René, 2026-11-18): «si la evidencia no fija la velocidad, dilo y usa la declarada o la
 * típica, nunca una mínima arbitraria». El expediente con la velocidad típica de la vía (supuesto
 * con su rango, `conVelocidadDelPerito(…, null)`) para cada vehículo en movimiento que la evidencia
 * no fijó y del que nadie dijo la velocidad; null si no hay ninguno (entonces nada cambia: AXA, con
 * todo fijado por la evidencia, queda igual).
 */
export function expedienteConTipicas(e: Expediente, r: Reconstruccion): Expediente | null {
  // Lo que no cuadra no trae cifras (el candado las quita): no es que la evidencia no las fije, así
  // que no se le ponen las típicas de la vía (René, 2026-11-24).
  if (r.noCuadra) return null;
  const detenidos = new Set(
    (e.versiones ?? [])
      .find((x) => x.tipo === "evidencia")
      ?.maniobras?.filter((m) => m.tipo === "se_detiene")
      .map((m) => m.vehiculo) ?? [],
  );
  const sinFijar = r.velocidades
    .filter((v) => !v.previa)
    .map((v) => String(v.vehiculo))
    .filter((id) => {
      const veh = e.vehiculos.find((x) => x.id === id);
      return veh && !veh.velocidad_narrada && !detenidos.has(id);
    });
  // Solo los que el solver estima (los que se mueven): un detenido supuesto no tiene velocidad previa.
  const inv = (r.resultado.inversion ?? {}) as { parametros?: Json[] };
  const estimados = new Set(
    (inv.parametros ?? [])
      .filter((p) => p.parametro === "velocidad_previa")
      .map((p) => String(r.ids[String(p.vehiculo)] ?? "")),
  );
  const ids = sinFijar.filter((id) => estimados.has(id));
  if (!ids.length) return null;
  return ids.reduce((x, id) => conVelocidadDelPerito(x, id, null), e);
}

/** Las simulaciones con las que se calculó un rango, y cuál de los dos juegos son. */
export interface MuestrasReconstruccion {
  /** Las de la inversión: de ellas sale el p10–p90 de cada velocidad. */
  inversion: number;
  juego: "producción" | "referencia" | "otro";
}

/**
 * Con cuántas simulaciones se calculó el rango de una reconstrucción (lo dice su resultado). Todo
 * rango que se publica lleva este dato: «p10–p90 de 32 simulaciones» (auditoría del 2026-11-15, N3).
 * null si el resultado no lo trae.
 */
export function muestrasDe(r: Pick<Reconstruccion, "resultado">): MuestrasReconstruccion | null {
  const n = (r.resultado.inversion as { muestras?: unknown } | undefined)?.muestras;
  if (typeof n !== "number") return null;
  return {
    inversion: n,
    juego:
      n === PRODUCTION_SAMPLES.samples
        ? "producción"
        : n === MUESTRAS_DE_REFERENCIA
          ? "referencia"
          : "otro",
  };
}

/** Las muestras de la inversión cuando nadie pide otras (la referencia Python usa las mismas). */
export const MUESTRAS_DE_REFERENCIA = 12;

/** «p10–p90 de 32 simulaciones»; sin el dato, «p10–p90 de las simulaciones». */
export function notaDeMuestras(r: Pick<Reconstruccion, "resultado">): string {
  const m = muestrasDe(r);
  return m ? `rango del 80 % de ${m.inversion} simulaciones` : "rango del 80 % de las simulaciones";
}

/**
 * La escena del solver con las velocidades que la inversión estimó (las que reproducen la evidencia
 * del perito), para dibujar la reconstrucción en 3D. Van con fuente «supuesto» y una nota con sus
 * percentiles: son un cálculo de Croquis, no un dato del perito. Las que la evidencia no fija quedan
 * como estaban.
 */
export function especReconstruida(r: Reconstruccion): Json {
  const spec = structuredClone(r.spec) as Json & { vehiculos: Json[] };
  const hip = hipotesisVisible(r);
  // La letra sigue al expediente (V1 es A), aunque la escena del solver ponga primero al que golpea:
  // la hoja y el 3D dicen «B · Tacoma» los dos.
  const enOrden = [...new Set(Object.values(r.ids))].sort((a, b) =>
    String(a).localeCompare(String(b), "en", { numeric: true }),
  );
  for (const sv of spec.vehiculos) {
    const k = enOrden.indexOf(r.ids[String(sv.id)]!);
    if (k >= 0) sv.rol = String.fromCharCode(65 + k);
    const v = r.velocidades.find((x) => x.vehiculo === r.ids[String(sv.id)]);
    // En una hipótesis que la evidencia medida no fija, el 3D muestra su ajuste conjunto, dicho así.
    const sinFijar = hip?.velocidades.find((x) => x.vehiculo === r.ids[String(sv.id)]);
    if (!v?.previa && sinFijar && !sinFijar.fijada && sinFijar.kmh !== null) {
      sv.velocidad_previa = {
        valor: Math.round(sinFijar.kmh * 100) / 100,
        unidad: "km/h",
        fuente: "supuesto",
        confianza: 0.3,
        nota: `Mejor ajuste de la hipótesis «${hip!.titulo}»: la evidencia medida no la fija.`,
      };
      continue;
    }
    if (!v?.previa) continue;
    const { mejor, p10, p90 } = v.previa;
    // Con 0 km/h no llega a ningún lado: arranca detenido donde el perito lo puso en el impacto. Si
    // no, se quedaba en su arranque supuesto (12 m antes) y el otro lo alcanzaba antes del choque
    // (la carambola de la e2e, René, 2026-11-25).
    const enImpacto = r.posesDeImpacto?.[String(sv.id)];
    if (mejor < 0.5 && enImpacto)
      sv.posicion_inicial = {
        ...enImpacto,
        procedencia: {
          fuente: "supuesto",
          confianza: 0.5,
          nota: "Detenido en la posición de impacto que colocó el perito: su velocidad reconstruida es 0 km/h.",
        },
      };
    sv.velocidad_previa = {
      valor: Math.round(mejor * 100) / 100,
      unidad: "km/h",
      ...(p10 !== undefined && p90 !== undefined
        ? { rango: [Math.round(p10 * 100) / 100, Math.round(p90 * 100) / 100] }
        : {}),
      fuente: "supuesto",
      confianza: 0.7,
      nota: "Velocidad que reproduce la evidencia del perito (Croquis la ajusta a la evidencia; el rango es donde cae el 80 % de las simulaciones).",
    };
  }
  // Las huellas de antes del choque frenan en el recorrido como en el ajuste (`withMarks` del solver):
  // sin esto, el 3D llegaba al choque a la velocidad previa, sin frenar (René, 2026-11-24).
  for (const ev of (spec.evidencias ?? []) as Json[]) {
    const antes = ev.fase === "antes_impacto" || (ev.tipo === "marcas_frenado" && !ev.fase);
    if (!antes || (ev.tipo !== "marcas_frenado" && ev.tipo !== "marcas_derrape")) continue;
    const sv = spec.vehiculos.find((v) => v.id === ev.vehiculo_id);
    const largo = Number((ev.longitud as Json | undefined)?.valor);
    if (!sv || !(largo > 0)) continue;
    const fr = (sv.frenado ?? {}) as Json;
    if (((fr.distancia_antes_impacto ?? {}) as Json).fuente === "usuario") continue;
    fr.aplico = { valor: true, fuente: "relato", confianza: 0.8 };
    fr.distancia_antes_impacto = { valor: largo, unidad: "m", fuente: "relato", confianza: 0.8 };
    sv.frenado = fr;
  }
  // El candado físico (René, 2026-11-24): lo que no cuadra no se anima. El 3D muestra a cada vehículo
  // quieto donde el perito dijo que quedó, sin choque: la animación nunca muestra una velocidad que
  // Croquis no presenta.
  if (r.noCuadra) {
    for (const sv of spec.vehiculos) {
      const fin = (sv.posicion_final ?? null) as Json | null;
      if (fin) sv.posicion_inicial = { ...fin };
      sv.velocidad_previa = {
        valor: 0,
        unidad: "km/h",
        fuente: "supuesto",
        confianza: 0.5,
        nota: "La reconstrucción no cuadra: el 3D muestra dónde quedó, sin animar el choque.",
      };
      sv.maniobra = { valor: "detenido", fuente: "supuesto", confianza: 0.5 };
      delete sv.frenado;
    }
    spec.eventos = [];
  }
  return spec;
}

interface Trayectoria {
  t: number[];
  x: number[];
  y: number[];
  /** Radianes desde +X, antihorario. */
  rumbo: number[];
}

/** Interpola una serie en el tiempo t (fuera del intervalo, el extremo más cercano). */
function enT(ts: number[], xs: number[], t: number): number {
  if (t <= ts[0]!) return xs[0]!;
  const n = ts.length - 1;
  if (t >= ts[n]!) return xs[n]!;
  let k = 0;
  while (k < n && ts[k + 1]! < t) k++;
  const f = (t - ts[k]!) / (ts[k + 1]! - ts[k]!);
  return xs[k]! + f * (xs[k + 1]! - xs[k]!);
}

/**
 * Dónde está cada vehículo en el instante t de la reconstrucción, en el mapa: la trayectoria del
 * solver (metros desde el punto de impacto) de vuelta a latitud y longitud, con el rumbo en grados
 * desde el norte. Para sincronizar el croquis 2D con el reloj del 3D. Vacío sin punto de impacto.
 */
/**
 * Los impactos en el mapa, en orden (X1, X2…): el primero en el origen de la escena y los
 * posteriores en el punto de contacto que dio el solver (carambola, ADR 0066). Vacío sin origen.
 */
export function impactosEnMapa(
  base: EscenaSolver,
  resultado: Json,
): { numero: number; punto: { lat: number; lon: number } }[] {
  if (!base.origen) return [];
  const origen = base.origen;
  const eventos = (
    (resultado.eventos ?? []) as {
      tipo: string;
      t: number;
      detalle?: { punto_m?: number[] };
    }[]
  )
    .filter((ev) => ev.tipo.startsWith("impacto_"))
    .sort((a, b) => a.t - b.t);
  const pi = resultado.punto_impacto as { x: number; y: number } | undefined;
  return eventos.flatMap((ev, k) => {
    const xy = k === 0 ? (pi ? [pi.x, pi.y] : [0, 0]) : ev.detalle?.punto_m;
    if (!xy || xy.length < 2) return [];
    const [lon, lat] = avanzar(avanzar(origen, 0, xy[1]!), 90, xy[0]!);
    return [{ numero: k + 1, punto: { lat, lon } }];
  });
}

export function posicionesEnTiempo(
  base: EscenaSolver,
  resultado: Json,
  t: number,
): { vehiculo: Id; punto: { lat: number; lon: number }; rumbo: number }[] {
  if (!base.origen) return [];
  const origen = base.origen;
  return ((resultado.vehiculos ?? []) as { id: string; trayectoria?: Trayectoria }[]).flatMap(
    (v) => {
      const tr = v.trayectoria;
      const id = base.ids[v.id];
      if (!tr?.t?.length || !id) return [];
      const x = enT(tr.t, tr.x, t);
      const y = enT(tr.t, tr.y, t);
      const r = enT(tr.t, tr.rumbo, t);
      const [lon, lat] = avanzar(avanzar(origen, 0, y), 90, x);
      const rumbo = (((90 - (r * 180) / Math.PI) % 360) + 360) % 360;
      return [{ vehiculo: id, punto: { lat, lon }, rumbo }];
    },
  );
}

/** El instante del primer impacto de un resultado del solver (0 si no lo dice). */
function tPrimerImpacto(resultado: Json): number {
  const ts = ((resultado.eventos ?? []) as { tipo?: string; t?: number }[])
    .filter((e) => String(e.tipo ?? "").startsWith("impacto") && typeof e.t === "number")
    .map((e) => e.t!);
  return ts.length ? Math.min(...ts) : 0;
}

/**
 * T6.2: dónde está cada vehículo según la versión declarada de un conductor (R7), en el instante
 * `t` de la reconstrucción, para dibujarla en el croquis 2D junto a la reconstruida (antes solo
 * iba en el 3D y en la tabla).
 *
 * Las dos versiones se alinean por su impacto (cada resultado tiene el suyo en su propio reloj).
 * Solo se devuelven los vehículos que en ese instante están a más de `umbralM` de su posición
 * reconstruida: lo que coincide no se dibuja dos veces.
 */
export function posicionesDeclaradasEnTiempo(
  base: EscenaSolver,
  reconstruido: Json,
  declarado: Json,
  t: number,
  umbralM = 0.5,
): { vehiculo: Id; punto: { lat: number; lon: number }; rumbo: number; declarada: true }[] {
  if (!base.origen) return [];
  const origen = base.origen;
  const tD = t - tPrimerImpacto(reconstruido) + tPrimerImpacto(declarado);
  const deRec = new Map(
    ((reconstruido.vehiculos ?? []) as { id: string; trayectoria?: Trayectoria }[]).map((v) => [
      v.id,
      v.trayectoria,
    ]),
  );
  return ((declarado.vehiculos ?? []) as { id: string; trayectoria?: Trayectoria }[]).flatMap(
    (v) => {
      const tr = v.trayectoria;
      const rec = deRec.get(v.id);
      const id = base.ids[v.id];
      if (!tr?.t?.length || !rec?.t?.length || !id) return [];
      const x = enT(tr.t, tr.x, tD);
      const y = enT(tr.t, tr.y, tD);
      if (Math.hypot(x - enT(rec.t, rec.x, t), y - enT(rec.t, rec.y, t)) <= umbralM) return [];
      const r = enT(tr.t, tr.rumbo, tD);
      const [lon, lat] = avanzar(avanzar(origen, 0, y), 90, x);
      const rumbo = (((90 - (r * 180) / Math.PI) % 360) + 360) % 360;
      return [{ vehiculo: id, punto: { lat, lon }, rumbo, declarada: true as const }];
    },
  );
}

/** La trayectoria de un vehículo de la reconstrucción en el mapa, con sus tres poses (R8b). */
export interface TrayectoriaEnMapa {
  vehiculo: Id;
  /** El recorrido, en [lon, lat]. */
  puntos: [number, number][];
  /** El contorno del vehículo al inicio, en el primer impacto y en reposo, en [lon, lat]. */
  contornos: [number, number][][];
}

/**
 * Las trayectorias del solver (metros desde el primer impacto) de vuelta al mapa, para dibujar el
 * croquis del dictamen sobre las calles. Vacío si la escena no tiene posiciones en el mapa.
 */
export function trayectoriasEnMapa(base: EscenaSolver, resultado: Json): TrayectoriaEnMapa[] {
  if (!base.origen) return [];
  const origen = base.origen;
  const vs = (resultado.vehiculos ?? []) as {
    id: string;
    dimensiones?: { largo_m: number; ancho_m: number };
    trayectoria?: Trayectoria;
  }[];
  return vs.flatMap((v) => {
    const tr = v.trayectoria;
    const id = base.ids[v.id];
    if (!tr?.t?.length || !id) return [];
    const lonLat = (i: number) => desdeMetros(tr.x[i]!, tr.y[i]!, origen);
    const rumboNorte = (i: number) => (((90 - (tr.rumbo[i]! * 180) / Math.PI) % 360) + 360) % 360;
    const i0 = Math.max(
      0,
      tr.t.findIndex((t) => t >= 0),
    );
    const largo = v.dimensiones?.largo_m ?? 4.5;
    const ancho = v.dimensiones?.ancho_m ?? 1.8;
    return [
      {
        vehiculo: id,
        puntos: tr.t.map((_, i) => lonLat(i)),
        contornos: [0, i0, tr.t.length - 1].map((i) =>
          rectanguloVehiculo(lonLat(i), rumboNorte(i), largo, ancho),
        ),
      },
    ];
  });
}
