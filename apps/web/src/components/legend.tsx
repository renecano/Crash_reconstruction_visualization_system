/**
 * Leyenda obligatoria (PLAN §10): se muestra en el visor y en toda exportación.
 * El texto es fijo; la semilla y el hash de entradas se agregan cuando existen.
 */
export const LEGEND_TEXT =
  "Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje.";

export interface LegendProps {
  seed?: number | string;
  inputHash?: string;
  /** "clara" para fondos oscuros (sobre el visor 3D). */
  tone?: "normal" | "clara";
}

export function Legend({ seed, inputHash, tone = "normal" }: LegendProps) {
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
    </p>
  );
}
