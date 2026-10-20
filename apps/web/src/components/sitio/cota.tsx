/**
 * Una medición como cota de dibujo técnico (PLAN §11.1, principio 6): una línea de medida con sus
 * topes, el valor con cifras tabulares, la unidad y el enlace a su evaluación. Con varias filas,
 * el largo de cada línea es proporcional a su valor, así que se comparan de un vistazo.
 */
import Link from "next/link";

export interface FilaCota {
  nombre: string;
  valor: number;
  /** El valor ya formateado (con los decimales de su evaluación). */
  texto: string;
  /** La fila de Croquis va en blanco vial; las alternativas, en concreto. */
  croquis?: boolean;
}

export function Cota({
  etiqueta,
  filas,
  unidad,
  href,
  enlace,
  nota,
}: {
  etiqueta: string;
  filas: FilaCota[];
  unidad?: string;
  href: string;
  enlace: string;
  nota?: string;
}) {
  const max = Math.max(...filas.map((f) => f.valor), 1e-9);
  return (
    <figure className="m-0 flex flex-col gap-3" data-testid="cota">
      <figcaption className="t-nota text-texto-2">{etiqueta}</figcaption>
      <ul className="flex flex-col gap-2">
        {filas.map((f) => (
          <li
            key={f.nombre}
            className="grid grid-cols-[7.5rem_1fr] items-center gap-3 sm:grid-cols-[9rem_1fr]"
          >
            <span className={`t-nota ${f.croquis ? "text-texto" : "text-texto-3"}`}>
              {f.nombre}
            </span>
            <span className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`relative block h-3 ${f.croquis ? "text-texto" : "text-texto-3"}`}
                style={{ width: `${Math.max(8, (f.valor / max) * 72)}%` }}
              >
                <span className="absolute inset-y-0 left-0 w-px bg-current" />
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current" />
                <span className="absolute inset-y-0 right-0 w-px bg-current" />
              </span>
              <span
                className={`t-cota text-lg whitespace-nowrap ${f.croquis ? "text-texto" : "text-texto-2"}`}
              >
                {f.texto}
                {unidad ? <span className="t-nota ml-1">{unidad}</span> : null}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {nota ? <p className="t-nota">{nota}</p> : null}
      <Link href={href} className="t-nota self-start">
        {enlace}
      </Link>
    </figure>
  );
}
