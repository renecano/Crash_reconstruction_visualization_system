/**
 * El hecho en el rediseño «Laboratorio» (prompt §8): el título generado del relato, su meta y el
 * relato con lo que Croquis leyó marcado por estilo (vehículos, daños, lugar y vía, medidas). Todo
 * sale del expediente, de la lectura con sus citas y del texto; nada se inventa.
 */
import type { DatoLeidoEscena, Expediente } from "@croquis/cesvi";
import { callesNarradas } from "./escena-facil";

export type TipoMarca = DatoLeidoEscena["tipo"];
export interface TramoRelato {
  texto: string;
  tipo: TipoMarca | null;
  /** El vehículo de la marca («V1»), para enlazarla con su tarjeta. */
  vehiculo: string | null;
}

const MODALIDADES: Record<string, string> = {
  alcance: "Alcance",
  crucero: "Crucero",
  lateral: "Choque lateral",
  frontal: "Choque frontal",
  angulo: "Choque en ángulo",
  volcadura: "Volcadura",
  salida_del_camino: "Salida del camino",
  atropello: "Atropello",
  objeto_fijo: "Choque contra objeto fijo",
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * El título del hecho: su modalidad y dónde fue, generado del relato («Alcance en la carretera
 * México-Nogales, km 47+800»; «Crucero en calle Azucena y Av. Reforma»). Sin vía en el relato, el
 * municipio; sin nada, «El hecho».
 */
export function tituloDelHecho(e: Expediente, narracion: string | null): string {
  const m = e.caso.modalidades?.[0];
  const modalidad = m ? (MODALIDADES[m] ?? capital(m.replaceAll("_", " "))) : "Hecho";
  const calles = narracion ? callesNarradas(narracion).map((c) => c.nombre) : [];
  const km = narracion?.match(/\bkm\.?\s*\d+(?:\s*\+\s*\d+)?/i)?.[0].replace(/\s+/g, " ");
  const esCarretera = calles[0] && /^(carretera|autopista|perif)/i.test(calles[0]);
  if (calles.length && esCarretera) return `${modalidad} en la ${calles[0]}${km ? `, ${km}` : ""}`;
  if (calles.length >= 2) return `${modalidad} en ${calles[0]} y ${calles[1]}`;
  if (calles.length === 1) return `${modalidad} en ${calles[0]}${km ? `, ${km}` : ""}`;
  const municipio = e.caso.lugar?.municipio?.valor;
  if (municipio) return `${modalidad} en ${municipio}`;
  return m ? modalidad : "El hecho";
}

/** La meta del título: municipio y estado, el tramo, y cuántos vehículos e impactos. */
export function metaDelHecho(e: Expediente, narracion: string | null): string[] {
  const l = e.caso.lugar;
  const lugar = [l?.municipio?.valor, l?.estado?.valor].filter(Boolean).join(", ");
  const tramo = narracion?.match(/\btramo\s+([^,.;]+)/i)?.[1]?.trim();
  const n = e.vehiculos.length;
  const i = e.impactos?.length ?? 0;
  return [
    lugar,
    tramo ? `Tramo ${tramo}` : "",
    `${n} ${n === 1 ? "vehículo" : "vehículos"} · ${i} ${i === 1 ? "impacto" : "impactos"}`,
  ].filter(Boolean);
}

const PRIORIDAD: Record<TipoMarca, number> = { lugar: 1, dano: 2, vehiculo: 3, medida: 4 };
const MEDIDA = /\b\d+(?:[.,]\d+)?\s*(?:m|cm|metros|centímetros|km\/h|kg)\b/gi;

/**
 * El relato con sus marcas, en tramos: lo que Croquis leyó (cada cita literal, una vez), las
 * menciones de cada vehículo («vehículo A», su modelo) y las medidas con unidad. Si dos marcas se
 * pisan, gana la más específica (medida > vehículo > daño > lugar). `datos` cuenta lo marcado.
 */
export function marcarRelato(
  texto: string,
  lectura: readonly DatoLeidoEscena[],
  vehiculos: readonly { id: string; nombres: readonly string[] }[],
): { tramos: TramoRelato[]; datos: number; porTipo: Record<TipoMarca, number> } {
  const n = texto.length;
  const tipo: (TipoMarca | null)[] = new Array(n).fill(null);
  const veh: (string | null)[] = new Array(n).fill(null);
  const porTipo: Record<TipoMarca, number> = { vehiculo: 0, dano: 0, lugar: 0, medida: 0 };
  const marcar = (ini: number, fin: number, t: TipoMarca, v: string | null) => {
    for (let k = ini; k < fin; k++) {
      const actual = tipo[k] ?? null;
      if (actual === null || PRIORIDAD[t] > PRIORIDAD[actual]) {
        tipo[k] = t;
        veh[k] = v;
      }
    }
  };
  let datos = 0;
  for (const d of lectura) {
    const i = texto.indexOf(d.cita);
    if (i < 0) continue;
    marcar(i, i + d.cita.length, d.tipo, d.vehiculo);
    porTipo[d.tipo]++;
    datos++;
  }
  // Las menciones de cada vehículo: «vehículo A (Toyota Tacoma)» y su modelo suelto.
  vehiculos.forEach((v, k) => {
    const letra = String.fromCharCode(65 + k);
    const patrones = [
      `veh[ií]culo\\s+${letra}\\b(?:\\s*\\([^)]{1,40}\\))?`,
      ...v.nombres
        .filter((x) => x.trim().length > 2)
        .map((x) => `\\b${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
    ];
    for (const p of patrones)
      for (const m of texto.matchAll(new RegExp(p, "g"))) {
        marcar(m.index!, m.index! + m[0].length, "vehiculo", v.id);
      }
  });
  for (const m of texto.matchAll(MEDIDA)) {
    marcar(m.index!, m.index! + m[0].length, "medida", null);
    porTipo.medida++;
    datos++;
  }
  porTipo.vehiculo = Math.max(porTipo.vehiculo, vehiculos.length);
  const tramos: TramoRelato[] = [];
  for (let k = 0; k < n; k++) {
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo.tipo === tipo[k] && ultimo.vehiculo === veh[k]) ultimo.texto += texto[k];
    else tramos.push({ texto: texto[k]!, tipo: tipo[k]!, vehiculo: veh[k]! });
  }
  return { tramos, datos: datos + vehiculos.length, porTipo };
}

const CARA: Record<string, string> = {
  frontal: "frontal",
  posterior: "posterior",
  lateral_izquierdo: "en el costado izquierdo",
  lateral_derecho: "en el costado derecho",
  techo: "en el techo",
  inferior: "en la parte inferior",
};

/**
 * El daño principal de un vehículo en palabras («Daño posterior, hacia la izquierda»): su primer
 * daño (sin los previos), con el lado del vértice si lo hay. null si no tiene daños.
 */
export function textoDano(e: Expediente, vehiculo: string): string | null {
  const d = (e.danos ?? []).find((x) => x.vehiculo === vehiculo && !x.dano_previo);
  if (!d) return null;
  const cara = CARA[d.zona.cara] ?? d.zona.cara.replaceAll("_", " ");
  const v = d.zona.vertice ?? "";
  const lado = /izquierd/.test(v)
    ? ", hacia la izquierda"
    : /derech/.test(v)
      ? ", hacia la derecha"
      : "";
  return `Daño ${cara}${lado}`;
}
