import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escenaDeNarracion, type SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { casoAxa } from "./caso-axa";
import { marcarRelato, metaDelHecho, textoDano, tituloDelHecho } from "./hecho-laboratorio";

const aqui = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const ejemplo = escenaDeNarracion(g.salida, g.narracion);
const axa = casoAxa();

describe("El hecho (Laboratorio §8)", () => {
  it("el título sale del relato: su modalidad y dónde fue", () => {
    expect(tituloDelHecho(axa.escena!.expediente, axa.narracion)).toBe(
      "Alcance en la carretera México-Nogales, km 47+800",
    );
    expect(tituloDelHecho(ejemplo.expediente, g.narracion)).toBe(
      "Crucero en calle Azucena y Av. Reforma",
    );
    // Sin vía en el relato, el municipio.
    expect(tituloDelHecho(ejemplo.expediente, "Chocaron.")).toBe("Crucero en Iztapalapa");
  });

  it("la meta: el lugar, el tramo y cuántos vehículos e impactos", () => {
    expect(metaDelHecho(axa.escena!.expediente, axa.narracion)).toEqual([
      "Ahome, Sinaloa",
      "Tramo Los Mochis–Navojoa",
      "2 vehículos · 1 impacto",
    ]);
  });

  it("el relato marcado: cada cita leída, cada vehículo y cada medida, sin perder texto", () => {
    const vehiculos = ejemplo.expediente.vehiculos.map((v) => ({
      id: v.id,
      nombres: [v.modelo?.valor ?? ""],
    }));
    const r = marcarRelato(g.narracion, ejemplo.lectura ?? [], vehiculos);
    expect(r.tramos.map((t) => t.texto).join("")).toBe(g.narracion);
    // «Jetta» es una mención del V1, enlazada con su tarjeta.
    expect(r.tramos.some((t) => t.tipo === "vehiculo" && t.vehiculo === "V1")).toBe(true);
    // «0.80 metros» es una medida (gana sobre el daño en que va).
    expect(r.tramos.find((t) => t.texto.includes("0.80 metros"))?.tipo).toBe("medida");
    expect(r.porTipo.dano).toBeGreaterThan(0);
    expect(r.porTipo.lugar).toBeGreaterThan(0);
    expect(r.datos).toBeGreaterThan(10);
  });

  it("el daño principal en palabras", () => {
    expect(textoDano(axa.escena!.expediente, "V1")).toBe("Daño posterior, hacia la izquierda");
    expect(textoDano(axa.escena!.expediente, "V2")).toBe("Daño frontal");
    expect(textoDano(axa.escena!.expediente, "V9")).toBeNull();
  });
});
