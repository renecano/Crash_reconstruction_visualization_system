#!/usr/bin/env node
/**
 * La música del tráiler, compuesta en código (René, 2026-11-16): original, sin grabaciones, muestras
 * ni melodías de terceros. Todo sale de senos, ruido con semilla y filtros sencillos, sobre la misma
 * rejilla de pulsos que la imagen (`apps/trailer/src/ritmo.json`): latido, impacto, casi silencio,
 * subida, tres golpes con percusión, una toma de aire, el golpe y el logo que se escribe nota por
 * nota hasta su acorde final (René, 2026-11-17: nada de silencio al final).
 *
 *   node tools/trailer/musica.mjs [--salida trailer-salida/musica/croquis-trailer.wav]
 *
 * Escribe un WAV estéreo de 48 kHz y 16 bits. Con la misma semilla sale idéntico, bit a bit.
 */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RITMO = JSON.parse(readFileSync(resolve(AQUI, "../../apps/trailer/src/ritmo.json"), "utf8"));

export const FRECUENCIA = 48000;
const SEMILLA = 20261116;
const RE = 36.708; // re grave: la nota de todo el tráiler.

/** mulberry32: el mismo generador de las texturas. */
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Una pista estéreo vacía de `segundos`. */
function pista(segundos) {
  const n = Math.round(segundos * FRECUENCIA);
  return { i: new Float64Array(n), d: new Float64Array(n), n };
}

const TAU = Math.PI * 2;
const entre = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));

/**
 * Un seno que se desliza de `f0` a `f1` (exponencial) y se apaga con `caida` (segundos hasta −60 dB).
 * `pan` va de −1 (izquierda) a 1.
 */
function seno(p, t0, dur, f0, f1, amp, { ataque = 0.004, caida = dur, pan = 0 } = {}) {
  const desde = Math.round(t0 * FRECUENCIA);
  const n = Math.round(dur * FRECUENCIA);
  let fase = 0;
  const gi = Math.cos(((pan + 1) * Math.PI) / 4);
  const gd = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let k = 0; k < n; k++) {
    const j = desde + k;
    if (j < 0 || j >= p.n) continue;
    const t = k / FRECUENCIA;
    const f = f0 * (f1 / f0) ** Math.min(1, t / dur);
    fase += (TAU * f) / FRECUENCIA;
    const env =
      Math.min(1, t / ataque) * 10 ** ((-3 * t) / caida) * (1 - entre(t, dur - 0.01, dur));
    const v = Math.sin(fase) * amp * env;
    p.i[j] += v * gi * Math.SQRT2;
    p.d[j] += v * gd * Math.SQRT2;
  }
}

/** Ruido con semilla, entre un pasa-altos y un pasa-bajos de un polo, con una envolvente `env(t)`. */
function ruido(p, t0, dur, amp, env, { bajos = 8000, altos = 0, semilla = 1, ancho = 1 } = {}) {
  const r = azar(SEMILLA + semilla);
  const desde = Math.round(t0 * FRECUENCIA);
  const n = Math.round(dur * FRECUENCIA);
  const a = 1 - Math.exp((-TAU * bajos) / FRECUENCIA);
  const b = 1 - Math.exp((-TAU * Math.max(1, altos)) / FRECUENCIA);
  let li = 0;
  let ld = 0;
  let hi = 0;
  let hd = 0;
  for (let k = 0; k < n; k++) {
    const j = desde + k;
    const x1 = r() * 2 - 1;
    const x2 = r() * 2 - 1;
    // Con `ancho` 0 los dos canales llevan el mismo ruido; con 1, ruidos distintos.
    const xi = x1;
    const xd = x1 * (1 - ancho) + x2 * ancho;
    li += a * (xi - li);
    ld += a * (xd - ld);
    hi += b * (li - hi);
    hd += b * (ld - hd);
    if (j < 0 || j >= p.n) continue;
    const e = env(k / FRECUENCIA) * amp;
    p.i[j] += (altos ? li - hi : li) * e;
    p.d[j] += (altos ? ld - hd : ld) * e;
  }
}

