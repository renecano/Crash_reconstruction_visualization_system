/**
 * R4 (docs/cesvi/PLAN-CESVI.md): lo que obtiene Croquis de la narración sin conclusiones, contra lo
 * que concluyó CESVI en el dictamen (R0). Cada eje dice si se puede comparar y, si se puede, si
 * coincide; lo que Croquis no obtiene se cuenta como tal, no se rellena.
 *
 * - Modalidad: Croquis la infiere de la escena (vehículos, caras y dirección de los daños, objeto
 *   fijo, impactos) y de lo que dice la narración (`modalidadInferida`).
 * - Zonas de contacto: vehículo y cara, con el tercio cuando los dos lo dicen.
 * - Secuencia de impactos: participantes de cada impacto, en orden.
 * - Velocidades: las que calcula la verificación CESVI con las medidas de la narración, contra las
 *   del dictamen calculadas por deformación (error absoluto y porcentaje).
 * - Posiciones finales: si Croquis tiene la posición final de cada vehículo que describe CESVI.
 *
 * Las reglas se ajustaron con la muestra de desarrollo y se congelaron antes de medir la prueba
 * (ADR 0067).
 */
import type { Expediente, PosicionDescrita } from "./corpus";
import type { Narracion } from "./narracion";
import { verificacionCesvi } from "./verificacion";

export type Conclusiones = Narracion["conclusiones"];
type Id = Expediente["vehiculos"][number]["id"];
type Cara = string;

const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// --- Modalidad ----------------------------------------------------------------------------------

const RX_VOLCADURA =
  /\b(volc[oó]|volcadura|volcamiento|vuelco|volteo|se volte[oó]|dio vueltas|rod[oó] sobre)/;
const RX_REVERSA = /\b(revers|retroced|marcha atras|en reversa)/;
const RX_SALIDA =
  /\b(sali[oó] del camino|salida del camino|voladero|cuneta|barranc|despen|fuera del camino|sali[oó] de la carretera|sali[oó] del arroyo)/;
/** El contacto con un objeto fijo dicho como tal («contra un poste», «con la barda»), no el objeto en la vía. */
const RX_CONTRA_OBJETO =
  /\b(contra|con) (un|una|el|la|los|las|unos|unas) (poste|muro|arbol|barda|guarnicion|defensa|contencion|columna|pared|malla|reja|senal|semaforo|piedra|roca|talud|puente|caseta|fachada|cuerpo duro)/;

/** La dirección de deformación que entra por cada cara: la que deja un golpe en esa cara. */
const ENTRA: Record<string, string> = {
  frontal: "de_adelante_hacia_atras",
  posterior: "de_atras_hacia_adelante",
  lateral_izquierdo: "de_izquierda_a_derecha",
  lateral_derecho: "de_derecha_a_izquierda",
  techo: "de_arriba_hacia_abajo",
};
const PESO_MAGNITUD: Record<string, number> = { leve: 0, moderada: 1, severa: 2 };

/**
 * La cara de contacto más probable de un vehículo según sus daños (sin los previos): cada daño
 * suma 1, 2 más si su deformación entra por esa cara (la dirección de un golpe en ella) y lo que
 * pesa su magnitud. En un empate, la primera en el orden de la narración.
 */
function caraPrincipal(e: Expediente, v: Id): Cara | null {
  const puntos = new Map<Cara, number>();
  for (const d of e.danos ?? []) {
    if (d.vehiculo !== v || d.dano_previo) continue;
    const c = d.zona.cara;
    const entra = (d.direcciones ?? []).includes(ENTRA[c] as never) ? 2 : 0;
    const mag = PESO_MAGNITUD[d.magnitud?.cualitativa ?? ""] ?? 0;
    puntos.set(c, (puntos.get(c) ?? 0) + 1 + entra + mag);
  }
  let mejor: Cara | null = null;
  let n = 0;
  for (const [c, k] of puntos) if (k > n) [mejor, n] = [c, k];
  return mejor;
}

/** La cara de contacto de un vehículo en un impacto: la declarada, o la principal de sus daños. */
function caraEnImpacto(
  e: Expediente,
  imp: NonNullable<Expediente["impactos"]>[number] | undefined,
  v: Id,
) {
  return imp?.zonas?.find((z) => z.vehiculo === v)?.zona.cara ?? caraPrincipal(e, v);
}

