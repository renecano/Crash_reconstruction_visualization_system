import { describe, expect, it } from "vitest";
import { compararCifras, completa, deRama, equipoDeRama, juntar } from "./revisar.mjs";

describe("la revisión de una tanda con varios equipos", () => {
  it("el equipo sale del nombre de la rama; la de antes no tiene", () => {
    expect(
      equipoDeRama(
        "refs/remotes/origin/resultados/t7-fotos-2026-11-23-rtx-rene",
        "t7-fotos",
        "2026-11-23",
      ),
    ).toBe("rtx-rene");
    expect(equipoDeRama("resultados/t6-2026-11-22", "t6", "2026-11-22")).toBeNull();
    // Otra tanda que empieza igual no es de esta.
    expect(equipoDeRama("resultados/t6b-2026-11-22-x", "t6", "2026-11-22")).toBeUndefined();
  });

  it("dice de quién es cada archivo, no junta los repetidos y separa el arranque por equipo", () => {
    const r = juntar([
      {
        equipo: "rtx",
        gpu: "RTX 4070",
        archivos: [
          "eval/results/t7/arranque_1.json",
          "recorrido/publico/01.png",
          "resultados/t7/2026-11-23-rtx/corrida.json",
        ],
      },
      {
        equipo: "laptop",
        gpu: "Intel UHD",
        archivos: [
          "eval/results/t7/arranque_1.json",
          "resultados/t7/2026-11-23-laptop/corrida.json",
        ],
      },
    ]);
    expect(r.deQuien["recorrido/publico/01.png"]).toEqual(["rtx"]);
    expect(r.compartidos).toEqual([
      { archivo: "eval/results/t7/arranque_1.json", equipos: ["rtx", "laptop"] },
    ]);
    expect(r.arranque.map((a) => [a.equipo, a.gpu])).toEqual([
      ["rtx", "RTX 4070"],
      ["laptop", "Intel UHD"],
    ]);
    expect(r.aviso_arranque).toMatch(/tarjetas distintas, sus cifras no se juntan/);
  });

  it("respaldo (René, 2026-11-23): la corrida completa es la de «todo» con cada paso; las cifras se comparan sin juntarse", () => {
    expect(deRama("refs/remotes/origin/resultados/t6-2026-11-22-rtx-rene", "t6")).toEqual({
      fecha: "2026-11-22",
      equipo: "rtx-rene",
    });
    expect(deRama("resultados/t6b-2026-11-22-x", "t6")).toBeNull();
    const pasos = ["humo", "fotos"];
    const corrida = (parte, hechos) => ({
      parte,
      pasos: hechos.map((paso) => ({ grupo: "tanda", paso, estado: "ok" })),
    });
    expect(completa(corrida("todo", ["humo", "fotos"]), pasos)).toBe(true);
    expect(completa(corrida("todo", ["humo"]), pasos)).toBe(false);
    expect(completa(corrida("1", ["humo", "fotos"]), pasos)).toBe(false);
    expect(
      compararCifras(
        { equipo: "rtx", datos: { k: 21, n: 31, fecha: "a" } },
        { equipo: "laptop", datos: { k: 20, n: 31, fecha: "b" } },
      ),
    ).toEqual([{ campo: "k", rtx: 21, laptop: 20 }]);
  });
});
