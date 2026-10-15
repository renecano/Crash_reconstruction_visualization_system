// Generado por scripts/generate.ts a partir de escena.schema.json. NO EDITAR A MANO.
// Regenera con `pnpm --filter @croquis/scene-schema generate`.
import { z } from "zod";

export const SCHEMA_ID = "https://croquis.mx/schemas/escena/1.0.0/escena.schema.json";
export const SCHEMA_VERSION = "1.1.0" as const;

/** Confianza en el valor, de 0 (adivinado) a 1 (seguro). */
export const Confianza = z.number().min(0).max(1);
export type Confianza = z.infer<typeof Confianza>;

/** De dónde salió el dato: del relato (con evidencia textual), lo escribió o corrigió la persona, lo supuso el sistema, o es el valor por defecto de la clase. */
export const Fuente = z.enum(["relato", "usuario", "supuesto", "default"]);
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

export const Color = z.strictObject({
  nombre: CampoTexto,
  hex: z.string().regex(new RegExp("^#[0-9a-fA-F]{6}$")),
});
export type Color = z.infer<typeof Color>;

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

export const FaseSemaforo = z.strictObject({
  movimiento: z.string().max(60),
  color: z.enum(["verde", "amarillo", "rojo", "intermitente", "apagado"]),
  tiempo_en_fase: CampoTiempo.optional(),
});
export type FaseSemaforo = z.infer<typeof FaseSemaforo>;

export const Punto2D = z.strictObject({ x: z.number(), y: z.number() });
export type Punto2D = z.infer<typeof Punto2D>;

/** Dispositivo de control de tránsito. */
export const Dispositivo = z.strictObject({
  id: Id,
  tipo: z.enum([
    "semaforo",
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

export const Frenado = z.strictObject({
  aplico: CampoBooleano,
  distancia_antes_impacto: CampoLongitud.optional(),
  abs: CampoBooleano.optional(),
  bloqueo_llantas: CampoBooleano.optional(),
});
export type Frenado = z.infer<typeof Frenado>;

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
});
export type Lugar = z.infer<typeof Lugar>;

export const Meta = z.strictObject({
  id: z.string().min(8).max(64).regex(new RegExp("^[A-Za-z0-9_-]+$")),
  version_esquema: z.literal("1.1.0"),
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
  ocupantes: z.array(Id).max(60).optional(),
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
});
export type EscenaSpec = z.infer<typeof EscenaSpecSchema>;
