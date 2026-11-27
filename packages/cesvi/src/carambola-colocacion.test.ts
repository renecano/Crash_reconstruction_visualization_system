/**
 * La colocación de los vehículos que solo están en un impacto posterior (R4b), sin las posiciones del
 * perito (René, 2026-11-26). Para ver a dónde va el que golpea, Croquis corría una reconstrucción con
 * los que aún no estaban colocados en su disposición genérica, a 40 km/h: en cesvi-e9aed4ab5b el Jeep
 * genérico alcanzaba a la Tacoma a los 1.55 s, ese empujón entraba en el recorrido y el Jeep quedaba
 * detenido donde la Tacoma, sin ese choque fantasma, nunca llega (se mueve 0.2 m). Ahora esa
 * reconstrucción va sin los que aún no se colocan.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import { escenaDeConversion } from "./escena-narracion";
import { reconstruirExpediente } from "./reconstruccion";

const SIN = {
  filas: 0,
  valores_invalidos: 0,
  citas: 0,
  citas_fuera: 0,
  numeros: 0,
  numeros_fuera: 0,
};
const expediente = (id: string) =>
  readFileSync(join(__dirname, "../../../data/cesvi/corpus/expedientes.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { id: string; expediente: Expediente })
    .find((r) => r.id === id)!.expediente;

describe("los vehículos de un impacto posterior, sin posiciones del perito", () => {
  it(
    "cesvi-e9aed4ab5b: la Tacoma alcanza al Jeep (el impacto posterior ocurre)",
    { timeout: 60_000 },
    () => {
      const e = escenaDeConversion({
        expediente: expediente("cesvi-e9aed4ab5b"),
        posiciones: [],
        conteos: SIN,
      }).expediente;
      const r = reconstruirExpediente(e, "cesvi-e9aed4ab5b");
      const posteriores = (r.spec.eventos as { id: string; tipo: string }[])
        .filter((ev) => ev.tipo === "segundo_impacto")
        .map((ev) => ev.id);
      const eventos = (r.resultado as { eventos: { id: string }[] }).eventos;
      expect(posteriores).toHaveLength(1);
      expect(eventos.some((ev) => posteriores.includes(ev.id))).toBe(true);
    },
  );
});
