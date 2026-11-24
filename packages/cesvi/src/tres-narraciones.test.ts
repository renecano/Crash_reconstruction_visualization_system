import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { candadoFisico } from "./candado";
import { impactosEncimados } from "./encimadas";
import { escenaDeConversion, escenaDeNarracion } from "./escena-narracion";
import { claseDeModelo } from "./fichas";
import { OBJETO_PERSONA } from "./personas";
import { rumboDeLlegada, rumboDelFrente } from "./reversa";
import { enMetros } from "./geo";
import { medidasDe } from "./poses-impacto";
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import {
  especDeExpediente,
  especReconstruida,
  reconstruirExpediente,
  rectoTrasLaVuelta,
} from "./reconstruccion";

/**
 * Las tres narraciones que René probó en producción (2026-11-24): el árbol al salir de una curva, el
 * camión que da vuelta y atropella a un peatón, y la carambola en el semáforo de Tollocan. Sus casos
 * guardados están en `data/cesvi/casos/rene-*.croquis`.
 */
const caso = (nombre: string) =>
  (
    JSON.parse(
      readFileSync(
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          `../../../data/cesvi/casos/${nombre}.croquis`,
        ),
        "utf8",
      ),
    ) as { expediente: Expediente }
  ).expediente;

describe("el árbol al salir de una curva: el derrape de antes del choque", () => {
  const e = caso("rene-arbol-curva");

  it("el derrape que la narración pone antes de salir del camino es de antes del impacto", () => {
    const { spec } = especDeExpediente(e, "arbol");
    const derrape = (spec.evidencias as { tipo: string; fase?: string }[]).find(
      (x) => x.tipo === "marcas_derrape",
    );
    expect(derrape?.fase).toBe("antes_impacto");
    // Y el vehículo empieza detrás de sus 18 m de huella, no a 12 m del impacto.
    const v = (spec.vehiculos as { posicion_inicial: { procedencia: { nota: string } } }[])[0]!;
    expect(v.posicion_inicial.procedencia.nota).toMatch(/^23 m antes .*detrás de sus huellas/);
  });

  it(
    "llega al árbol frenado por el derrape: menos velocidad al impacto que antes",
    { timeout: 240_000 },
    () => {
      const r = reconstruirExpediente(e, "arbol", { samples: 8, mcSamples: 8 });
      const v = r.velocidades[0]!;
      expect(r.resultado.inversion).toBeTruthy();
      expect((r.resultado.inversion as { evidencia: string[] }).evidencia).toContain(
        "marcas_frenado:veh-a",
      );
      // 18 m con la fricción del pavimento seco: de ~80 km/h a ~57 al impacto.
      expect(v.impacto!.p50!).toBeLessThan(v.previa!.mejor - 15);
    },
  );
});

describe("la carambola en el semáforo: el Aveo y la Rio colocados encimados", () => {
  const e = caso("rene-carambola-semaforo");

  it("«Separarlos» los deja uno detrás del otro, por su rumbo, no en otro carril", () => {
    const enc = impactosEncimados(e).find((x) => x.orden === 2);
    expect(enc).toBeTruthy();
    const [p2, p3] = ["V2", "V3"].map((v) => enc!.propuesta.find((p) => p.vehiculo === v)!);
    const d = enMetros([p3!.punto.lon, p3!.punto.lat], [p2!.punto.lon, p2!.punto.lat]);
    const r = (p2!.rumbo * Math.PI) / 180;
    const largo = (id: string) => medidasDe(e.vehiculos.find((v) => v.id === id)!).largo;
    const alo = d.este * Math.sin(r) + d.norte * Math.cos(r);
    const deLado = Math.abs(d.este * Math.cos(r) - d.norte * Math.sin(r));
    // Defensa con defensa: la distancia entre centros es la suma de sus medios largos.
    expect(alo).toBeCloseTo((largo("V2") + largo("V3")) / 2, 1);
    // Y no se mueven de lado (de carril): lo de lado es lo que ya tenían.
    expect(deLado).toBeLessThan(0.5);
  });
});

