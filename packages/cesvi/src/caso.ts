/**
 * Un reporte de CESVI como datos (`data/cesvi/casos/<id>.json`), sin placas, VIN ni nombres de
 * personas (docs/cesvi/PROTOTIPO.md). Cada valor trae su cita literal del dictamen; `caso.test.ts`
 * las busca en el lote original cuando está en la máquina (el lote no se versiona).
 */
import A2010930 from "../../../data/cesvi/casos/A2010930.json";

export interface Citado<T> {
  valor: T;
  cita: string;
}

export interface Dano {
  zona: string;
  acento?: string;
  descripcion: string;
  cita: string;
}

export interface Vehiculo {
  marca: string;
  tipo: string;
  modelo: number;
  color: string;
  /** Nunca la placa real: «omitidas» o «no disponibles en el reporte». */
  placas: string;
  servicio: string;
  cita: string;
  masa_kg?: Citado<number>;
  danos: Dano[];
}

export interface CasoCesvi {
  _fuente: { lote: string; documento: string; nota: string };
  id: string;
  aseguradora: string;
  modalidad_dictaminada: string;
  fecha_hora: Citado<string> & { aproximada: boolean };
  fecha_dictamen: Citado<string>;
  /** Sin el nombre del perito: «perito de CESVI (nombre omitido)». */
  autor_dictamen: string;
  objetivo: Citado<string>;
  lugar: {
    descripcion: string;
    cita: string;
    kilometro: string;
    municipio: string;
    estado: string;
    arroyos: { sentido: string; hacia: string }[];
    ancho_arroyo_m: Citado<number>;
    separacion: Citado<string>;
    carpeta: Citado<string>;
  };
  vehiculos: { A: Vehiculo; B: Vehiculo };
  declaracion: { conductor: "A" | "B"; texto: string; cita: string };
  evidencia: { restos: { descripcion: string; distancia_m: Citado<number> } };
  calculos: {
    deformacion_B: {
      metodo: string;
      L_m: Citado<number>;
      A: Citado<number> & { unidad_impresa: string };
      B: Citado<number> & { unidad_impresa: string };
      C_m: Citado<number>[];
      reporte: { energia: Citado<number>; ebs_ms: Citado<number>; ebs_kmh: Citado<number> };
    };
    desplazamiento: {
      D_m: Citado<number>;
      a: Citado<number>;
      g_ms2: Citado<number>;
      reporte: { v_ms: Citado<number>; v_kmh: Citado<number> };
    };
  };
  conclusiones: { n: number; texto: string; cita: string }[];
  razonamiento: { clave: string; texto: string; cita: string }[];
}

export const CASOS: Readonly<Record<string, CasoCesvi>> = {
  A2010930: A2010930 as CasoCesvi,
};

export const CASO_INICIAL = "A2010930";

export function caso(id: string): CasoCesvi {
  const c = CASOS[id];
  if (!c) throw new Error(`No hay un caso ${id}`);
  return c;
}
