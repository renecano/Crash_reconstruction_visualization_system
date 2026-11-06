/**
 * El acto «Contra CESVI» del rediseño «Laboratorio» (prompt §8): los criterios con su conteo, la
 * velocidad comparable con su diferencia en km/h y en %, y la regla con los dos marcadores. Toda
 * diferencia con un reporte de CESVI se muestra con su valor y su porcentaje.
 */
import type { ComparacionDictamen, ContraMetodosCesvi } from "@croquis/cesvi";
import { MODALIDAD } from "./nombres-cesvi";
import { textoPosicionesFinales } from "./textos-caso";

export type EstadoCriterio = "coincide" | "difiere" | "sin_dato";

export interface CriterioContraste {
  clave: "modalidad" | "zonas" | "secuencia" | "posiciones";
  nombre: string;
  detalle: string;
  estado: EstadoCriterio;
}

const estado = (ok: boolean | null): EstadoCriterio =>
  ok === null ? "sin_dato" : ok ? "coincide" : "difiere";
const modalidad = (m: string | null) => (m ? (MODALIDAD[m] ?? m.replaceAll("_", " ")) : "sin dato");

/** Los cuatro criterios de la comparación, en palabras. */
export function criteriosContraste(k: ComparacionDictamen): CriterioContraste[] {
  const { zonas: z, secuencia: s, posiciones: p } = k;
  return [
    {
      clave: "modalidad",
      nombre: "Modalidad",
      detalle: `CESVI: ${modalidad(k.modalidad.cesvi)} · Croquis: ${modalidad(k.modalidad.croquis)}`,
      estado: estado(k.modalidad.coincide),
    },
    {
      clave: "zonas",
      nombre: "Zonas de contacto",
      detalle: z.cesvi
        ? `${z.coinciden} de ${z.cesvi}${z.tercios_comparables ? ` · tercios ${z.tercios_coinciden} de ${z.tercios_comparables}` : ""}`
        : "El reporte no las registra",
      estado: z.cesvi ? estado(z.coinciden === z.cesvi) : "sin_dato",
    },
    {
      clave: "secuencia",
      nombre: "Primer impacto",
      detalle:
        s.cesvi > 1
          ? `Secuencia de ${s.cesvi} impactos${s.completa_coincide === null ? "" : s.completa_coincide ? ": completa, coincide" : ": completa, no coincide"}`
          : s.cesvi === 1
            ? "Un solo impacto"
            : "El reporte no lo registra",
      estado: estado(s.primero_coincide),
    },
    {
      clave: "posiciones",
      nombre: "Posiciones finales",
      detalle: textoPosicionesFinales(p),
      estado: p.cesvi ? estado(p.croquis_las_tiene === p.cesvi) : "sin_dato",
    },
  ];
}

/** Cuántos coinciden, difieren y no tienen dato. */
export function conteoCriterios(c: readonly CriterioContraste[]) {
  const n = (e: EstadoCriterio) => c.filter((x) => x.estado === e).length;
  return { coinciden: n("coincide"), difieren: n("difiere"), sinDato: n("sin_dato") };
}

export interface CifraContraste {
  vehiculo: string;
  que: string;
  croquis: number;
  cesvi: number;
  /** Croquis − CESVI, con su signo. */
  difKmh: number;
  difPct: number;
}

/** Una diferencia con su signo: «+0.75», «−13.94». */
export const conSigno = (x: number, decimales = 2): string =>
  `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(decimales)}`;

/** «+1.19 %». */
export const pctConSigno = (x: number): string => `${conSigno(x)} %`;

/** La velocidad comparable: la primera por deformación que Croquis también calcula. */
export function cifraContraste(k: ComparacionDictamen): CifraContraste | null {
  const v = k.velocidades.find((x) => x.croquis_kmh !== null);
  if (!v || v.croquis_kmh === null) return null;
  return {
    vehiculo: String(v.vehiculo),
    que: v.que,
    croquis: v.croquis_kmh,
    cesvi: v.cesvi_kmh,
    difKmh: v.croquis_kmh - v.cesvi_kmh,
    difPct: v.error_pct ?? 0,
  };
}

/**
 * La otra lectura de Contra CESVI: la velocidad que resuelve la reconstrucción física, con su rango,
 * contra la misma cifra del reporte. No miden lo mismo, y `porQue` lo explica. null si el caso no
 * tiene una velocidad del reporte por deformación para ese vehículo.
 */
export interface LecturaFisica {
  vehiculo: string;
  /** null: la evidencia no la fija. */
  croquis: number | null;
  rango: [number, number] | null;
  cesvi: number;
  difKmh: number | null;
  difPct: number | null;
  porQue: string;
}

export function lecturaFisica(
  contra: ContraMetodosCesvi | null,
  vehiculo: string | null,
): LecturaFisica | null {
  const deformacion = (contra?.filas ?? []).filter((x) => x.metodo.startsWith("Deformación"));
  const f = deformacion.find((x) => String(x.vehiculo) === vehiculo) ?? deformacion[0];
  if (!f) return null;
  return {
    vehiculo: String(f.vehiculo),
    croquis: f.croquisKmh,
    rango: f.croquisRango,
    cesvi: f.cesviKmh,
    difKmh: f.diferenciaKmh,
    difPct: f.diferenciaPct,
    porQue: f.porQue,
  };
}

/** Un texto con el id del vehículo cambiado por su letra («la masa de B sola»). */
export const conLetra = (texto: string, id: string, letra: string): string =>
  texto.replace(new RegExp(`\\b${id}\\b`, "g"), letra);

export interface ReglaContraste {
  /** Las marcas con número y su posición en %. */
  marcas: { kmh: number; pos: number }[];
  /** Los dos marcadores, en %. */
  croquis: number;
  cesvi: number;
  /** Dónde cae cualquier valor de la regla, en %. */
  pos: (kmh: number) => number;
}

/** La regla: de 2 en 2 km/h (o más, si la diferencia es grande), con los dos valores adentro. */
export function reglaContraste(
  croquis: number,
  cesvi: number,
  abarca: readonly number[] = [],
): ReglaContraste {
  const min = Math.min(croquis, cesvi, ...abarca);
  const max = Math.max(croquis, cesvi, ...abarca);
  const paso = max - min <= 8 ? 2 : Math.ceil((max - min) / 4 / 5) * 5;
  const ini = Math.floor((min - paso) / paso) * paso;
  const fin = Math.max(Math.ceil((max + paso) / paso) * paso, ini + 4 * paso);
  const pos = (x: number) => Number((((x - ini) / (fin - ini)) * 100).toFixed(2));
  const marcas: ReglaContraste["marcas"] = [];
  for (let k = ini; k <= fin + 1e-9; k += paso) marcas.push({ kmh: k, pos: pos(k) });
  return { marcas, croquis: pos(croquis), cesvi: pos(cesvi), pos };
}
