/**
 * Una velocidad que pasa de lo razonable para su tipo de vehículo (René, 2026-11-25: en aud-09 el
 * ciclista salía a 42 km/h). Es un aviso, no un bloqueo: el perito decide. Cada umbral dice de dónde
 * sale, y la cifra y el umbral van juntos en el límite que lee el perito.
 */
import { kmhConUnidad } from "./formato";

export interface UmbralVelocidad {
  /** El tipo, como lo lee el perito. */
  tipo: string;
  /** Desde cuántos km/h se avisa. */
  kmh: number;
  /** Por qué ese número y de dónde sale. */
  fuente: string;
}

const BICICLETA: UmbralVelocidad = {
  tipo: "bicicleta",
  kmh: 40,
  fuente:
    "el doble de lo más alto de lo usual: la mayoría de las velocidades en bicicleta medidas en la literatura van de 12 a 20 km/h (revisión en Information 11(10):459, MDPI, 2020; y en Transportation, Springer, 2024, doi 10.1007/s11116-024-10477-6)",
};
const MOTOCICLETA: UmbralVelocidad = {
  tipo: "motocicleta",
  kmh: 140,
  fuente:
    "30 km/h por arriba de la máxima del Reglamento de Tránsito en Carreteras y Puentes de Jurisdicción Federal (110 km/h donde un señalamiento la fija; art. 134)",
};
const CAMION: UmbralVelocidad = {
  tipo: "camión de carga",
  kmh: 110,
  fuente:
    "30 km/h por arriba de la máxima del Reglamento de Tránsito en Carreteras y Puentes de Jurisdicción Federal para camiones y tractocamiones (80 km/h de día; art. 134)",
};
const AUTOBUS: UmbralVelocidad = {
  tipo: "autobús",
  kmh: 125,
  fuente:
    "30 km/h por arriba de la máxima del Reglamento de Tránsito en Carreteras y Puentes de Jurisdicción Federal para autobuses (95 km/h de día; art. 134)",
};
/** Peatón (una persona, no un vehículo del expediente). */
export const UMBRAL_PEATON: UmbralVelocidad = {
  tipo: "peatón",
  kmh: 25,
  fuente:
    "caminando se llega a unos 9 km/h y se pasa a correr hacia los 7 km/h; más de 25 km/h solo lo corre un velocista entrenado (el récord es de 44.7 km/h); revisión de velocidades al caminar en Sports Medicine, 2020 (PubMed 33030707)",
};

/** Las clases del contrato (`escena.schema.json`) que tienen un umbral. */
const POR_CLASE: Record<string, UmbralVelocidad> = {
  bicicleta: BICICLETA,
  scooter: BICICLETA,
  motocicleta: MOTOCICLETA,
  camion_unitario: CAMION,
  tractocamion: CAMION,
  autobus: AUTOBUS,
};

/** El umbral de una clase de vehículo, o null si no tiene (autos, camionetas, combis). */
export function umbralDeClase(clase: string | null | undefined): UmbralVelocidad | null {
  return clase ? (POR_CLASE[clase] ?? null) : null;
}

/** El aviso que lee el perito si la cifra pasa del umbral de su tipo; null si no. */
export function avisoVelocidadRazonable(
  vehiculo: string,
  umbral: UmbralVelocidad | null,
  kmh: number | null | undefined,
): string | null {
  if (!umbral || kmh === null || kmh === undefined || !(kmh > umbral.kmh)) return null;
  return (
    `${vehiculo} (${umbral.tipo}): la cifra (${kmhConUnidad(kmh, "reconstruccion")}) pasa de lo razonable para su tipo, ` +
    `más de ${umbral.kmh} km/h (${umbral.fuente}). Revisa la evidencia del caso; la decisión es del perito.`
  );
}
