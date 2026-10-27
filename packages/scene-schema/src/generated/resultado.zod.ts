// Generado por scripts/generate.ts a partir de resultado.schema.json. NO EDITAR A MANO.
// Regenera con `pnpm --filter @croquis/scene-schema generate`.
import { z } from "zod";

export const RESULTADO_SCHEMA_ID = "https://croquis.local/schema/resultado/1.9.0";
export const RESULT_VERSION = "1.13.0" as const;

export const Id = z.string().regex(new RegExp("^[a-z0-9][a-z0-9_-]{0,63}$"));
export type Id = z.infer<typeof Id>;

export const ConductorAgente = z.strictObject({
  vehiculo: Id,
  tiempo_reaccion_s: z.strictObject({
    valor: z.number(),
    rango: z.tuple([z.number(), z.number()]),
    fuente: z.string().max(300),
  }),
  decision: z
    .strictObject({
      tipo: z.enum(["frenar", "volantear_izquierda", "volantear_derecha", "seguir"]),
      t: z.number(),
      origen: z.enum(["perito", "reconstruccion", "reaccion"]),
      ante: Id.optional(),
      percibio_t: z.number().optional(),
    })
    .optional(),
});
export type ConductorAgente = z.infer<typeof ConductorAgente>;

/** Percentiles 10, 50 y 90 de las muestras. */
export const Percentiles = z.strictObject({ p10: z.number(), p50: z.number(), p90: z.number() });
export type Percentiles = z.infer<typeof Percentiles>;

/** Lo que pasa con esas decisiones: el primer contacto entre vehículos o, si no hay, la distancia mínima a la que quedaron. */
export const SimulacionAgentes = z.strictObject({
  contacto: z.boolean(),
  t: z.number().optional(),
  vehiculos: z.tuple([Id, Id]).optional(),
  velocidades_kmh: z
    .array(z.strictObject({ vehiculo: Id, valor: z.number() }))
    .max(2)
    .optional(),
  velocidad_relativa_kmh: z.number().optional(),
  distancia_minima_m: z.number().optional(),
});
export type SimulacionAgentes = z.infer<typeof SimulacionAgentes>;

/** Los conductores como agentes (R12a, ADR 0088): solo cuando algún vehículo trae conductor. `resultado` es con las decisiones del perito; `linea_base`, con las de la reconstrucción. */
export const Agentes = z.strictObject({
  dt: z.number(),
  t_inicio: z.number(),
  t_fin: z.number(),
  conductores: z.array(ConductorAgente).max(32),
  resultado: SimulacionAgentes,
  linea_base: SimulacionAgentes,
  sensibilidad: z
    .strictObject({
      muestras: z.int(),
      semilla: z.int(),
      vehiculos: z.array(Id),
      sin_contacto: z.int(),
      velocidad_relativa_kmh: Percentiles.optional(),
    })
    .optional(),
  supuestos: z.array(z.string().max(300)).max(16).optional(),
});
export type Agentes = z.infer<typeof Agentes>;

export const CampoMuestreado = z.strictObject({
  ruta: z.string().min(1).max(120),
  distribucion: z.enum(["uniforme"]),
  min: z.number(),
  max: z.number(),
  nota: z.string().max(200),
});
export type CampoMuestreado = z.infer<typeof CampoMuestreado>;

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

