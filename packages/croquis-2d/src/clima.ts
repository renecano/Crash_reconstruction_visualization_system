/**
 * El clima del lugar como respaldo del paisaje del 3D (René, 2026-11-26): en México, OpenStreetMap
 * casi nunca trae cobertura del suelo, así que sin ella decide la clasificación Köppen-Geiger de
 * 1 km de Beck et al. (2023, CC BY 4.0; 1991–2020): BWh, BWk, BSh y BSk son «árido» y lo demás
 * «templado». Solo va el recorte de México, como «árido o no» (`data/koppen-mexico.json`, de
 * `tools/datos/koppen_mexico.py`; registrado en `data/SOURCES.md`). No hay consultas en vivo.
 */
import mapa from "./data/koppen-mexico.json";

interface Recorte {
  oeste: number;
  norte: number;
  paso: number;
  columnas: number;
  filas: string[];
}

const recorte = mapa as Recorte;
const filasLeidas = new Map<number, number[]>();

/** Las corridas de una fila: «no árido, árido, no árido…», enteros LEB128 en base64. */
function corridas(fila: number): number[] {
  const ya = filasLeidas.get(fila);
  if (ya) return ya;
  const bytes = Uint8Array.from(atob(recorte.filas[fila]!), (c) => c.charCodeAt(0));
  const salida: number[] = [];
  let n = 0;
  let corrimiento = 0;
  for (const b of bytes) {
    n |= (b & 0x7f) << corrimiento;
    if (b & 0x80) corrimiento += 7;
    else {
      salida.push(n);
      n = 0;
      corrimiento = 0;
    }
  }
  filasLeidas.set(fila, salida);
  return salida;
}

/** «arido» o «templado» por el clima del punto; null fuera del recorte de México. */
export function paisajeDelClima(lat: number, lon: number): "arido" | "templado" | null {
  const columna = Math.floor((lon - recorte.oeste) / recorte.paso);
  const fila = Math.floor((recorte.norte - lat) / recorte.paso);
  if (columna < 0 || columna >= recorte.columnas || fila < 0 || fila >= recorte.filas.length)
    return null;
  let inicio = 0;
  let arido = false;
  for (const largo of corridas(fila)) {
    if (columna < inicio + largo) return arido ? "arido" : "templado";
    inicio += largo;
    arido = !arido;
  }
  return "templado";
}
