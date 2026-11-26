/**
 * Las fuentes, completas (René, 2026-11-25):
 * - Yan, H., Maat, K. y van Wee, B. (2024). Cycling speed variation: a multilevel model of
 *   characteristics of cyclists, trips and route tracking points. Transportation, 52(5), 1857–1886.
 *   doi:10.1007/s11116-024-10477-6
 * - Yan, X., Chen, J., Bai, H., Wang, T. y Yang, Z. (2020). Influence Factor Analysis of Bicycle
 *   Free-Flow Speed for Determining the Design Speeds of Separated Bicycle Lanes. Information,
 *   11(10), 459. doi:10.3390/info11100459
 * - Murtagh, E. M., Mair, J. L., Aguiar, E., Tudor-Locke, C. y Murphy, M. H. (2021). Outdoor Walking
 *   Speeds of Apparently Healthy Adults: A Systematic Review and Meta-analysis. Sports Medicine,
 *   51(1), 125–141. doi:10.1007/s40279-020-01351-3
 * - Reglamento de Tránsito en Carreteras y Puentes de Jurisdicción Federal, artículo 134 (Diario
 *   Oficial de la Federación; texto consultado con la reforma del 22-11-2012).
 *
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
    "más del doble de la velocidad media en bicicleta medida con GPS (Yan, Maat y van Wee, 2024, Transportation 52(5):1857–1886) y por arriba de las velocidades de diseño de 25 y 30 km/h de los carriles para bicicleta (Yan et al., 2020, Information 11(10):459)",
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
    "muy por arriba de la velocidad al caminar de adultos sanos (Murtagh et al., 2021, Sports Medicine 51(1):125–141); más de 25 km/h solo se corre a toda velocidad (el récord es de 44.72 km/h, Mundial de Atletismo de Berlín, 2009)",
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
