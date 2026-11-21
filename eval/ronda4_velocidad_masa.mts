/**
 * Ronda 4 (René, 2026-11-20): el antes y el después de lo que la lectura le pasa a la física en
 * velocidad y masa, para las 7 narraciones de la ronda 4 y las cinco de «Usar un ejemplo»: la
 * velocidad de cada vehículo (valor, rango, si es una cota y respecto a qué límite) y su masa (de
 * dónde sale, o si se pregunta). De las lecturas grabadas: sin API y sin navegador.
 *
 * Se corre en cada árbol (el commit de antes y la rama) y se comparan los dos archivos:
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/ronda4_velocidad_masa.mts <salida.json> <etiqueta>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SalidaCorpus } from "../packages/cesvi/src/corpus";
import { escenaDeNarracion, preguntaPendiente } from "../packages/cesvi/src/escena-narracion";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [salida, etiqueta] = process.argv.slice(2);
if (!salida || !etiqueta)
  throw new Error("uso: ronda4_velocidad_masa.mts <salida.json> <etiqueta>");

const EJEMPLOS = JSON.parse(
  readFileSync(join(RAIZ, "data/cesvi/ejemplos/narraciones.json"), "utf8"),
) as { ejemplos: { clave: string; grabacion?: string }[] };
const fuentes = [
  ...["arbol", "poste", "puente", "subida", "bajada", "curva", "tollocan"].map((c) => ({
    grupo: "narraciones ronda 4",
    clave: c,
    ruta: `data/cesvi/grabaciones/ronda4/ronda4-${c}.json`,
  })),
  ...EJEMPLOS.ejemplos.map((x) => ({
    grupo: "ejemplos",
    clave: x.clave,
    ruta: `data/cesvi/grabaciones/${x.grabacion ?? `ejemplos/${x.clave}.json`}`,
  })),
];

const filas = fuentes.map(({ grupo, clave, ruta }) => {
  const g = JSON.parse(readFileSync(join(RAIZ, ruta), "utf8")) as {
    narracion: string;
    salida: SalidaCorpus;
  };
  const e = escenaDeNarracion(g.salida, g.narracion);
  const x = e.expediente;
  const pendientes = new Set(
    e.preguntas
      .filter((p) =>
        preguntaPendiente(
          p,
          x,
          e.posiciones.filter((q) => q.fase === "final"),
        ),
      )
      .map((p) => p.clave),
  );
  return {
    grupo,
    clave,
    lugar: x.caso.lugar?.descripcion?.valor ?? null,
    vehiculos: x.vehiculos.map((v) => {
      const vn = v.velocidad_narrada as
        (NonNullable<typeof v.velocidad_narrada> & { cota?: string }) | undefined;
      return {
        id: v.id,
        marca_modelo: [v.marca?.valor, v.modelo?.valor].filter(Boolean).join(" ") || null,
        clase: v.clase ?? null,
        velocidad: vn
          ? {
              kmh: vn.kmh,
              rango_kmh: vn.rango_kmh,
              cota: vn.cota ?? null,
              descripcion: vn.descripcion,
              limite_kmh: vn.limite_kmh ?? null,
              limite_fuente: vn.limite_fuente ?? null,
              cita: vn.cita ?? null,
            }
          : null,
        se_pregunta_velocidad: pendientes.has(`velocidad-${v.id}`),
        masa: v.masa ? { kg: v.masa.valor, fuente: v.masa.fuente } : null,
        se_pregunta_masa: pendientes.has(`masa-${v.id}`),
      };
    }),
  };
});

writeFileSync(
  resolve(salida),
  JSON.stringify(
    {
      descripcion:
        "Ronda 4: velocidad y masa que la lectura le pasa a la física, por vehículo (lecturas grabadas; sin API).",
      etiqueta,
      fecha: new Date().toISOString(),
      filas,
    },
    null,
    2,
  ) + "\n",
);
console.log(`${filas.length} narraciones → ${resolve(salida)}`);
