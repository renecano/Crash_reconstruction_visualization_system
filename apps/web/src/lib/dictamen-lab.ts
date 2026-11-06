/**
 * El acto del Dictamen en el rediseño «Laboratorio» (prompt §8): lo que muestra la hoja de papel y
 * las citas que el perito puede insertar en su conclusión. Croquis no redacta la conclusión: solo
 * inserta datos con su referencia, y solo al pedirlo el perito.
 */
import type { Reconstruccion, SupuestoDeclarado } from "@croquis/cesvi";
import { conSigno, pctConSigno, type CifraContraste } from "./contraste-lab";
import { rangoDeImpacto } from "./reconstruccion-lab";

const f1 = (x: number) => x.toFixed(1);

export interface FilaHoja {
  etiqueta: string;
  valor: string;
}

/** Los resultados de la hoja: cada velocidad al impacto con su rango y la comparación con CESVI. */
export function filasDeLaHoja(
  r: Reconstruccion,
  letraDe: (id: string) => string,
  contra: CifraContraste | null,
): FilaHoja[] {
  const filas: FilaHoja[] = r.velocidades.map((v) => {
    const i = v.impacto;
    const etiqueta = `${letraDe(String(v.vehiculo))} al impacto`;
    if (i?.p50 === undefined) return { etiqueta, valor: "la evidencia no la fija" };
    const r10 = rangoDeImpacto(v);
    const rango = r10 ? ` · ${f1(r10.p10)}–${f1(r10.p90)}${r10.lineal ? " (lineal)" : ""}` : "";
    return { etiqueta, valor: `${f1(i.p50)} km/h${rango}` };
  });
  if (contra) {
    filas.push(
      {
        etiqueta: `${letraDe(contra.vehiculo)} por deformación`,
        valor: `${contra.croquis.toFixed(2)} km/h`,
      },
      {
        etiqueta: "Contra CESVI",
        valor: `Δ ${pctConSigno(contra.difPct)} · ${conSigno(contra.difKmh)} km/h`,
      },
    );
  }
  return filas;
}

/** La cita de la velocidad al impacto, con su rango y su método. */
export function citaVelocidad(r: Reconstruccion, id: string, nombre: string): string | null {
  const v = r.velocidades.find((x) => String(x.vehiculo) === id);
  const i = v?.impacto;
  if (i?.p50 === undefined) return null;
  const r10 = v ? rangoDeImpacto(v) : null;
  const rango = r10
    ? r10.lineal
      ? ` (rango por aproximación lineal: ${f1(r10.p10)}–${f1(r10.p90)})`
      : ` (p10–p90: ${f1(r10.p10)}–${f1(r10.p90)})`
    : "";
  return `Velocidad de ${nombre} al impacto: ${f1(i.p50)} km/h${rango}, según la reconstrucción física de Croquis.`;
}

/** La cita de la comparación: las dos cifras y la diferencia, con su valor y su porcentaje. */
export function citaContraste(c: CifraContraste, nombre: string): string {
  return `Por deformación, ${nombre}: Croquis ${c.croquis.toFixed(2)} km/h con las medidas del reporte y el reporte de CESVI ${c.cesvi.toFixed(2)} km/h; diferencia de ${conSigno(c.difKmh)} km/h (${pctConSigno(c.difPct)}).`;
}

/** La cita de los supuestos que entraron a la reconstrucción. */
export function citaSupuestos(supuestos: readonly SupuestoDeclarado[]): string | null {
  if (!supuestos.length) return null;
  return `Supuestos declarados: ${supuestos.map((s) => `${s.que}: ${s.valor}`).join("; ")}.`;
}

/** El texto con la cita en el lugar del cursor, separada de lo que ya estaba. */
export function insertarCita(
  texto: string,
  cita: string,
  ini: number,
  fin: number,
): { texto: string; cursor: number } {
  const antes = texto.slice(0, ini);
  const despues = texto.slice(fin);
  const izq = antes && !/\s$/.test(antes) ? " " : "";
  const der = despues && !/^\s/.test(despues) ? " " : "";
  const pegado = `${izq}${cita}${der}`;
  return { texto: `${antes}${pegado}${despues}`, cursor: antes.length + pegado.length };
}

/** La narración de la hoja, recortada en una palabra entera. */
export function narracionCorta(narracion: string, max = 240): string {
  const t = narracion.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, t.lastIndexOf(" ", max))}…`;
}

/** Lo que lleva el archivo, en su orden: es lo que cambia entre los dos formatos. */
export const SECCIONES_DICTAMEN = {
  cesvi: [
    "Objetivos",
    "Fundamentos",
    "Características de los vehículos",
    "Daños",
    "Lugar",
    "Consideraciones",
    "Conclusiones",
    "Validación",
  ],
  completo: [
    "Narración",
    "Vehículos y daños",
    "Reconstrucción física",
    "Croquis",
    "Verificación con el método de CESVI",
    "Conclusión",
    "Validación",
  ],
} as const;
