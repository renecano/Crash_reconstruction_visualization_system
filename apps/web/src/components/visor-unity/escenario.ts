/**
 * El escenario del visor Unity (ADR 0112): la vía, su decoración, el suelo, el entorno procedural, el
 * ambiente y las luminarias, calculados con las mismas funciones del croquis 2D y del visor three.js.
 * Unity solo los dibuja. Todo es determinista con la semilla de la escena.
 */
import { roadLayout, sceneCrosswalks, sceneLayout, stopLines } from "@croquis/croquis-2d";
import {
  longitudM,
  velocidadKmh,
  type EscenaSpec,
  type Escenario,
  type Resultado,
} from "@croquis/scene-schema";
import {
  actionBounds,
  brakingAt,
  buildMapRoadGeometry,
  buildRoadGeometry,
  computeGroundMarks,
  corridorsOf,
  CURB_HEIGHT,
  dashPatternFor,
  distanceToRoad,
  environmentFor,
  zoneFor,
  FACADE_PALETTE_MX,
  headlightsOn,
  lampAt,
  markingsFor,
  phaseChanges,
  planEnvironment,
  proceduralPoles,
  QUALITY_PROFILES,
  roadDecorFor,
  terrainHeightAt,
  type Mesh2D,
  type SignalPhase,
} from "@croquis/viewer/puro";

import { enElCaso, planCuadras, zonasDelCaso, type Lote } from "./cuadras";

/**
 * La malla de rayas blancas sin las de orilla: se quita todo triángulo cuyos tres vértices caen en
 * los 45 cm de adentro del borde de una misma vía. Las rayas de alto, de carril y los pasos tienen
 * vértices más adentro y se quedan.
 */
export function sinRayasDeOrilla(
  m: Mesh2D,
  corredores: readonly { a: { x: number; y: number }; b: { x: number; y: number }; half: number }[],
): Mesh2D {
  const alBorde = (i: number, c: (typeof corredores)[number]) => {
    const px = m.positions[2 * i]!;
    const py = m.positions[2 * i + 1]!;
    const dx = c.b.x - c.a.x;
    const dy = c.b.y - c.a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - c.a.x) * dx + (py - c.a.y) * dy) / l2));
    const d = Math.hypot(px - (c.a.x + t * dx), py - (c.a.y + t * dy)) - c.half;
    return d >= -0.45 && d <= 0.05;
  };
  const indices: number[] = [];
  for (let k = 0; k + 2 < m.indices.length; k += 3) {
    const tri = [m.indices[k]!, m.indices[k + 1]!, m.indices[k + 2]!];
    if (!corredores.some((c) => tri.every((i) => alBorde(i, c)))) indices.push(...tri);
  }
  return { positions: m.positions, indices };
}

/**
 * El eje de las rodadas de cada tramo de vía: dos por carril, a 0.78 m de su centro. Los carriles se
 * estiman por el ancho (3.5 m cada uno): es desgaste decorativo, no un dato del hecho.
 */
function rodadasDe(
  corredores: readonly { a: { x: number; y: number }; b: { x: number; y: number }; half: number }[],
): Escenario["via"]["rodadas"] {
  const out: Escenario["via"]["rodadas"] = [];
  for (const c of corredores) {
    const largo = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
    if (largo < 2) continue;
    const ux = (c.b.x - c.a.x) / largo;
    const uy = (c.b.y - c.a.y) / largo;
    const ancho = c.half * 2;
    const carriles = Math.max(1, Math.round(ancho / 3.5));
    for (let k = 0; k < carriles; k++) {
      const medio = -c.half + (ancho * (k + 0.5)) / carriles;
      for (const rueda of [-0.78, 0.78]) {
        const o = medio + rueda;
        out.push({
          ax: cm(c.a.x - uy * o),
          ay: cm(c.a.y + ux * o),
          bx: cm(c.b.x - uy * o),
          by: cm(c.b.y + ux * o),
        });
      }
    }
  }
  return out;
}

export const ESCENARIO_VERSION = "1.0.0" as const;

type CapaEscenario = Escenario["via"]["capas"][number];
type SueloEscenario = Escenario["suelo"][number];