/** El latido: dos golpes graves seguidos, el segundo más suave. */
function latido(p, t, amp) {
  seno(p, t, 0.34, 74, 36, amp, { caida: 0.3 });
  seno(p, t + 0.17, 0.3, 62, 34, amp * 0.55, { caida: 0.26 });
  // El golpe de medios: sin él, en bocinas chicas (laptop, celular) el latido no se oye.
  for (const [dt, g] of [
    [0, 0.5],
    [0.17, 0.3],
  ]) {
    seno(p, t + dt, 0.09, 260, 130, amp * g, { caida: 0.07, ataque: 0.001 });
    ruido(p, t + dt, 0.05, amp * g * 0.5, (x) => 10 ** (-3 * (x / 0.035)), {
      bajos: 900,
      altos: 150,
      semilla: 700 + Math.round((t + dt) * 100),
      ancho: 0.2,
    });
  }
}

/** Un tambor grande: un seno que cae de tono y un golpe corto de ruido. */
function tambor(p, t, f, amp, { pan = 0, caida = 0.5 } = {}) {
  seno(p, t, caida * 1.2, f * 1.9, f, amp, { caida, pan, ataque: 0.002 });
  seno(p, t, caida, f * 2.9, f * 1.6, amp * 0.45, { caida: caida * 0.5, pan });
  seno(p, t, caida * 0.6, f * 5.1, f * 3.4, amp * 0.22, { caida: caida * 0.3, pan });
  ruido(p, t, 0.11, amp * 0.7, (x) => 10 ** (-3 * (x / 0.08)), {
    bajos: 3200,
    altos: 160,
    semilla: Math.round(t * 1000),
    ancho: 0.4,
  });
}

/**
 * Un acorde de metales graves hecho de armónicos (sierra aditiva): cada nota, dos voces apenas
 * desafinadas; los armónicos altos se apagan antes, como un filtro que se cierra.
 */
function metales(p, t0, dur, notas, amp, { ataque = 0.05, caida = dur } = {}) {
  const desde = Math.round(t0 * FRECUENCIA);
  const n = Math.round(dur * FRECUENCIA);
  const voces = [];
  for (const f of notas) for (const d of [-0.004, 0.004]) voces.push(f * (1 + d));
  const fases = voces.map(() => new Float64Array(14));
  for (let k = 0; k < n; k++) {
    const j = desde + k;
    if (j < 0 || j >= p.n) continue;
    const t = k / FRECUENCIA;
    const env =
      Math.min(1, t / ataque) * 10 ** ((-3 * t) / caida) * (1 - entre(t, dur - 0.02, dur));
    // El brillo: mucho al atacar, menos después.
    const cierre = 0.16 + 0.5 * Math.min(1, t / (caida * 0.6));
    let vi = 0;
    let vd = 0;
    for (let v = 0; v < voces.length; v++) {
      let s = 0;
      for (let h = 1; h <= 14; h++) {
        const f = voces[v] * h;
        if (f > 9000) break;
        fases[v][h - 1] += (TAU * f) / FRECUENCIA;
        s += (Math.sin(fases[v][h - 1]) / h) * Math.exp(-(h - 1) * cierre);
      }
      if (v % 2 === 0) vi += s;
      else vd += s;
    }
    const mono = (vi + vd) * 0.5;
    p.i[j] += Math.tanh((mono * 0.6 + vi * 0.4) * 1.6) * amp * env;
    p.d[j] += Math.tanh((mono * 0.6 + vd * 0.4) * 1.6) * amp * env;
  }
}

/** Reverberación de sala grande (Schroeder: cuatro peines y dos pasa-todo por canal). */
function sala(p, { realimentacion = 0.84, mezcla = 0.25 } = {}) {
  const salida = pista(p.n / FRECUENCIA);
  for (const [canal, corrimiento] of [
    ["i", 0],
    ["d", 23],
  ]) {
    const x = p[canal];
    const y = new Float64Array(p.n);
    for (const ms of [29.7, 37.1, 41.1, 43.7]) {
      const d = Math.round((ms / 1000) * FRECUENCIA) + corrimiento;
      const linea = new Float64Array(d);
      let k = 0;
      let filtro = 0;
      for (let j = 0; j < p.n; j++) {
        const sale = linea[k];
        // Un pasa-bajos en la realimentación: la cola se oscurece, como en una sala real.
        filtro += 0.35 * (sale - filtro);
        linea[k] = x[j] + filtro * realimentacion;
        y[j] += sale * 0.25;
        k = (k + 1) % d;
      }
    }
    for (const ms of [5, 1.7]) {
      const d = Math.round((ms / 1000) * FRECUENCIA);
      const linea = new Float64Array(d);
      let k = 0;
      for (let j = 0; j < p.n; j++) {
        const viejo = linea[k];
        const entra = y[j] + viejo * 0.7;
        linea[k] = entra;
        y[j] = viejo - entra * 0.7;
        k = (k + 1) % d;
      }
    }
    for (let j = 0; j < p.n; j++) salida[canal][j] = x[j] + y[j] * mezcla;
  }
  return salida;
}

