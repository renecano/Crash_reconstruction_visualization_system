/**
 * W5: la ruta `/api/relieve` contra los modelos de elevación reales, sin cuenta: los Terrain Tiles
 * de AWS (LiDAR de terreno del INEGI donde lo hay; SRTM donde no) y Copernicus GLO-30. Pide la malla
 * de tres lugares de México elegidos para la prueba (no son casos): una ciudad en altiplano, una
 * carretera de montaña y una ciudad plana. De cada uno guarda la fuente que eligió la cadena, sus
 * nodos, su desnivel, la pendiente en el centro y lo que tardó; y, para comparar, lo mismo con cada
 * fuente por separado. Sale a la red: no corre en CI.
 *
 *   pnpm --filter @croquis/eval-js exec tsx w5_relieve.ts
 *
 * Escribe `eval/results/w5_relieve.json`.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  armarRelieve,
  defaultRelieveDeps,
  desnivelM,
  relieveDeCopernicus,
  relieveDeTeselas,
  RelieveIn,
  type Relieve,
} from "../../apps/web/src/server/relieve";

const LUGARES = [
  { nombre: "Toluca, centro (aprox.)", lat: 19.2926, lon: -99.6569 },
  { nombre: "La Marquesa, carretera México–Toluca (aprox.)", lat: 19.299, lon: -99.371 },
  { nombre: "Mérida, centro (aprox.)", lat: 20.9674, lon: -89.6237 },
];

/** La pendiente entre el centro y sus vecinos a 30 m, en %: comparable entre mallas de 10 y de 30 m. */
function pendienteCentroPct(m: Relieve): number {
  const k = Math.round(30 / m.resolucion_m);
  const c = (m.ancho * m.alto - 1) / 2;
  const este = (m.alturas_m[c + k]! - m.alturas_m[c - k]!) / 60;
  const norte = (m.alturas_m[c + k * m.ancho]! - m.alturas_m[c - k * m.ancho]!) / 60;
  return Math.round(Math.hypot(este, norte) * 1000) / 10;
}

const resumen = (m: Relieve) => ({
  fuente: m.fuente,
  nodos: `${m.ancho} × ${m.alto}`,
  resolucion_m: m.resolucion_m,
  resolucion_nativa_m: m.resolucion_nativa_m,
  bytes_json: JSON.stringify(m).length,
  desnivel_m: desnivelM(m),
  pendiente_en_el_centro_pct: pendienteCentroPct(m),
});

async function medir<T>(
  f: () => Promise<T>,
): Promise<{ valor: T | null; ms: number; error?: string }> {
  const t0 = performance.now();
  try {
    const valor = await f();
    return { valor, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { valor: null, ms: Math.round(performance.now() - t0), error: (e as Error).message };
  }
}

const filas = [];
for (const l of LUGARES) {
  const c = RelieveIn.parse({ lat: l.lat, lon: l.lon });
  // Dependencias nuevas en cada medición: sin nada guardado de la anterior.
  const cadena = await medir(() => armarRelieve(c, defaultRelieveDeps()));
  const teselas = await medir(() => relieveDeTeselas(c, defaultRelieveDeps()));
  const copernicus = await medir(() => {
    const d = defaultRelieveDeps();
    return relieveDeCopernicus(c, d.abrir!.bind(d));
  });
  const fila = {
    lugar: l.nombre,
    lat: l.lat,
    lon: l.lon,
    cadena: cadena.valor
      ? { ...resumen(cadena.valor), ms: cadena.ms }
      : { error: cadena.error, ms: cadena.ms },
    terrain_tiles: teselas.valor
      ? { ...resumen(teselas.valor.relieve), archivos: teselas.valor.fuentes, ms: teselas.ms }
      : { error: teselas.error ?? "sin mosaicos", ms: teselas.ms },
    copernicus_glo30: copernicus.valor
      ? { ...resumen(copernicus.valor), ms: copernicus.ms }
      : { error: copernicus.error ?? "sin mosaico", ms: copernicus.ms },
  };
  filas.push(fila);
  console.log(JSON.stringify(fila, null, 1));
}

const salida = resolve(dirname(fileURLToPath(import.meta.url)), "../results/w5_relieve.json");
writeFileSync(
  salida,
  `${JSON.stringify(
    {
      que: "Malla de relieve de /api/relieve (600 m de lado) desde los modelos reales, por fuente",
      fecha: new Date().toISOString().slice(0, 10),
      nota: "Tiempos desde la laptop de desarrollo, con su red y sin nada guardado; en la cadena, a Copernicus se le esperan 12 s. Los lugares son entradas de prueba, no casos. `archivos` es lo que dice el encabezado x-amz-meta-x-imagery-sources de cada mosaico.",
      lugares: filas,
    },
    null,
    2,
  )}\n`,
);
console.log(`Escrito ${salida}`);
