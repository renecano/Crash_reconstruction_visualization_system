import { describe, expect, it } from "vitest";
import { zonaNarrada } from "./lugar-texto";

describe("la colonia o la zona que nombra la narración (#388)", () => {
  it("lee la colonia, el fraccionamiento y el barrio", () => {
    expect(zonaNarrada("en Reforma esquina con Juárez, colonia Centro, Toluca")).toBe(
      "colonia Centro",
    );
    expect(zonaNarrada("sobre Hidalgo en la col. Morelos y circulaba al norte")).toBe(
      "colonia Morelos",
    );
    expect(zonaNarrada("en el fraccionamiento Las Américas del municipio de Ecatepec")).toBe(
      "fraccionamiento Las Américas",
    );
    expect(zonaNarrada("en el barrio de San Juan")).toBe("barrio San Juan");
  });
  it("«en el centro de Toluca» es la colonia Centro; un centro comercial no", () => {
    expect(
      zonaNarrada(
        "El hecho ocurrió en el cruce de la avenida Lerdo de Tejada con la calle Nicolás Bravo, en el centro de Toluca, Estado de México.",
      ),
    ).toBe("colonia Centro");
    expect(zonaNarrada("frente al centro comercial Galerías")).toBeNull();
    expect(zonaNarrada("en el centro de la calle")).toBeNull();
  });
  it("sin colonia ni zona, null", () => {
    expect(zonaNarrada("en el cruce de Lerdo de Tejada y Nicolás Bravo, en Toluca")).toBeNull();
  });
});
