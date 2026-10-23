/**
 * Entorno de la escena: posición del sol según fecha, hora y lugar, e iluminación y clima.
 *
 * Posición solar: ecuaciones de la NOAA Global Monitoring Division ("General Solar Position
 * Calculations"), con ecuación del tiempo y declinación por serie de Fourier; error del orden
 * de un grado, de sobra para iluminar una escena ilustrativa. Si la escena no trae ubicación se
 * usa el centro de Toluca y si no trae fecha se usa el equinoccio de marzo de 2025; la hora sale
 * de `fecha_hora` o, si falta, de la iluminación declarada. Hora local del centro de México:
 * UTC−6 sin horario de verano (vigente desde 2022). Todos estos valores por defecto se
 * reportan en `EnvironmentSettings.supuestos`.
 */

export const TOLUCA = { lat: 19.2826, lon: -99.6557 } as const;
export const DEFAULT_DATE = "2025-03-20";
export const MEXICO_CENTRAL_OFFSET_MIN = -360;
/** Elevación mínima de la luz direccional de día (ajuste visual). */
export const MIN_LIGHT_ELEVATION_DEG = 6;

const HOUR_BY_LIGHT: Record<string, string> = {
  dia: "12:30",
  amanecer: "07:25",
  atardecer: "18:10",
  noche_con_alumbrado: "22:00",
  noche_sin_alumbrado: "22:00",
};

export interface SunPosition {
  /** Elevación sobre el horizonte (grados). */
  elevation: number;
  /** Azimut desde el norte en sentido horario (grados). */
  azimuth: number;
}

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86_400_000) + 1;
}

/** Posición del sol para un instante UTC y una ubicación (NOAA). */
export function sunPosition(date: Date, lat: number, lon: number): SunPosition {
  const year = date.getUTCFullYear();
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / (leap ? 366 : 365)) * (dayOfYear(date) - 1 + (hours - 12) / 24);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const trueSolarMin = hours * 60 + eqTime + 4 * lon;
  const ha = rad(trueSolarMin / 4 - 180);
  const phi = rad(lat);
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZ)));
  const az = Math.atan2(
    Math.sin(ha),
    Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi),
  );
  return { elevation: 90 - deg(zenith), azimuth: (deg(az) + 180 + 360) % 360 };
}

/** Dirección hacia el sol en el marco del mundo (X este, Y norte, Z arriba), unitaria. */
export function sunDirection(p: SunPosition): [number, number, number] {
  const el = rad(p.elevation);
  const az = rad(p.azimuth);
  return [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)];
}

export interface SceneTime {
  date: Date;
  supuestos: string[];
}

/**
 * Interpreta `fecha_hora` (texto libre): ISO con zona, "AAAA-MM-DD HH:MM" o "HH:MM" (hora local
 * del centro de México). Lo que falte se completa con los valores por defecto y se reporta.
 */
export function parseSceneTime(
  fechaHora: string | undefined,
  iluminacion: string | undefined,
): SceneTime {
  const supuestos: string[] = [];
  const text = (fechaHora ?? "").trim();
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
  if (iso.test(text)) {
    const d = new Date(text);
    if (!Number.isNaN(d.getTime())) return { date: d, supuestos };
  }
  let datePart = DEFAULT_DATE;
  let timePart: string | undefined;
  const full = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/.exec(text);
  const timeOnly = /^(\d{1,2}):(\d{2})/.exec(text);
  if (full?.[1] && full[2] && full[3]) {
    datePart = full[1];
    timePart = `${full[2].padStart(2, "0")}:${full[3]}`;
  } else if (timeOnly?.[1] && timeOnly[2]) {
    timePart = `${timeOnly[1].padStart(2, "0")}:${timeOnly[2]}`;
    supuestos.push(`Fecha no declarada: se usa ${DEFAULT_DATE}.`);
  } else {
    timePart = HOUR_BY_LIGHT[iluminacion ?? "dia"] ?? "12:30";
    supuestos.push(
      `Hora no declarada: se usan las ${timePart} según la iluminación (${iluminacion ?? "dia"}) del ${DEFAULT_DATE}.`,
    );
  }
  const [hh, mm] = timePart.split(":").map(Number);
  const [y, mo, da] = datePart.split("-").map(Number);
  const utc =
    Date.UTC(y ?? 2025, (mo ?? 1) - 1, da ?? 1, hh ?? 12, mm ?? 0) -
    MEXICO_CENTRAL_OFFSET_MIN * 60_000;
  return { date: new Date(utc), supuestos };
}

export interface EnvironmentInput {
  fechaHora?: string;
  iluminacion?: string;
  clima?: string;
  alumbrado?: boolean;
  lat?: number;
  lon?: number;
  /** `lugar.estado_superficie` declarado (seco, mojado, encharcado, grava_suelta, aceite, lodo). */
  estadoSuperficie?: string;
  /** `entorno.visibilidad` declarada, en metros. */
  visibilidadM?: number;
}

export type Precipitation = "ninguna" | "lluvia_ligera" | "lluvia_fuerte" | "granizo";
export type SurfaceState = "seco" | "mojado" | "encharcado" | "grava_suelta" | "aceite" | "lodo";
const SURFACES: readonly SurfaceState[] = [
  "seco",
  "mojado",
  "encharcado",
  "grava_suelta",
  "aceite",
  "lodo",
];

