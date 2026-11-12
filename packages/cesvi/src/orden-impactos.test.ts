/**
 * T6.3 (W7): el orden de impactos de una carambola declarado a mano. Con lecturas reales grabadas
 * (`data/cesvi/grabaciones/`); CI no llama a la API.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { escenaDeNarracion, preguntaPendiente } from "./escena-narracion";
import {
  CLAVE_ORDEN_IMPACTOS,
  conOrdenImpactos,
  esCarambola,
  impactosEntreVehiculos,
  ordenesPosibles,
  ordenNarrado,
  textoOrden,
} from "./orden-impactos";
import { pizarraDeEscena, sinPregunta } from "./pizarra";
import { especDeExpediente } from "./reconstruccion";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/cesvi/grabaciones");
const grabada = (ruta: string) =>
  JSON.parse(readFileSync(resolve(DIR, ruta), "utf8")) as {
    narracion: string;
    salida: SalidaCorpus;
  };

/** «Un tráiler… choca de frente contra una urvan; atrás venía un rabón que alcanza a la urvan.» */
const TRAILER = grabada("relatos-w2/trailer-urvan.json");
/** La carambola narrada con su secuencia (E-R6). */
const CARAMBOLA = grabada("carambola/carambola-e2e.json");

const pares = (e: Expediente) =>
  impactosEntreVehiculos(e).map((i) => `${i.orden}:${(i.vehiculos ?? []).join("-")}`);

describe("si la narración dice el orden", () => {
  it("lo dicen las palabras de secuencia y de consecuencia, con o sin acento", () => {
    for (const t of [
      "Primero A alcanza a B y después B golpea a C.",
      "A impacta a B; posteriormente B se proyecta contra C.",
      "A choca con B y, a su vez, B con C.",
      "A golpea a B proyectándolo contra C.",
      "A alcanza a B, que por el impacto pega con C.",
      "A CHOCA CON B Y LUEGO B CON C",
    ]) {
      expect(ordenNarrado(t), t).toBe(true);
    }
  });

  it("no lo dice quien solo enumera los choques", () => {
    for (const t of [
      "A choca con B y B choca con C.",
      "Hubo un choque entre A y B y otro entre B y C.",
      TRAILER.narracion,
    ]) {
      expect(ordenNarrado(t), t).toBe(false);
    }
  });

  it("la carambola de ejemplo sí lo dice", () => {
    expect(ordenNarrado(CARAMBOLA.narracion)).toBe(true);
  });
});

describe("la pregunta del orden de impactos", () => {
  const escena = escenaDeNarracion(TRAILER.salida, TRAILER.narracion);
  const e = escena.expediente;

  it("se hace en una carambola cuya narración no dice el orden, con el orden leído primero", () => {
    expect(esCarambola(e)).toBe(true);
    const p = escena.preguntas.find((x) => x.clave === CLAVE_ORDEN_IMPACTOS)!;
    expect(p.texto).toBe("La narración no dice en qué orden ocurrieron los impactos. ¿Cuál fue?");
    expect(p.control).toEqual({
      tipo: "opciones",
      opciones: [
        { valor: "1,2", etiqueta: "V1 con V2, luego V3 con V2" },
        { valor: "2,1", etiqueta: "V3 con V2, luego V1 con V2" },
      ],
    });
    expect(preguntaPendiente(p, e, [])).toBe(true);
  });

  it("no se hace si la narración dice el orden, ni con un solo impacto", () => {
    const dicha = escenaDeNarracion(CARAMBOLA.salida, CARAMBOLA.narracion);
    expect(esCarambola(dicha.expediente)).toBe(true);
    expect(dicha.preguntas.some((x) => x.clave === CLAVE_ORDEN_IMPACTOS)).toBe(false);
    const zocalo = grabada("relatos-w2/zocalo.json");
    const uno = escenaDeNarracion(zocalo.salida, zocalo.narracion);
    expect(esCarambola(uno.expediente)).toBe(false);
    expect(uno.preguntas.some((x) => x.clave === CLAVE_ORDEN_IMPACTOS)).toBe(false);
  });

  it("al contestarla sale de la pizarra y de su escena, y no vuelve", () => {
    const p = pizarraDeEscena(TRAILER.narracion, escena, {
      conclusiones: null,
      origen: "la narración",
    });
    expect(p.preguntas.some((x) => x.clave === CLAVE_ORDEN_IMPACTOS)).toBe(true);
    const q = sinPregunta(p, CLAVE_ORDEN_IMPACTOS);
    expect(q.preguntas.some((x) => x.clave === CLAVE_ORDEN_IMPACTOS)).toBe(false);
    expect(q.escena!.preguntas.some((x) => x.clave === CLAVE_ORDEN_IMPACTOS)).toBe(false);
    // Las demás preguntas siguen.
    expect(q.preguntas.length).toBe(p.preguntas.length - 1);
  });
});

