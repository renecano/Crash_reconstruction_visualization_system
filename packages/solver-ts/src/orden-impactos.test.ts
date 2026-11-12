/**
 * T6.3 (W7): el orden de impactos declarado a mano en una carambola; espejo de
 * `solver/tests/test_orden_impactos.py`. La paridad es contra la reconstrucción de referencia de
 * Python (`fixtures/c1/resultados/carambola_cuatro.json`, de `eval/w7_fixtures.py`).
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

/** Los dos impactos posteriores declarados en el otro orden (como `eval/w7_fixtures.py`). */
function alReves(spec: Json): Json {
  const otra = structuredClone(spec);
  const eventos = otra.eventos as (Json & { id: string; orden: number })[];
  const bc = eventos.find((e) => e.id === "ev-impacto-2")!;
  const cd = eventos.find((e) => e.id === "ev-impacto-3")!;
  [bc.orden, cd.orden] = [cd.orden, bc.orden];
  eventos.sort((a, b) => a.orden - b.orden);
  return otra;
}

describe("el orden de impactos declarado en una carambola", () => {
  const spec = leer("carambola_cuatro.json");

  it("coincide con la referencia de Python", () => {
    const mio = JSON.parse(JSON.stringify(reconstructionToDict(reconstruct(spec)))) as Json;
    expect(differences(leer("resultados/carambola_cuatro.json"), mio)).toEqual([]);
  }, 120_000);

  it("en el orden declarado no hay aviso", () => {
    const r = reconstruct(spec);
    expect(r.eventos.filter((e) => e.id.startsWith("ev-impacto")).map((e) => e.id)).toEqual([
      "ev-impacto",
      "ev-impacto-2",
      "ev-impacto-3",
    ]);
    expect(r.avisos.some((a) => a.codigo === "orden_impactos_distinto")).toBe(false);
    expect(r.avisos.some((a) => a.codigo === "impacto_no_ocurre")).toBe(false);
  }, 120_000);

  it("con el orden al revés se avisa con los dos órdenes, y la física no cambia", () => {
    const a = reconstruct(spec);
    const b = reconstruct(alReves(spec));
    const aviso = b.avisos.find((x) => x.codigo === "orden_impactos_distinto")!;
    expect(aviso.datos).toEqual({
      declarado: ["ev-impacto-3", "ev-impacto-2"],
      reconstruido: ["ev-impacto-2", "ev-impacto-3"],
    });
    expect(aviso.mensaje).toBe(
      "Los impactos después del primero ocurren en la reconstrucción en otro orden que el " +
        "declarado. Declarado: C con D; B con C. Reconstruido: B con C; C con D.",
    );
    expect(b.banderas).toContain(aviso.mensaje);
    for (const v of b.vehiculos) {
      expect(v.restPose).toEqual(a.vehiculos.find((w) => w.id === v.id)!.restPose);
    }
  }, 120_000);

  it("con un solo impacto posterior no hay orden que revisar", () => {
    const r = reconstruct(loadFixture("carambola"));
    expect(r.avisos.some((a) => a.codigo === "orden_impactos_distinto")).toBe(false);
  }, 120_000);
});
