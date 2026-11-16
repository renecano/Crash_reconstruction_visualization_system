/**
 * Presentar en el rediseño «Laboratorio» (prompt §8): los capítulos de la historia del caso, con sus
 * datos y el instante de la maqueta en cada momento. Todo sale de la reconstrucción y de la
 * comparación con el reporte: si algo no se sabe, el capítulo lo dice.
 */
import { formato as F, alternativaSupuesta, type Reconstruccion } from "@croquis/cesvi";
import {
  conLetra,
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

const f1 = (x: number) => F.numero(x, 1);

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
        .map((id, k) => ({
          etiqueta: `Vehículo ${String.fromCharCode(65 + k)}`,
          valor: nombreDe(id).replace(/^[A-Z] · /, ""),
        })),
    ],
  };

  const filasImpacto: FilaCapitulo[] = [];
  const fijadas = r.velocidades
    .filter((v) => v.previa)
    .sort((a, b) => b.previa!.mejor - a.previa!.mejor);
  fijadas.forEach((v, k) => {
    filasImpacto.push({
      etiqueta: `${nombreDe(String(v.vehiculo))} antes del impacto`,
      valor: F.kmhConUnidad(v.previa!.mejor, "reconstruccion"),
      grande: k === 0,
    });
    const rango = k === 0 ? rangoDeVelocidad(v) : null;
    if (rango)
      filasImpacto.push({
        etiqueta: rango.lineal ? "Rango por aproximación lineal" : "Rango",
        valor: F.rangoKmh(rango.p10, rango.p90, "reconstruccion"),
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
        {
          etiqueta: METODO.cesviConReporte,
          valor: F.diferenciaPct(contra.difPct, "metodo"),
          grande: true,
        },
        {
          etiqueta: "Croquis contra el reporte",
          valor: `${F.kmh(contra.croquis, "metodo")} contra ${F.kmhConUnidad(contra.cesvi, "metodo")} · ${F.diferenciaKmh(contra.difKmh, "metodo")}`,
        },
      );
    }
    if (fisica) {
      filas.push(
        {
          etiqueta: METODO.reconstruccion,
          valor:
            fisica.difPct === null
              ? "la evidencia no la fija"
              : F.diferenciaPct(fisica.difPct, "reconstruccion"),
          grande: fisica.difPct !== null,
        },
        {
          etiqueta: `${nombreDe(fisica.vehiculo)} (${fisica.vehiculo}) antes del impacto`,
          valor:
            fisica.croquis === null
              ? `sin velocidad contra ${F.kmhConUnidad(fisica.cesvi, "metodo")}`
              : `${F.kmh(fisica.croquis, "reconstruccion")}${fisica.rango ? ` (${F.rangoKmh(fisica.rango[0], fisica.rango[1], "reconstruccion")})` : ""} contra ${F.kmhConUnidad(fisica.cesvi, "metodo")} · ${F.diferenciaKmh(fisica.difKmh ?? 0, "reconstruccion")}`,
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
