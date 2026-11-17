/**
 * La nube de puntos de las simulaciones (ronda 2, A6; René la pidió de la propuesta «Sin antesala»):
 * cada punto es una simulación real del caso, en su km/h. El rango (donde cae el 80 %) va con un
 * corchete bajo el eje, y el mejor ajuste con la marca naranja. Sustituye al histograma de barras:
 * los mismos datos, pero se ve que el rango sale de muchas reconstrucciones y no de una fórmula.
 */
import { formato as F } from "@croquis/cesvi";
import {
  marcasDelEje,
  nubeDeSimulaciones,
  posEnHistograma,
  textoBarra,
  type BarraHistograma,
} from "@/lib/reconstruccion-lab";

/** El alto de cada punto con su separación (px). */
const PASO_PX = 9;

export function NubeSimulaciones({
  barras,
  muestras,
  mejor,
  p10,
  p90,
}: {
  barras: readonly BarraHistograma[];
  muestras: number;
  /** El mejor ajuste (km/h), para su marca. */
  mejor: number;
  p10: number | undefined;
  p90: number | undefined;
}) {
  const nube = nubeDeSimulaciones(barras);
  const filas = Math.max(1, ...nube.columnas.map((c) => c.puntos));
  const ini = barras[0]?.desde ?? 0;
  const ancho = Math.max(1, barras.length);
  const pos = (x: number) => ((x - ini) / ancho) * 100;
  const posMejor = posEnHistograma(barras, mejor);
  const conRango = p10 !== undefined && p90 !== undefined && p90 > p10;
  let k = 0;
  return (
    <div className="nube-simulaciones flex flex-col gap-1" data-testid="histograma">
      <div className="relative" style={{ height: `${Math.max(4, filas) * PASO_PX + 4}px` }}>
        <div className="flex h-full items-end" role="list" aria-label="Simulaciones por velocidad">
          {nube.columnas.map((c, j) => (
            <button
              key={c.desde}
              type="button"
              role="listitem"
              className="flex h-full min-w-0 flex-1 cursor-default flex-col-reverse items-center gap-px bg-transparent p-0"
              aria-label={textoBarra(barras[j]!)}
              data-tip={textoBarra(barras[j]!)}
              data-en-rango={c.enRango ? "si" : "no"}
              data-puntos={c.puntos}
            >
              {Array.from({ length: c.puntos }, (_, n) => (
                <span
                  key={n}
                  className="nube-punto"
                  data-en-rango={c.enRango ? "si" : "no"}
                  style={{ "--i": k++ } as React.CSSProperties}
                />
              ))}
            </button>
          ))}
        </div>
      </div>
      <div className="relative h-[1.9rem] border-t border-linea font-mono text-[0.6875rem] text-texto-3">
        {conRango ? (
          <span
            className="nube-corchete absolute top-0"
            style={{ left: `${pos(p10)}%`, width: `${pos(p90) - pos(p10)}%` }}
            data-testid="corchete-rango"
            aria-hidden="true"
          />
        ) : null}
        {posMejor !== null ? (
          <span
            className="absolute -top-[5px] z-10 grid h-[10px] w-[10px] -translate-x-1/2 place-items-center"
            style={{ left: `${posMejor}%` }}
            tabIndex={0}
            data-tip={`Mejor ajuste: ${F.kmhConUnidad(mejor, "reconstruccion")}`}
            data-testid="marca-mejor-ajuste"
          >
            <span className="h-[10px] w-[10px] rounded-full bg-senal" />
          </span>
        ) : null}
        {marcasDelEje(barras).map((m) => (
          <span
            key={m}
            className="absolute top-[0.7rem] -translate-x-1/2"
            style={{ left: `${pos(m)}%` }}
          >
            {m}
          </span>
        ))}
        <span className="absolute top-[0.7rem] right-0 translate-x-0 bg-superficie pl-1">km/h</span>
      </div>
      <p className="t-nota" data-testid="nube-leyenda">
        {nube.porPunto === 1
          ? `Cada punto es una de las ${muestras} simulaciones`
          : `Cada punto son ${nube.porPunto} de las ${muestras} simulaciones`}
        , al contacto: el mismo choque con lo incierto dentro de su rango.{" "}
        {conRango ? "El corchete marca donde cae el 80 %. " : ""}
        <span
          className="inline-block h-2 w-2 translate-y-[-1px] rounded-full bg-senal"
          aria-hidden="true"
        />{" "}
        mejor ajuste.
      </p>
    </div>
  );
}
