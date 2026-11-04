import { readFileSync } from "node:fs";
import { evidenceFromSpec, fitEvidence, withMarks, applyValues } from "../packages/solver-ts/src/inversion.ts";
import { reconstruct } from "../packages/solver-ts/src/reconstruct.ts";
const spec = JSON.parse(readFileSync("D:/Documentos/proyectos/croquis/packages/scene-schema/fixtures/inversion/axa_alcance.json", "utf8"));
const ev = evidenceFromSpec(spec);
const base = withMarks(spec, ev);
const show = (vals: Record<string, number>) => {
  const start = new Map(Object.entries(vals));
  const fit = fitEvidence(base, ev, { free: new Set(), start });
  const r = reconstruct(applyValues(base, start));
  const poses = r.vehiculos.map((v) => `${v.id}: rest=(${v.restPose.map((x) => x.toFixed(2)).join(",")}) vImp=${v.vImpactKmh.toFixed(1)} dV=${v.deltaVKmh.toFixed(1)} post=${v.distancePostM.toFixed(1)}`).join(" | ");
  const res = [...fit.residuals].map(([k, x]) => `${k}=${x.toFixed(2)}`).join(" ");
  const cost = 0.5 * [...fit.residuals.values()].reduce((a, x) => a + x * x, 0);
  console.log(JSON.stringify(vals), "cost", cost.toFixed(3), "\n   ", poses, "\n   ", res);
};
const H = 75.71537756298898;
console.log("evidencia rest", [...ev.rest], "restHeading", [...ev.restHeading], "restAssumed", [...ev.restAssumed], "headingAssumed", [...ev.headingAssumed]);
show({ "velocidad:veh-a": 71.56, "velocidad:veh-b": 25.32, "rumbo:veh-a": H, "rumbo:veh-b": H });
show({ "velocidad:veh-a": 71.56, "velocidad:veh-b": 25.32, "rumbo:veh-a": 95.72, "rumbo:veh-b": 87.16 });
for (const ha of [55, 65, 75.72, 85, 95.72, 105, 115, 125])
  show({ "velocidad:veh-a": 71.56, "velocidad:veh-b": 25.32, "rumbo:veh-a": ha, "rumbo:veh-b": 87.16 });
console.log("--- veh-b heading sweep with veh-a at 95.72");
for (const hb of [65, 75.72, 85, 95, 105])
  show({ "velocidad:veh-a": 71.56, "velocidad:veh-b": 25.32, "rumbo:veh-a": 95.72, "rumbo:veh-b": hb });
