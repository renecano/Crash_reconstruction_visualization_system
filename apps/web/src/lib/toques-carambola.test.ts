import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import { fullResult } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { escenaComoPerito, type LugarTocado, type RecetaPerito } from "@/lib/ejemplo-como-perito";
import { conLugarDelEjemplo } from "@/lib/ejemplos-narracion";
import { RECETAS_PERITO } from "@/lib/recetas-perito";

/**
 * ¿Cuánto se mueve la cifra de la carambola con un toque de diferencia? (René, 2026-11-26: el ensayo
 * de Alberto dio 24 (20–30) y el índice 25 (20–32), con la misma receta; «un perito no debería
 * obtener cifras distintas por un toque de diferencia»).
 *
 * La receta del índice (`recetas-perito.ts`) con los lugares que el perito toca a mano movidos al
 * azar hasta ±`TOQUE_M` en cada eje (lo que se aparta un dedo en el mapa a la escala de La escena);
 * «junto» es un botón y no se mueve. Mismo armado y mismas muestras que la tabla del índice
 * (`cifras-ronda4.test.ts`), sin relieve (la carambola es plana). A mano:
 *
 *   CROQUIS_TOQUES=eval/results/carambola_toques/<etiqueta>.json pnpm exec vitest run src/lib/toques-carambola.test.ts
 */
type Json = Record<string, unknown>;
const RAIZ = resolve(__dirname, "../../../..");
const MUESTRAS = { samples: 32, mcSamples: 128 };
const CLAVE = "carambola-lluvia";
/** m: lo que se aparta el toque del perito, en cada eje. */
export const TOQUE_M = 1.0;
const VARIANTES = 12;
const SEMILLA = 20_261_126;

/** Un generador con semilla explícita (mulberry32). */
function azar(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function movido(lugar: LugarTocado, dx: number, dy: number): LugarTocado {
  if (Array.isArray(lugar)) return [lugar[0] + dx, lugar[1] + dy] as const;
  const l = lugar as { de: string; adelante: number; izquierda?: number };
  return { de: l.de, adelante: l.adelante + dx, izquierda: (l.izquierda ?? 0) + dy };
}

describe("la cifra de la carambola con un toque de diferencia", () => {
  it.skipIf(!process.env.CROQUIS_TOQUES)(
    "mide la cifra con los lugares tocados movidos hasta ±1 m",
    () => {
      const base = RECETAS_PERITO.find((r) => r.clave === CLAVE)!;
      const g = JSON.parse(
        readFileSync(resolve(RAIZ, `data/cesvi/grabaciones/ejemplos/${CLAVE}.json`), "utf8"),
      ) as { narracion: string; salida: SalidaCorpus };
      const leida = cesvi.escenaDeNarracion(g.salida, g.narracion);
      const e0 = conLugarDelEjemplo(
        g.narracion,
        leida.expediente as never,
      ) as unknown as Expediente;
      const r = azar(SEMILLA);
      const filas: Json[] = [];
      for (let i = 0; i <= VARIANTES; i++) {
        // La variante 0 es la receta tal cual (la del índice).
        const quedo: RecetaPerito["quedo"] = {};
        const toques: Record<string, [number, number]> = {};
        for (const [v, l] of Object.entries(base.quedo)) {
          if (i === 0 || l === "junto" || l === "narracion") {
            quedo[v] = l;
            continue;
          }
          const dx = Math.round((2 * r() - 1) * TOQUE_M * 100) / 100;
          const dy = Math.round((2 * r() - 1) * TOQUE_M * 100) / 100;
          toques[v] = [dx, dy];
          quedo[v] = movido(l, dx, dy);
        }
        const armada = escenaComoPerito(e0, g.narracion, leida.posiciones, { ...base, quedo });
        const esc = cesvi.especDeExpediente(armada.expediente, "caso-nuevo");
        const rec = cesvi.interpretarResultado(esc, fullResult(esc.spec, MUESTRAS));
        const v = rec.velocidades.find((x) => x.vehiculo === base.cifra);
        filas.push({
          variante: i,
          toques,
          mejor: v?.previa ? Math.round(v.previa.mejor * 10) / 10 : null,
          p10: v?.previa?.p10 == null ? null : Math.round(v.previa.p10 * 10) / 10,
          p90: v?.previa?.p90 == null ? null : Math.round(v.previa.p90 * 10) / 10,
          no_cuadra: rec.noCuadra ? rec.noCuadra.motivos : null,
        });
      }
      const conCifra = filas.filter((f) => typeof f.mejor === "number") as {
        mejor: number;
        p10: number;
        p90: number;
      }[];
      const rango = (k: "mejor" | "p10" | "p90") => {
        const xs = conCifra.map((f) => f[k]);
        return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
      };
      const salida = resolve(RAIZ, process.env.CROQUIS_TOQUES!);
      mkdirSync(dirname(salida), { recursive: true });
      writeFileSync(
        salida,
        `${JSON.stringify(
          {
            fecha: new Date().toISOString(),
            clave: CLAVE,
            cifra_de: base.cifra,
            toque_m: TOQUE_M,
            semilla: SEMILLA,
            muestras: MUESTRAS,
            resumen: {
              variantes: filas.length,
              con_cifra: conCifra.length,
              mejor: rango("mejor"),
              p10: rango("p10"),
              p90: rango("p90"),
            },
            filas,
          },
          null,
          2,
        )}\n`,
      );
      expect(filas.length).toBe(VARIANTES + 1);
    },
    3_600_000,
  );
});
