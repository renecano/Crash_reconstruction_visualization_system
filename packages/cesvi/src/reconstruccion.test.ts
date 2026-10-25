import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEscena } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import {
  conMasa,
  conPosicion,
  conReposoSupuesto,
  escenaDeNarracion,
  reposoSupuesto,
} from "./escena-narracion";
import { distanciaM } from "./geo";
import { mcHenry } from "./metodo";
import {
  conHipotesis,
  especDeExpediente,
  especReconstruida,
  impactosEnMapa,
  interpretarResultado,
  reconstruirExpediente,
  posicionesEnTiempo,
  rumboEscena,
  trayectoriasEnMapa,
  zonaHorizontal,
} from "./reconstruccion";
import { verificacionCesvi } from "./verificacion";

type Json = Record<string, unknown>;

/** El crucero de E-R1 (narración de desarrollo, lectura grabada): V1 de frente contra el costado de V2. */
const grabacion = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
    ),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const base = escenaDeNarracion(grabacion.salida, grabacion.narracion).expediente;

/** Un punto a `norte` y `este` metros de un origen fijo (entrada de prueba, no un dato del caso). */
const P = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});

const base0 = (): Expediente => base;

function colocado(): Expediente {
  let e = conPosicion(base, { vehiculo: "V1", fase: "impacto", punto: m(-2, 0), rumbo: 0 });
  e = conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(0, 2), rumbo: 90 });
  e = conPosicion(e, { vehiculo: "V1", fase: "final", punto: m(4, 5), rumbo: 30 });
  return conPosicion(e, { vehiculo: "V2", fase: "final", punto: m(3, 9), rumbo: 80 });
}

