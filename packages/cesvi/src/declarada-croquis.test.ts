/**
 * T6.2 (W7): la versión declarada de un conductor en el croquis 2D del mapa, junto a la
 * reconstrucción. Con el resultado versionado de la escena `alcance`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { distanciaM } from "./geo";
import {
  posicionesDeclaradasEnTiempo,
  posicionesEnTiempo,
  type EscenaSolver,
} from "./reconstruccion";

type Json = Record<string, unknown>;
interface Tr {
  t: number[];
  x: number[];
  y: number[];
  rumbo: number[];
}
const here = dirname(fileURLToPath(import.meta.url));
const RESULTADO = JSON.parse(
  readFileSync(resolve(here, "../../scene-schema/fixtures/resultados/alcance.json"), "utf8"),
) as Json & {
  vehiculos: { id: string; trayectoria: Tr }[];
  eventos: { tipo: string; t: number }[];
};

/** Lo que usan las posiciones en el mapa: el origen (el punto de impacto) y los ids del expediente. */
const BASE = {
  origen: [-99.6557, 19.2826],
  ids: { "veh-a": "V1", "veh-b": "V2" },
} as unknown as EscenaSolver;

/** La versión declarada: la reconstrucción con un vehículo corrido `dy` metros al norte. */
function corrida(id: string, dy: number): typeof RESULTADO {
  const d = structuredClone(RESULTADO);
  const v = d.vehiculos.find((x) => x.id === id)!;
  v.trayectoria.y = v.trayectoria.y.map((y) => y + dy);
  return d;
}

describe("la versión declarada en el croquis del mapa", () => {
  it("si coincide con la reconstrucción, no se dibuja nada", () => {
    expect(posicionesDeclaradasEnTiempo(BASE, RESULTADO, structuredClone(RESULTADO), 0)).toEqual(
      [],
    );
  });

  it("solo el vehículo que va por otro lado, a esa distancia de su posición reconstruida", () => {
    const rec = posicionesEnTiempo(BASE, RESULTADO, -1).find((p) => p.vehiculo === "V1")!;
    const [d, ...otros] = posicionesDeclaradasEnTiempo(BASE, RESULTADO, corrida("veh-a", 3), -1);
    expect(otros).toEqual([]);
    expect(d!.vehiculo).toBe("V1");
    expect(d!.declarada).toBe(true);
    expect(d!.rumbo).toBeCloseTo(rec.rumbo, 9);
    const m = distanciaM([rec.punto.lon, rec.punto.lat], [d!.punto.lon, d!.punto.lat]);
    expect(m).toBeGreaterThan(2.95);
    expect(m).toBeLessThan(3.05);
    // Al norte: misma longitud, más latitud.
    expect(d!.punto.lat).toBeGreaterThan(rec.punto.lat);
    expect(d!.punto.lon).toBeCloseTo(rec.punto.lon, 7);
  });

  it("menos del umbral de separación no cuenta", () => {
    expect(posicionesDeclaradasEnTiempo(BASE, RESULTADO, corrida("veh-a", 0.4), 0)).toEqual([]);
    expect(
      posicionesDeclaradasEnTiempo(BASE, RESULTADO, corrida("veh-a", 0.4), 0, 0.2),
    ).toHaveLength(1);
  });

  it("las dos versiones se alinean por su impacto", () => {
    // La misma versión con su reloj 2 s adelantado: en el mapa no difiere en ningún instante.
    const d = structuredClone(RESULTADO);
    for (const v of d.vehiculos) v.trayectoria.t = v.trayectoria.t.map((t) => t + 2);
    d.eventos = d.eventos.map((e) => ({ ...e, t: e.t + 2 }));
    for (const t of [-1.5, 0, 0.8]) {
      expect(posicionesDeclaradasEnTiempo(BASE, RESULTADO, d, t)).toEqual([]);
    }
  });

  it("sin origen en el mapa, o con un vehículo que no está en las dos versiones, no hay nada", () => {
    const sinOrigen = { ...BASE, origen: null } as unknown as EscenaSolver;
    expect(posicionesDeclaradasEnTiempo(sinOrigen, RESULTADO, corrida("veh-a", 3), 0)).toEqual([]);
    const sinA = corrida("veh-a", 3);
    sinA.vehiculos = sinA.vehiculos.filter((v) => v.id !== "veh-a");
    expect(posicionesDeclaradasEnTiempo(BASE, RESULTADO, sinA, 0)).toEqual([]);
  });
});
