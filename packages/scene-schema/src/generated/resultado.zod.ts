// Generado por scripts/generate.ts a partir de resultado.schema.json. NO EDITAR A MANO.
// Regenera con `pnpm --filter @croquis/scene-schema generate`.
import { z } from "zod";

export const RESULTADO_SCHEMA_ID = "https://croquis.local/schema/resultado/1.2.0";
export const RESULT_VERSION = "1.2.0" as const;

/** Zonas probables de contacto con el frente del vehículo, como indicadores neutros (sin diagnóstico de lesiones). Vacías para jinetes proyectados desde su vehículo. */
export const Contacto = z.strictObject({
  defensa: z.string().max(40),
  borde_cofre: z.string().max(40),
  cabeza: z.string().max(40),
});
export type Contacto = z.infer<typeof Contacto>;

export const ZonaCDC = z.strictObject({
  lado: z.enum(["F", "B", "L", "R", "T", "U"]),
  zona_horizontal: z.enum(["L", "C", "R", "Y", "Z", "D", "F", "P", "B"]).optional(),
  zona_vertical: z.enum(["A", "E", "G", "H", "L", "M", "W"]).optional(),
  extension: z.int().min(1).max(9).optional(),
});
export type ZonaCDC = z.infer<typeof ZonaCDC>;

/** Perfil de aplastamiento CRASH3 de 6 puntos sobre el ancho dañado (centrado en centro_m a lo largo de la cara), energía absorbida y origen de la rigidez usada. */
export const Dano = z.strictObject({
  perfil_m: z.tuple([
    z.number().min(0),
    z.number().min(0),
    z.number().min(0),
    z.number().min(0),
    z.number().min(0),
    z.number().min(0),
  ]),
  ancho_m: z.number().min(0),
  centro_m: z.number(),
  energia_j: z.number().min(0),
  origen_rigidez: z.enum(["nhtsa", "supuesto", "sin impacto"]),
  cdc: ZonaCDC.optional(),
});
export type Dano = z.infer<typeof Dano>;

export const DetalleEvento = z.strictObject({
  impulso_ns: z.tuple([z.number(), z.number()]).optional(),
  adherencia: z.boolean().optional(),
  friccion_contacto_usada: z.number().min(0).optional(),
  energia_disipada_j: z.number().min(0).optional(),
  velocidad_cierre_kmh: z.number().min(0).optional(),
  objeto: z.string().max(40).optional(),
  rigido: z.boolean().optional(),
  energia_objeto_j: z.number().min(0).optional(),
  aplastamiento_max_m: z.number().min(0).optional(),
  distancia_proyeccion_m: z.number().min(0).optional(),
  rango_m: z.tuple([z.number().min(0), z.number().min(0)]).optional(),
});
export type DetalleEvento = z.infer<typeof DetalleEvento>;

export const Dimensiones = z.strictObject({
  largo_m: z.number().gt(0),
  ancho_m: z.number().gt(0),
  alto_m: z.number().gt(0),
  distancia_entre_ejes_m: z.number().gt(0),
  masa_kg: z.number().gt(0),
});
export type Dimensiones = z.infer<typeof Dimensiones>;

export const Id = z.string().regex(new RegExp("^[a-z0-9][a-z0-9_-]{0,63}$"));
export type Id = z.infer<typeof Id>;

export const EventoResultado = z.strictObject({
  id: z.string().regex(new RegExp("^[a-z0-9][a-z0-9_-]{0,79}$")),
  tipo: z.enum([
    "inicio_frenado",
    "impacto_vehiculo_vehiculo",
    "impacto_vehiculo_objeto",
    "impacto_vehiculo_persona",
    "proyeccion",
    "volcadura",
    "reposo",
  ]),
  t: z.number(),
  actores: z.array(Id).min(1).max(8),
  detalle: DetalleEvento.optional(),
});
export type EventoResultado = z.infer<typeof EventoResultado>;

export const Fase = z.strictObject({
  fase: z.enum(["de_pie", "caminando", "montado", "vuelo", "deslizamiento", "reposo"]),
  t_inicio: z.number(),
  t_fin: z.number(),
});
export type Fase = z.infer<typeof Fase>;

export const Numeros = z.array(z.number()).max(20000);
export type Numeros = z.infer<typeof Numeros>;

/** Desplazamiento del ocupante respecto al habitáculo (marco del vehículo: x adelante, y izquierda) desde el impacto, con y sin cinturón. */
export const MovimientoOcupante = z.strictObject({
  cinturon: z.boolean(),
  t: Numeros,
  dx: Numeros,
  dy: Numeros,
  desplazamiento_max_m: z.number().min(0),
  contacto: z
    .strictObject({
      zona: z.string().max(60),
      t_s: z.number().min(0),
      velocidad_relativa_kmh: z.number().min(0),
    })
    .optional(),
});
export type MovimientoOcupante = z.infer<typeof MovimientoOcupante>;

