import type { FilaDeclarada } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  claveHipotesis,
  conVersion,
  MAX_HIPOTESIS,
  versionesParaDictamen,
  versionesParaPresentar,
  type VersionCaso,
} from "./versiones-caso";

const fila = (estado: FilaDeclarada["estado"]) =>
  ({ estado, clave: "velocidad", vehiculo: "V2" }) as FilaDeclarada;
const declaracion = (declarante: "V1" | "V2", pedida = false): VersionCaso =>
  ({
    clave: `declaracion-${declarante}`,
    tipo: "declaracion",
    titulo: `Lo que declaró el conductor de ${declarante}`,
    resumen: "1 de 1",
    etiqueta: "x",
    declarante,
    filas: [fila("no_coincide")],
    sugerencia: { pedida, decision: pedida ? "confirmada" : null },
  }) as unknown as VersionCaso;
const hipotesis = (n: number): VersionCaso =>
  ({
    clave: `hipotesis-${n}`,
    tipo: "hipotesis",
    titulo: `¿Y si ${n}?`,
    resumen: "No hay contacto",
    cambios: [],
  }) as unknown as VersionCaso;

describe("las versiones del caso en la web (ronda 4, punto 8)", () => {
  it("una declaración por conductor: la nueva reemplaza a la anterior", () => {
    const vs = conVersion(conVersion([], declaracion("V2")), declaracion("V2", true));
    expect(vs).toHaveLength(1);
    expect(vs[0]!.tipo === "declaracion" && vs[0]!.sugerencia.pedida).toBe(true);
    expect(conVersion(vs, declaracion("V1")).map((v) => v.clave)).toEqual([
      "declaracion-V2",
      "declaracion-V1",
    ]);
  });

  it("las hipótesis se numeran sin repetir y la más vieja sale al pasar del tope", () => {
    let vs: VersionCaso[] = [declaracion("V2")];
    expect(claveHipotesis(vs)).toBe("hipotesis-1");
    for (let n = 1; n <= MAX_HIPOTESIS + 1; n++) vs = conVersion(vs, hipotesis(n));
    expect(vs.filter((v) => v.tipo === "hipotesis")).toHaveLength(MAX_HIPOTESIS);
    expect(vs.map((v) => v.clave)).not.toContain("hipotesis-1");
    expect(vs.map((v) => v.clave)).toContain("declaracion-V2");
    expect(claveHipotesis(vs)).toBe(`hipotesis-${MAX_HIPOTESIS + 2}`);
  });

  it("al dictamen y a Presentar llegan marcadas, con la sugerencia solo si se pidió", () => {
    const vs = [declaracion("V2", true), declaracion("V1"), hipotesis(1)];
    const d = versionesParaDictamen(
      vs,
      (id) => `${id} · auto`,
      () => ({ texto: "Sugerencia." }),
    );
    expect(d.declaradas.map((x) => [x.nombre, x.sugerencia])).toEqual([
      ["V2 · auto", { texto: "Sugerencia.", decision: "confirmada" }],
      ["V1 · auto", null],
    ]);
    expect(d.hipotesis).toEqual([{ titulo: "¿Y si 1?", resumen: "No hay contacto", cambios: [] }]);
    expect(versionesParaPresentar(vs).map((v) => v.tipo)).toEqual([
      "declaracion",
      "declaracion",
      "hipotesis",
    ]);
  });
});
