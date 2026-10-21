/** Una fórmula del método de CESVI como la escribe el dictamen: general, sustituida y resultado. */
import type { PasoFormula } from "@croquis/cesvi";

export function Formula({ paso, etiqueta }: { paso: PasoFormula; etiqueta?: string }) {
  return (
    <figure className="flex flex-col gap-1 overflow-x-auto border-l-2 border-linea py-1 pl-4">
      {etiqueta ? <figcaption className="t-nota text-texto-2">{etiqueta}</figcaption> : null}
      <p className="t-cota text-texto-2">{paso.general}</p>
      <p className="t-cota">{paso.sustituida}</p>
      {paso.intermedios.map((linea) => (
        <p key={linea} className="t-cota text-texto-2">
          {linea}
        </p>
      ))}
      <p className="t-cota font-semibold" data-testid="resultado-formula">
        {paso.resultado}
      </p>
    </figure>
  );
}