/** Geometría de un objeto del entorno, la misma para el visor y para el análisis de visibilidad. */
export const ObjetoEscena = z.strictObject({
  id: Id,
  tipo: z.enum([
    "arbol",
    "poste",
    "muro",
    "barda",
    "vehiculo_estacionado",
    "puesto",
    "contenedor",
    "senal",
    "parada_autobus",
    "otro",
  ]),
  forma: z.enum(["arbol", "cilindro", "caja", "senal"]),
  x: z.number(),
  y: z.number(),
  rumbo_deg: z.number(),
  largo_m: z.number().gt(0),
  ancho_m: z.number().gt(0),
  alto_m: z.number().gt(0),
  radio_m: z.number().gt(0).optional(),
  copa: z
    .strictObject({
      radio_m: z.number().gt(0),
      centro_m: z.number().gt(0),
      tronco_alto_m: z.number().gt(0),
    })
    .optional(),
  clase_vehiculo: z.string().max(40).optional(),
});
export type ObjetoEscena = z.infer<typeof ObjetoEscena>;

/** Cinemática del ocupante dentro del habitáculo (PLAN §6.1.8). Sin estimación de lesiones. Si el cinturón no se declaró, se dan las dos variantes. */
export const Ocupante = z.strictObject({
  asiento: z.enum([
    "conductor",
    "copiloto",
    "trasero_izquierdo",
    "trasero_centro",
    "trasero_derecho",
    "tercera_fila",
    "otro",
  ]),
  cinturon_declarado: z.boolean().optional(),
  pulso: z.strictObject({
    duracion_s: z.number().gt(0),
    delta_v_kmh: z.number().min(0),
    aceleracion_max_g: z.number().min(0),
    direccion_deg: z.number(),
  }),
  variantes: z.array(MovimientoOcupante).min(1).max(2),
});
export type Ocupante = z.infer<typeof Ocupante>;

/** Valor usado por el solver con su rango, fuente y tipo (de literatura primaria o secundaria, supuesto, del relato o medido). */
export const Parametro = z.strictObject({
  valor: z.number(),
  rango: z.tuple([z.number(), z.number()]).optional(),
  fuente: z.string().max(300).optional(),
  tipo: z.enum(["primaria", "secundaria", "supuesto", "relato", "medido"]),
});
export type Parametro = z.infer<typeof Parametro>;

export const Parametros = z.strictObject({
  friccion_llanta: Parametro,
  restitucion_vehiculo_vehiculo: Parametro,
  relacion_impulso_tangencial: Parametro,
  arrastre_post_impacto: Parametro,
  factor_abs: Parametro,
  aproximacion_previa_s: Parametro,
  velocidad_peaton: Parametro.optional(),
  friccion_cuerpo_suelo: Parametro.optional(),
  factor_proyeccion_jinete: Parametro.optional(),
  altura_cg_volcadura: Parametro.optional(),
  altura_ojo: Parametro.optional(),
  alcance_deteccion_nocturna: Parametro.optional(),
});
export type Parametros = z.infer<typeof Parametros>;

export const Punto = z.strictObject({ x: z.number(), y: z.number() });
export type Punto = z.infer<typeof Punto>;

/** Proyección de una persona (peatón golpeado o jinete que sale de su vehículo) con el modelo de Searle. `banda_searle_m` es el rango de distancias compatible con la velocidad de lanzamiento, el rango de fricción cuerpo–suelo y el dominio de ángulos [0, 2·atan μ]: el criterio con el que se juzga el ragdoll del visor. */
export const Proyeccion = z.strictObject({
  velocidad_lanzamiento_kmh: z.number().min(0),
  distancia_m: z.number().min(0),
  rango_m: z.tuple([z.number().min(0), z.number().min(0)]),
  posicion_reposo: Punto,
  contacto: Contacto,
  banda_searle_m: z.tuple([z.number().min(0), z.number().min(0)]),
  friccion_cuerpo: z.strictObject({
    valor: z.number().gt(0),
    rango: z.tuple([z.number().min(0), z.number().min(0)]),
  }),
  angulo_lanzamiento_deg: z.number().min(0).max(90),
  altura_cg_m: z.number().max(3).gt(0),
  rumbo_deg: z.number(),
});
export type Proyeccion = z.infer<typeof Proyeccion>;

/** Centro de masa de la persona (z = altura). Vacía si va a bordo de un vehículo. */
export const TrayectoriaPersona = z.strictObject({
  t: Numeros,
  x: Numeros,
  y: Numeros,
  z: Numeros,
  rumbo: Numeros,
});
export type TrayectoriaPersona = z.infer<typeof TrayectoriaPersona>;