describe("el candado físico (René, 2026-11-24)", () => {
  it(
    "la carambola con el Aveo y la Rio encimados no presenta cifra: dice qué no cuadra y qué revisar",
    { timeout: 240_000 },
    () => {
      const r = reconstruirExpediente(caso("rene-carambola-semaforo"), "carambola", {
        samples: 8,
        mcSamples: 8,
      });
      expect(r.noCuadra).toBeTruthy();
      expect(r.noCuadra!.motivos.join(" ")).toMatch(/quedan encimados .* m al chocar/);
      expect(r.noCuadra!.revisar.join(" ")).toMatch(/Separarlos/);
      // Sin cifra presentada: ninguna velocidad, y la de referencia va aparte.
      expect(r.velocidades.every((v) => v.previa === null && v.impacto === null)).toBe(true);
      expect(r.noCuadra!.cifras.length).toBeGreaterThan(0);
      expect(r.limites.some((l) => l.startsWith("Croquis no presenta una velocidad"))).toBe(true);
    },
  );

  it("el árbol cuadra: la cifra se presenta", { timeout: 240_000 }, () => {
    const r = reconstruirExpediente(caso("rene-arbol-curva"), "arbol", {
      samples: 8,
      mcSamples: 8,
    });
    expect(r.noCuadra).toBeUndefined();
    expect(r.velocidades[0]!.previa).toBeTruthy();
  });

  it("frenar más de 1 g con las huellas de antes del choque no cuadra", () => {
    const { noCuadra } = candadoFisico({
      especAnimada: {
        evidencias: [
          {
            tipo: "marcas_frenado",
            vehiculo_id: "veh-a",
            longitud: { valor: 9, unidad: "m" },
          },
        ],
      },
      ids: { "veh-a": "V1" },
      // 163 km/h con 9 m de frenado y 60 al impacto: (45.3² − 16.7²) / 18 = 98 m/s², 10 g.
      velocidades: [{ vehiculo: "V1", previa: { mejor: 163 }, impacto: { p50: 60 } }],
    });
    expect(noCuadra!.motivos[0]).toMatch(/exige frenar a 10\.0 g/);
  });
});

describe("lo que no cuadra no se anima", () => {
  it(
    "el 3D de la carambola encimada deja a cada vehículo quieto donde quedó, sin choque",
    { timeout: 240_000 },
    () => {
      const r = reconstruirExpediente(caso("rene-carambola-semaforo"), "carambola", {
        samples: 8,
        mcSamples: 8,
      });
      const s = especReconstruida(r) as {
        eventos: unknown[];
        vehiculos: { velocidad_previa: { valor: number } }[];
      };
      expect(s.eventos).toEqual([]);
      expect(s.vehiculos.every((v) => v.velocidad_previa.valor === 0)).toBe(true);
      const d = reconstructionToDict(reconstruct(s)) as {
        vehiculos: { trayectoria: { x: number[]; y: number[] } }[];
      };
      for (const v of d.vehiculos) {
        const { x, y } = v.trayectoria;
        expect(Math.hypot(x.at(-1)! - x[0]!, y.at(-1)! - y[0]!)).toBeLessThan(0.05);
      }
    },
  );
});

describe("el camión que da vuelta a la derecha", () => {
  const guardado = caso("rene-peaton-vuelta");
  // Como lo deja ahora La escena: venía del sur y en el choque ya dio la vuelta (mira al oriente).
  const e: Expediente = {
    ...guardado,
    versiones: guardado.versiones!.map((v) => ({
      ...v,
      posiciones: (v.posiciones ?? []).map((p) =>
        p.fase === "impacto" ? { ...p, rumbo: rumboDelFrente(guardado, "V1", 0) } : p,
      ),
    })),
  };

  it("en el choque mira al oriente: venía del sur con vuelta a la derecha", () => {
    expect(rumboDelFrente(guardado, "V1", 0)).toBe(90);
    expect(rumboDeLlegada(guardado, "V1", 90)).toBe(0);
  });

  it("empieza en la calle de donde venía y la vuelta termina en el choque", () => {
    const { spec } = especDeExpediente(e, "vuelta");
    const v = (
      spec.vehiculos as {
        posicion_inicial: { x: number; y: number; rumbo_deg: number };
        maniobra: { valor: string };
      }[]
    )[0]!;
    expect(v.maniobra.valor).toBe("vuelta_derecha");
    // Al norte (90° en la escena del solver), al sur y al poniente del choque.
    expect(v.posicion_inicial.rumbo_deg).toBeCloseTo(90, 0);
    const imp = (spec.eventos as { punto_impacto: { x: number; y: number } }[])[0]!.punto_impacto;
    expect(imp.y - v.posicion_inicial.y).toBeGreaterThan(5);
    expect(imp.x - v.posicion_inicial.x).toBeGreaterThan(5);
    // Y el solver lo lleva por el arco hasta el choque, mirando al oriente.
    const d = reconstructionToDict(reconstruct(spec)) as {
      vehiculos: { trayectoria: { t: number[]; rumbo: number[] } }[];
    };
    const tr = d.vehiculos[0]!.trayectoria;
    const k = tr.t.findIndex((t) => t >= 0);
    expect(Math.abs(tr.rumbo[k]!)).toBeLessThan(0.35);
  });
});

