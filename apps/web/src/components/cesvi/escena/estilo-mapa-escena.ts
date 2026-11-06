/**
 * El mapa de la escena fácil (René, 2026-11-05): claro y legible, como un croquis que entiende un
 * niño. Calles blancas con su orilla y su nombre, manzanas, edificios y parques; nada más. Sale de
 * las mismas teselas vectoriales de OpenFreeMap (esquema OpenMapTiles) que los otros mapas de
 * /cesvi, con los colores de escena de los tokens de Laboratorio (prompt §3).
 */
import type { StyleSpecification } from "maplibre-gl";

/** Los colores del mapa en día y en noche (tokens de escena del rediseño «Laboratorio»). */
export const COLORES_MAPA = {
  claro: {
    fondo: "#F4F2EC",
    manzana: "#ECE9E1",
    edificio: "#DEDAD0",
    edificioBorde: "#D2CDC1",
    parque: "#D4E7C5",
    agua: "#C9DDEE",
    calle: "#FFFFFF",
    orilla: "#D5D8DE",
    nombre: "#3A3F49",
    halo: "#FFFFFF",
  },
  oscuro: {
    fondo: "#0A1120",
    manzana: "#111A2C",
    edificio: "#17223A",
    edificioBorde: "#1E2B47",
    parque: "#13291F",
    agua: "#10233D",
    calle: "#1C2944",
    orilla: "#2C3A57",
    nombre: "#B4C0D4",
    halo: "#0A1120",
  },
} as const;

const CALLES_GRANDES = ["motorway", "trunk", "primary", "secondary", "tertiary"];

/** El ancho de una calle en pixeles por zoom: crece con el zoom como la calle real. */
const ancho = (base: number) =>
  [
    "interpolate",
    ["exponential", 1.6],
    ["zoom"],
    13,
    base * 0.35,
    16,
    base * 2.2,
    19,
    base * 11,
    21,
    base * 40,
  ] as unknown as number;

export function estiloMapaEscena(tema: "claro" | "oscuro"): StyleSpecification {
  const c = COLORES_MAPA[tema];
  const esGrande = ["match", ["get", "class"], CALLES_GRANDES, true, false];
  const esCalle = [
    "match",
    ["get", "class"],
    [...CALLES_GRANDES, "minor", "service", "street", "residential", "living_street"],
    true,
    false,
  ];
  const lineal = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
  return {
    version: 8,
    name: `Croquis · escena ${tema}`,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    },
    layers: [
      { id: "fondo", type: "background", paint: { "background-color": c.fondo } },
      {
        id: "manzanas",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: [
          "match",
          ["get", "class"],
          ["residential", "commercial", "retail", "industrial"],
          true,
          false,
        ],
        paint: { "fill-color": c.manzana },
      },
      {
        id: "parques",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "park",
        paint: { "fill-color": c.parque },
      },
      {
        id: "verde",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        filter: ["match", ["get", "class"], ["grass", "wood"], true, false],
        paint: { "fill-color": c.parque, "fill-opacity": 0.8 },
      },
      {
        id: "agua",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        paint: { "fill-color": c.agua },
      },
      {
        id: "edificios",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 15,
        paint: { "fill-color": c.edificio, "fill-outline-color": c.edificioBorde },
      },
      {
        id: "calles-orilla",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["all", lineal, esCalle],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": c.orilla,
          "line-width": ["case", esGrande, ancho(1.6), ancho(1.05)] as unknown as number,
          "line-gap-width": 0,
        },
      },
      {
        id: "calles",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["all", lineal, esCalle],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": c.calle,
          "line-width": ["case", esGrande, ancho(1.4), ancho(0.9)] as unknown as number,
        },
      },
      {
        id: "nombres-calles",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "transportation_name",
        minzoom: 15,
        layout: {
          "symbol-placement": "line",
          "text-field": [
            "upcase",
            ["coalesce", ["get", "name:es"], ["get", "name"]],
          ] as unknown as string,
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 19, 14] as unknown as number,
          "text-letter-spacing": 0.08,
          "symbol-spacing": 320,
        },
        paint: { "text-color": c.nombre, "text-halo-color": c.halo, "text-halo-width": 1.6 },
      },
      {
        id: "nombres-parques",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "poi",
        minzoom: 16,
        filter: ["match", ["get", "class"], ["park", "garden"], true, false],
        layout: {
          "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]] as unknown as string,
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
        },
        paint: { "text-color": c.nombre, "text-halo-color": c.halo, "text-halo-width": 1.4 },
      },
    ],
  } as StyleSpecification;
}