describe("del expediente a la escena del solver (R2)", () => {
  it("convierte el rumbo del contrato (desde el norte, horario) al de la escena (desde +X, antihorario)", () => {
    expect(rumboEscena(0)).toBe(90);
    expect(rumboEscena(90)).toBe(0);
    expect(rumboEscena(180)).toBe(-90);
    expect(rumboEscena(270)).toBe(180);
  });

  it("el tercio o el vértice que narró el perito pasa a la zona horizontal CDC del impacto", () => {
    expect(zonaHorizontal({ cara: "frontal", tercio: "derecho" })).toBe("R");
    expect(zonaHorizontal({ cara: "posterior", vertice: "posterior_izquierdo" })).toBe("L");
    expect(zonaHorizontal({ cara: "lateral_derecho", tercio: "trasero" })).toBe("B");
    expect(zonaHorizontal({ cara: "lateral_izquierdo", vertice: "delantero_izquierdo" })).toBe("F");
    expect(zonaHorizontal({ cara: "frontal" })).toBeNull();
    const e: Expediente = {
      ...base,
      impactos: base.impactos!.map((i) => ({
        ...i,
        zonas: [
          { vehiculo: "V1", zona: { cara: "frontal", tercio: "izquierdo" } },
          { vehiculo: "V2", zona: { cara: "lateral_derecho", tercio: "medio" } },
        ],
      })),
    };
    const { spec } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    const zonas = ((spec.eventos as Json[])[0]!.zonas_impacto as { cdc: Json }[]).map((z) => z.cdc);
    expect(zonas).toEqual([
      { lado: "F", zona_horizontal: "L" },
      { lado: "R", zona_horizontal: "P" },
    ]);
  });

  it("sin zonas del impacto, toma la cara del primer daño de cada vehículo y lo dice", () => {
    // La lectura de AXA trae los daños pero no las zonas del impacto: sin ellas el solver suponía el
    // frente de los dos y en un alcance los ponía uno encima del otro (comentario de René).
    const e: Expediente = {
      ...base,
      impactos: base.impactos!.map((i) => ({ ...i, zonas: undefined })),
      danos: [
        { vehiculo: "V1", zona: { cara: "frontal", tercio: "izquierdo" }, fuente: "perito" },
        {
          vehiculo: "V2",
          zona: { cara: "posterior", vertice: "posterior_derecho" },
          fuente: "perito",
        },
        { vehiculo: "V2", zona: { cara: "lateral_derecho" }, fuente: "perito" },
      ],
    };
    const { spec, limites } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    const zonas = ((spec.eventos as Json[])[0]!.zonas_impacto as { cdc: Json }[]).map((z) => z.cdc);
    // Solo la cara: el daño dice dónde se deformó, no en qué punto de la cara fue el contacto.
    expect(zonas).toEqual([{ lado: "F" }, { lado: "B" }]);
    expect(limites.join(" ")).toMatch(/no da las zonas del impacto de V1 y V2: se toma la cara/);
    // Con las zonas del reporte, no se tocan ni se dice nada.
    expect(especDeExpediente(base).limites.join(" ")).not.toMatch(/no da las zonas/);
  });

  it("sin posiciones, la escena es válida y todo lo no dicho es supuesto o por omisión", () => {
    const { spec, ids, limites } = especDeExpediente(base);
    expect(validateEscena(spec).ok).toBe(true);
    expect(ids).toEqual({ "veh-a": "V1", "veh-b": "V2" });
    const v = (spec.vehiculos as Json[])[0]!;
    expect((v.posicion_inicial as Json).procedencia).toMatchObject({ fuente: "supuesto" });
    expect(limites).toEqual([]);
  });

  it("lo que coloca el perito entra como declarado, en metros desde el punto de impacto", () => {
    const { spec } = especDeExpediente(conMasa(colocado(), "V2", 1450));
    expect(validateEscena(spec).ok).toBe(true);
    const [a, b] = spec.vehiculos as Json[];
    // El origen es el promedio de las posiciones de impacto: (−1 m norte, 1 m este).
    expect(a!.posicion_final).toMatchObject({ rumbo_deg: 60, procedencia: { fuente: "usuario" } });
    expect((a!.posicion_final as Json).x).toBeCloseTo(4, 1);
    expect((a!.posicion_final as Json).y).toBeCloseTo(5, 1);
    expect(b!.masa).toMatchObject({ valor: 1450, unidad: "kg", fuente: "usuario" });
    // La inicial: 12 m antes de la posición de impacto, en su rumbo, como supuesto.
    expect((a!.posicion_inicial as Json).y).toBeCloseTo(-13, 1);
    expect((a!.posicion_inicial as Json).procedencia).toMatchObject({ fuente: "supuesto" });
  });

  it("las medidas C y L van como daño declarado; un impacto posterior contra un objeto se dice como límite", () => {
    const danos = base.danos!.map((d, k) =>
      k === 0 ? { ...d, magnitud: { c_m: [0.3, 0.42, 0.25], l_m: 1.2 } } : d,
    );
    const e: Expediente = {
      ...base,
      danos,
      impactos: [
        ...base.impactos!,
        { orden: 2, vehiculos: ["V1"], objeto_fijo: "poste", fuente: "perito" },
      ],
    };
    const { spec, limites } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    const danosDeclarados = spec.danos_declarados as Json[];
    expect(danosDeclarados).toHaveLength(1);
    expect(danosDeclarados[0]!.vehiculo_id).toBe("veh-a");
    expect(danosDeclarados[0]!.profundidad_aplastamiento).toMatchObject({
      valor: 0.42,
      fuente: "usuario",
    });
    expect(danosDeclarados[0]!.ancho_danado).toMatchObject({ valor: 1.2, fuente: "usuario" });
    expect(limites[0]).toBe(
      "El impacto 2 no es entre dos vehículos (poste): la reconstrucción no lo calcula.",
    );
  });

  it("AXA: la deformación medida va una vez, la de la cara del impacto, con su perfil y la rigidez del reporte (ADR 0091)", () => {
    // La lectura grabada de AXA repite las C y L del frente de la Tacoma en su costado derecho; el
    // reporte las mide solo en el frente (McHenry de cuatro medidas) y escribe A y B en kN/m.
    const medida = { c_m: [0.96, 0.86, 0.52, 0.2], l_m: 1.689 };
    const e: Expediente = {
      ...base,
      vehiculos: base.vehiculos.map((v) =>
        v.id === "V1" ? { ...v, rigidez: { A: 55.405, B: 385.336, fuente: "dictamen" } } : v,
      ),
      impactos: [
        {
          orden: 1,
          vehiculos: ["V1", "V2"],
          zonas: [
            { vehiculo: "V1", zona: { cara: "frontal" } },
            { vehiculo: "V2", zona: { cara: "lateral_izquierdo" } },
          ],
          fuente: "perito",
        },
      ],
      danos: [
        { vehiculo: "V1", zona: { cara: "lateral_derecho" }, magnitud: medida, fuente: "perito" },
        { vehiculo: "V1", zona: { cara: "frontal" }, magnitud: medida, fuente: "perito" },
        { vehiculo: "V2", zona: { cara: "lateral_izquierdo" }, fuente: "perito" },
      ],
    };
    const { spec, limites } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    const declarados = spec.danos_declarados as Json[];
    expect(declarados).toHaveLength(1);
    expect(declarados[0]).toMatchObject({
      vehiculo_id: "veh-a",
      zona: { lado: "F" },
      profundidad_aplastamiento: { valor: 0.96, unidad: "m" },
      ancho_danado: { valor: 1.689, unidad: "m" },
      perfil_aplastamiento: { valor: [0.96, 0.86, 0.52, 0.2], unidad: "m", fuente: "usuario" },
      rigidez: { a: 55405, b: 385336, fuente: "usuario" },
    });
    expect(limites).toContain(
      "V1: el reporte trae medidas de deformación en 2 daños; se usa la de la cara del impacto (frontal).",
    );
  });

  it("carambola (R6): el impacto posterior entre vehículos pasa a la escena y el tercero espera detenido", () => {
    // El crucero con el perito y un tercero (V3) al que V2 pega con su frente después.
    let e = colocado();
    e = {
      ...e,
      vehiculos: [...e.vehiculos, { ...e.vehiculos[1]!, id: "V3" }],
      impactos: [
        ...e.impactos!,
        {
          orden: 2,
          vehiculos: ["V2", "V3"],
          zonas: [
            { vehiculo: "V2", zona: { cara: "frontal" } },
            { vehiculo: "V3", zona: { cara: "posterior", tercio: "centro" } },
          ],
          fuente: "perito",
        },
      ],
    };
    e = conPosicion(e, { vehiculo: "V3", fase: "impacto", punto: m(0, 12), rumbo: 90 });
    const { spec, ids, limites, origen } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    const eventos = spec.eventos as Json[];
    const segundo = eventos.find((ev) => ev.tipo === "segundo_impacto")!;
    const idDe = (v: string) => Object.keys(ids).find((k) => ids[k] === v)!;
    expect(segundo).toMatchObject({
      id: "ev-impacto-2",
      actores: [idDe("V2"), idDe("V3")],
      zonas_impacto: [
        { vehiculo_id: idDe("V2"), cdc: { lado: "F" } },
        { vehiculo_id: idDe("V3"), cdc: { lado: "B", zona_horizontal: "C" } },
      ],
      procedencia: { fuente: "usuario" },
    });
    expect(Number(segundo.orden)).toBeGreaterThan(Number(eventos[0]!.orden));
    // El origen es el primer impacto (V1 y V2), no el promedio con V3.
    expect(origen).not.toBeNull();
    const v3 = (spec.vehiculos as Json[]).find((v) => v.id === idDe("V3"))!;
    expect(v3.velocidad_previa).toMatchObject({ valor: 0, fuente: "supuesto" });
    expect(v3.posicion_inicial).toMatchObject({ rumbo_deg: 0 });
    expect(limites).toContain(
      "V3: solo está en un impacto posterior y empieza detenido en la posición de impacto que colocó el perito (supuesto).",
    );
  });

  it("los impactos en el mapa: X1 en el origen y los posteriores en su punto de contacto", () => {
    const base1 = { spec: {}, ids: {}, limites: [], origen: [P.lon, P.lat] as [number, number] };
    const marcas = impactosEnMapa(base1, {
      punto_impacto: { x: 0, y: 0 },
      eventos: [
        { tipo: "reposo", t: 2 },
        { tipo: "impacto_vehiculo_vehiculo", t: 0.3, detalle: { punto_m: [10, 0] } },
        { tipo: "impacto_vehiculo_vehiculo", t: 0 },
      ],
    });
    expect(marcas.map((x) => x.numero)).toEqual([1, 2]);
    expect(marcas[0]!.punto.lat).toBeCloseTo(P.lat, 9);
    expect(marcas[1]!.punto.lon).toBeGreaterThan(P.lon); // 10 m al este
    expect(impactosEnMapa({ ...base1, origen: null }, { eventos: [] })).toEqual([]);
  });

  // Corre el solver completo (Monte Carlo e inversión) dos veces: más que los 5 s por omisión en
  // la laptop de desarrollo.
  it(
    "sin evidencia no inventa velocidades; con las posiciones del perito las fija con rangos",
    { timeout: 20_000 },
    () => {
      const sin = reconstruirExpediente(base);
      expect(sin.evidencia).toEqual([]);
      expect(sin.velocidades.every((v) => v.previa === null)).toBe(true);
      expect(sin.limites.at(-1)).toMatch(/todavía no fija ninguna velocidad/);

      const con = reconstruirExpediente(colocado());
      expect(con.evidencia).toEqual([
        "reposo:veh-a",
        "reposo:veh-b",
        "rumbo_final:veh-a",
        "rumbo_final:veh-b",
      ]);
      for (const v of con.velocidades) {
        expect(v.previa).not.toBeNull();
        expect(v.previa!.p10!).toBeLessThanOrEqual(v.previa!.p90!);
      }
    },
  );
});

