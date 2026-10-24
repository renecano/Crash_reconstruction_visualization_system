/**
 * Los datos de la portada de CESVI (comentario de René, 2026-10-24, punto 4). Todo se calcula al
 * compilar, de `eval/results`, de `data/` y del caso de AXA; nada se escribe a mano. Si falta un
 * dato, el build falla.
 *
 * - **671:** los reportes de CESVI del corpus (`eval/results/cesvi_corpus_extraccion.json`).
 * - **205:** los de la prueba reconstruidos a ciegas (`data/cesvi/r4/pagina.json`, de E-R4).
 * - **58.3 % y 37.2 %:** la modalidad de Croquis contra el título del reporte y la de la regla simple
 *   (siempre alcance), en la prueba (`eval/results/cesvi_r4c_titulo_prueba.json`, v3).
 * - **AXA A2010930:** lo que concluyó CESVI (los valores impresos del caso) contra lo que obtiene
 *   Croquis con el mismo método (`reproducir`), la modalidad que infiere Croquis de la narración
 *   (`modalidadInferida`) y, para la animación, las trayectorias de su reconstrucción con el solver
 *   de producción (`demo/escenas-r11/axa.json`).
 */
import { caso, modalidadInferida, reproducir } from "@croquis/cesvi";
import { reconstruct } from "@croquis/solver-ts";
import corpus from "../../../../eval/results/cesvi_corpus_extraccion.json";
import escenaAxa from "../../../../demo/escenas-r11/axa.json";
import { casoAxa } from "./caso-axa";
import { PAGINA, TITULO } from "./reproduccion-dictamenes";

export interface FilaAxa {
  cesvi: number;
  croquis: number;
  /** (Croquis − CESVI) / CESVI, en %. */
  pct: number;
}

export interface TrazoPortada {
  /** V1, V2…: el del expediente (la escena del solver va en el orden del primer impacto). */
  vehiculo: string;
  /** Antes del impacto: del arranque al impacto (coordenadas del SVG). */
  antes: [number, number][];
  /** Después: del impacto al reposo. */
  despues: [number, number][];
  /** La caja del vehículo en el impacto: centro, largo, ancho y giro (grados). */
  caja: { x: number; y: number; largo: number; ancho: number; giro: number };
}

export interface DatosPortadaCesvi {
  reportes: number;
  aCiegas: number;
  modalidadPct: number;
  reglaPct: number;
  axa: {
    id: string;
    lugar: string;
    modalidad: { cesvi: string; croquis: string | null };
    restos: FilaAxa;
    deformacion: FilaAxa;
    /** El comienzo de la narración del caso, para el ejemplo de «Narra como siempre». */
    narracion: string;
  };
  /** La reconstrucción de AXA vista desde arriba, en un SVG de 1240 × 590. */
  escena: {
    trazos: TrazoPortada[];
    impacto: [number, number];
    calle: { y: number; alto: number; carril: number };
  };
}

const ANCHO = 1240;
const ALTO = 590;
const MARGEN = 90;
const CARRIL_M = 3.5;

const fila = (cesvi: number, croquis: number): FilaAxa => ({
  cesvi,
  croquis,
  pct: (100 * (croquis - cesvi)) / cesvi,
});

