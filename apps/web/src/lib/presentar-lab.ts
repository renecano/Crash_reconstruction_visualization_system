/**
 * Presentar en el rediseño «Laboratorio» (prompt §8): los capítulos de la historia del caso, con sus
 * datos y el instante de la maqueta en cada momento. Todo sale de la reconstrucción y de la
 * comparación con el reporte: si algo no se sabe, el capítulo lo dice.
 */
import type { Reconstruccion } from "@croquis/cesvi";
import type { CifraContraste, conteoCriterios } from "./contraste-lab";
import { poseEn, tImpacto, type ResultadoMaqueta } from "./maqueta";
import { rangoDeImpacto } from "./reconstruccion-lab";

/** Cuánto dura cada capítulo (s), como en una historia. */
export const DURACION_CAPITULO_S = 6;

export interface FilaCapitulo {
  etiqueta: string;
  valor: string;
  /** La cifra del capítulo, en grande. */
  grande?: boolean;
}

export interface Capitulo {
  clave: "escena" | "impacto" | "finales" | "contra";
  titulo: string;
  filas: FilaCapitulo[];
  /** Instante de la maqueta al empezar y al terminar el capítulo. */
  t0: number;
  t1: number;
}

/** El instante de la maqueta en una fracción (0–1) del capítulo. */
export const tDelCapitulo = (c: Pick<Capitulo, "t0" | "t1">, fraccion: number): number =>
  c.t0 + (c.t1 - c.t0) * Math.max(0, Math.min(1, fraccion));

/** Cuánto se movió un vehículo del impacto al reposo (m). */
export function recorridoTrasImpacto(res: ResultadoMaqueta, id: string): number | null {
  const v = res.vehiculos.find((x) => x.id === id);
  if (!v) return null;
  const a = poseEn(v.trayectoria, tImpacto(res));
  const b = poseEn(v.trayectoria, res.t_fin);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

const f1 = (x: number) => x.toFixed(1);

export function capitulos({
  r,
  res,
  nombreDe,
  lugar,
  modalidad,
  contra,
  conteo,
}: {
  r: Reconstruccion;
  res: ResultadoMaqueta;
  /** «B · Tacoma», por id del expediente. */
  nombreDe: (id: string) => string;
  lugar: string;
  modalidad: string | null;
  contra: CifraContraste | null;
  conteo: ReturnType<typeof conteoCriterios> | null;
}): Capitulo[] {
  const ti = tImpacto(res);
  const ids = Object.entries(r.ids) as [string, string][];
  const escena: Capitulo = {
    clave: "escena",
    titulo: "La escena",
    t0: res.t_inicio,
    t1: ti,
    filas: [
      ...(lugar ? [{ etiqueta: "Lugar", valor: lugar }] : []),
      ...(modalidad ? [{ etiqueta: "Modalidad", valor: modalidad }] : []),
      ...ids
        .map(([, id]) => id)
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
        .map((id, k) => ({ etiqueta: `Vehículo ${k + 1}`, valor: nombreDe(id) })),
    ],
  };

  const filasImpacto: FilaCapitulo[] = [];
  const conImpacto = r.velocidades
    .filter((v) => v.impacto?.p50 !== undefined)
    .sort((a, b) => (b.impacto!.p50 ?? 0) - (a.impacto!.p50 ?? 0));
  conImpacto.forEach((v, k) => {
    const i = v.impacto!;
    const nombre = nombreDe(String(v.vehiculo));
    filasImpacto.push({
      etiqueta: `${nombre} al impacto`,
      valor: `${f1(i.p50!)} km/h`,
      grande: k === 0,
    });
    const rango = k === 0 ? rangoDeImpacto(v) : null;
    if (rango)
      filasImpacto.push({
        etiqueta: rango.lineal ? "Rango por aproximación lineal" : "Rango p10–p90",
        valor: `${f1(rango.p10)}–${f1(rango.p90)}`,
      });
  });
  if (!filasImpacto.length)
    filasImpacto.push({ etiqueta: "Velocidad al impacto", valor: "la evidencia no la fija" });
  const impacto: Capitulo = {
    clave: "impacto",
    titulo: "El impacto",
    t0: ti,
    t1: ti,
    filas: filasImpacto,
  };

  const finales: Capitulo = {
    clave: "finales",
    titulo: "Posiciones finales",
    t0: ti,
    t1: res.t_fin,
    filas: ids
      .map(([sid, id]) => ({ id, m: recorridoTrasImpacto(res, sid) }))
      .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))
      .map(({ id, m }) => ({
        etiqueta: `${nombreDe(id)} se movió`,
        valor: m === null ? "sin dato" : `${f1(m)} m después del impacto`,
      })),
  };

  const salida = [escena, impacto, finales];
  if (contra) {
    salida.push({
      clave: "contra",
      titulo: "Contra CESVI",
      t0: res.t_fin,
      t1: res.t_fin,
      filas: [
        { etiqueta: "Diferencia", valor: `${f1(contra.difPct)} %`, grande: true },
        {
          etiqueta: "Croquis, con las medidas del reporte",
          valor: `${contra.croquis.toFixed(2)} km/h`,
        },
        { etiqueta: "Reporte de CESVI", valor: `${contra.cesvi.toFixed(2)} km/h` },
        { etiqueta: "En km/h", valor: `${contra.difKmh.toFixed(2)} km/h` },
        ...(conteo
          ? [
              {
                etiqueta: "Criterios",
                valor: `${conteo.coinciden} coinciden · ${conteo.difieren} difieren · ${conteo.sinDato} sin dato`,
              },
            ]
          : []),
      ],
    });
  }
  return salida;
}