describe("verificación CESVI al lado de la reconstrucción", () => {
  const conMedidas = (rigidez?: Expediente["vehiculos"][number]["rigidez"]): Expediente => ({
    ...base,
    vehiculos: base.vehiculos.map((v) =>
      v.id === "V1"
        ? {
            ...v,
            clase: "sedan_compacto",
            masa: { valor: 1200, unidad: "kg", fuente: "perito" },
            ...(rigidez && { rigidez }),
          }
        : v,
    ),
    danos: base.danos!.map((d) =>
      d.vehiculo === "V1" && d.zona.cara === "frontal"
        ? { ...d, magnitud: { c_m: [0.3, 0.42, 0.25, 0.1], l_m: 1.2 } }
        : d,
    ),
  });

  it("con medidas, masa y la rigidez del perito: McHenry y EBS sustituidos, como en C1", () => {
    const [v1] = verificacionCesvi(conMedidas({ A: 50000, B: 400000, fuente: "perito" }));
    expect(v1!.falta).toEqual([]);
    expect(v1!.rigidez).toMatchObject({ fuente: "perito", A: 50000, B: 400000 });
    const e = mcHenry({ L: 1.2, A: 50000, B: 400000, C: [0.3, 0.42, 0.25, 0.1] }).energia;
    expect(v1!.pasos[0]!.paso.calculo).toMatchObject({ energia: e });
    expect(v1!.pasos[1]!.paso.resultado).toContain("km/h");
    expect((v1!.pasos[1]!.paso.calculo as { ms: number }).ms).toBeCloseTo(
      Math.sqrt((2 * e) / 1200),
      9,
    );
  });

  it("la rigidez de dictamen en kN/m (el caso de AXA) da kJ y EBS con la masa en toneladas, como C1", () => {
    const e: Expediente = {
      ...base,
      vehiculos: base.vehiculos.map((v) =>
        v.id === "V1"
          ? {
              ...v,
              masa: { valor: 1431.083, unidad: "kg", fuente: "dictamen_importado" },
              rigidez: { A: 55.405, B: 385.336, fuente: "dictamen" },
            }
          : v,
      ),
      danos: base.danos!.map((d) =>
        d.vehiculo === "V1" && d.zona.cara === "frontal"
          ? { ...d, magnitud: { c_m: [0.96, 0.86, 0.52, 0.2], l_m: 1.689 } }
          : d,
      ),
    };
    const [v1] = verificacionCesvi(e);
    expect(v1!.notas[0]).toMatch(/kN\/m/);
    expect(v1!.pasos[0]!.paso.resultado).toBe("E = 225.454 kJ");
    // La misma velocidad que la fila «con los datos impresos» de C1 (63.90 km/h).
    expect((v1!.pasos[1]!.paso.calculo as { kmh: number }).kmh).toBeCloseTo(63.9, 1);
  });

  it("sin rigidez propia la toma de NHTSA E2 marcada; sin medidas dice qué falta", () => {
    const [v1, v2] = verificacionCesvi(conMedidas());
    expect(["nhtsa_e2", "supuesto"]).toContain(v1!.rigidez!.fuente);
    expect(v1!.pasos).toHaveLength(2);
    expect(v2!.pasos).toEqual([]);
    expect(v2!.falta).toEqual(["las medidas C (2, 4 o 6) y L de la deformación", "la masa"]);
  });
});