const cm = (v: number) => Math.round(v * 100) / 100;
const mm = (v: number) => Math.round(v * 1000) / 1000;

function capa(nombre: CapaEscenario["nombre"], m: Mesh2D, altura: number): CapaEscenario | null {
  if (m.indices.length === 0) return null;
  return { nombre, altura_m: altura, posiciones: m.positions.map(cm), indices: m.indices };
}

/** El color de fachada por su índice en la paleta, como lo pinta el visor web (`facades.ts`). */
function colorFachada(i: number): string {
  return FACADE_PALETTE_MX[i % FACADE_PALETTE_MX.length] ?? "#d8d2c4";
}

/** Los tipos de dispositivo que tienen un objeto que dibujar (las rayas ya van en la vía). */
const DISPOSITIVOS_CON_OBJETO = new Set([
  "semaforo",
  "semaforo_peatonal",
  "alto",
  "ceda_el_paso",
  "tope",
  "limite_velocidad",
  "no_vuelta",
  "un_sentido",
  "otro",
]);

/** Los dispositivos con posición, con la luz de cada semáforo ya resuelta en el tiempo. */
function dispositivosDe(spec: EscenaSpec, resultado: Resultado, centro: { x: number; y: number }) {
  const out: Escenario["dispositivos"] = [];
  for (const d of spec.lugar.dispositivos ?? []) {
    if (!d.posicion || !DISPOSITIVOS_CON_OBJETO.has(d.tipo)) continue;
    const esSemaforo = d.tipo === "semaforo" || d.tipo === "semaforo_peatonal";
    const f = d.fases?.[0];
    const fase: SignalPhase | null =
      esSemaforo && f
        ? {
            color: f.color,
            ...(f.tiempo_en_fase ? { tiempoEnFaseS: f.tiempo_en_fase.valor } : {}),
          }
        : null;
    const luces: Escenario["dispositivos"][number]["luces"] = [];
    if (fase && fase.color !== "intermitente") {
      // La luz al inicio y en cada cambio, con las mismas reglas del visor web.
      const cortes = [
        resultado.t_inicio,
        ...phaseChanges(fase, resultado.t_inicio, resultado.t_fin),
      ];
      for (const t of cortes) {
        const luz = lampAt(fase, t + 1e-6) ?? "apagado";
        if (luces.at(-1)?.luz !== luz) luces.push({ t: mm(t), luz });
      }
    }
    // Sin orientación declarada, mira hacia afuera del cruce: de frente al flujo que llega.
    const rumbo =
      d.orientacion_deg ??
      (Math.atan2(d.posicion.y - centro.y, d.posicion.x - centro.x) * 180) / Math.PI;
    out.push({
      id: d.id,
      tipo: d.tipo as Escenario["dispositivos"][number]["tipo"],
      x: cm(d.posicion.x),
      y: cm(d.posicion.y),
      rumbo_deg: cm(rumbo),
      luces,
      intermitente: fase?.color === "intermitente",
      ...(d.limite_velocidad ? { limite_kmh: cm(velocidadKmh(d.limite_velocidad)) } : {}),
    });
  }
  return out;
}