/** Las trayectorias de AXA, giradas para que avancen de izquierda a derecha y escaladas al SVG. */
function escenaDeAxa(ids: readonly string[]): DatosPortadaCesvi["escena"] {
  const r = reconstruct(escenaAxa as unknown as Record<string, unknown>);
  const vs = r.vehiculos;
  if (vs.length < 2) throw new Error("La escena de AXA no tiene dos vehículos");
  const k0 = (t: number[]) => t.reduce((m, x, i) => (Math.abs(x) < Math.abs(t[m]!) ? i : m), 0);
  // El sentido de marcha: del arranque al impacto del primero.
  const a = vs[0]!.trajectory;
  const i0 = k0(a.t);
  const ang = Math.atan2(a.y[i0]! - a.y[0]!, a.x[i0]! - a.x[0]!);
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  const girar = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
  const todos = vs.flatMap((v) => v.trajectory.x.map((x, i) => girar(x, v.trajectory.y[i]!)));
  const xs = todos.map((p) => p[0]);
  const ys = todos.map((p) => p[1]);
  const largoMax = Math.max(...vs.map((v) => v.length));
  const x0 = Math.min(...xs) - largoMax / 2;
  const x1 = Math.max(...xs) + largoMax / 2;
  const escala = (ANCHO - 2 * MARGEN) / (x1 - x0);
  const yc = (Math.min(...ys) + Math.max(...ys)) / 2;
  // En el SVG la y crece hacia abajo.
  const svg = (p: [number, number]): [number, number] => [
    MARGEN + (p[0] - x0) * escala,
    ALTO / 2 - (p[1] - yc) * escala,
  ];
  const trazos = vs.map((v, n): TrazoPortada => {
    const t = v.trajectory;
    const k = k0(t.t);
    const pts = t.x.map((x, i) => svg(girar(x, t.y[i]!)));
    const [cx, cy] = pts[k]!;
    return {
      vehiculo: ids[n] ?? v.id,
      antes: pts.slice(0, k + 1),
      despues: pts.slice(k),
      caja: {
        x: cx,
        y: cy,
        largo: v.length * escala,
        ancho: v.width * escala,
        giro: (-(t.yaw[k]! - ang) * 180) / Math.PI,
      },
    };
  });
  // El punto de contacto: entre los dos centros en el impacto, a la mitad.
  const [p, q] = trazos.map((x) => x.caja) as [TrazoPortada["caja"], TrazoPortada["caja"]];
  return {
    trazos,
    impacto: [(p.x + q.x) / 2, (p.y + q.y) / 2],
    calle: { y: ALTO / 2, alto: 2 * CARRIL_M * escala, carril: CARRIL_M * escala },
  };
}

export function datosPortadaCesvi(): DatosPortadaCesvi {
  const c = caso("A2010930");
  const filas = reproducir(c).filas;
  const croquis = (clave: string) => {
    const v = filas.find((f) => f.clave === clave)?.croquis;
    if (typeof v !== "number") throw new Error(`Falta ${clave} en la reproducción de AXA`);
    return v;
  };
  const axa = casoAxa();
  if (!axa.escena) throw new Error("El caso de AXA no trae su escena");
  // La escena del solver pone primero a los del primer impacto, en su orden (`especDeExpediente`).
  const e = axa.escena.expediente;
  const primero = [...(e.impactos ?? [])].sort((x, y) => x.orden - y.orden)[0]?.vehiculos ?? [];
  const ids = [...primero, ...e.vehiculos.map((v) => v.id).filter((v) => !primero.includes(v))];
  const modalidad = modalidadInferida(axa.escena.expediente, axa.narracion ?? "").modalidad;
  const v3 = TITULO.v3.titulo_del_reporte;
  if (v3.croquis.pct === null || v3.linea_base.pct === null)
    throw new Error("Falta la medición de la modalidad contra el título");
  return {
    reportes: corpus.dictamenes,
    aCiegas: PAGINA.dictamenes,
    modalidadPct: v3.croquis.pct,
    reglaPct: v3.linea_base.pct,
    axa: {
      id: c.id,
      lugar: c.lugar.municipio ? `${c.lugar.municipio}, ${c.lugar.estado}` : "",
      modalidad: { cesvi: c.modalidad_dictaminada, croquis: modalidad },
      restos: fila(c.calculos.desplazamiento.reporte.v_kmh.valor, croquis("v3_kmh")),
      deformacion: fila(c.calculos.deformacion_B.reporte.ebs_kmh.valor, croquis("ebs_kmh_datos")),
      narracion: (axa.narracion ?? "").split(/(?<=\.)\s/)[0] ?? "",
    },
    escena: escenaDeAxa(ids),
  };
}