describe("la escena para el 3D", () => {
  // Corre el solver completo dos veces: más que los 5 s por omisión en la laptop de desarrollo.
  it(
    "lleva las velocidades estimadas como supuesto con su rango, y sigue siendo válida",
    { timeout: 20_000 },
    () => {
      const r = reconstruirExpediente(colocado());
      const spec = especReconstruida(r) as Json & { vehiculos: Json[] };
      expect(validateEscena(spec).ok).toBe(true);
      const v = spec.vehiculos[0]!.velocidad_previa as Json;
      expect(v).toMatchObject({ fuente: "supuesto", unidad: "km/h" });
      expect(v.valor).toBeCloseTo(r.velocidades[0]!.previa!.mejor, 1);
      expect((v.rango as number[])[0]).toBeLessThanOrEqual((v.rango as number[])[1]!);
    },
  );
});

describe("el croquis 2D sigue al reloj del 3D", () => {
  it("la trayectoria del solver vuelve al mapa: en el impacto, cada vehículo en su posición de impacto", () => {
    const e = colocado();
    const base = especDeExpediente(e);
    const resultado = {
      vehiculos: [
        {
          id: "veh-a",
          trayectoria: {
            t: [-1, 0, 1],
            x: [-1, -1, 4],
            y: [-12, -1, 5],
            rumbo: [Math.PI / 2, Math.PI / 2, Math.PI / 3],
          },
        },
      ],
    };
    const [p0] = posicionesEnTiempo(base, resultado, 0);
    // (−1, −1) m del origen = la posición de impacto que colocó el perito para V1 (−2 m norte, 0 este).
    expect(p0!.vehiculo).toBe("V1");
    expect(p0!.punto.lat).toBeCloseTo(m(-2, 0).lat, 6);
    expect(p0!.punto.lon).toBeCloseTo(m(-2, 0).lon, 6);
    expect(p0!.rumbo).toBeCloseTo(0, 6);
    // A medio camino entre dos muestras interpola; al final, rumbo de 30° desde el norte.
    const [p1] = posicionesEnTiempo(base, resultado, 1);
    expect(p1!.rumbo).toBeCloseTo(30, 6);
    expect(posicionesEnTiempo(especDeExpediente(base0()), resultado, 0)).toEqual([]);
  });
});

