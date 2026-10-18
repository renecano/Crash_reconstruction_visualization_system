/**
 * Leyenda obligatoria (PLAN §10): se muestra en el visor y en toda exportación.
 * El texto es fijo; la semilla y el hash de entradas se agregan cuando existen.
 */
import { LEGEND_TEXT } from "@croquis/scene-schema";

// El texto vive en @croquis/scene-schema: lo comparten el visor, las exportaciones y el croquis.
export { LEGEND_TEXT };

export interface LegendProps {
  seed?: number | string;
  inputHash?: string;
  /** "clara" para fondos oscuros (sobre el visor 3D). */
  tone?: "normal" | "clara";
  /** Atribución de los datos del mapa (ODbL, ADR 0023) cuando la escena trae `red_vial`. */
  atribucion?: string;
}

export function Legend({ seed, inputHash, tone = "normal", atribucion }: LegendProps) {
  return (
    <p
      role="note"
      aria-label="Leyenda de reconstrucción ilustrativa"
      className={
        tone === "clara" ? "text-sm text-white" : "text-sm text-neutral-600 dark:text-neutral-400"
      }
    >
      {LEGEND_TEXT}
      {seed !== undefined ? <span className="ml-2 font-mono">semilla {String(seed)}</span> : null}
      {inputHash ? <span className="ml-2 font-mono">hash {inputHash.slice(0, 12)}</span> : null}
      {atribucion ? (
        <span className="block text-xs" data-testid="atribucion-mapa">
          {atribucion}
        </span>
      ) : null}
    </p>
  );
}
