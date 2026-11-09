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

/** Un cambio de luz: vale desde `t` hasta el siguiente. */
export const LuzSemaforo = z.strictObject({
  t: z.number(),
  luz: z.enum(["verde", "amarillo", "rojo", "apagado"]),
});
export type LuzSemaforo = z.infer<typeof LuzSemaforo>;

/** Un dispositivo de control con posición en la escena. */
export const DispositivoEscenario = z.strictObject({
  id: z.string().min(1).max(80),
  tipo: z.enum([
    "semaforo",
    "semaforo_peatonal",
    "alto",
    "ceda_el_paso",
    "tope",
    "limite_velocidad",
    "no_vuelta",
    "un_sentido",
    "otro",
  ]),
  x: z.number(),
  y: z.number(),
  rumbo_deg: z.number(),
  luces: z.array(LuzSemaforo),
  intermitente: z.boolean(),
  limite_kmh: z.number().optional(),
});
export type DispositivoEscenario = z.infer<typeof DispositivoEscenario>;

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

export const PuntoPlano = z.strictObject({ x: z.number(), y: z.number() });
export type PuntoPlano = z.infer<typeof PuntoPlano>;

/** Una evidencia que el perito declaró con puntos en el lugar. */
export const EvidenciaEscenario = z.strictObject({
  id: z.string().min(1).max(80),
  tipo: z.enum(["marcas_frenado", "marcas_derrape", "restos", "vidrios", "otra"]),
  puntos: z.array(PuntoPlano),
});
export type EvidenciaEscenario = z.infer<typeof EvidenciaEscenario>;

/** Un tramo de huella de llanta, calculado de la trayectoria (`computeGroundMarks`). */
export const HuellaEscenario = z.strictObject({
  tipo: z.enum(["frenado", "derrape"]),
  esquinas: z.tuple([
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
  ]),
  t: z.number(),
});
export type HuellaEscenario = z.infer<typeof HuellaEscenario>;

export const LuminariaEscenario = z.strictObject({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  altura_m: z.number(),
  rumbo_deg: z.number(),
});
export type LuminariaEscenario = z.infer<typeof LuminariaEscenario>;

/** Fluido derramado tras el impacto: crece desde `t0`. */
export const ManchaEscenario = z.strictObject({
  x: z.number(),
  y: z.number(),
  t0: z.number(),
  radio_m: z.number(),
});
export type ManchaEscenario = z.infer<typeof ManchaEscenario>;

/** Un punto de C1: dónde fue el primer golpe, un choque intermedio o un punto de paso. */
export const MarcadorEscenario = z.strictObject({
  tipo: z.enum(["primer_golpe", "choque_intermedio", "punto_paso", "punto_inicial"]),
  x: z.number(),
  y: z.number(),
  vehiculo_id: z.string().min(1).max(80).optional(),
  orden: z.int().min(0).optional(),
  t: z.number().optional(),
});
export type MarcadorEscenario = z.infer<typeof MarcadorEscenario>;

export const PosteEscenario = z.strictObject({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  rumbo_rad: z.number(),
});
export type PosteEscenario = z.infer<typeof PosteEscenario>;

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

/** Una zona ondulada: crestas perpendiculares a `rumbo_deg`. */
export const OndulacionEscenario = z.strictObject({
  poligono: z.array(PuntoPlano).min(3),
  amplitud_m: z.number(),
  longitud_onda_m: z.number(),
  rumbo_deg: z.number(),
});
export type OndulacionEscenario = z.infer<typeof OndulacionEscenario>;

/** Una zona del piso con otra superficie. */
export const SuperficieEscenario = z.strictObject({
  tipo: z.enum([
    "asfalto",
    "concreto",
    "adoquin",
    "empedrado",
    "terraceria",
    "grava",
    "pasto",
    "tierra",
    "lodo",
  ]),
  poligono: z.array(PuntoPlano).min(3),
});
export type SuperficieEscenario = z.infer<typeof SuperficieEscenario>;

/** Un tope: la línea que cruza la vía, su alto y su largo en el sentido de la marcha. */
export const TopeEscenario = z.strictObject({
  ax: z.number(),
  ay: z.number(),
  bx: z.number(),
  by: z.number(),
  alto_m: z.number(),
  largo_m: z.number(),
});
export type TopeEscenario = z.infer<typeof TopeEscenario>;

/** El terreno de C3 que declara la escena (`lugar.terreno`), para dibujarlo. La malla de relieve viaja aparte, en `relieve`. */
export const TerrenoEscenario = z.strictObject({
  superficies: z.array(SuperficieEscenario),
  ondulaciones: z.array(OndulacionEscenario),
  topes: z.array(TopeEscenario),
});
export type TerrenoEscenario = z.infer<typeof TerrenoEscenario>;

/** Un intervalo con las luces de freno encendidas. */
export const TramoFreno = z.strictObject({ desde: z.number(), hasta: z.number() });
export type TramoFreno = z.infer<typeof TramoFreno>;

/** Lo que el visor necesita de cada vehículo y no está en su trayectoria. */
export const VehiculoEscenario = z.strictObject({
  id: z.string().min(1).max(80),
  color: z.string().regex(new RegExp("^#[0-9a-fA-F]{6}$")).optional(),
  faros: z.boolean(),
  frenado: z.array(TramoFreno),
});
export type VehiculoEscenario = z.infer<typeof VehiculoEscenario>;

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
  dispositivos: z.array(DispositivoEscenario),
  huellas: z.array(HuellaEscenario),
  manchas: z.array(ManchaEscenario),
  evidencias: z.array(EvidenciaEscenario),
  marcadores: z.array(MarcadorEscenario),
  vehiculos: z.array(VehiculoEscenario),
  terreno: TerrenoEscenario,
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