describe("declarar el orden a mano", () => {
  const e = escenaDeNarracion(TRAILER.salida, TRAILER.narracion).expediente;

  it("las formas de ordenar empiezan por el orden de ahora", () => {
    expect(pares(e)).toEqual(["1:V1-V2", "2:V3-V2"]);
    expect(ordenesPosibles(e)).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(textoOrden(e, [2, 1])).toBe("V3 con V2, luego V1 con V2");
  });

  it("el impacto que el perito pone primero pasa a ser el 1, con lo suyo", () => {
    const antes = impactosEntreVehiculos(e);
    const d = conOrdenImpactos(e, [2, 1]);
    expect(pares(d)).toEqual(["1:V3-V2", "2:V1-V2"]);
    const [primero, segundo] = impactosEntreVehiculos(d);
    // Cada impacto conserva su cita y sus zonas; solo cambia su lugar, y la fuente es el perito.
    expect(primero!.cita).toEqual(antes[1]!.cita);
    expect(primero!.zonas).toEqual(antes[1]!.zonas);
    expect(segundo!.cita).toEqual(antes[0]!.cita);
    expect(d.impactos!.every((i) => i.fuente === "perito")).toBe(true);
    // El expediente original no se toca.
    expect(pares(e)).toEqual(["1:V1-V2", "2:V3-V2"]);
  });

  it("confirmar el orden leído lo deja igual", () => {
    expect(pares(conOrdenImpactos(e, [1, 2]))).toEqual(pares(e));
  });

  it("una secuencia que no reordena esos impactos no cambia nada", () => {
    for (const mala of [[1], [1, 1], [1, 3], [1, 2, 3], []]) {
      expect(conOrdenImpactos(e, mala)).toBe(e);
    }
  });

  it("un choque contra un objeto conserva su lugar entre los impactos", () => {
    const conObjeto: Expediente = {
      ...e,
      impactos: [
        { ...e.impactos![0]!, orden: 1 },
        { orden: 2, vehiculos: ["V2"], objeto_fijo: "un poste", fuente: "perito" },
        { ...e.impactos![1]!, orden: 3 },
      ],
    };
    const d = conOrdenImpactos(conObjeto, [3, 1]);
    expect(d.impactos!.map((i) => `${i.orden}:${(i.vehiculos ?? []).join("-")}`)).toEqual([
      "1:V3-V2",
      "2:V2",
      "3:V1-V2",
    ]);
  });

  it("con más de tres impactos entre vehículos no se ofrecen las formas de ordenar", () => {
    const cuatro: Expediente = {
      ...e,
      impactos: [1, 2, 3, 4].map((orden) => ({ ...e.impactos![0]!, orden })),
    };
    expect(ordenesPosibles(cuatro)).toEqual([]);
    expect(
      ordenesPosibles({ ...e, impactos: [1, 2, 3].map((o) => ({ ...e.impactos![0]!, orden: o })) }),
    ).toHaveLength(6);
  });

  it("el primer impacto declarado es el primero de la escena del solver", () => {
    const actores = (x: Expediente) => {
      const esc = especDeExpediente(x);
      const eventos = (esc.spec.eventos as { orden: number; tipo: string; actores: string[] }[])
        .filter((ev) => ev.tipo.startsWith("impacto") || ev.tipo === "segundo_impacto")
        .sort((a, b) => a.orden - b.orden);
      // `ids` lleva de los vehículos de la escena (veh-a…) a los del expediente (V1…).
      return eventos.map((ev) => ev.actores.map((a) => esc.ids[a] ?? a).join("-"));
    };
    expect(actores(e)[0]).toBe("V1-V2");
    expect(actores(conOrdenImpactos(e, [2, 1]))[0]).toBe("V3-V2");
  });
});
