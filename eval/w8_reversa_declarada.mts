/**
 * W8 · T3.3, decisión 7 del ADR 0136 (René, 2026-11-15): una reversa declarada sin velocidad va a
 * la velocidad medida de una reversa, no a la de la reconstrucción de ese vehículo. Esto mide el
 * antes y el después en AXA A2010930, donde el conductor de A declara: «me paré, reversié unos
 * metros cuando llegó la camioneta y me impactó».
 *
 * La versión declarada se arma como en la app (`especDeclarada` sobre la escena de la
 * reconstrucción): A en reversa y B circulando, sin velocidades declaradas. Se guarda también la
 * reconstrucción física de AXA, que no debe moverse (56.87 km/h, 54.79–78.39).
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/w8_reversa_declarada.mts [salida.json]
 *     → eval/results/w8_reversa_declarada.json (el «antes», en eval/results/w8/reversa_declarada_antes.json)
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expedienteAxaReconstruccion } from "../apps/web/src/lib/axa-reconstruccion.ts";
import {
  compararDeclarada,
  especDeclarada,
  sugerirDeclarada,
} from "../packages/cesvi/src/comparacion-declarada.ts";
import type { VersionDeclarada } from "../packages/cesvi/src/declaracion.ts";
import {
  especDeExpediente,
  hipotesisVisible,
  reconstruirExpediente,
} from "../packages/cesvi/src/reconstruccion.ts";
import { fullResult } from "../packages/solver-ts/src/full-result.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = process.argv[2] ?? join(RAIZ, "eval/results/w8_reversa_declarada.json");
const r2 = (x: number) => Math.round(x * 100) / 100;

const e = expedienteAxaReconstruccion();
const r = reconstruirExpediente(e);
const visible = hipotesisVisible(r);

// Lo que declara el conductor de A (V1), como lo dejaría la lectura de su declaración.
const declarada: VersionDeclarada = {
  declarante: "V1",
  maniobras: [
    { vehiculo: "V1", tipo: "reversa", cita: "reversie unos metros" },
    { vehiculo: "V2", tipo: "circula", cita: "cuando llego la camioneta y me impacto" },
  ],
  velocidades: [],
  contactos: [],
  finales: [],
  descartados: { citas: 0, numeros: 0 },
};
// Como en la app (`comparacion-declaracion.tsx`): las velocidades que fijó la reconstrucción.
const reconstruidas = new Map(
  r.velocidades.flatMap((x) => (x.previa ? [[x.vehiculo, x.previa.mejor] as const] : [])),
);
const base = especDeExpediente(e);
const decl = especDeclarada(base, declarada, reconstruidas);
const resultado = fullResult(decl.spec as never) as Json;
const filas = compararDeclarada({
  expediente: e,
  reconstruccion: r,
  declarada,
  resultadoDeclarado: resultado,
});

const salida = {
  fuente: "eval/w8_reversa_declarada.mts",
  commit: execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim(),
  caso: "A2010930",
  reconstruccion_fisica: {
    hipotesis_visible: visible?.titulo ?? null,
    velocidades: (visible?.velocidades ?? []).map((v) => ({
      vehiculo: v.vehiculo,
      kmh: v.kmh,
      rango: v.rango,
    })),
    todas: (r.hipotesis ?? []).map((h) => ({
      clave: h.clave,
      velocidades: h.velocidades.map((v) => [v.vehiculo, v.kmh, v.rango]),
    })),
  },
  version_declarada: {
    declaracion: "me paré, reversié unos metros cuando llegó la camioneta y me impactó",
    escena: (decl.spec.vehiculos as Json[]).map((v) => ({
      vehiculo: decl.ids[String(v.id)],
      maniobra: (v.maniobra as Json).valor,
      sentido_marcha: (v.sentido_marcha as Json | undefined)?.valor ?? null,
      velocidad_kmh: (v.velocidad_previa as Json).valor,
      velocidad_rango: (v.velocidad_previa as Json).rango ?? null,
      velocidad_nota: (v.velocidad_previa as Json).nota ?? null,
    })),
    limites: decl.limites.filter((l) => /conductor|reversa/.test(l)),
    resultado: (resultado.vehiculos as Json[]).map((v) => ({
      vehiculo: decl.ids[String(v.id)],
      sentido_marcha: v.sentido_marcha ?? null,
      v_impacto_kmh: v.v_impacto_kmh,
      delta_v_kmh: r2(Number(v.delta_v_kmh)),
      distancia_post_m: r2(Number(v.distancia_post_m)),
      pose_final: v.pose_final,
    })),
    velocidad_de_cierre_kmh:
      ((
        (resultado.eventos as Json[]).find((ev) => String(ev.tipo).startsWith("impacto_"))
          ?.detalle as Json | undefined
      )?.velocidad_cierre_kmh as number | undefined) ?? null,
  },
  que_cambia_entre_versiones: filas.map((f) => ({
    clave: f.clave,
    vehiculo: f.vehiculo,
    declarada: f.declarada,
    evidencia: f.evidencia,
    estado: f.estado,
  })),
  sugerencia: sugerirDeclarada(filas),
};
writeFileSync(SALIDA, `${JSON.stringify(salida, null, 2)}\n`);
console.log(JSON.stringify(salida, null, 1));
