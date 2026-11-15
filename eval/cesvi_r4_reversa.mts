/**
 * E-R4 · reversa (T3.3, W8, ADR 0136): dado quién retrocede según el propio reporte de CESVI, ¿Croquis
 * reconstruye la reversa?
 *
 * La E-R4 no puede identificar la modalidad «reversa» con la narración de R0, que no trae la
 * dinámica (ADR 0069: 0 de 9 en la prueba). Esto mide otra cosa, y lo mide en todos los reportes
 * que traen una reversa: a la lectura grabada de la narración (`data/cesvi/r4/lecturas-v2.jsonl`,
 * la misma de la E-R4, sin API) se le agrega un solo dato que la narración no trae, quién retrocede,
 * tomado de las maniobras que C0 leyó en el reporte completo (`corpus/expedientes.jsonl`). La escena
 * se arma como en «Caso nuevo» (`especDeExpediente`) y se reconstruye con el solver de la app.
 *
 * Por reporte y por vehículo que retrocede:
 * - **retrocede:** antes del impacto se mueve con la parte posterior por delante;
 * - **choca:** participa en un impacto con cambio de velocidad;
 * - **con su parte posterior:** el punto del primer impacto queda en su parte posterior (por
 *   geometría, en t = 0). Se cuenta solo donde C0 leyó daño en la parte posterior de ese vehículo:
 *   no todas las reversas pegan por atrás.
 *
 * Desarrollo y prueba se reportan aparte. No se ajustó nada con ninguna de las dos.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/cesvi_r4_reversa.mts → eval/results/cesvi_r4_reversa.json
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Expediente, SalidaCorpus } from "../packages/cesvi/src/corpus.ts";
import { escenaDeNarracion } from "../packages/cesvi/src/escena-narracion.ts";
import { especDeExpediente } from "../packages/cesvi/src/reconstruccion.ts";
import { REVERSA_KMH } from "../packages/cesvi/src/reversa.ts";
import { validateEscena } from "../packages/scene-schema/src/index.ts";
import { reconstruct, reconstructionToDict } from "../packages/solver-ts/src/reconstruct.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = process.argv[2] ?? join(RAIZ, "eval/results/cesvi_r4_reversa.json");
const jsonl = <T,>(ruta: string) =>
  readFileSync(join(RAIZ, ruta), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
const r2 = (x: number) => Math.round(x * 100) / 100;
const prueba = new Set(
  (
    JSON.parse(readFileSync(join(RAIZ, "data/cesvi/corpus/particion.json"), "utf8")) as {
      prueba: string[];
    }
  ).prueba,
);
const narraciones = new Map(
  jsonl<{ id: string; descripcion: string }>("data/cesvi/corpus/narraciones.jsonl").map((n) => [
    n.id,
    n.descripcion,
  ]),
);
const lecturas = new Map(
  jsonl<{ id: string; salida: SalidaCorpus }>("data/cesvi/r4/lecturas-v2.jsonl").map((l) => [
    l.id,
    l.salida,
  ]),
);

interface Fila {
  id: string;
  particion: "desarrollo" | "prueba";
  vehiculo: string;
  /** Por qué no se pudo medir, si no se pudo. */
  sin_medir?: string;
  maniobra?: string;
  velocidad_kmh?: number;
  retrocede?: boolean;
  choca?: boolean;
  cara_reconstruida?: string | null;
  /** Las caras dañadas de ese vehículo según C0. */
  caras_del_reporte?: string[];
  delta_v_kmh?: number;
}