const lateral = (c: Cara | null) => c === "lateral_izquierdo" || c === "lateral_derecho";

/** El objeto fijo del hecho: el del impacto que leyó Croquis, o el que la narración dice golpeado. */
function objetoFijo(e: Expediente, texto: string): boolean {
  return (e.impactos ?? []).some((i) => i.objeto_fijo) || RX_CONTRA_OBJETO.test(texto);
}

/**
 * La modalidad que infiere Croquis de la escena y de la narración, con el motivo en palabras.
 * null si no hay con qué. Nunca infiere «otra»: en los dictámenes es una clase de casos variados,
 * no una configuración física (ADR 0067).
 */
export function modalidadInferida(
  e: Expediente,
  narracion: string,
): { modalidad: string | null; motivo: string } {
  const texto = normal(narracion);
  const vs = e.vehiculos.map((v) => v.id);
  const impactos = [...(e.impactos ?? [])].sort((a, b) => a.orden - b.orden);
  const primero = impactos[0];
  if (vs.length === 1) {
    const v = vs[0]!;
    if (RX_VOLCADURA.test(texto))
      return { modalidad: "volcadura", motivo: "un vehículo; la narración describe un vuelco" };
    if (objetoFijo(e, texto))
      return { modalidad: "objeto_fijo", motivo: "un vehículo contra un objeto fijo" };
    if (RX_SALIDA.test(texto))
      return { modalidad: "salida_de_camino", motivo: "un vehículo que sale del camino" };
    if (caraPrincipal(e, v) === "posterior")
      return { modalidad: "alcance", motivo: "un vehículo golpeado en su parte posterior" };
    return { modalidad: null, motivo: "un vehículo, sin objeto, vuelco ni salida descritos" };
  }
  const par =
    primero && (primero.vehiculos ?? []).length >= 2
      ? primero.vehiculos!.slice(0, 2)
      : vs.slice(0, 2);
  const [a, b] = par.map((v) => caraEnImpacto(e, primero, v));
  if (!a || !b) {
    // Solo se conoce la cara de uno: la parte posterior es un alcance; un costado, un lateral.
    const una = a ?? b;
    if (una === "posterior")
      return { modalidad: "alcance", motivo: "un vehículo golpeado en su parte posterior" };
    if (lateral(una ?? null)) return { modalidad: "lateral", motivo: "contacto en un costado" };
    return { modalidad: null, motivo: "sin las caras de contacto de los dos vehículos" };
  }
  if ((a === "posterior" || b === "posterior") && RX_REVERSA.test(texto) && a !== b)
    return { modalidad: "reversa", motivo: "parte posterior, y la narración describe una reversa" };
  const caras = [a, b].sort().join("+");
  if (caras === "frontal+posterior")
    return { modalidad: "alcance", motivo: "frente contra parte posterior" };
  if (caras === "frontal+frontal") {
    // Frente contra frente, pero uno también trae la parte posterior dañada: el golpe entre ellos
    // fue por detrás y su frente pegó después (lo empujaron contra otra cosa).
    const atras = par.some((v) =>
      (e.danos ?? []).some(
        (d) => d.vehiculo === v && !d.dano_previo && d.zona.cara === "posterior",
      ),
    );
    if (atras && !primero?.zonas?.length)
      return {
        modalidad: "alcance",
        motivo: "los dos frentes dañados y uno también por detrás: golpe por detrás y empuje",
      };
    return { modalidad: "frontal", motivo: "frente contra frente" };
  }
  if (
    (a === "frontal" && lateral(b)) ||
    (b === "frontal" && lateral(a)) ||
    (lateral(a) && lateral(b))
  )
    return { modalidad: "lateral", motivo: "contacto en un costado" };
  return { modalidad: null, motivo: `caras ${a} y ${b}: sin regla` };
}

// --- Zonas, secuencia, velocidades y posiciones ---------------------------------------------------

