/**
 * Escribe `lugar.red_vial` de las escenas canónicas que vienen de un extracto de OpenStreetMap
 * (ADR 0023), desde la respuesta de Overpass versionada en `data/osm/`. También comprueba que la
 * plantilla paramétrica de la escena coincida con la que se deriva del cruce (tipo, sentidos,
 * carriles y rotación). `--check` falla si la red guardada no es la que sale del extracto.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { crossingAt, redVialFrom, templateFromCrossing, type OverpassResponse } from "../src/osm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
/** Escena canónica → extracto de `data/osm/manifest.json`. */
const ESCENAS: Record<string, string> = { interseccion_toluca: "toluca_carranza_juarez" };

const check = process.argv.includes("--check");
const manifest = JSON.parse(
  readFileSync(join(root, "data", "osm", "manifest.json"), "utf-8"),
) as Record<string, { lat: number; lon: number; radio_m: number; nodo_cruce?: number }>;
let problems = 0;
for (const [escena, extracto] of Object.entries(ESCENAS)) {
  const info = manifest[extracto];
  if (!info) throw new Error(`El extracto ${extracto} no está en el manifiesto`);
  const resp = JSON.parse(
    readFileSync(join(root, "data", "osm", `${extracto}.overpass.json`), "utf-8"),
  ) as OverpassResponse;
  const path = join(root, "packages", "scene-schema", "fixtures", `${escena}.json`);
  const spec = JSON.parse(readFileSync(path, "utf-8")) as { lugar: Record<string, unknown> };
  const lugar = spec.lugar as Record<string, { valor?: unknown }> & {
    ubicacion_real: { rotacion_deg: number; lat: number; lon: number; radio_m: number };
  };
  if (info.nodo_cruce === undefined) throw new Error(`${extracto}: falta nodo_cruce`);
  const t = templateFromCrossing(crossingAt(resp, info.nodo_cruce));
  const want: [string, unknown, unknown][] = [
    ["tipo_via", lugar.tipo_via?.valor, t.tipo_via],
    ["sentidos", lugar.sentidos?.valor, t.sentidos],
    ["carriles_por_sentido", lugar.carriles_por_sentido?.valor, t.carriles_por_sentido],
    [
      "carriles_por_sentido_secundaria",
      lugar.carriles_por_sentido_secundaria?.valor,
      t.carriles_por_sentido_secundaria,
    ],
    ["ubicacion_real.rotacion_deg", lugar.ubicacion_real.rotacion_deg, t.rotacion_deg],
  ];
  for (const [campo, tiene, deberia] of want) {
    if (tiene !== deberia) {
      console.error(`${escena}: ${campo} es ${String(tiene)} y el mapa da ${String(deberia)}`);
      problems++;
    }
  }
  const red = redVialFrom(resp, {
    lat: lugar.ubicacion_real.lat,
    lon: lugar.ubicacion_real.lon,
    radioM: lugar.ubicacion_real.radio_m,
    rotacionDeg: lugar.ubicacion_real.rotacion_deg,
    nodoCruce: info.nodo_cruce,
  });
  if (check) {
    if (!isDeepStrictEqual(lugar.red_vial, red)) {
      console.error(
        `${escena}: red_vial desactualizada; corre \`pnpm --filter @croquis/croquis-2d generate\`.`,
      );
      problems++;
    }
  } else {
    spec.lugar.red_vial = red;
    writeFileSync(path, JSON.stringify(spec, null, 2) + "\n", "utf-8");
    console.log(`Escrita la red vial de ${escena} (${red.vias.length} calles)`);
  }
}
if (problems > 0) process.exit(1);
if (check) console.log("Redes viales de las escenas al día.");
