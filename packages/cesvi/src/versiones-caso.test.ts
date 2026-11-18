/**
 * Las versiones del caso (ronda 4, punto 8): el «¿y si…?» dibujable y lo que cambia contra los mismos
 * conductores sin la hipótesis. Los números son los de la referencia Python
 * (`fixtures/agentes/resultados/alcance_frena_antes.json`) sobre la escena canónica `alcance`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resultadoErrors } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { leerPruebaConductores, type HipotesisConductor } from "./conductores";
import type { FilaDeclarada } from "./comparacion-declarada";
import type { Reconstruccion } from "./reconstruccion";
import {
  cambiosDeHipotesis,
  resultadoDeHipotesis,
  resumenDeclarada,
  resumenHipotesis,
  tituloHipotesis,
  trayectoriasDe,
} from "./versiones-caso";

type Json = Record<string, unknown>;
const aqui = dirname(fileURLToPath(import.meta.url));
const leer = (ruta: string) =>
  JSON.parse(readFileSync(resolve(aqui, "../../scene-schema/fixtures", ruta), "utf8")) as Json;
const agentes = leer("agentes/resultados/alcance_frena_antes.json");
const resultado = leer("resultados/alcance.json");
const r = {
  ids: { "veh-a": "V1", "veh-b": "V2" },
  resultado,
  impactos: [{ vehiculos: ["V1", "V2"], t: 0 }],
} as unknown as Reconstruccion;
const h: HipotesisConductor = { vehiculo: "V1", decision: "frenar", segundosAntes: 1.15 };
const nombre = (id: string) => ({ V1: "A · Nissan Versa", V2: "B · VW Jetta" })[id] ?? id;

describe("el «¿y si…?» dibujable (ronda 4, punto 8)", () => {
  it("el resultado de la hipótesis es válido y lleva a cada vehículo hasta el primer contacto", () => {
    const res = resultadoDeHipotesis(r, agentes)!;
    expect(resultadoErrors(res)).toEqual([]);
    const sim = agentes.resultado as { t: number };
    expect(res.t_inicio).toBe(-3);
    expect(res.t_fin).toBeCloseTo(sim.t, 9);
    const vs = res.vehiculos as {
      id: string;
      trayectoria: { t: number[]; x: number[]; vel_angular: number[] };
      dano: { perfil_m: number[] };
      delta_v_kmh: number;
    }[];
    expect(vs.map((v) => v.id)).toEqual(["veh-a", "veh-b"]);
    for (const v of vs) {
      // Las posiciones son las del solver, sin tocar.
      const tr = trayectoriasDe(agentes.resultado).find((x) => x.vehiculo === v.id)!;
      expect(v.trayectoria.x).toEqual(tr.x);
      expect(v.trayectoria.vel_angular).toHaveLength(tr.t.length);
      // La simulación de los conductores no calcula el choque: sin deformación ni ΔV.
      expect(v.dano.perfil_m.every((c) => c === 0)).toBe(true);
      expect(v.delta_v_kmh).toBe(0);
    }
    expect(res.eventos).toEqual([]);
    expect(res.personas).toEqual([]);
    expect(res).not.toHaveProperty("incertidumbre");
    expect(res).not.toHaveProperty("agentes");
  });

  it("sin trayectorias (un bloque viejo) no hay nada que dibujar", () => {
    const viejo = JSON.parse(JSON.stringify(agentes)) as { resultado: Json };
    delete viejo.resultado.trayectorias;
    expect(resultadoDeHipotesis(r, viejo as unknown as Json)).toBeNull();
  });

  it("qué cambia, en el lenguaje del perito: contacto, velocidades, dónde y la trayectoria", () => {
    const p = leerPruebaConductores(r, agentes);
    const c = cambiosDeHipotesis(p, agentes, h, nombre, r);
    expect(c.map((x) => x.clave)).toEqual([
      "contacto",
      "velocidad",
      "velocidad",
      "punto",
      "trayectoria",
    ]);
    const vel = c.find((x) => x.concepto === "Velocidad al contacto · A · Nissan Versa")!;
    // A frena antes: llega más lento que sin la hipótesis (cifras del solver, sin redondeo propio).
    const kmh = (s: string) => Number(s.replace(/[^\d.]/g, ""));
    expect(kmh(vel.version)).toBeLessThan(kmh(vel.reconstruccion));
    expect(vel.cambia).toBe(true);
    expect(c.find((x) => x.clave === "punto")!.version).toMatch(/^A \d+\.\d{2} m de donde está/);
    expect(c.find((x) => x.clave === "trayectoria")!.concepto).toBe(
      "Trayectoria de A · Nissan Versa",
    );
    expect(c.find((x) => x.clave === "contacto")!.version).toMatch(/^Sí, en /);
  });

  it("títulos y resúmenes para la lista de versiones", () => {
    expect(tituloHipotesis(h, nombre)).toBe(
      "¿Y si el conductor de A · Nissan Versa frena 1.15 s antes del impacto?",
    );
    expect(resumenHipotesis(leerPruebaConductores(r, agentes))).toMatch(
      /^Hay contacto a \d+ km\/h de velocidad relativa$/,
    );
    const fila = (estado: FilaDeclarada["estado"]) => ({ estado }) as FilaDeclarada;
    expect(resumenDeclarada([fila("no_coincide"), fila("coincide"), fila("sin_dato")]).texto).toBe(
      "1 de 2 puntos comparables no coinciden con la evidencia",
    );
    expect(resumenDeclarada([fila("sin_dato")]).texto).toBe(
      "Ningún punto se puede comparar con la evidencia",
    );
  });
});
