import { describe, expect, it } from "vitest";
import { fraseDelTitulo, modalidadDelTitulo } from "./titulo-reporte";

/** El encabezado como lo escriben los reportes, con la frase de la modalidad que se pruebe. */
const reporte = (frase: string) =>
  `DICTAMEN TÉCNICO DEL HECHO DE TRÁNSITO EN SU MODALIDAD DE ${frase}, EN EL QUE SE VIO INVOLUCRADO EL VEHÍCULO ASEGURADO.\n\nObjetivos…`;
const m = (frase: string) => modalidadDelTitulo(reporte(frase)).modalidad;

describe("la modalidad del título del reporte (ADR 0071)", () => {
  it("lee la frase tras «modalidad de», sin lo que describe el hecho", () => {
    expect(fraseDelTitulo(reporte("COLISIÓN PERPENDICULAR"))).toBe("colision perpendicular");
    expect(fraseDelTitulo("INFORME DE DAÑOS DEL VEHÍCULO")).toBeNull();
  });

  it("frases de los títulos de desarrollo", () => {
    expect(m("ALCANCE CON PROYECCIÓN")).toBe("alcance");
    expect(m("COLISIÓN POSTERIOR (ALCANCE)")).toBe("alcance");
    expect(m("COLISIÓN PERPENDICULAR ANTERIOR")).toBe("lateral");
    expect(m("EMBESTIDA OBLICUA CENTRAL")).toBe("lateral");
    expect(m("IMPACTO LATERAL POR MANIOBRA EN REVERSA")).toBe("reversa");
    expect(m("CHOQUE CONTRA OBJETO FIJO")).toBe("objeto_fijo");
    expect(m("IMPACTO CONTRA CUERPO DURO FIJO (ÁRBOL)")).toBe("objeto_fijo");
    expect(m("VOLCADURA TIPO TONEL 1/2")).toBe("volcadura");
    expect(m("DESPISTE")).toBe("salida_de_camino");
    expect(m("SALIDA DEL CAMINO")).toBe("salida_de_camino");
    expect(m("INCENDIO")).toBe("otra");
    expect(m("CORTE DE CIRCULACIÓN")).toBe("otra");
    expect(m("IMPACTO EN PARTES BAJAS")).toBe("otra");
    expect(m("COLISIÓN FRONTAL ANGULAR")).toBe("frontal");
  });

  it("con dos mecanismos manda el primero que nombra el título", () => {
    expect(m("SALIDA DEL CAMINO Y VOLCADURA")).toBe("salida_de_camino");
    expect(m("VUELCO EN TONEL Y SALIDA DEL CAMINO")).toBe("volcadura");
    expect(m("COLISIÓN LATERAL CON VOLCADURA TIPO TONEL ½")).toBe("lateral");
    expect(m("COLISIÓN FRONTAL CONTRA OBJETO FIJO CON PROYECCIÓN")).toBe("objeto_fijo");
  });

  it("un título genérico no da modalidad: ese reporte no se compara", () => {
    expect(m("COLISIÓN")).toBeNull();
    expect(m("CHOQUE")).toBeNull();
    expect(m("IMPACTO")).toBeNull();
    expect(m("CHOQUE CONTRA VEHÍCULO VOLCADO")).toBeNull();
  });
});
