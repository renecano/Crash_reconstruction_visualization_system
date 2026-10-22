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
 */
import { buildSpec, fact, emptyFacts, type Fact } from "@croquis/extraction";
import { fullResult } from "@croquis/solver-ts";
import type { Expediente } from "./corpus";
import { avanzar, enMetros, type LonLat } from "./geo";

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
/** Lo que el perito coloca va como declarado en la escena v1. */
const DEL_PERITO = { fuente: "usuario", confianza: 0.9 } as const;
/** Sin posición inicial del perito, el vehículo empieza 12 m antes del impacto en su rumbo. */
const ANTES_DEL_IMPACTO_M = 12;

/**
 * La zona horizontal CDC (SAE J224) de una zona del diagrama del perito: en el frente y la parte
 * posterior, L, C o R por el tercio o el vértice; en los costados, F, P o B. null si no la dice.
 */
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
}

/** La escena del solver a partir del expediente (sin correr el solver). */
export function especDeExpediente(e: Expediente, specId = "caso-nuevo"): EscenaSolver {
  const limites: string[] = [];
  const impactos = e.impactos ?? [];
  const primero = impactos.find((i) => i.orden === 1) ?? impactos[0];
  if (impactos.length > 1) {
    limites.push(
      `El expediente tiene ${impactos.length} impactos; esta reconstrucción calcula el primero. Los impactos en secuencia (carambolas) llegan con R6.`,
    );
  }
  // Los vehículos del primer impacto van primero (A, B…), como los ordena la escena v1.
  const enImpacto = (primero?.vehiculos ?? []).filter((v) => e.vehiculos.some((x) => x.id === v));
  const orden = [
    ...enImpacto,
    ...e.vehiculos.map((v) => v.id).filter((v) => !enImpacto.includes(v)),
  ];
  const vehiculos = orden.map((id) => e.vehiculos.find((v) => v.id === id)!);

  // 1. Base válida con buildSpec.
  const facts = emptyFacts();
  for (const v of vehiculos) {
    const m = new Map<string, Fact>();
    if (v.clase) m.set("clase", fact(v.clase, null, "supuesto"));
    facts.vehiculos.push(m);
  }
  for (const z of primero?.zonas ?? []) {
    const k = orden.indexOf(z.vehiculo);
    const lado = LADO[z.zona.cara];
    if (k >= 0 && lado && ["F", "B", "L", "R"].includes(lado))
      facts.zonas.set(k, fact(lado, null, "supuesto"));
  }
  const objeto = primero?.objeto_fijo
    ? (OBJETO.find(([rx]) => rx.test(primero.objeto_fijo!))?.[1] ?? "otro")
    : null;
  if (objeto) {
    facts.escalares.set("evento.objeto", fact(objeto, null, "supuesto"));
    facts.escalares.set("evento.tipo", fact("impacto_vehiculo_objeto", null, "supuesto"));
  }
  const spec = buildSpec(facts, "", { specId, origen: "escrito", sintetico: false }) as Json & {
    vehiculos: Json[];
    eventos: Json[];
    danos_declarados: Json[];
    evidencias: Json[];
  };
  const ids: Record<string, Id> = {};
  spec.vehiculos.forEach((sv, k) => (ids[String(sv.id)] = orden[k]!));
  const idEscena = (v: Id) => String(spec.vehiculos[orden.indexOf(v)]?.id);

  // 2. La evidencia del perito.
  const posiciones =
    (e.versiones ?? [])
      .find((v) => v.tipo === "evidencia")
      ?.posiciones?.filter((p) => p.fuente === "perito") ?? [];
  const deImpacto = posiciones.filter((p) => p.fase === "impacto");
  const origen: LonLat | null = deImpacto.length
    ? [
        deImpacto.reduce((a, p) => a + p.punto.lon, 0) / deImpacto.length,
        deImpacto.reduce((a, p) => a + p.punto.lat, 0) / deImpacto.length,
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
  for (const v of vehiculos) {
    const sv = spec.vehiculos[orden.indexOf(v.id)]!;
    if (v.masa && v.masa.unidad === "kg") {
      sv.masa = { valor: v.masa.valor, unidad: "kg", ...DEL_PERITO };
    }
    if (!origen) continue;
    const imp = deImpacto.find((p) => p.vehiculo === v.id);
    if (imp) {
      const { x, y } = local(imp.punto);
      const r = rumboEscena(imp.rumbo);
      const rad = (r * Math.PI) / 180;
      sv.posicion_inicial = {
        x: Math.round((x - ANTES_DEL_IMPACTO_M * Math.cos(rad)) * 1000) / 1000,
        y: Math.round((y - ANTES_DEL_IMPACTO_M * Math.sin(rad)) * 1000) / 1000,
        rumbo_deg: r,
        procedencia: {
          fuente: "supuesto",
          confianza: 0.5,
          nota: `${ANTES_DEL_IMPACTO_M} m antes de la posición de impacto que colocó el perito, en su rumbo.`,
        },
      };
    }
    const fin = posiciones.find((p) => p.vehiculo === v.id && p.fase === "final");
    if (fin)
      sv.posicion_final = {
        ...local(fin.punto),
        rumbo_deg: rumboEscena(fin.rumbo),
        procedencia: { ...DEL_PERITO },
      };
  }
  const evento = spec.eventos[0]!;
  if (origen) evento.punto_impacto = { x: 0, y: 0 };
  // La zona dentro de la cara que narró el perito (tercio o vértice) va como zona horizontal CDC:
  // con ella el solver centra el daño ahí y el 3D lo deforma en ese lugar.
  for (const z of (evento.zonas_impacto ?? []) as { vehiculo_id: string; cdc: Json }[]) {
    const id = ids[z.vehiculo_id];
    const zona = primero?.zonas?.find((x) => x.vehiculo === id)?.zona;
    const h = zona ? zonaHorizontal(zona) : null;
    if (h) z.cdc.zona_horizontal = h;
  }

  for (const d of e.danos ?? []) {
    const lado = LADO[d.zona.cara];
    const c = d.magnitud?.c_m;
    const l = d.magnitud?.l_m;
    if (!lado || !["F", "B", "L", "R"].includes(lado) || !c?.length || l === undefined) continue;
    if (!orden.includes(d.vehiculo)) continue;
    spec.danos_declarados.push({
      vehiculo_id: idEscena(d.vehiculo),
      zona: { lado },
      severidad: SEVERIDAD[d.magnitud?.cualitativa ?? ""] ?? "moderado",
      profundidad_aplastamiento: { valor: Math.max(...c), unidad: "m", ...DEL_PERITO },
      ancho_danado: { valor: l, unidad: "m", ...DEL_PERITO },
      procedencia: { ...DEL_PERITO },
    });
  }
  (e.evidencias?.huellas ?? []).forEach((h, k) => {
    if (!h.longitud || !h.vehiculo || !orden.includes(h.vehiculo) || h.tipo === "arrastre") return;
    spec.evidencias.push({
      id: `evid-huella-${k + 1}`,
      tipo: h.tipo === "frenado" ? "marcas_frenado" : "marcas_derrape",
      ...(h.tipo === "frenado" ? { fase: "antes_impacto" } : {}),
      vehiculo_id: idEscena(h.vehiculo),
      longitud: {
        valor: h.longitud.valor,
        unidad: h.longitud.unidad === "cm" ? "cm" : "m",
        ...DEL_PERITO,
      },
      procedencia: { ...DEL_PERITO },
    });
  });
  return { spec, ids, limites, origen };
}

export interface VelocidadReconstruida {
  vehiculo: Id;
  /** Lo que fija la evidencia: mejor estimación y percentiles (km/h). null si no lo fija. */
  previa: { mejor: number; p10?: number; p50?: number; p90?: number } | null;
  impacto: { p10?: number; p50?: number; p90?: number } | null;
}

export interface Reconstruccion extends EscenaSolver {
  /** El resultado completo del solver (trayectorias, incertidumbre, inversión, consistencia). */
  resultado: Json;
  velocidades: VelocidadReconstruida[];
  /** La evidencia que usó la inversión, con sus nombres del solver. */
  evidencia: string[];
}

interface Inversion {
  evidencia: string[];
  parametros: {
    parametro: string;
    vehiculo: string;
    identificable: boolean;
    estimacion?: { mejor: number; p10?: number; p50?: number; p90?: number };
  }[];
  velocidad_impacto: { vehiculo: string; p10?: number; p50?: number; p90?: number }[];
}

/**
 * Lee el resultado completo del solver (`fullResult`, en el servidor de pruebas o en el Web Worker
 * del navegador) en términos del expediente: velocidades por vehículo y lo que no fija la evidencia.
 */
export function interpretarResultado(base: EscenaSolver, resultado: Json): Reconstruccion {
  const inv = resultado.inversion as Inversion;
  const limites = [...base.limites];
  if (!inv.evidencia.length) {
    limites.push(
      "La evidencia del perito todavía no fija ninguna velocidad: coloca las posiciones de impacto y finales, o captura las medidas C y L de la deformación.",
    );
  }
  const velocidades = Object.entries(base.ids).map(([sid, id]) => {
    const p = inv.parametros.find((x) => x.vehiculo === sid && x.parametro === "velocidad_previa");
    const i = inv.velocidad_impacto.find((x) => x.vehiculo === sid);
    return {
      vehiculo: id,
      previa: p?.identificable && p.estimacion ? p.estimacion : null,
      impacto: inv.evidencia.length && i ? { p10: i.p10, p50: i.p50, p90: i.p90 } : null,
    };
  });
  return { ...base, limites, resultado, velocidades, evidencia: inv.evidencia };
}

/** La evidencia del solver en palabras («reposo:veh-a» → «posición final de V1»). */
export function evidenciaEnPalabras(etiqueta: string, ids: Record<string, Id>): string {
  const [tipo, sid] = etiqueta.split(":");
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

/** Corre el solver de producción (port TS) sobre la escena del expediente. */
export function reconstruirExpediente(e: Expediente, specId?: string): Reconstruccion {
  const base = especDeExpediente(e, specId);
  return interpretarResultado(base, fullResult(base.spec));
}

/**
 * La escena del solver con las velocidades que la inversión estimó (las que reproducen la evidencia
 * del perito), para dibujar la reconstrucción en 3D. Van con fuente «supuesto» y una nota con sus
 * percentiles: son un cálculo de Croquis, no un dato del perito. Las que la evidencia no fija quedan
 * como estaban.
 */
export function especReconstruida(r: Reconstruccion): Json {
  const spec = structuredClone(r.spec) as Json & { vehiculos: Json[] };
  for (const sv of spec.vehiculos) {
    const v = r.velocidades.find((x) => x.vehiculo === r.ids[String(sv.id)]);
    if (!v?.previa) continue;
    const { mejor, p10, p90 } = v.previa;
    sv.velocidad_previa = {
      valor: Math.round(mejor * 100) / 100,
      unidad: "km/h",
      ...(p10 !== undefined && p90 !== undefined
        ? { rango: [Math.round(p10 * 100) / 100, Math.round(p90 * 100) / 100] }
        : {}),
      fuente: "supuesto",
      confianza: 0.7,
      nota: "Velocidad que reproduce la evidencia del perito (inversión de Croquis, p10–p90 en el rango).",
    };
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
