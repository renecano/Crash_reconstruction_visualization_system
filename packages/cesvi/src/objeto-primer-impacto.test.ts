/**
 * Ronda 4 (René, 2026-11-18): el árbol o el poste narrado aparece donde el perito marcó el choque, y el
 * auto choca contra él ahí. Antes iba en la posición de la plantilla (6, −6) y el solver desviaba al
 * auto hacia él, fuera de la vía.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { conPosicion, escenaDeNarracion } from "./escena-narracion";
import { especDeExpediente, reconstruirExpediente } from "./reconstruccion";

type Json = Record<string, unknown>;
const g = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
    ),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const crucero = escenaDeNarracion(g.salida, g.narracion).expediente;
const P = { lat: 19.29, lon: -99.6 };
const m = (n: number, e: number) => ({
  lat: P.lat + n / 111320,
  lon: P.lon + e / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});

function contra(objeto: string): Expediente {
  const e: Expediente = {
    ...crucero,
    vehiculos: crucero.vehiculos.filter((v) => v.id === "V1"),
    danos: [],
    impactos: [{ orden: 1, vehiculos: ["V1"], objeto_fijo: objeto, fuente: "perito" }],
    versiones: [],
  } as Expediente;
  // Hacia el oriente (rumbo 90 desde el norte).
  return conPosicion(e, { vehiculo: "V1", fase: "impacto", punto: m(0, 0), rumbo: 90 });
}

describe("el objeto del primer impacto, donde fue el choque (René, 2026-11-18)", () => {
  for (const objeto of ["árbol", "poste"]) {
    it(
      `el ${objeto} va frente al vehículo y el choque ocurre ahí, con su ΔV`,
      { timeout: 240_000 },
      () => {
        const e = contra(objeto);
        const base = especDeExpediente(e);
        const obj = ((base.spec.entorno as Json).objetos as Json[]).find((o) => o.id === "obj-1")!;
        const pos = obj.posicion as { x: number; y: number };
        // El frente de un sedán está a ~2.4 m del centro: el objeto, al oriente del choque y en su eje.
        expect(pos.x).toBeGreaterThan(1.5);
        expect(pos.x).toBeLessThan(3.5);
        expect(Math.abs(pos.y)).toBeLessThan(0.3);
        const r = reconstruirExpediente(e, "objeto", { samples: 8, mcSamples: 8 });
        const res = r.resultado as Json;
        const pi = res.punto_impacto as { x: number; y: number };
        expect(Math.hypot(pi.x - pos.x, pi.y - pos.y)).toBeLessThan(1.0);
        const v = (res.vehiculos as Json[])[0]!;
        expect(Number(v.delta_v_kmh)).toBeGreaterThan(5);
        // Sin desvío inferido hacia otro lado.
        expect(((res.banderas ?? []) as string[]).join(" ")).not.toMatch(/desvío lateral/);
      },
    );
  }
});
