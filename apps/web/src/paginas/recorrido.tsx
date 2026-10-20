import { Legend } from "@/components/legend";
import { GraficaVista, type Grafica, type Texto } from "@/components/recorrido/graficas";
import { CabeceraPagina } from "@/components/sitio/cabecera-pagina";
import { Marco } from "@/components/sitio/marco";
import datos from "@/data/recorrido.json";
import { textos, textosEn, type Lang } from "@/i18n";

interface Fuente {
  archivo: string;
  url: string;
}

interface Evaluacion {
  id: string;
  titulo: Texto;
  pregunta: Texto;
  graficas: Grafica[];
  fuentes: Fuente[];
  nota: Texto;
}

const evaluaciones = datos.evaluaciones as Evaluacion[];

const T = textos(
  {
    titulo: "Cómo sabemos lo que sabemos",
    intro:
      "La IA solo traduce el relato a datos; la física decide qué pasó y el visor lo muestra. Cada pieza se mide contra una alternativa simple, con un script cuyo resultado está versionado. Los tests se congelaron antes de medir y se corrieron una vez. Donde Croquis pierde, se dice.",
    indice: "Evaluaciones",
    resultado: "Resultado:",
  },
  {
    titulo: "How we know what we know",
    intro:
      "The AI only translates the narrative into data; physics decides what happened and the viewer shows it. Each piece is measured against a simple alternative, with a script whose result is versioned. The tests were frozen before measuring and run once. Where Croquis loses, it says so.",
    indice: "Evaluations",
    resultado: "Result:",
  },
);

export default function RecorridoPage({ lang }: { lang: Lang }) {
  const t = textosEn(T, lang);
  return (
    <Marco lang={lang}>
      <div className="pagina flex flex-col gap-12 py-10 md:py-14">
        <CabeceraPagina titulo={t.titulo} intro={t.intro}>
          <nav aria-label={t.indice} className="flex flex-wrap gap-2">
            {evaluaciones.map((e) => (
              <a
                key={e.id}
                href={`#${e.id}`}
                className="t-cota inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-linea px-3 no-underline hover:border-texto-3"
              >
                {e.id}
              </a>
            ))}
          </nav>
        </CabeceraPagina>

        {evaluaciones.map((e) => (
          <section
            key={e.id}
            id={e.id}
            aria-labelledby={`${e.id}-titulo`}
            className="grid scroll-mt-24 gap-6 border-t border-linea pt-8 lg:grid-cols-12"
          >
            <div className="flex flex-col gap-3 lg:col-span-4">
              <p className="t-cota text-texto-3">{e.id}</p>
              <h2 id={`${e.id}-titulo`} className="t-titulo">
                {e.titulo[lang]}
              </h2>
              <p className="t-cuerpo text-texto-2">{e.pregunta[lang]}</p>
            </div>
            <div className="flex flex-col gap-8 lg:col-span-8">
              {e.graficas.map((g, i) => (
                <GraficaVista key={i} g={g} lang={lang} />
              ))}
              <p className="t-interfaz max-w-[68ch] text-texto-2">{e.nota[lang]}</p>
              {e.fuentes.length ? (
                <p className="t-nota">
                  {t.resultado}{" "}
                  {e.fuentes.map((f, i) => (
                    <span key={f.archivo}>
                      {i > 0 ? ", " : ""}
                      <a href={f.url} className="cifras">
                        {f.archivo}
                      </a>
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          </section>
        ))}

        <footer className="border-t border-linea pt-6">
          <Legend />
        </footer>
      </div>
    </Marco>
  );
}
