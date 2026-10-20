import {
  LEGEND_TEXT,
  legendFor,
  legendLines,
  loadFixture,
  loadResultado,
} from "@croquis/scene-schema";
import { AIRBAG_SOURCE, airbagDecision } from "@croquis/viewer";
import { describe, expect, it } from "vitest";
import {
  AIRBAG_SOURCE_EN,
  airbagTexto,
  campoIncierto,
  CLASE,
  claseTexto,
  clockHour,
  estimacionTexto,
  eventoEtiqueta,
  evidenceLabel,
  inicialTexto,
  leyendaIdioma,
  lineasLeyenda,
  PARAM,
  paramTexto,
  parametroInversion,
  rigidezTexto,
  supuestoEntorno,
  TIPO,
  tipoTexto,
} from "./textos-resultado";

const LEYENDA_EN =
  "Illustrative reconstruction generated from a narrative. It is not a forensic report.";

describe("datos inciertos en palabras", () => {
  it("cada ruta que emite el solver se dice con quién, qué y su unidad", async () => {
    const r = await loadResultado("lateral_interseccion");
    const c = (ruta: string, min: number, max: number, nota = "rango declarado") =>
      campoIncierto({ ruta, distribucion: "uniforme", min, max, nota }, r);
    expect(c("vehiculos.0.velocidad_previa", 35, 55)).toBe(
      `Vehículo ${r.vehiculos[0]!.rol}: velocidad previa, entre 35 y 55 km/h (rango declarado)`,
    );
    expect(c("vehiculos.1.masa", 1650, 2100, "rango de la clase")).toBe(
      `Vehículo ${r.vehiculos[1]!.rol}: masa, entre 1,650 y 2,100 kg (rango de la clase)`,
    );
    expect(c("vehiculos.0.frenado.distancia_antes_impacto", 8, 12.5)).toBe(
      `Vehículo ${r.vehiculos[0]!.rol}: distancia de frenado antes del impacto, entre 8.0 y 12.5 m (rango declarado)`,
    );
    expect(c("lugar.friccion", 0.55, 0.8, "tabla de fricción (fricke)")).toBe(
      "Pavimento: fricción llanta–pavimento, entre 0.55 y 0.80 (tabla de fricción (fricke))",
    );
    expect(c("parametros.friccion_moto_caida", 0.3, 0.6, "peck")).toMatch(
      /^Parámetro: arrastre de la moto caída, entre 0\.30 y 0\.60/,
    );
  });

  it("todas las rutas de las escenas canónicas quedan en palabras (sin rutas internas)", async () => {
    for (const n of [
      "alcance",
      "lateral_interseccion",
      "motociclista",
      "nocturno_lluvia",
    ] as const) {
      const r = await loadResultado(n);
      for (const campo of r.incertidumbre?.campos ?? []) {
        expect(campoIncierto(campo, r)).not.toMatch(/vehiculos\.|lugar\.|parametros\./);
      }
    }
  });

  it("en inglés: mismas cifras, con quién, qué, unidad y la nota traducida", async () => {
    const r = await loadResultado("lateral_interseccion");
    const c = (ruta: string, min: number, max: number, nota = "rango declarado") =>
      campoIncierto({ ruta, distribucion: "uniforme", min, max, nota }, r, "en");
    expect(c("vehiculos.0.velocidad_previa", 35, 55)).toBe(
      `Vehicle ${r.vehiculos[0]!.rol}: initial speed, between 35 and 55 km/h (stated range)`,
    );
    expect(c("vehiculos.1.masa", 1650, 2100, "rango de la clase")).toBe(
      `Vehicle ${r.vehiculos[1]!.rol}: mass, between 1,650 and 2,100 kg (range for the vehicle class)`,
    );
    expect(c("vehiculos.0.frenado.distancia_antes_impacto", 8, 12.5, "±20% (relato)")).toBe(
      `Vehicle ${r.vehiculos[0]!.rol}: braking distance before the impact, between 8.0 and 12.5 m (±20% (from the narrative))`,
    );
    expect(c("lugar.friccion", 0.55, 0.8, "tabla de fricción (fricke)")).toBe(
      "Road surface: tire–road friction, between 0.55 and 0.80 (friction table (fricke))",
    );
    expect(c("parametros.friccion_moto_caida", 0.3, 0.6, "arrastre de la moto caída (peck)")).toBe(
      "Parameter: downed motorcycle drag, between 0.30 and 0.60 (downed motorcycle drag (peck))",
    );
  });

  it("en inglés, ningún dato incierto de las escenas canónicas queda en español", async () => {
    for (const n of ["alcance", "volcadura", "motociclista", "peaton_cruce"] as const) {
      const r = await loadResultado(n);
      for (const campo of r.incertidumbre?.campos ?? []) {
        const texto = campoIncierto(campo, r, "en");
        expect(texto).not.toMatch(/vehiculos\.|lugar\.|parametros\./);
        expect(texto).not.toMatch(/Vehículo|entre|rango|tabla|según|arrastre/);
      }
    }
  });
});

