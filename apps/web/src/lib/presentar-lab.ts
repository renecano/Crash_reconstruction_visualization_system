/**
 * Presentar en el rediseño «Laboratorio» (prompt §8): los capítulos de la historia del caso, con sus
 * datos y el instante de la maqueta en cada momento. Todo sale de la reconstrucción y de la
 * comparación con el reporte: si algo no se sabe, el capítulo lo dice.
 */
import { alternativaSupuesta, type Reconstruccion } from "@croquis/cesvi";
import {
  conLetra,
  conSigno,
  pctConSigno,
  type CifraContraste,
  type conteoCriterios,
  type LecturaFisica,
} from "./contraste-lab";
import { poseEn, tImpacto, type ResultadoMaqueta } from "./maqueta";
import { rangoDeVelocidad } from "./reconstruccion-lab";
import { METODO } from "./textos-caso";

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
  /** Una línea debajo de sus datos (por qué difieren las dos lecturas). */
  nota?: string;
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
  fisica = null,
  letraDe = (id) => id,
  conteo,
}: {
  /** La lectura de la reconstrucción física contra el reporte. */
  fisica?: LecturaFisica | null;
  letraDe?: (id: string) => string;
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
  const fijadas = r.velocidades
    .filter((v) => v.previa)
    .sort((a, b) => b.previa!.mejor - a.previa!.mejor);
  fijadas.forEach((v, k) => {
    filasImpacto.push({
      etiqueta: `${nombreDe(String(v.vehiculo))} antes del impacto`,
      valor: `${v.previa!.mejor.toFixed(2)} km/h`,
      grande: k === 0,
    });
    const rango = k === 0 ? rangoDeVelocidad(v) : null;
    if (rango)
      filasImpacto.push({
        etiqueta: rango.lineal ? "Rango por aproximación lineal" : "Rango",
        valor: `${rango.p10.toFixed(2)}–${rango.p90.toFixed(2)}`,
      });
  });
  if (!filasImpacto.length)
    filasImpacto.push({
      etiqueta: "Velocidad antes del impacto",
      valor: "la evidencia no la fija",
    });
  // La otra hipótesis, con el reposo supuesto como dato, marcada como supuesto (ADR 0135).
  const alternativa = alternativaSupuesta(r, (id) => nombreDe(id));
  if (alternativa)
    filasImpacto.push({
      etiqueta: "Alternativa con el reposo supuesto (supuesto)",
      valor: alternativa.corto,
    });
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
  if (contra || fisica) {
    const filas: FilaCapitulo[] = [];
    if (contra) {
      filas.push(
        { etiqueta: METODO.cesviConReporte, valor: pctConSigno(contra.difPct), grande: true },
        {
          etiqueta: "Croquis contra el reporte",
          valor: `${contra.croquis.toFixed(2)} contra ${contra.cesvi.toFixed(2)} km/h · ${conSigno(contra.difKmh)} km/h`,
        },
      );
    }
    if (fisica) {
      filas.push(
        {
          etiqueta: METODO.reconstruccion,
          valor: fisica.difPct === null ? "la evidencia no la fija" : pctConSigno(fisica.difPct),
          grande: fisica.difPct !== null,
        },
        {
          etiqueta: "Croquis contra el reporte",
          valor:
            fisica.croquis === null
              ? `sin velocidad contra ${fisica.cesvi.toFixed(2)} km/h`
              : `${fisica.croquis.toFixed(2)}${fisica.rango ? ` (${fisica.rango[0].toFixed(2)}–${fisica.rango[1].toFixed(2)})` : ""} contra ${fisica.cesvi.toFixed(2)} km/h · ${conSigno(fisica.difKmh ?? 0)} km/h`,
        },
      );
    }
    if (conteo) {
      filas.push({
        etiqueta: "Criterios",
        valor: `${conteo.coinciden} coinciden · ${conteo.difieren} difieren · ${conteo.sinDato} sin dato`,
      });
    }
    salida.push({
      clave: "contra",
      titulo: "Contra CESVI",
      t0: res.t_fin,
      t1: res.t_fin,
      filas,
      ...(fisica
        ? {
            nota: `Por qué difieren: ${conLetra(fisica.porQue, fisica.vehiculo, letraDe(fisica.vehiculo))}`,
          }
        : {}),
    });
  }
  return salida;
}
