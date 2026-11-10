/**
 * C1 (W3): choques intermedios contra el objeto que marcó el perito; espejo de
 * `solver/tests/test_choque_intermedio.py`. La paridad es contra la reconstrucción de referencia
 * de Python (`fixtures/c1/resultados/alcance_muro.json`, de `eval/w3_fixtures.py`).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { differences } from "./parity-diff";
import { reconstruct, reconstructionToDict } from "./reconstruct";

const here = dirname(fileURLToPath(import.meta.url));
const C1 = resolve(here, "../../scene-schema/fixtures/c1");
type Json = Record<string, unknown>;
const leer = (ruta: string) => JSON.parse(readFileSync(resolve(C1, ruta), "utf8")) as Json;

describe("choque intermedio contra un objeto marcado", () => {
  const spec = leer("alcance_muro.json");
  const golden = leer("resultados/alcance_muro.json");
  const rec = reconstruct(spec);

  it("coincide con la referencia de Python", () => {
    const mio = JSON.parse(JSON.stringify(reconstructionToDict(rec))) as Json;
    expect(differences(golden, mio)).toEqual([]);
  });

  it("ocurre después del primer impacto, contra ese objeto y ese vehículo", () => {
    const choque = rec.eventos.find((e) => e.id === "ev-muro")!;
    expect(choque.tipo).toBe("impacto_vehiculo_objeto");
    expect(choque.actores).toEqual(["veh-b", "muro-1"]);
    expect(choque.t).toBeGreaterThan(0);
    expect(Number((choque.detalle as Json).energia_disipada_j)).toBeGreaterThan(0);
    expect(rec.avisos.some((a) => a.codigo === "impacto_no_ocurre")).toBe(false);
  });

  it("el muro detiene al vehículo: avanza menos que sin él y deja su daño", () => {
    const libre = reconstruct(loadFixture("alcance"));
    const con = rec.vehiculos.find((v) => v.id === "veh-b")!;
    const sin = libre.vehiculos.find((v) => v.id === "veh-b")!;
    expect(con.distancePostM).toBeLessThan(sin.distancePostM - 1.0);
    expect((con.laterDamage ?? []).map((d) => d.eventId)).toEqual(["ev-muro"]);
  });

  it("si el vehículo no llega al objeto, se avisa y nada más cambia", () => {
    const lejos = structuredClone(spec);
    const muro = ((lejos.entorno as Json).objetos as Json[]).at(-1)!;
    const pos = muro.posicion as { x: number; y: number };
    muro.posicion = { x: pos.x, y: pos.y + 15 };
    const r = reconstruct(lejos);
    expect(r.eventos.some((e) => e.id === "ev-muro")).toBe(false);
    const aviso = r.avisos.find((a) => a.codigo === "impacto_no_ocurre")!;
    expect(aviso.datos).toEqual({ evento: "ev-muro", vehiculos: ["veh-b"], objeto: "muro-1" });
    const libre = reconstruct(loadFixture("alcance"));
    for (const v of r.vehiculos) {
      expect(v.restPose).toEqual(libre.vehiculos.find((w) => w.id === v.id)!.restPose);
    }
  });
});