/** Las zonas de contacto de Croquis: las de sus impactos, o la cara principal de cada vehículo. */
export function zonasCroquis(e: Expediente): { vehiculo: Id; cara: Cara; tercio: string | null }[] {
  const out = new Map<string, { vehiculo: Id; cara: Cara; tercio: string | null }>();
  for (const imp of e.impactos ?? [])
    for (const z of imp.zonas ?? [])
      out.set(`${z.vehiculo}:${z.zona.cara}`, {
        vehiculo: z.vehiculo,
        cara: z.zona.cara,
        tercio: z.zona.tercio ?? null,
      });
  for (const v of e.vehiculos) {
    if ([...out.values()].some((z) => z.vehiculo === v.id)) continue;
    const c = caraPrincipal(e, v.id);
    if (c) out.set(`${v.id}:${c}`, { vehiculo: v.id, cara: c, tercio: null });
  }
  return [...out.values()];
}

/**
 * La secuencia de impactos de Croquis: la que leyó de la narración o, si no la dice, la única
 * posible (los dos vehículos entre sí, o el vehículo contra el objeto que golpeó), marcada como
 * inferida.
 */
export function secuenciaCroquis(
  e: Expediente,
  narracion: string,
): { impactos: { vehiculos: Id[]; objeto_fijo: boolean }[]; inferida: boolean } {
  const leidos = [...(e.impactos ?? [])].sort((a, b) => a.orden - b.orden);
  if (leidos.length)
    return {
      impactos: leidos.map((i) => ({
        vehiculos: i.vehiculos ?? [],
        objeto_fijo: Boolean(i.objeto_fijo),
      })),
      inferida: false,
    };
  const vs = e.vehiculos.map((v) => v.id);
  if (vs.length === 2) return { impactos: [{ vehiculos: vs, objeto_fijo: false }], inferida: true };
  if (vs.length === 1 && objetoFijo(e, normal(narracion)))
    return { impactos: [{ vehiculos: vs, objeto_fijo: true }], inferida: true };
  return { impactos: [], inferida: false };
}

/** Las velocidades que calcula Croquis con la verificación CESVI (EBS, por deformación). */
export function velocidadesCroquis(e: Expediente): { vehiculo: Id; kmh: number; metodo: string }[] {
  return verificacionCesvi(e).flatMap((v) => {
    const ebs = v.pasos.find((p) => p.titulo.startsWith("Velocidad equivalente de barrera"));
    const kmh = ebs ? (ebs.paso.calculo as { kmh?: number }).kmh : undefined;
    return kmh === undefined ? [] : [{ vehiculo: v.vehiculo, kmh, metodo: "EBS" }];
  });
}

/** Las velocidades del dictamen calculadas por deformación (comparables con EBS). */
const RX_POR_DEFORMACION = /(energ|deform|barrera|ebs|equivalente|mchenry|aplastamiento)/;

export interface EjeModalidad {
  cesvi: string | null;
  croquis: string | null;
  motivo: string;
  coincide: boolean | null;
}
export interface EjeZonas {
  cesvi: number;
  croquis: number;
  coinciden: number;
  tercios_comparables: number;
  tercios_coinciden: number;
}
export interface EjeSecuencia {
  cesvi: number;
  croquis: number;
  primero_coincide: boolean | null;
  completa_coincide: boolean | null;
}
export interface FilaVelocidad {
  vehiculo: Id;
  cesvi_kmh: number;
  que: string;
  croquis_kmh: number | null;
  error_kmh: number | null;
  error_pct: number | null;
}
export interface EjePosiciones {
  cesvi: number;
  croquis_las_tiene: number;
}

export interface ComparacionDictamen {
  modalidad: EjeModalidad;
  zonas: EjeZonas;
  secuencia: EjeSecuencia;
  velocidades: FilaVelocidad[];
  posiciones: EjePosiciones;
}

const conjunto = (vs: readonly string[], objeto: string | null | undefined) =>
  [...new Set(vs)].sort().join(",") + (objeto ? "+objeto" : "");

