import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enMetros, medidasDe, type Expediente } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { direccionDeSalida, finalDeLaNarracion, poseDe } from "./escena-facil";

/**
 * Dónde quedó, como lo dice la narración (René, 2026-11-24): en La escena, todos quedaban «junto al
 * choque» o había que marcarlos a mano, y la reconstrucción daba 7 km/h al camión que quedó 6 m
 * después del paso peatonal.
 */
const aqui = dirname(fileURLToPath(import.meta.url));
const caso = (n: string) =>
  JSON.parse(readFileSync(resolve(aqui, `../../../../data/cesvi/casos/${n}.croquis`), "utf8")) as {
    expediente: Expediente;
    escena: { posiciones: { vehiculo: string; fase: string; descripcion: string }[] };
  };
const lejos = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  enMetros([a.lon, a.lat], [b.lon, b.lat]);

describe("«6 m después del paso peatonal»", () => {
  const { expediente: e, escena } = caso("rene-peaton-vuelta");
  const d = escena.posiciones.find((p) => p.vehiculo === "V1")!.descripcion;

  it("queda 6 m adelante de su pose del choque, hacia donde avanzaba", () => {
    const f = finalDeLaNarracion(e, "V1", d)!;
    const imp = poseDe(e, "V1", "impacto")!;
    const m = lejos(f.punto, imp.punto);
    expect(Math.hypot(m.este, m.norte)).toBeCloseTo(6, 1);
    expect(f.texto).toMatch(/^6 m adelante/);
  });
});

describe("las posiciones finales de la carambola", () => {
  const { expediente: guardado, escena } = caso("rene-carambola-semaforo");
  // Como en La escena antes de contestar: sin posiciones finales marcadas.
  const e: Expediente = {
    ...guardado,
    versiones: guardado.versiones!.map((v) => ({
      ...v,
      posiciones: (v.posiciones ?? []).filter((p) => p.fase !== "final"),
    })),
  };
  const finales = escena.posiciones.filter((p) => p.fase === "final");
  const de = (v: string) =>
    finalDeLaNarracion(e, v, finales.find((p) => p.vehiculo === v)!.descripcion, finales)!;

  it("C, 3 m de donde estaba detenido; B, 2 m del punto del primer impacto", () => {
    for (const [v, n] of [
      ["V3", 3],
      ["V2", 2],
    ] as const) {
      const m = lejos(de(v).punto, poseDe(e, v, "impacto")!.punto);
      expect(Math.hypot(m.este, m.norte)).toBeCloseTo(n, 1);
    }
  });

  it("A, a 1 m detrás de donde quedó B: defensa con defensa más 1 m, en el rumbo de B", () => {
    const a = de("V1");
    const b = de("V2");
    const m = lejos(b.punto, a.punto);
    const largo = (id: string) => medidasDe(e.vehiculos.find((v) => v.id === id)!).largo;
    expect(Math.hypot(m.este, m.norte)).toBeCloseTo((largo("V1") + largo("V2")) / 2 + 1, 1);
    expect(a.rumbo).toBeCloseTo(b.rumbo, 5);
  });

  it("«junto al árbol, con el frente al suroeste»: en el objeto del choque, con su rumbo", () => {
    const f = finalDeLaNarracion(
      e,
      "V1",
      "detenido junto al árbol, con el frente hacia el suroeste",
    )!;
    expect(f.punto).toEqual(poseDe(e, "V1", "impacto")!.punto);
    expect(f.rumbo).toBe(225);
  });

  it("«a 1 m del vehículo B», sin decir de qué lado: del lado donde estaba en el choque", () => {
    const f = finalDeLaNarracion(e, "V1", "detenido a 1 m del vehículo B", finales)!;
    expect(f.texto).toMatch(/^1 m de donde quedó el vehículo B/);
  });

  it("lo que se mide desde la orilla del camino no se inventa: lo marca el perito", () => {
    expect(
      finalDeLaNarracion(e, "V1", "a 3 m de la orilla del camino, sobre el terreno"),
    ).toBeNull();
  });
});

