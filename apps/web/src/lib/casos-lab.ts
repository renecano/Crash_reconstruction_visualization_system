/**
 * La lista de casos en el rediseño «Laboratorio» (prompt §8): la línea de estado, los filtros con
 * conteo real, el estado de cada reporte y su mini croquis, generado de su modalidad.
 */
import type { ComparacionDictamen } from "@croquis/cesvi";
import { cifraContraste, pctConSigno } from "./contraste-lab";

/** «7 reportes de CESVI de ejemplo · aún no guardas casos propios en este equipo». */
export function lineaDeEstado(reportes: number, guardados: number | null): string {
  const r = `${reportes} ${reportes === 1 ? "reporte" : "reportes"} de CESVI de ejemplo`;
  if (guardados === null) return r;
  if (!guardados) return `${r} · aún no guardas casos propios en este equipo`;
  return `${r} · ${guardados} ${guardados === 1 ? "caso guardado" : "casos guardados"} en este equipo`;
}

export interface Filtro {
  clave: string;
  nombre: string;
  n: number;
}

/** «Todos» y una opción por modalidad presente, de la más a la menos frecuente. */
export function filtrosDeReportes(reportes: readonly { modalidad: string }[]): Filtro[] {
  const cuenta = new Map<string, number>();
  for (const r of reportes) cuenta.set(r.modalidad, (cuenta.get(r.modalidad) ?? 0) + 1);
  const modalidades = [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .map(([clave, n]) => ({ clave, nombre: clave, n }));
  return [{ clave: "todos", nombre: "Todos", n: reportes.length }, ...modalidades];
}

export function filtrar<T extends { modalidad: string }>(
  reportes: readonly T[],
  filtro: string,
): readonly T[] {
  return filtro === "todos" ? reportes : reportes.filter((r) => r.modalidad === filtro);
}

/**
 * El estado de un reporte con lo que midió la comparación: la diferencia de su velocidad si Croquis
 * la calcula; si no, si la modalidad coincide. Nunca una cifra que no esté en la comparación.
 */
export function estadoDeReporte(k: ComparacionDictamen | undefined): string {
  if (!k) return "Sin comparar";
  const c = cifraContraste(k);
  if (c) return `Reproducido · Δ ${pctConSigno(c.difPct)}`;
  if (k.modalidad.coincide === true) return "Modalidad coincide";
  if (k.modalidad.coincide === false) return "Modalidad distinta";
  return "Sin modalidad concluida";
}

export interface PiezaMini {
  x: number;
  y: number;
  /** Grados, en el sentido del reloj; 0 apunta a la derecha. */
  rumbo: number;
  tipo: "golpea" | "golpeado" | "objeto";
}

export interface MiniCroquis {
  piezas: PiezaMini[];
  impacto: { x: number; y: number };
  /** Hay una segunda vía que cruza. */
  cruce: boolean;
}

/**
 * El mini croquis de un caso, en una caja de 120 × 72: la configuración de su modalidad y el número
 * de vehículos. Es un esquema del tipo de choque: no lleva posiciones del caso ni va a escala.
 */
export function miniCroquis(modalidad: string, vehiculos: number): MiniCroquis {
  const m = modalidad.toLowerCase();
  const cx = 60;
  const cy = 36;
  const carro = (x: number, y: number, rumbo: number, tipo: PiezaMini["tipo"]): PiezaMini => ({
    x,
    y,
    rumbo,
    tipo,
  });
  if (m.includes("objeto") || m.includes("salida") || m.includes("volcadura")) {
    return {
      piezas: [carro(cx - 17, cy, 0, "golpea"), carro(cx + 6, cy, 0, "objeto")],
      impacto: { x: cx - 3, y: cy },
      cruce: false,
    };
  }
  if (m.includes("lateral") || m.includes("crucero")) {
    return {
      piezas: [carro(cx, cy - 18, 90, "golpea"), carro(cx, cy + 4, 0, "golpeado")],
      impacto: { x: cx, y: cy - 4 },
      cruce: true,
    };
  }
  if (m.includes("frontal")) {
    return {
      piezas: [carro(cx - 15, cy, 0, "golpea"), carro(cx + 15, cy, 180, "golpeado")],
      impacto: { x: cx, y: cy },
      cruce: false,
    };
  }
  if (m.includes("alcance") || m.includes("carambola") || vehiculos > 2) {
    // En fila: cada uno alcanza al de adelante.
    const n = Math.max(2, Math.min(vehiculos, 4));
    const paso = 24;
    const ini = cx - ((n - 1) * paso) / 2;
    return {
      piezas: Array.from({ length: n }, (_, k) =>
        carro(ini + k * paso, cy, 0, k === 0 ? "golpea" : "golpeado"),
      ),
      impacto: { x: ini + paso / 2, y: cy },
      cruce: false,
    };
  }
  if (vehiculos <= 1) {
    return {
      piezas: [carro(cx - 6, cy, 0, "golpea")],
      impacto: { x: cx + 9, y: cy },
      cruce: false,
    };
  }
  return {
    piezas: [carro(cx - 15, cy, 0, "golpea"), carro(cx + 12, cy, 0, "golpeado")],
    impacto: { x: cx - 1, y: cy },
    cruce: false,
  };
}
