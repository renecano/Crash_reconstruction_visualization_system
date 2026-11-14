/**
 * T3.2 (W8), complemento del diagnóstico: en AXA, el punto de contacto que elige el solver cuando
 * los dos vehículos van casi en la misma línea. El evento declara el punto de impacto (0, 0) y cada
 * vehículo arranca 12 m antes de su posición de impacto, en su rumbo (`especDeExpediente`). Aquí se
 * gira apenas el rumbo de V1 (de 0 a 1°) con las velocidades de la app y se anota dónde queda el
 * contacto y cuánto antes del choque está V2 en su pose inicial.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/t3_2_contacto_axa.mts → eval/results/t3_2_contacto_axa.json
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expedienteAxaReconstruccion } from "../apps/web/src/lib/axa-reconstruccion.ts";
import { especDeExpediente } from "../packages/cesvi/src/reconstruccion.ts";
import { applyValues } from "../packages/solver-ts/src/inversion.ts";
import { reconstruct } from "../packages/solver-ts/src/reconstruct.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const r2 = (x: number) => Math.round(x * 100) / 100;
const base = especDeExpediente(expedienteAxaReconstruccion());
const spec = base.spec as Json;
const id = (x: string) => Object.entries(base.ids).find(([, e]) => e === x)![0];
const V1 = id("V1");
const V2 = id("V2");
const veh = (s: Json, k: string) => (s.vehiculos as Json[]).find((x) => x.id === k)!;
const h0 = Number((veh(spec, V1).posicion_inicial as Json).rumbo_deg);
const evento = (spec.eventos as Json[])[0]!;

const filas = [0, 0.01, 0.045, 0.1, 0.5, 1].map((giro) => {
  const s = applyValues(
    spec,
    new Map([
      [`velocidad:${V2}`, 64.23],
      [`velocidad:${V1}`, 22.56],
      [`rumbo:${V1}`, h0 + giro],
    ]),
  );
  const r = reconstruct(s, { dt: 0.1 });
  const tr = r.vehiculos.find((q) => q.id === V2)!.trajectory;
  const p = veh(s, V2).posicion_inicial as Json;
  let k = 0;
  let mejor = Infinity;
  tr.x.forEach((x, i) => {
    const d = Math.hypot(x - Number(p.x), tr.y[i]! - Number(p.y));
    if (d < mejor) {
      mejor = d;
      k = i;
    }
  });
  const fila = {
    giro_rumbo_v1_deg: giro,
    punto_impacto: r.puntoImpacto ? [r2(r.puntoImpacto[0]), r2(r.puntoImpacto[1])] : null,
    distancia_al_punto_declarado_m: r.puntoImpacto
      ? r2(Math.hypot(r.puntoImpacto[0], r.puntoImpacto[1]))
      : null,
    v2_en_su_pose_inicial_t_s: r2(tr.t[k]!),
  };
  console.log(JSON.stringify(fila));
  return fila;
});

writeFileSync(
  join(RAIZ, "eval/results/t3_2_contacto_axa.json"),
  `${JSON.stringify(
    {
      name: "t3_2_contacto_axa",
      generated_at: new Date().toISOString().slice(0, 19) + "Z",
      punto_impacto_del_evento: evento.punto_impacto,
      procedencia_del_evento: evento.procedencia,
      velocidades_kmh: { V2: 64.23, V1: 22.56 },
      filas,
    },
    null,
    2,
  )}\n`,
);