describe("vocabulario de resultados", () => {
  it("los mapas en español no cambian", () => {
    expect(CLASE).toEqual({
      sedan_compacto: "sedán compacto",
      sedan_mediano: "sedán mediano",
      hatchback: "hatchback",
      suv_compacta: "SUV compacta",
      suv_grande: "SUV grande",
      pickup: "pickup",
      van: "van",
      microbus_combi: "microbús o combi",
      autobus: "autobús",
      camion_unitario: "camión unitario",
      tractocamion: "tractocamión",
      motocicleta: "motocicleta",
      bicicleta: "bicicleta",
      scooter: "scooter",
    });
    expect(PARAM.friccion_llanta).toBe("Fricción llanta–pavimento");
    expect(PARAM.arrastre_post_impacto).toBe("Arrastre después del impacto (fracción de μ)");
    expect(PARAM.alcance_deteccion_nocturna).toBe("Alcance de detección con luces bajas (m)");
    expect(Object.keys(PARAM)).toHaveLength(13);
    expect(TIPO).toEqual({
      primaria: "fuente primaria",
      secundaria: "fuente secundaria",
      supuesto: "supuesto",
      relato: "del relato",
      medido: "medido",
    });
  });

  it("clase, parámetro y tipo en los dos idiomas; lo desconocido queda tal cual", () => {
    expect(claseTexto("suv_grande")).toBe("SUV grande");
    expect(claseTexto("suv_grande", "en")).toBe("large SUV");
    expect(claseTexto("vehiculo_raro", "en")).toBe("vehiculo_raro");
    expect(paramTexto("factor_abs", "en")).toBe("ABS braking factor");
    expect(paramTexto("otro_param")).toBe("otro_param");
    expect(tipoTexto("primaria", "en")).toBe("primary source");
    expect(tipoTexto("medido")).toBe("medido");
  });

  it("hora de reloj, rigidez y valor de partida", () => {
    expect(clockHour(2.9)).toBe("a las 3");
    expect(clockHour(2.9, "en")).toBe("at 3 o'clock");
    expect(clockHour(11.8, "en")).toBe("at 12 o'clock");
    expect(rigidezTexto("nhtsa")).toBe("medida (pruebas de NHTSA)");
    expect(rigidezTexto("nhtsa", "en")).toBe("measured (NHTSA tests)");
    expect(rigidezTexto("supuesto", "en")).toBe("assumed");
    expect(rigidezTexto(undefined, "en")).toBe("—");
    expect(inicialTexto(true)).toBe("dicho");
    expect(inicialTexto(false, "en")).toBe("assumed");
  });

  it("etiquetas de evidencia en inglés", () => {
    const roles = new Map([["veh-a", "A"]]);
    expect(evidenceLabel("reposo:veh-a", roles)).toBe("dónde quedó (vehículo A)");
    expect(evidenceLabel("reposo:veh-a", roles, "en")).toBe("where it came to rest (vehicle A)");
    expect(evidenceLabel("proyeccion:per-1", roles, "en")).toBe(
      "how far the person ended up (person)",
    );
  });
});

describe("inversión en palabras", () => {
  it("parámetro y estimación en los dos idiomas, con las mismas cifras", async () => {
    const r = await loadResultado("peaton_cruce");
    const p = r.inversion!.parametros.find((x) => x.parametro === "velocidad_previa")!;
    expect(parametroInversion(p)).toBe("Velocidad previa (antes de frenar, si frenó)");
    expect(parametroInversion(p, "en")).toBe("Initial speed (before braking, if it braked)");
    const es = estimacionTexto(p);
    const en = estimacionTexto(p, "en");
    expect(es).toMatch(/mejor ajuste/);
    expect(en).toMatch(/best fit/);
    expect(en.match(/[\d.,]+/g)).toEqual(es.match(/[\d.,]+/g));
    const noId = { ...p, identificable: false };
    expect(estimacionTexto(noId)).toBe("La evidencia no basta para estimarlo.");
    expect(estimacionTexto(noId, "en")).toBe("The evidence is not enough to estimate it.");
    const limite = { ...p, en_limite: true };
    expect(estimacionTexto(limite, "en")).toMatch(/^The evidence pushes this value to the limit/);
    expect(estimacionTexto(limite)).toMatch(/^La evidencia lleva este dato hasta el límite/);
  });
});

