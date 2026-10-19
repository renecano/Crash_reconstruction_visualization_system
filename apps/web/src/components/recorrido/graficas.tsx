/**
 * Gráficas del recorrido técnico (PLAN §11): barras horizontales en HTML, legibles en el teléfono
 * y por lectores de pantalla. Los valores vienen de `eval/results/` (`scripts/build-paginas.mjs`).
 */
import { numero } from "@/lib/formato";

export { numero };

export interface Barra {
  etiqueta: string;
  valor: number;
  croquis: boolean;
}

export interface Meta {
  etiqueta: string;
  valor: number;
}

export interface Grupo {
  grupo: string;
  barras: Barra[];
}

export interface Cifra {
  etiqueta: string;
  valor: number | string;
  formato: "entero" | "cientifico" | "texto";
}

export type Grafica =
  | {
      tipo: "barras";
      titulo: string;
      metrica: string;
      mejor: "mayor" | "menor";
      unidad: string;
      barras: Barra[];
      metas?: Meta[];
    }
  | {
      tipo: "grupos";
      titulo: string;
      metrica: string;
      mejor: "mayor" | "menor";
      unidad: string;
      grupos: Grupo[];
    }
  | { tipo: "cifras"; cifras: Cifra[] };

const SUPERINDICE: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

export function cifra(c: Cifra): string {
  if (typeof c.valor === "string") return c.valor;
  if (c.formato === "cientifico") {
    const [m, e] = c.valor.toExponential(1).split("e");
    const sup = [...String(Number(e))].map((ch) => SUPERINDICE[ch] ?? ch).join("");
    return `${m} × 10${sup}`;
  }
  return numero(c.valor);
}

/** Índice de la barra con el mejor valor (la más baja o la más alta, según la métrica). */
export function mejorIndice(barras: Barra[], mejor: "mayor" | "menor"): number {
  let best = 0;
  barras.forEach((b, i) => {
    if (mejor === "menor" ? b.valor < barras[best]!.valor : b.valor > barras[best]!.valor) best = i;
  });
  return best;
}

function Filas({
  barras,
  unidad,
  mejor,
  escala,
}: {
  barras: Barra[];
  unidad: string;
  mejor: "mayor" | "menor";
  escala: number;
}) {
  const best = mejorIndice(barras, mejor);
  return (
    <ul className="flex flex-col gap-1.5">
      {barras.map((b, i) => (
        <li
          key={b.etiqueta}
          className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2 text-sm"
          data-croquis={b.croquis || undefined}
        >
          <span className={b.croquis ? "font-medium" : "text-neutral-600 dark:text-neutral-400"}>
            {b.etiqueta}
          </span>
          <span className="h-4 rounded-sm bg-neutral-100 dark:bg-neutral-800" aria-hidden="true">
            <span
              className={`block h-4 rounded-sm ${
                b.croquis
                  ? "bg-neutral-900 dark:bg-neutral-100"
                  : "bg-neutral-400 dark:bg-neutral-500"
              }`}
              style={{ width: `${Math.max(1, (100 * b.valor) / escala)}%` }}
            />
          </span>
          <span className="tabular-nums">
            {numero(b.valor)}
            {unidad ? ` ${unidad}` : ""}
            {i === best ? (
              <span className="ml-1 text-xs text-neutral-500" title="mejor valor">
                ★
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Pie({ metrica, mejor }: { metrica: string; mejor: "mayor" | "menor" }) {
  return (
    <p className="mt-2 text-xs text-neutral-500">
      {metrica}: {mejor === "menor" ? "menos es mejor" : "más es mejor"}. ★ mejor valor.
    </p>
  );
}

export function GraficaVista({ g }: { g: Grafica }) {
  if (g.tipo === "cifras") {
    return (
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {g.cifras.map((c) => (
          <div
            key={c.etiqueta}
            className="rounded border border-neutral-200 p-3 dark:border-neutral-700"
          >
            <dt className="text-xs text-neutral-500">{c.etiqueta}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{cifra(c)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (g.tipo === "barras") {
    const escala =
      1.08 * Math.max(...g.barras.map((b) => b.valor), ...(g.metas ?? []).map((m) => m.valor));
    return (
      <figure>
        <figcaption className="mb-2 text-sm font-medium">{g.titulo}</figcaption>
        <Filas barras={g.barras} unidad={g.unidad} mejor={g.mejor} escala={escala} />
        {g.metas?.length ? (
          <p className="mt-2 text-xs text-neutral-500">
            {g.metas.map((m) => `${m.etiqueta}: ${numero(m.valor)} ${g.unidad}`).join(" · ")}
          </p>
        ) : null}
        <Pie metrica={g.metrica} mejor={g.mejor} />
      </figure>
    );
  }
  const escala = 1.08 * Math.max(...g.grupos.flatMap((x) => x.barras.map((b) => b.valor)));
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium">{g.titulo}</figcaption>
      <div className="flex flex-col gap-3">
        {g.grupos.map((x) => (
          <div key={x.grupo}>
            <p className="mb-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
              {x.grupo}
            </p>
            <Filas barras={x.barras} unidad={g.unidad} mejor={g.mejor} escala={escala} />
          </div>
        ))}
      </div>
      <Pie metrica={g.metrica} mejor={g.mejor} />
    </figure>
  );
}
