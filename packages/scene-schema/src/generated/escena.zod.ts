// Generado por scripts/generate.ts a partir de escena.schema.json. NO EDITAR A MANO.
// Regenera con `pnpm --filter @croquis/scene-schema generate`.
import { z } from "zod";

export const SCHEMA_ID = "https://croquis.mx/schemas/escena/1.0.0/escena.schema.json";
export const SCHEMA_VERSION = "2.2.0" as const;

/** La frase literal de donde sale un dato, y la página si es de un PDF. */
export const Cita = z.strictObject({
  texto: z.string().min(1).max(1200),
  pagina: z.int().min(1).optional(),
});
export type Cita = z.infer<typeof Cita>;

/** Identificador del vehículo en el expediente: A, B, C… (o V1, V2… en un dictamen importado). */
export const IdVehiculoExpediente = z.string().regex(new RegExp("^[A-Z][A-Z0-9]{0,3}$"));
export type IdVehiculoExpediente = z.infer<typeof IdVehiculoExpediente>;

/** De dónde sale un dato del expediente de CESVI (v2): lo escribió el perito, lo dijo un conductor, viene del expediente del caso, de un dictamen importado, lo supuso el sistema o salió del mapa. */
export const FuenteExpediente = z.enum([
  "perito",
  "conductor",
  "expediente",
  "dictamen_importado",
  "supuesto",
  "mapa",
]);
export type FuenteExpediente = z.infer<typeof FuenteExpediente>;

/** Un número con unidad, su fuente y su cita. */
export const MedidaExpediente = z.strictObject({
  valor: z.number(),
  unidad: z.string().min(1).max(20),
  fuente: FuenteExpediente,
  cita: Cita.optional(),
});
export type MedidaExpediente = z.infer<typeof MedidaExpediente>;

/** Un cálculo del dictamen o del motor: método, entradas con valor y resultado. */
export const CalculoExpediente = z.strictObject({
  metodo: z.enum([
    "mchenry",
    "ebs",
    "desplazamiento",
    "frenado_huellas",
    "cantidad_movimiento",
    "bolsas_aire",
    "prueba_choque",
    "otro",
  ]),
  entradas: z
    .array(z.strictObject({ nombre: z.string().min(1).max(40), valor: MedidaExpediente }))
    .max(20)
    .optional(),
  resultado: MedidaExpediente.optional(),
  vehiculo: IdVehiculoExpediente.optional(),
  cita: Cita.optional(),
});
export type CalculoExpediente = z.infer<typeof CalculoExpediente>;

/** Confianza en el valor, de 0 (adivinado) a 1 (seguro). */
export const Confianza = z.number().min(0).max(1);
export type Confianza = z.infer<typeof Confianza>;

/** De dónde salió el dato: del relato (con evidencia textual), lo escribió o corrigió la persona, lo supuso el sistema, es el valor por defecto de la clase, o salió del mapa de OpenStreetMap en `ubicacion_real` (desde 1.2.0). */
export const Fuente = z.enum(["relato", "usuario", "supuesto", "default", "mapa"]);
export type Fuente = z.infer<typeof Fuente>;

/** Fragmento literal del relato que respalda el dato. Los offsets son índices de caracteres (inicio inclusivo, fin exclusivo) sobre el relato normalizado. */
export const EvidenciaTexto = z.strictObject({
  inicio: z.int().min(0),
  fin: z.int().min(1),
  texto: z.string().min(1).max(500),
});
export type EvidenciaTexto = z.infer<typeof EvidenciaTexto>;

export const ListaEvidencia = z.array(EvidenciaTexto).max(8);
export type ListaEvidencia = z.infer<typeof ListaEvidencia>;

/** Intervalo [mínimo, máximo] plausible en la misma unidad que valor. */
export const RangoNumerico = z.tuple([z.number(), z.number()]);
export type RangoNumerico = z.infer<typeof RangoNumerico>;

