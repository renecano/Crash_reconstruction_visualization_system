import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import { fullResult } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { expedienteAxaReconstruccion } from "@/lib/axa-reconstruccion";
import * as facil from "@/lib/escena-facil";
import { escenaComoPerito, type EscenaComoPerito } from "@/lib/ejemplo-como-perito";
import { conLugarDelEjemplo } from "@/lib/ejemplos-narracion";
import { RECETAS_PERITO } from "@/lib/recetas-perito";
import { armarRelieve, defaultRelieveDeps, RelieveIn } from "@/server/relieve";

/**
 * La tabla de cifras de la ronda 4 que aprueba René (2026-11-21): AXA, los cinco ejemplos y las siete
 * narraciones, con el solver y sin navegador, en el árbol donde corre (producción o el #284). Los
 * ejemplos van con la colocación de su receta (`e2e/recetas-ejemplos.ts`) hecha con las mismas
 * funciones de La escena; las narraciones, con la colocación que propone La escena del #284
 * (`fixtures/caso3d-narraciones/colocaciones.json`), la misma en los dos árboles. Lo que cambia entre
 * los dos es solo el código: la lectura, la masa, la velocidad declarada y la física.
 *
 *   CROQUIS_CIFRAS=<salida.json> pnpm --filter @croquis/web exec vitest run src/lib/cifras-ronda4.test.ts
 */
const RAIZ = resolve(__dirname, "../../../..");
type Json = Record<string, unknown>;
const MUESTRAS = { samples: 32, mcSamples: 128 };
export function lectura(ruta: string): { e: Expediente; narracion: string } {
  const g = JSON.parse(readFileSync(resolve(RAIZ, ruta), "utf8")) as {
    narracion: string;
    salida: SalidaCorpus;
  };
  return { e: cesvi.escenaDeNarracion(g.salida, g.narracion).expediente, narracion: g.narracion };
}

/** La escena del perito de cada ejemplo, para la prueba que la compara con la de la app. */
function guardarEscenaDelPerito(clave: string, a: EscenaComoPerito): void {
  const dir = resolve(RAIZ, "eval/results/ejemplos_como_perito");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, `${clave}.json`),
    `${JSON.stringify(
      {
        clave,
        propuesta: { puntos: a.propuesta.puntos, versiones: a.propuesta.expediente.versiones },
        puntos: a.puntos,
        notas: a.notas,
        toques: a.toques,
        versiones: a.expediente.versiones,
      },
      null,
      1,
    )}\n`,
  );
}

/** Como la web: el relieve real si se pide y la velocidad típica donde exista (en el #284). */
export async function reconstruir(e0: Expediente, id: string) {
  let e = e0;
  let base = cesvi.especDeExpediente(e, id);
  const usa = (cesvi as Json).usaRelieve as ((x: Expediente) => boolean) | undefined;
  const malla =
    usa?.(e) && base.origen
      ? cesvi.relieveEnEscena(
          (await armarRelieve(
            RelieveIn.parse(cesvi.puntoDeRelieve(base.origen)),
            defaultRelieveDeps(),
          )) as never,
          base.origen,
        )
      : null;
  let r = cesvi.interpretarResultado(
    base,
    fullResult(base.spec, { ...MUESTRAS, relieve: malla as never }),
    { relieve: malla },
  );
  const tipicas = (cesvi as Json).expedienteConTipicas as
    ((x: Expediente, y: unknown) => Expediente | null) | undefined;
  const e2 = tipicas?.(e, r) ?? null;
  if (e2) {
    e = e2;
    base = cesvi.especDeExpediente(e, id);
    r = cesvi.interpretarResultado(
      base,
      fullResult(base.spec, { ...MUESTRAS, relieve: malla as never }),
      { relieve: malla },
    );
  }
  return { r, e, malla };
}

