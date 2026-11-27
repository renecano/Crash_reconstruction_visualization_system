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
    // Con lo medido como restricción (René, 2026-11-26), los reposos que propone el paso 4 para este
    // recorrido quedan a más de 5σ del mejor ajuste y su rango no lo contiene: el candado no da cifra
    // y dice qué revisar. Antes daba 62.8 km/h (CESVI: 60.27–63.15) porque la soft-L1 descontaba un
    // reposo medido a 8.9σ. Revisar la propuesta del paso 4 queda en «Endurecimiento pendiente».
    expect(r.noCuadra).toBeTruthy();
    expect(r.velocidades.every((v) => v.previa === null)).toBe(true);
    expect(r.noCuadra!.revisar.join(" ")).toMatch(/posiciones finales/);
  }, 60_000);
});
