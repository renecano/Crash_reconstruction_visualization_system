/**
 * «Croquis contra el dictamen» (paso 7 del recorrido, plan v2 §1): punto por punto, lo que concluyó
 * CESVI en el dictamen contra lo que obtuvo Croquis con la descripción técnica del perito y los datos
 * impresos. Cada diferencia numérica va con su valor y su porcentaje; nada se ajusta para que cuadre.
 * El perito concluye: esto solo lo pone a la vista.
 */
import type { CasoCesvi } from "./caso";
import { DISCREPANCIA_A2010930 } from "./discrepancia";

export interface FilaContraDictamen {
  clave: "modalidad" | "deformacion" | "restos" | "dinamica";
  concepto: string;
  /** Lo que concluyó CESVI, en palabras. */
  cesvi: string;
  /** Lo que obtuvo Croquis, en palabras («—» si aún no lo tiene). */
  croquis: string;
  /** (Croquis − CESVI)/CESVI en %, si la fila es numérica y Croquis ya tiene el número. */
  diferenciaPct: number | null;
  /** ¿Llegan a lo mismo? null si Croquis aún no tiene el dato. */
  coincide: boolean | null;
  /** De dónde sale cada lado. */
  fuente: string;
}

export interface DeCroquis {
  /** La modalidad que leyó Croquis en la descripción técnica del perito. */
  modalidad: string | null;
  /** Velocidad de impacto por la deformación, con los datos impresos (km/h). */
  deformacionKmh: number | null;
  /** Velocidad por el desplazamiento de los restos (km/h). */
  restosKmh: number | null;
  /** Separación de los restos en la reconstrucción de Croquis (m). */
  restosM: number | null;
}

export interface ContraDictamen {
  filas: FilaContraDictamen[];
  /** La discrepancia de energía, explicada con lo que se midió (ADR 0048). */
  energia: { dictamen: number; croquis: number; diferenciaPct: number; lectura: string } | null;
  /** Una oración con lo que coincide y lo que difiere, para la conclusión del perito. */
  resumen: string;
}

/** Diferencias menores a esto se reportan como coincidencia al redondeo del dictamen. */
const IGUAL_PCT = 0.005;
/** Cómo se nombra cada punto dentro de una oración. */
const EN_FRASE: Record<FilaContraDictamen["clave"], string> = {
  modalidad: "la modalidad",
  deformacion: "la velocidad por deformación",
  restos: "la velocidad por restos",
  dinamica: "la dinámica del impacto",
};
const pct = (croquis: number, cesvi: number) => (100 * (croquis - cesvi)) / cesvi;
const kmh = (x: number) => `${x.toFixed(2)} km/h`;
const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export function croquisContraDictamen(c: CasoCesvi, d: DeCroquis): ContraDictamen {
  const def = c.calculos.deformacion_B.reporte.ebs_kmh.valor;
  const des = c.calculos.desplazamiento.reporte.v_kmh.valor;
  const restos = c.evidencia.restos.distancia_m.valor;
  const numerica = (
    clave: FilaContraDictamen["clave"],
    concepto: string,
    cesvi: number,
    croquis: number | null,
    texto: (x: number) => string,
    fuente: string,
  ): FilaContraDictamen => {
    const dif = croquis === null ? null : pct(croquis, cesvi);
    return {
      clave,
      concepto,
      cesvi: texto(cesvi),
      croquis: croquis === null ? "—" : texto(croquis),
      diferenciaPct: dif,
      coincide: dif === null ? null : Math.abs(dif) < IGUAL_PCT,
      fuente,
    };
  };
  const modalidadCoincide =
    d.modalidad === null ? null : normal(d.modalidad).includes(normal(c.modalidad_dictaminada));
  const filas: FilaContraDictamen[] = [
    {
      clave: "modalidad",
      concepto: "Modalidad",
      cesvi: c.modalidad_dictaminada,
      croquis: d.modalidad ?? "—",
      diferenciaPct: null,
      coincide: modalidadCoincide,
      fuente: "Conclusión del dictamen · lectura de la descripción técnica del perito",
    },
    numerica(
      "deformacion",
      `Velocidad por deformación (${c.vehiculos.B.tipo})`,
      def,
      d.deformacionKmh,
      kmh,
      "EBS del dictamen · EBS de Croquis con L, A, B y C1–C4 impresos",
    ),
    numerica(
      "restos",
      `Velocidad por restos (${c.vehiculos.A.tipo})`,
      des,
      d.restosKmh,
      kmh,
      "√(2·a·g·D) del dictamen · el mismo método en Croquis",
    ),
    numerica(
      "dinamica",
      `Dinámica del impacto: ${c.vehiculos.B.tipo} alcanza a ${c.vehiculos.A.tipo} y la desplaza`,
      restos,
      d.restosM,
      (x) => `${x.toFixed(2)} m de restos`,
      "Separación de los restos del dictamen · reconstrucción de Croquis en el mapa",
    ),
  ];
  const r = DISCREPANCIA_A2010930;
  const energia =
    c.id === "A2010930"
      ? {
          dictamen: r.energiaReporte,
          croquis: r.energiaDatosImpresos,
          diferenciaPct: r.diferenciaPct,
          lectura: r.lectura,
        }
      : null;
  const coinciden = filas.filter((f) => f.coincide === true).map((f) => EN_FRASE[f.clave]);
  const difieren = filas
    .filter((f) => f.coincide === false)
    .map((f) =>
      f.diferenciaPct === null
        ? EN_FRASE[f.clave]
        : `${EN_FRASE[f.clave]} (${f.diferenciaPct >= 0 ? "+" : "−"}${Math.abs(f.diferenciaPct).toFixed(2)} %)`,
    );
  const resumen = [
    coinciden.length ? `Croquis llega a lo mismo que el dictamen en ${lista(coinciden)}.` : null,
    difieren.length ? `Difiere en ${lista(difieren)}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { filas, energia, resumen: resumen || "Croquis aún no tiene los datos para comparar." };
}

function lista(xs: string[]): string {
  return xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)!}`;
}
