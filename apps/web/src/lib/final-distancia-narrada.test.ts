import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { escenaComoPerito } from "./ejemplo-como-perito";
import { conLugarDelEjemplo } from "./ejemplos-narracion";
import {
  acotamientoDeTags,
  conPosicionEscrita,
  corrimientoAlAcotamiento,
  finalDeLaNarracion,
  medidaEscrita,
  poseDe,
} from "./escena-facil";
import { RECETAS_PERITO } from "./recetas-perito";

/**
 * La distancia que da la narración, exacta (René, 2026-11-27: un toque a lo largo movía la carambola de
 * 25 a 21.5). «5 metros adelante del área de restos» y «10 metros adelante del área de restos»: desde su
 * posición en el choque, hacia donde avanzaba.
 */
const RAIZ = resolve(__dirname, "../../../..");
function armada(clave: string): Expediente {
  const receta = RECETAS_PERITO.find((r) => r.clave === clave)!;
  const g = JSON.parse(
    readFileSync(resolve(RAIZ, `data/cesvi/grabaciones/ejemplos/${clave}.json`), "utf8"),
  ) as { narracion: string; salida: SalidaCorpus };
  const leida = cesvi.escenaDeNarracion(g.salida, g.narracion);
  const e0 = conLugarDelEjemplo(g.narracion, leida.expediente as never) as unknown as Expediente;
  return escenaComoPerito(e0, g.narracion, leida.posiciones, receta).expediente;
}
/** El punto del primer choque, o el centro de las poses de impacto de sus vehículos. */
function puntoDelPrimerChoque(e: Expediente) {
  const p = [...(e.impactos ?? [])].sort((a, b) => a.orden - b.orden)[0]!;
  if (p.punto) return p.punto;
  const q = (p.vehiculos ?? []).map((v) => poseDe(e, String(v), "impacto")!.punto);
  return {
    lat: q.reduce((s, x) => s + x.lat, 0) / q.length,
    lon: q.reduce((s, x) => s + x.lon, 0) / q.length,
  };
}
const m = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  cesvi.distanciaM([a.lon, a.lat], [b.lon, b.lat]);

describe("la distancia narrada desde el área de restos", () => {
  const e = armada("carambola-lluvia");
  const id = (palabra: string) =>
    e.vehiculos.find((v) => JSON.stringify(v).toLowerCase().includes(palabra))!.id;
  it.each([
    ["corolla", "el vehículo B, en el mismo carril, 5 metros adelante del área de restos", 5],
    ["aveo", "y el vehículo C, 10 metros adelante del área de restos", 10],
  ])("%s: %s", (palabra, texto, metros) => {
    const v = id(palabra);
    const f = finalDeLaNarracion(e, v, texto)!;
    expect(f).not.toBeNull();
    // Desde los restos (el punto del primer choque), no desde su propia pose.
    const choque = puntoDelPrimerChoque(e);
    expect(m(f.punto, choque)).toBeCloseTo(metros, 1);
  });
  it("«9 metros adelante del inicio de los restos» (el alcance)", () => {
    const a = armada("alcance-deformacion");
    const v = a.vehiculos.find((x) => JSON.stringify(x).includes("NP300"))!.id;
    const f = finalDeLaNarracion(
      a,
      v,
      "quedó en el carril de baja velocidad, 9 metros adelante del inicio de los restos",
    )!;
    const choque = puntoDelPrimerChoque(a);
    expect(m(f.punto, choque)).toBeCloseTo(9, 1);
    // «sobre el acotamiento, 21 metros adelante»: 21 m y 3 m a su derecha.
    const vento = a.vehiculos.find((x) => JSON.stringify(x).includes("Vento"))!.id;
    const g = finalDeLaNarracion(
      a,
      vento,
      "sobre el acotamiento, 21 metros adelante del inicio de los restos",
    )!;
    expect(m(g.punto, choque)).toBeCloseTo(Math.hypot(21, 3), 1);
    expect(g.texto).toMatch(/sobre el acotamiento/);
  });
});

