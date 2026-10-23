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
import { fullResult, reconstruct } from "@croquis/solver-ts";
import type { Expediente } from "./corpus";
import { avanzar, desdeMetros, enMetros, rectanguloVehiculo, type LonLat } from "./geo";

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
  const impactos = [...(e.impactos ?? [])].sort((a, b) => a.orden - b.orden);
  const primero = impactos.find((i) => i.orden === 1) ?? impactos[0];
  // Los vehículos del primer impacto van primero (A, B…), como los ordena la escena v1.
  const enImpacto = (primero?.vehiculos ?? []).filter((v) => e.vehiculos.some((x) => x.id === v));
  const orden = [
    ...enImpacto,
    ...e.vehiculos.map((v) => v.id).filter((v) => !enImpacto.includes(v)),
  ];
  const vehiculos = orden.map((id) => e.vehiculos.find((v) => v.id === id)!);

  // 1. Base válida con buildSpec, con la maniobra que dice la narración (R4b): quien retrocede va en
  // reversa (avanza con la parte posterior por delante) y quien estaba detenido empieza quieto.
  const maniobraNarrada = new Map<Id, string>();
  for (const m of (e.versiones ?? []).find((v) => v.tipo === "evidencia")?.maniobras ?? []) {
    const k = MANIOBRA_ESCENA[m.tipo];
    if (k && !maniobraNarrada.has(m.vehiculo)) maniobraNarrada.set(m.vehiculo, k);
  }
  const facts = emptyFacts();
  for (const v of vehiculos) {
    const m = new Map<string, Fact>();
    if (v.clase) m.set("clase", fact(v.clase, null, "supuesto"));
    const man = maniobraNarrada.get(v.id);
    if (man) m.set("maniobra", fact(man, null, "supuesto"));
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
  for (const v of vehiculos) {
    const sv = spec.vehiculos[orden.indexOf(v.id)]!;
    if (v.masa && v.masa.unidad === "kg") {
      sv.masa = { valor: v.masa.valor, unidad: "kg", ...DEL_PERITO };
    }
    if (maniobraNarrada.has(v.id) && sv.maniobra) {
      sv.maniobra = {
        ...(sv.maniobra as Json),
        fuente: "usuario",
        confianza: 0.8,
        nota: "Lo dice la narración del perito.",
      };
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
      // En reversa llega de frente a su rumbo (avanza hacia atrás); detenido, ya está ahí.
      const d =
        man === "detenido" ? 0 : man === "reversa" ? -ANTES_DEL_IMPACTO_M : ANTES_DEL_IMPACTO_M;
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
              : man === "reversa"
                ? `${ANTES_DEL_IMPACTO_M} m delante de la posición de impacto que colocó el perito: llega en reversa.`
                : `${ANTES_DEL_IMPACTO_M} m antes de la posición de impacto que colocó el perito, en su rumbo.`,
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
  return { spec, ids, limites, origen };
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
    const r = reconstruct(spec);
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
  previa: { mejor: number; p10?: number; p50?: number; p90?: number } | null;
  impacto: { p10?: number; p50?: number; p90?: number } | null;
}

/** Un impacto reconstruido, en orden: cuándo (s; el primero es 0) y entre qué vehículos. */
export interface ImpactoReconstruido {
  numero: number;
  t: number;
  vehiculos: Id[];
}

export interface Reconstruccion extends EscenaSolver {
  /** El resultado completo del solver (trayectorias, incertidumbre, inversión, consistencia). */
  resultado: Json;
  velocidades: VelocidadReconstruida[];
  /** Los impactos que ocurrieron en la reconstrucción, en orden (más de uno en una carambola). */
  impactos: ImpactoReconstruido[];
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
  const eventos = (resultado.eventos ?? []) as {
    id: string;
    tipo: string;
    t: number;
    actores: string[];
  }[];
  const impactos = eventos
    .filter((ev) => ev.tipo.startsWith("impacto_"))
    .sort((a, b) => a.t - b.t)
    .map((ev, k) => ({
      numero: k + 1,
      t: ev.t,
      vehiculos: ev.actores.flatMap((a) => (base.ids[a] ? [base.ids[a]] : [])),
    }));
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
  const velocidades = Object.entries(base.ids).map(([sid, id]) => {
    const p = inv.parametros.find((x) => x.vehiculo === sid && x.parametro === "velocidad_previa");
    const i = inv.velocidad_impacto.find((x) => x.vehiculo === sid);
    return {
      vehiculo: id,
      previa: p?.identificable && p.estimacion ? p.estimacion : null,
      impacto: inv.evidencia.length && i ? { p10: i.p10, p50: i.p50, p90: i.p90 } : null,
    };
  });
  return { ...base, limites, resultado, velocidades, impactos, evidencia: inv.evidencia };
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
