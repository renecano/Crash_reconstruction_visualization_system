import { especReconstruida, reconstruirExpediente } from "@croquis/cesvi";
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { expedienteAxaReconstruccion } from "@/lib/axa-reconstruccion";
import { conDeformacionMedida, deformacionesMedidas, remuestrear } from "./deformacion-medida";

describe("la deformación medida por CESVI en el 3D (René, 2026-11-24)", () => {
  it("lleva el perfil del reporte a los puntos del 3D, sin cambiarle los extremos", () => {
    expect(remuestrear([0.96, 0.86, 0.52, 0.2], 6)).toEqual([0.96, 0.9, 0.792, 0.588, 0.392, 0.2]);
    expect(remuestrear([0.3, 0.3], 6)).toEqual([0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
  });

  it(
    "en AXA, la Tacoma lleva en el 3D los 96, 86, 52 y 20 cm medidos y no lo calculado",
    { timeout: 240_000 },
    () => {
      const r = reconstruirExpediente(expedienteAxaReconstruccion(), "axa-a2010930", {
        samples: 8,
        mcSamples: 8,
      });
      const escena = especReconstruida(r) as unknown as EscenaSpec;
      const resultado = reconstructionToDict(reconstruct(escena as never)) as unknown as Resultado;
      const medidas = deformacionesMedidas(escena);
      expect(medidas.map((m) => m.perfil_m)).toContainEqual([0.96, 0.86, 0.52, 0.2]);
      const tacoma = medidas.find((m) => m.perfil_m[0] === 0.96)!;
      const antes = resultado.vehiculos.find((v) => v.id === tacoma.vehiculo)!;
      const despues = conDeformacionMedida(escena, resultado).vehiculos.find(
        (v) => v.id === tacoma.vehiculo,
      )!;
      // Lo calculado queda lejos de lo medido: con la rigidez del reporte (#349), unos 25 cm.
      expect(Math.max(...(antes.dano?.perfil_m ?? [0]))).toBeLessThan(0.5);
      expect(Math.max(...(despues.dano?.perfil_m ?? [0]))).toBe(0.96);
      expect(despues.dano?.ancho_m).toBeCloseTo(1.689, 3);
      // Lo demás del resultado (trayectorias, velocidades) no cambia.
      expect(despues.v_impacto_kmh).toBe(antes.v_impacto_kmh);
      expect(despues.trayectoria).toEqual(antes.trayectoria);
    },
  );
});