/** El daño de un impacto posterior (carambola) en un vehículo que ya tenía daño de un impacto anterior: el mismo perfil que `Dano`, con el evento, el instante, el delta-v y la PDOF de ese impacto (desde 1.9.0, ADR 0066). */
export const DanoPosterior = z.strictObject({
  evento_id: Id,
  t: z.number(),
  delta_v_kmh: z.number().min(0),
  pdof_horas: z.number().optional(),
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
export type DanoPosterior = z.infer<typeof DanoPosterior>;

/** Números detrás de la bandera (km/h y m); los pares son [mínimo, máximo]. */
export const DatosInconsistencia = z.strictObject({
  vehiculo: Id,
  velocidad_kmh: z.number().optional(),
  marcas_m: z.number().optional(),
  minima_kmh: z.number().optional(),
  declarada_max_kmh: z.number().optional(),
  distancia_m: z.number().optional(),
  rango_kmh: z.tuple([z.number(), z.number()]).optional(),
  dano_minimo_kmh: z.tuple([z.number(), z.number()]).optional(),
  reconstruccion_kmh: z.number().optional(),
  dano_kmh: z.tuple([z.number(), z.number()]).optional(),
  velocidades_kmh: z.tuple([z.number(), z.number()]).optional(),
  distancia_minima_m: z.number().optional(),
  evidencia_kmh: z.tuple([z.number(), z.number()]).optional(),
  declarada_kmh: z.tuple([z.number(), z.number()]).optional(),
  evidencia: z.array(z.string().min(1).max(80)).max(64).optional(),
});
export type DatosInconsistencia = z.infer<typeof DatosInconsistencia>;

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
  punto_m: z.tuple([z.number(), z.number()]).optional(),
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

/** Mejor ajuste y percentiles de las reestimaciones con entradas perturbadas. */
export const EstimacionParametro = z.strictObject({
  mejor: z.number(),
  p10: z.number(),
  p50: z.number(),
  p90: z.number(),
  muestras: z.int().min(1).max(1000),
  rango_por: z.enum(["laplace"]).optional(),
});
export type EstimacionParametro = z.infer<typeof EstimacionParametro>;

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

export const IncertidumbrePersona = z.strictObject({ id: Id, distancia_proyeccion_m: Percentiles });
export type IncertidumbrePersona = z.infer<typeof IncertidumbrePersona>;

export const IncertidumbreVehiculo = z.strictObject({
  id: Id,
  v_impacto_kmh: Percentiles,
  delta_v_kmh: Percentiles,
  reposo_x_m: Percentiles,
  reposo_y_m: Percentiles,
  distancia_post_m: Percentiles,
});
export type IncertidumbreVehiculo = z.infer<typeof IncertidumbreVehiculo>;

/** Monte Carlo sobre los campos inciertos (PLAN §6.1.11): cada campo muestreado con su rango y los percentiles de las salidas principales. */
export const Incertidumbre = z.strictObject({
  semilla: z.int().min(0),
  muestras: z.int().min(1).max(10000),
  validas: z.int().min(0),
  campos: z.array(CampoMuestreado).max(64),
  vehiculos: z.array(IncertidumbreVehiculo).max(16),
  personas: z.array(IncertidumbrePersona).max(32),
});
export type Incertidumbre = z.infer<typeof Incertidumbre>;

export const Inconsistencia = z.strictObject({
  codigo: z.enum([
    "detenido_con_velocidad",
    "marcas_vs_velocidad",
    "proyeccion_vs_velocidad",
    "dano_vs_velocidad",
    "reposo_inalcanzable",
    "velocidad_vs_evidencia",
    "fuera_de_la_via_del_mapa",
    "dano_no_alcanzado",
    "reposo_supuesto_vs_dano",
  ]),
  mensaje: z.string().min(1).max(600),
  datos: DatosInconsistencia,
});
export type Inconsistencia = z.infer<typeof Inconsistencia>;

/** Incógnita de la inversión. Sin `estimacion` cuando la evidencia no la fija (identificable = false): queda en su valor inicial. */
export const ParametroInvertido = z.strictObject({
  parametro: z.enum(["velocidad_previa", "rumbo_inicial"]),
  vehiculo: Id,
  unidad: z.enum(["km/h", "deg"]),
  inicial: z.number(),
  inicial_declarado: z.boolean(),
  identificable: z.boolean(),
  sigma_local: z.number().min(0).optional(),
  estimacion: EstimacionParametro.optional(),
  en_limite: z.boolean().optional(),
});
export type ParametroInvertido = z.infer<typeof ParametroInvertido>;

export const Residuo = z.strictObject({ nombre: z.string().min(1).max(80), sigma: z.number() });
export type Residuo = z.infer<typeof Residuo>;

export const VelocidadImpactoInvertida = z.strictObject({
  vehiculo: Id,
  p10: z.number(),
  p50: z.number(),
  p90: z.number(),
  muestras: z.int().min(1).max(1000),
});
export type VelocidadImpactoInvertida = z.infer<typeof VelocidadImpactoInvertida>;

/** Otro modo del multiarranque dentro del margen de costo del mejor (ADR 0091), con su propia estimación: la misma forma que la inversión, sin sus modos ni alternativas. */
export const InversionAlternativa = z.strictObject({
  semilla: z.int().min(0),
  muestras: z.int().min(0).max(1000),
  evidencia: z
    .array(
      z
        .string()
        .regex(
          new RegExp(
            "^(reposo|rumbo_final|marcas_frenado|marcas_despues|proyeccion|dano):[A-Za-z0-9_-]+$",
          ),
        ),
    )
    .max(64),
  parametros: z.array(ParametroInvertido).max(32),
  velocidad_impacto: z.array(VelocidadImpactoInvertida).max(16),
  residuos: z.array(Residuo).max(128),
  convergio: z.boolean(),
  ajuste_completo: z
    .strictObject({
      valores: z
        .array(z.strictObject({ nombre: z.string().min(1).max(80), valor: z.number() }))
        .max(64),
      residuos: z.array(Residuo).max(128),
    })
    .optional(),
});
export type InversionAlternativa = z.infer<typeof InversionAlternativa>;

/** Un mínimo del costo del multiarranque (ADR 0091): su ajuste completo, su costo y cuántos arranques llegaron a él. */
export const ModoInversion = z.strictObject({
  valores: z
    .array(z.strictObject({ nombre: z.string().min(1).max(80), valor: z.number() }))
    .max(64),
  costo: z.number().min(0),
  arranques: z.int().min(1),
  elegido: z.boolean(),
  en_margen: z.boolean(),
});
export type ModoInversion = z.infer<typeof ModoInversion>;

/** Inversión (PLAN §6.1.10): velocidades y rumbos que reproducen la evidencia declarada, con mínimos cuadrados robustos y reestimaciones con semilla. */
export const Inversion = z.strictObject({
  semilla: z.int().min(0),
  muestras: z.int().min(0).max(1000),
  evidencia: z
    .array(
      z
        .string()
        .regex(
          new RegExp(
            "^(reposo|rumbo_final|marcas_frenado|marcas_despues|proyeccion|dano):[A-Za-z0-9_-]+$",
          ),
        ),
    )
    .max(64),
  parametros: z.array(ParametroInvertido).max(32),
  velocidad_impacto: z.array(VelocidadImpactoInvertida).max(16),
  residuos: z.array(Residuo).max(128),
  convergio: z.boolean(),
  ajuste_completo: z
    .strictObject({
      valores: z
        .array(z.strictObject({ nombre: z.string().min(1).max(80), valor: z.number() }))
        .max(64),
      residuos: z.array(Residuo).max(128),
    })
    .optional(),
  multiarranque: z
    .strictObject({ margen_costo: z.number().min(0), modos: z.array(ModoInversion).min(1).max(16) })
    .optional(),
  alternativas: z.array(InversionAlternativa).max(8).optional(),
});
export type Inversion = z.infer<typeof Inversion>;

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
  friccion_moto_caida: Parametro.optional(),
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
  danos_posteriores: z.array(DanoPosterior).max(8).optional(),
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

/** Reconstrucción producida por el solver a partir de una EscenaSpec: trayectorias, impulsos, daños, personas (proyección y ocupantes), visibilidad, objetos del entorno, eventos, banderas, parámetros con su fuente incertidumbre por Monte Carlo (percentiles con semilla), inversión desde la evidencia y banderas de consistencia. Unidades SI; tiempo con t = 0 en el impacto principal; rumbos en radianes antihorario desde +X (salvo los campos que terminan en _deg). */
export const ResultadoSchema = z.strictObject({
  version_resultado: z.literal("1.13.0"),
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
  incertidumbre: Incertidumbre.optional(),
  inversion: Inversion.optional(),
  inversion_reposo_supuesto: Inversion.optional(),
  consistencia: z.array(Inconsistencia).max(32).optional(),
  agentes: Agentes.optional(),
});
export type Resultado = z.infer<typeof ResultadoSchema>;
