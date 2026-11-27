#!/usr/bin/env node
/**
 * Las tomas del 3D para el video de la portada (René, 2026-11-24): 8 s limpios, sin texto, con el
 * visor de escritorio y el build publicado, que se repiten en bucle sin que se note el salto.
 *
 * - **arbol**: el árbol de noche, con la luz de los faros llegando a él. Es el caso de René
 *   (`casos/arbol-noche.json`, el paquete caso-3d de `rene-arbol-curva`, de noche con alumbrado), que
 *   `desde-release.ps1 -Paso portada` copia al paquete de fotos.
 * - **carambola**: la carambola con lluvia (`casos/nocturno_lluvia-noche.json`), con el encuadre del
 *   hueco «heroe» del tráiler, ya revisado.
 *
 * Para el bucle, el instante queda fijo (los vehículos no se mueven: no hay salto al volver) y la
 * cámara recorre un camino cerrado y lento: el azimut y la distancia oscilan con un seno completo,
 * así que el último cuadro empalma con el primero. 240 cuadros a 30 por segundo.
 *
 *   node tools/trailer/tomas-portada.mjs [salida.json]     escribe el plan (por defecto, lo imprime)
 */
import { writeFileSync } from "node:fs";
import process from "node:process";

const CUADROS = 240;

/**
 * Cada toma: el caso, el instante (0 es el impacto) y la cámara en el centro de su recorrido, con
 * cuánto oscilan el azimut (grados) y la distancia (m) en una vuelta completa.
 */
export const TOMAS = [
  {
    toma: "arbol",
    caso: "casos/arbol-noche.json",
    // Medio segundo antes del golpe: el Jetta a unos 8 m del árbol, con los faros sobre él.
    t: -0.5,
    // Desde atrás del vehículo (viene del nor-noreste, avanza a 211°), mirando al árbol.
    camara: { objetivo: "impacto", azimut: 33, distancia: 17, altura: 2.2, mira: 1.0, fov: 34 },
    oscila: { azimut: 5, distancia: 0.6 },
  },
  {
    toma: "carambola",
    caso: "casos/nocturno_lluvia-noche.json",
    t: -0.6,
    camara: {
      objetivo: "impacto",
      azimut: 270.5,
      distancia: 14.2,
      altura: 0.9,
      mira: 0.7,
      fov: 32,
    },
    oscila: { azimut: 4, distancia: 0.5 },
  },
];

const r3 = (x) => Math.round(x * 1000) / 1000;

/** El plan completo, cuadro por cuadro, como lo lee el modo foto. */
export function plan({ ancho = 1920, alto = 1080, calidad = "ultra" } = {}) {
  const tomas = [];
  for (const t of TOMAS) {
    for (let k = 0; k < CUADROS; k++) {
      // Una vuelta completa en los 240 cuadros: el cuadro 240 sería igual al 0.
      const u = (2 * Math.PI * k) / CUADROS;
      tomas.push({
        id: `portada-${t.toma}_${String(k + 1).padStart(4, "0")}`,
        caso: t.caso,
        t: t.t,
        camara: {
          ...t.camara,
          azimut: r3(t.camara.azimut + t.oscila.azimut * Math.sin(u)),
          distancia: r3(t.camara.distancia + t.oscila.distancia * (1 - Math.cos(u)) * 0.5),
        },
      });
    }
  }
  return { ancho, alto, calidad, tomas };
}

if (process.argv[1]?.endsWith("tomas-portada.mjs")) {
  const p = plan();
  const texto = `${JSON.stringify(p, null, 1)}\n`;
  if (process.argv[2]) {
    writeFileSync(process.argv[2], texto);
    process.stdout.write(`${p.tomas.length} tomas en ${process.argv[2]}\n`);
  } else process.stdout.write(texto);
}
