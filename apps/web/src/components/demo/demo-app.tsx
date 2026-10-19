"use client";

/**
 * Demo «Tú eres…» (PLAN §11): el visitante elige un relato, ve campo por campo qué entendió la IA
 * (respuesta grabada de Claude, sin llamar a la API), contesta las preguntas, corrige el croquis,
 * ve la reconstrucción y compara hipótesis. Todo corre en el navegador, sin servidor: las rondas de
 * preguntas con `responder` y la reconstrucción en el Web Worker del visor.
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Legend } from "@/components/legend";
import { FactsPanel } from "@/components/relato/facts-panel";
import { QuestionsPanel } from "@/components/relato/questions-panel";
import { guardarEscenaPropia } from "@/lib/escena-propia";
import { RELATO_SPEC_KEY, type Pregunta } from "@/lib/relato-api";
import { responder } from "@/lib/responder";

export interface CasoDemo {
  id: string;
  titulo: string;
  tipo: string;
  texto: string;
  spec: unknown;
  preguntas: unknown[];
}

const TIPO: Record<string, string> = {
  vv: "Entre vehículos",
  moto: "Motocicleta",
  objeto: "Contra un objeto",
  peaton: "Peatón",
  volcadura: "Volcadura",
  ciclista: "Ciclista",
};

export interface DemoAppProps {
  casos: CasoDemo[];
  metodo: string;
  fuente: string;
}

export function DemoApp({ casos, metodo, fuente }: DemoAppProps) {
  const router = useRouter();
  const [caso, setCaso] = useState<CasoDemo | null>(null);
  const [spec, setSpec] = useState<EscenaSpec | null>(null);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [contestadas, setContestadas] = useState<string[]>([]);
  const [rondas, setRondas] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const elegir = (c: CasoDemo) => {
    setCaso(c);
    setSpec(c.spec as EscenaSpec);
    setPreguntas(c.preguntas as Pregunta[]);
    setContestadas([]);
    setRondas(0);
    setError(null);
  };

  const contestar = (respuestas: Record<string, string>, omitidas: string[]) => {
    if (!caso || !spec) return;
    const ya = [...contestadas, ...omitidas];
    try {
      const r = responder(spec as unknown as Record<string, unknown>, caso.texto, respuestas, ya);
      setSpec(r.spec as unknown as EscenaSpec);
      setPreguntas(r.preguntas as unknown as Pregunta[]);
      setContestadas([...ya, ...Object.keys(respuestas)]);
      setRondas((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const abrirCroquis = () => {
    if (!spec) return;
    try {
      sessionStorage.setItem(RELATO_SPEC_KEY, JSON.stringify(spec));
      router.push("/croquis?fuente=relato");
    } catch {
      setError("El navegador no permitió guardar la escena para abrirla en el croquis.");
    }
  };

  const ver3d = () => {
    if (!spec) return;
    if (guardarEscenaPropia(spec)) router.push("/visor?escena=propia");
    else setError("El navegador no permitió guardar la escena para abrirla en el visor.");
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Elige un relato" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">1. Elige un relato</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {casos.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                data-testid={`demo-caso-${c.id}`}
                aria-pressed={caso?.id === c.id}
                onClick={() => elegir(c)}
                className={`w-full rounded border px-3 py-2 text-left text-sm ${
                  caso?.id === c.id
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                    : "border-neutral-300 dark:border-neutral-700"
                }`}
              >
                <span className="block text-xs opacity-70">{TIPO[c.tipo] ?? c.tipo}</span>
                {c.titulo}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-neutral-500">
          {fuente}. Lo que entendió la IA: {metodo}.
        </p>
      </section>

      {caso && spec ? (
        <>
          <section aria-label="El relato" className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">2. Imagina que te pasó a ti</h2>
            <blockquote
              data-testid="demo-relato"
              className="border-l-4 border-neutral-300 pl-3 leading-relaxed italic dark:border-neutral-700"
            >
              {caso.texto}
            </blockquote>
          </section>

          <section aria-label="Lo que entendió la IA" className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">3. Lo que entendió la IA, campo por campo</h2>
            <FactsPanel spec={spec} />
          </section>

          <section aria-label="Preguntas" className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">4. Lo que falta</h2>
            {rondas > 0 ? (
              <p
                data-testid="demo-rondas"
                className="text-sm text-neutral-600 dark:text-neutral-400"
              >
                Rondas contestadas: {rondas}. Tus respuestas ya están en la escena, marcadas como
                dato tuyo.
              </p>
            ) : null}
            <QuestionsPanel preguntas={preguntas} onSubmit={contestar} />
          </section>

          <section aria-label="Siguiente" className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">5. Corrige y míralo</h2>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              En el croquis acomodas autos y calles; en el visor lo ves en 3D y, en el panel de
              hipótesis, comparas qué cambia si la velocidad fuera otra. Todo se calcula aquí, en
              este dispositivo.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="demo-croquis"
                onClick={abrirCroquis}
                className="rounded border border-neutral-400 px-4 py-2 font-medium"
              >
                Corregir en el croquis
              </button>
              <button
                type="button"
                data-testid="demo-3d"
                onClick={ver3d}
                className="rounded bg-neutral-900 px-4 py-2 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
              >
                Ver en 3D y comparar hipótesis
              </button>
            </div>
          </section>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <Legend />
    </div>
  );
}
