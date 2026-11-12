/**
 * Los tipos del puente web ↔ Unity. El contrato en palabras está en `visor-puente.md`; una prueba
 * revisa que los dos nombren los mismos mensajes.
 */

/** Sube cuando cambia un mensaje. Unity la anuncia en `listo`; la web no carga un caso si no coincide. */
export const VISOR_PUENTE_VERSION = "1.2.0" as const;

export const CALIDADES_VISOR = ["baja", "media", "alta", "ultra", "auto"] as const;
export type CalidadVisor = (typeof CALIDADES_VISOR)[number];

/** Las cámaras; la del conductor es `conductor:<id del vehículo>`. */
export type CamaraVisor =
  "cenital" | "cinematica" | "orbita" | "acera" | "libre" | `conductor:${string}`;

/** Lo que encuadra el botón: «Ver todo» o «Ir al impacto». */
export type ZonaEncuadre = "todo" | "impacto";

/**
 * Qué foto del dictamen se pide: un segundo antes del impacto, en el impacto o en reposo (con la
 * cámara cinematográfica), o la del conductor en el impacto (`conductor:<id del vehículo>`).
 */
export type VistaCaptura = "antes" | "impacto" | "reposo" | `conductor:${string}`;

/**
 * Qué hace el clic del perito en modo edición: mover, girar y cambiar el tamaño de un objeto, o
 * marcar un punto de C1. Los puntos de un vehículo llevan su `vehiculo_id`.
 */
export const HERRAMIENTAS_EDICION = [
  "mover",
  "punto_inicial",
  "choque_intermedio",
  "punto_paso",
] as const;
export type HerramientaEdicion = (typeof HERRAMIENTAS_EDICION)[number];

/** Lo que la web le manda a Unity. */
export interface MensajesAUnity {
  /** El paquete caso-3d, como texto JSON. */
  cargarCaso: { json: string };
  fijarTiempo: { t: number };
  reproducir: Record<string, never>;
  pausar: Record<string, never>;
  velocidad: { x: number };
  camara: { modo: CamaraVisor };
  calidad: { nivel: CalidadVisor };
  encuadrar: { zona: ZonaEncuadre };
  capturar: { vista: VistaCaptura; ancho: number; alto: number };
  /** Sin `herramienta`, `mover`. */
  modoEdicion: { on: boolean; herramienta?: HerramientaEdicion; vehiculo_id?: string };
  /** Muestra u oculta los puntos de C1 (primer golpe, choques intermedios, puntos de paso). */
  marcadores: { visibles: boolean };
}

export const CODIGOS_ERROR_VISOR = [
  "version_puente",
  "caso_invalido",
  "modelo_no_cargo",
  "dispositivo_perdido",
  "captura_fallo",
  "interno",
] as const;
export type CodigoErrorVisor = (typeof CODIGOS_ERROR_VISOR)[number];

/** Lo que Unity le manda a la web. */
export interface MensajesDeUnity {
  listo: { version: string };
  cargado: { escena_id: string };
  tiempo: { t: number };
  camara: { modo: CamaraVisor };
  /** `png` es la imagen en base64, sin el prefijo `data:`. */
  captura: { vista: VistaCaptura; png: string };
  fps: { p50: number };
  error: { codigo: CodigoErrorVisor; mensaje: string };
  /** Unity nunca recalcula: manda la edición, la web actualiza la escena y vuelve a cargar el caso. */
  objetoEditado: {
    id: string;
    x: number;
    y: number;
    rumbo_deg: number;
    largo: number;
    ancho: number;
  };
  puntoMarcado: {
    tipo: "punto_inicial" | "choque_intermedio" | "punto_paso";
    vehiculo_id?: string;
    objeto_id?: string;
    x: number;
    y: number;
  };
}

/** Un mensaje de Unity tal como llega a la web: el nombre en `tipo` y sus campos. */
export type MensajeDeUnity = {
  [K in keyof MensajesDeUnity]: { tipo: K } & MensajesDeUnity[K];
}[keyof MensajesDeUnity];

/** El GameObject de la escena de Unity que recibe los mensajes de la web. */
export const OBJETO_PUENTE_UNITY = "VisorPuente";

/** La función global que Unity llama con cada mensaje, como texto JSON. */
export const FUNCION_PUENTE_WEB = "croquisVisorMensaje";

/** Los nombres, para revisar que el documento y los tipos no se separen. */
export const NOMBRES_A_UNITY = [
  "cargarCaso",
  "fijarTiempo",
  "reproducir",
  "pausar",
  "velocidad",
  "camara",
  "calidad",
  "encuadrar",
  "capturar",
  "modoEdicion",
  "marcadores",
] as const satisfies readonly (keyof MensajesAUnity)[];

export const NOMBRES_DE_UNITY = [
  "listo",
  "cargado",
  "tiempo",
  "camara",
  "captura",
  "fps",
  "error",
  "objetoEditado",
  "puntoMarcado",
] as const satisfies readonly (keyof MensajesDeUnity)[];
