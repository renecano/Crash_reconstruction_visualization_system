/**
 * O5 (plan v4): cada vehículo identificado lleva su letra en su mención. Con lecturas reales grabadas
 * en `data/cesvi/grabaciones/relatos-w2/`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escenaDeNarracion, type SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { marcarRelato } from "./hecho-laboratorio";
import { faltaEnPaso } from "./pasos-caso";
import { POST } from "@/app/api/cesvi/escena/route";

const DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../data/cesvi/grabaciones/relatos-w2",
);
const grabada = (n: string) =>
  JSON.parse(readFileSync(resolve(DIR, `${n}.json`), "utf8")) as {
    narracion: string;
    salida: SalidaCorpus;
  };

/** Qué palabras del relato quedan marcadas como de cada vehículo. */
function marcasDe(n: string): [string, string][] {
  const g = grabada(n);
  const e = escenaDeNarracion(g.salida, g.narracion);
  const r = marcarRelato(
    g.narracion,
    e.lectura ?? [],
    e.expediente.vehiculos.map((v) => ({ id: v.id, nombres: [v.modelo?.valor ?? ""] })),
    e.menciones ?? [],
  );
  expect(r.tramos.map((t) => t.texto).join("")).toBe(g.narracion);
  return r.tramos
    .filter((t) => t.tipo === "vehiculo" && t.vehiculo)
    .map((t) => [t.vehiculo!, t.texto]);
}

describe("la letra de cada vehículo va en su mención (O5)", () => {
  it("«una combi colisiona con un pickup lobo»: la combi es A y el pickup lobo es B", () => {
    expect(marcasDe("zocalo")).toEqual([
      ["V1", "combi"],
      ["V2", "pickup"],
      ["V2", "lobo"],
    ]);
  });

  it("vocho y pesero, torton y motoneta, pipa y taxi: cada uno con la suya", () => {
    expect(marcasDe("vocho-pesero")).toEqual([
      ["V1", "vocho"],
      ["V2", "pesero"],
    ]);
    expect(marcasDe("torton-motoneta")).toEqual([
      ["V1", "torton"],
      ["V2", "motoneta"],
    ]);
    expect(marcasDe("pipa-taxi")).toEqual([
      ["V1", "pipa"],
      ["V2", "taxi"],
    ]);
  });

  it("una palabra que se repite se marca todas las veces: «urvan» dos veces", () => {
    expect(marcasDe("trailer-urvan")).toEqual([
      ["V1", "tráiler"],
      ["V2", "urvan"],
      ["V3", "rabón"],
      ["V2", "urvan"],
    ]);
  });
});

describe("lo mínimo para salir de «El hecho» (O1)", () => {
  it("sin ningún vehículo leído no se puede continuar, y dice por qué", () => {
    const vacia = escenaDeNarracion({ datos: [] }, "La calle estaba mojada y era de noche.");
    expect(
      faltaEnPaso("hecho", {
        esperaReporte: false,
        expediente: vacia.expediente,
        reconstruido: false,
      }),
    ).toEqual(["un relato que diga qué vehículos participaron"]);
    const g = grabada("zocalo");
    const e = escenaDeNarracion(g.salida, g.narracion);
    expect(
      faltaEnPaso("hecho", { esperaReporte: false, expediente: e.expediente, reconstruido: false }),
    ).toEqual([]);
  });
});

describe("POST /api/cesvi/escena", () => {
  it("«gggg…» responde relato_insuficiente con un mensaje y sin llamar a Claude", async () => {
    const res = await POST(
      new Request("http://localhost/api/cesvi/escena", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto: "g".repeat(60) }),
      }),
    );
    expect(res.status).toBe(200);
    const d = (await res.json()) as { metodo: string; mensaje: string; motivo: string };
    expect(d.metodo).toBe("relato_insuficiente");
    expect(d.mensaje).toContain("Por ejemplo");
  });
});