describe("línea de tiempo, bolsas de aire y entorno", () => {
  it("las etiquetas de eventos: en español las del visor; en inglés con quién", () => {
    const m = { tipo: "inicio_frenado", etiqueta: "Inicio de frenado (A)" };
    expect(eventoEtiqueta(m, "A")).toBe("Inicio de frenado (A)");
    expect(eventoEtiqueta(m, "A", "en")).toBe("Braking starts (A)");
    expect(
      eventoEtiqueta({ tipo: "impacto_vehiculo_persona", etiqueta: "Impacto" }, "A", "en"),
    ).toBe("Impact");
    expect(eventoEtiqueta({ tipo: "reposo", etiqueta: "Reposo (B)" }, "B", "en")).toBe(
      "Comes to rest (B)",
    );
  });

  it("cada motivo de la regla de bolsas de aire tiene su inglés y el español no cambia", () => {
    const base = { deltaVKmh: 40, cinturon: true, objetoEstrecho: false, dosRuedas: false };
    const casos = [
      airbagDecision({ ...base, pdofHoras: 12 }),
      airbagDecision({ ...base, deltaVKmh: 5, pdofHoras: 12, cinturon: undefined }),
      airbagDecision({ ...base, pdofHoras: 3 }),
      airbagDecision({ ...base, deltaVKmh: 5, pdofHoras: 9 }),
      airbagDecision({ ...base, pdofHoras: 6 }),
      airbagDecision({ ...base, pdofHoras: undefined }),
      airbagDecision({ ...base, pdofHoras: 12, dosRuedas: true }),
    ];
    for (const d of casos) {
      expect(airbagTexto(d.motivo)).toBe(d.motivo);
      const en = airbagTexto(d.motivo, "en");
      expect(en).not.toBe(d.motivo);
      expect(en).not.toMatch(/desplegada|cinturón|lado|Sin|aplica|Impacto/);
    }
    expect(airbagTexto(casos[0]!.motivo, "en")).toMatch(
      /^Frontal deployed: ΔV 40 km\/h ≥ \d+ km\/h\.$/,
    );
    expect(airbagTexto(casos[1]!.motivo, "en")).toMatch(/seat belt not stated/);
    expect(airbagTexto(casos[2]!.motivo, "en")).toMatch(/^Right side deployed/);
    expect(AIRBAG_SOURCE).toMatch(/^IIHS/);
    expect(AIRBAG_SOURCE_EN).toMatch(/^IIHS, Airbags \(accessed 2026-10-13\)/);
  });

  it("los supuestos de entorno del visor en inglés; lo desconocido queda en español", () => {
    expect(
      supuestoEntorno("Ubicación no declarada: el sol se calcula para el centro de Toluca."),
    ).toEqual({
      texto: "Ubicación no declarada: el sol se calcula para el centro de Toluca.",
      lang: "es-MX",
    });
    expect(
      supuestoEntorno("Ubicación no declarada: el sol se calcula para el centro de Toluca.", "en"),
    ).toEqual({
      texto: "Location not stated: the sun is computed for downtown Toluca.",
      lang: "en",
    });
    expect(supuestoEntorno("Fecha no declarada: se usa 2025-06-15.", "en").texto).toBe(
      "Date not stated: 2025-06-15 is used.",
    );
    expect(
      supuestoEntorno(
        "Hora no declarada: se usan las 22:00 según la iluminación (noche_con_alumbrado) del 2025-06-15.",
        "en",
      ).texto,
    ).toBe(
      "Time not stated: 22:00 on 2025-06-15 is used, based on the light (night with street lighting).",
    );
    expect(
      supuestoEntorno("Estado del piso no declarado: se dibuja mojado por la lluvia.", "en").texto,
    ).toBe("Road surface condition not stated: it is drawn wet because of the rain.");
    expect(supuestoEntorno("Algo nuevo.", "en")).toEqual({ texto: "Algo nuevo.", lang: "es-MX" });
  });
});

describe("marca de las exportaciones", () => {
  it("en español es la misma de siempre", () => {
    const legend = legendFor(loadFixture("interseccion_toluca"));
    expect(leyendaIdioma(legend)).toBe(legend);
    expect(lineasLeyenda(legend)).toEqual(legendLines(legend));
  });

  it("en inglés: texto y atribución en inglés, con la misma semilla y hash", () => {
    const spec = loadFixture("interseccion_toluca");
    const legend = legendFor({ ...spec, meta: { ...spec.meta, hash_relato: "f".repeat(16) } });
    const en = leyendaIdioma(legend, "en");
    expect(en.texto).toBe(LEYENDA_EN);
    expect(en.semilla).toBe(legend.semilla);
    expect(en.hash).toBe(legend.hash);
    expect(en.atribucion).toMatch(/^Contains information from OpenStreetMap/);
    const lineas = lineasLeyenda(legend, "en");
    expect(lineas[0]).toBe(LEYENDA_EN);
    expect(lineas[1]).toBe(`seed ${legend.semilla} · hash ${"f".repeat(16)}`);
    expect(lineas.join(" ")).not.toContain(LEGEND_TEXT);
    expect(lineas.join(" ")).not.toMatch(/semilla|Contiene/);
  });
});