export const CampoAceleracion = z.strictObject({
  valor: z.number(),
  unidad: z.enum(["m/s2", "g"]),
  rango: RangoNumerico.optional(),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoAceleracion = z.infer<typeof CampoAceleracion>;

/** Magnitud sin unidad (p. ej. coeficiente de fricción). */
export const CampoAdimensional = z.strictObject({
  valor: z.number(),
  rango: RangoNumerico.optional(),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoAdimensional = z.infer<typeof CampoAdimensional>;

export const CampoAngulo = z.strictObject({
  valor: z.number(),
  unidad: z.enum(["deg", "rad"]),
  rango: RangoNumerico.optional(),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoAngulo = z.infer<typeof CampoAngulo>;

export const CampoAsiento = z.strictObject({
  valor: z.enum([
    "conductor",
    "copiloto",
    "trasero_izquierdo",
    "trasero_centro",
    "trasero_derecho",
    "tercera_fila",
    "otro",
  ]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoAsiento = z.infer<typeof CampoAsiento>;

export const CampoBooleano = z.strictObject({
  valor: z.boolean(),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoBooleano = z.infer<typeof CampoBooleano>;

export const CampoClaseVehiculo = z.strictObject({
  valor: z.enum([
    "sedan_compacto",
    "sedan_mediano",
    "hatchback",
    "suv_compacta",
    "suv_grande",
    "pickup",
    "van",
    "microbus_combi",
    "autobus",
    "camion_unitario",
    "tractocamion",
    "motocicleta",
    "bicicleta",
    "scooter",
  ]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoClaseVehiculo = z.infer<typeof CampoClaseVehiculo>;

export const CampoClima = z.strictObject({
  valor: z.enum(["despejado", "nublado", "lluvia_ligera", "lluvia_fuerte", "niebla", "granizo"]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoClima = z.infer<typeof CampoClima>;

export const CampoDecision = z.strictObject({
  valor: z.enum(["frenar", "volantear_izquierda", "volantear_derecha", "seguir"]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoDecision = z.infer<typeof CampoDecision>;

export const CampoEntero = z.strictObject({
  valor: z.int(),
  rango: RangoNumerico.optional(),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoEntero = z.infer<typeof CampoEntero>;

export const CampoEstadoPintura = z.strictObject({
  valor: z.enum(["nueva", "normal", "desgastada"]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoEstadoPintura = z.infer<typeof CampoEstadoPintura>;

export const CampoEstadoSuperficie = z.strictObject({
  valor: z.enum(["seco", "mojado", "encharcado", "grava_suelta", "aceite", "lodo"]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoEstadoSuperficie = z.infer<typeof CampoEstadoSuperficie>;

export const CampoIluminacion = z.strictObject({
  valor: z.enum(["dia", "amanecer", "atardecer", "noche_con_alumbrado", "noche_sin_alumbrado"]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoIluminacion = z.infer<typeof CampoIluminacion>;

export const CampoLongitud = z.strictObject({
  valor: z.number().min(0),
  unidad: z.enum(["m", "cm", "mm", "km"]),
  rango: RangoNumerico.optional(),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoLongitud = z.infer<typeof CampoLongitud>;

export const CampoManiobra = z.strictObject({
  valor: z.enum([
    "recto",
    "vuelta_izquierda",
    "vuelta_derecha",
    "vuelta_u",
    "cambio_carril_izquierda",
    "cambio_carril_derecha",
    "reversa",
    "incorporacion",
    "detenido",
    "estacionado",
  ]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoManiobra = z.infer<typeof CampoManiobra>;

export const CampoMasa = z.strictObject({
  valor: z.number().gt(0),
  unidad: z.enum(["kg", "t", "lb"]),
  rango: RangoNumerico.optional(),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoMasa = z.infer<typeof CampoMasa>;

/** Perfil de aplastamiento C1–Cn medido a lo ancho del daño (CRASH3 / McHenry: 2, 4 o 6 medidas, de un extremo al otro). Con él, la energía sale del perfil y no de una profundidad pareja. */
export const CampoPerfilAplastamiento = z.strictObject({
  valor: z.array(z.number().min(0)).min(2).max(6),
  unidad: z.enum(["m", "cm", "mm"]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoPerfilAplastamiento = z.infer<typeof CampoPerfilAplastamiento>;

export const CampoPorcentaje = z.strictObject({
  valor: z.number().min(-100).max(100),
  unidad: z.enum(["%"]),
  rango: RangoNumerico.optional(),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoPorcentaje = z.infer<typeof CampoPorcentaje>;

export const CampoPostura = z.strictObject({
  valor: z.enum([
    "sentado",
    "de_pie",
    "caminando",
    "corriendo",
    "cruzando",
    "pedaleando",
    "en_moto",
    "tirado",
  ]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoPostura = z.infer<typeof CampoPostura>;

/** Coeficientes de rigidez CRASH3 de la cara dañada: A en N/m y B en N/m² (los del reporte del perito, si los da). Sin ellos, el solver usa los de la clase. */
export const CampoRigidez = z.strictObject({
  a: z.number().gt(0),
  b: z.number().gt(0),
  fuente: Fuente,
  confianza: Confianza,
  nota: z.string().max(300).optional(),
});
export type CampoRigidez = z.infer<typeof CampoRigidez>;

export const CampoRolPersona = z.strictObject({
  valor: z.enum(["conductor", "pasajero", "peaton", "ciclista", "motociclista"]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoRolPersona = z.infer<typeof CampoRolPersona>;

export const CampoSentidos = z.strictObject({
  valor: z.enum(["un_sentido", "doble_sentido"]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoSentidos = z.infer<typeof CampoSentidos>;

export const CampoSuperficie = z.strictObject({
  valor: z.enum(["asfalto", "concreto", "adoquin", "empedrado", "terraceria"]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoSuperficie = z.infer<typeof CampoSuperficie>;

export const CampoTexto = z.strictObject({
  valor: z.string().max(200),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoTexto = z.infer<typeof CampoTexto>;

export const CampoTiempo = z.strictObject({
  valor: z.number(),
  unidad: z.enum(["s", "ms", "min"]),
  rango: RangoNumerico.optional(),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoTiempo = z.infer<typeof CampoTiempo>;

export const CampoTipoVia = z.strictObject({
  valor: z.enum([
    "recta",
    "curva",
    "interseccion_x",
    "interseccion_t",
    "glorieta",
    "incorporacion",
    "retorno",
    "estacionamiento",
    "carretera_dos_carriles",
    "autopista",
  ]),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoTipoVia = z.infer<typeof CampoTipoVia>;

export const CampoVelocidad = z.strictObject({
  valor: z.number().min(0).max(400),
  unidad: z.enum(["km/h", "m/s"]),
  rango: RangoNumerico.optional(),
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type CampoVelocidad = z.infer<typeof CampoVelocidad>;

/** Un punto en el mapa (WGS84). */
export const Coordenadas = z.strictObject({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type Coordenadas = z.infer<typeof Coordenadas>;

/** Un dato de texto con su fuente y su cita. */
export const DatoExpediente = z.strictObject({
  valor: z.string().min(1).max(600),
  fuente: FuenteExpediente,
  cita: Cita.optional(),
});
export type DatoExpediente = z.infer<typeof DatoExpediente>;

/** Modalidad del hecho de tránsito según los dictámenes de CESVI. */
export const Modalidad = z.enum([
  "alcance",
  "lateral",
  "frontal",
  "crucero",
  "reversa",
  "volcadura",
  "salida_de_camino",
  "objeto_fijo",
  "atropellamiento",
  "carambola",
  "otra",
]);
export type Modalidad = z.infer<typeof Modalidad>;

/** Los datos del caso: aseguradora, siniestro, fecha, lugar y modalidades. Sin nombres de personas. */
export const CasoExpediente = z.strictObject({
  aseguradora: DatoExpediente.optional(),
  siniestro: DatoExpediente.optional(),
  fecha_hora: DatoExpediente.optional(),
  lugar: z
    .strictObject({
      descripcion: DatoExpediente.optional(),
      coordenadas: Coordenadas.optional(),
      via: DatoExpediente.optional(),
      carriles: z.int().min(1).max(12).optional(),
      municipio: DatoExpediente.optional(),
      estado: DatoExpediente.optional(),
    })
    .optional(),
  modalidades: z.array(Modalidad).max(6),
});
export type CasoExpediente = z.infer<typeof CasoExpediente>;

export const Color = z.strictObject({
  nombre: CampoTexto,
  hex: z.string().regex(new RegExp("^#[0-9a-fA-F]{6}$")),
});
export type Color = z.infer<typeof Color>;

/** El conductor como agente (R12a, ADR 0088): su tiempo de reacción y, si el perito prueba una hipótesis, qué decide y cuándo. Con este campo el solver simula a los conductores. */
export const Conductor = z.strictObject({
  tiempo_reaccion: CampoTiempo.optional(),
  decision: CampoDecision.optional(),
  instante_decision: CampoTiempo.optional(),
});
export type Conductor = z.infer<typeof Conductor>;

/** Un criterio de correspondencia con su estado y su evidencia. */
export const CriterioExpediente = z.strictObject({
  criterio: z.enum([
    "altura",
    "forma",
    "direccion",
    "magnitud",
    "intercambio_material",
    "dano_previo",
    "lugar",
  ]),
  estado: z.enum(["corresponde", "no_corresponde", "sin_dato"]),
  evidencia: z.string().min(1).max(1200).optional(),
  cita: Cita.optional(),
});
export type CriterioExpediente = z.infer<typeof CriterioExpediente>;

/** Identificador estable dentro de la escena. */
export const Id = z.string().regex(new RegExp("^[a-z][a-z0-9_-]{0,31}$"));
export type Id = z.infer<typeof Id>;

/** Procedencia de un objeto compuesto (pose, objeto del entorno, daño, evidencia) cuyos campos internos comparten origen. */
export const Procedencia = z.strictObject({
  fuente: Fuente,
  confianza: Confianza,
  evidencia: ListaEvidencia.optional(),
  nota: z.string().max(300).optional(),
});
export type Procedencia = z.infer<typeof Procedencia>;

/** Zona de daño con la convención CDC (SAE J224): lado del vehículo, zona horizontal, zona vertical y extensión. */
export const ZonaCDC = z.strictObject({
  lado: z.enum(["F", "B", "L", "R", "T", "U"]),
  zona_horizontal: z.enum(["L", "C", "R", "Y", "Z", "D", "F", "P", "B"]).optional(),
  zona_vertical: z.enum(["A", "E", "G", "H", "L", "M", "W"]).optional(),
  extension: z.int().min(1).max(9).optional(),
});
export type ZonaCDC = z.infer<typeof ZonaCDC>;

export const DanoDeclarado = z.strictObject({
  vehiculo_id: Id,
  zona: ZonaCDC,
  severidad: z.enum(["ninguno", "leve", "moderado", "severo", "perdida_total"]),
  profundidad_aplastamiento: CampoLongitud.optional(),
  ancho_danado: CampoLongitud.optional(),
  perfil_aplastamiento: CampoPerfilAplastamiento.optional(),
  rigidez: CampoRigidez.optional(),
  vidrios: z.enum(["intactos", "estrellados", "rotos"]).optional(),
  bolsas_aire: CampoBooleano.optional(),
  piezas_desprendidas: z
    .array(
      z.enum([
        "defensa",
        "espejo",
        "faro",
        "calavera",
        "cofre",
        "puerta",
        "llanta",
        "tapon",
        "moldura",
        "placa",
        "otra",
      ]),
    )
    .max(11)
    .optional(),
  fugas: z
    .array(z.enum(["anticongelante", "aceite", "combustible", "ninguna"]))
    .max(4)
    .optional(),
  descripcion: z.string().max(400).optional(),
  procedencia: Procedencia,
});
export type DanoDeclarado = z.infer<typeof DanoDeclarado>;

/** Dirección de la deformación, como la escriben los dictámenes de CESVI. */
export const DireccionDeformacion = z.enum([
  "de_adelante_hacia_atras",
  "de_atras_hacia_adelante",
  "de_izquierda_a_derecha",
  "de_derecha_a_izquierda",
  "de_arriba_hacia_abajo",
  "de_abajo_hacia_arriba",
]);
export type DireccionDeformacion = z.infer<typeof DireccionDeformacion>;

/** La zona en el diagrama estándar del vehículo: cara, tercio y vértice. */
export const ZonaDiagrama = z.strictObject({
  cara: z.enum([
    "frontal",
    "posterior",
    "lateral_izquierdo",
    "lateral_derecho",
    "techo",
    "inferior",
  ]),
  tercio: z.enum(["izquierdo", "centro", "derecho", "delantero", "medio", "trasero"]).optional(),
  vertice: z
    .enum(["delantero_izquierdo", "delantero_derecho", "posterior_izquierdo", "posterior_derecho"])
    .optional(),
});
export type ZonaDiagrama = z.infer<typeof ZonaDiagrama>;

/** Un daño de un vehículo: zona, altura, dirección, magnitud, intercambio de material y daño previo. */
export const DanoExpediente = z.strictObject({
  vehiculo: IdVehiculoExpediente,
  zona: ZonaDiagrama,
  altura_cm: z
    .strictObject({
      min: z.number().min(0).max(400).optional(),
      max: z.number().min(0).max(400).optional(),
    })
    .optional(),
  direcciones: z.array(DireccionDeformacion).max(4).optional(),
  tipos: z
    .array(
      z.enum([
        "hundimiento",
        "tallon",
        "ruptura",
        "desprendimiento",
        "deformacion",
        "fractura",
        "impregnacion_pintura",
      ]),
    )
    .max(7)
    .optional(),
  magnitud: z
    .strictObject({
      cualitativa: z.enum(["leve", "moderada", "severa"]).optional(),
      c_m: z.array(z.number().min(0).max(5)).max(6).optional(),
      l_m: z.number().min(0).max(10).optional(),
    })
    .optional(),
  intercambio_material: z
    .strictObject({
      color: z.string().min(1).max(60).optional(),
      sobre: z.string().min(1).max(200).optional(),
    })
    .optional(),
  dano_previo: z.boolean().optional(),
  descripcion: DatoExpediente.optional(),
  fotos: z.array(z.string().min(1).max(300)).max(50).optional(),
  fuente: FuenteExpediente,
  cita: Cita.optional(),
});
export type DanoExpediente = z.infer<typeof DanoExpediente>;

export const FaseSemaforo = z.strictObject({
  movimiento: z.string().max(60),
  color: z.enum(["verde", "amarillo", "rojo", "intermitente", "apagado"]),
  tiempo_en_fase: CampoTiempo.optional(),
});
export type FaseSemaforo = z.infer<typeof FaseSemaforo>;

export const Punto2D = z.strictObject({ x: z.number(), y: z.number() });
export type Punto2D = z.infer<typeof Punto2D>;

/** Dispositivo de control de tránsito. En un `semaforo_peatonal` (desde 1.3.0), cada fase es para los peatones: verde es la figura que camina, rojo la figura detenida e intermitente la figura que camina destellando (despeje). */
export const Dispositivo = z.strictObject({
  id: Id,
  tipo: z.enum([
    "semaforo",
    "semaforo_peatonal",
    "alto",
    "ceda_el_paso",
    "tope",
    "paso_peatonal",
    "linea_continua",
    "linea_discontinua",
    "limite_velocidad",
    "no_vuelta",
    "un_sentido",
    "otro",
  ]),
  posicion: Punto2D,
  orientacion_deg: z.number().min(-360).max(360).optional(),
  aplica_a: z.array(Id).max(8).optional(),
  fases: z.array(FaseSemaforo).max(8).optional(),
  limite_velocidad: CampoVelocidad.optional(),
  procedencia: Procedencia,
});
export type Dispositivo = z.infer<typeof Dispositivo>;

/** Objeto fijo o estacionado que puede ser golpeado o tapar la vista. */
export const ObjetoEntorno = z.strictObject({
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
  posicion: Punto2D,
  rumbo_deg: z.number().min(-360).max(360).optional(),
  largo: CampoLongitud.optional(),
  ancho: CampoLongitud.optional(),
  alto: CampoLongitud.optional(),
  diametro_tronco: CampoLongitud.optional(),
  material: z.enum(["madera", "concreto", "metal", "mamposteria", "vegetal", "otro"]).optional(),
  clase_vehiculo: CampoClaseVehiculo.optional(),
  color: Color.optional(),
  procedencia: Procedencia,
});
export type ObjetoEntorno = z.infer<typeof ObjetoEntorno>;

export const Entorno = z.strictObject({
  fecha_hora: CampoTexto.optional(),
  clima: CampoClima,
  visibilidad: CampoLongitud.optional(),
  iluminacion: CampoIluminacion,
  alumbrado_publico: CampoBooleano.optional(),
  temperatura_c: CampoAdimensional.optional(),
  objetos: z.array(ObjetoEntorno).max(64).optional(),
});
export type Entorno = z.infer<typeof Entorno>;

export const ZonaImpacto = z.strictObject({
  vehiculo_id: Id,
  cdc: ZonaCDC,
  pdof_horas: CampoAdimensional.optional(),
});
export type ZonaImpacto = z.infer<typeof ZonaImpacto>;

export const Evento = z.strictObject({
  id: Id,
  orden: z.int().min(0).max(99),
  tipo: z.enum([
    "inicio_frenado",
    "impacto_vehiculo_vehiculo",
    "impacto_vehiculo_objeto",
    "impacto_vehiculo_persona",
    "giro",
    "derrape",
    "volcadura",
    "arrastre",
    "segundo_impacto",
    "reposo",
  ]),
  t: CampoTiempo.optional(),
  actores: z.array(Id).min(1).max(8),
  zonas_impacto: z.array(ZonaImpacto).max(8).optional(),
  pdof_horas: CampoAdimensional.optional(),
  punto_impacto: Punto2D.optional(),
  descripcion: z.string().max(400).optional(),
  procedencia: Procedencia,
});
export type Evento = z.infer<typeof Evento>;

/** Huella física o testimonio que restringe la reconstrucción. */
export const EvidenciaFisica = z.strictObject({
  id: Id,
  tipo: z.enum([
    "marcas_frenado",
    "marcas_derrape",
    "restos",
    "vidrios",
    "posicion_final",
    "distancia_proyeccion",
    "testigo",
    "foto",
    "video",
    "otra",
  ]),
  vehiculo_id: Id.optional(),
  persona_id: Id.optional(),
  longitud: CampoLongitud.optional(),
  fase: z.enum(["antes_impacto", "despues_impacto"]).optional(),
  puntos: z.array(Punto2D).max(64).optional(),
  descripcion: z.string().max(400).optional(),
  procedencia: Procedencia,
});
export type EvidenciaFisica = z.infer<typeof EvidenciaFisica>;

/** Evidencias del lugar. */
export const EvidenciasLugar = z.strictObject({
  restos: z
    .strictObject({
      inicio: Coordenadas.optional(),
      fin: Coordenadas.optional(),
      longitud: MedidaExpediente.optional(),
      cita: Cita.optional(),
    })
    .optional(),
  huellas: z
    .array(
      z.strictObject({
        tipo: z.enum(["frenado", "derrape", "arrastre"]),
        vehiculo: IdVehiculoExpediente.optional(),
        longitud: MedidaExpediente.optional(),
        cita: Cita.optional(),
      }),
    )
    .max(20)
    .optional(),
  objetos_fijos_danados: z.array(z.string().min(1).max(200)).max(20).optional(),
});
export type EvidenciasLugar = z.infer<typeof EvidenciasLugar>;

/** Un impacto, en orden: qué vehículos u objeto fijo, sus zonas de contacto, dónde y cuándo. Una carambola tiene más de uno. */
export const ImpactoExpediente = z.strictObject({
  orden: z.int().min(1).max(50),
  vehiculos: z.array(IdVehiculoExpediente).max(6).optional(),
  objeto_fijo: z.string().min(1).max(120).optional(),
  zonas: z
    .array(z.strictObject({ vehiculo: IdVehiculoExpediente, zona: ZonaDiagrama }))
    .max(6)
    .optional(),
  punto: Coordenadas.optional(),
  fuente: FuenteExpediente,
  cita: Cita.optional(),
});
export type ImpactoExpediente = z.infer<typeof ImpactoExpediente>;

/** El resultado: conclusión, sugerencia, decisión del perito, quién validó y la huella de las entradas. */
export const ResultadoExpediente = z.strictObject({
  conclusion: z
    .strictObject({
      veredicto: z.enum(["se_sostiene", "no_se_sostiene", "parcial", "sin_juicio"]),
      cita: Cita.optional(),
      fuente: FuenteExpediente,
    })
    .optional(),
  sugerencia: z.string().min(1).max(2000).optional(),
  decision: z.enum(["aceptada", "editada", "rechazada"]).optional(),
  validado_por: z.string().min(1).max(120).optional(),
  fecha_validacion: z.iso.datetime({ offset: true }).optional(),
  huella_entradas: z.string().regex(new RegExp("^[0-9a-f]{8,64}$")).optional(),
});
export type ResultadoExpediente = z.infer<typeof ResultadoExpediente>;

/** Coeficientes de rigidez A (N/m) y B (N/m²) con su fuente. */
export const Rigidez = z.strictObject({
  A: z.number().min(0),
  B: z.number().min(0),
  fuente: z.enum(["dictamen", "tabla_cesvi", "nhtsa_e2", "perito"]),
  cita: Cita.optional(),
});
export type Rigidez = z.infer<typeof Rigidez>;

/** Un vehículo del expediente. Sin placas, VIN ni nombres. */
export const VehiculoExpediente = z.strictObject({
  id: IdVehiculoExpediente,
  marca: DatoExpediente.optional(),
  modelo: DatoExpediente.optional(),
  anio: z.int().min(1900).max(2100).optional(),
  clase: z
    .enum([
      "sedan_compacto",
      "sedan_mediano",
      "hatchback",
      "suv_compacta",
      "suv_grande",
      "pickup",
      "van",
      "microbus_combi",
      "autobus",
      "camion_unitario",
      "tractocamion",
      "motocicleta",
      "bicicleta",
      "scooter",
    ])
    .optional(),
  masa: MedidaExpediente.optional(),
  rigidez: Rigidez.optional(),
  altura_defensa_cm: z
    .strictObject({
      delantera: z.number().min(0).max(300).optional(),
      trasera: z.number().min(0).max(300).optional(),
    })
    .optional(),
});
export type VehiculoExpediente = z.infer<typeof VehiculoExpediente>;

/** Una maniobra de un vehículo en una versión. */
export const ManiobraExpediente = z.strictObject({
  vehiculo: IdVehiculoExpediente,
  tipo: z.enum([
    "circula",
    "se_detiene",
    "reversa",
    "frena",
    "vira_izquierda",
    "vira_derecha",
    "cambia_carril",
    "evasiva",
    "otra",
  ]),
  metros: z.number().min(0).max(10000).optional(),
  cita: Cita.optional(),
});
export type ManiobraExpediente = z.infer<typeof ManiobraExpediente>;

/** Posición de un vehículo en una fase de una versión. */
export const PosicionExpediente = z.strictObject({
  vehiculo: IdVehiculoExpediente,
  fase: z.enum(["inicial", "impacto", "final"]),
  punto: Coordenadas,
  rumbo: z.number().min(0).max(360),
  fuente: FuenteExpediente,
});
export type PosicionExpediente = z.infer<typeof PosicionExpediente>;

/** Una versión del hecho: la de la evidencia (la arma el perito) o la de un conductor (cita literal y maniobras). */
export const VersionExpediente = z.strictObject({
  tipo: z.enum(["evidencia", "declarada"]),
  declarante: IdVehiculoExpediente.optional(),
  declaracion: Cita.optional(),
  maniobras: z.array(ManiobraExpediente).max(20).optional(),
  posiciones: z.array(PosicionExpediente).max(60).optional(),
});
export type VersionExpediente = z.infer<typeof VersionExpediente>;

/** El expediente de CESVI (contrato v2, docs/cesvi/PLAN-CESVI.md §4): caso, vehículos 1..N, daños, impactos 1..M en orden, versiones, evidencias del lugar, cálculos, criterios y resultado. */
export const Expediente = z.strictObject({
  caso: CasoExpediente,
  vehiculos: z.array(VehiculoExpediente).max(20),
  danos: z.array(DanoExpediente).max(200).optional(),
  impactos: z.array(ImpactoExpediente).max(50).optional(),
  versiones: z.array(VersionExpediente).max(20).optional(),
  evidencias: EvidenciasLugar.optional(),
  calculos: z.array(CalculoExpediente).max(60).optional(),
  criterios: z.array(CriterioExpediente).max(40).optional(),
  resultado: ResultadoExpediente.optional(),
});
export type Expediente = z.infer<typeof Expediente>;

export const Frenado = z.strictObject({
  aplico: CampoBooleano,
  distancia_antes_impacto: CampoLongitud.optional(),
  abs: CampoBooleano.optional(),
  bloqueo_llantas: CampoBooleano.optional(),
});
export type Frenado = z.infer<typeof Frenado>;

/** Una calle de OSM (un `way` con `highway`), ya en metros locales. */
export const ViaMapa = z.strictObject({
  id_osm: z.int(),
  tipo: z.string().min(1).max(40),
  nombre: z.string().max(120).optional(),
  carriles: z.int().min(1).max(12).optional(),
  ancho_m: z.number().min(2).max(60).optional(),
  un_sentido: z.boolean().optional(),
  puntos: z.array(Punto2D).min(2).max(400),
});
export type ViaMapa = z.infer<typeof ViaMapa>;

/** Calles de OpenStreetMap alrededor de `ubicacion_real`, proyectadas a metros en el marco local de la escena (desde 1.2.0). Se guardan en la escena para que sea determinista y funcione sin red. */
export const RedVial = z.strictObject({
  fuente_datos: z.literal("OpenStreetMap"),
  licencia: z.literal("ODbL-1.0"),
  atribucion: z.string().min(1).max(200),
  consultado: z.string().max(40),
  nodo_cruce: z.int().optional(),
  vias: z.array(ViaMapa).min(1).max(64),
});
export type RedVial = z.infer<typeof RedVial>;

/** Coordenadas opcionales para generar la geometría desde OpenStreetMap (atribución ODbL en pantalla). */
export const UbicacionReal = z.strictObject({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radio_m: z.number().min(20).max(500).optional(),
  rotacion_deg: z.number().min(-360).max(360).optional(),
  procedencia: Procedencia,
});
export type UbicacionReal = z.infer<typeof UbicacionReal>;

export const Lugar = z.strictObject({
  nombre_via: CampoTexto.optional(),
  nombre_via_secundaria: CampoTexto.optional(),
  tipo_via: CampoTipoVia,
  carriles_por_sentido: CampoEntero,
  carriles_por_sentido_secundaria: CampoEntero.optional(),
  ancho_carril: CampoLongitud,
  sentidos: CampoSentidos,
  camellon: CampoBooleano.optional(),
  ancho_camellon: CampoLongitud.optional(),
  banquetas: CampoBooleano.optional(),
  guarniciones: CampoBooleano.optional(),
  acotamiento: CampoBooleano.optional(),
  ancho_acotamiento: CampoLongitud.optional(),
  pendiente: CampoPorcentaje.optional(),
  peralte: CampoPorcentaje.optional(),
  radio_curva: CampoLongitud.optional(),
  superficie: CampoSuperficie,
  estado_superficie: CampoEstadoSuperficie,
  friccion: CampoAdimensional.optional(),
  dispositivos: z.array(Dispositivo).max(32).optional(),
  ubicacion_real: UbicacionReal.optional(),
  red_vial: RedVial.optional(),
});
export type Lugar = z.infer<typeof Lugar>;

export const Meta = z.strictObject({
  id: z.string().min(8).max(64).regex(new RegExp("^[A-Za-z0-9_-]+$")),
  version_esquema: z.literal("2.2.0"),
  idioma: z.enum(["es-MX", "en"]),
  semilla: z.int().min(0).max(4294967295),
  creado: z.iso.datetime({ offset: true }),
  titulo: z.string().max(120).optional(),
  hash_relato: z.string().regex(new RegExp("^[0-9a-f]{64}$")).optional(),
  relato: z.string().max(20000).optional(),
  origen_relato: z.enum(["escrito", "voz", "precargado", "manual"]).optional(),
  sintetico: z.boolean().optional(),
});
export type Meta = z.infer<typeof Meta>;

/** Posición y rumbo de un cuerpo en el plano. El rumbo se mide en grados desde +X (este) en sentido antihorario. */
export const Pose2D = z.strictObject({
  x: z.number(),
  y: z.number(),
  rumbo_deg: z.number().min(-360).max(360),
  procedencia: Procedencia,
});
export type Pose2D = z.infer<typeof Pose2D>;

/** Persona involucrada. Nunca lleva nombre ni datos de contacto. */
export const Persona = z.strictObject({
  id: Id,
  rol: CampoRolPersona,
  vehiculo_id: Id.optional(),
  asiento: CampoAsiento.optional(),
  edad_aprox: CampoEntero.optional(),
  estatura: CampoLongitud.optional(),
  masa: CampoMasa.optional(),
  cinturon: CampoBooleano.optional(),
  casco: CampoBooleano.optional(),
  sistema_retencion_infantil: CampoBooleano.optional(),
  postura: CampoPostura.optional(),
  direccion_movimiento: CampoAngulo.optional(),
  velocidad: CampoVelocidad.optional(),
  posicion_inicial: Pose2D.optional(),
  posicion_final: Pose2D.optional(),
});
export type Persona = z.infer<typeof Persona>;

export const Vehiculo = z.strictObject({
  id: Id,
  rol: z.string().regex(new RegExp("^[A-H]$")),
  clase: CampoClaseVehiculo,
  marca: CampoTexto.optional(),
  modelo: CampoTexto.optional(),
  anio: CampoEntero.optional(),
  color: Color,
  estado_pintura: CampoEstadoPintura.optional(),
  masa: CampoMasa.optional(),
  largo: CampoLongitud.optional(),
  ancho: CampoLongitud.optional(),
  alto: CampoLongitud.optional(),
  distancia_entre_ejes: CampoLongitud.optional(),
  voladizo_delantero: CampoLongitud.optional(),
  voladizo_trasero: CampoLongitud.optional(),
  maniobra: CampoManiobra,
  velocidad_previa: CampoVelocidad,
  frenado: Frenado.optional(),
  aceleracion: CampoAceleracion.optional(),
  luces_encendidas: CampoBooleano.optional(),
  direccionales: z.enum(["ninguna", "izquierda", "derecha", "intermitentes"]).optional(),
  carril: CampoEntero.optional(),
  posicion_inicial: Pose2D,
  posicion_final: Pose2D.optional(),
  posicion_final_supuesta: z.boolean().optional(),
  ocupantes: z.array(Id).max(60).optional(),
  conductor: Conductor.optional(),
});
export type Vehiculo = z.infer<typeof Vehiculo>;

/** Escena estructurada de un percance vial, producida por el extractor LLM o editada por la persona. Es el único contrato entre extracción, croquis 2D, solver y visor. Cada dato lleva su procedencia (fuente, confianza y evidencia del relato). Unidades: el solver normaliza a SI; la interfaz muestra km/h y metros. Marco de referencia: metros, eje X al este, eje Y al norte, rumbo en grados desde +X en sentido antihorario. */
export const EscenaSpecSchema = z.strictObject({
  meta: Meta,
  lugar: Lugar,
  entorno: Entorno,
  vehiculos: z.array(Vehiculo).min(0).max(8),
  personas: z.array(Persona).max(32),
  eventos: z.array(Evento).max(32),
  danos_declarados: z.array(DanoDeclarado).max(32),
  evidencias: z.array(EvidenciaFisica).max(64),
  expediente: Expediente.optional(),
});
export type EscenaSpec = z.infer<typeof EscenaSpecSchema>;