describe("R4b (ADR 0069): la maniobra narrada y la carambola sin posiciones", () => {
  type Dano = NonNullable<Expediente["danos"]>[number];
  const dano = (vehiculo: string, cara: string): Dano =>
    ({ vehiculo, zona: { cara }, fuente: "perito" }) as Dano;

  it("quien retrocede según la narración va en reversa y choca con su parte posterior", () => {
    const e = {
      caso: {},
      vehiculos: [
        { id: "V1", clase: "sedan_compacto" },
        { id: "V2", clase: "pickup" },
      ],
      danos: [dano("V1", "posterior"), dano("V2", "frontal")],
      impactos: [
        {
          orden: 1,
          vehiculos: ["V1", "V2"],
          zonas: [
            { vehiculo: "V1", zona: { cara: "posterior" } },
            { vehiculo: "V2", zona: { cara: "frontal" } },
          ],
          fuente: "perito",
        },
      ],
      versiones: [
        {
          tipo: "evidencia",
          maniobras: [
            { vehiculo: "V1", tipo: "reversa" },
            { vehiculo: "V2", tipo: "se_detiene" },
          ],
        },
      ],
    } as unknown as Expediente;
    const { spec, ids } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    const idDe = (v: string) => Object.keys(ids).find((k) => ids[k] === v)!;
    const sv = (spec.vehiculos as Json[]).find((v) => v.id === idDe("V1"))!;
    expect(sv.maniobra).toMatchObject({ valor: "reversa", fuente: "usuario" });
    const r = reconstruirExpediente(e, "reversa-narrada");
    const vs = r.resultado.vehiculos as { id: string; dano: { cdc: { lado: string } | null } }[];
    expect(vs.find((v) => v.id === idDe("V1"))!.dano.cdc?.lado).toBe("B");
  }, 20_000);

  it("sin posiciones, el tercero de un alcance en cadena queda en el camino y el segundo impacto ocurre", () => {
    const e = {
      caso: {},
      vehiculos: [
        { id: "V1", clase: "sedan_compacto" },
        { id: "V2", clase: "sedan_compacto" },
        { id: "V3", clase: "sedan_compacto" },
      ],
      danos: [
        dano("V1", "frontal"),
        dano("V2", "posterior"),
        dano("V2", "frontal"),
        dano("V3", "posterior"),
      ],
      impactos: [
        {
          orden: 1,
          vehiculos: ["V1", "V2"],
          zonas: [
            { vehiculo: "V1", zona: { cara: "frontal" } },
            { vehiculo: "V2", zona: { cara: "posterior" } },
          ],
          fuente: "perito",
        },
        {
          orden: 2,
          vehiculos: ["V2", "V3"],
          zonas: [
            { vehiculo: "V2", zona: { cara: "frontal" } },
            { vehiculo: "V3", zona: { cara: "posterior" } },
          ],
          fuente: "perito",
        },
      ],
      versiones: [{ tipo: "evidencia", maniobras: [{ vehiculo: "V2", tipo: "se_detiene" }] }],
    } as unknown as Expediente;
    const { spec, ids, limites } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    const idDe = (v: string) => Object.keys(ids).find((k) => ids[k] === v)!;
    const v3 = (spec.vehiculos as Json[]).find((v) => v.id === idDe("V3"))!;
    expect(v3.posicion_inicial).toMatchObject({ procedencia: { fuente: "supuesto" } });
    expect(v3.velocidad_previa).toMatchObject({ valor: 0 });
    expect(limites.some((l) => l.startsWith("V3: sin sus posiciones en el mapa"))).toBe(true);
    const r = reconstruirExpediente(e, "cadena");
    expect(r.impactos.map((i) => i.vehiculos)).toEqual([
      ["V1", "V2"],
      ["V2", "V3"],
    ]);
  }, 30_000);
});

