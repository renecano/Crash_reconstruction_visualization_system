/**
 * La revisión sistemática de la cadena (René, 2026-11-24: «no quiero seguir encontrando estos errores
 * yo cada vez que uso Croquis»): narración → lectura → La escena que Croquis propone sola → solver →
 * paquete 3D, con las reglas de lo que un perito vería mal. La red (búsqueda del lugar, calles y
 * objetos de OpenStreetMap, relieve) entra por `Red`, para que el corredor la guarde en disco y las
 * corridas siguientes no salgan a internet.
 *
 * La propuesta sigue los mismos pasos que La escena en el navegador (`escena-facil.tsx`): busca el
 * lugar con las mismas consultas, trae las calles de 150 m, el sentido narrado junto al lugar, y
 * `proponerEscena`. Después contesta «¿Dónde quedó?» como lo propone La escena («Como dice la
 * narración» si la narración da la distancia) y reconstruye como `useReconstruccion`.
 */
import {
  distanciaM,
  enMetros,
  escenaDeNarracion,
  especDeExpediente,
  especReconstruida,
  expedienteConTipicas,
  fichaDe,
  formato as F,
  impactosEncimados,
  interpretarResultado,
  masaDeModelo,
  OBJETO_PERSONA,
  puntoDeRelieve,
  relieveEnEscena,
  rumboDeLlegada,
  separarLugarYSentido,
  usaRelieve,
  type Expediente,
  type Reconstruccion,
  type SalidaCorpus,
} from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import { fullResult, reconstruct, reconstructionToDict, withRelief } from "@croquis/solver-ts";
import { especDel3d } from "@/components/cesvi/caso/reconstruccion";
import {
  callesDe,
  cruceNarrado,
  carreteraNarrada,
  finalDeLaNarracion,
  marcarFinal,
  nombreVehiculo,
  poseDe,
  sentidoEnElCaso,
  type Calle,
} from "@/lib/escena-facil";
import { proponerEscena, rumboDelSentido } from "@/lib/escena-propuesta";
import { RADIO_CALLES_M } from "@/lib/calles-del-mapa";
import { callesParaGuardar, conCallesGuardadas } from "@/lib/calles-guardadas";
import { impactosAColocar } from "@/lib/pasos-caso";
import { paqueteDelCaso } from "@/lib/visor-unity/paquete";
import { EN_EL_CARRIL, esObjetoDeOrilla } from "@/lib/objeto-orilla";
import { girosSinAviso } from "@/lib/giro-sin-aviso";
import { callesDelCaso, esLaCalleNarrada, lugarClaro } from "@/lib/lugar-claro";
import { crucesDeTrayectorias, saltosDe, sobreMalla, type Plano } from "@croquis/cesvi";

type Json = Record<string, unknown>;
type Punto = { lat: number; lon: number };

export interface Red {
  lugar(
    q: string,
    municipio?: string,
    estado?: string,
  ): Promise<{
    resultados: (Punto & { nombre: string; precision?: "cruce" | "calle" | "zona" })[];
    aviso: string | null;
  }>;
  calles(p: Punto): Promise<OverpassResponse | null>;
  objetos(p: Punto): Promise<OverpassResponse | null>;
  relieve(p: Punto): Promise<unknown>;
}

export interface Falla {
  regla: string;
  vehiculo?: string;
  detalle: string;
}

export interface FilaAuditoria {
  id: string;
  fuente: string;
  fallas: Falla[];
  /** Lo que dio cada vehículo y lo que dijo Croquis (sin el texto de la narración). */
  datos: Json;
}

/** Lo que dice la narración nueva que tiene que verse (data/cesvi/narraciones-auditoria). */
export interface Esperado {
  ciudad?: string;
  calles?: string[];
  cruce?: boolean;
  vehiculos?: {
    letra: string;
    clase?: string;
    sentido?: string;
    maniobra?: string;
    velocidad_narrada?: { kmh: number; tipo: string } | null;
    final?: { descripcion: string; metros: number } | null;
    huella?: { tipo: string; metros: number; antes_del_impacto: boolean } | null;
  }[];
  personas?: { rol: string }[];
  objetos?: { tipo: string }[];
  impactos?: number;
}

const MUESTRAS = { samples: 8, mcSamples: 8 };
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Lo que distingue a una calle por su nombre («avenida» y «calle» no cuentan). */
const GENERICAS = new Set(
  "avenida av calle calzada paseo boulevard blvd eje circuito carretera calz prolongacion prol del de la las los el y".split(
    " ",
  ),
);
const palabras = (s: string) =>
  sinAcentos(s)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !GENERICAS.has(w));
export const mismaCalle = (a: string, b: string) => {
  const pa = palabras(a);
  const pb = new Set(palabras(b));
  return pa.length > 0 && pa.filter((w) => pb.has(w)).length >= Math.min(2, pa.length);
};

