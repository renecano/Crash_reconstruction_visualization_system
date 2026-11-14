/**
 * Las tomas del modo foto del visor de escritorio (material promocional, René 2026-11-13): los
 * paquetes caso-3d de cada toma, las poses finales de cada muestra del Monte Carlo (la «nube») y
 * `tomas.json`, en `apps/visor-unity/Build/fotos-promo/` (fuera de git). Es solo para publicidad:
 * no cambia ningún número ni el flujo del perito.
 *
 * - La reconstrucción de cada escena es la de siempre (el Resultado versionado o el del solver de
 *   producción); solo cambia con qué luz se dibuja (día, noche o la hora dorada: «atardecer»).
 * - AXA con su relieve real: el de `/api/relieve` del sitio publicado para su `ubicacion_real`, con
 *   el que el solver recalcula el caso (W5), como en la app.
 * - La nube: el mismo Monte Carlo del Resultado (`monteCarlo`, misma semilla y muestras), mirando
 *   cada muestra con `alMuestra`. Se comprueba que sus percentiles sean los del Resultado.
 *
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-promo.mts
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escenarioDe } from "../../apps/web/src/components/visor-unity/escenario";
import { armarCaso3d, caso3dErrors, type Caso3D } from "../../packages/scene-schema/src/caso3d";
import type { EscenaSpec } from "../../packages/scene-schema/src/generated/escena.zod";
import type { Resultado } from "../../packages/scene-schema/src/generated/resultado.zod";
import { fullResult, PRODUCTION_SAMPLES } from "../../packages/solver-ts/src/full-result";
import { distribution } from "../../packages/solver-ts/src/inversion";
import { monteCarlo } from "../../packages/solver-ts/src/montecarlo";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SALIDA = join(RAIZ, "apps/visor-unity/Build/fotos-promo");
const CASOS = join(SALIDA, "casos");
const SITIO = process.env.CROQUIS_URL ?? "https://croquis-sage.vercel.app";
const leer = <T,>(p: string) => JSON.parse(readFileSync(join(RAIZ, p), "utf8")) as T;
type Json = Record<string, unknown>;
type Luz = "dia" | "noche" | "dorada";

/** La misma escena con otra luz; sin hora declarada, el cielo sale de la iluminación. */
function conLuz(escena: EscenaSpec, luz: Luz): EscenaSpec {
  const { fecha_hora: _hora, ...entorno } = escena.entorno;
  void _hora;
  const fuente = { fuente: "default" as const, confianza: 0.5 };
  const valor = luz === "dia" ? "dia" : luz === "dorada" ? "atardecer" : "noche_con_alumbrado";
  return {
    ...escena,
    entorno: {
      ...entorno,
      iluminacion: { valor, ...fuente },
      alumbrado_publico: { valor: luz === "noche", ...fuente },
    },
  } as EscenaSpec;
}

function paquete(
  nombre: string,
  escena: EscenaSpec,
  r: Resultado,
  luz: Luz,
  relieve: unknown = null,
) {
  const p = armarCaso3d(
    escena,
    r,
    relieve as Parameters<typeof armarCaso3d>[2],
    escenarioDe(conLuz(escena, luz), r),
  );
  const errores = caso3dErrors(p);
  if (errores.length) throw new Error(`${nombre}:\n${errores.slice(0, 5).join("\n")}`);
  writeFileSync(join(CASOS, `${nombre}.json`), JSON.stringify(p));
  const a = (p as unknown as { escenario?: { ambiente?: { sol_elevacion_deg?: number } } })
    .escenario?.ambiente;
  console.log(`${nombre}: sol a ${a?.sol_elevacion_deg ?? "?"}°`);
  return p;
}