describe("las trayectorias en el mapa, para el croquis del dictamen (R8b)", () => {
  it("cada vehículo con su recorrido y su contorno al inicio, en el impacto y en reposo", () => {
    const e = colocado();
    const r = reconstruirExpediente(e, "croquis-mapa");
    const trs = trayectoriasEnMapa(r, r.resultado);
    expect(trs.map((t) => t.vehiculo).sort()).toEqual(["V1", "V2"]);
    for (const t of trs) {
      expect(t.contornos).toHaveLength(3);
      for (const c of t.contornos) expect(c).toHaveLength(5);
      expect(t.puntos.length).toBeGreaterThan(10);
    }
    // En el impacto, el centro del contorno queda a unos metros de donde el perito lo colocó.
    const v1 = trs.find((t) => t.vehiculo === "V1")!.contornos[1]!.slice(0, 4);
    const centro: [number, number] = [
      v1.reduce((a, p) => a + p[0], 0) / 4,
      v1.reduce((a, p) => a + p[1], 0) / 4,
    ];
    const perito = m(-2, 0);
    expect(distanciaM(centro, [perito.lon, perito.lat])).toBeLessThan(6);
  }, 30_000);

  it("sin posiciones en el mapa no hay trayectorias que dibujar sobre él", () => {
    const r = reconstruirExpediente(base0(), "sin-mapa");
    expect(trayectoriasEnMapa(r, r.resultado)).toEqual([]);
  }, 30_000);
});

