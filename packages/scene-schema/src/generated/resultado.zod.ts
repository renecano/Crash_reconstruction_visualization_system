// Generado por scripts/generate.ts a partir de resultado.schema.json. NO EDITAR A MANO.
// Regenera con `pnpm --filter @croquis/scene-schema generate`.
import { z } from "zod";

export const RESULTADO_SCHEMA_ID = "https://croquis.local/schema/resultado/1.0.0";
export const RESULT_VERSION = "1.0.0" as const;

/** Zonas probables de contacto con el frente del vehículo, como indicadores neutros (sin diagnóstico de lesiones). */
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

/** Perfil de aplastamiento CRASH3 de 6 puntos sobre el ancho dañado, energía absorbida y origen de la rigidez usada. */
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
    "reposo",
  ]),
  t: z.number(),
  actores: z.array(Id).min(1).max(8),
  detalle: DetalleEvento.optional(),
});
export type EventoResultado = z.infer<typeof EventoResultado>;

export const Fase = z.strictObject({
  fase: z.enum(["de_pie", "caminando", "vuelo", "deslizamiento", "reposo"]),
  t_inicio: z.number(),
  t_fin: z.number(),
});
export type Fase = z.infer<typeof Fase>;

export const Numeros = z.array(z.number()).max(20000);
export type Numeros = z.infer<typeof Numeros>;

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
});
export type Parametros = z.infer<typeof Parametros>;

export const Punto = z.strictObject({ x: z.number(), y: z.number() });
export type Punto = z.infer<typeof Punto>;

export const Proyeccion = z.strictObject({
  velocidad_lanzamiento_kmh: z.number().min(0),
  distancia_m: z.number().min(0),
  rango_m: z.tuple([z.number().min(0), z.number().min(0)]),
  posicion_reposo: Punto,
  contacto: Contacto,
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
});
export type VehiculoResultado = z.infer<typeof VehiculoResultado>;

/** Reconstrucción producida por el solver a partir de una EscenaSpec: trayectorias, impulsos, daños, personas, eventos, banderas y parámetros con su fuente. Unidades SI; tiempo con t = 0 en el impacto principal; rumbos en radianes antihorario desde +X. */
export const ResultadoSchema = z.strictObject({
  version_resultado: z.literal("1.0.0"),
  escena_id: Id,
  semilla: z.int().min(0),
  dt: z.number().max(1).gt(0),
  t_inicio: z.number().max(0),
  t_fin: z.number().min(0),
  punto_impacto: Punto.optional(),
  vehiculos: z.array(VehiculoResultado).max(8),
  personas: z.array(PersonaResultado).max(24),
  eventos: z.array(EventoResultado).max(64),
  banderas: z.array(z.string().min(1).max(400)).max(64),
  parametros: Parametros,
});
export type Resultado = z.infer<typeof ResultadoSchema>;
