import { describe, expect, it } from "vitest";
import {
  callesDelCaso,
  esLaCalleNarrada,
  esLaCalleNarradaAprox,
  lugarClaro,
  palabrasDeMas,
  palabrasDeCalle,
} from "./lugar-claro";

/** Los reportes de CESVI que caían en otro lugar (revisión de la cadena, René 2026-11-25). */
describe("¿el lugar encontrado es el de la narración?", () => {
  it("las calles con número se comparan por su número («Avenida 9ª Poniente» es «Avenida 9»)", () => {
    expect(palabrasDeCalle("Avenida 9ª Poniente")).toEqual(["9", "poniente"]);
    expect(palabrasDeCalle("calle 2-A")).toEqual(["2a"]);
    expect(esLaCalleNarrada("Avenida 9", "Avenida 9ª Poniente")).toBe(true);
    expect(esLaCalleNarrada("calle 6", "Calle 6ª Sur Poniente")).toBe(true);
    expect(esLaCalleNarrada("calle 2-A", "Calle 2")).toBe(false);
    expect(esLaCalleNarrada("Avenida Morones Prieto", "Avenida Paseo de los Leones")).toBe(false);
  });

  it("un cruce que sí está alrededor es claro", () => {
    const narradas = callesDelCaso(
      "El vehículo A circulaba por la Avenida 9 y al llegar a la calle 6 impactó…",
      "Avenida 9ª Poniente y calle 6ª Sur Poniente",
    );
    expect(
      lugarClaro({
        narradas,
        calles: [{ nombre: "Avenida 9ª Poniente Norte" }, { nombre: "Calle 6ª Sur Poniente" }],
        aviso:
          "El cruce de Avenida 9ª Poniente y calle 6ª Sur Poniente en Tuxtla Gutiérrez, Chiapas.",
      }),
    ).toEqual({ clara: true, motivo: null });
  });

  it("si ninguna calle narrada está alrededor, no es claro: se pregunta", () => {
    const r = lugarClaro({
      narradas: ["avenida Morones Prieto", "calle Zaragoza"],
      calles: [{ nombre: "Avenida Paseo de los Leones" }, { nombre: null }],
      aviso: "No se encontró el lugar completo; se buscó «avenida de» en Monterrey, Nuevo León.",
    });
    expect(r.clara).toBe(false);
    expect(r.motivo).toBe("ahí no está avenida Morones Prieto ni calle Zaragoza");
  });

  it("si el buscador no lo encontró en el municipio del caso, no es claro aunque la calle esté", () => {
    const r = lugarClaro({
      narradas: ["Eje 3 Oriente"],
      calles: [{ nombre: "Eje 3 Oriente" }],
      aviso:
        "No apareció en ciudad de México; estas opciones son de municipios vecinos. Revisa cuál es.",
    });
    expect(r).toEqual({
      clara: false,
      motivo: "el buscador no lo encontró en el municipio del caso",
    });
  });

  it("sin calles narradas: solo encontrar parte del lugar no es claro", () => {
    expect(
      lugarClaro({
        narradas: [],
        calles: [],
        aviso: "No se encontró el lugar completo; se buscó «eje 10» en Coyoacán.",
      }).clara,
    ).toBe(false);
    expect(lugarClaro({ narradas: [], calles: [], aviso: null }).clara).toBe(true);
  });

  it("el nombre corto es el largo, el lugar encontrado cuenta y una carretera solo confirma", () => {
    expect(esLaCalleNarrada("Av. Central Hank González", "Avenida Central")).toBe(true);
    expect(
      lugarClaro({
        narradas: ["Eje 3 Oriente"],
        calles: [{ nombre: "Atanasio Sarabia" }],
        aviso: null,
        encontrado: "Eje 3 Oriente y Atanasio Sarabia, Colonia Ampliación Sinatel",
      }).clara,
    ).toBe(true);
    // La carretera confirma si coincide, y no hace dudar si no coincide.
    expect(
      lugarClaro({
        narradas: ["carretera México-Querétaro"],
        calles: [{ nombre: "Carretera México - Querétaro" }],
        aviso: null,
      }).clara,
    ).toBe(true);
    expect(
      lugarClaro({
        narradas: ["carretera 57"],
        calles: [{ nombre: "Carretera Querétaro - San Luis Potosí" }],
        aviso: null,
      }).clara,
    ).toBe(true);
    // «calzada de 7.3 metros» es una medida, no una calle.
    expect(
      callesDelCaso("Una calzada de 7.3 metros de ancho, por la Calle Hidalgo.", null),
    ).toEqual(["Calle Hidalgo"]);
  });
});

describe("la calle de llegada con la ortografía del mapa", () => {
  it("una palabra larga puede diferir en una letra («Matlatzincas» y «Matlazincas»)", () => {
    expect(esLaCalleNarradaAprox("Paseo de los Matlatzincas", "Calle Paseo Matlazincas")).toBe(
      true,
    );
    expect(esLaCalleNarrada("Paseo de los Matlatzincas", "Calle Paseo Matlazincas")).toBe(false);
  });
  it("las palabras cortas no se aproximan, y una calle distinta no coincide", () => {
    expect(esLaCalleNarradaAprox("Calle Olivos", "Calle Olmos")).toBe(false);
    expect(esLaCalleNarradaAprox("Avenida Tecnológico", "Avenida Solidaridad Las Torres")).toBe(
      false,
    );
  });
});

describe("entre varias calles que coinciden, la de nombre más parecido", () => {
  it("«Paseo de la Reforma» no es «Paseo Bosque de la Reforma»", () => {
    expect(palabrasDeMas("Paseo de la Reforma", "Avenida Paseo de la Reforma")).toBe(0);
    expect(palabrasDeMas("Paseo de la Reforma", "Avenida Paseo Bosque de la Reforma")).toBe(1);
  });
  it("una privada no es la avenida narrada", () => {
    expect(palabrasDeMas("Avenida Pino Suárez", "Privada Pino Suárez")).toBeGreaterThan(
      palabrasDeMas("Avenida Pino Suárez", "Calle José María Pino Suárez"),
    );
    expect(palabrasDeMas("Privada Pino Suárez", "Privada Pino Suárez")).toBe(0);
  });
});
