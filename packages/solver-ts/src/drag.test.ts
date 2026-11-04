import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyValues,
  DRAG_BOUNDS,
  DRAG_PRIOR,
  dragVehicles,
  evidenceFromSpec,
  impactPivot,
  Param,
  parameters,
  priors,
  rearEndPairs,
  SIGMA_DRAG,
  SIGMA_HEADING_PRIOR_DEG,
} from "./inversion";
import { reconstruct } from "./reconstruct";

type Json = Record<string, unknown>;
const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, "../../scene-schema/fixtures");
const leer = (ruta: string) => JSON.parse(readFileSync(resolve(FIX, ruta), "utf8")) as Json;
const vehiculo = (s: Json, id: string) => (s.vehiculos as Json[]).find((v) => v.id === id)!;

describe("arrastre tras el impacto como incógnita (T3.2, ADR 0101)", () => {
  it("el previo es el supuesto del solver y cae dentro de los límites", () => {
    const base = reconstruct(leer("alcance.json"));
    expect((base.parametros.arrastre_post_impacto as Json).valor).toBe(DRAG_PRIOR);
    expect(DRAG_PRIOR).toBeGreaterThanOrEqual(DRAG_BOUNDS[0]);
    expect(DRAG_PRIOR).toBeLessThanOrEqual(DRAG_BOUNDS[1]);
  });

  it("qué vehículos ajustan su arrastre", () => {
    const spec = leer("inversion/axa_alcance.json");
    expect(dragVehicles(spec, evidenceFromSpec(spec))).toEqual(["veh-a", "veh-b"]);
    const frena = structuredClone(spec);
    vehiculo(frena, "veh-b").frenado = {
      aplico: { valor: true, fuente: "relato", confianza: 0.8 },
    };
    expect(dragVehicles(frena, evidenceFromSpec(frena))).toEqual(["veh-a"]);
    const dicho = structuredClone(spec);
    vehiculo(dicho, "veh-a").arrastre_post_impacto = {
      valor: 0.8,
      fuente: "usuario",
      confianza: 0.9,
    };
    expect(dragVehicles(dicho, evidenceFromSpec(dicho))).toEqual(["veh-b"]);
    const sin = structuredClone(spec);
    for (const v of sin.vehiculos as Json[]) {
      delete v.posicion_final;
      delete v.posicion_final_supuesta;
    }
    expect(dragVehicles(sin, evidenceFromSpec(sin))).toEqual([]);
    expect(parameters(spec, evidenceFromSpec(spec)).map((p) => p.kind)).toEqual([
      "velocidad",
      "velocidad",
      "rumbo",
      "rumbo",
      "arrastre",
      "arrastre",
    ]);
  });

  it("applyValues escribe el arrastre y la reconstrucción lo usa", () => {
    const spec = leer("inversion/axa_alcance.json");
    const golpeado = rearEndPairs(spec)[0]![1];
    const base = reconstruct(spec);
    const con = applyValues(spec, new Map([[`arrastre:${golpeado}`, 1.0]]));
    const campo = vehiculo(con, golpeado).arrastre_post_impacto as Json;
    expect(campo.valor).toBe(1.0);
    expect(campo.fuente).toBe("supuesto");
    const r = reconstruct(con);
    expect((r.parametros.arrastre_post_impacto as Json).por_vehiculo).toEqual({
      [golpeado]: 1.0,
    });
    expect((base.parametros.arrastre_post_impacto as Json).por_vehiculo).toBeUndefined();
    const post = (rec: typeof r) => rec.vehiculos.find((v) => v.id === golpeado)!.distancePostM;
    expect(post(r)).toBeLessThan(post(base));
    expect(dragVehicles(spec, evidenceFromSpec(spec))).toContain(golpeado);
  });

  it("los residuos previos del rumbo (envuelto) y del arrastre", () => {
    const params = [
      new Param("velocidad", "veh-a", 40.0, 5.0, 150.0, false),
      new Param("rumbo", "veh-a", 350.0, 330.0, 370.0, false),
      new Param("arrastre", "veh-b", 0.35, 0.3, 1.0, false),
    ];
    const res = priors(params, [60.0, 365.0, 0.6]);
    expect([...res.keys()]).toEqual(["rumbo_previo:veh-a", "arrastre_previo:veh-b"]);
    expect(res.get("rumbo_previo:veh-a")).toBeCloseTo(15.0 / SIGMA_HEADING_PRIOR_DEG, 12);
    expect(res.get("arrastre_previo:veh-b")).toBeCloseTo(0.25 / SIGMA_DRAG, 12);
    const wrap = priors([new Param("rumbo", "v", 1.0, -19.0, 21.0, false)], [359.0]);
    expect(wrap.get("rumbo_previo:v")).toBeCloseTo(-2.0 / SIGMA_HEADING_PRIOR_DEG, 12);
  });

  it("AXA: el rumbo de V2 ya no queda en el límite (referencia versionada)", () => {
    const doc = leer("inversion/resultados/axa_alcance.json");
    const params = new Map(
      ((doc.inversion as Json).parametros as Json[]).map((p) => [
        `${String(p.parametro)}:${String(p.vehiculo)}`,
        p,
      ]),
    );
    const rumbo = params.get("rumbo_inicial:veh-a")!;
    expect(rumbo.identificable).toBe(true);
    expect(rumbo.en_limite).toBe(false);
    const est = rumbo.estimacion as Json;
    expect(Math.abs(Number(est.mejor) - Number(rumbo.inicial))).toBeLessThan(
      SIGMA_HEADING_PRIOR_DEG,
    );
    const arrastre = params.get("arrastre_post_impacto:veh-b")!;
    expect(arrastre.unidad).toBe("fraccion");
    const mejor = Number((arrastre.estimacion as Json).mejor);
    expect(mejor).toBeGreaterThanOrEqual(DRAG_BOUNDS[0]);
    expect(mejor).toBeLessThanOrEqual(DRAG_BOUNDS[1]);
    expect(arrastre.en_limite).toBe(false);
  });

  it("el rumbo de llegada gira sobre el punto de impacto declarado", () => {
    const spec = leer("inversion/axa_alcance.json");
    const pose0 = vehiculo(spec, "veh-a").posicion_inicial as Json;
    const h0 = Number(pose0.rumbo_deg);
    const girada = applyValues(spec, new Map([["rumbo:veh-a", h0 + 10.0]]));
    const pose = vehiculo(girada, "veh-a").posicion_inicial as Json;
    expect(pose.rumbo_deg).toBeCloseTo(h0 + 10.0, 12);
    expect([pose.x, pose.y]).not.toEqual([pose0.x, pose0.y]);
    expect(Math.hypot(Number(pose.x), Number(pose.y))).toBeCloseTo(
      Math.hypot(Number(pose0.x), Number(pose0.y)),
      9,
    );
    const r = reconstruct(girada);
    expect(Math.hypot(r.puntoImpacto![0], r.puntoImpacto![1])).toBeLessThan(0.3);
    expect(impactPivot(spec)).toEqual([0, 0]);
    const sin = structuredClone(spec);
    for (const e of sin.eventos as Json[]) delete e.punto_impacto;
    const quieta = applyValues(sin, new Map([["rumbo:veh-a", h0 + 10.0]]));
    const pose2 = vehiculo(quieta, "veh-a").posicion_inicial as Json;
    expect([pose2.x, pose2.y]).toEqual([pose0.x, pose0.y]);
  });
});
