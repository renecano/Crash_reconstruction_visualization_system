/**
 * La escena ya armada (ronda 4, René, 2026-11-18) con el caso cesvi-cf708e9fed: su expediente del
 * corpus y las calles de las teselas de su lugar (el Periférico a la altura de Viaducto), sin red.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Expediente } from "@croquis/cesvi";
import { overpassDeTeselas, type LineaTesela } from "@croquis/croquis-2d";
import { describe, expect, it } from "vitest";
import { RADIO_CALLES_M } from "./calles-del-mapa";
import { callesDe, nombreVehiculo, poseDe, rumboAlineado } from "./escena-facil";
import { listaDeLaEscena, proponerEscena } from "./escena-propuesta";
import { impactosAColocar } from "./pasos-caso";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "../../../..");
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
const nombreDe = (id: string) =>
  nombreVehiculo(
    expediente.vehiculos.find((v) => v.id === id)!,
    expediente.vehiculos,
  );

describe("la escena ya armada (cesvi-cf708e9fed)", () => {
  const p = proponerEscena({
    expediente,
    impactos: impactosAColocar(expediente),
    calles,
    narracion: null,
    lugar,
    nombreDe,
  })!;

  it("propone el choque en un cruce y a cada vehículo del primer choque en él", () => {
    expect(p).not.toBeNull();
    expect(p.propuestos[0]!.clave).toBe("choque-1");
    for (const v of impactosAColocar(expediente)[0]!.vehiculos) {
      const pose = poseDe(p.expediente, v, "impacto");
      expect(pose).toBeTruthy();
      // Como supuesto: se ve distinto hasta que el perito lo confirma.
      expect(pose!.fuente).toBe("supuesto");
    }
  });

  it("el primero queda alineado con una calle del mapa (no atravesado)", () => {
    const v = impactosAColocar(expediente)[0]!.vehiculos[0]!;
    const pose = poseDe(p.expediente, v, "impacto")!;
    const alineado = rumboAlineado(calles, p.puntos[1]!, pose.rumbo);
    const dif = Math.abs((((pose.rumbo - alineado) % 180) + 180) % 180);
    expect(Math.min(dif, 180 - dif)).toBeLessThan(15);
  });

  it("cada «Por qué» es concreto: la calle, el sentido y los daños en que se basa (René)", () => {
    const d = p.propuestos.find((x) => x.clave.startsWith("direccion-"))!;
    expect(d.texto).toMatch(/venía por .+, de \S+ a \S+$/);
    expect(d.porque).toMatch(/daño|narración/);
  });

  it("lo que no puede proponer va a la lista de lo que falta, con su porqué", () => {
    expect(p.faltan.some((f) => f.clave.startsWith("final-"))).toBe(true);
    expect(p.faltan.every((f) => f.porque.length > 0)).toBe(true);
  });

  it("sin calles ni lugar no propone nada", () => {
    expect(
      proponerEscena({
        expediente,
        impactos: impactosAColocar(expediente),
        calles: [],
        narracion: null,
        lugar: null,
        nombreDe,
      }),
    ).toBeNull();
  });
});

describe("sin calles en el lugar (René, 2026-11-18: no inventar la dirección)", () => {
  it("el choque va en el lugar y por dónde venía cada uno falta, sin un rumbo supuesto", () => {
    const impactos = impactosAColocar(expediente);
    const p = proponerEscena({
      expediente,
      impactos,
      calles: [],
      narracion: null,
      lugar,
      nombreDe,
    })!;
    expect(p.propuestos.some((x) => x.clave.startsWith("direccion-"))).toBe(false);
    const faltan = p.faltan.filter((x) => x.clave.startsWith("direccion-"));
    expect(faltan.length).toBe(impactos[0]!.vehiculos.length);
    const l = listaDeLaEscena({
      expediente: p.expediente,
      impactos,
      pasos: [],
      propuesta: p,
      confirmados: new Set<string>(),
      direccionesNoSe: [],
      juntoAlChoque: [],
      desconocidos: [],
      nombreDe,
    });
    for (const f of faltan) expect(l.find((x) => x.clave === f.clave)!.estado).toBe("falta");
  });
});

describe("la lista de La escena (ronda 4, propuesta 1)", () => {
  const impactos = impactosAColocar(expediente);
  const p = proponerEscena({ expediente, impactos, calles, narracion: null, lugar, nombreDe })!;
  const base = {
    impactos,
    pasos: [
      { tipo: "golpe", hecho: false },
      { tipo: "terreno", hecho: true },
    ],
    propuesta: p,
    confirmados: new Set<string>(),
    direccionesNoSe: [],
    juntoAlChoque: [],
    desconocidos: [],
    nombreDe,
  };

  it("lo propuesto se ve propuesto, con su porqué, y lo que no se pudo proponer falta", () => {
    const l = listaDeLaEscena({ ...base, expediente: p.expediente });
    expect(l.find((x) => x.clave === "choque-1")!.estado).toBe("propuesto");
    const d = l.find((x) => x.clave.startsWith("direccion-"))!;
    expect(d.estado).toBe("propuesto");
    expect(d.porque).toBeTruthy();
    expect(l.find((x) => x.clave.startsWith("final-"))!.estado).toBe("falta");
    // Las preguntas de C1 son opcionales.
    expect(l.find((x) => x.clave === "c1-golpe")).toMatchObject({
      opcional: true,
      estado: "falta",
    });
    expect(l.find((x) => x.clave === "c1-terreno")!.estado).toBe("confirmado");
  });

  it("lo que el perito confirma cambia de estado", () => {
    const v = impactos[0]!.vehiculos[0]!;
    const conChoque = listaDeLaEscena({
      ...base,
      expediente: p.expediente,
      confirmados: new Set(["choque-1"]),
      juntoAlChoque: [v],
    });
    expect(conChoque.find((x) => x.clave === "choque-1")!.estado).toBe("confirmado");
    expect(conChoque.find((x) => x.clave === `final-${v}`)).toMatchObject({
      estado: "confirmado",
      texto: `${nombreDe(v)}: quedó junto al choque`,
    });
    // «No sé por dónde venía» también cuenta como respondido.
    const conNoSe = listaDeLaEscena({ ...base, expediente: p.expediente, direccionesNoSe: [v] });
    expect(conNoSe.find((x) => x.clave === `direccion-${v}`)!.estado).toBe("confirmado");
  });
});