describe("hacia dónde salió después del choque (René, 2026-11-25, aud-02)", () => {
  const { expediente: e } = caso("rene-peaton-vuelta");
  const imp = poseDe(e, "V1", "impacto")!;
  /** El rumbo (desde el norte) y la distancia del final respecto de su pose del choque. */
  const desdeElChoque = (f: { punto: { lat: number; lon: number } }) => {
    const m = lejos(f.punto, imp.punto);
    const rumbo = ((Math.atan2(m.este, m.norte) * 180) / Math.PI + 360) % 360;
    return { m: Math.hypot(m.este, m.norte), rumbo };
  };

  it("«desplazado hacia el noroeste… a 7 m del punto de contacto, con el frente hacia el noroeste»", () => {
    const f = finalDeLaNarracion(
      e,
      "V1",
      "fue desplazado hacia el noroeste del cruce y quedó detenido a 7 m del punto de contacto, con el frente hacia el noroeste",
    )!;
    const d = desdeElChoque(f);
    expect(d.m).toBeCloseTo(7, 1);
    expect(d.rumbo).toBeCloseTo(315, 0);
    expect(f.rumbo).toBe(315);
    expect(f.texto).toMatch(/^7 m hacia el noroeste de su posición en el choque/);
  });

  it.each([
    ["quedó a 5 m al norte del cruce", 0, 5],
    ["salió hacia el oriente y quedó a 4 metros del punto de impacto", 90, 4],
    ["proyectado hacia el surponiente, a 6 m del punto de contacto", 225, 6],
  ])("«%s»: hacia ese punto cardinal", (texto, rumbo, m) => {
    const d = desdeElChoque(finalDeLaNarracion(e, "V1", texto)!);
    expect(d.m).toBeCloseTo(m, 1);
    expect(d.rumbo).toBeCloseTo(rumbo, 0);
  });

  it("el camellón queda a su izquierda y la banqueta a su derecha: adelante y hacia ese lado", () => {
    expect(direccionDeSalida("quedó a 3 m, hacia el camellón", 0)).toEqual({
      rumbo: 315,
      texto: "adelante y hacia el camellón (a su izquierda)",
    });
    expect(direccionDeSalida("salió hacia la banqueta", 90)?.rumbo).toBe(135);
    expect(direccionDeSalida("se desvió hacia la derecha", 90)?.rumbo).toBe(135);
    expect(direccionDeSalida("se desplazó hacia su izquierda", 90)?.rumbo).toBe(45);
    expect(direccionDeSalida("fue empujado hacia atrás", 90)?.rumbo).toBe(270);
    const f = finalDeLaNarracion(e, "V1", "quedó a 3 m, hacia el camellón")!;
    expect(desdeElChoque(f).m).toBeCloseTo(3, 1);
  });

  it("«junto a la guarnición» o «contra la banqueta» dicen dónde quedó, no hacia dónde salió", () => {
    expect(direccionDeSalida("quedó tendido a 12 m, junto a la guarnición", 0)).toBeNull();
    expect(
      direccionDeSalida("quedó contra la banqueta, a 5 m del punto de contacto", 0),
    ).toBeNull();
    const f = finalDeLaNarracion(
      e,
      "V1",
      "quedó a 12 m del punto de contacto, junto a la guarnición",
    )!;
    expect(f.texto).toMatch(/hacia donde avanzaba/);
  });

  it("«con el frente hacia…» y «de sur a norte» no dicen hacia dónde salió", () => {
    expect(direccionDeSalida("quedó con el frente hacia el noroeste", 0)).toBeNull();
    // Poste y terracería: «en contacto con el poste, orientado hacia el Oriente».
    expect(direccionDeSalida("en contacto con el poste, orientado hacia el Oriente", 0)).toBeNull();
    expect(direccionDeSalida("circulaba de sur a norte y quedó a 3 m", 0)).toBeNull();
    // Sin dirección, los metros siguen yendo hacia donde avanzaba.
    const f = finalDeLaNarracion(e, "V1", "a 3 m del punto de contacto, sobre su mismo carril")!;
    expect(f.texto).toMatch(/hacia donde avanzaba/);
  });
});
