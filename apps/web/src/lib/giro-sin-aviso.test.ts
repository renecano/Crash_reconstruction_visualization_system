/**
 * Ningún vehículo atravesado en su calle sin aviso (René, 2026-11-25). La causa del giro de 25° a 43°
 * de la revisión de la cadena: el rumbo de cada flecha de llegada era la línea del choque al brazo de
 * la calle (a 22 m), y con el choque fuera del eje esa línea cruzaba la calle.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { conPosicion, type Expediente } from "@croquis/cesvi";
import { overpassDeTeselas, type LineaTesela } from "@croquis/croquis-2d";
import { describe, expect, it } from "vitest";
import { RADIO_CALLES_M } from "./calles-del-mapa";
import {
  calleDeLlegadaNarrada,
  callesDe,
  flechasDeLlegada,
  nombreVehiculo,
  poseDe,
  type Calle,
} from "./escena-facil";
import { AVISO_CALLE_DE_LLEGADA, proponerEscena } from "./escena-propuesta";
import { girosSinAviso, maniobraNarrada } from "./giro-sin-aviso";
import { impactosAColocar } from "./pasos-caso";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const linea = readFileSync(resolve(raiz, "data/cesvi/corpus/expedientes.jsonl"), "utf8")
  .split("\n")
  .find((l) => l.includes('"cesvi-cf708e9fed"'))!;
const expediente = (JSON.parse(linea) as { expediente: Expediente }).expediente;
const t = JSON.parse(
  readFileSync(
    resolve(raiz, "packages/croquis-2d/fixtures/teselas-periferico-viaducto.json"),
    "utf8",
  ),
) as { transportation: LineaTesela[]; transportation_name: LineaTesela[] };
const lugar = { lat: 19.4085338, lon: -99.1944592 };
const calles = callesDe(
  overpassDeTeselas(
    t.transportation,
    t.transportation_name,
    [lugar.lon, lugar.lat],
    RADIO_CALLES_M * 2,
  ),
);
const vs = expediente.vehiculos;
const nombreDe = (id: string) =>
  nombreVehiculo(
    vs.find((v) => v.id === id)!,
    vs,
  );

/** Una calle recta de oeste a este por la latitud dada (1° de latitud ≈ 110.6 km). */
const recta = (id: number, nombre: string, lat: number): Calle => ({
  id,
  nombre,
  puntos: [
    [-99.2, lat],
    [-99.19, lat],
  ],
  ancho: 10,
  nodos: [id * 10, id * 10 + 1],
});

describe("las flechas de llegada siguen el eje de su calle", () => {
  it("con el choque a 12 m del eje, la flecha va de oeste a este o al revés, no cruzada", () => {
    const calle = recta(1, "Avenida Recta", 19.4);
    const choque = { lat: 19.4 + 12 / 110_600, lon: -99.195 };
    const f = flechasDeLlegada([calle], choque);
    expect(f).toHaveLength(2);
    for (const x of f)
      expect(Math.min(Math.abs(x.rumbo - 90), Math.abs(x.rumbo - 270))).toBeLessThan(1);
  });

  it("entre dos calzadas paralelas, la de la flecha es la más cercana al choque", () => {
    const cerca = recta(1, "Lateral Norte", 19.4);
    const lejos = recta(2, "Lateral Sur", 19.4 - 15 / 110_600);
    const choque = { lat: 19.4 + 1 / 110_600, lon: -99.195 };
    const f = flechasDeLlegada([lejos, cerca], choque);
    expect(f.every((x) => x.calle === "Lateral Norte")).toBe(true);
  });
});

describe("la calle por la que la narración dice que llegaba", () => {
  const a = { ...vs[0]!, modelo: { valor: "Sentra", fuente: "expediente" as const } };
  const b = { ...vs[1]!, modelo: { valor: "Hilux", fuente: "expediente" as const } };
  const todos = [a, b];
  it("«circulaba sobre Avenida Tecnológico de sur a norte»", () => {
    const n =
      "El vehículo A, marca Nissan, tipo Sentra, circulaba sobre Avenida Tecnológico de sur a norte. El vehículo B, tipo Hilux, circulaba sobre Avenida Solidaridad Las Torres de oriente a poniente.";
    expect(calleDeLlegadaNarrada(n, a, todos)).toBe("Avenida Tecnológico");
    expect(calleDeLlegadaNarrada(n, b, todos)).toBe("Avenida Solidaridad Las Torres");
  });
  it("«por el carril derecho del paso a desnivel» y «detrás de él por el mismo carril»", () => {
    const n =
      "El hecho se ubica en el paso a desnivel de Circuito Interior en su cruce con Paseo de la Reforma. El vehículo B, tipo Hilux, circulaba de norte a sur por el carril derecho del paso a desnivel. El vehículo A, tipo Sentra, circulaba detrás de él por el mismo carril.";
    expect(calleDeLlegadaNarrada(n, b, todos)).toBe("Circuito Interior");
    expect(calleDeLlegadaNarrada(n, a, todos)).toBe("Circuito Interior");
  });
  it("sin calle en su oración, null", () => {
    expect(
      calleDeLlegadaNarrada("El vehículo A, tipo Sentra, circulaba de sur a norte.", a, todos),
    ).toBeNull();
  });
});

describe("la comprobación: atravesado sin aviso falla", () => {
  const p = proponerEscena({
    expediente,
    impactos: impactosAColocar(expediente),
    calles,
    narracion: null,
    lugar,
    nombreDe,
  })!;
  const propuestos = p.propuestos.map((x) => x.texto);
  // Sin el renglón del objeto en la orilla («… sale de su carril para alcanzarlo»), que es su aviso.
  const sinOrilla = p.propuestos.filter((x) => x.clave !== "orilla-1").map((x) => x.texto);
  const base = { calles, narracion: null, nombreDe };

  it("la escena ya armada no deja a nadie atravesado sin aviso", () => {
    expect(girosSinAviso({ ...base, expediente: p.expediente, propuestos })).toEqual([]);
  });

  // El del choque, girado 60° sobre su lugar.
  const v = impactosAColocar(expediente)[0]!.vehiculos[0]!;
  const pose = poseDe(p.expediente, v, "impacto")!;
  const girado = conPosicion(p.expediente, {
    vehiculo: v,
    fase: "impacto",
    punto: pose.punto,
    rumbo: (pose.rumbo + 60) % 360,
    fuente: "supuesto",
  } as Parameters<typeof conPosicion>[1]);

  it("girado 60° sin aviso: falla", () => {
    const r = girosSinAviso({ ...base, expediente: girado, propuestos: sinOrilla });
    expect(r.map((x) => x.vehiculo)).toEqual([v]);
  });

  it("con el aviso en su renglón de La escena, no", () => {
    const conAviso = [...sinOrilla, `${nombreDe(v)}: venía por X; ${AVISO_CALLE_DE_LLEGADA}`];
    expect(girosSinAviso({ ...base, expediente: girado, propuestos: conAviso })).toEqual([]);
  });

  it("con una maniobra narrada (dio vuelta), no", () => {
    const quien = vs.find((x) => x.id === v)!;
    const narracion = `El ${nombreDe(v)} dio vuelta a la izquierda para incorporarse a la lateral.`;
    expect(maniobraNarrada(narracion, quien, vs)).toBe(true);
    expect(
      girosSinAviso({ ...base, narracion, expediente: girado, propuestos: sinOrilla }),
    ).toEqual([]);
  });
});
