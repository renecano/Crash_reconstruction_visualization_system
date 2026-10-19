import type { Metadata } from "next";
import Link from "next/link";
import { Legend } from "@/components/legend";
import { GraficaVista, type Grafica } from "@/components/recorrido/graficas";
import datos from "@/data/recorrido.json";

export const metadata: Metadata = {
  title: "Recorrido técnico — Croquis",
  description:
    "Cómo se mide Croquis: cada evaluación contra una alternativa simple, con su script y su resultado versionado.",
};

interface Fuente {
  archivo: string;
  url: string;
}

interface Evaluacion {
  id: string;
  titulo: string;
  pregunta: string;
  graficas: Grafica[];
  fuentes: Fuente[];
  nota: string;
}

const evaluaciones = datos.evaluaciones as Evaluacion[];

export default function RecorridoPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-12">
      <header className="flex flex-col gap-4">
        <p className="text-sm">
          <Link href="/" className="underline">
            Croquis
          </Link>{" "}
          · Recorrido técnico
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Cómo sabemos lo que sabemos</h1>
        <p className="text-neutral-700 dark:text-neutral-300">
          La IA solo traduce el relato a datos; la física decide qué pasó y el visor lo muestra.
          Cada pieza se mide contra una alternativa simple, con un script cuyo resultado está
          versionado. Los tests se congelaron antes de medir y se corrieron una vez. Donde Croquis
          pierde, se dice.
        </p>
        <nav aria-label="Evaluaciones" className="flex flex-wrap gap-2 text-sm">
          {evaluaciones.map((e) => (
            <a
              key={e.id}
              href={`#${e.id}`}
              className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700"
            >
              {e.id}
            </a>
          ))}
        </nav>
      </header>

      {evaluaciones.map((e) => (
        <section
          key={e.id}
          id={e.id}
          aria-labelledby={`${e.id}-titulo`}
          className="flex scroll-mt-6 flex-col gap-4 border-t border-neutral-200 pt-6 dark:border-neutral-800"
        >
          <div>
            <p className="font-mono text-xs text-neutral-500">{e.id}</p>
            <h2 id={`${e.id}-titulo`} className="text-xl font-semibold">
              {e.titulo}
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">{e.pregunta}</p>
          </div>
          {e.graficas.map((g, i) => (
            <GraficaVista key={i} g={g} />
          ))}
          <p className="text-sm text-neutral-700 dark:text-neutral-300">{e.nota}</p>
          {e.fuentes.length ? (
            <p className="text-xs text-neutral-500">
              Resultado:{" "}
              {e.fuentes.map((f, i) => (
                <span key={f.archivo}>
                  {i > 0 ? ", " : ""}
                  <a href={f.url} className="font-mono underline">
                    {f.archivo}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
        </section>
      ))}

      <footer className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <Legend />
      </footer>
    </main>
  );
}
