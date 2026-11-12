/**
 * Las cámaras que piden las pestañas de `/cesvi` («Órbita 3D», «Detrás de A», «Conductor A») en el
 * nombre del puente de Unity (`CamaraVisor` de `visor-puente.ts`).
 */
import type { CamaraVisor } from "@croquis/scene-schema";

export function camaraUnity(pedida: string | null | undefined): CamaraVisor {
  if (!pedida) return "cinematica";
  if (pedida === "libre" || pedida === "orbita") return "orbita";
  if (pedida.startsWith("conductor-")) return `conductor:${pedida.slice("conductor-".length)}`;
  if (pedida.startsWith("conductor:")) return pedida as CamaraVisor;
  // «Detrás de A» en three.js sigue al vehículo; en Unity la cinematográfica es la que va detrás
  // de la acción.
  if (pedida.startsWith("detras-")) return "cinematica";
  if (
    pedida === "cenital" ||
    pedida === "cinematica" ||
    pedida === "acera"
  )
    return pedida;
  return "cinematica";
}