/** Las huellas de llanta y las manchas de fluido, de las trayectorias (como el visor web). */
function marcasDe(spec: EscenaSpec, resultado: Resultado) {
  const t = (tipo: string) =>
    new Map(resultado.eventos.filter((e) => e.tipo === tipo).map((e) => [e.actores[0], e.t]));
  const reposo = t("reposo");
  const frenado = t("inicio_frenado");
  const vuelcan = new Set(
    resultado.eventos.filter((e) => e.tipo === "volcadura").flatMap((e) => e.actores),
  );
  const marcas = computeGroundMarks(
    resultado.vehiculos.map((v) => {
      const sv = spec.vehiculos.find((x) => x.id === v.id);
      return {
        id: v.id,
        clase: v.clase,
        dims: {
          length: v.dimensiones.largo_m,
          width: v.dimensiones.ancho_m,
          height: v.dimensiones.alto_m,
          wheelbase: v.dimensiones.distancia_entre_ejes_m,
        },
        track: v.trayectoria,
        tFrenado: frenado.get(v.id),
        abs: sv?.frenado?.abs?.valor ?? false,
        bloqueadas: sv?.frenado?.aplico?.valor ?? false,
        aplastamientoFrontal: (v.dano.cdc?.lado ?? "F") === "F" ? Math.max(...v.dano.perfil_m) : 0,
        tReposo: v.involucrado ? reposo.get(v.id) : undefined,
        volcado: vuelcan.has(v.id),
      };
    }),
  );
  const huellas: Escenario["huellas"] = [
    ...marcas.frenado.map((q) => ({ tipo: "frenado" as const, q })),
    ...marcas.derrape.map((q) => ({ tipo: "derrape" as const, q })),
  ].map(({ tipo, q }) => ({
    tipo,
    esquinas: q.corners.map(cm) as Escenario["huellas"][number]["esquinas"],
    t: mm(q.t),
  }));
  const manchas: Escenario["manchas"] = marcas.charcos.map((c) => ({
    x: cm(c.x),
    y: cm(c.y),
    t0: mm(c.t0),
    radio_m: cm(c.radius),
  }));
  return { huellas, manchas };
}

const EVIDENCIAS_CON_TRAZO = new Set([
  "marcas_frenado",
  "marcas_derrape",
  "restos",
  "vidrios",
  "otra",
]);

/** Los puntos de C1: el primer golpe, los choques que siguieron y los puntos de paso. */
function marcadoresDe(spec: EscenaSpec, resultado: Resultado): Escenario["marcadores"] {
  const out: Escenario["marcadores"] = [];
  const p = resultado.punto_impacto;
  if (p) out.push({ tipo: "primer_golpe", x: cm(p.x), y: cm(p.y), t: 0 });
  // Los choques después del principal: dónde estaba el primer actor en ese instante.
  for (const e of resultado.eventos) {
    if (!e.tipo.startsWith("impacto_") || e.t <= 1e-6) continue;
    const v = resultado.vehiculos.find((x) => x.id === e.actores[0]);
    if (!v) continue;
    const tr = v.trayectoria;
    let k = 0;
    while (k + 1 < tr.t.length && tr.t[k + 1]! <= e.t) k++;
    out.push({
      tipo: "choque_intermedio",
      x: cm(tr.x[k] ?? 0),
      y: cm(tr.y[k] ?? 0),
      vehiculo_id: v.id,
      t: mm(e.t),
    });
  }
  for (const v of spec.vehiculos) {
    for (const pp of v.puntos_paso ?? []) {
      out.push({
        tipo: "punto_paso",
        x: cm(pp.posicion.x),
        y: cm(pp.posicion.y),
        vehiculo_id: v.id,
        orden: pp.orden,
        ...(pp.t_s !== undefined ? { t: mm(pp.t_s) } : {}),
      });
    }
  }
  return out;
}

/** El color del caso, los faros y cuándo frena cada vehículo. */
function vehiculosDe(spec: EscenaSpec, resultado: Resultado): Escenario["vehiculos"] {
  return resultado.vehiculos.map((v) => {
    const sv = spec.vehiculos.find((x) => x.id === v.id);
    const impacto = resultado.eventos
      .filter((e) => e.tipo.startsWith("impacto_") && e.actores.includes(v.id))
      .map((e) => e.t)
      .sort((a, b) => a - b)[0];
    const entrada = {
      track: v.trayectoria,
      tFirstImpact: impacto ?? null,
      bloqueadas: sv?.frenado?.aplico?.valor ?? false,
    };
    const frenado: { desde: number; hasta: number }[] = [];
    let desde: number | null = null;
    for (const t of v.trayectoria.t) {
      const frena = brakingAt(entrada, t);
      if (frena && desde === null) desde = t;
      if (!frena && desde !== null) {
        frenado.push({ desde: mm(desde), hasta: mm(t) });
        desde = null;
      }
    }
    if (desde !== null) frenado.push({ desde: mm(desde), hasta: mm(resultado.t_fin) });
    return {
      id: v.id,
      ...(sv?.color?.hex ? { color: sv.color.hex } : {}),
      faros: headlightsOn(spec, v.id),
      frenado,
    };
  });
}