export const PersonaResultado = z.strictObject({
  id: Id,
  rol: z.enum(["conductor", "pasajero", "peaton", "ciclista", "motociclista"]),
  estatura_m: z.number().max(2.5).gt(0),
  vehiculo_id: Id.optional(),
  trayectoria: TrayectoriaPersona,
  fases: z.array(Fase).max(16),
  proyeccion: Proyeccion.optional(),
  ocupante: Ocupante.optional(),
});
export type PersonaResultado = z.infer<typeof PersonaResultado>;

export const Pose = z.strictObject({ x: z.number(), y: z.number(), rumbo_deg: z.number() });
export type Pose = z.infer<typeof Pose>;

/** Muestras del centro de masa en una rejilla de paso dt alineada a t = 0. Todos los arreglos tienen la misma longitud. */
export const TrayectoriaVehiculo = z.strictObject({
  t: Numeros,
  x: Numeros,
  y: Numeros,
  rumbo: Numeros,
  vx: Numeros,
  vy: Numeros,
  vel_angular: Numeros,
});
export type TrayectoriaVehiculo = z.infer<typeof TrayectoriaVehiculo>;

/** Criterio de inicio de volcadura por tropiezo (velocidad crítica de deslizamiento). La secuencia 3D del visor es ilustrativa. */
export const Volcadura = z.strictObject({
  inicia: z.boolean(),
  lado_tropiezo: z.enum(["derecho", "izquierdo"]),
  velocidad_lateral_kmh: z.number().min(0),
  velocidad_critica_kmh: z.number().min(0),
  ssf: z.number().gt(0),
  altura_cg_m: z.number().gt(0),
  via_m: z.number().gt(0),
  velocidad_alabeo_rad_s: z.number().min(0),
});
export type Volcadura = z.infer<typeof Volcadura>;

export const VehiculoResultado = z.strictObject({
  id: Id,
  rol: z.string().regex(new RegExp("^[A-H]$")),
  clase: z.string().min(1).max(40),
  involucrado: z.boolean(),
  dimensiones: Dimensiones,
  trayectoria: TrayectoriaVehiculo,
  v_impacto_kmh: z.number().min(0),
  delta_v_kmh: z.number().min(0),
  pdof_horas: z.number().min(0).max(12).optional(),
  dano: Dano,
  en_reposo: z.boolean(),
  pose_final: Pose,
  distancia_post_m: z.number().min(0),
  volcadura: Volcadura.optional(),
});
export type VehiculoResultado = z.infer<typeof VehiculoResultado>;

/** Línea de vista desde el ojo de un conductor hacia otro actor antes del impacto (PLAN §6.1.9): si se veía, qué lo tapaba y a qué distancia. */
export const Visibilidad = z.strictObject({
  observador: Id,
  objetivo: Id,
  tipo_objetivo: z.enum(["vehiculo", "persona", "objeto"]),
  altura_ojo_m: z.number().gt(0),
  t: Numeros,
  visible: z.array(z.boolean()).max(2000),
  fraccion: z.array(z.number().min(0).max(1)).max(2000),
  distancia_m: Numeros,
  causa: z.array(z.string().max(100)).max(2000),
  resumen: z.strictObject({
    visible_al_impacto: z.boolean(),
    oclusor_principal: z.string().max(100).optional(),
    limitado_por: z.array(z.string().max(100)).max(64),
    visible_desde_s: z.number().optional(),
    distancia_al_verse_m: z.number().min(0).optional(),
    tiempo_disponible_s: z.number().min(0).optional(),
    visible_toda_la_aproximacion: z.boolean().optional(),
  }),
});
export type Visibilidad = z.infer<typeof Visibilidad>;

/** Reconstrucción producida por el solver a partir de una EscenaSpec: trayectorias, impulsos, daños, personas (proyección y ocupantes), visibilidad, objetos del entorno, eventos, banderas y parámetros con su fuente. Unidades SI; tiempo con t = 0 en el impacto principal; rumbos en radianes antihorario desde +X (salvo los campos que terminan en _deg). */
export const ResultadoSchema = z.strictObject({
  version_resultado: z.literal("1.2.0"),
  escena_id: Id,
  semilla: z.int().min(0),
  dt: z.number().max(1).gt(0),
  t_inicio: z.number().max(0),
  t_fin: z.number().min(0),
  punto_impacto: Punto.optional(),
  vehiculos: z.array(VehiculoResultado).max(8),
  personas: z.array(PersonaResultado).max(24),
  objetos: z.array(ObjetoEscena).max(64),
  visibilidad: z.array(Visibilidad).max(128),
  eventos: z.array(EventoResultado).max(64),
  banderas: z.array(z.string().min(1).max(400)).max(64),
  parametros: Parametros,
});
export type Resultado = z.infer<typeof ResultadoSchema>;
