/**
 * T3.3 (W8): cómo reconstruye Croquis una reversa. Solo mide: no cambia el solver. El «antes» se
 * guarda en `eval/results/w8/t3_3_reversa_antes.json` y el «después», en
 * `eval/results/t3_3_reversa.json`, con el mismo guion.
 *
 * El caso es `cesvi-3a0125cb81` (Yecapixtla): el conductor de A (Grand Cherokee) declara que puso
 * en marcha hacia atrás su vehículo sin ver a B (Sentra), que estaba detrás de él. La narración de
 * R0 no trae esa dinámica, así que la reversa entra como la narraría el perito en «Caso nuevo»
 * (maniobras de la versión de la evidencia), y las posiciones, como las pondría en el mapa: A mira
 * al norte y B está detrás, también mirando al norte. Las posiciones finales no están en el
 * reporte: van como supuesto del perito, con B desplazado 0.5 m («en una reversa no habría
 * desplazamiento entre los vehículos, o sería mínimo», dictamen A2010930).
 *
 * 1. **Las cinco entradas** (lectura sola; con la reversa narrada; con posiciones de impacto; con
 *    reposos supuestos; con reposos medidos y B desplazado 6 m): la escena que arma la app, lo que reconstruye el solver y lo que estima la
 *    inversión.
 * 2. **Reversa con vuelta:** qué queda en la escena cuando la narración dice las dos cosas.
 * 3. **El contrato:** si la escena acepta el sentido de marcha aparte de la maniobra.
 * 4. **Los límites de la velocidad en reversa** en la inversión (en cada entrada).
 * 5. **El corpus:** cuántos reportes de CESVI traen una reversa y qué velocidad le suponen.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/t3_3_reversa.mts [salida.json]
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { conPosicion, escenaDeNarracion } from "../packages/cesvi/src/index.ts";
import type { Expediente, SalidaCorpus } from "../packages/cesvi/src/index.ts";
import { especDeExpediente, reconstruirExpediente } from "../packages/cesvi/src/reconstruccion.ts";
import { validateEscena } from "../packages/scene-schema/src/index.ts";
import { evidenceFromSpec, parameters } from "../packages/solver-ts/src/inversion.ts";
import { reconstruct } from "../packages/solver-ts/src/reconstruct.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = process.argv[2] ?? join(RAIZ, "eval/results/t3_3_reversa.json");
const r2 = (x: number) => Math.round(x * 100) / 100;
const CASO = "cesvi-3a0125cb81";

const grabada = JSON.parse(
  readFileSync(join(RAIZ, `data/cesvi/grabaciones/escenas/${CASO}.json`), "utf8"),
) as { narracion: string; salida: SalidaCorpus };

// El cruce de Yecapixtla, aproximado: solo fija el origen de la escena local.
const P = { lat: 18.8831, lon: -98.8652 };
const m = (norte: number, este: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});

type Maniobra = { vehiculo: string; tipo: string };
function conManiobras(e: Expediente, maniobras: Maniobra[]): Expediente {
  const versiones = [...(e.versiones ?? [])] as Json[];
  const i = versiones.findIndex((v) => v.tipo === "evidencia");
  const ev = { ...(i >= 0 ? versiones[i]! : { tipo: "evidencia" }), maniobras };
  if (i >= 0) versiones[i] = ev;
  else versiones.push(ev);
  return { ...e, versiones } as unknown as Expediente;
}

const lectura = escenaDeNarracion(grabada.salida, grabada.narracion).expediente;
const REVERSA: Maniobra[] = [
  { vehiculo: "V1", tipo: "reversa" },
  { vehiculo: "V2", tipo: "se_detiene" },
];
const narrada = conManiobras(lectura, REVERSA);
// A mira al norte con su parte posterior en el punto del golpe; B, detrás, con su frente ahí.
let conImpacto = conPosicion(narrada, {
  vehiculo: "V1",
  fase: "impacto",
  punto: m(2.3, 0),
  rumbo: 0,
});
conImpacto = conPosicion(conImpacto, {
  vehiculo: "V2",
  fase: "impacto",
  punto: m(-2.3, 0),
  rumbo: 0,
});
let conReposo = conPosicion(conImpacto, {
  vehiculo: "V1",
  fase: "final",
  punto: m(2.2, 0),
  rumbo: 0,
  fuente: "supuesto",
});
conReposo = conPosicion(conReposo, {
  vehiculo: "V2",
  fase: "final",
  punto: m(-2.8, 0),
  rumbo: 0,
  fuente: "supuesto",
});

// Lo mismo, con los reposos medidos por el perito y B desplazado 6 m: ¿qué velocidad en reversa
// acepta la inversión?
let conReposoMedido = conPosicion(conImpacto, {
  vehiculo: "V1",
  fase: "final",
  punto: m(-1.5, 0),
  rumbo: 0,
});
conReposoMedido = conPosicion(conReposoMedido, {
  vehiculo: "V2",
  fase: "final",
  punto: m(-8.3, 0),
  rumbo: 0,
});

function medir(nombre: string, e: Expediente): Json {
  const base = especDeExpediente(e, CASO);
  const idDe = (v: string) => Object.keys(base.ids).find((k) => base.ids[k] === v)!;
  const spec = base.spec as Json & { vehiculos: Json[] };
  const escena = spec.vehiculos.map((v) => ({
    vehiculo: base.ids[String(v.id)],
    maniobra: (v.maniobra as Json).valor,
    sentido_marcha: (v.sentido_marcha as Json | undefined)?.valor ?? null,
    velocidad_previa_kmh: (v.velocidad_previa as Json).valor,
    velocidad_previa_fuente: (v.velocidad_previa as Json).fuente,
    velocidad_previa_nota: (v.velocidad_previa as Json).nota ?? null,
    inicial: v.posicion_inicial,
    final: v.posicion_final ?? null,
  }));
  const valida = validateEscena(spec);
  const r = reconstruirExpediente(e, CASO);
  const res = r.resultado as Json;
  const vehiculos = (res.vehiculos as Json[]).map((v) => ({
    vehiculo: base.ids[String(v.id)],
    sentido_marcha: v.sentido_marcha ?? null,
    v_impacto_kmh: v.v_impacto_kmh,
    delta_v_kmh: r2(Number(v.delta_v_kmh)),
    pdof_horas: v.pdof_horas,
    cara_de_contacto: ((v.dano as Json | null)?.cdc as Json | null)?.lado ?? null,
    aplastamiento_medio_m: (v.dano as Json | null)?.perfil_m
      ? r2(
          ((v.dano as Json).perfil_m as number[]).reduce((a, b) => a + b, 0) /
            ((v.dano as Json).perfil_m as number[]).length,
        )
      : null,
    distancia_post_m: r2(Number(v.distancia_post_m)),
    pose_final: v.pose_final,
  }));
  // ¿El que retrocede se mueve hacia atrás antes del golpe? Rumbo del frente contra la velocidad.
  const rec = reconstruct(spec);
  const a = rec.vehiculos.find((v) => v.id === idDe("V1"))!;
  const antes: { t: number; avance: number }[] = [];
  for (let i = 0; i < a.trajectory.length; i++) {
    const t = a.trajectory.t[i]!;
    if (t >= -0.05) break;
    const s = a.trajectory.state(i);
    antes.push({ t, avance: s.vx * Math.cos(s.yaw) + s.vy * Math.sin(s.yaw) });
  }
  const inv = (res.inversion ?? {}) as Json;
  const ev = evidenceFromSpec(spec);
  return {
    entrada: nombre,
    escena_valida: valida.ok,
    escena,
    limites: r.limites,
    resultado: vehiculos,
    marcha_de_V1_antes_del_impacto: antes.length
      ? {
          muestras: antes.length,
          // m/s a lo largo del frente: negativo es hacia atrás.
          avance_min_ms: r2(Math.min(...antes.map((x) => x.avance))),
          avance_max_ms: r2(Math.max(...antes.map((x) => x.avance))),
        }
      : null,
    banderas: ((res.banderas as Json[]) ?? []).map((b) => b.codigo),
    inversion: {
      evidencia: inv.evidencia,
      parametros: ((inv.parametros as Json[]) ?? []).map((p) => ({
        parametro: p.parametro,
        vehiculo: base.ids[String(p.vehiculo)],
        inicial: p.inicial,
        identificable: p.identificable,
        en_limite: p.en_limite ?? null,
        mejor: (p.estimacion as Json | undefined)?.mejor ?? null,
        p10: (p.estimacion as Json | undefined)?.p10 ?? null,
        p90: (p.estimacion as Json | undefined)?.p90 ?? null,
      })),
      limites_de_busqueda: parameters(spec, ev).map((p) => ({
        parametro: p.name,
        vehiculo: base.ids[p.vehicle],
        inicio: r2(p.start),
        lo: r2(p.lo),
        hi: r2(p.hi),
      })),
    },
    velocidades: r.velocidades,
    hipotesis: (r.hipotesis ?? []).map((h) => ({
      clave: h.clave,
      familia: h.familia,
      titulo: h.titulo,
      costo: h.costo,
      velocidades: h.velocidades,
      reposos: h.reposos,
    })),
  };
}

const entradas = [
  medir("1. La lectura de la narración de R0, sin dinámica", lectura),
  medir("2. Con la reversa narrada (A retrocede, B detenido)", narrada),
  medir("3. Con las posiciones de impacto del perito", conImpacto),
  medir("4. Con los reposos supuestos (B desplazado 0.5 m)", conReposo),
  medir("5. Con reposos medidos por el perito y B desplazado 6 m", conReposoMedido),
];

// --- 2. Reversa con vuelta --------------------------------------------------------------------------
function maniobraEnEscena(maniobras: Maniobra[]): Json {
  const base = especDeExpediente(conManiobras(lectura, maniobras), CASO);
  const v = (base.spec.vehiculos as Json[]).find((x) => base.ids[String(x.id)] === "V1")!;
  return {
    narrado: maniobras.filter((x) => x.vehiculo === "V1").map((x) => x.tipo),
    maniobra: (v.maniobra as Json).valor,
    sentido_marcha: (v.sentido_marcha as Json | undefined)?.valor ?? null,
  };
}
const conVuelta = [
  maniobraEnEscena([
    { vehiculo: "V1", tipo: "reversa" },
    { vehiculo: "V1", tipo: "vira_izquierda" },
  ]),
  maniobraEnEscena([
    { vehiculo: "V1", tipo: "vira_izquierda" },
    { vehiculo: "V1", tipo: "reversa" },
  ]),
];

// --- 3. El contrato ---------------------------------------------------------------------------------
const conSentido = structuredClone(especDeExpediente(narrada, CASO).spec) as Json & {
  vehiculos: Json[];
};
conSentido.vehiculos[0]!.maniobra = {
  valor: "vuelta_izquierda",
  fuente: "usuario",
  confianza: 0.8,
};
conSentido.vehiculos[0]!.sentido_marcha = { valor: "reversa", fuente: "usuario", confianza: 0.8 };
const contrato = validateEscena(conSentido);

// --- 4. Cuántos reportes de CESVI traen una reversa, y qué velocidad le suponen ----------------------
type Fila = { id: string; expediente?: Json };
const corpus = readFileSync(join(RAIZ, "data/cesvi/corpus/expedientes.jsonl"), "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Fila);
const deModalidad = corpus.filter((f) =>
  (((f.expediente?.caso as Json | undefined)?.modalidades as string[] | undefined) ?? []).includes(
    "reversa",
  ),
);
const conManiobra = corpus.filter((f) =>
  ((f.expediente?.versiones as Json[] | undefined) ?? []).some((v) =>
    ((v.maniobras as Json[] | undefined) ?? []).some((x) => x.tipo === "reversa"),
  ),
);
const fichas = (
  JSON.parse(readFileSync(join(RAIZ, "data/cesvi/calculos/fichas.json"), "utf8")) as {
    fichas: { id: string; cita?: string }[];
  }
).fichas.filter((f) => /\d+\s*km\/h en reversa/i.test(f.cita ?? ""));

const salida = {
  fuente: "eval/t3_3_reversa.mts",
  commit: execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim(),
  caso: CASO,
  entradas,
  reversa_con_vuelta: conVuelta,
  corpus_cesvi: {
    reportes: corpus.length,
    con_modalidad_reversa: deModalidad.length,
    con_maniobra_de_reversa_declarada: conManiobra.length,
    con_alguna_de_las_dos: new Set([...deModalidad, ...conManiobra].map((f) => f.id)).size,
    velocidad_en_reversa_que_supone_cesvi: fichas.map((f) => ({ id: f.id, cita: f.cita })),
  },
  contrato: {
    acepta_sentido_marcha: contrato.ok,
    errores: contrato.ok ? [] : contrato.errors.slice(0, 3),
  },
};
writeFileSync(SALIDA, `${JSON.stringify(salida, null, 2)}\n`);
console.log(JSON.stringify(salida, null, 1));
