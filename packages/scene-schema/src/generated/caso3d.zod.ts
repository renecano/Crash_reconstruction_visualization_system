// Generado por scripts/generate.ts a partir de caso3d.schema.json. NO EDITAR A MANO.
// Regenera con `pnpm --filter @croquis/scene-schema generate`.
import { z } from "zod";
import { EscenaSpecSchema } from "./escena.zod";
import { ResultadoSchema } from "./resultado.zod";

export const CASO3D_SCHEMA_ID = "https://croquis.mx/schemas/caso3d/1.0.0/caso3d.schema.json";
export const CASO3D_VERSION = "1.0.0" as const;

/** Cielo, luz y clima del hecho, calculados como en el visor web (`environmentFor`). */
export const AmbienteEscenario = z.strictObject({
  noche: z.boolean(),
  mojado: z.boolean(),
  superficie: z.string().min(1).max(80),
  precipitacion: z.string().min(1).max(80),
  luminarias: z.boolean(),
  sol_azimut_deg: z.number(),
  sol_elevacion_deg: z.number(),
  direccion_luz: z.tuple([z.number(), z.number(), z.number()]),
  intensidad_sol: z.number(),
  intensidad_ambiente: z.number(),
  color_cielo: z.string().regex(new RegExp("^#[0-9a-fA-F]{6}$")),
  color_ambiente: z.string().regex(new RegExp("^#[0-9a-fA-F]{6}$")),
  color_suelo: z.string().regex(new RegExp("^#[0-9a-fA-F]{6}$")),
  densidad_niebla: z.number(),
  turbidez: z.number(),
  supuestos: z.array(z.string()),
});
export type AmbienteEscenario = z.infer<typeof AmbienteEscenario>;

export const ArbolEscenario = z.strictObject({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  tronco_m: z.number(),
  copa_m: z.number(),
  rumbo_rad: z.number(),
  tipo: z.int().min(0).max(2),
  especie: z.enum(["jacaranda", "fresno", "pirul", "palmera"]).optional(),
  altura_m: z.number().optional(),
});
export type ArbolEscenario = z.infer<typeof ArbolEscenario>;

/** Una malla en planta de la vía. */
export const CapaEscenario = z.strictObject({
  nombre: z.enum([
    "acotamiento",
    "calzada",
    "banqueta",
    "camellon",
    "rayas_blancas",
    "rayas_amarillas",
    "paso_peatonal",
  ]),
  altura_m: z.number(),
  posiciones: z.array(z.number()),
  indices: z.array(z.int().min(0)),
});
export type CapaEscenario = z.infer<typeof CapaEscenario>;

/** Un anillo de cerros lejanos: altura por segmento. */
export const CerroEscenario = z.strictObject({
  radio_m: z.number(),
  desde_rad: z.number(),
  hasta_rad: z.number(),
  alturas_m: z.array(z.number()),
});
export type CerroEscenario = z.infer<typeof CerroEscenario>;

/** Cómo leer los números del paquete. Son fijas en esta versión: se declaran para que quien lo consuma no tenga que adivinarlas. */
export const Convenciones = z.strictObject({
  ejes: z.literal("x_este_y_norte_z_arriba"),
  angulos_resultado: z.literal("radianes_antihorario_desde_x"),
  angulos_escena: z.literal("grados_antihorario_desde_x"),
  tiempo: z.literal("segundos_t0_impacto_principal"),
  longitud: z.literal("metros"),
  unity: z.literal("posicion_x_z_y_yaw_90_menos_rumbo_grados"),
});
export type Convenciones = z.infer<typeof Convenciones>;

export const EdificioEscenario = z.strictObject({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  largo_m: z.number(),
  fondo_m: z.number(),
  alto_m: z.number(),
  rumbo_rad: z.number(),
  frente_rad: z.number(),
  pisos: z.int().min(1),
  color: z.string().regex(new RegExp("^#[0-9a-fA-F]{6}$")),
  material: z.enum(["yeso", "tabique"]),
  cortina: z.boolean(),
  toldo: z.boolean(),
  letrero: z.boolean(),
  tinacos: z.int().min(0),
  antena: z.boolean(),
  varillas: z.boolean(),
});
export type EdificioEscenario = z.infer<typeof EdificioEscenario>;

export const LuminariaEscenario = z.strictObject({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  altura_m: z.number(),
  rumbo_deg: z.number(),
});
export type LuminariaEscenario = z.infer<typeof LuminariaEscenario>;