/**
 * Densidad de `FogExp2` cuya transmisión cae al 5 % a la visibilidad declarada: el alcance óptico
 * meteorológico de la OMM se define con un umbral de contraste del 5 % (WMO-No. 8, cap. 9), y la
 * niebla de three.js atenúa como exp(−(d·z)²), así que d = √(ln 20) / V.
 */
export function fogDensityForVisibility(visibilityM: number): number {
  return Math.sqrt(Math.log(20)) / Math.max(visibilityM, 1);
}

export interface EnvironmentSettings {
  sun: SunPosition;
  /** Dirección hacia el sol (mundo). Si el sol está bajo el horizonte, la luz principal es la luna. */
  lightDirection: [number, number, number];
  sunIntensity: number;
  ambientIntensity: number;
  skyColor: string;
  /** Color de la luz ambiental (de noche no es el del cielo: alumbrado o luna). */
  ambientSkyColor: string;
  groundColor: string;
  fogDensity: number;
  night: boolean;
  /** El piso está mojado (declarado o, si no se declara el estado, por la lluvia). */
  wet: boolean;
  /** Estado del piso que se dibuja: el declarado o el que se supone por el clima. */
  surface: SurfaceState;
  /** Lo que cae del cielo; se dibuja con partículas (`precipitation.ts`). */
  precipitation: Precipitation;
  streetLights: boolean;
  turbidity: number;
  supuestos: string[];
}

/** Ajustes de luz y clima para la escena (valores visuales, no física). */
export function environmentFor(input: EnvironmentInput): EnvironmentSettings {
  const time = parseSceneTime(input.fechaHora, input.iluminacion);
  const supuestos = [...time.supuestos];
  let lat = input.lat;
  let lon = input.lon;
  if (lat === undefined || lon === undefined) {
    lat = TOLUCA.lat;
    lon = TOLUCA.lon;
    supuestos.push("Ubicación no declarada: el sol se calcula para el centro de Toluca.");
  }
  const sun = sunPosition(time.date, lat, lon);
  const declaredNight = (input.iluminacion ?? "").startsWith("noche");
  const night = declaredNight || sun.elevation < -4;
  const twilight = !night && sun.elevation < 15;
  const clima = input.clima ?? "despejado";
  const rain = clima === "lluvia_ligera" || clima === "lluvia_fuerte" || clima === "granizo";
  const overcast = rain || clima === "nublado" || clima === "niebla";
  // Con visibilidad declarada, la niebla la respeta; sin ella, densidades ilustrativas por clima.
  const fogDensity =
    input.visibilidadM !== undefined && input.visibilidadM > 0
      ? fogDensityForVisibility(input.visibilidadM)
      : clima === "niebla"
        ? 0.035
        : clima === "lluvia_fuerte"
          ? 0.018
          : clima === "lluvia_ligera"
            ? 0.008
            : 0.0015;
  const precipitation: Precipitation =
    clima === "lluvia_ligera" || clima === "lluvia_fuerte" || clima === "granizo"
      ? clima
      : clima === "lluvia"
        ? "lluvia_ligera"
        : "ninguna";
  const declared = SURFACES.find((x) => x === input.estadoSuperficie);
  let surface: SurfaceState = declared ?? "seco";
  if (declared === undefined && precipitation !== "ninguna") {
    surface = precipitation === "lluvia_fuerte" ? "encharcado" : "mojado";
    supuestos.push(
      `Estado del piso no declarado: se dibuja ${surface === "encharcado" ? "encharcado" : "mojado"} por la lluvia.`,
    );
  }
  const moon: [number, number, number] = [-0.3, 0.4, 0.86];
  // Con el sol muy bajo la luz directa rasante deja la escena a oscuras: para iluminar la escena
  // (no para calcular nada) la luz direccional se eleva al menos 6° sobre el horizonte.
  const lit = { ...sun, elevation: Math.max(sun.elevation, MIN_LIGHT_ELEVATION_DEG) };
  const lightDirection = night ? moon : sunDirection(lit);
  // El alumbrado declarado, o el que trae «noche con alumbrado»: el mismo para los focos y para la
  // luz ambiental (R10: antes la ambiental solo veía el campo aparte y la noche quedaba a oscuras).
  const alumbrado = night && (input.alumbrado ?? input.iluminacion === "noche_con_alumbrado");
  return {
    sun,
    lightDirection,
    sunIntensity: night ? 0.45 : twilight ? 2.2 : overcast ? 1.4 : 2.8,
    ambientIntensity: night ? (alumbrado ? 0.9 : 0.45) : twilight ? 1.25 : overcast ? 0.95 : 0.85,
    skyColor: night ? "#18223d" : twilight ? "#cdbbb0" : overcast ? "#9aa3ad" : "#8fc1ea",
    ambientSkyColor: night
      ? alumbrado
        ? "#c8b48c"
        : "#7184ad"
      : twilight
        ? "#cdbbb0"
        : overcast
          ? "#9aa3ad"
          : "#8fc1ea",
    groundColor: night ? "#2a3326" : "#5d6b4a",
    fogDensity,
    night,
    wet: surface === "mojado" || surface === "encharcado",
    surface,
    precipitation,
    streetLights: alumbrado,
    turbidity: overcast ? 10 : 2.5,
    supuestos,
  };
}
