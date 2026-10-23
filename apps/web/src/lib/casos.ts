/**
 * Los casos de /cesvi como una sola aplicación (ADR 0079): la lista (caso nuevo, cargar un reporte,
 * los guardados en este equipo y los de ejemplo), sus rutas y lo que abre el recorrido de cada uno.
 *
 * Los casos guardados viven en el navegador del perito (`localStorage`), con el mismo archivo de
 * caso que descarga (ADR 0075); nada se manda a un servidor. El almacén se inyecta para probarlo.
 */
import { CASO_INICIAL, problemasExpediente, type EscenaNarrada } from "@croquis/cesvi";
import {
  leerCasoGuardado,
  type CasoGuardado,
  type ReporteCesvi,
  type ValidacionPerito,
} from "./caso-guardado";
// Solo el tipo: los 205 casos de la reproducción no deben entrar al código del navegador.
import type { CasoReproduccion } from "./reproduccion-dictamenes";

/** El nombre corto de un reporte de la reproducción, sin datos del reporte. */
export const nombreCaso = (id: string) => `Reporte ${id.replace("cesvi-", "").slice(0, 6)}`;

export const RUTAS = {
  lista: "/cesvi",
  axa: `/cesvi/casos/${CASO_INICIAL.toLowerCase()}`,
  nuevo: "/cesvi/casos/nuevo",
  importar: "/cesvi/casos/importar",
  reporte: (id: string) => `/cesvi/casos/reporte/${id}`,
  guardado: (id: string) => `/cesvi/casos/guardado/${id}`,
  reproduccion: "/cesvi/reproduccion",
} as const;

export type OrigenCaso = "nuevo" | "importado" | "reporte" | "guardado";

/** Un caso de expediente abierto en el recorrido: nuevo, importado, de la reproducción o guardado. */
export interface CasoExpediente {
  id: string;
  origen: OrigenCaso;
  titulo: string;
  /** La narración técnica (null en un reporte importado: su texto es el reporte). */
  narracion: string | null;
  /** La escena leída (null en un caso nuevo que aún no se lee). */
  escena: EscenaNarrada | null;
  /** El reporte de CESVI, si lo hay: con él aparece el paso «Croquis contra el reporte». */
  reporte: ReporteCesvi | null;
  validacion: ValidacionPerito | null;
}

export const casoNuevo = (): CasoExpediente => ({
  id: "nuevo",
  origen: "nuevo",
  titulo: "Caso nuevo",
  narracion: null,
  escena: null,
  reporte: null,
  validacion: null,
});

export const casoImportado = (): CasoExpediente => ({
  id: "importado",
  origen: "importado",
  titulo: "Cargar un reporte de CESVI",
  narracion: null,
  escena: null,
  reporte: null,
  validacion: null,
});

/** Un reporte de la reproducción (prueba congelada de E-R4) como caso del recorrido. */
export function casoDeReporte(c: CasoReproduccion): CasoExpediente {
  return {
    id: c.id,
    origen: "reporte",
    titulo: nombreCaso(c.id),
    narracion: c.narracion,
    escena: {
      expediente: c.expediente,
      posiciones: c.posiciones,
      conteos: {
        filas: 0,
        valores_invalidos: 0,
        citas: 0,
        citas_fuera: 0,
        numeros: 0,
        numeros_fuera: 0,
      },
      problemas: problemasExpediente(c.expediente),
      preguntas: [],
    },
    reporte: { nombre: nombreCaso(c.id), conclusiones: c.conclusiones },
    validacion: null,
  };
}

// --- Los casos guardados en este equipo ---------------------------------------------------------

/** Lo mínimo de `Storage` que se usa (inyectable en las pruebas). */
export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

export interface ResumenGuardado {
  id: string;
  titulo: string;
  /** ISO 8601. */
  guardado: string;
  vehiculos: number;
  validado: boolean;
  conReporte: boolean;
}

export const CLAVE_INDICE = "croquis:casos:v1";
export const claveCaso = (id: string) => `croquis:caso:${id}`;
const INDICE = CLAVE_INDICE;
const clave = claveCaso;

function leerIndice(a: Almacen): ResumenGuardado[] {
  try {
    const v = JSON.parse(a.getItem(INDICE) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as ResumenGuardado[]) : [];
  } catch {
    return [];
  }
}

/** Los casos guardados, del más reciente al más viejo. */
export function casosGuardados(a: Almacen): ResumenGuardado[] {
  return [...leerIndice(a)].sort((x, y) => y.guardado.localeCompare(x.guardado));
}

/** Guarda (o reemplaza) un caso con su archivo; devuelve su resumen. */
export function guardarCaso(a: Almacen, id: string, archivo: CasoGuardado): ResumenGuardado {
  const resumen: ResumenGuardado = {
    id,
    titulo: archivo.titulo ?? "Caso sin nombre",
    guardado: archivo.guardado,
    vehiculos: archivo.expediente.vehiculos.length,
    validado: Boolean(archivo.expediente.resultado?.validado_por),
    conReporte: Boolean(archivo.reporte_cesvi),
  };
  a.setItem(clave(id), JSON.stringify(archivo));
  a.setItem(INDICE, JSON.stringify([...leerIndice(a).filter((r) => r.id !== id), resumen]));
  return resumen;
}

export function borrarGuardado(a: Almacen, id: string): void {
  a.removeItem(clave(id));
  a.setItem(INDICE, JSON.stringify(leerIndice(a).filter((r) => r.id !== id)));
}

/** Abre un caso guardado como caso del recorrido; null si no está o ya no es válido. */
export function abrirGuardado(a: Almacen, id: string): CasoExpediente | null {
  let datos: unknown;
  try {
    datos = JSON.parse(a.getItem(clave(id)) ?? "null");
  } catch {
    return null;
  }
  const c = leerCasoGuardado(datos);
  if ("error" in c) return null;
  return {
    id,
    origen: "guardado",
    titulo: c.titulo ?? "Caso guardado",
    narracion: c.narracion,
    escena: c.escena,
    reporte: c.reporte,
    validacion: c.validacion,
  };
}

/** Un identificador nuevo para guardar un caso (sin datos del caso en él). */
export const idNuevo = (ahora = Date.now(), azar = Math.random()) =>
  `${ahora.toString(36)}${Math.floor(azar * 36 ** 4)
    .toString(36)
    .padStart(4, "0")}`;
