#!/usr/bin/env node
/**
 * Las tomas del 3D para el tráiler (René, 2026-11-16), en el formato del modo foto del visor de
 * escritorio (`apps/visor-unity/Assets/Croquis/Visor/Fotos.cs`): las corre la computadora con tarjeta
 * de video, a 3840×2160 en ultra, con el mismo paquete de fotos del release `rtx-t4`. No hace falta
 * un build nuevo de Unity.
 *
 * Solo la escena inventada de noche con lluvia (`casos/nocturno_lluvia-noche.json`): la misma de la que
 * salen la hoja y las simulaciones del tráiler. Nada de AXA ni de casos reales.
 *
 * Cada hueco del tráiler (`apps/trailer/src/tomas.tsx`) es una secuencia: varios cuadros con el
 * instante y la cámara avanzando poco a poco (cámara lenta). Los archivos salen como
 * `<hueco>_0001.png`…; `apps/trailer/render.mjs` los reconoce así.
 *
 *   node tools/trailer/tomas-rtx.mjs [salida.json]     escribe el plan (por defecto, lo imprime)
 */
import { writeFileSync } from "node:fs";
import process from "node:process";

const CASO = "casos/nocturno_lluvia-noche.json";
/** El instante en que todo quedó en reposo en esa escena (su `t_fin`, del Resultado versionado). */
const T_FIN = 5.26;

/**
 * Los huecos: cuántos cuadros (a 30 por segundo de video), de qué instante a cuál del Resultado
 * (0 es el impacto) y de qué cámara a cuál. Las cámaras parten de tomas del material promocional que
 * ya se revisaron (`tools/unity/paquetes-promo.mts`).
 */
export const HUECOS = [
  {
    // Del papel al 3D: los dos vehículos vistos desde atrás, hasta el golpe. 2 s de video.
    hueco: "heroe",
    cuadros: 60,
    t: [-1.0, 0.2],
    camara: [
      { objetivo: "impacto", azimut: 272, distancia: 15, altura: 0.9, mira: 0.7, fov: 32 },
      { objetivo: "impacto", azimut: 269, distancia: 13.2, altura: 0.9, mira: 0.7, fov: 32 },
    ],
  },
  {
    // «La IA lee»: el vehículo A bajo la lluvia, antes del golpe. Medio segundo.
    hueco: "faros",
    cuadros: 15,
    t: [-1.0, -0.7],
    camara: [
      {
        objetivo: "veh-a",
        relativo: true,
        azimut: 160,
        distancia: 9,
        altura: 0.6,
        mira: 0.8,
        fov: 30,
      },
      {
        objetivo: "veh-a",
        relativo: true,
        azimut: 164,
        distancia: 8.6,
        altura: 0.6,
        mira: 0.8,
        fov: 30,
      },
    ],
  },
  {
    // «La física decide»: el golpe, a ras del piso.
    hueco: "impacto",
    cuadros: 15,
    t: [-0.05, 0.25],
    camara: [
      { objetivo: "impacto", azimut: 200, distancia: 7.5, altura: 0.35, mira: 0.7, fov: 30 },
      { objetivo: "impacto", azimut: 203, distancia: 7.2, altura: 0.35, mira: 0.7, fov: 30 },
    ],
  },
  {
    // «El perito firma»: desde arriba, lo que recorren después del golpe.
    hueco: "aerea",
    cuadros: 15,
    t: [0.2, 1.2],
    camara: [
      { objetivo: "impacto", azimut: 200, distancia: 22, altura: 34, mira: 0, fov: 36 },
      { objetivo: "impacto", azimut: 204, distancia: 22, altura: 32, mira: 0, fov: 36 },
    ],
  },
  {
    // Dos detalles para los últimos cortes: la combi y la carrocería del vehículo A ya en reposo.
    hueco: "detalle-1",
    cuadros: 5,
    t: [0.5, 0.6],
    camara: [
      {
        objetivo: "veh-b",
        relativo: true,
        azimut: 200,
        distancia: 5,
        altura: 0.8,
        mira: 0.9,
        fov: 28,
      },
      {
        objetivo: "veh-b",
        relativo: true,
        azimut: 201,
        distancia: 4.9,
        altura: 0.8,
        mira: 0.9,
        fov: 28,
      },
    ],
  },
  {
    hueco: "detalle-2",
    cuadros: 5,
    t: [T_FIN, T_FIN],
    camara: [
      {
        objetivo: "veh-a",
        relativo: true,
        azimut: 30,
        distancia: 4.5,
        altura: 1.0,
        mira: 0.7,
        fov: 28,
      },
      {
        objetivo: "veh-a",
        relativo: true,
        azimut: 32,
        distancia: 4.4,
        altura: 1.0,
        mira: 0.7,
        fov: 28,
      },
    ],
  },
];

const mezcla = (a, b, u) => Math.round((a + (b - a) * u) * 1000) / 1000;

/** El plan completo, toma por toma, como lo lee el modo foto. */
export function plan({ ancho = 3840, alto = 2160, calidad = "ultra" } = {}) {
  const tomas = [];
  for (const h of HUECOS) {
    for (let k = 0; k < h.cuadros; k++) {
      const u = h.cuadros > 1 ? k / (h.cuadros - 1) : 0;
      const [a, b] = h.camara;
      tomas.push({
        id: `${h.hueco}_${String(k + 1).padStart(4, "0")}`,
        caso: CASO,
        t: mezcla(h.t[0], h.t[1], u),
        camara: {
          objetivo: a.objetivo,
          ...(a.relativo ? { relativo: true } : {}),
          azimut: mezcla(a.azimut, b.azimut, u),
          distancia: mezcla(a.distancia, b.distancia, u),
          altura: mezcla(a.altura, b.altura, u),
          mira: mezcla(a.mira, b.mira, u),
          fov: mezcla(a.fov, b.fov, u),
        },
      });
    }
  }
  return { ancho, alto, calidad, tomas };
}

if (process.argv[1]?.endsWith("tomas-rtx.mjs")) {
  const p = plan();
  const texto = `${JSON.stringify(p, null, 1)}\n`;
  if (process.argv[2]) {
    writeFileSync(process.argv[2], texto);
    process.stdout.write(`${p.tomas.length} tomas en ${process.argv[2]}\n`);
  } else process.stdout.write(texto);
}
