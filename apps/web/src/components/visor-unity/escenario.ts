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
  buildMapRoadGeometry,
  buildRoadGeometry,
  corridorsOf,
  CURB_HEIGHT,
  dashPatternFor,
  distanceToRoad,
  environmentFor,
  FACADE_PALETTE_MX,
  markingsFor,
  planEnvironment,
  proceduralPoles,
  QUALITY_PROFILES,
  roadDecorFor,
  terrainHeightAt,
  type Mesh2D,
} from "@croquis/viewer/puro";

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
  const capas = [
    capa("acotamiento", decor.shoulders, 0.004),
    capa("calzada", road.pavement, 0),
    capa("banqueta", road.sidewalk, CURB_HEIGHT),
    capa("camellon", road.medians, CURB_HEIGHT),
    capa("rayas_blancas", road.whiteLines, 0.012),
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
  const suelo = (lado: number, segmentos: number, hueco?: number, conSeco = false): SueloEscenario => {
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
      direccion_luz: [mm(env.lightDirection[0]), mm(env.lightDirection[1]), mm(env.lightDirection[2])],
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
      guarniciones: road.curbs.map((c) => ({ ax: cm(c.a.x), ay: cm(c.a.y), bx: cm(c.b.x), by: cm(c.b.y) })),
      altura_guarnicion_m: CURB_HEIGHT,
      barreras: decor.barriers.map((b) => b.map((p) => ({ x: cm(p.x), y: cm(p.y) }))),
    },
    // Dos piezas, como el visor web (T1.3b): un parche fino de 320 m y el terreno lejano con hueco.
    suelo: [suelo(320, 96, undefined, true), suelo(2400, 80, 300)],
    entorno: {
      zona: plan.zone,
      arboles: plan.trees.map((t) => ({
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
      edificios: plan.buildings.map((b) => ({
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
      })),
      postes: plan.poles.map((p) => ({ x: cm(p.x), y: cm(p.y), z: z(p.x, p.y), rumbo_rad: mm(p.yaw) })),
      cercas: plan.fences.map((f) => ({ ax: cm(f.a.x), ay: cm(f.a.y), bx: cm(f.b.x), by: cm(f.b.y) })),
      senales: plan.signs.map((s) => ({ x: cm(s.x), y: cm(s.y), z: z(s.x, s.y), rumbo_rad: mm(s.yaw), tipo: s.kind })),
      cerros: plan.hills.map((h) => ({
        radio_m: h.radius,
        desde_rad: mm(h.from),
        hasta_rad: mm(h.to),
        alturas_m: h.heights.map(cm),
      })),
      silueta: plan.skyline.map((s) => ({ angulo_rad: mm(s.angle), abertura_rad: mm(s.span), alto_m: cm(s.height) })),
    },
    luminarias: proceduralPoles(spec, resultado, layout, mapa?.vias).map((p) => ({
      x: cm(p.x),
      y: cm(p.y),
      z: z(p.x, p.y),
      altura_m: p.altura_m,
      rumbo_deg: cm(p.rumbo_deg),
    })),
  };
}
