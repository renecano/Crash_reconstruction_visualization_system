/**
 * La atribución de los modelos de vehículos (CC-BY, ADR 0086) cuando las fotos salen de Unity (U6).
 * Unity dibuja los mismos modelos que el visor three.js (el mismo manifiesto `vehiculos.json` de
 * Blob), así que el dictamen los acredita igual: uno por cada clase de vehículo de la escena.
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { MODEL_FOR_CLASS, type VehicleCredit } from "@croquis/viewer";

/** Igual que `VEHICLE_MODEL_BASE_URL` del visor (`packages/viewer`, congelado): Blob en producción. */
const BASE_MODELOS = process.env.CROQUIS_RECURSOS_VEHICULOS || "/modelos/vehiculos/";

interface Entrada {
  modelo: { nombre: string; autor: string; licencia: string; url: string };
}

/** Los créditos de los modelos que dibuja una escena, sin repetir, a partir del manifiesto. */
export function creditosDeEscena(
  escena: Pick<EscenaSpec, "vehiculos">,
  manifiesto: { clases: Record<string, Entrada> },
): VehicleCredit[] {
  const out = new Map<string, VehicleCredit>();
  for (const v of escena.vehiculos) {
    const clase = MODEL_FOR_CLASS[v.clase.valor];
    const m = clase ? manifiesto.clases[clase]?.modelo : undefined;
    if (m) out.set(m.url, { modelo: m.nombre, autor: m.autor, licencia: m.licencia, url: m.url });
  }
  return [...out.values()];
}

let manifiesto: Promise<{ clases: Record<string, Entrada> }> | null = null;

export async function creditosDelVisorUnity(
  escena: Pick<EscenaSpec, "vehiculos">,
): Promise<VehicleCredit[]> {
  manifiesto ??= fetch(`${BASE_MODELOS}vehiculos.json`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<{ clases: Record<string, Entrada> }>;
    })
    .catch((e: unknown) => {
      manifiesto = null;
      throw e;
    });
  return creditosDeEscena(escena, await manifiesto);
}
