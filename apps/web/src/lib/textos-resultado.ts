/**
 * Cómo se dicen en palabras llanas los resultados del solver. Los usan los paneles del visor y el
 * informe PDF, para que digan lo mismo. Nunca asignan culpa (PLAN §10).
 */
import type { Resultado } from "@croquis/scene-schema";
import { fmtNumber } from "./format-number";

export const CLASE: Record<string, string> = {
  sedan_compacto: "sedán compacto",
  sedan_mediano: "sedán mediano",
  hatchback: "hatchback",
  suv_compacta: "SUV compacta",
  suv_grande: "SUV grande",
  pickup: "pickup",
  van: "van",
  microbus_combi: "microbús o combi",
  autobus: "autobús",
  camion_unitario: "camión unitario",
  tractocamion: "tractocamión",
  motocicleta: "motocicleta",
  bicicleta: "bicicleta",
  scooter: "scooter",
};

export const PARAM: Record<string, string> = {
  friccion_llanta: "Fricción llanta–pavimento",
  restitucion_vehiculo_vehiculo: "Restitución entre vehículos",
  relacion_impulso_tangencial: "Fricción en el contacto",
  arrastre_post_impacto: "Arrastre después del impacto (fracción de μ)",
  factor_abs: "Factor de frenado con ABS",
  aproximacion_previa_s: "Tiempo de aproximación mostrado (s)",
  velocidad_peaton: "Velocidad al caminar (m/s)",
  friccion_cuerpo_suelo: "Fricción cuerpo–suelo",
  factor_proyeccion_jinete: "Factor de proyección del jinete",
  friccion_moto_caida: "Arrastre de la moto caída",
  altura_cg_volcadura: "Altura del centro de masa (fracción del alto)",
  altura_ojo: "Altura del ojo del conductor (m)",
  alcance_deteccion_nocturna: "Alcance de detección con luces bajas (m)",
};

export const TIPO: Record<string, string> = {
  primaria: "fuente primaria",
  secundaria: "fuente secundaria",
  supuesto: "supuesto",
  relato: "del relato",
  medido: "medido",
};

/** Dirección de la fuerza en horas de reloj, como se dice en reconstrucción ("a las 3"). */
export function clockHour(hours: number): string {
  const h = Math.round(hours) % 12;
  return `a las ${h === 0 ? 12 : h}`;
}

/** De dónde sale la rigidez del vehículo. */
export function rigidezTexto(origen: string | undefined): string {
  if (origen === "nhtsa") return "medida (pruebas de NHTSA)";
  if (origen === "supuesto") return "supuesto";
  return "—";
}

/** Evidencia de la inversión en palabras llanas. */
const EVIDENCIA: Record<string, string> = {
  reposo: "dónde quedó",
  rumbo_final: "hacia dónde quedó orientado",
  marcas_frenado: "marcas de frenado",
  proyeccion: "distancia a la que quedó la persona",
  dano: "daño descrito",
};

export function evidenceLabel(label: string, roles: Map<string, string>): string {
  const [kind = "", id = ""] = label.split(":");
  const who = roles.has(id) ? `vehículo ${roles.get(id)}` : "persona";
  return `${EVIDENCIA[kind] ?? kind} (${who})`;
}

type Parametro = NonNullable<Resultado["inversion"]>["parametros"][number];

export function parametroInversion(p: Parametro): string {
  return p.parametro === "velocidad_previa"
    ? "Velocidad previa (antes de frenar, si frenó)"
    : "Dirección de llegada";
}

export function unidadInversion(p: Parametro): string {
  return p.unidad === "deg" ? "°" : " km/h";
}

/** Lo que la evidencia dice de un parámetro, en una frase (versión de texto del panel). */
export function estimacionTexto(p: Parametro): string {
  const unit = unidadInversion(p);
  if (!p.identificable || !p.estimacion) return "La evidencia no basta para estimarlo.";
  const e = p.estimacion;
  if (p.en_limite) {
    return `La evidencia lleva este dato hasta el límite del modelo (${fmtNumber(e.mejor)}${unit}), así que no cabe bien con lo demás. Conviene revisar los datos.`;
  }
  return `${fmtNumber(e.p10)}–${fmtNumber(e.p90)}${unit} (mejor ajuste ${fmtNumber(e.mejor)}${unit})`;
}

/** Datos inciertos del Monte Carlo en palabras: qué dato, de quién, unidad y decimales. */
const CAMPO_INCIERTO: Record<string, { texto: string; unidad: string; decimales: number }> = {
  velocidad_previa: { texto: "velocidad previa", unidad: "km/h", decimales: 0 },
  masa: { texto: "masa", unidad: "kg", decimales: 0 },
  "frenado.distancia_antes_impacto": {
    texto: "distancia de frenado antes del impacto",
    unidad: "m",
    decimales: 1,
  },
};

type CampoIncierto = NonNullable<Resultado["incertidumbre"]>["campos"][number];

export function campoIncierto(c: CampoIncierto, resultado: Resultado): string {
  const veh = /^vehiculos\.(\d+)\.(.+)$/.exec(c.ruta);
  let quien: string;
  let def = { texto: c.ruta, unidad: "", decimales: 2 };
  if (veh) {
    const v = resultado.vehiculos[Number(veh[1])];
    quien = `Vehículo ${v?.rol ?? Number(veh[1]) + 1}`;
    def = CAMPO_INCIERTO[veh[2]!] ?? { ...def, texto: veh[2]! };
  } else if (c.ruta === "lugar.friccion") {
    quien = "Pavimento";
    def = { texto: "fricción llanta–pavimento", unidad: "", decimales: 2 };
  } else if (c.ruta.startsWith("parametros.")) {
    const k = c.ruta.slice("parametros.".length);
    quien = "Parámetro";
    def = { texto: (PARAM[k] ?? k).toLowerCase(), unidad: "", decimales: 2 };
  } else {
    quien = "Dato";
  }
  const u = def.unidad ? ` ${def.unidad}` : "";
  return `${quien}: ${def.texto}, entre ${fmtNumber(c.min, def.decimales)} y ${fmtNumber(c.max, def.decimales)}${u} (${c.nota})`;
}
