/**
 * Gráficas del recorrido técnico (PLAN §11.5): barras horizontales en HTML, legibles en el
 * teléfono y por lectores de pantalla. Los valores y los textos (en los dos idiomas) vienen de
 * `eval/results/` por `scripts/build-paginas.mjs`.
 */
import { textosEn, textos, type Lang } from "@/i18n";
import { numero } from "@/lib/formato";

export { numero };

/** Un texto generado en los dos idiomas del sitio. */
export interface Texto {
  es: string;
  en: string;
}

export interface Barra {
  etiqueta: Texto;
  valor: number;
  croquis: boolean;
}

export interface Meta {
  etiqueta: Texto;
  valor: number;
}

export interface Grupo {
  grupo: Texto;
  barras: Barra[];
}

export interface Cifra {
  etiqueta: Texto;
  valor: number | Texto;
  formato: "entero" | "cientifico" | "texto";
}

export type Grafica =
  | {
      tipo: "barras";
      titulo: Texto;
      metrica: Texto;
      mejor: "mayor" | "menor";
      unidad: string;
      barras: Barra[];
      metas?: Meta[];
    }
  | {
      tipo: "grupos";
      titulo: Texto;
      metrica: Texto;
      mejor: "mayor" | "menor";
      unidad: string;
      grupos: Grupo[];
    }
  | { tipo: "cifras"; cifras: Cifra[] };

const T = textos(
  {
    mejorValor: "mejor valor",
    menos: "menos es mejor",
    mas: "más es mejor",
    leyenda: "★ mejor valor.",
  },
  {
    mejorValor: "best value",
    menos: "lower is better",
    mas: "higher is better",
    leyenda: "★ best value.",
  },
);

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

export function cifra(c: Cifra, lang: Lang = "es"): string {
  if (typeof c.valor === "object") return c.valor[lang];
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
  lang,
}: {
  barras: Barra[];
  unidad: string;
  mejor: "mayor" | "menor";
  escala: number;
  lang: Lang;
}) {
  const t = textosEn(T, lang);
  const best = mejorIndice(barras, mejor);
  return (
    <ul className="flex flex-col gap-2">
      {barras.map((b, i) => (
        <li
          key={b.etiqueta.es}
          className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[9.5rem_1fr_auto]"
          data-croquis={b.croquis || undefined}
        >
          <span className={`t-nota ${b.croquis ? "text-texto" : "text-texto-3"}`}>
            {b.etiqueta[lang]}
          </span>
          <span className="h-3 rounded-control bg-superficie-alta" aria-hidden="true">
            <span
              className={`block h-3 rounded-control ${b.croquis ? "bg-texto" : "bg-texto-3"}`}
              style={{ width: `${Math.max(1, (100 * b.valor) / escala)}%` }}
            />
          </span>
          <span className={`t-cota whitespace-nowrap ${b.croquis ? "text-texto" : "text-texto-2"}`}>
            {numero(b.valor)}
            {unidad ? <span className="t-nota ml-1">{unidad}</span> : null}
            {i === best ? (
              <span className="t-nota ml-1" title={t.mejorValor}>
                ★<span className="sr-only"> {t.mejorValor}</span>
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Pie({ metrica, mejor, lang }: { metrica: Texto; mejor: "mayor" | "menor"; lang: Lang }) {
  const t = textosEn(T, lang);
  return (
    <p className="t-nota mt-3">
      {metrica[lang]}: {mejor === "menor" ? t.menos : t.mas}. {t.leyenda}
    </p>
  );
}

export function GraficaVista({ g, lang = "es" }: { g: Grafica; lang?: Lang }) {
  if (g.tipo === "cifras") {
    return (
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {g.cifras.map((c) => (
          <div key={c.etiqueta.es} className="rounded-panel border border-linea bg-superficie p-4">
            <dt className="t-nota">{c.etiqueta[lang]}</dt>
            <dd className="t-cota mt-1 text-3xl text-texto">{cifra(c, lang)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (g.tipo === "barras") {
    const escala =
      1.08 * Math.max(...g.barras.map((b) => b.valor), ...(g.metas ?? []).map((m) => m.valor));
    return (
      <figure className="m-0">
        <figcaption className="t-interfaz mb-3 text-texto">{g.titulo[lang]}</figcaption>
        <Filas barras={g.barras} unidad={g.unidad} mejor={g.mejor} escala={escala} lang={lang} />
        {g.metas?.length ? (
          <p className="t-nota mt-3">
            {g.metas.map((m) => `${m.etiqueta[lang]}: ${numero(m.valor)} ${g.unidad}`).join(" · ")}
          </p>
        ) : null}
        <Pie metrica={g.metrica} mejor={g.mejor} lang={lang} />
      </figure>
    );
  }
  const escala = 1.08 * Math.max(...g.grupos.flatMap((x) => x.barras.map((b) => b.valor)));
  return (
    <figure className="m-0">
      <figcaption className="t-interfaz mb-3 text-texto">{g.titulo[lang]}</figcaption>
      <div className="flex flex-col gap-4">
        {g.grupos.map((x) => (
          <div key={x.grupo.es}>
            <p className="t-nota mb-2 text-texto-2">{x.grupo[lang]}</p>
            <Filas
              barras={x.barras}
              unidad={g.unidad}
              mejor={g.mejor}
              escala={escala}
              lang={lang}
            />
          </div>
        ))}
      </div>
      <Pie metrica={g.metrica} mejor={g.mejor} lang={lang} />
    </figure>
  );
}