/** Distancia (m) de un punto a una calle y el rumbo (0–180°) del tramo más cercano. */
export function aLaCalle(p: Punto, c: Calle): { m: number; rumbo: number } {
  let mejor = { m: Infinity, rumbo: 0 };
  for (let i = 1; i < c.puntos.length; i++) {
    const a = enMetros(c.puntos[i - 1]!, [p.lon, p.lat]);
    const b = enMetros(c.puntos[i]!, [p.lon, p.lat]);
    const dx = b.este - a.este;
    const dy = b.norte - a.norte;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(a.este * dx + a.norte * dy) / l2)) : 0;
    const m = Math.hypot(a.este + t * dx, a.norte + t * dy);
    if (m < mejor.m)
      mejor = { m, rumbo: ((((Math.atan2(dx, dy) * 180) / Math.PI) % 180) + 180) % 180 };
  }
  return mejor;
}
const difEje = (a: number, b: number) => {
  const d = Math.abs(((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
};
const difRumbo = (a: number, b: number) => {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
};

/** ¿Va sobre una calle real (a menos de su medio ancho más 4 m) y alineado con ella (±30°)? */
export function sobreCalle(
  p: Punto,
  rumbo: number,
  calles: readonly Calle[],
): { m: number; calle: Calle; alineada: boolean; sobre: boolean } | null {
  let cerca: { m: number; calle: Calle; alineada: boolean } | null = null;
  for (const c of calles) {
    const r = aLaCalle(p, c);
    const tope = c.ancho / 2 + 4;
    const alineada = difEje(r.rumbo, rumbo) <= 30;
    if (r.m <= tope && alineada) return { m: r.m, calle: c, alineada: true, sobre: true };
    if (!cerca || r.m < cerca.m) cerca = { m: r.m, calle: c, alineada };
  }
  return cerca ? { ...cerca, sobre: false } : null;
}

const CARDINAL: Record<string, number> = {
  sur_a_norte: 0,
  poniente_a_oriente: 90,
  norte_a_sur: 180,
  oriente_a_poniente: 270,
};

/** La cadena completa de un caso, con sus fallas. */
export async function auditarCaso(o: {
  id: string;
  fuente: string;
  narracion: string;
  salida: SalidaCorpus;
  red: Red;
  esperado?: Esperado;
  /** El lugar guardado del caso (los cinco ejemplos): no se busca. */
  lugarGuardado?: Punto & { nombre: string };
  /** Para depurar un caso: recibe el expediente final y el paquete 3D. */
  volcar?: (nombre: "expediente" | "paquete", dato: unknown) => void;
}): Promise<FilaAuditoria> {
  const fallas: Falla[] = [];
  const datos: Json = {};
  const falla = (regla: string, detalle: string, vehiculo?: string) =>
    fallas.push({ regla, detalle, ...(vehiculo ? { vehiculo } : {}) });
  let leida: ReturnType<typeof escenaDeNarracion>;
  try {
    leida = escenaDeNarracion(o.salida, o.narracion);
  } catch (e) {
    falla("lectura.error", (e as Error).message);
    return { id: o.id, fuente: o.fuente, fallas, datos };
  }
  const e0 = leida.expediente;
  const vs = e0.vehiculos;
  datos.vehiculos = vs.length;
  datos.impactos = (e0.impactos ?? []).length;

  // --- El tipo y la masa, del modelo ---
  for (const v of vs) {
    if (!v.clase) falla("vehiculo.sin_clase", "la lectura no dio el tipo de vehículo", v.id);
    if (v.modelo?.valor && !v.masa) falla("masa.sin_modelo", `${v.modelo.valor}: sin masa`, v.id);
    else if (v.modelo?.valor && v.masa?.fuente === "supuesto" && !fichaDe(v) && !masaDeModelo(v))
      falla(
        "masa.tipica_con_modelo",
        `${v.marca?.valor ?? ""} ${v.modelo.valor}: masa típica de su clase, sin ficha del modelo`,
        v.id,
      );
  }

  // --- El lugar, como lo busca La escena ---
  const lugarTexto = e0.caso.lugar?.descripcion?.valor ?? null;
  const zona = {
    municipio: e0.caso.lugar?.municipio?.valor,
    estado: e0.caso.lugar?.estado?.valor,
  };
  const cruce = cruceNarrado(o.narracion);
  const consultas = [
    separarLugarYSentido(lugarTexto).lugar,
    cruce ? `${cruce.calles[0]} y ${cruce.calles[1]}` : null,
    // Como La escena (René, 2026-11-27, #388): con un cruce narrado no se busca una calle sola.
    carreteraNarrada(o.narracion),
  ].filter((x): x is string => Boolean(x?.trim()));
  let lugar: (Punto & { nombre: string }) | null = o.lugarGuardado ?? null;
  for (const q of lugar ? [] : consultas) {
    const r = await o.red.lugar(q, zona.municipio, zona.estado).catch((x: unknown) => {
      // Un error de la red no es un lugar que no existe: se guarda para distinguirlo.
      datos.lugar_error = String((x as Error)?.message ?? x).slice(0, 200);
      return null;
    });
    // Como La escena (#388): las calles se cruzan en varios lugares y el perito elige.
    const varios = (r?.resultados ?? []).filter((x) => x.precision === "cruce");
    if (varios.length > 1) {
      datos.cruces = varios.length;
      datos.lugar_aviso = r!.aviso;
      falla(
        "pregunta.varios_cruces",
        `las calles se cruzan en ${varios.length} lugares: La escena pregunta cuál`,
      );
      return { id: o.id, fuente: o.fuente, fallas, datos };
    }
    // Como La escena: una zona (colonia, municipio) no es el lugar; se prueba la consulta siguiente.
    if (r?.resultados.length && r.resultados[0]!.precision !== "zona") {
      lugar = r.resultados[0]!;
      datos.lugar_aviso = r.aviso;
      break;
    }
    if (r?.resultados[0]?.precision === "zona") datos.lugar_zona = r.resultados[0].nombre;
  }
  datos.lugar = lugar ? { nombre: lugar.nombre, lat: lugar.lat, lon: lugar.lon } : null;
  if (!lugar) {
    // Solo la zona (la colonia, el municipio): La escena le pregunta al perito dónde fue.
    if (datos.lugar_zona)
      falla(
        "pregunta.lugar_solo_zona",
        `se encontró la zona «${String(datos.lugar_zona)}»; La escena pregunta el lugar`,
      );
    else if (datos.lugar_error)
      falla("red.lugar", `la búsqueda falló por la red: ${String(datos.lugar_error)}`);
    else falla("lugar.no_encontrado", `consultas: ${consultas.join(" | ") || "ninguna"}`);
    return { id: o.id, fuente: o.fuente, fallas, datos };
  }
  // Una carretera con kilómetro: OpenStreetMap no tiene los postes de kilómetro, así que el punto
  // cae en la carretera y La escena le pide al perito que lo lleve al kilómetro (lo dice el aviso).
  if (/OpenStreetMap no tiene el km/.test(String(datos.lugar_aviso ?? "")))
    falla(
      "pregunta.lugar_km",
      "la carretera se encontró, pero OpenStreetMap no tiene el kilómetro: La escena pide mover el punto",
    );
  const osm = await o.red.calles(lugar).catch(() => null);
  const calles = callesDe(osm);
  datos.calles = calles.length;
  if (!calles.length) falla("lugar.sin_calles", "OpenStreetMap no dio calles en 150 m");
  // Como La escena (René, 2026-11-25): si el lugar encontrado no coincide claramente con la narración,
  // no propone el choque ahí: pregunta «¿Dónde fue?» con las opciones.
  const claridad = o.lugarGuardado
    ? { clara: true, motivo: null }
    : lugarClaro({
        narradas: callesDelCaso(o.narracion, lugarTexto),
        calles,
        aviso: (datos.lugar_aviso as string | null | undefined) ?? null,
        encontrado: lugar.nombre,
      });
  if (!claridad.clara) {
    falla(
      "pregunta.lugar_dudoso",
      `se encontró «${lugar.nombre}», pero ${claridad.motivo}: La escena pregunta «¿Dónde fue?» con las opciones`,
    );
    return { id: o.id, fuente: o.fuente, fallas, datos };
  }
  // Las calles que nombra la narración, contra las del lugar.
  const narradas = [...(cruce?.calles ?? []), ...(o.esperado?.calles ?? [])];
  const nombresCerca = [
    ...new Set(
      [
        ...calles.map((c) => c.nombre),
        ...(lugar.nombre.split(",")[0]?.split(/\s+y\s+/) ?? []),
      ].filter((x): x is string => !!x),
    ),
  ];
  const faltan = narradas.filter((n) => !nombresCerca.some((c) => esLaCalleNarrada(n, c)));
  // Un lugar guardado (los ejemplos) es ilustrativo: no se compara con las calles narradas.
  if (!o.lugarGuardado && narradas.length && faltan.length === narradas.length)
    falla(
      "lugar.no_es_el_narrado",
      `ninguna de ${narradas.join(", ")} está a 150 m del lugar buscado (${lugar.nombre})`,
    );

  // --- La escena que Croquis propone sola ---
  const sentidoLugar =
    separarLugarYSentido(lugarTexto).sentido ?? separarLugarYSentido(o.narracion).sentido;
  let destino: Punto | null = null;
  if (sentidoLugar?.tipo === "destino" && sentidoLugar.destino) {
    const r = await o.red.lugar(sentidoLugar.destino).catch(() => null);
    destino = r?.resultados[0] ?? null;
  }
  const impactos = impactosAColocar(e0);
  const nombres = Object.fromEntries(vs.map((v) => [v.id, nombreVehiculo(v, vs)]));
  const prop = proponerEscena({
    expediente: e0,
    impactos,
    calles,
    narracion: o.narracion,
    lugar,
    nombreDe: (id) => nombres[id] ?? id,
    rumboNarrado: rumboDelSentido(sentidoLugar, destino, lugar),
  });
  if (!prop) {
    falla("escena.sin_propuesta", "La escena no propuso nada");
    return { id: o.id, fuente: o.fuente, fallas, datos };
  }
  // Las calles del lugar se guardan con el caso, como en la app (recorrido-caso.tsx).
  let e = osm
    ? conCallesGuardadas(prop.expediente, callesParaGuardar(osm, lugar, RADIO_CALLES_M, "overpass"))
    : prop.expediente;
  // «¿Dónde quedó?»: «Como dice la narración» si da la distancia (lo que La escena preselecciona).
  const finales = leida.posiciones.filter((p) => p.fase === "final");
  for (const n of finales) {
    const f = finalDeLaNarracion(e, n.vehiculo, n.descripcion, finales);
    if (f) e = marcarFinal(e, n.vehiculo, f.punto, f.rumbo);
    else if (/\d+(?:[.,]\d+)?\s*(?:m\b|metros)/i.test(n.descripcion))
      falla("final.no_leido", `«${n.descripcion}»`, n.vehiculo);
  }

  // Para depurar: la pose de cada uno, por dónde llega y lo que dice la propuesta.
  datos.poses = vs.map((v) => {
    const pz = poseDe(e, v.id, "impacto");
    return pz
      ? {
          v: v.id,
          lat: pz.punto.lat,
          lon: pz.punto.lon,
          frente: Math.round(pz.rumbo),
          llegada: Math.round(rumboDeLlegada(e, v.id, pz.rumbo)),
          narrado: sentidoEnElCaso(o.narracion, v, vs)?.rumbo ?? null,
        }
      : { v: v.id };
  });
  datos.impactos_leidos = (e0.impactos ?? []).map((i) => ({
    orden: i.orden,
    vehiculos: i.vehiculos,
    objeto: i.objeto_fijo ?? null,
    zonas: (i.zonas ?? []).map((z) => `${z.vehiculo}:${z.zona.cara}`),
  }));
  datos.propuesta = {
    propuestos: prop.propuestos.map((x) => x.texto),
    faltan: prop.faltan.map((x) => x.texto),
  };
  // --- Cada vehículo, sobre una calle y en el sentido narrado ---
  for (const v of vs) {
    const pose = poseDe(e, v.id, "impacto");
    if (!pose) {
      // Un vehículo que solo está en un choque posterior (o en ninguno): La escena lo deja en su
      // lista para que el perito lo marque («El choque 2 (…)»). Eso es una pregunta, no una falla.
      const enPrimero = impactos[0]?.vehiculos.includes(v.id);
      const pendiente = prop.faltan.some(
        (x) => /^El choque \d/.test(x.texto) && x.texto.includes(nombres[v.id] ?? v.id),
      );
      const enNinguno = !impactos.some((i) => i.vehiculos.includes(v.id));
      if (!enPrimero && (pendiente || enNinguno))
        falla(
          "pregunta.choque_posterior",
          enNinguno
            ? "no está en ningún choque: La escena pregunta dónde estaba"
            : "su choque no es el primero y la lectura no da sus zonas: La escena lo lista para que el perito lo marque",
          v.id,
        );
      else falla("escena.sin_pose", "La escena no lo colocó en el choque", v.id);
      continue;
    }
    const llegada = rumboDeLlegada(e, v.id, pose.rumbo);
    if (calles.length) {
      const s = sobreCalle(pose.punto, pose.rumbo, calles);
      if (s && !s.sobre) {
        // Para explicar la falla: las tres calles más cercanas, con su distancia y su rumbo.
        const cercanas = calles
          .map((c) => ({ c, r: aLaCalle(pose.punto, c) }))
          .sort((a, b) => a.r.m - b.r.m)
          .slice(0, 3)
          .map(
            (x) =>
              `${x.c.nombre ?? "sin nombre"} ${F.metros(x.r.m, 1)} a ${Math.round(x.r.rumbo)}°`,
          );
        falla(
          "vehiculo.fuera_de_calle",
          `a ${F.metros(s.m, 1)} de ${s.calle.nombre ?? "la calle más cercana"}${s.alineada ? "" : ", cruzado a ella"} (frente a ${Math.round(pose.rumbo)}°; cerca: ${cercanas.join("; ")})`,
          v.id,
        );
      }
    }
    const sn = sentidoEnElCaso(o.narracion, v, vs);
    const esperado = o.esperado?.vehiculos?.find((x) => `V${x.letra.charCodeAt(0) - 64}` === v.id);
    const narrado = sn?.rumbo ?? (esperado?.sentido ? CARDINAL[esperado.sentido] : undefined);
    // En una curva el sentido narrado es el general de la vía; en el choque puede tener otro rumbo.
    const tope =
      e0.caso.condiciones?.trazo?.valor && /curva/.test(e0.caso.condiciones.trazo.valor) ? 100 : 45;
    if (narrado !== undefined && difRumbo(llegada, narrado) > tope)
      falla(
        "vehiculo.sentido",
        `llega con rumbo ${Math.round(llegada)}°, la narración dice ${Math.round(narrado)}°`,
        v.id,
      );
  }
  // Atravesado en su calle sin que La escena lo diga (René, 2026-11-25): falla.
  for (const g of girosSinAviso({
    expediente: e,
    calles,
    propuestos: prop.propuestos.map((x) => x.texto),
    narracion: o.narracion,
    nombreDe: (id) => nombres[id] ?? id,
  }))
    falla(
      "vehiculo.girado_sin_aviso",
      `frente a ${g.frente}°, ${g.dif === null ? "sin calle cerca" : `${g.dif}° del eje`} de ${g.narrada ?? "su calle"}; La escena no lo avisa y la narración no le da una maniobra`,
      g.vehiculo,
    );
  // Nada encimado en el choque (lo que La escena avisaría).
  for (const enc of impactosEncimados(e))
    falla(
      "escena.encimados",
      `choque ${enc.orden}: ${enc.vehiculos.join(" y ")} encimados ${F.metros(enc.traslape_m, 2)}`,
    );

  // --- La reconstrucción, como useReconstruccion ---
  let r: Reconstruccion;
  let malla: unknown = null;
  try {
    let base = especDeExpediente(e, `auditoria-${o.id}`);
    malla =
      usaRelieve(e) && base.origen
        ? relieveEnEscena((await o.red.relieve(puntoDeRelieve(base.origen))) as never, base.origen)
        : null;
    r = interpretarResultado(
      base,
      fullResult(base.spec, { ...MUESTRAS, relieve: malla as never }),
      {
        relieve: malla,
      },
    );
    const e2 = expedienteConTipicas(e, r);
    if (e2) {
      e = e2;
      base = especDeExpediente(e, `auditoria-${o.id}`);
      r = interpretarResultado(
        base,
        fullResult(base.spec, { ...MUESTRAS, relieve: malla as never }),
        {
          relieve: malla,
        },
      );
    }
    // De frente casi en la misma línea (René, 2026-11-25): ¿el solver pone el choque con un vehículo
    // en movimiento todavía en su posición inicial? Así se perdía el frenado de aud-18.
    const ev0 = (base.spec.eventos as Json[] | undefined)?.find((x) =>
      String(x.tipo).startsWith("impacto_vehiculo_vehiculo"),
    );
    if (ev0) {
      const zonas = ((ev0.zonas_impacto ?? []) as Json[]).map((z) => String((z.cdc as Json)?.lado));
      const sv = (base.spec.vehiculos as Json[]).filter((v) =>
        (ev0.actores as string[]).includes(String(v.id)),
      );
      const rumbos = sv.map((v) => Number((v.posicion_inicial as Json).rumbo_deg));
      const dif = rumbos.length === 2 ? Math.abs(((rumbos[0]! - rumbos[1]! + 540) % 360) - 180) : 0;
      datos.de_frente_colineal = zonas.length === 2 && zonas.every((z) => z === "F") && dif >= 170;
      // La escena con lo declarado y el recorrido del 3D (con el frenado de las huellas).
      const animada = especReconstruida({ ...r, noCuadra: undefined });
      const sims = [base.spec, animada].map(
        (spec) =>
          reconstructionToDict(reconstruct(spec, { relieve: malla as never })) as unknown as {
            vehiculos: { id: string; trayectoria: { t: number[]; x: number[]; y: number[] } }[];
          },
      );
      for (const [sim, spec] of [
        [sims[0]!, base.spec],
        [sims[1]!, animada],
      ] as const)
        for (const v of (spec.vehiculos as Json[]).filter((x) =>
          (ev0.actores as string[]).includes(String(x.id)),
        )) {
          const vp = Number(((v.velocidad_previa ?? {}) as Json).valor ?? 0);
          if (!(vp > 0)) continue;
          const tr = sim.vehiculos.find((x) => x.id === v.id)?.trayectoria;
          if (!tr?.t.length) continue;
          let k = 0;
          tr.t.forEach((t, i) => {
            if (t <= 1e-9) k = i;
          });
          const p0 = v.posicion_inicial as Json;
          const recorrido = Math.hypot(tr.x[k]! - Number(p0.x), tr.y[k]! - Number(p0.y));
          if (recorrido < 0.5 && !fallas.some((f) => f.regla === "contacto.en_su_salida"))
            falla(
              "contacto.en_su_salida",
              `${String(v.id)} choca en su posición inicial (recorre ${F.metros(recorrido, 1)} antes del impacto)`,
              base.ids[String(v.id)],
            );
        }
    }
  } catch (x) {
    falla("solver.error", (x as Error).message.slice(0, 300));
    return { id: o.id, fuente: o.fuente, fallas, datos };
  }
  o.volcar?.("expediente", e);
  datos.velocidades = r.velocidades.map((v) => ({
    vehiculo: v.vehiculo,
    mejor: v.previa ? Math.round(v.previa.mejor) : null,
    p10: v.previa?.p10 == null ? null : Math.round(v.previa.p10),
    p90: v.previa?.p90 == null ? null : Math.round(v.previa.p90),
  }));
  if (r.noCuadra)
    for (const m of r.noCuadra.motivos)
      falla(
        /encimados/.test(m)
          ? "candado.encimados"
          : /frenar a/.test(m)
            ? "candado.frenado"
            : "candado.animacion",
        m,
      );

  // La vuelta: arranca en una calle, alineado con ella.
  const spec = r.spec as Json & { vehiculos: Json[] };
  for (const sv of spec.vehiculos) {
    const man = String(((sv.maniobra ?? {}) as Json).valor ?? "");
    if (!/vuelta/.test(man) || !r.origen || !calles.length) continue;
    const pi = sv.posicion_inicial as { x: number; y: number; rumbo_deg: number };
    const p = deEscena(r.origen, pi.x, pi.y);
    const compas = (((90 - pi.rumbo_deg) % 360) + 360) % 360;
    const s = sobreCalle(p, compas, calles);
    if (s && !s.sobre)
      falla(
        "vuelta.fuera_de_calle",
        `arranca a ${F.metros(s.m, 1)} de ${s.calle.nombre ?? "una calle"}`,
        r.ids[String(sv.id)],
      );
  }

  // Lo narrado contra la cifra: la velocidad narrada.
  for (const v of r.velocidades) {
    const ve = e.vehiculos.find((x) => x.id === v.vehiculo)?.velocidad_narrada;
    // Solo lo que dice la narración: la típica de la vía (sin velocidad narrada) es un supuesto que
    // solo pesa si la evidencia no fija la cifra, y la app no la contrapone.
    if (!ve || ve.origen !== "narración" || !v.previa) continue;
    const [lo, hi] = ve.rango_kmh;
    const fuera = v.previa.mejor < lo * 0.7 || v.previa.mejor > hi * 1.3;
    const dicho = r.limites.some(
      (l) => l.startsWith(`${v.vehiculo}: la narración dice`) || /narraci[oó]n dice/.test(l),
    );
    if (fuera && !dicho)
      falla(
        "cifra.contra_narrada_sin_aviso",
        `${Math.round(v.previa.mejor)} km/h contra ${lo}–${hi} narrados`,
        v.vehiculo,
      );
  }

  // --- Personas y objetos narrados, en la escena y en el paquete 3D ---
  let paquete: Json | null = null;
  try {
    const objetos = await o.red.objetos(lugar).catch(() => null);
    const escena = especDel3d({ ...r, relieve: malla as never }, osm, objetos) as unknown as Json;
    const parcial = reconstructionToDict(reconstruct(withRelief(escena, malla as never) as never));
    paquete = paqueteDelCaso(escena as never, parcial as never, malla as never) as unknown as Json;
    o.volcar?.("paquete", paquete);
  } catch (x) {
    falla("paquete.error", (x as Error).message.slice(0, 300));
  }
  const conPersona = (e.impactos ?? []).filter((i) => OBJETO_PERSONA.test(i.objeto_fijo ?? ""));
  const personasEsperadas = Math.max(conPersona.length, o.esperado?.personas?.length ?? 0);
  // Un ciclista también puede venir como vehículo (una bicicleta): el 3D lo dibuja igual.
  const bicicletas = e.vehiculos.filter((v) => v.clase === "bicicleta").length;
  const enEscena =
    (((paquete?.escena as Json | undefined)?.personas as unknown[] | undefined)?.length ?? 0) +
    bicicletas;
  if (personasEsperadas > 0 && enEscena < personasEsperadas)
    falla("persona.falta", `${personasEsperadas} narrada(s), ${enEscena} en el paquete 3D`);
  // El objeto del choque va en el resultado; los del lugar, en el entorno de la escena.
  const tiposPaquete = new Set(
    [
      ...(((paquete?.resultado as Json | undefined)?.objetos ?? []) as { tipo?: string }[]),
      ...((((paquete?.escena as Json | undefined)?.entorno as Json | undefined)?.objetos ?? []) as {
        tipo?: string;
      }[]),
    ].map((x) => String(x.tipo)),
  );
  // El objeto de un choque que no es el primero lo marca el perito (La escena pregunta «¿Contra qué
  // más chocó?»): eso no es una falla, es una pregunta.
  const delPrimero = (e.impactos ?? []).find((i) => (i.orden ?? 1) === 1)?.objeto_fijo;
  const objetosNarrados = [
    ...(delPrimero && !OBJETO_PERSONA.test(delPrimero) ? [delPrimero] : []),
    ...(o.esperado?.objetos ?? []).map((x) => x.tipo),
  ];
  const deOtroChoque = new Set(
    (e.impactos ?? [])
      .filter((i) => (i.orden ?? 1) > 1 && i.objeto_fijo && !OBJETO_PERSONA.test(i.objeto_fijo))
      .map((i) => sinAcentos(i.objeto_fijo!)),
  );
  for (const t of new Set(objetosNarrados.map((x) => sinAcentos(x)))) {
    const clave = /arbol/.test(t)
      ? "arbol"
      : /poste/.test(t)
        ? "poste"
        : /barda|muro|pared/.test(t)
          ? "muro"
          : /barrera|defensa|contencion/.test(t)
            ? "barrera"
            : null;
    if (
      clave &&
      ![...tiposPaquete].some((x) => x === clave || (clave === "muro" && /muro|barda/.test(x)))
    )
      falla(
        [...deOtroChoque].some(
          (x) => x.includes(clave) || (clave === "muro" && /barda|muro/.test(x)),
        )
          ? "pregunta.objeto_otro_choque"
          : "objeto.falta",
        `${t}: no está en el paquete 3D (trae ${[...tiposPaquete].join(", ") || "nada"})`,
      );
  }

  // --- Puntos 1 a 3 (René, 2026-11-24), sobre el paquete 3D que dibuja Unity ---
  if (paquete)
    revisarGeometria(paquete, { ...o, impactos: e0.impactos ?? [] }, osm, r.origen, falla);

  // --- Contra lo esperado de una narración nueva ---
  if (o.esperado) {
    const esp = o.esperado;
    if (esp.impactos !== undefined && (e.impactos ?? []).length !== esp.impactos)
      falla(
        "lectura.impactos",
        `${(e.impactos ?? []).length} impactos leídos, ${esp.impactos} narrados`,
      );
    const ciclistasComoVehiculo = Math.min(
      bicicletas,
      (esp.personas ?? []).filter((x) => x.rol === "ciclista").length,
    );
    if ((esp.vehiculos?.length ?? 0) + ciclistasComoVehiculo !== vs.length)
      falla(
        "lectura.vehiculos",
        `${vs.length} vehículos leídos, ${esp.vehiculos?.length ?? 0} narrados`,
      );
    for (const x of esp.vehiculos ?? []) {
      const id = `V${x.letra.charCodeAt(0) - 64}`;
      const v = vs.find((y) => y.id === id);
      if (!v) continue;
      if (x.velocidad_narrada && !e.vehiculos.find((y) => y.id === id)?.velocidad_narrada)
        falla(
          "lectura.velocidad_narrada",
          `${x.velocidad_narrada.tipo} ${x.velocidad_narrada.kmh} km/h no se leyó`,
          id,
        );
      const man =
        (e0.versiones ?? [])
          .find((y) => y.tipo === "evidencia")
          ?.maniobras?.filter((m) => m.vehiculo === id) ?? [];
      if (
        x.maniobra &&
        /vira|reversa/.test(x.maniobra) &&
        !man.some((m) => m.tipo === x.maniobra || m.sentido_marcha === x.maniobra)
      )
        falla(
          "lectura.maniobra",
          `${x.maniobra} no se leyó (leyó ${man.map((m) => m.tipo).join(", ") || "nada"})`,
          id,
        );
      if (x.huella) {
        const sv = spec.vehiculos.find((y) => r.ids[String(y.id)] === id);
        const huellas = ((spec.evidencias ?? []) as Json[]).filter(
          (h) =>
            (h.tipo === "marcas_frenado" || h.tipo === "marcas_derrape") &&
            h.vehiculo_id === sv?.id,
        );
        if (!huellas.length)
          falla(
            "lectura.huella",
            `${x.huella.tipo} de ${x.huella.metros} m no llegó al solver`,
            id,
          );
        else if (
          x.huella.antes_del_impacto &&
          !huellas.some(
            (h) => h.fase === "antes_impacto" || (h.tipo === "marcas_frenado" && !h.fase),
          )
        )
          falla(
            "lectura.huella_fase",
            `${x.huella.tipo} de antes del impacto quedó como de después`,
            id,
          );
      }
    }
  }
  datos.no_cuadra = Boolean(r.noCuadra);
  datos.personas_paquete = enEscena;
  datos.objetos_paquete = [...tiposPaquete];
  return { id: o.id, fuente: o.fuente, fallas, datos };
}

/** Metros de la escena del solver (x al este, y al norte, desde el origen) a latitud y longitud. */
function deEscena(origen: readonly [number, number], x: number, y: number): Punto {
  const [lon, lat] = origen;
  return {
    lat: lat + y / 111320,
    lon: lon + x / (111320 * Math.cos((lat * Math.PI) / 180)),
  };
}

export { distanciaM, especReconstruida, type Expediente };

type FallaFn = (regla: string, detalle: string, vehiculo?: string) => void;

/**
 * 1. Ningún objeto fijo de un choque sobre la calzada, salvo que la narración lo diga.
 * 2. Ninguna trayectoria cruza un edificio de OpenStreetMap ni un muro o barda (los que dibuja el 3D).
 * 3. Ningún vehículo se mueve de lado antes de su choque ni brinca de posición.
 */
function revisarGeometria(
  paquete: Json,
  o: { narracion: string; impactos?: readonly { orden?: number; objeto_fijo?: string }[] },
  osm: OverpassResponse | null,
  origen: readonly [number, number] | null,
  falla: FallaFn,
): void {
  const res = (paquete.resultado ?? {}) as Json;
  const capas = (((paquete.escenario as Json | undefined)?.via as Json | undefined)?.capas ??
    []) as { nombre: string; posiciones: number[]; indices: number[] }[];
  const calzada = capas.find((c) => c.nombre === "calzada");
  const objetos = (res.objetos ?? []) as { id: string; tipo?: string; x: number; y: number }[];
  // Solo los objetos de orilla: un bache, un registro o una roca sí están en el arroyo.
  const deOrilla = (id: string) => {
    const orden = id === "obj-1" ? 1 : Number(/^obj-choque-(\d+)$/.exec(id)?.[1] ?? NaN);
    const imp = (o.impactos ?? []).find((i) => (i.orden ?? 1) === orden);
    return Boolean(imp?.objeto_fijo && esObjetoDeOrilla(imp.objeto_fijo));
  };
  if (calzada && !EN_EL_CARRIL.test(o.narracion))
    for (const ob of objetos)
      if (/^obj-(?:1|choque-\d+)$/.test(ob.id) && deOrilla(ob.id) && sobreMalla(calzada, ob))
        falla(
          "objeto.en_carril",
          `${ob.tipo ?? "el objeto"} del choque quedó sobre la calzada (x ${F.metros(ob.x, 1)}, y ${F.metros(ob.y, 1)})`,
        );

  // Los obstáculos: los muros y bardas del 3D y los edificios de OpenStreetMap.
  const obstaculos: { nombre: string; puntos: Plano[]; cerrado: boolean }[] = [];
  const entorno = ((paquete.escena as Json | undefined)?.entorno ?? {}) as Json;
  for (const m of (entorno.objetos ?? []) as {
    id: string;
    tipo?: string;
    posicion?: { x: number; y: number };
    rumbo_deg?: number;
    largo_m?: number;
  }[]) {
    if (!/^(?:muro|barda)$/.test(String(m.tipo)) || !m.posicion || !m.largo_m) continue;
    const r = ((m.rumbo_deg ?? 0) * Math.PI) / 180;
    const ux = Math.sin(r) * (m.largo_m / 2);
    const uy = Math.cos(r) * (m.largo_m / 2);
    obstaculos.push({
      nombre: `${m.tipo} ${m.id}`,
      puntos: [
        { x: m.posicion.x - ux, y: m.posicion.y - uy },
        { x: m.posicion.x + ux, y: m.posicion.y + uy },
      ],
      cerrado: false,
    });
  }
  if (osm && origen) {
    const nodos = new Map<number, { lat: number; lon: number }>();
    for (const el of osm.elements)
      if (el.type === "node") nodos.set((el as { id: number }).id, el as never);
    for (const el of osm.elements) {
      const w = el as { type: string; id: number; nodes?: number[]; tags?: Record<string, string> };
      if (w.type !== "way" || !w.tags?.building || !w.nodes) continue;
      const puntos = w.nodes.flatMap((id) => {
        const n = nodos.get(id);
        if (!n) return [];
        const m = enMetros([n.lon, n.lat], [origen[0], origen[1]]);
        return [{ x: m.este, y: m.norte }];
      });
      if (puntos.length >= 4)
        obstaculos.push({ nombre: `edificio ${w.id}`, puntos, cerrado: true });
    }
  }
  const vehiculos = (res.vehiculos ?? []) as {
    id: string;
    dimensiones?: { largo_m: number; ancho_m: number };
    trayectoria: { t: number[]; x: number[]; y: number[]; rumbo: number[] };
  }[];
  const eventos = (res.eventos ?? []) as { t: number; tipo: string; vehiculos?: string[] }[];
  // Como la app (`conObstaculos`): lo que cruza antes de su posición inicial es la llegada recta que
  // dibuja el solver, y se dice en los límites; desde la posición inicial, no cuadra.
  const iniciales = new Map(
    (((paquete.escena as Json | undefined)?.vehiculos ?? []) as Json[]).flatMap((v) => {
      const p = v.posicion_inicial as { x?: number; y?: number; rumbo_deg?: number } | undefined;
      return p?.x !== undefined && p.y !== undefined
        ? [[String(v.id), { x: p.x, y: p.y, rumbo_deg: p.rumbo_deg ?? 0 }] as const]
        : [];
    }),
  );
  const cruces = crucesDeTrayectorias(
    vehiculos,
    obstaculos.map((x) => ({
      nombre: x.nombre,
      tipo: x.cerrado ? ("edificio" as const) : ("muro" as const),
      puntos: x.puntos,
    })),
    iniciales,
  );
  for (const c of cruces)
    falla(
      c.enLaLlegada
        ? "limite.llegada_recta"
        : c.tipo === "edificio"
          ? "trayectoria.cruza_edificio"
          : "trayectoria.cruza_muro",
      `cruza ${c.obstaculo} a los ${F.numero(c.t, 2)} s${c.enLaLlegada ? ", en la llegada recta antes de su posición inicial (los límites lo dicen)" : ""}`,
      c.vehiculo,
    );
  for (const v of vehiculos) {
    const tr = v.trayectoria;
    const choques = eventos
      .filter((x) => /^impacto/.test(x.tipo) && (!x.vehiculos || x.vehiculos.includes(v.id)))
      .map((x) => x.t);
    const primer = choques.length ? Math.min(...choques) : null;
    for (const sa of saltosDe(tr, primer))
      falla(
        "trayectoria.salto",
        `${sa.tipo === "brinco" ? "brinca" : "se mueve de lado"} a ${F.numero(sa.ms, 1)} m/s a los ${F.numero(sa.t, 2)} s${sa.tipo === "lateral" ? ", antes de su choque" : ""}`,
        v.id,
      );
  }
}
