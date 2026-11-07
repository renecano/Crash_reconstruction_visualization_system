// Generado por scripts/generate.ts a partir de caso3d.schema.json. NO EDITAR A MANO.
// Regenera con `pnpm --filter @croquis/scene-schema generate`.
import { z } from "zod";
import { EscenaSpecSchema } from "./escena.zod";
import { ResultadoSchema } from "./resultado.zod";

export const CASO3D_SCHEMA_ID = "https://croquis.mx/schemas/caso3d/1.0.0/caso3d.schema.json";
export const CASO3D_VERSION = "1.0.0" as const;

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
  convenciones: Convenciones,
});
export type Caso3D = z.infer<typeof Caso3DSchema>;
