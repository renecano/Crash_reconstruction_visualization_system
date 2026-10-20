"use client";
/**
 * Los cuatro pasos del flujo como tramos de carril (docs/design/plan.md §3): el actual es raya
 * continua, los hechos discontinua sólida y los que faltan discontinua tenue. Es una secuencia
 * real: se puede volver a cualquier paso alcanzado sin perder nada.
 */
import { useTextos } from "@/i18n/cliente";
import { TEXTOS_FLUJO } from "./textos";

export const PASOS = ["cuenta", "falta", "ubica", "simula"] as const;
export type Paso = (typeof PASOS)[number];

export function PasosDelFlujo({
  actual,
  alcanzado,
  onIr,
}: {
  actual: Paso;
  /** El paso más lejano al que se puede ir con lo que ya hay. */
  alcanzado: Paso;
  onIr: (p: Paso) => void;
}) {
  const t = useTextos(TEXTOS_FLUJO).pasos;
  const iActual = PASOS.indexOf(actual);
  const iAlcanzado = PASOS.indexOf(alcanzado);
  return (
    <nav aria-label={t.etiqueta} data-testid="pasos">
      <ol className="grid grid-cols-4 gap-2 sm:gap-4">
        {PASOS.map((p, i) => {
          const estado =
            i === iActual ? "actual" : i < iActual || i <= iAlcanzado ? "hecho" : "pendiente";
          const alcanzable = i <= iAlcanzado;
          const raya =
            estado === "actual"
              ? "bg-texto"
              : estado === "hecho"
                ? "raya-discontinua opacity-80"
                : "raya-discontinua opacity-25";
          return (
            <li key={p} className="flex flex-col gap-2">
              <span aria-hidden="true" className={`block h-[3px] w-full ${raya}`} />
              <button
                type="button"
                disabled={!alcanzable}
                aria-current={estado === "actual" ? "step" : undefined}
                onClick={() => onIr(p)}
                data-testid={`paso-${p}`}
                className={`t-interfaz text-left disabled:cursor-default ${
                  estado === "actual"
                    ? "text-texto"
                    : alcanzable
                      ? "text-texto-2 hover:text-texto"
                      : "text-texto-3"
                }`}
              >
                <span>{t[p]}</span>
                <span className="sr-only">
                  {" "}
                  ({estado === "actual" ? t.actual : estado === "hecho" ? t.hecho : t.pendiente})
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