/** Las poses finales de cada muestra del Monte Carlo, y que den los percentiles del Resultado. */
function nube(nombre: string, escena: EscenaSpec, r: Resultado) {
  const inc = r.incertidumbre as unknown as {
    semilla: number;
    muestras: number;
    validas: number;
    vehiculos: { id: string; reposo_x_m: { p50: number }; reposo_y_m: { p50: number } }[];
  };
  const poses: Record<string, [number, number, number][]> = {};
  const mc = monteCarlo(escena as unknown as Json, {
    samples: inc.muestras,
    seed: inc.semilla,
    alMuestra: (_i, rec) => {
      for (const v of rec.vehiculos) (poses[v.id] ??= []).push([...v.restPose]);
    },
  }).toDict() as { validas: number };
  if (mc.validas !== inc.validas)
    throw new Error(
      `${nombre}: ${mc.validas} muestras válidas contra ${inc.validas} del Resultado`,
    );
  for (const v of inc.vehiculos) {
    const xs = (poses[v.id] ?? []).map((p) => p[0]);
    const ys = (poses[v.id] ?? []).map((p) => p[1]);
    const dx = Math.abs(distribution(xs).p50 - v.reposo_x_m.p50);
    const dy = Math.abs(distribution(ys).p50 - v.reposo_y_m.p50);
    if (dx > 1e-4 || dy > 1e-4)
      throw new Error(`${nombre}: la mediana del reposo de ${v.id} no es la del Resultado`);
  }
  writeFileSync(
    join(CASOS, `${nombre}.nube.json`),
    JSON.stringify({ semilla: inc.semilla, validas: inc.validas, vehiculos: poses }),
  );
  console.log(`${nombre}: nube de ${inc.validas} muestras, mismas medianas que el Resultado`);
}

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(CASOS, { recursive: true });

const fixture = (n: string) => leer<Caso3D>(`packages/scene-schema/fixtures/caso3d/${n}.json`);
const lateral = fixture("lateral_interseccion");
paquete("lateral_interseccion-dia", lateral.escena, lateral.resultado, "dia");
paquete("lateral_interseccion-dorada", lateral.escena, lateral.resultado, "dorada");
nube("lateral_interseccion", lateral.escena, lateral.resultado);
const lluvia = fixture("nocturno_lluvia");
paquete("nocturno_lluvia-noche", lluvia.escena, lluvia.resultado, "noche");
const terraceria = fixture("terraceria_topes");
paquete("terraceria-dia", terraceria.escena, terraceria.resultado, "dia");
const carambola = fixture("carambola");
paquete("carambola-dia", carambola.escena, carambola.resultado, "dia");
nube("carambola", carambola.escena, carambola.resultado);

// AXA: como la abre la app (la escena de la demostración y el solver de producción).
const axa = leer<EscenaSpec>("demo/escenas-r11/axa.json");
const axaR = fullResult(axa as unknown as Json, PRODUCTION_SAMPLES) as unknown as Resultado;
paquete("axa-noche", axa, axaR, "noche");
paquete("axa-dia", axa, axaR, "dia");
nube("axa", axa, axaR);

// AXA con el relieve real de su lugar.
const u = (axa.lugar as unknown as { ubicacion_real?: { lat: number; lon: number } })
  .ubicacion_real;
if (u) {
  const resp = await fetch(`${SITIO}/api/relieve?lat=${u.lat}&lon=${u.lon}&lado_m=600`);
  if (!resp.ok) throw new Error(`/api/relieve respondió ${resp.status}`);
  const relieve = (await resp.json()) as Json;
  const conRelieve = fullResult(axa as unknown as Json, {
    ...PRODUCTION_SAMPLES,
    relieve: relieve as never,
  }) as unknown as Resultado;
  paquete("axa-relieve-dia", axa, conRelieve, "dia", relieve);
  writeFileSync(
    join(SALIDA, "relieve-axa.json"),
    JSON.stringify({ fuente: relieve.fuente ?? null, licencia: relieve.licencia ?? null }, null, 2),
  );
}