export function escenarioDe(spec: EscenaSpec, resultado: Resultado): Escenario {
  const lugar = spec.lugar;
  const layout = roadLayout(lugar);
  const mapa = sceneLayout(spec).mapa;
  const accion = actionBounds(resultado);
  const centro = { x: cm(accion.cx), y: cm(accion.cy) };

  const e = spec.entorno;
  const u = lugar.ubicacion_real;
  const env = environmentFor({
    fechaHora: e.fecha_hora?.valor,
    iluminacion: e.iluminacion?.valor,
    clima: e.clima?.valor,
    alumbrado: e.alumbrado_publico?.valor,
    lat: u?.lat,
    lon: u?.lon,
    estadoSuperficie: lugar.estado_superficie?.valor,
    visibilidadM: e.visibilidad ? longitudM(e.visibilidad) : undefined,
  });

  // La vía, igual que en el visor web: red del mapa si la hay; si no, la plantilla.
  const mainWidth = layout.strips[0]?.width ?? layout.arcs[0]?.width ?? 7;
  const crosswalks = sceneCrosswalks(lugar, mainWidth);
  const devTipos = (lugar.dispositivos ?? []).map((d) => d.tipo);
  const limite = (lugar.dispositivos ?? []).find((d) => d.limite_velocidad)?.limite_velocidad;
  const dobleSentido = lugar.sentidos.valor === "doble_sentido";
  const dash = dashPatternFor(lugar.tipo_via.valor, limite ? velocidadKmh(limite) : undefined);
  const stops = stopLines(spec, layout, mapa?.vias, crosswalks);
  const road = mapa
    ? buildMapRoadGeometry(mapa.vias, {
        crosswalks,
        stopLines: stops,
        banquetas: lugar.banquetas?.valor ?? false,
        guarniciones: lugar.guarniciones?.valor ?? false,
        dash,
      })
    : buildRoadGeometry(layout, {
        dobleSentido,
        banquetas: lugar.banquetas?.valor ?? false,
        crosswalks,
        stopLines: stops,
        dash,
        markings: markingsFor(dobleSentido, devTipos),
        guarniciones: lugar.guarniciones?.valor ?? false,
      });
  const decor = roadDecorFor(lugar, layout, mapa?.vias);
  // En una calle de colonia (urbana, de plantilla, de dos carriles a lo más y sin rayas de carril
  // declaradas en la escena) no hay raya blanca de orilla: en México casi nunca existe ahí.
  const corredoresVia = corridorsOf(layout, mapa?.vias);
  const deColonia =
    !mapa &&
    zoneFor(lugar) === "urbana" &&
    layout.strips.every((s) => s.width <= 8) &&
    !devTipos.some((t) => t === "linea_continua" || t === "linea_discontinua");
  const blancas = deColonia ? sinRayasDeOrilla(road.whiteLines, corredoresVia) : road.whiteLines;
  const capas = [
    capa("acotamiento", decor.shoulders, 0.004),
    capa("calzada", road.pavement, 0),
    capa("banqueta", road.sidewalk, CURB_HEIGHT),
    capa("camellon", road.medians, CURB_HEIGHT),
    capa("rayas_blancas", blancas, 0.012),
    capa("rayas_amarillas", road.yellowLines, 0.012),
    capa("paso_peatonal", road.crosswalks, 0.014),
  ].filter((c): c is CapaEscenario => c !== null);

  // El entorno procedural, con el tope de árboles de ultra; Unity toma menos en niveles bajos.
  const declarados = (e.objetos ?? []).filter((o) => o.tipo === "arbol").length;
  const plan = planEnvironment(lugar, layout, mapa?.vias, {
    seed: spec.meta.semilla,
    center: { x: accion.cx, y: accion.cy },
    maxTrees: Math.max(0, QUALITY_PROFILES.ultra.maxTrees - declarados),
  });
  const corredores = corridorsOf(layout, mapa?.vias);
  // Lo que recorren los vehículos del caso: el entorno procedural no pone casas ni árboles ahí (U6).
  const libres = zonasDelCaso(resultado.vehiculos);
  // En zona urbana, la calle mexicana: cuadras de lotes pegados a la banqueta y más cuadras detrás
  // (`cuadras.ts`). En rural se quedan los edificios sueltos del plan del visor web.
  const cuadras =
    plan.zone === "urbana"
      ? planCuadras(corredores, { x: accion.cx, y: accion.cy }, spec.meta.semilla, libres)
      : null;
  const edificios: Lote[] =
    cuadras?.lotes ??
    plan.buildings
      .filter(
        (b) =>
          !libres.some((z) => Math.hypot(b.x - z.x, b.y - z.y) < z.r + Math.hypot(b.w, b.d) / 2),
      )
      .map((b) => ({
        ...b,
        tipo: "casa" as const,
        remetimiento: 0,
        herreria: false,
        zaguan: false,
      }));
  const altura = terrainHeightAt(spec.meta.semilla, corredores, plan.zone);
  const seco = (x: number, y: number) =>
    1 - Math.min(1, Math.max(0, (distanceToRoad({ x, y }, corredores) - 1.2) / 4));
  const tonoEn = (x: number, y: number): number => {
    for (const p of plan.parcels) {
      let dentro = true;
      for (let i = 0; i < 4 && dentro; i++) {
        const a = p.corners[i]!;
        const b = p.corners[(i + 1) % 4]!;
        if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) dentro = false;
      }
      if (dentro) return p.tone;
    }
    return 0;
  };
  const suelo = (
    lado: number,
    segmentos: number,
    hueco?: number,
    conSeco = false,
  ): SueloEscenario => {
    const n = segmentos + 1;
    const alturas: number[] = [];
    const tonos: number[] = [];
    const secos: number[] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = accion.cx - lado / 2 + (i / segmentos) * lado;
        const y = accion.cy - lado / 2 + (j / segmentos) * lado;
        alturas.push(cm(altura(x, y)));
        tonos.push(cm(tonoEn(x, y)));
        if (conSeco) secos.push(cm(seco(x, y)));
      }
    }
    return {
      centro,
      lado_m: lado,
      segmentos,
      ...(hueco ? { hueco_m: hueco } : {}),
      alturas_m: alturas,
      tonos,
      ...(conSeco ? { seco: secos } : {}),
    };
  };

  const z = (x: number, y: number) => cm(altura(x, y));
  return {
    version: ESCENARIO_VERSION,
    semilla: spec.meta.semilla,
    procedural: true as const,
    centro,
    ambiente: {
      noche: env.night,
      mojado: env.wet,
      superficie: env.surface,
      precipitacion: env.precipitation,
      luminarias: env.streetLights,
      sol_azimut_deg: cm(env.sun.azimuth),
      sol_elevacion_deg: cm(env.sun.elevation),
      direccion_luz: [
        mm(env.lightDirection[0]),
        mm(env.lightDirection[1]),
        mm(env.lightDirection[2]),
      ],
      intensidad_sol: mm(env.sunIntensity),
      intensidad_ambiente: mm(env.ambientIntensity),
      color_cielo: env.skyColor,
      color_ambiente: env.ambientSkyColor,
      color_suelo: env.groundColor,
      densidad_niebla: env.fogDensity,
      turbidez: mm(env.turbidity),
      supuestos: env.supuestos,
    },
    via: {
      capas,
      guarniciones: road.curbs.map((c) => ({
        ax: cm(c.a.x),
        ay: cm(c.a.y),
        bx: cm(c.b.x),
        by: cm(c.b.y),
      })),
      altura_guarnicion_m: CURB_HEIGHT,
      rodadas: rodadasDe(corredoresVia),
      barreras: decor.barriers.map((b) => b.map((p) => ({ x: cm(p.x), y: cm(p.y) }))),
    },
    // Dos piezas, como el visor web (T1.3b): un parche fino de 320 m y el terreno lejano con hueco.
    suelo: [suelo(320, 96, undefined, true), suelo(2400, 80, 300)],
    entorno: {
      zona: plan.zone,
      arboles: plan.trees
        .filter((t) => !enElCaso(libres, t))
        .map((t) => ({
          x: cm(t.x),
          y: cm(t.y),
          z: z(t.x, t.y),
          tronco_m: cm(t.trunk),
          copa_m: cm(t.crown),
          rumbo_rad: mm(t.yaw),
          tipo: t.kind,
          ...(t.species ? { especie: t.species } : {}),
          ...(t.height ? { altura_m: cm(t.height) } : {}),
        })),
      edificios: edificios.map((b) => ({
        x: cm(b.x),
        y: cm(b.y),
        z: z(b.x, b.y),
        largo_m: cm(b.w),
        fondo_m: cm(b.d),
        alto_m: cm(b.h),
        rumbo_rad: mm(b.yaw),
        frente_rad: mm(b.front),
        pisos: b.floors,
        color: colorFachada(b.color),
        material: b.material,
        cortina: b.shutter,
        toldo: b.awning,
        letrero: b.sign,
        tinacos: b.tinacos,
        antena: b.antenna,
        varillas: b.rebar,
        tipo: b.tipo,
        remetimiento_m: cm(b.remetimiento),
        herreria: b.herreria,
        zaguan: b.zaguan,
      })),
      postes: [...plan.poles, ...(cuadras?.postes ?? [])].map((p) => ({
        x: cm(p.x),
        y: cm(p.y),
        z: z(p.x, p.y),
        rumbo_rad: mm(p.yaw),
      })),
      cercas: plan.fences.map((f) => ({
        ax: cm(f.a.x),
        ay: cm(f.a.y),
        bx: cm(f.b.x),
        by: cm(f.b.y),
      })),
      senales: plan.signs.map((s) => ({
        x: cm(s.x),
        y: cm(s.y),
        z: z(s.x, s.y),
        rumbo_rad: mm(s.yaw),
        tipo: s.kind,
      })),
      cerros: plan.hills.map((h) => ({
        radio_m: h.radius,
        desde_rad: mm(h.from),
        hasta_rad: mm(h.to),
        alturas_m: h.heights.map(cm),
      })),
      silueta: plan.skyline.map((s) => ({
        angulo_rad: mm(s.angle),
        abertura_rad: mm(s.span),
        alto_m: cm(s.height),
      })),
    },
    dispositivos: dispositivosDe(spec, resultado, centro),
    ...marcasDe(spec, resultado),
    evidencias: (spec.evidencias ?? [])
      .filter((ev) => EVIDENCIAS_CON_TRAZO.has(ev.tipo) && (ev.puntos?.length ?? 0) > 0)
      .map((ev) => ({
        id: ev.id,
        tipo: ev.tipo as Escenario["evidencias"][number]["tipo"],
        puntos: (ev.puntos ?? []).map((q) => ({ x: cm(q.x), y: cm(q.y) })),
      })),
    marcadores: marcadoresDe(spec, resultado),
    terreno: {
      superficies: (lugar.terreno?.superficies ?? []).map((z) => ({
        tipo: z.tipo,
        poligono: z.poligono.map((q) => ({ x: cm(q.x), y: cm(q.y) })),
      })),
      ondulaciones: (lugar.terreno?.ondulaciones ?? []).map((o) => ({
        poligono: o.poligono.map((q) => ({ x: cm(q.x), y: cm(q.y) })),
        amplitud_m: o.amplitud_m,
        longitud_onda_m: o.longitud_onda_m,
        rumbo_deg: o.rumbo_deg,
      })),
      topes: (lugar.terreno?.topes ?? []).map((tp) => ({
        ax: cm(tp.linea[0]!.x),
        ay: cm(tp.linea[0]!.y),
        bx: cm(tp.linea[1]!.x),
        by: cm(tp.linea[1]!.y),
        alto_m: tp.alto_m,
        largo_m: tp.largo_m,
      })),
    },
    vehiculos: vehiculosDe(spec, resultado),
    luminarias: proceduralPoles(spec, resultado, layout, mapa?.vias).map((p) => ({
      x: cm(p.x),
      y: cm(p.y),
      z: z(p.x, p.y),
      altura_m: p.altura_m,
      rumbo_deg: cm(p.rumbo_deg),
    })),
  };
}