export const PosteEscenario = z.strictObject({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  rumbo_rad: z.number(),
});
export type PosteEscenario = z.infer<typeof PosteEscenario>;

export const PuntoPlano = z.strictObject({ x: z.number(), y: z.number() });
export type PuntoPlano = z.infer<typeof PuntoPlano>;

/** Un segmento en planta, de a a b. */
export const SegmentoPlano = z.strictObject({
  ax: z.number(),
  ay: z.number(),
  bx: z.number(),
  by: z.number(),
});
export type SegmentoPlano = z.infer<typeof SegmentoPlano>;

export const SenalEscenario = z.strictObject({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  rumbo_rad: z.number(),
  tipo: z.enum(["alto", "ceda", "velocidad", "informativa"]),
});
export type SenalEscenario = z.infer<typeof SenalEscenario>;

/** Un bloque de la silueta urbana lejana. */
export const SiluetaEscenario = z.strictObject({
  angulo_rad: z.number(),
  abertura_rad: z.number(),
  alto_m: z.number(),
});
export type SiluetaEscenario = z.infer<typeof SiluetaEscenario>;

/** Una malla regular de suelo alrededor de la acción, con el relieve leve procedural. */
export const SueloEscenario = z.strictObject({
  centro: PuntoPlano,
  lado_m: z.number().gt(0),
  segmentos: z.int().min(1).max(512),
  hueco_m: z.number().gt(0).optional(),
  alturas_m: z.array(z.number()),
  tonos: z.array(z.number()),
  seco: z.array(z.number()).optional(),
});
export type SueloEscenario = z.infer<typeof SueloEscenario>;

/** Lo que rodea al choque, calculado en TS con las funciones del croquis 2D y del visor web (ADR 0112). Unity solo lo dibuja. Lo procedural va con la semilla de la escena. */
export const Escenario = z.strictObject({
  version: z.literal("1.0.0"),
  semilla: z.int(),
  procedural: z.literal(true),
  centro: PuntoPlano,
  ambiente: AmbienteEscenario,
  via: z.strictObject({
    capas: z.array(CapaEscenario),
    guarniciones: z.array(SegmentoPlano),
    altura_guarnicion_m: z.number(),
    barreras: z.array(z.array(PuntoPlano)),
  }),
  suelo: z.array(SueloEscenario),
  entorno: z.strictObject({
    zona: z.enum(["rural", "urbana"]),
    arboles: z.array(ArbolEscenario),
    edificios: z.array(EdificioEscenario),
    postes: z.array(PosteEscenario),
    cercas: z.array(SegmentoPlano),
    senales: z.array(SenalEscenario),
    cerros: z.array(CerroEscenario),
    silueta: z.array(SiluetaEscenario),
  }),
  luminarias: z.array(LuminariaEscenario),
});
export type Escenario = z.infer<typeof Escenario>;

/** Dónde está la esquina suroeste de la malla: en el mundo y en la escena. */
export const OrigenRelieve = z.strictObject({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  x: z.number(),
  y: z.number(),
});
export type OrigenRelieve = z.infer<typeof OrigenRelieve>;

/** Malla regular de alturas. Las filas van de sur a norte y, en cada fila, de oeste a este: alturas_m[fila * ancho + columna]. */
export const Relieve = z.strictObject({
  id: z.string().min(1).max(80),
  origen: OrigenRelieve,
  resolucion_m: z.number().gt(0),
  ancho: z.int().min(2).max(2048),
  alto: z.int().min(2).max(2048),
  alturas_m: z.array(z.number()).min(4).max(4194304),
  fuente: z.string().min(1).max(120),
  licencia: z.string().min(1).max(120),
  resolucion_nativa_m: z.number().gt(0),
});
export type Relieve = z.infer<typeof Relieve>;

/** Paquete caso-3d: la única entrada del visor Unity (plan v4 §2.1). Lleva la escena y el resultado sin copiar sus esquemas, el relieve si lo hay y las convenciones de ejes y unidades. Lo arma `armarCaso3d`. */
export const Caso3DSchema = z.strictObject({
  version_caso3d: z.literal("1.0.0"),
  escena: EscenaSpecSchema,
  resultado: ResultadoSchema,
  relieve: Relieve.optional(),
  escenario: Escenario.optional(),
  convenciones: Convenciones,
});
export type Caso3D = z.infer<typeof Caso3DSchema>;