// Las tomas. Cámaras: `objetivo` (vehículo, «impacto» o [x, y]), `azimut` desde el norte (o desde
// el frente del vehículo con `relativo`), `distancia`, `altura`, `mira`, `fov`; `modo` usa una
// cámara del visor. Las de ingeniería llevan `capa` y salen también «limpias».
const tomas = [
  // Exterior.
  {
    id: "01-lateral-a-ras-del-piso",
    caso: "casos/lateral_interseccion-dia.json",
    t: 0,
    camara: { objetivo: "impacto", azimut: 200, distancia: 7.5, altura: 0.35, mira: 0.7, fov: 30 },
  },
  {
    id: "02-lateral-hora-dorada",
    caso: "casos/lateral_interseccion-dorada.json",
    t: 0.6,
    camara: { objetivo: "impacto", azimut: 265, distancia: 26, altura: 4.5, mira: 1, fov: 30 },
  },
  {
    id: "03-axa-noche-faros",
    caso: "casos/axa-noche.json",
    t: -0.8,
    camara: {
      objetivo: "veh-a",
      relativo: true,
      azimut: 160,
      distancia: 9,
      altura: 0.6,
      mira: 0.8,
      fov: 30,
    },
  },
  {
    id: "04-lluvia-reflejos",
    caso: "casos/nocturno_lluvia-noche.json",
    t: 0.4,
    camara: { objetivo: "impacto", azimut: 272, distancia: 15, altura: 0.9, mira: 0.7, fov: 32 },
  },
  {
    id: "05-terraceria-topes",
    caso: "casos/terraceria-dia.json",
    t: -1,
    camara: { objetivo: [-9, -6], azimut: 80, distancia: 3.2, altura: 0.4, mira: 0.25, fov: 40 },
  },
  {
    id: "06-carambola-aerea",
    caso: "casos/carambola-dia.json",
    t: 1,
    camara: { objetivo: "impacto", azimut: 200, distancia: 22, altura: 34, mira: 0, fov: 36 },
  },
  // Ingeniería.
  {
    id: "11-rayos-x",
    caso: "casos/lateral_interseccion-dia.json",
    t: "fin",
    capa: "rayos_x",
    vehiculo: "veh-a",
    camara: {
      objetivo: "veh-a",
      relativo: true,
      azimut: 35,
      distancia: 6.5,
      altura: 2.6,
      mira: 0.6,
      fov: 34,
    },
  },
  {
    id: "12-estroboscopica",
    caso: "casos/lateral_interseccion-dia.json",
    t: "fin",
    capa: "estroboscopica",
    paso: 0.1,
    desde: -2,
    camara: { objetivo: "impacto", azimut: 200, distancia: 20, altura: 26, mira: 0, fov: 40 },
  },
  {
    id: "13-nube-incertidumbre",
    caso: "casos/lateral_interseccion-dia.json",
    t: "fin",
    capa: "nube",
    nube: "casos/lateral_interseccion.nube.json",
    camara: { objetivo: [-1.3, 5.5], azimut: 200, distancia: 12, altura: 28, mira: 0, fov: 40 },
  },
  {
    id: "14-terreno-topes",
    caso: "casos/terraceria-dia.json",
    t: -1.4,
    capa: "alambre",
    lado: 40,
    malla: 1,
    camara: { objetivo: [-6, -6], azimut: 200, distancia: 16, altura: 9, mira: 0, fov: 40 },
  },
  {
    id: "15-terreno-relieve-real",
    caso: "casos/axa-relieve-dia.json",
    t: 0,
    capa: "alambre",
    lado: 80,
    malla: 2,
    camara: { objetivo: "impacto", azimut: 230, distancia: 34, altura: 18, mira: 0, fov: 40 },
  },
  {
    id: "16-ficha-lateral",
    caso: "casos/lateral_interseccion-dia.json",
    t: -3,
    capa: "ficha_lateral",
    vehiculo: "veh-a",
    camara: {
      objetivo: "veh-a",
      relativo: true,
      azimut: 90,
      distancia: 12,
      altura: 0.7,
      mira: 0.7,
      orto: 2.1,
    },
  },
  {
    id: "17-ficha-planta",
    caso: "casos/lateral_interseccion-dia.json",
    t: -3,
    capa: "ficha_planta",
    vehiculo: "veh-a",
    camara: {
      objetivo: "veh-a",
      relativo: true,
      azimut: 0,
      distancia: 0.01,
      altura: 12,
      mira: 0,
      orto: 2.6,
    },
  },
  {
    id: "18-conductor-visibilidad",
    caso: "casos/lateral_interseccion-dia.json",
    t: -1,
    capa: "cono",
    vehiculo: "veh-a",
    camara: { objetivo: [-8, -7], azimut: 245, distancia: 12, altura: 16, mira: 0, fov: 42 },
  },
  {
    id: "19-conductor-vista",
    caso: "casos/lateral_interseccion-dia.json",
    t: -1,
    capa: "cono",
    vehiculo: "veh-a",
    camara: { modo: "conductor:veh-a" },
  },
];
writeFileSync(
  join(SALIDA, "tomas.json"),
  JSON.stringify({ ancho: 3840, alto: 2160, calidad: "ultra", tomas }, null, 2),
);
console.log(`${tomas.length} tomas en ${join(SALIDA, "tomas.json")}`);
