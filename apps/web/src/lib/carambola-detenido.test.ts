/**
 * La carambola de la e2e (René, 2026-11-25: «línea base distinta»). El Mazda (B) sale con 0 km/h en
 * la reconstrucción; arrancaba 12 m antes de su posición de impacto (supuesto) y con 0 km/h se
 * quedaba ahí: en el 3D y en la simulación de los conductores, el Versa lo alcanzaba 1.8 s antes del
 * choque. Ahora un vehículo con 0 km/h arranca detenido donde el perito lo puso en el impacto.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  especConConductor,
  especDeExpediente,
  especReconstruida,
  interpretarResultado,
  leerPruebaConductores,
  type Expediente,
} from "@croquis/cesvi";
import { fullResult, PRODUCTION_SAMPLES } from "../../../../packages/solver-ts/src/full-result";
import { reconstruct, reconstructionToDict } from "../../../../packages/solver-ts/src/reconstruct";
import { simulateDrivers } from "../../../../packages/solver-ts/src/agents";
import { describe, expect, it } from "vitest";

const CASO = JSON.parse(
  readFileSync(
    join(__dirname, "../../../../data/cesvi/grabaciones/carambola/carambola-e2e-caso.json"),
    "utf8",
  ),
) as { expediente: Expediente };

describe("un vehículo con 0 km/h en la reconstrucción", () => {
  it(
    "arranca detenido en su posición de impacto: los conductores dan el mismo primer contacto",
    { timeout: 120_000 },
    () => {
      const base = especDeExpediente(CASO.expediente);
      const r = interpretarResultado(base, fullResult(base.spec, PRODUCTION_SAMPLES));
      const kmh = (id: string) => r.velocidades.find((v) => v.vehiculo === id)!.previa!.mejor;
      // Las cifras no cambian: el Versa a 24 km/h y el Mazda detenido.
      expect(kmh("V1")).toBeCloseTo(23.87, 1);
      expect(kmh("V2")).toBe(0);
      // En la escena del 3D, el Mazda está en su posición de impacto desde el principio.
      const sid = Object.keys(r.ids).find((k) => r.ids[k] === "V2")!;
      const del3d = reconstructionToDict(reconstruct(especReconstruida(r))) as {
        vehiculos: { id: string; trayectoria: { t: number[]; x: number[]; y: number[] } }[];
      };
      const tr = del3d.vehiculos.find((v) => v.id === sid)!.trayectoria;
      const k0 = tr.t.findIndex((t) => Math.abs(t) < 1e-6);
      expect(Math.hypot(tr.x[0]! - tr.x[k0]!, tr.y[0]! - tr.y[k0]!)).toBeLessThan(0.1);
      const pose = base.posesDeImpacto![sid]!;
      expect(Math.hypot(tr.x[k0]! - pose.x, tr.y[k0]! - pose.y)).toBeLessThan(0.1);
      // Sin la hipótesis, los conductores chocan donde y cuando la reconstrucción.
      const spec = especConConductor(r, { vehiculo: "V3", decision: "frenar", segundosAntes: 2.5 });
      const p = leerPruebaConductores(r, simulateDrivers(spec, reconstruct(spec))!.toDict());
      expect(p.lineaBaseDistinta).toBeNull();
      expect(p.sinHipotesis).toMatchObject({ contacto: true, t: 0, vehiculos: ["V1", "V2"] });
    },
  );
});