/** La comparación de un dictamen: lo que obtuvo Croquis contra lo que concluyó CESVI. */
export function comparar(
  c: Conclusiones,
  e: Expediente,
  posiciones: readonly PosicionDescrita[],
  narracion: string,
): ComparacionDictamen {
  const m = modalidadInferida(e, narracion);
  const modalidad: EjeModalidad = {
    cesvi: c.modalidad,
    croquis: m.modalidad,
    motivo: m.motivo,
    coincide: c.modalidad === null ? null : m.modalidad === c.modalidad,
  };

  const mias = zonasCroquis(e);
  let coinciden = 0;
  let tc = 0;
  let tk = 0;
  for (const z of c.zonas_contacto) {
    const mia = mias.find((x) => x.vehiculo === z.vehiculo && x.cara === z.cara);
    if (!mia) continue;
    coinciden++;
    if (z.tercio && mia.tercio) {
      tc++;
      if (z.tercio === mia.tercio) tk++;
    }
  }
  const zonas: EjeZonas = {
    cesvi: c.zonas_contacto.length,
    croquis: mias.length,
    coinciden,
    tercios_comparables: tc,
    tercios_coinciden: tk,
  };

  const sc = [...c.secuencia].sort((a, b) => a.orden - b.orden);
  const sk = secuenciaCroquis(e, narracion).impactos;
  const igual = (i: number) =>
    conjunto(sc[i]!.participantes, sc[i]!.objeto_fijo) ===
    conjunto(sk[i]?.vehiculos ?? [], sk[i]?.objeto_fijo ? "objeto" : null);
  const secuencia: EjeSecuencia = {
    cesvi: sc.length,
    croquis: sk.length,
    primero_coincide: sc.length ? igual(0) : null,
    completa_coincide: sc.length ? sc.length === sk.length && sc.every((_, i) => igual(i)) : null,
  };

  const vk = velocidadesCroquis(e);
  const velocidades: FilaVelocidad[] = c.velocidades
    .filter((v) => v.vehiculo && RX_POR_DEFORMACION.test(normal(v.que)))
    .map((v) => {
      const k = vk.find((x) => x.vehiculo === v.vehiculo)?.kmh ?? null;
      return {
        vehiculo: v.vehiculo!,
        cesvi_kmh: v.kmh,
        que: v.que,
        croquis_kmh: k,
        error_kmh: k === null ? null : k - v.kmh,
        error_pct: k === null ? null : ((k - v.kmh) / v.kmh) * 100,
      };
    });

  const finales = new Set(posiciones.filter((p) => p.fase === "final").map((p) => p.vehiculo));
  const posicionesEje: EjePosiciones = {
    cesvi: c.posiciones_finales.length,
    croquis_las_tiene: c.posiciones_finales.filter((p) => finales.has(p.vehiculo)).length,
  };
  return { modalidad, zonas, secuencia, velocidades, posiciones: posicionesEje };
}

// --- Resumen y líneas base -----------------------------------------------------------------------

export interface LineasBase {
  /** La modalidad más frecuente en desarrollo. */
  modalidad: string;
  /** La más frecuente de las modalidades físicas (sin «otra») en desarrollo. */
  modalidad_fisica: string;
  /** La velocidad promedio de las calculadas por deformación en desarrollo (km/h). */
  velocidad_kmh: number;
}

/** Las líneas base del plan, con las conclusiones de desarrollo. */
export function lineasBase(desarrollo: readonly Conclusiones[]): LineasBase {
  const cuenta = new Map<string, number>();
  for (const c of desarrollo)
    if (c.modalidad) cuenta.set(c.modalidad, (cuenta.get(c.modalidad) ?? 0) + 1);
  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const modalidad = orden[0]?.[0] ?? "otra";
  const modalidad_fisica = orden.find(([m]) => m !== "otra")?.[0] ?? "alcance";
  const vs = desarrollo.flatMap((c) =>
    c.velocidades
      .filter((v) => v.vehiculo && RX_POR_DEFORMACION.test(normal(v.que)))
      .map((v) => v.kmh),
  );
  const velocidad_kmh = vs.length ? vs.reduce((a, x) => a + x, 0) / vs.length : 0;
  return { modalidad, modalidad_fisica, velocidad_kmh };
}

