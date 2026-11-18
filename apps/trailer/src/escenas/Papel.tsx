/**
 * La hoja del perito, de 0 a 18 s (storyboard versión 2, cuadros 1 a 4): un trazo que se vuelve calle,
 * los dos vehículos hasta el contacto, el mundo que se invierte a noche con la onda del golpe, la
 * evidencia que cae en sus casillas, y las simulaciones del solver que se reducen a una.
 *
 * Todo lo que se mueve sale de `datos/caso.json` (una escena inventada y su Resultado): la calle, las
 * trayectorias, el punto de impacto, los restos, las posiciones finales y las 256 simulaciones.
 */
import { useEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { mezclaCamaras, proyector, type Camara, type Proyector } from "../camara";
import { CASO, caminoEntre, largoDeLaCalle, poseEn, rayasDeLaCalle } from "../datos";
import { MONO, SERIF } from "../fuentes";
import {
  dibujarCuadricula,
  paleta,
  rectanguloEnPantalla,
  SENAL,
  trazarPolilinea,
  trazoDeGrafito,
  type Onda,
  type Paleta,
} from "../hoja";
import { Lienzo, type Marco } from "../Lienzo";
import { entre, FPS, mezcla, MOMENTOS, sale, suave } from "../ritmo";
import { azar } from "../texturas/azar";
import { Lapiz } from "../lapiz3d";
import { Dibujante, type AutoEnEscena, type ModeloAuto } from "../tinta3d";

const A = CASO.vehiculos[0]!;
const B = CASO.vehiculos[1]!;
const IMP = CASO.impacto;
const RAYAS = rayasDeLaCalle();
const [X0, X1] = largoDeLaCalle();
const CONTACTO = MOMENTOS.contacto;
const CENITAL = Math.PI / 2;

// --- La cámara -------------------------------------------------------------------------------------

/** La cámara en el segundo `s`. En vertical, la calle corre de abajo hacia arriba. */
export function camaraEn(s: number, vertical: boolean): Camara {
  const plano = vertical ? 0 : Math.PI / 2;
  const cen = (x: number, y: number, dist: number, giro = plano): Camara => ({
    x,
    y,
    dist,
    inclinacion: CENITAL,
    giro,
    focal: 1,
  });
  const tsim = s - CONTACTO;

  // 1 · El trazo: de la vista de plano, muy cerca, al vuelo a ras de la hoja.
  if (s < 5) {
    const k0 = cen(-47, -4.25, 8);
    const k1 = cen(-41, -4.25, 13);
    const k2: Camara = { x: -6, y: -6, dist: 30, inclinacion: 0.2, giro: 0, focal: 1 };
    if (s < 1.3) return mezclaCamaras(k0, k1, suave(entre(s, 0, 1.3)));
    return mezclaCamaras(k1, k2, suave(entre(s, 1.3, 5)));
  }
  // 2 · Los vehículos, en cortes cada vez más cortos, hasta el contacto.
  if (s < CONTACTO) {
    const a = poseEn(A, tsim);
    const b = poseEn(B, tsim);
    if (s < 5.5) return cen(a.x + 3, a.y, 17);
    if (s < 6) return cen(b.x + 2, b.y, 15);
    if (s < 6.5) return { x: a.x + 9, y: a.y - 1, dist: 15, inclinacion: 0.36, giro: 0, focal: 1 };
    if (s < 7) return cen((a.x + b.x) / 2, (a.y + b.y) / 2, 24);
    // Los tres últimos, de un sexto de segundo (5 cuadros) cada uno.
    if (s < 7 + 1 / 6) return cen(a.x + 1.5, a.y, 10.5);
    if (s < 7 + 2 / 6) return cen(b.x - 1, b.y, 10.5);
    return cen((a.x + b.x) / 2 + 1, (a.y + b.y) / 2, 9);
  }
  // El contacto: todo quieto; la cámara apenas respira.
  if (s < 9) {
    const t = sale(entre(s, CONTACTO, 9));
    return {
      x: IMP.x,
      y: IMP.y - 0.6,
      dist: mezcla(25, 31, t),
      inclinacion: mezcla(CENITAL, 1.34, t),
      giro: plano - 0.05 * t,
      focal: 1,
    };
  }
  // 3 · La evidencia: de plano, con un acercamiento lento. En horizontal, a la derecha del título.
  const ev0 = vertical ? cen(13, -7.5, 46) : cen(-5, -7.5, 46);
  const ev1 = vertical ? cen(13.5, -7.5, 42) : cen(-4, -7.5, 42);
  if (s < 13) return mezclaCamaras(ev0, ev1, entre(s, 9, 13));
  // 4 · Las simulaciones: la hoja completa; después se inclina hacia el 3D.
  // De cerca, sobre lo que pasa después del golpe: ahí es donde las simulaciones se abren.
  const todo = vertical ? cen(18, -7.5, 21) : cen(17, -7.5, 25);
  if (s < 15) return mezclaCamaras(ev1, todo, suave(entre(s, 13, 14.2)));
  const ras: Camara = { x: IMP.x - 3, y: IMP.y, dist: 30, inclinacion: 0.3, giro: 0, focal: 1 };
  const cerca: Camara = { ...ras, dist: 26 };
  if (s < 16.3) return mezclaCamaras(todo, ras, suave(entre(s, 15, 16.3)));
  return mezclaCamaras(ras, cerca, entre(s, 16.3, 18));
}

/** Cuánto es de noche (0 papel, 1 noche): el mundo se invierte en el contacto. */
export const nocheEn = (s: number): number => sale(entre(s, CONTACTO, CONTACTO + 0.2));

/** La onda del golpe en el segundo `s`. */
export function ondaEn(s: number): Onda | null {
  if (s < CONTACTO || s > 12) return null;
  return {
    x: IMP.x,
    y: IMP.y,
    radio: 48 * sale(entre(s, CONTACTO, 10.6)),
    fuerza: 2.6 * (1 - entre(s, CONTACTO, 11.5)) ** 1.5,
    grosor: 4.6,
  };
}

// --- La evidencia: seis piezas, una por pulso ----------------------------------------------------

export interface Pieza {
  rotulo: string;
  x: number;
  y: number;
  /** El vehículo cuyo contorno final se dibuja, si es una posición final. */
  contorno?: typeof A;
  mira?: boolean;
  /** Hacia dónde va el rótulo en la pantalla: arriba (−1) o abajo (1). */
  lado: -1 | 1;
}

const frenado = CASO.eventos.find((e) => e.tipo === "inicio_frenado");
const restos = CASO.evidencia.find((e) => e.tipo === "restos")?.puntos ?? [];

export const PIEZAS: Pieza[] = [
  ...(frenado
    ? [
        {
          rotulo: "inicio de frenado",
          ...poseEn(CASO.vehiculos.find((v) => v.id === frenado.actores[0]) ?? B, frenado.t),
          lado: 1 as const,
        },
      ]
    : []),
  ...restos.map((p, k) => ({ rotulo: k === 0 ? "restos" : "", x: p.x, y: p.y, lado: -1 as const })),
  { rotulo: "impacto", x: IMP.x, y: IMP.y, mira: true, lado: -1 as const },
  { rotulo: "posición final", x: A.final.x, y: A.final.y, contorno: A, lado: -1 as const },
  { rotulo: "posición final", x: B.final.x, y: B.final.y, contorno: B, lado: 1 as const },
].slice(0, MOMENTOS.piezas_de_evidencia.length);

/** Lo que el vehículo A recorrió del impacto a su reposo, en metros (del Resultado). */
export const RECORRIDO_A_M = Math.hypot(A.final.x - IMP.x, A.final.y - IMP.y);

// --- Los fragmentos del golpe (con semilla) --------------------------------------------------------

const FRAGMENTOS = (() => {
  const r = azar(7531);
  return Array.from({ length: 46 }, (_x, k) => ({
    ang: r() * Math.PI * 2,
    alcance: 5 + r() * 22,
    lado: 0.28 + r() * 0.6,
    giro0: r() * Math.PI,
    vueltas: (r() - 0.5) * 5,
    senal: r() < 0.62,
    opacidad: 0.6 + r() * 0.4,
    // Los primeros caen después en una pieza de evidencia.
    pieza: k < PIEZAS.length ? k : -1,
  }));
})();

function fragmentoEn(f: (typeof FRAGMENTOS)[number], s: number) {
  const tau = Math.max(0, s - CONTACTO);
  const r = f.alcance * (1 - Math.exp(-3.4 * tau)) + 0.3 * tau;
  let x = IMP.x + Math.cos(f.ang) * r;
  let y = IMP.y + Math.sin(f.ang) * r;
  let giro = f.giro0 + f.vueltas * (1 - Math.exp(-2.2 * tau));
  let lado = f.lado;
  let opacidad = f.opacidad;
  let cae = 0;
  if (f.pieza >= 0) {
    const pieza = PIEZAS[f.pieza]!;
    cae = sale(
      entre(
        s,
        MOMENTOS.piezas_de_evidencia[f.pieza]! - 0.3,
        MOMENTOS.piezas_de_evidencia[f.pieza]!,
      ),
    );
    // Cae en la casilla de un metro que contiene el punto.
    x = mezcla(x, Math.floor(pieza.x) + 0.5, cae);
    y = mezcla(y, Math.floor(pieza.y) + 0.5, cae);
    giro = mezcla(giro, 0, cae);
    lado = mezcla(lado, 1, cae);
    opacidad = mezcla(opacidad, 1, cae);
  } else opacidad *= 1 - entre(s, 9.2, 12.4);
  return { x, y, giro, lado, opacidad, cae };
}

// --- El dibujo -----------------------------------------------------------------------------------

/** La raya con que abre el tráiler: la del carril por el que viene el vehículo A. */
const TRAZO_Y = RAYAS.reduce((mejor, r) =>
  r.tipo === "carril" && Math.abs(r.y - -4.25) < Math.abs(mejor.y - -4.25) ? r : mejor,
).y;

/** Hasta dónde va el trazo: cruza la pantalla en el primer segundo y después corre al horizonte. */
function frenteDelTrazo(s: number): number {
  if (s >= 5) return X1;
  if (s < 1.2) return mezcla(-55.5, -37, suave(entre(s, 0.12, 1.2)));
  return mezcla(-37, X1, suave(entre(s, 1.2, 4.7)));
}

function calle(
  m: Marco,
  p: Proyector,
  pal: Paleta,
  s: number,
  onda: Onda | null,
  /** Cuánto se ven las rayas (1 normal): bajan donde va el título, para que no compitan con él. */
  fuerza = 1,
) {
  const { ctx, u } = m;
  ctx.save();
  ctx.strokeStyle = pal.tinta;
  ctx.lineCap = "round";
  let frente: { x: number; y: number } | null = null;
  RAYAS.forEach((raya, k) => {
    // La primera raya es el trazo con que abre el tráiler; las demás salen después, una tras otra.
    const primera = raya.y === TRAZO_Y;
    const desde = 1.5 + 0.22 * k;
    const hasta = primera
      ? frenteDelTrazo(s)
      : X0 + (X1 - X0) * (s >= 5 ? 1 : suave(entre(s, desde, desde + 2.6)));
    const avance = (hasta - X0) / (X1 - X0);
    if (avance <= 0) return;
    const opacidad = (raya.tipo === "carril" ? 0.8 : 0.96) * fuerza;
    const grueso = (raya.tipo === "orilla" ? 3.8 : primera ? 3.8 : 3) * u;
    if (raya.tipo === "carril" && !(primera && s < 5)) {
      // Raya discontinua: 3 m de raya, 4.5 m de hueco. (La del trazo inicial va corrida mientras se
      // dibuja; al cortar a la siguiente escena ya es una raya de carril.)
      for (let x = X0; x < hasta; x += 7.5)
        trazoDeGrafito(
          ctx,
          p,
          [
            [x, raya.y],
            [Math.min(x + 3, hasta), raya.y],
          ],
          { grueso, opacidad, semilla: k * 17 + Math.round(x), onda },
        );
    } else {
      const pts: [number, number][] = [];
      for (let x = X0; x < hasta; x += 4) pts.push([x, raya.y]);
      pts.push([hasta, raya.y]);
      trazoDeGrafito(ctx, p, pts, { grueso, opacidad, semilla: k * 17, onda });
    }
    if (primera && avance < 1) frente = { x: hasta, y: raya.y };
  });
  ctx.restore();
  return frente as { x: number; y: number } | null;
}

function lapiz(m: Marco, p: Proyector, en: { x: number; y: number }, opacidad: number) {
  const q = p.punto(en.x, en.y);
  if (!q || opacidad <= 0) return;
  const { ctx, u } = m;
  ctx.save();
  ctx.globalAlpha = opacidad;
  ctx.translate(q.x, q.y);
  ctx.rotate(-0.98);
  // La punta, la madera y el cuerpo.
  ctx.fillStyle = "#15181B";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(34 * u, -12 * u);
  ctx.lineTo(34 * u, 12 * u);
  ctx.fill();
  ctx.fillStyle = "#C6BFAE";
  ctx.fillRect(34 * u, -12 * u, 44 * u, 24 * u);
  ctx.fillStyle = SENAL;
  ctx.fillRect(78 * u, -12 * u, 620 * u, 24 * u);
  ctx.fillStyle = "#FF8A5E";
  ctx.fillRect(78 * u, -12 * u, 620 * u, 7 * u);
  ctx.restore();
}

function vehiculo(
  m: Marco,
  p: Proyector,
  v: typeof A,
  pose: { x: number; y: number; rumbo: number },
  color: string,
  fondo: string,
  opacidad: number,
  onda: Onda | null,
) {
  const caja = rectanguloEnPantalla(p, pose.x, pose.y, pose.rumbo, v.largo, v.ancho, onda);
  if (!caja) return;
  const { ctx } = m;
  const poligono = (q: { x: number; y: number }[]) => {
    ctx.beginPath();
    q.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.closePath();
  };
  ctx.save();
  ctx.globalAlpha = opacidad;
  ctx.fillStyle = color;
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = p.pxPorMetro(p.punto(pose.x, pose.y)?.prof ?? 30) * 0.62;
  poligono(caja);
  ctx.fill();
  ctx.stroke();
  // El parabrisas: dice hacia dónde va.
  const c = Math.cos(pose.rumbo);
  const sn = Math.sin(pose.rumbo);
  const cristal = rectanguloEnPantalla(
    p,
    pose.x + c * v.largo * 0.17,
    pose.y + sn * v.largo * 0.17,
    pose.rumbo,
    v.largo * 0.2,
    v.ancho * 0.72,
    onda,
  );
  if (cristal) {
    ctx.globalAlpha = opacidad * 0.55;
    ctx.fillStyle = fondo;
    poligono(cristal);
    ctx.fill();
  }
  ctx.restore();
}

function circuloDelMundo(m: Marco, p: Proyector, x: number, y: number, radio: number) {
  const { ctx } = m;
  ctx.beginPath();
  let abierto = false;
  for (let k = 0; k <= 96; k++) {
    const a = (k / 96) * Math.PI * 2;
    const q = p.punto(x + Math.cos(a) * radio, y + Math.sin(a) * radio);
    if (!q) {
      abierto = false;
      continue;
    }
    if (abierto) ctx.lineTo(q.x, q.y);
    else ctx.moveTo(q.x, q.y);
    abierto = true;
  }
  ctx.stroke();
}

/** Qué modelo de la app lleva cada clase de vehículo de la escena. */
const MODELO_DE: Record<string, string> = {
  sedan_compacto: "sedan",
  sedan_mediano: "sedan",
  microbus_combi: "combi",
};

function dibuja(m: Marco, vertical: boolean, tinta: Dibujante | null, lapiz3d: Lapiz | null) {
  const { ctx, ancho, alto, u, cuadro } = m;
  const s = cuadro / FPS;
  const cam = camaraEn(s, vertical);
  const p = proyector(cam, { ancho, alto });
  const noche = nocheEn(s);
  const pal = paleta(noche);
  const onda = ondaEn(s);
  const cenital = cam.inclinacion > 1.2;

  // El fondo y el horizonte.
  ctx.fillStyle = pal.fondo;
  ctx.fillRect(0, 0, ancho, alto);

  // La cuadrícula.
  dibujarCuadricula(ctx, p, {
    cx: cenital ? cam.x : p.ojo[0] + Math.cos(cam.giro) * 60,
    cy: cenital ? cam.y : p.ojo[1] + Math.sin(cam.giro) * 60,
    alcance: cenital ? cam.dist * (vertical ? 1.15 : 1.05) : 110,
    paso: 1,
    color: pal.linea,
    opacidad: mezcla(0.72, 0.5, noche),
    grosor: 1.8 * u,
    onda,
    niebla: cenital ? 4000 : 150,
  });
  // De cerca, el milimetrado fino: cinco divisiones por metro.
  if (cam.dist < 34)
    dibujarCuadricula(ctx, p, {
      cx: cenital ? cam.x : p.ojo[0] + Math.cos(cam.giro) * 10,
      cy: cenital ? cam.y : p.ojo[1] + Math.sin(cam.giro) * 10,
      alcance: cenital ? cam.dist * (vertical ? 1.15 : 1.05) : 16,
      paso: 0.2,
      color: pal.linea,
      opacidad: mezcla(0.4, 0.26, noche) * (1 - entre(cam.dist, 22, 34)),
      grosor: 1.2 * u,
      onda,
      niebla: cenital ? 4000 : 26,
    });
  // A ras de la hoja, el horizonte se funde con el fondo.
  if (p.horizonte !== null && p.horizonte > -alto) {
    const h = Math.max(0, p.horizonte);
    const g = ctx.createLinearGradient(0, h, 0, h + alto * 0.16);
    g.addColorStop(0, pal.fondo);
    g.addColorStop(1, pal.fondo.replace("rgb(", "rgba(").replace(")", ",0)"));
    ctx.fillStyle = pal.fondo;
    ctx.fillRect(0, 0, ancho, h);
    ctx.fillStyle = g;
    ctx.fillRect(0, h, ancho, alto * 0.16);
  }

  // La calle, a lápiz.
  // Donde va «Cada choque deja evidencia», las rayas bajan y una zona limpia de la hoja deja el texto
  // sin nada que compita con él (René, 2026-11-17: el texto se confundía con los carriles).
  const titulo = sale(entre(s, 9.05, 9.5)) * (1 - entre(s, 12.6, 13));
  const frente = calle(m, p, pal, s, onda, 1 - 0.5 * titulo);
  if (titulo > 0) {
    const cx = vertical ? ancho / 2 : 104 * u + 430 * u;
    const cy = vertical ? 150 * u + 125 * u : 250 * u + 135 * u;
    const radio = (vertical ? 660 : 820) * u;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(vertical ? 1.15 : 1.3, vertical ? 0.62 : 0.78);
    const zona = ctx.createRadialGradient(0, 0, 0, 0, 0, radio);
    const fondo = pal.fondo.replace("rgb(", "rgba(");
    zona.addColorStop(0, fondo.replace(")", `,${0.97 * titulo})`));
    zona.addColorStop(0.62, fondo.replace(")", `,${0.9 * titulo})`));
    zona.addColorStop(1, fondo.replace(")", ",0)"));
    ctx.fillStyle = zona;
    ctx.fillRect(-radio, -radio, radio * 2, radio * 2);
    ctx.restore();
  }

  // 4 · Las simulaciones del solver: cada línea, una simulación; aparecen del reposo hacia atrás.
  if (s >= 13) {
    const crece = suave(entre(s, 13, 14.9));
    const queda = mezcla(1, 0.22, entre(s, MOMENTOS.la_que_cabe - 0.5, MOMENTOS.la_que_cabe + 0.2));
    const muestras = CASO.simulaciones.muestras;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgb(150,175,220)";
    ctx.lineWidth = 1.5 * u;
    ctx.fillStyle = "rgb(190,208,238)";
    muestras.forEach((muestra, i) => {
      const visible = Math.min(1, Math.max(0, crece * 1.35 - 0.35 * (i / muestras.length)));
      if (visible <= 0) return;
      for (const camino of muestra.caminos) {
        // Del reposo hacia atrás: el tiempo corre al revés.
        const alReves = camino.slice().reverse() as [number, number][];
        ctx.globalAlpha = 0.13 * queda;
        trazarPolilinea(ctx, p, alReves, visible);
        // Dónde quedó en esa simulación.
        const fin = p.punto(alReves[0]![0], alReves[0]![1]);
        if (fin) {
          ctx.globalAlpha = 0.5 * queda * Math.min(1, visible * 6);
          ctx.beginPath();
          ctx.arc(fin.x, fin.y, 2.6 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    ctx.restore();
    // La que cabe con todo: la del Resultado.
    const sola = suave(entre(s, MOMENTOS.la_que_cabe - 0.5, MOMENTOS.la_que_cabe + 0.4));
    if (sola > 0) {
      ctx.save();
      ctx.strokeStyle = SENAL;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = SENAL;
      ctx.shadowBlur = 22 * u;
      ctx.lineWidth = 5 * u;
      for (const v of [A, B])
        trazarPolilinea(ctx, p, caminoEntre(v, CASO.t_inicio, CASO.t_fin), sola);
      ctx.restore();
    }
  }

  // 3 · La evidencia que ya cayó: contornos finales, la mira del impacto y la medida.
  if (s >= 9) {
    PIEZAS.forEach((pieza, k) => {
      const t = entre(s, MOMENTOS.piezas_de_evidencia[k]!, MOMENTOS.piezas_de_evidencia[k]! + 0.25);
      if (t <= 0) return;
      ctx.save();
      ctx.globalAlpha = t;
      if (pieza.contorno) {
        const caja = rectanguloEnPantalla(
          p,
          pieza.x,
          pieza.y,
          (pieza.contorno.final.rumbo_deg * Math.PI) / 180,
          pieza.contorno.largo,
          pieza.contorno.ancho,
        );
        if (caja) {
          ctx.strokeStyle = pal.tinta;
          ctx.lineWidth = 2.4 * u;
          ctx.setLineDash([10 * u, 8 * u]);
          ctx.beginPath();
          caja.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
          ctx.closePath();
          ctx.stroke();
        }
      }
      if (pieza.mira) {
        ctx.strokeStyle = SENAL;
        ctx.lineWidth = 3 * u;
        circuloDelMundo(m, p, pieza.x, pieza.y, 1.6);
        ctx.globalAlpha = t * 0.4;
        ctx.lineWidth = 1.5 * u;
        circuloDelMundo(m, p, pieza.x, pieza.y, 6.5);
      }
      ctx.restore();
    });
    // La medida: del impacto al reposo de A.
    const med = entre(
      s,
      MOMENTOS.piezas_de_evidencia[4] ?? 11.5,
      (MOMENTOS.piezas_de_evidencia[4] ?? 11.5) + 0.4,
    );
    if (med > 0 && s < 15) {
      ctx.save();
      ctx.globalAlpha = 0.7 * med * (1 - entre(s, 13, 13.6));
      ctx.strokeStyle = pal.linea;
      ctx.lineWidth = 1.6 * u;
      ctx.setLineDash([4 * u, 8 * u]);
      trazarPolilinea(
        ctx,
        p,
        [
          [IMP.x, IMP.y],
          [A.final.x, A.final.y],
        ],
        med,
      );
      ctx.restore();
    }
  }

  // Los vehículos: en marcha hasta el contacto; después, quietos en el instante del golpe.
  if (s >= 5 && s < 16.6) {
    const tsim = Math.min(0, s - CONTACTO);
    const tenue = s < 9 ? 1 : mezcla(1, 0.3, entre(s, 9, 9.6)) * (1 - entre(s, 15, 15.6));
    const autos: AutoEnEscena[] = [];
    if (tenue > 0)
      for (const v of [B, A]) {
        const pose = poseEn(v, tsim);
        // En marcha, las líneas de velocidad: lo que recorrió en el último cuarto de segundo.
        if (s < CONTACTO) {
          const antes = poseEn(v, tsim - 0.28);
          ctx.save();
          ctx.strokeStyle = pal.tinta;
          ctx.lineCap = "round";
          for (const [lado, largo, alfa] of [
            [-0.34, 1, 0.5],
            [0, 0.72, 0.3],
            [0.34, 1, 0.5],
          ] as const) {
            const nx = -Math.sin(pose.rumbo) * lado * v.ancho;
            const ny = Math.cos(pose.rumbo) * lado * v.ancho;
            const cola = {
              x: pose.x - Math.cos(pose.rumbo) * v.largo * 0.56,
              y: pose.y - Math.sin(pose.rumbo) * v.largo * 0.56,
            };
            ctx.globalAlpha = alfa;
            ctx.lineWidth = 2.2 * u;
            trazarPolilinea(ctx, p, [
              [cola.x + nx, cola.y + ny],
              [cola.x + nx + (antes.x - pose.x) * largo, cola.y + ny + (antes.y - pose.y) * largo],
            ]);
          }
          ctx.restore();
        }
        if (tinta && MODELO_DE[v.clase]) {
          // La sombra sobre el papel: suave y un poco corrida hacia donde no da la luz.
          const sombra = rectanguloEnPantalla(
            p,
            pose.x + 0.45,
            pose.y - 0.5,
            pose.rumbo,
            v.largo,
            v.ancho,
          );
          if (sombra) {
            ctx.save();
            ctx.filter = `blur(${9 * u}px)`;
            ctx.globalAlpha = mezcla(0.2, 0.42, noche) * tenue;
            ctx.fillStyle = "#000";
            ctx.beginPath();
            sombra.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          autos.push({
            id: v.id,
            clave: MODELO_DE[v.clase]!,
            x: pose.x,
            y: pose.y,
            rumbo: pose.rumbo,
            largo: v.largo,
            ancho: v.ancho,
            opacidad: tenue,
          });
        } else vehiculo(m, p, v, pose, pal.vehiculo, pal.fondo, tenue, onda);
      }
    // Los modelos 3D de la app, dibujados en tinta con la misma cámara de la hoja.
    if (tinta && autos.length)
      tinta.dibujar(ctx, cam, { ancho, alto }, autos, {
        tinta: pal.tinta,
        papel: pal.fondo,
        pluma: 2.6,
      });
  }

  // El golpe: anillos, destello y fragmentos.
  if (s >= CONTACTO && s < 13.4) {
    const tau = s - CONTACTO;
    if (onda) {
      ctx.save();
      ctx.strokeStyle = SENAL;
      const vivo = 1 - entre(s, CONTACTO, 10.4);
      ctx.globalAlpha = vivo;
      ctx.lineWidth = 6 * u;
      circuloDelMundo(m, p, IMP.x, IMP.y, onda.radio);
      ctx.globalAlpha = vivo * 0.6;
      ctx.lineWidth = 2.4 * u;
      circuloDelMundo(m, p, IMP.x, IMP.y, onda.radio * 0.52);
      ctx.globalAlpha = vivo * 0.4;
      ctx.lineWidth = 1.5 * u;
      circuloDelMundo(m, p, IMP.x, IMP.y, onda.radio * 1.45);
      ctx.restore();
    }
    const q = p.punto(IMP.x, IMP.y);
    const brillo = 1 - entre(tau, 0, 1.1);
    if (q && brillo > 0) {
      const r = (150 + 260 * sale(entre(tau, 0, 0.5))) * u;
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
      g.addColorStop(0, `rgba(255,244,236,${0.95 * brillo})`);
      g.addColorStop(0.3, `rgba(255,138,94,${0.7 * brillo})`);
      g.addColorStop(1, "rgba(255,91,46,0)");
      ctx.fillStyle = g;
      ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
    }
    for (const f of FRAGMENTOS) {
      const e = fragmentoEn(f, s);
      if (e.opacidad <= 0.01) continue;
      const caja = rectanguloEnPantalla(
        p,
        e.x,
        e.y,
        e.giro,
        e.lado,
        e.lado,
        e.cae > 0.5 ? null : onda,
      );
      if (!caja) continue;
      ctx.globalAlpha = e.opacidad * (f.pieza >= 0 ? 1 : 1 - entre(s, 12.4, 13));
      ctx.fillStyle = f.senal || f.pieza >= 0 ? SENAL : pal.tinta;
      ctx.beginPath();
      caja.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (s >= 13.4 && s < 16.6) {
    // Las piezas de evidencia se quedan en su casilla mientras corren las simulaciones.
    ctx.fillStyle = SENAL;
    ctx.globalAlpha = 0.85 * (1 - entre(s, 15.6, 16.4));
    PIEZAS.forEach((pieza) => {
      const caja = rectanguloEnPantalla(
        p,
        Math.floor(pieza.x) + 0.5,
        Math.floor(pieza.y) + 0.5,
        0,
        1,
        1,
      );
      if (!caja) return;
      ctx.beginPath();
      caja.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
      ctx.closePath();
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // El lápiz, mientras traza.
  if (frente && s < 5) {
    const opacidad = 1 - entre(s, 4.3, 4.9);
    if (lapiz3d)
      // El vaivén de la mano: el lápiz nunca está del todo quieto.
      lapiz3d.dibujar(
        ctx,
        cam,
        { ancho, alto },
        {
          x: frente.x,
          y: frente.y + 0.012 * cam.dist * (Math.sin(s * 9.1) * 0.5 + Math.sin(s * 23.7) * 0.2),
          tamano: mezcla(0.66, 0.42, suave(entre(s, 1.3, 4.4))),
          elevacion: 0.86 + 0.035 * Math.sin(s * 5.3) + 0.02 * Math.sin(s * 13.1 + 1),
          azimut: 0.68 + 0.06 * Math.sin(s * 4.1 + 2) + 0.025 * Math.sin(s * 11.3),
          giro: 0.5 + 0.3 * Math.sin(s * 2.2),
          opacidad,
        },
      );
    else lapiz(m, p, frente, opacidad);
  }

  // Abre desde negro, y el contacto es un destello de tres cuadros.
  const negro = 1 - sale(entre(s, 0, 0.5));
  if (negro > 0) {
    ctx.fillStyle = `rgba(0,0,0,${negro})`;
    ctx.fillRect(0, 0, ancho, alto);
  }
  const blanco = s >= CONTACTO ? Math.max(0, 0.9 - (s - CONTACTO) * FPS * 0.3) : 0;
  if (blanco > 0) {
    ctx.fillStyle = `rgba(255,246,238,${blanco})`;
    ctx.fillRect(0, 0, ancho, alto);
  }
}

// --- La escena -----------------------------------------------------------------------------------

export function Papel({ modelos }: { modelos: Record<string, ModeloAuto> | null }) {
  // Los modelos de los vehículos: el render espera a que estén cargados.
  const [tinta, setTinta] = useState<Dibujante | null>(null);
  const espera = useRef<number | null>(null);
  useEffect(() => {
    if (!modelos) return;
    espera.current = delayRender("Cargando los modelos de los vehículos");
    const d = new Dibujante();
    d.cargar(
      Object.fromEntries(
        Object.entries(modelos).map(([k, mo]) => [k, { url: staticFile(mo.archivo), modelo: mo }]),
      ),
    )
      .then(() => setTinta(d))
      .catch((e: unknown) => cancelRender(e));
  }, [modelos]);
  // Ya con el dibujante puesto (y la hoja vuelta a dibujar con él), el render sigue.
  useEffect(() => {
    if (tinta && espera.current !== null) {
      continueRender(espera.current);
      espera.current = null;
    }
  }, [tinta]);
  // El lápiz se modela en código: no hay nada que cargar.
  const [lapiz3d] = useState(() => (typeof document === "undefined" ? null : new Lapiz()));
  const cuadro = useCurrentFrame();
  const { width: ancho, height: alto } = useVideoConfig();
  const vertical = alto > ancho;
  const u = Math.min(ancho, alto) / 1080;
  const s = cuadro / FPS;
  const p = proyector(camaraEn(s, vertical), { ancho, alto });
  const pal = paleta(nocheEn(s));
  const titulo = sale(entre(s, 9.15, 9.6)) * (1 - entre(s, 12.6, 13));
  const metros = new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <AbsoluteFill>
      <Lienzo dibuja={(m) => dibuja(m, vertical, tinta, lapiz3d)} />
      {/* Los rótulos de la evidencia, donde cae cada pieza. */}
      {s >= 9 && s < 13.2
        ? PIEZAS.map((pieza, k) => {
            const t =
              entre(s, MOMENTOS.piezas_de_evidencia[k]!, MOMENTOS.piezas_de_evidencia[k]! + 0.25) *
              (1 - entre(s, 12.7, 13.1));
            const q = p.punto(pieza.x, pieza.y);
            if (!pieza.rotulo || t <= 0 || !q) return null;
            const lejos = (pieza.contorno ? 96 : 52) * u * pieza.lado;
            return (
              <div
                key={k}
                style={{
                  position: "absolute",
                  // En vertical la evidencia va una sobre otra: los rótulos salen a los lados.
                  left: vertical ? q.x + (pieza.contorno ? 150 : 44) * u * pieza.lado : q.x,
                  top: vertical ? q.y : q.y + lejos,
                  transform: vertical
                    ? `translate(${pieza.lado < 0 ? "-100%" : "0"}, -50%)`
                    : "translate(-50%, -50%)",
                  opacity: t,
                  fontFamily: MONO,
                  fontSize: 25 * u,
                  letterSpacing: "0.02em",
                  color: pal.tinta,
                  whiteSpace: "nowrap",
                }}
              >
                {pieza.rotulo}
              </div>
            );
          })
        : null}
      {/* La medida del impacto al reposo de A: el número sale del Resultado. */}
      {(() => {
        const desde = MOMENTOS.piezas_de_evidencia[4] ?? 11.5;
        const t = entre(s, desde + 0.2, desde + 0.5) * (1 - entre(s, 12.7, 13.1));
        const q = p.punto((IMP.x + A.final.x) / 2, (IMP.y + A.final.y) / 2);
        if (t <= 0 || !q) return null;
        return (
          <div
            style={{
              position: "absolute",
              left: q.x,
              top: q.y - 30 * u,
              transform: "translate(-50%, -50%)",
              opacity: t,
              fontFamily: MONO,
              fontSize: 25 * u,
              color: SENAL,
              whiteSpace: "nowrap",
            }}
          >
            {metros.format(RECORRIDO_A_M)} m
          </div>
        );
      })()}
      {titulo > 0 ? (
        <div
          style={{
            position: "absolute",
            left: vertical ? 70 * u : 104 * u,
            top: vertical ? 150 * u : 250 * u,
            opacity: titulo,
            transform: `translateY(${(1 - titulo) * 18 * u}px)`,
            fontFamily: SERIF,
            fontSize: (vertical ? 122 : 136) * u,
            lineHeight: 0.98,
            letterSpacing: "-0.02em",
            // Un blanco cálido, más claro que las rayas de la calle, sobre su zona limpia.
            color: "#FFF8EE",
            textShadow: `0 0 ${28 * u}px ${pal.fondo}`,
          }}
        >
          Cada choque
          <br />
          deja evidencia<span style={{ color: SENAL }}>.</span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
