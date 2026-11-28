/**
 * Los tipos del puente web ↔ Unity. El contrato en palabras está en `visor-puente.md`; una prueba
 * revisa que los dos nombren los mismos mensajes.
 */

/** Sube cuando cambia un mensaje. Unity la anuncia en `listo`. */
export const VISOR_PUENTE_VERSION = "1.5.0" as const;

/**
 * Las versiones con las que la web todavía trabaja: la 1.2.0 es la del build publicado antes de la
 * ronda 4 (sin piso de mapa ni fantasma). Con otra, la web no carga el caso y abre el visor ligero.
 */
export const VERSIONES_PUENTE_COMPATIBLES: readonly string[] = [
  "1.2.0",
  "1.3.0",
  "1.4.0",
  VISOR_PUENTE_VERSION,
];

/** Si el build anunciado entiende el piso de mapa y el fantasma (puente 1.3.0, ronda 4). */
export const conPisoYFantasma = (version: string | null | undefined): boolean =>
  version === "1.3.0" || version === "1.4.0" || version === "1.5.0";

/** Si el build anunciado entiende el mensaje `leyenda` (puente 1.4.0, Presentar). */
export const conLeyenda = (version: string | null | undefined): boolean =>
  version === "1.4.0" || version === "1.5.0";

/** Si el build anunciado tiene la cámara `automatica` (puente 1.5.0, el video). */
export const conCamaraAutomatica = (version: string | null | undefined): boolean =>
  version === "1.5.0";

/**
 * Si el build dibuja el trayecto previo ilustrativo (`trayecto_previo` del paquete, Unity #377): los
 * builds de la 1.5.0 compilados desde `main` (René, 2026-11-27: el 8a302a, de la 1.4.0, no lo trae).
 */
export const conTrayectoPrevio = (version: string | null | undefined): boolean =>
  version === "1.5.0";

export const CALIDADES_VISOR = ["baja", "media", "alta", "ultra", "auto"] as const;
export type CalidadVisor = (typeof CALIDADES_VISOR)[number];

/** Las cámaras; la del conductor es `conductor:<id del vehículo>`. */
export type CamaraVisor =
  | "cenital"
  | "cinematica"
  | "orbita"
  | "acera"
  | "libre"
  /** Tomas que siempre dejan ver el punto de contacto: la llegada, el impacto de lado y el final desde arriba. */
  | "automatica"
  | `conductor:${string}`
  /** Junto a un vehículo, siguiéndolo: `cerca:<id>:<azimut°>:<distancia m>:<altura m>`. */
  | `cerca:${string}`
  /** Sigue a una persona que no va dentro de un vehículo (peatón, ciclista, motociclista). */
  | `persona:${string}`;

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
  /**
   * `escala` (opcional, 2026-11-28): la escala de dibujo fija (1 = la resolución completa del lienzo)
   * o `null` para devolverla a la automática. La usa el video, que graba cuadro por cuadro y no debe
   * bajar la resolución por los fps bajos. Sin el campo, la escala no cambia.
   */
  calidad: { nivel: CalidadVisor; escala?: number | null };
  encuadrar: { zona: ZonaEncuadre };
  capturar: { vista: VistaCaptura; ancho: number; alto: number };
  /** Sin `herramienta`, `mover`. */
  modoEdicion: { on: boolean; herramienta?: HerramientaEdicion; vehiculo_id?: string };
  /** Muestra u oculta los puntos de C1 (primer golpe, choques intermedios, puntos de paso). */
  marcadores: { visibles: boolean };
  /**
   * 1.3.0 (ronda 4, punto 9): cambia la imagen del piso del modo «mapa real» sin volver a cargar el
   * caso (la foto satelital y su ajuste). Con `imagen: null`, vuelve al entorno procedural.
   */
  piso: {
    imagen: string | null;
    centro_x?: number;
    centro_y?: number;
    lado_m?: number;
    atribucion?: string;
  };
  /**
   * 1.4.0 (Presentar, 2026-11-26): muestra u oculta la leyenda ilustrativa que dibuja Unity. La web la
   * oculta solo mientras pone la suya completa encima del 3D (Presentar) y la vuelve a mostrar al
   * salir. Las capturas (`capturar`) no cambian: la leyenda del dictamen la pone la web.
   */
  leyenda: { visible: boolean };
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
  /**
   * `omitidos` (desde el build de la batería de ciudad, 2026-11-20): lo que el 3D no pudo dibujar y
   * omitió para no caer al visor de respaldo, una línea por elemento y causa. Los builds anteriores no
   * lo mandan.
   */
  cargado: { escena_id: string; omitidos?: string[] };
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
  /** `punto` y no `tipo`: el `tipo` del mensaje ya es «puntoMarcado» (desde la 1.2.0). */
  puntoMarcado: {
    punto: "punto_inicial" | "choque_intermedio" | "punto_paso";
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
  "piso",
  "leyenda",
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