/** Compone la pista completa. Devuelve los dos canales entre −1 y 1. */
export function componer() {
  const M = RITMO.momentos;
  const dur = RITMO.duracion;
  const pulso = 60 / RITMO.pulsos_por_minuto;
  const seca = pista(dur); // lo que no lleva sala: la nota grave, el lápiz, la lluvia.
  const golpes = pista(dur); // lo que suena en la sala.
  const final = pista(dur); // el golpe final, con su propia cola.

  // --- La nota grave: nace sola, se hunde en el impacto, vuelve en la subida y llena las frases.
  {
    const r = azar(SEMILLA + 5);
    const desfase = [r() * TAU, r() * TAU, r() * TAU, r() * TAU];
    const fases = new Float64Array(4 * 8);
    let faseGrave = 0;
    for (let j = 0; j < seca.n; j++) {
      const t = j / FRECUENCIA;
      // El tono: fijo, cae una octava tras el contacto y regresa antes de la subida.
      const caida = entre(t, M.contacto, M.contacto + 1.6);
      const vuelta = entre(t, 12.5, 13.2);
      const tono = 2 ** (-caida * (1 - vuelta));
      // El volumen por tramo.
      let vol = 0.2 * entre(t, 0, 2.4);
      vol *= 1 - 0.75 * entre(t, M.contacto + 0.2, 9);
      vol += 0.5 * entre(t, 13, 18) ** 2;
      vol = t >= 18 ? 0.42 : vol;
      // Se va en la toma de aire: el logo trae su propia armonía.
      vol *= 1 - entre(t, M.toma_de_aire - 0.1, M.toma_de_aire + 0.3);
      if (vol <= 0) continue;
      // El brillo crece con la subida.
      const brillo = 0.42 - 0.2 * entre(t, 13, 18) - (t >= 18 ? 0.2 : 0);
      let vi = 0;
      let vd = 0;
      const notas = [RE * 2, RE * 2 * 1.004, RE * 4, RE * 6]; // re, re desafinado, octava y quinta.
      for (let v = 0; v < 4; v++) {
        const peso = v === 3 ? entre(t, 13, 17) * 0.5 : v === 2 ? 0.6 : 1;
        if (peso === 0) continue;
        let s = 0;
        for (let h = 1; h <= 8; h++) {
          const k = v * 8 + h - 1;
          fases[k] += (TAU * notas[v] * h * tono) / FRECUENCIA;
          s += (Math.sin(fases[k] + desfase[v]) / h) * Math.exp(-(h - 1) * brillo);
        }
        if (v % 2 === 0) vi += s * peso;
        else vd += s * peso;
      }
      const lento = 0.85 + 0.15 * Math.sin(TAU * 0.11 * t);
      // El re más grave, debajo: solo se siente en bocinas grandes.
      faseGrave += (TAU * RE * tono) / FRECUENCIA;
      const grave = Math.sin(faseGrave) * 0.5;
      seca.i[j] += (vi * 0.75 + vd * 0.25 + grave) * vol * lento;
      seca.d[j] += (vd * 0.75 + vi * 0.25 + grave) * vol * lento;
    }
  }

  // --- El roce del lápiz: trazos de ruido fino, de largo y pausa desiguales.
  {
    const r = azar(SEMILLA + 9);
    let t = 0.35;
    while (t < 4.5) {
      const largo = 0.28 + r() * 0.5;
      const fuerza = 0.09 + r() * 0.06;
      ruido(seca, t, largo, fuerza, (x) => Math.sin(Math.PI * Math.min(1, x / largo)) ** 0.6, {
        bajos: 5200 + r() * 1800,
        altos: 1500,
        semilla: 100 + Math.round(t * 100),
        ancho: 0.25,
      });
      t += largo + 0.05 + r() * 0.22;
    }
  }

  // --- Los latidos: lentos y, antes del contacto, cada vez más seguidos.
  M.latidos.forEach((t, k) => latido(golpes, t, 0.5 + 0.3 * (k / M.latidos.length)));

  // --- El contacto: un golpe seco y un seno que se hunde.
  tambor(golpes, M.contacto, 52, 1, { caida: 0.9 });
  ruido(golpes, M.contacto, 0.05, 0.8, (x) => 10 ** (-3 * (x / 0.03)), {
    bajos: 9000,
    altos: 1800,
    semilla: 31,
    ancho: 0.6,
  });
  seno(golpes, M.contacto, 2.2, 96, 27, 0.85, { caida: 1.9, ataque: 0.003 });

  // --- La evidencia: casi silencio; un latido tenue por segundo y un clic por pieza.
  for (let t = 9; t < 13; t += 1) latido(golpes, t, 0.16);
  M.piezas_de_evidencia.forEach((t, k) => {
    const pan = ((k % 3) - 1) * 0.5;
    seno(golpes, t, 0.05, 2300 + 180 * k, 1900, 0.16, { caida: 0.04, pan, ataque: 0.001 });
    seno(golpes, t, 0.2, 196 * 2 ** (k / 12), 196 * 2 ** (k / 12), 0.07, { caida: 0.18, pan });
  });

  // --- La subida: tambores cada pulso, luego cada medio, y un redoble; un tono y un ruido que suben.
  for (let t = 13; t < 18 - 1e-9; t += t < 16 ? pulso : t < 17.5 ? pulso / 2 : pulso / 4) {
    const crece = entre(t, 13, 18);
    const k = Math.round((t - 13) / (pulso / 4));
    tambor(golpes, t, k % 4 === 0 ? 58 : 78, 0.22 + 0.6 * crece ** 1.5, {
      pan: k % 2 ? 0.35 : -0.35,
      caida: 0.34,
    });
  }
  {
    let fase = 0;
    const desde = Math.round(13 * FRECUENCIA);
    for (let k = 0; k < 5 * FRECUENCIA; k++) {
      const t = k / FRECUENCIA;
      const x = t / 5;
      fase += (TAU * 110 * 6 ** x) / FRECUENCIA;
      const tiembla = 0.6 + 0.4 * Math.sin(TAU * (6 + 10 * x) * t);
      const v = Math.sin(fase) * 0.11 * x ** 2.2 * tiembla;
      seca.i[desde + k] += v;
      seca.d[desde + k] += v;
    }
  }
  ruido(seca, 13, 5, 0.2, (x) => (x / 5) ** 3, { bajos: 9000, altos: 2500, semilla: 41 });

  // --- La lluvia: entra cuando el papel se vuelve el 3D y se queda hasta el corte.
  ruido(
    seca,
    M.del_papel_al_3d - 0.5,
    M.toma_de_aire - M.del_papel_al_3d + 0.5,
    0.075,
    (x) =>
      entre(x, 0, 1.5) *
      (1 - entre(x, M.toma_de_aire - M.del_papel_al_3d, M.toma_de_aire - M.del_papel_al_3d + 0.5)),
    { bajos: 7000, altos: 2600, semilla: 51 },
  );

  // --- Las tres frases: un golpe de metales por frase y percusión seguida.
  const acordes = [
    [RE * 2, RE * 3, RE * 4],
    [RE * 2 * 1.189, RE * 3 * 1.189, RE * 4 * 1.189], // una tercera menor arriba: fa
    [RE * 2 * 0.891, RE * 3 * 0.891, RE * 4], // si bemol con el re arriba
  ];
  M.frases.forEach((t, k) => {
    metales(golpes, t, 1.5, acordes[k], 0.5, { caida: 1.4 });
    tambor(golpes, t, 46, 1, { caida: 1 });
    seno(golpes, t, 1.2, 80, 34, 0.7, { caida: 1 });
  });
  for (let t = 18; t < M.toma_de_aire - 1e-9; t += pulso / 2) {
    const k = Math.round((t - 18) / (pulso / 2));
    if (M.frases.some((f) => Math.abs(f - t) < 1e-6)) continue;
    const fuerte = k % 2 === 0;
    tambor(golpes, t, fuerte ? 60 : 84, fuerte ? 0.62 : 0.4, {
      pan: k % 4 < 2 ? -0.4 : 0.4,
      caida: 0.3,
    });
    if (fuerte) seno(golpes, t, 0.22, RE * 2, RE * 2, 0.3, { caida: 0.2 });
  }
  // El último medio segundo antes del corte: un redoble que crece.
  for (let t = M.toma_de_aire - 0.5; t < M.toma_de_aire - 1e-9; t += pulso / 4)
    tambor(golpes, t, 70, 0.5 + 0.9 * entre(t, M.toma_de_aire - 0.5, M.toma_de_aire), {
      caida: 0.2,
    });

  // --- La toma de aire: medio segundo en que todo sube hacia el golpe (no hay silencio).
  {
    const d = M.golpe_final - M.toma_de_aire;
    ruido(seca, M.toma_de_aire, d, 0.5, (x) => (x / d) ** 2.6, {
      bajos: 6000,
      altos: 900,
      semilla: 71,
    });
    let fase = 0;
    const desde = Math.round(M.toma_de_aire * FRECUENCIA);
    for (let k = 0; k < d * FRECUENCIA; k++) {
      const x = k / (d * FRECUENCIA);
      fase += (TAU * RE * 2 * 2 ** x) / FRECUENCIA;
      const v = Math.sin(fase) * 0.3 * x ** 2;
      seca.i[desde + k] += v;
      seca.d[desde + k] += v;
    }
  }

  // --- El golpe: con él aparece el logo. Fuerte, pero ya no es el final.
  tambor(final, M.golpe_final, 40, 1.25, { caida: 1.3 });
  seno(final, M.golpe_final, 2, 88, 30, 0.9, { caida: 1.7 });
  metales(final, M.golpe_final, 2, [RE, RE * 2, RE * 3, RE * 4], 0.5, { caida: 1.8, ataque: 0.03 });
  ruido(final, M.golpe_final, 1.2, 0.5, (x) => 10 ** (-3 * x), {
    bajos: 5200,
    altos: 300,
    semilla: 61,
  });

  // --- El logo se escribe: la música sigue. Un acorde sostenido (re mayor: la resolución), un latido
  // suave por pulso y una nota por letra, que suben por la escala hasta el acorde final.
  const MAYOR = [RE * 2, RE * 3, RE * 4, RE * 5]; // re, la, re y fa sostenido (el quinto armónico)
  metales(final, M.golpe_final + 0.25, M.acorde_final - M.golpe_final, MAYOR, 0.2, {
    ataque: 0.5,
    caida: 6,
  });
  for (let t = M.letras[0]; t < M.acorde_final - 1e-9; t += pulso) latido(final, t, 0.34);
  // Re mayor pentatónica, hacia arriba: re, mi, fa sostenido, la, si, re, fa sostenido.
  const ESCALA = [8, 9, 10, 12, 27 / 2, 16, 20].map((n) => RE * n);
  M.letras.forEach((t, k) => {
    const pan = -0.6 + (1.2 * k) / (M.letras.length - 1);
    seno(final, t, 0.7, ESCALA[k], ESCALA[k], 0.3, { caida: 0.6, pan, ataque: 0.003 });
    seno(final, t, 0.4, ESCALA[k] * 2, ESCALA[k] * 2, 0.09, { caida: 0.3, pan, ataque: 0.002 });
    seno(final, t, 0.5, ESCALA[k] * 3, ESCALA[k] * 3, 0.025, { caida: 0.25, pan });
    ruido(final, t, 0.02, 0.12, (x) => 10 ** (-3 * (x / 0.012)), {
      bajos: 7000,
      altos: 1500,
      semilla: 80 + k,
      ancho: 0.3,
    });
  });

  // --- El acorde final: llega con el lema y se apaga solo, sin corte.
  metales(final, M.acorde_final, 1.48, MAYOR, 0.42, { caida: 2.4, ataque: 0.04 });
  seno(final, M.acorde_final, 1.48, RE, RE, 0.7, { caida: 2.2, ataque: 0.01 });
  tambor(final, M.acorde_final, 46, 0.7, { caida: 0.9 });
  for (const [n, a] of [
    [16, 0.11],
    [24, 0.07],
    [32, 0.04],
  ])
    seno(final, M.acorde_final, 1.45, RE * n, RE * n, a, { caida: 2, ataque: 0.004 });

  // --- La mezcla: la sala y el límite. Nada se corta: lo que venía sonando se funde con el golpe.
  const enSala = sala(golpes, { realimentacion: 0.82, mezcla: 0.22 });
  const cola = sala(final, { realimentacion: 0.88, mezcla: 0.34 });
  const mezclaFinal = pista(dur);
  for (let j = 0; j < mezclaFinal.n; j++) {
    const t = j / FRECUENCIA;
    // El final es la cola del acorde; solo se asegura que el archivo termine en cero.
    const fin = 1 - entre(t, dur - 0.25, dur - 0.02);
    for (const c of ["i", "d"]) {
      const x = seca[c][j] + enSala[c][j] + cola[c][j];
      mezclaFinal[c][j] = Math.tanh(x * 0.9) * fin;
    }
  }
  let pico = 0;
  for (let j = 0; j < mezclaFinal.n; j++)
    pico = Math.max(pico, Math.abs(mezclaFinal.i[j]), Math.abs(mezclaFinal.d[j]));
  const ganancia = 0.89 / pico;
  for (let j = 0; j < mezclaFinal.n; j++) {
    mezclaFinal.i[j] *= ganancia;
    mezclaFinal.d[j] *= ganancia;
  }
  return mezclaFinal;
}

