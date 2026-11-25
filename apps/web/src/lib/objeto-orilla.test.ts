import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { avanzar, enMetros, especDeExpediente, type Expediente } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { marcarChoque, poseDe, type Calle } from "./escena-facil";
import { contraLaOrilla, ladoDeLaOrilla } from "./objeto-orilla";
import { impactosAColocar } from "./pasos-caso";

/**
 * El árbol en la orilla (René, 2026-11-24, punto 1): el objeto del choque quedaba en medio de la
 * calle. Una calle norte–sur de 7 m de ancho; el Jetta del caso del árbol de René baja hacia el sur.
 */
const aqui = dirname(fileURLToPath(import.meta.url));
const e0 = (
  JSON.parse(
    readFileSync(resolve(aqui, "../../../../data/cesvi/casos/rene-arbol-curva.croquis"), "utf8"),
  ) as { expediente: Expediente }
).expediente;
const P = { lat: 19.29, lon: -99.65 };
const calle: Calle = {
  id: 1,
  nombre: "Calle Hidalgo",
  puntos: [
    [P.lon, P.lat + 0.001],
    [P.lon, P.lat - 0.001],
  ],
  ancho: 7,
  nodos: [1, 2],
};

/** Dónde pone la reconstrucción el objeto: frente a la cara de contacto, como `especDeExpediente`. */
function objetoDe(e: Expediente) {
  const { spec } = especDeExpediente(e, "orilla");
  const obj = (
    (spec.entorno as { objetos?: { id: string; posicion?: { x: number; y: number } }[] })
      ?.objetos ?? []
  ).find((o) => o.id === "obj-1");
  return obj?.posicion ?? null;
}

describe("el objeto fijo del choque va en la orilla, no en el carril", () => {
  const conChoque = marcarChoque(e0, impactosAColocar(e0), 1, P, 180);

  it("sin lado narrado: en la orilla derecha, y el vehículo sale de su carril hacia ella", () => {
    const r = contraLaOrilla(conChoque, [calle], null)!;
    expect(r.lado).toBe("derecha");
    const pose = poseDe(r.expediente, "V1", "impacto")!;
    // Hacia el sur, la derecha es el oeste: el vehículo se inclina 20° hacia el oeste.
    expect(pose.rumbo).toBeCloseTo(200, 0);
    // El objeto, a 3.5 m del eje (el borde) más 0.6 m: en la banqueta.
    const o = objetoDe(r.expediente)!;
    const origen = [pose.punto.lon, pose.punto.lat] as [number, number];
    const ejeX = enMetros([P.lon, P.lat], origen).este;
    expect(ejeX - o.x).toBeGreaterThan(3.5);
    // Antes del arreglo quedaba sobre el eje.
    const antes = objetoDe(conChoque)!;
    const origenAntes = [
      poseDe(conChoque, "V1", "impacto")!.punto.lon,
      poseDe(conChoque, "V1", "impacto")!.punto.lat,
    ] as [number, number];
    expect(Math.abs(enMetros([P.lon, P.lat], origenAntes).este - antes.x)).toBeLessThan(1);
  });

  it("del lado que dice la narración", () => {
    const narracion = "El Jetta perdió el control y se fue hacia la izquierda, contra un árbol.";
    expect(ladoDeLaOrilla(narracion)?.lado).toBe("izquierda");
    const r = contraLaOrilla(conChoque, [calle], narracion)!;
    expect(r.lado).toBe("izquierda");
    expect(r.cita).toContain("hacia la izquierda");
    expect(poseDe(r.expediente, "V1", "impacto")!.rumbo).toBeCloseTo(160, 0);
  });

  it("si la narración dice que estaba sobre el carril, no se mueve", () => {
    expect(
      contraLaOrilla(
        conChoque,
        [calle],
        "Un árbol caído en medio de la calle; el Jetta lo golpeó.",
      ),
    ).toBeNull();
  });

  it("en un cruce, el objeto no queda en el arroyo de la otra calle: el choque se recorre hacia atrás", () => {
    // Una calle este–oeste de 10 m que cruza justo en el choque.
    const otra: Calle = {
      id: 2,
      nombre: "Calle Morelos",
      puntos: [
        [P.lon - 0.001, P.lat],
        [P.lon + 0.001, P.lat],
      ],
      ancho: 10,
      anchoOsm: 10,
      nodos: [3, 4],
    };
    const r = contraLaOrilla(conChoque, [calle, otra], null)!;
    const o = objetoDe(r.expediente)!;
    const pose = poseDe(r.expediente, "V1", "impacto")!;
    const origen = [pose.punto.lon, pose.punto.lat] as [number, number];
    // El eje de Morelos, en metros de la escena: el objeto queda a más de 5 m (fuera de su arroyo).
    const ejeMorelos = enMetros([P.lon, P.lat], origen).norte;
    expect(Math.abs(o.y - ejeMorelos)).toBeGreaterThan(5);
  });

  it("en una lateral junto a la avenida, sin lado narrado, el objeto va en la orilla libre (aud-05)", () => {
    // Una avenida de 10 m paralela, con su eje 9 m al oeste: la orilla derecha de la lateral es su arroyo.
    const oeste = (m: number) => avanzar([P.lon, P.lat], 270, m)[0];
    const avenida: Calle = {
      id: 3,
      nombre: "Av. Solidaridad Las Torres",
      puntos: [
        [oeste(9), P.lat + 0.001],
        [oeste(9), P.lat - 0.001],
      ],
      ancho: 10,
      anchoOsm: 10,
      nodos: [5, 6],
    };
    const r = contraLaOrilla(conChoque, [calle, avenida], null)!;
    expect(r.lado).toBe("izquierda");
    const pose = poseDe(r.expediente, "V1", "impacto")!;
    const o = objetoDe(r.expediente)!;
    const ejeX = enMetros([P.lon, P.lat], [pose.punto.lon, pose.punto.lat]).este;
    expect(o.x - ejeX).toBeGreaterThan(3.5);
    // Si la narración dice la derecha, se respeta: el objeto sigue hasta la banqueta, más allá de la
    // avenida (cesvi-ebb5c029a8: «al lado derecho de la avenida», con laterales).
    const der = contraLaOrilla(
      conChoque,
      [calle, avenida],
      "Se fue hacia la derecha, contra un árbol.",
    )!;
    expect(der.lado).toBe("derecha");
    const pd = poseDe(der.expediente, "V1", "impacto")!;
    expect(enMetros([pd.punto.lon, pd.punto.lat], [P.lon, P.lat]).este).toBeLessThan(-12);
  });

  it("un bache o un registro sí están en el arroyo: no se mueven", () => {
    const conBache = {
      ...conChoque,
      impactos: conChoque.impactos!.map((i) => ({ ...i, objeto_fijo: "bache" })),
    };
    expect(contraLaOrilla(conBache, [calle], null)).toBeNull();
  });

  it("la orilla queda donde se dibuja la calle: a la mitad del ancho del eje", () => {
    const borde = avanzar([P.lon, P.lat], 270, 3.5);
    expect(enMetros(borde, [P.lon, P.lat]).este).toBeCloseTo(-3.5, 1);
  });
});