function fila(
  grupo: string,
  clave: string,
  cifra: string | null,
  e: Expediente,
  r: ReturnType<typeof cesvi.interpretarResultado>,
  malla: unknown,
) {
  return {
    grupo,
    clave,
    cifra_de: cifra,
    vehiculos: e.vehiculos.map((v) => ({
      id: v.id,
      nombre: facil.nombreVehiculo(v, e.vehiculos),
      clase: v.clase ?? null,
      masa_kg: v.masa?.valor ?? null,
      masa_fuente: v.masa?.fuente ?? null,
      declarada: (v as Json).velocidad_narrada ?? null,
    })),
    velocidades: r.velocidades.map((v) => ({
      vehiculo: v.vehiculo,
      mejor: v.previa ? Math.round(v.previa.mejor) : null,
      p10: v.previa?.p10 == null ? null : Math.round(v.previa.p10),
      p90: v.previa?.p90 == null ? null : Math.round(v.previa.p90),
    })),
    relieve: Boolean(malla),
    topes: e.terreno?.topes?.length ?? 0,
    limites: r.limites,
  };
}

describe("la tabla de cifras de la ronda 4", () => {
  it.skipIf(!process.env.CROQUIS_CIFRAS)(
    "mide AXA, los cinco ejemplos y las siete narraciones",
    async () => {
      const filas: Json[] = [];
      const axa = expedienteAxaReconstruccion();
      const ra = await reconstruir(axa, "axa-a2010930");
      filas.push(fila("axa", "axa", "V2", ra.e, ra.r, ra.malla));
      const ej = JSON.parse(
        readFileSync(resolve(RAIZ, "data/cesvi/ejemplos/narraciones.json"), "utf8"),
      ) as {
        ejemplos: { clave: string; grabacion?: string; lugar: { lat: number; lon: number } }[];
      };
      // Cada ejemplo como lo arma el perito en La escena (René, 2026-11-26): la escena que propone La
      // escena en su lugar guardado, con sus calles, corregida según la narración, con las mismas
      // funciones que usa la app (`ejemplo-como-perito.ts`). La escena queda en
      // `eval/results/ejemplos_como_perito/` para compararla con la de la app.
      for (const receta of RECETAS_PERITO) {
        const x = ej.ejemplos.find((y) => y.clave === receta.clave)!;
        const g = JSON.parse(
          readFileSync(
            resolve(RAIZ, `data/cesvi/grabaciones/${x.grabacion ?? `ejemplos/${x.clave}.json`}`),
            "utf8",
          ),
        ) as { narracion: string; salida: SalidaCorpus };
        const leida = cesvi.escenaDeNarracion(g.salida, g.narracion);
        const e0 = conLugarDelEjemplo(
          g.narracion,
          leida.expediente as never,
        ) as unknown as Expediente;
        const armada = escenaComoPerito(e0, g.narracion, leida.posiciones, receta);
        guardarEscenaDelPerito(receta.clave, armada);
        const { r, e: final, malla } = await reconstruir(armada.expediente, "caso-nuevo");
        filas.push(fila("ejemplo", receta.clave, receta.cifra, final, r, malla));
      }
      const colocaciones = resolve(
        RAIZ,
        "packages/scene-schema/fixtures/caso3d-narraciones/colocaciones.json",
      );
      if (existsSync(colocaciones)) {
        const c = JSON.parse(readFileSync(colocaciones, "utf8")) as Record<
          string,
          { versiones: unknown }
        >;
        for (const clave of ["arbol", "poste", "puente", "subida", "bajada", "curva"]) {
          const { e } = lectura(`data/cesvi/grabaciones/ronda4/ronda4-${clave}.json`);
          // La misma colocación en los dos árboles (la que propuso La escena del #284).
          const colocado = { ...e, versiones: c[clave]!.versiones } as Expediente;
          const { r, e: final, malla } = await reconstruir(colocado, `narracion-${clave}`);
          filas.push(fila("narracion", clave, null, final, r, malla));
        }
        const t = JSON.parse(
          readFileSync(resolve(RAIZ, "data/cesvi/casos/tollocan-rene.croquis"), "utf8"),
        ) as { expediente: Expediente };
        const rt = await reconstruir(t.expediente, "narracion-tollocan");
        filas.push(fila("narracion", "tollocan", "V1", rt.e, rt.r, rt.malla));
      }
      mkdirSync(dirname(resolve(process.env.CROQUIS_CIFRAS!)), { recursive: true });
      writeFileSync(
        resolve(process.env.CROQUIS_CIFRAS!),
        JSON.stringify({ fecha: new Date().toISOString(), muestras: MUESTRAS, filas }, null, 2) +
          "\n",
      );
      expect(filas.length).toBeGreaterThan(5);
    },
    1_800_000,
  );
});