describe("el de en medio de la carambola", () => {
  const guardado = caso("rene-carambola-semaforo");
  // Como lo lee la narración: el segundo choque no dice con qué parte golpeó B.
  const leido: Expediente = {
    ...guardado,
    versiones: [],
    impactos: guardado.impactos!.map((i) =>
      i.orden === 2 ? { ...i, zonas: i.zonas!.filter((z) => z.vehiculo !== "V2") } : i,
    ),
  };

  it("con daños atrás y adelante, y el primer choque atrás, el segundo es adelante: no se pregunta", () => {
    const r = escenaDeConversion({
      expediente: leido,
      conteos: {
        filas: 0,
        valores_invalidos: 0,
        citas: 0,
        citas_fuera: 0,
        numeros: 0,
        numeros_fuera: 0,
      },
      posiciones: [],
    });
    const z = r.expediente.impactos!.find((i) => i.orden === 2)!.zonas!;
    expect(z.find((x) => x.vehiculo === "V2")!.zona.cara).toBe("frontal");
    expect(r.preguntas.some((p) => p.clave === "zona-2-V2")).toBe(false);
  });
});

describe("las tres narraciones, con su lectura grabada (con la llave de René, 2026-11-24)", () => {
  const leer = (n: string) => {
    const g = JSON.parse(
      readFileSync(
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          `../../../data/cesvi/grabaciones/tres-narraciones/${n}.json`,
        ),
        "utf8",
      ),
    ) as { narracion: string; salida: SalidaCorpus };
    return escenaDeNarracion(g.salida, g.narracion);
  };

  it("el árbol: 80 km/h narrados y el derrape de 18 m antes de salir del camino", () => {
    const { expediente: e } = leer("rene-arbol-curva");
    expect(e.vehiculos[0]!.velocidad_narrada?.kmh).toBe(80);
    const { spec } = especDeExpediente(e, "arbol-grabado");
    const d = (
      spec.evidencias as { tipo: string; fase?: string; longitud?: { valor: number } }[]
    ).filter((x) => x.tipo === "marcas_derrape" || x.tipo === "marcas_frenado");
    expect(d.some((x) => x.fase === "antes_impacto" && x.longitud?.valor === 18)).toBe(true);
  });

  it("el camión: da vuelta a la derecha y el impacto es contra un peatón", () => {
    const { expediente: e } = leer("rene-peaton-vuelta");
    const m = e.versiones?.find((v) => v.tipo === "evidencia")?.maniobras ?? [];
    expect(m.some((x) => x.vehiculo === "V1" && x.tipo === "vira_derecha")).toBe(true);
    expect(e.impactos?.some((i) => OBJETO_PERSONA.test(i.objeto_fijo ?? ""))).toBe(true);
  });

  it("la carambola: dos choques, el de en medio con su parte de cada uno, y C detenido", () => {
    const { expediente: e, posiciones } = leer("rene-carambola-semaforo");
    expect(e.impactos).toHaveLength(2);
    for (const i of e.impactos!)
      expect(i.zonas?.find((z) => z.vehiculo === "V2")?.zona.cara).toBe(
        i.vehiculos!.includes("V1") ? "posterior" : "frontal",
      );
    expect(posiciones.filter((p) => p.fase === "final")).toHaveLength(3);
  });
});

describe("la clase sale del modelo (revisión de la cadena, 2026-11-24)", () => {
  const v = (marca: string, modelo: string) =>
    ({ id: "V1", marca: { valor: marca }, modelo: { valor: modelo } }) as never;

  it("reconoce las familias por su carrocería, con su marca o sin ella", () => {
    expect(claseDeModelo(v("Nissan", "Tsuru"))).toBe("sedan_compacto");
    expect(claseDeModelo(v("Chevrolet", "Suburban"))).toBe("suv_grande");
    expect(claseDeModelo(v("Dodge", "Ram 4000"))).toBe("pickup");
    expect(claseDeModelo(v("Volkswagen", "Beetle"))).toBe("sedan_mediano");
    expect(claseDeModelo(v("Italika", "250Z"))).toBe("motocicleta");
  });

  it("los tractocamiones y camiones, por su marca", () => {
    expect(claseDeModelo(v("Kenworth", "KW 900"))).toBe("tractocamion");
    expect(claseDeModelo(v("Isuzu", "ELF 400"))).toBe("camion_unitario");
  });

  it("lo que no reconoce no lo inventa: se pregunta", () => {
    expect(claseDeModelo(v("Saab", "9-3"))).toBeNull();
  });
});

describe("la vuelta arranca sobre la calle de llegada (revisión de la cadena, 2026-11-24)", () => {
  // La calle de llegada va de sur a norte por x = 0; la vuelta es a la derecha (sale al este).
  const llegada = [
    [
      { x: 0, y: -100 },
      { x: 0, y: 100 },
    ],
  ];
  it("el tramo recto tras el arco deja el arranque en el eje: 20 m al este del eje, 12 m de recta", () => {
    expect(rectoTrasLaVuelta(llegada, { x: 20, y: 30 }, Math.PI / 2, 0)).toBeCloseTo(12, 6);
  });
  it("sin calle paralela cerca, los 2 m de siempre", () => {
    expect(rectoTrasLaVuelta([], { x: 20, y: 30 }, Math.PI / 2, 0)).toBe(2);
    expect(rectoTrasLaVuelta(llegada, { x: 200, y: 30 }, Math.PI / 2, 0)).toBe(2);
  });
});