const tasa = (k: number, n: number) => ({ k, n, pct: n ? Math.round((1000 * k) / n) / 10 : null });
const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** El resumen de E-R4: por eje, Croquis contra CESVI y contra las líneas base. */
export function resumen(
  filas: readonly { conclusiones: Conclusiones; comparacion: ComparacionDictamen }[],
  base: LineasBase,
) {
  const conModalidad = filas.filter((f) => f.conclusiones.modalidad);
  // «Otra» es una clase de casos variados, no una configuración física: aparte, sin ella.
  const fisicas = conModalidad.filter((f) => f.conclusiones.modalidad !== "otra");
  const z = filas.map((f) => f.comparacion.zonas);
  const s = filas.map((f) => f.comparacion.secuencia).filter((x) => x.cesvi > 0);
  const v = filas.flatMap((f) => f.comparacion.velocidades);
  const vk = v.filter((x) => x.croquis_kmh !== null);
  const p = filas.map((f) => f.comparacion.posiciones);
  const porModalidad = new Map<string, { n: number; k: number }>();
  for (const f of conModalidad) {
    const key = f.conclusiones.modalidad!;
    const r = porModalidad.get(key) ?? { n: 0, k: 0 };
    r.n++;
    if (f.comparacion.modalidad.coincide) r.k++;
    porModalidad.set(key, r);
  }
  const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
  return {
    dictamenes: filas.length,
    modalidad: {
      croquis: tasa(
        conModalidad.filter((f) => f.comparacion.modalidad.coincide).length,
        conModalidad.length,
      ),
      sin_inferir: conModalidad.filter((f) => f.comparacion.modalidad.croquis === null).length,
      fisicas: {
        croquis: tasa(
          fisicas.filter((f) => f.comparacion.modalidad.coincide).length,
          fisicas.length,
        ),
        linea_base: {
          modalidad: base.modalidad_fisica,
          ...tasa(
            fisicas.filter((f) => f.conclusiones.modalidad === base.modalidad_fisica).length,
            fisicas.length,
          ),
        },
      },
      linea_base: {
        modalidad: base.modalidad,
        ...tasa(
          conModalidad.filter((f) => f.conclusiones.modalidad === base.modalidad).length,
          conModalidad.length,
        ),
      },
      por_modalidad: Object.fromEntries(
        [...porModalidad.entries()].sort().map(([k, r]) => [k, tasa(r.k, r.n)]),
      ),
    },
    zonas: {
      dictamenes_con_zonas: z.filter((x) => x.cesvi > 0).length,
      exhaustividad: tasa(sum(z.map((x) => x.coinciden)), sum(z.map((x) => x.cesvi))),
      precision: tasa(sum(z.map((x) => x.coinciden)), sum(z.map((x) => x.croquis))),
      tercio: tasa(
        sum(z.map((x) => x.tercios_coinciden)),
        sum(z.map((x) => x.tercios_comparables)),
      ),
    },
    secuencia: {
      dictamenes_con_secuencia: s.length,
      primer_impacto: tasa(s.filter((x) => x.primero_coincide).length, s.length),
      completa: tasa(s.filter((x) => x.completa_coincide).length, s.length),
      mismo_numero: tasa(s.filter((x) => x.cesvi === x.croquis).length, s.length),
    },
    velocidades: {
      del_dictamen_por_deformacion: v.length,
      croquis_calcula: vk.length,
      error_abs_mediana_kmh: mediana(vk.map((x) => Math.abs(x.error_kmh!))),
      error_pct_abs_mediana: mediana(vk.map((x) => Math.abs(x.error_pct!))),
      dentro_de_5_pct: tasa(vk.filter((x) => Math.abs(x.error_pct!) <= 5).length, vk.length),
      linea_base: {
        velocidad_kmh: Math.round(base.velocidad_kmh * 100) / 100,
        error_abs_mediana_kmh: mediana(v.map((x) => Math.abs(base.velocidad_kmh - x.cesvi_kmh))),
        error_pct_abs_mediana: mediana(
          v.map((x) => Math.abs(((base.velocidad_kmh - x.cesvi_kmh) / x.cesvi_kmh) * 100)),
        ),
      },
    },
    posiciones_finales: {
      dictamenes_con_posiciones: p.filter((x) => x.cesvi > 0).length,
      croquis_las_tiene: tasa(sum(p.map((x) => x.croquis_las_tiene)), sum(p.map((x) => x.cesvi))),
    },
  };
}
