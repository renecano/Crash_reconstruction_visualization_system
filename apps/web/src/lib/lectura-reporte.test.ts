import { describe, expect, it } from "vitest";
import ejemplo from "../../../../data/cesvi/grabaciones/importar/ejemplo.json";
import narrado from "../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json";
import { motivoDeFalla, pareceReporteCompleto } from "./lectura-reporte";

describe("un reporte completo pegado como narración (A3)", () => {
  it("el reporte de ejemplo parece reporte; una narración corta, no", () => {
    expect(pareceReporteCompleto((ejemplo as { texto: string }).texto)).toBe(true);
    expect(
      pareceReporteCompleto(
        "El vehículo A circulaba por la calle Azucena cuando impactó al vehículo B en su costado.",
      ),
    ).toBe(false);
    // La narración técnica de ejemplo es una narración, no un reporte.
    expect(pareceReporteCompleto((narrado as { narracion: string }).narracion)).toBe(false);
  });

  it("cada falla dice su motivo real", () => {
    expect(
      motivoDeFalla(200, {
        metodo: "no_disponible",
        motivo: "Claude no está configurado en este servidor",
      }),
    ).toBe("No se pudo leer con Claude: Claude no está configurado en este servidor.");
    expect(motivoDeFalla(422, null)).toBe("El texto debe tener entre 200 y 200,000 caracteres.");
    expect(motivoDeFalla(429, null)).toContain("Demasiadas lecturas");
    expect(motivoDeFalla(504, null)).toContain("tardó más de lo permitido");
    expect(motivoDeFalla(500, null)).toContain("El servidor falló");
    expect(motivoDeFalla(200, null)).toBe("Claude no devolvió la lectura del reporte.");
  });
});