describe("las posiciones escritas en metros (René, 2026-11-27)", () => {
  const e = armada("carambola-lluvia");
  const v = e.vehiculos.find((x) => JSON.stringify(x).toLowerCase().includes("corolla"))!.id;
  it("el reposo a 5 m adelante y 0.5 m a la izquierda: exacto, y la medida que ve el perito vuelve igual", () => {
    const x = conPosicionEscrita(e, v, "final", 5, 0.5, []);
    expect(m(poseDe(x, v, "final")!.punto, poseDe(x, v, "impacto")!.punto)).toBeCloseTo(
      Math.hypot(5, 0.5),
      2,
    );
    expect(medidaEscrita(x, v, "final", [])).toEqual({
      adelante: 5,
      izquierda: 0.5,
      desde: "su posición en el choque",
    });
  });
  it("la posición tocada también se ve en metros", () => {
    const med = medidaEscrita(e, v, "final", [])!;
    expect(Number.isFinite(med.adelante)).toBe(true);
    expect(Number.isFinite(med.izquierda)).toBe(true);
  });
});

describe("«sobre el acotamiento»: un supuesto visible y editable (René, 2026-11-27)", () => {
  const lat0 = 19.3;
  const ll2 = (x: number, y: number): [number, number] => [
    -99.18 + x / (111320 * Math.cos((lat0 * Math.PI) / 180)),
    lat0 + y / 111320,
  ];
  const calle = (acotamiento?: number) => ({
    id: 1,
    nombre: "Carretera",
    puntos: [ll2(-100, 0), ll2(100, 0)],
    ancho: 7,
    carriles: 2,
    nodos: [1, 2],
    tipo: "primary",
    ...(acotamiento ? { acotamiento } : {}),
  });
  const p = { lon: ll2(0, 0)[0], lat: ll2(0, 0)[1] };
  it("con el ancho de OSM (shoulder:width): medio carril más medio acotamiento", () => {
    expect(corrimientoAlAcotamiento([calle(3)], p)).toEqual({
      metros: 3.3,
      carrilM: 3.5,
      acotamientoM: 3,
      delMapa: true,
    });
  });
  it("sin él, el supuesto de 2.5 m, y lo dice", () => {
    expect(corrimientoAlAcotamiento([calle()], p)).toMatchObject({ metros: 3, delMapa: false });
    expect(acotamientoDeTags({ "shoulder:width": "2.8" })).toBe(2.8);
    expect(acotamientoDeTags({ highway: "primary" })).toBeNull();
  });
  it("el texto lo dice como supuesto y cómo corregirlo", () => {
    const a = armada("alcance-deformacion");
    const vento = a.vehiculos.find((x) => JSON.stringify(x).includes("Vento"))!.id;
    const g = finalDeLaNarracion(
      a,
      vento,
      "sobre el acotamiento, 21 metros adelante del inicio de los restos",
    )!;
    expect(g.texto).toMatch(
      /medio acotamiento de 2.5 m, supuesto; corrígelo en «Escribir las posiciones en metros»/,
    );
  });
});

describe("posiciones finales narradas que no se ofrecían (René, 2026-11-27, #388)", () => {
  const a = armada("alcance-deformacion");
  const ids = a.vehiculos.map((x) => x.id);
  const v = ids[0]!;
  const imp = poseDe(a, v, "impacto")!;
  const m = (p: { lat: number; lon: number }, q: { lat: number; lon: number }) =>
    Math.hypot(
      (p.lon - q.lon) * 111320 * Math.cos((p.lat * Math.PI) / 180),
      (p.lat - q.lat) * 111320,
    );
  it("«a 25 m del borde de la carretera»: fuera de la orilla, y dice qué supone", () => {
    const f = finalDeLaNarracion(a, v, "quedó volcado a 25 metros del borde de la carretera")!;
    expect(f).not.toBeNull();
    // Media calzada supuesta (un carril de 3.5 m) más 25 m.
    expect(m(f.punto, imp.punto)).toBeCloseTo(26.75, 0);
    expect(f.texto).toMatch(/25 m fuera de la orilla de la calzada/);
    expect(f.texto).toMatch(/el lado es supuesto/);
  });
  it("«3 m adelante sobre Nicolás Bravo»: desde su pose del choque, hacia donde avanzaba", () => {
    const f = finalDeLaNarracion(a, v, "se detuvo 3 metros adelante sobre Nicolás Bravo")!;
    expect(f).not.toBeNull();
    expect(m(f.punto, imp.punto)).toBeCloseTo(3, 0);
    expect(f.texto).toMatch(/sobre nicol[aá]s bravo/i);
  });
  it("«a 3 m uno del otro»: desde donde quedó el otro vehículo", () => {
    const otro = ids[1]!;
    const f = finalDeLaNarracion(a, v, "quedaron a 3 metros uno del otro", [
      { vehiculo: otro, descripcion: "se detuvo 10 metros adelante del punto de contacto" },
    ]);
    expect(f).not.toBeNull();
    expect(f!.texto).toMatch(/de donde quedó el vehículo B/);
  });
});
