import { describe, expect, it } from "vitest";
import { caso } from "./caso";
import { problemasExpediente } from "./corpus";
import { reconstruirExpediente } from "./reconstruccion";
import { expedienteDelRecorrido } from "./recorrido-3d";
import { proponerVersiones } from "./versiones";

const c = caso("A2010930");
/** La versión de la evidencia del recorrido, como la propone el paso 4 (carretera sur a norte). */
const evidencia = proponerVersiones({
  impacto: [-109.0597, 26.20915],
  rumboVia: 0,
  medidas: { A: { largo: 5.34, ancho: 1.86 }, B: { largo: 5.34, ancho: 1.86 } },
  distanciaRestos: c.evidencia.restos.distancia_m.valor,
  reversaM: 3,
}).evidencia;

describe("el caso del recorrido en 3D (R9)", () => {
  const e = expedienteDelRecorrido(c, evidencia);

  it("es un expediente válido con lo del reporte y las posiciones de la evidencia", () => {
    expect(problemasExpediente(e)).toEqual([]);
    expect(e.vehiculos.map((v) => v.id)).toEqual(["V1", "V2"]);
    expect(e.vehiculos[1]!.masa).toMatchObject({ valor: 1431.083, unidad: "kg" });
    expect(e.evidencias?.restos?.longitud?.valor).toBe(15.89);
    expect(e.versiones![0]!.posiciones).toHaveLength(4);
  });

  it("sin evidencia va sin posiciones y con el lugar ilustrativo como supuesto (V2)", () => {
    const sin = expedienteDelRecorrido(c, null, {
      lat: 26.2,
      lon: -109.06,
      descripcion: "Ubicación ilustrativa",
    });
    expect(problemasExpediente(sin)).toEqual([]);
    expect(sin.versiones).toBeUndefined();
    expect(sin.caso.lugar?.coordenadas).toEqual({ lat: 26.2, lon: -109.06 });
    expect(sin.caso.lugar?.descripcion?.fuente).toBe("supuesto");
  });

  it("el solver reconstruye el alcance: B golpea con su frente la parte posterior de A", () => {
    const r = reconstruirExpediente(e, "recorrido-a2010930");
    const vs = r.resultado.vehiculos as { id: string; dano: { cdc: { lado: string } | null } }[];
    const lado = (id: string) => vs.find((v) => r.ids[v.id] === id)!.dano.cdc?.lado;
    expect(lado("V1")).toBe("B");
    expect(lado("V2")).toBe("F");
    // El reporte no dice si la Silverado (A, V1) se movía; se compara contra el cálculo de CESVI
    // (René, 2026-11-25). CESVI calcula la Tacoma (B, V2) en 63.15 km/h por la deformación y en
    // 60.27 km/h por los restos: la cifra de Croquis queda dentro de ±10 % de ese par. De la
    // Silverado, CESVI no da velocidad: solo se pide que no sea negativa.
    const kmh = (id: string) => r.velocidades.find((v) => v.vehiculo === id)!.previa!.mejor;
    expect(kmh("V2")).toBeGreaterThanOrEqual(60.27 * 0.9);
    expect(kmh("V2")).toBeLessThanOrEqual(63.15 * 1.1);
    expect(kmh("V1")).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
