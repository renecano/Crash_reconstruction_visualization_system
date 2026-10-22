/**
 * Validación semántica del expediente de CESVI (contrato v2, docs/cesvi/PLAN-CESVI.md §4): lo que
 * el JSON Schema no puede decir. Se refleja en `python/croquis_scene_schema/check.py`
 * (`check_expediente`); los casos de `fixtures/semantic/cases.json` comparan los dos lados.
 *
 * - X001 vehículo repetido · X002 referencia a un vehículo que no existe
 * - X003 orden de impactos repetido o fuera de 1..M · X004 impacto con menos de dos participantes
 * - X005 más de una versión de la evidencia · X006 versión declarada sin declarante
 * - X007 altura mínima mayor que la máxima · X009 tercio que no corresponde a la cara
 * - X008 (advertencia) McHenry con un número de medidas C distinto de 2, 4 o 6
 */
import type { EscenaSpec } from "./generated/escena.zod";
import type { Problema } from "./check";

type Expediente = NonNullable<EscenaSpec["expediente"]>;

const TERCIOS_FRENTE = new Set(["izquierdo", "centro", "derecho"]);
const TERCIOS_LADO = new Set(["delantero", "medio", "trasero"]);

export function checkExpediente(exp: Expediente): Problema[] {
  const out: Problema[] = [];
  const err = (codigo: string, ruta: string, mensaje: string) =>
    out.push({ codigo, severidad: "error", ruta, mensaje });
  const warn = (codigo: string, ruta: string, mensaje: string) =>
    out.push({ codigo, severidad: "advertencia", ruta, mensaje });
  const base = "/expediente";

  const ids = new Set<string>();
  exp.vehiculos.forEach((v, i) => {
    if (ids.has(v.id)) err("X001", `${base}/vehiculos/${i}/id`, `Vehículo repetido: ${v.id}.`);
    ids.add(v.id);
  });
  const ref = (id: string | undefined, ruta: string) => {
    if (id !== undefined && !ids.has(id)) {
      err("X002", ruta, `El vehículo ${id} no está en el expediente.`);
    }
  };

  (exp.danos ?? []).forEach((d, i) => {
    ref(d.vehiculo, `${base}/danos/${i}/vehiculo`);
    if (
      d.altura_cm?.min !== undefined &&
      d.altura_cm.max !== undefined &&
      d.altura_cm.min > d.altura_cm.max
    ) {
      err(
        "X007",
        `${base}/danos/${i}/altura_cm`,
        "La altura mínima del daño es mayor que la máxima.",
      );
    }
    const t = d.zona.tercio;
    if (t !== undefined) {
      const frente = d.zona.cara === "frontal" || d.zona.cara === "posterior";
      const lado = d.zona.cara === "lateral_izquierdo" || d.zona.cara === "lateral_derecho";
      if ((frente && !TERCIOS_FRENTE.has(t)) || (lado && !TERCIOS_LADO.has(t))) {
        err(
          "X009",
          `${base}/danos/${i}/zona/tercio`,
          `El tercio «${t}» no corresponde a la cara ${d.zona.cara}.`,
        );
      }
    }
    const c = d.magnitud?.c_m;
    if (c !== undefined && ![2, 4, 6].includes(c.length)) {
      warn(
        "X008",
        `${base}/danos/${i}/magnitud/c_m`,
        `McHenry usa 2, 4 o 6 medidas C; hay ${c.length}.`,
      );
    }
  });

  const impactos = exp.impactos ?? [];
  const vistos = new Map<number, number>();
  impactos.forEach((im, i) => {
    (im.vehiculos ?? []).forEach((v, j) => ref(v, `${base}/impactos/${i}/vehiculos/${j}`));
    (im.zonas ?? []).forEach((z, j) =>
      ref(z.vehiculo, `${base}/impactos/${i}/zonas/${j}/vehiculo`),
    );
    if (vistos.has(im.orden) || im.orden > impactos.length) {
      err(
        "X003",
        `${base}/impactos/${i}/orden`,
        `Orden de impacto ${im.orden} repetido o fuera de 1..${impactos.length}.`,
      );
    }
    vistos.set(im.orden, i);
    if ((im.vehiculos ?? []).length + (im.objeto_fijo ? 1 : 0) < 2) {
      err(
        "X004",
        `${base}/impactos/${i}`,
        "Un impacto necesita dos vehículos, o un vehículo y un objeto fijo.",
      );
    }
  });

  let evidencias = 0;
  (exp.versiones ?? []).forEach((v, i) => {
    if (v.tipo === "evidencia") {
      evidencias++;
      if (evidencias > 1)
        err("X005", `${base}/versiones/${i}`, "Hay más de una versión de la evidencia.");
    }
    if (v.tipo === "declarada" && v.declarante === undefined) {
      err("X006", `${base}/versiones/${i}`, "Una versión declarada necesita su declarante.");
    }
    ref(v.declarante, `${base}/versiones/${i}/declarante`);
    (v.maniobras ?? []).forEach((m, j) =>
      ref(m.vehiculo, `${base}/versiones/${i}/maniobras/${j}/vehiculo`),
    );
    (v.posiciones ?? []).forEach((p, j) =>
      ref(p.vehiculo, `${base}/versiones/${i}/posiciones/${j}/vehiculo`),
    );
  });
  (exp.evidencias?.huellas ?? []).forEach((h, j) =>
    ref(h.vehiculo, `${base}/evidencias/huellas/${j}/vehiculo`),
  );
  (exp.calculos ?? []).forEach((c, i) => ref(c.vehiculo, `${base}/calculos/${i}/vehiculo`));
  return out;
}