/** Los bytes de un WAV estéreo de 16 bits. */
export function aWav(p) {
  const datos = Buffer.alloc(p.n * 4);
  for (let j = 0; j < p.n; j++) {
    datos.writeInt16LE(Math.round(Math.max(-1, Math.min(1, p.i[j])) * 32767), j * 4);
    datos.writeInt16LE(Math.round(Math.max(-1, Math.min(1, p.d[j])) * 32767), j * 4 + 2);
  }
  const cabeza = Buffer.alloc(44);
  cabeza.write("RIFF", 0);
  cabeza.writeUInt32LE(36 + datos.length, 4);
  cabeza.write("WAVEfmt ", 8);
  cabeza.writeUInt32LE(16, 16);
  cabeza.writeUInt16LE(1, 20);
  cabeza.writeUInt16LE(2, 22);
  cabeza.writeUInt32LE(FRECUENCIA, 24);
  cabeza.writeUInt32LE(FRECUENCIA * 4, 28);
  cabeza.writeUInt16LE(4, 32);
  cabeza.writeUInt16LE(16, 34);
  cabeza.write("data", 36);
  cabeza.writeUInt32LE(datos.length, 40);
  return Buffer.concat([cabeza, datos]);
}

/** Qué tan fuerte suena cada tramo (RMS), para comprobar el arco: calma, golpe, silencio, subida. */
export function fuerzaPorTramo(p) {
  const rms = (a, b) => {
    let s = 0;
    const d = Math.round(a * FRECUENCIA);
    const h = Math.round(b * FRECUENCIA);
    for (let j = d; j < h; j++) s += p.i[j] ** 2 + p.d[j] ** 2;
    return Math.sqrt(s / (2 * (h - d)));
  };
  return Object.fromEntries(RITMO.tramos.map((t) => [t.clave, rms(t.desde, t.hasta)]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--salida");
  const salida = resolve(
    i > 0
      ? process.argv[i + 1]
      : join(
          process.env.CROQUIS_TRAILER ?? resolve(AQUI, "../../trailer-salida"),
          "musica",
          "croquis-trailer.wav",
        ),
  );
  const p = componer();
  const wav = aWav(p);
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, wav);
  const f = fuerzaPorTramo(p);
  process.stdout.write(
    `${salida}\n${(p.n / FRECUENCIA).toFixed(1)} s · sha256 ${createHash("sha256").update(wav).digest("hex").slice(0, 16)}\n` +
      `fuerza por tramo: ${Object.entries(f)
        .map(([k, v]) => `${k} ${v.toFixed(3)}`)
        .join(" · ")}\n`,
  );
}
