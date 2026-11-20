import { describe, expect, it } from "vitest";
import {
  conLimiteDeLaVia,
  conVelocidadDelPerito,
  limiteDeLaVia,
  velocidadPreviaDeclarada,
  velocidadesNarradas,
} from "./velocidad-narrada";
import type { Expediente } from "./corpus";

const ids = ["V1", "V2"];

describe("la velocidad que dice la narración (ronda 4)", () => {
  it("una cifra, con su rango y su cita; la aproximada, más ancha", () => {
    const m = velocidadesNarradas(
      "El vehículo A circulaba por Paseo Tollocan a 80 km/h cuando perdió el control.",
      ids,
    );
    expect(m.get("V1")).toMatchObject({ kmh: 80, rango_kmh: [72, 88], origen: "narración" });
    expect(m.get("V1")!.cita).toContain("a 80 km/h");
    const a = velocidadesNarradas("El vehículo B venía como a 60 kilómetros por hora.", ids);
    expect(a.get("V2")).toMatchObject({ kmh: 60, rango_kmh: [51, 69] });
    const e = velocidadesNarradas("El vehículo A circulaba entre 60 y 70 km/h.", ids);
    expect(e.get("V1")).toMatchObject({ kmh: 65, rango_kmh: [60, 70] });
    const mas = velocidadesNarradas("El vehículo A iba a más de 90 km/h.", ids);
    expect(mas.get("V1")!.rango_kmh).toEqual([90, 117]);
  });

  it("una descripción va respecto al límite de la vía", () => {
    const m = velocidadesNarradas(
      "El vehículo A circulaba a exceso de velocidad y se impactó contra un árbol.",
      ids,
    );
    expect(m.get("V1")).toMatchObject({
      respecto_al_limite: "arriba",
      limite_kmh: 50,
      kmh: 65,
      rango_kmh: [50, 80],
    });
    const d = velocidadesNarradas("El vehículo B avanzaba despacio por el carril derecho.", ids);
    expect(d.get("V2")).toMatchObject({ respecto_al_limite: "abajo" });
    const r = velocidadesNarradas("El vehículo B avanzaba a vuelta de rueda.", ids);
    expect(r.get("V2")).toMatchObject({ kmh: 8, rango_kmh: [3, 15] });
  });

  it("un límite del lugar y el carril de baja velocidad no son la velocidad del hecho", () => {
    expect(
      velocidadesNarradas(
        "Sobre la vía existe un señalamiento de velocidad máxima de 50 km/h. El vehículo A circulaba.",
        ids,
      ).size,
    ).toBe(0);
    expect(
      velocidadesNarradas("El vehículo A quedó en el carril de baja velocidad.", ids).size,
    ).toBe(0);
    expect(
      velocidadesNarradas("Restrictivo de 40 km/h a 100 metros. El vehículo B se detuvo.", ids)
        .size,
    ).toBe(0);
  });

  it("sin vehículo claro no se asigna; con uno solo, es de él", () => {
    expect(velocidadesNarradas("Circulaba a 70 km/h.", ids).size).toBe(0);
    expect(velocidadesNarradas("Circulaba a 70 km/h.", ["V1"]).get("V1")!.kmh).toBe(70);
    // La mención de la oración anterior cuenta.
    const m = velocidadesNarradas(
      "El vehículo B circulaba por el carril central. Iba a 50 km/h.",
      ids,
    );
    expect(m.get("V2")!.kmh).toBe(50);
  });

  it("los cinco ejemplos y AXA no narran velocidades (sus cifras no cambian)", () => {
    const frase =
      "Se localizan restos de plástico y vidrio en el carril de baja velocidad, en una franja de 6 m. El vehículo A quedó en el carril de baja velocidad.";
    expect(velocidadesNarradas(frase, ids).size).toBe(0);
  });
});

describe("el límite de la vía (LGMSV, art. 49 fr. III)", () => {
  it("su maxspeed de OpenStreetMap o el de su tipo", () => {
    expect(limiteDeLaVia("primary", "60")).toEqual({
      kmh: 60,
      fuente: "maxspeed de OpenStreetMap",
    });
    expect(limiteDeLaVia("trunk")!.kmh).toBe(50);
    expect(limiteDeLaVia("motorway")!.kmh).toBe(80);
    expect(limiteDeLaVia("residential")!.kmh).toBe(30);
    expect(limiteDeLaVia("path")).toBeNull();
  });

  it("al conocer la vía, lo relativo al límite se recalcula y la cifra no", () => {
    const e = {
      vehiculos: [
        {
          id: "V1",
          velocidad_narrada: velocidadesNarradas("El vehículo A a exceso de velocidad.", ids).get(
            "V1",
          ),
        },
        {
          id: "V2",
          velocidad_narrada: velocidadesNarradas("El vehículo B a 40 km/h.", ids).get("V2"),
        },
      ],
    } as unknown as Expediente;
    const c = conLimiteDeLaVia(e, { kmh: 60, fuente: "maxspeed de OpenStreetMap" });
    expect(c.vehiculos[0]!.velocidad_narrada).toMatchObject({
      kmh: 78,
      rango_kmh: [60, 96],
      limite_kmh: 60,
    });
    expect(c.vehiculos[1]!.velocidad_narrada!.kmh).toBe(40);
  });

  it("el perito: su cifra o «No sé» (la típica de la vía), siempre como supuesto con rango", () => {
    const e = { vehiculos: [{ id: "V1" }] } as unknown as Expediente;
    expect(conVelocidadDelPerito(e, "V1", 70).vehiculos[0]!.velocidad_narrada).toMatchObject({
      origen: "perito",
      rango_kmh: [63, 77],
    });
    const nose = conVelocidadDelPerito(e, "V1", null).vehiculos[0]!.velocidad_narrada!;
    expect(nose).toMatchObject({
      origen: "via",
      respecto_al_limite: "alrededor",
      rango_kmh: [30, 60],
    });
    const vp = velocidadPreviaDeclarada(nose);
    expect(vp).toMatchObject({ a_priori: true, fuente: "supuesto", rango: [30, 60] });
  });
});
