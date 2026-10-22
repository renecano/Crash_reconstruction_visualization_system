/**
 * La tabla «Reproducción del reporte»: cada número del reporte junto al que calcula Croquis con el
 * mismo método, con la diferencia absoluta y en porcentaje. Nada se ajusta para que cuadre: la
 * energía de la Tacoma con los datos impresos no da la del reporte, y la tabla lo muestra (ADR 0048).
 */
import type { CasoCesvi } from "./caso";
import { ebs, mcHenry, velocidadDesplazamiento } from "./metodo";

export interface FilaReproduccion {
  clave: string;
  concepto: string;
  unidad: string;
  /** El número como lo imprime el reporte. */
  reporte: number;
  /** Decimales con que lo imprime (para saber si coincide al redondeo). */
  decimalesReporte: number;
  croquis: number;
  diferencia: number;
  /** (Croquis − reporte) / reporte, en %. */
  diferenciaPct: number;
  /**
   * Croquis da el número del reporte con sus decimales: redondeando o truncando (el dictamen
   * A2010930 trunca la EBS en m/s: 17.542093 → 17.5420). `null` si no coincide de ninguna forma.
   */
  coincide: "redondeo" | "truncamiento" | null;
  /** De dónde sale el número de Croquis. */
  partida: string;
}

function decimales(texto: string): number {
  const m = /\.(\d+)/.exec(texto);
  return m ? m[1]!.length : 0;
}

function fila(
  clave: string,
  concepto: string,
  unidad: string,
  reporte: number,
  textoReporte: string,
  croquis: number,
  partida: string,
): FilaReproduccion {
  const d = decimales(textoReporte);
  const diferencia = croquis - reporte;
  const escala = 10 ** d;
  const iguales = (x: number) => Math.abs(x - reporte) < 0.5 / escala / 1000;
  const coincide = iguales(Number(croquis.toFixed(d)))
    ? "redondeo"
    : iguales(Math.trunc(croquis * escala + 1e-9) / escala)
      ? "truncamiento"
      : null;
  return {
    clave,
    concepto,
    unidad,
    reporte,
    decimalesReporte: d,
    croquis,
    diferencia,
    diferenciaPct: (100 * diferencia) / reporte,
    coincide,
    partida,
  };
}

/** El número tal como aparece en la cita del reporte (para contar sus decimales). */
function impreso(cita: string, valor: number): string {
  const encontrado = cita.match(/\d+(?:\.\d+)?/g)?.find((t) => Number(t) === valor);
  return encontrado ?? String(valor);
}

export interface Reproduccion {
  filas: FilaReproduccion[];
  /** Energía con los datos impresos, para la explicación de la discrepancia. */
  energiaDatosImpresos: number;
}

export function reproducir(c: CasoCesvi): Reproduccion {
  const d = c.calculos.deformacion_B;
  const masaKg = c.vehiculos.B.masa_kg?.valor;
  if (masaKg === undefined) throw new Error("El caso no trae la masa del vehículo B");
  // Masa en toneladas con energía en kJ, como en el dictamen.
  const masaT = masaKg / 1000;
  const energia = mcHenry({
    L: d.L_m.valor,
    A: d.A.valor,
    B: d.B.valor,
    C: d.C_m.map((x) => x.valor),
  }).energia;
  const r = d.reporte;
  const desdeReporte = ebs(r.energia.valor, masaT);
  const desdeDatos = ebs(energia, masaT);
  const dz = c.calculos.desplazamiento;
  const v3 = velocidadDesplazamiento(dz.a.valor, dz.g_ms2.valor, dz.D_m.valor);
  const pReporte = "Partiendo de la energía que imprime el reporte";
  const pDatos = `Con los datos impresos: L, A, B y las ${d.C_m.length} medidas C`;
  const pDesplazamiento = "Con D, a y g del reporte";
  return {
    energiaDatosImpresos: energia,
    filas: [
      fila(
        "energia",
        "Energía de deformación de la Tacoma",
        "kJ",
        r.energia.valor,
        impreso(r.energia.cita, r.energia.valor),
        energia,
        pDatos,
      ),
      fila(
        "ebs_ms_reporte",
        "EBS de la Tacoma",
        "m/s",
        r.ebs_ms.valor,
        impreso(r.ebs_ms.cita, r.ebs_ms.valor),
        desdeReporte.ms,
        pReporte,
      ),
      fila(
        "ebs_kmh_reporte",
        "Velocidad de impacto de la Tacoma",
        "km/h",
        r.ebs_kmh.valor,
        impreso(r.ebs_kmh.cita, r.ebs_kmh.valor),
        desdeReporte.kmh,
        pReporte,
      ),
      fila(
        "ebs_kmh_datos",
        "Velocidad de impacto de la Tacoma",
        "km/h",
        r.ebs_kmh.valor,
        impreso(r.ebs_kmh.cita, r.ebs_kmh.valor),
        desdeDatos.kmh,
        pDatos,
      ),
      fila(
        "v3_ms",
        "Velocidad por desplazamiento",
        "m/s",
        dz.reporte.v_ms.valor,
        impreso(dz.reporte.v_ms.cita, dz.reporte.v_ms.valor),
        v3.ms,
        pDesplazamiento,
      ),
      fila(
        "v3_kmh",
        "Velocidad por desplazamiento",
        "km/h",
        dz.reporte.v_kmh.valor,
        impreso(dz.reporte.v_kmh.cita, dz.reporte.v_kmh.valor),
        v3.kmh,
        pDesplazamiento,
      ),
    ],
  };
}
