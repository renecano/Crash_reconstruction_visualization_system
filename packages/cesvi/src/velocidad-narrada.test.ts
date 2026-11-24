import { describe, expect, it } from "vitest";
import {
  conLimiteDeLaVia,
  conVelocidadDelPerito,
  enCota,
  limiteDeLaVia,
  limiteDelLugarNarrado,
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
    // René, 2026-11-20: «más de X» y «menos de X» son cotas, no un valor inventado.
    const mas = velocidadesNarradas("El vehículo A iba a más de 90 km/h.", ids);
    expect(mas.get("V1")).toMatchObject({ kmh: 90, rango_kmh: [90, 90], cota: "minimo" });
    expect(enCota(mas.get("V1")!)).toBe("al menos 90 km/h");
    const menos = velocidadesNarradas("El vehículo B iba a menos de 40 km/h.", ids);
    expect(menos.get("V2")).toMatchObject({ kmh: 40, cota: "maximo" });
    expect(enCota(menos.get("V2")!)).toBe("a lo más 40 km/h");
    const vp = velocidadPreviaDeclarada(mas.get("V1")!);
    expect(vp).toMatchObject({ valor: 90, cota: "minimo", a_priori: true });
    expect(String(vp.nota)).toContain("al menos 90 km/h");
  });

  it("el límite sale del texto del lugar mientras la vía no se ubica (LGMSV, art. 49 fr. III)", () => {
    const casos: [string, number, string][] = [
      ["curva del Circuito Exterior Mexiquense a la altura de Ecatepec", 80, "e)"],
      ["la autopista México–Querétaro", 80, "e)"],
      ["carretera federal 57", 110, "g)"],
      ["carretera Toluca–Valle de Bravo, a la altura de Amanalco", 80, "f)"],
      ["avenida Las Torres", 50, "d)"],
      ["Paseo Tollocan", 50, "d)"],
      ["calle Hidalgo", 30, "c)"],
    ];
    for (const [texto, kmh, inciso] of casos) {
      const l = limiteDelLugarNarrado(texto)!;
      expect(l.kmh, texto).toBe(kmh);
      expect(l.fuente, texto).toContain(`fr. III ${inciso}`);
    }
    expect(limiteDelLugarNarrado("frente a la gasolinera")).toBeNull();
    // «Alta velocidad» en el Circuito Exterior: respecto a 80, no a 50 (no puede dar 65).
    const alta = velocidadesNarradas(
      "El vehículo B venía a alta velocidad.",
      ids,
      limiteDelLugarNarrado("Circuito Exterior Mexiquense")!,
    ).get("V2")!;
    expect(alta).toMatchObject({ kmh: 104, rango_kmh: [80, 128], limite_kmh: 80 });
    // «Exceso» nunca queda por debajo del límite: su rango empieza en él.
    for (const l of [30, 50, 80, 110]) {
      const v = velocidadesNarradas("El vehículo A a exceso de velocidad.", ids, {
        kmh: l,
        fuente: "prueba",
      }).get("V1")!;
      expect(v.rango_kmh[0]).toBe(l);
      expect(v.kmh).toBeGreaterThan(l);
    }
    // «Despacio», también relativo a la vía.
    const lento = velocidadesNarradas("El vehículo A venía despacio.", ids, {
      kmh: 80,
      fuente: "prueba",
    }).get("V1")!;
    expect(lento).toMatchObject({ kmh: 32, rango_kmh: [5, 56] });
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