const filas: Fila[] = [];
let reportes = 0;
for (const c of jsonl<{ id: string; expediente?: Expediente }>(
  "data/cesvi/corpus/expedientes.jsonl",
)) {
  const e0 = c.expediente;
  const retroceden = [
    ...new Set(
      (e0?.versiones ?? []).flatMap((v) =>
        (v.maniobras ?? []).filter((m) => m.tipo === "reversa").map((m) => m.vehiculo),
      ),
    ),
  ];
  if (!e0 || !retroceden.length) continue;
  reportes++;
  const particion = prueba.has(c.id) ? "prueba" : "desarrollo";
  const salida = lecturas.get(c.id);
  const narracion = narraciones.get(c.id);
  for (const vehiculo of retroceden) {
    const fila: Fila = { id: c.id, particion, vehiculo };
    filas.push(fila);
    if (!salida || !narracion) {
      fila.sin_medir = "sin lectura de la narración";
      continue;
    }
    const leido = escenaDeNarracion(salida, narracion).expediente;
    if (!leido.vehiculos.some((v) => v.id === vehiculo)) {
      fila.sin_medir = "la narración no trae a ese vehículo";
      continue;
    }
    // La versión de la evidencia, con quién retrocede como lo narraría el perito.
    const versiones = [...(leido.versiones ?? [])];
    const i = versiones.findIndex((v) => v.tipo === "evidencia");
    const previas = (i >= 0 ? (versiones[i]!.maniobras ?? []) : []).filter(
      (m) => m.vehiculo !== vehiculo || m.tipo !== "se_detiene",
    );
    const ev = {
      ...(i >= 0 ? versiones[i]! : { tipo: "evidencia" as const }),
      maniobras: [...previas, { vehiculo, tipo: "reversa" as const }],
    };
    if (i >= 0) versiones[i] = ev;
    else versiones.unshift(ev);
    const e = { ...leido, versiones } as Expediente;
    try {
      const base = especDeExpediente(e, c.id);
      if (!validateEscena(base.spec).ok) {
        fila.sin_medir = "la escena no valida";
        continue;
      }
      const sid = Object.keys(base.ids).find((k) => base.ids[k] === vehiculo)!;
      const sv = (base.spec.vehiculos as Json[]).find((v) => v.id === sid)!;
      fila.maniobra = String((sv.maniobra as Json).valor);
      fila.velocidad_kmh = Number((sv.velocidad_previa as Json).valor);
      const rec = reconstruct(base.spec);
      const tr = rec.vehiculos.find((v) => v.id === sid)!.trajectory;
      let adelante = 0;
      let atras = 0;
      for (let k = 0; k < tr.t.length && tr.t[k]! < -0.05; k++) {
        const avance = tr.vx[k]! * Math.cos(tr.yaw[k]!) + tr.vy[k]! * Math.sin(tr.yaw[k]!);
        if (avance < -1e-6) atras++;
        else if (avance > 1e-6) adelante++;
      }
      fila.retrocede = atras > 0 && adelante === 0;
      const doc = (reconstructionToDict(rec).vehiculos as Json[]).find((v) => v.id === sid)!;
      fila.delta_v_kmh = r2(Number(doc.delta_v_kmh));
      fila.choca = doc.involucrado === true && Number(doc.delta_v_kmh) > 0;
      // La cara que toca, por geometría: dónde queda el punto del primer impacto visto desde el
      // vehículo en t = 0 (el resultado solo trae la cara que se declaró en la escena).
      const dict = reconstructionToDict(rec);
      const primero = ((dict.eventos ?? []) as Json[]).find(
        (ev) => String(ev.tipo).startsWith("impacto_") && Number(ev.t) === 0,
      );
      fila.cara_reconstruida = null;
      if (primero && (primero.actores as string[]).includes(sid)) {
        const o = rec.vehiculos.find((v) => v.id === sid)!;
        const k0 = tr.t.findIndex((t) => t >= 0);
        const pi = dict.punto_impacto as { x: number; y: number };
        const dx = pi.x - tr.x[k0]!;
        const dy = pi.y - tr.y[k0]!;
        const lx = dx * Math.cos(tr.yaw[k0]!) + dy * Math.sin(tr.yaw[k0]!);
        const ly = -dx * Math.sin(tr.yaw[k0]!) + dy * Math.cos(tr.yaw[k0]!);
        fila.cara_reconstruida =
          Math.abs(lx) / (0.5 * o.length) >= Math.abs(ly) / (0.5 * o.width)
            ? lx > 0
              ? "F"
              : "B"
            : ly > 0
              ? "L"
              : "R";
      }
      fila.caras_del_reporte = [
        ...new Set((e0.danos ?? []).filter((d) => d.vehiculo === vehiculo).map((d) => d.zona.cara)),
      ];
    } catch (err) {
      fila.sin_medir = `no se pudo reconstruir: ${String((err as Error).message).slice(0, 120)}`;
    }
  }
}

function resumen(p: "desarrollo" | "prueba") {
  const fs = filas.filter((f) => f.particion === p);
  const medidas = fs.filter((f) => !f.sin_medir);
  const k = (pred: (f: Fila) => boolean) => medidas.filter(pred).length;
  // Solo donde el reporte dice que ese vehículo tiene dañada la parte posterior.
  const atras = medidas.filter((f) => f.caras_del_reporte?.includes("posterior"));
  const motivos: Record<string, number> = {};
  for (const f of fs.filter((x) => x.sin_medir))
    motivos[f.sin_medir!.split(":")[0]!] = (motivos[f.sin_medir!.split(":")[0]!] ?? 0) + 1;
  return {
    reportes: new Set(fs.map((f) => f.id)).size,
    vehiculos_que_retroceden: fs.length,
    medidos: medidas.length,
    sin_medir: motivos,
    retrocede: k((f) => f.retrocede === true),
    retrocede_y_choca: k((f) => f.retrocede === true && f.choca === true),
    con_dano_posterior_en_el_reporte: atras.length,
    de_esos_pegan_con_la_parte_posterior: atras.filter(
      (f) => f.retrocede && f.choca && f.cara_reconstruida === "B",
    ).length,
  };
}

const salida = {
  fuente: "eval/cesvi_r4_reversa.mts",
  commit: execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim(),
  que_mide:
    "Dado quién retrocede según el reporte (maniobras de C0), si Croquis reconstruye la reversa con la narración de R0 leída como en la E-R4.",
  velocidad_en_reversa_kmh: REVERSA_KMH,
  reportes_con_reversa: reportes,
  desarrollo: resumen("desarrollo"),
  prueba: resumen("prueba"),
  filas,
};
writeFileSync(SALIDA, `${JSON.stringify(salida, null, 2)}\n`);
console.log(JSON.stringify({ ...salida, filas: undefined }, null, 1));