describe("lo medido pesa más que lo supuesto: el reposo supuesto y las dos hipótesis (ADR 0091)", () => {
  it("un reposo que el perito marca como supuesto llega a la escena como evidencia blanda, y moverlo no lo vuelve dato", () => {
    let e = conReposoSupuesto(colocado(), "V2", true);
    expect(reposoSupuesto(e, "V2")).toBe(true);
    e = conPosicion(e, { vehiculo: "V2", fase: "final", punto: m(3, 8), rumbo: 80 });
    expect(reposoSupuesto(e, "V2")).toBe(true);
    const { spec } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    const v2 = (spec.vehiculos as Json[]).find((v) => v.id === "veh-b")!;
    expect(v2.posicion_final_supuesta).toBe(true);
    expect((v2.posicion_final as Json).procedencia).toMatchObject({ fuente: "supuesto" });
    const v1 = (spec.vehiculos as Json[]).find((v) => v.id === "veh-a")!;
    expect(v1.posicion_final_supuesta).toBeUndefined();
    expect(reposoSupuesto(conReposoSupuesto(e, "V2", false), "V2")).toBe(false);
  });

  it("con las dos inversiones, cada hipótesis con sus números; elegir una cambia velocidades y 3D", () => {
    const base = especDeExpediente(colocado());
    // Resultado de prueba: la del daño no fija veh-a (ajuste conjunto 66.25) y deja su reposo
    // supuesto a 0.62 σ×10 m; la del reposo supuesto fija 41.47 y no alcanza la deformación.
    const param = (vehiculo: string, mejor: number | null, sigma: number) => ({
      parametro: "velocidad_previa",
      vehiculo,
      identificable: mejor !== null,
      sigma_local: sigma,
      ...(mejor !== null
        ? { estimacion: { mejor, p10: mejor - 2, p50: mejor, p90: mejor + 2 } }
        : {}),
    });
    const dano = {
      evidencia: ["dano_minimo:veh-a", "reposo_supuesto:veh-a"],
      parametros: [param("veh-a", null, 32.93), param("veh-b", null, 33.83)],
      velocidad_impacto: [],
      residuos: [],
      ajuste_completo: {
        valores: [
          { nombre: "velocidad:veh-a", valor: 66.25 },
          { nombre: "velocidad:veh-b", valor: 19.14 },
        ],
        residuos: [
          { nombre: "dano_minimo:veh-a", sigma: -0.11 },
          { nombre: "reposo_supuesto:veh-a:x", sigma: -0.187 },
          { nombre: "reposo_supuesto:veh-a:y", sigma: -0.592 },
        ],
      },
    };
    const reposo = {
      evidencia: dano.evidencia,
      parametros: [param("veh-a", 41.47, 3), param("veh-b", 41.99, 3)],
      velocidad_impacto: [],
      residuos: [
        { nombre: "dano_minimo:veh-a", sigma: -1.47 },
        { nombre: "reposo_supuesto:veh-a:x", sigma: 0.02 },
        { nombre: "reposo_supuesto:veh-a:y", sigma: -0.3 },
      ],
    };
    const r = interpretarResultado(base, {
      vehiculos: [],
      eventos: [],
      inversion: dano,
      inversion_reposo_supuesto: reposo,
    });
    const id = base.ids["veh-a"]!;
    expect(r.elegida).toBeNull();
    expect(r.hipotesis!.dano.velocidades.find((v) => v.vehiculo === id)).toMatchObject({
      kmh: 66.25,
      fijada: false,
      sigmaKmh: 32.93,
    });
    expect(r.hipotesis!.dano.reposos).toEqual([{ vehiculo: id, m: 6.2 }]);
    expect(r.hipotesis!.dano.alcanzaDano).toBe(true);
    expect(r.hipotesis!.reposo.reposos).toEqual([{ vehiculo: id, m: 0.3 }]);
    // La velocidad que la evidencia fija lleva su p10–p90; la del ajuste conjunto, no.
    expect(r.hipotesis!.reposo.velocidades.find((v) => v.vehiculo === id)!.rango).toEqual([
      39.47, 43.47,
    ]);
    expect(r.hipotesis!.dano.velocidades.find((v) => v.vehiculo === id)!.rango).toBeNull();
    expect(r.hipotesis!.reposo.alcanzaDano).toBe(false);
    // Sin elegir, el 3D lleva el ajuste conjunto de la del daño, dicho así.
    const sin = (especReconstruida(r).vehiculos as Json[]).find((v) => v.id === "veh-a")!;
    expect(sin.velocidad_previa).toMatchObject({ valor: 66.25, fuente: "supuesto" });
    const elegida = conHipotesis(r, "reposo");
    expect(elegida.elegida).toBe("reposo");
    expect(elegida.velocidades.find((v) => v.vehiculo === id)!.previa!.mejor).toBe(41.47);
    const con = (especReconstruida(elegida).vehiculos as Json[]).find((v) => v.id === "veh-a")!;
    expect(con.velocidad_previa).toMatchObject({ valor: 41.47 });
  });
});
