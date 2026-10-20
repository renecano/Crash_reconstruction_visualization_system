"use client";

/**
 * Demo «Tú eres…» (PLAN §11.5): el visitante elige un relato, ve campo por campo qué entendió la IA
 * (respuesta grabada de Claude, sin llamar a la API), contesta las preguntas, corrige el croquis,
 * ve la reconstrucción y compara hipótesis. Todo corre en el navegador, sin servidor: las rondas de
 * preguntas con `responder` y la reconstrucción en el Web Worker del visor.
 *
 * Los relatos son de Relatos-MX y se quedan en su español original (`lang="es-MX"`); todo lo demás
 * va en el idioma de la página.
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Legend } from "@/components/legend";
import { FactsPanel } from "@/components/relato/facts-panel";
import { QuestionsPanel } from "@/components/relato/questions-panel";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { guardarEscenaPropia } from "@/lib/escena-propia";
import { RELATO_SPEC_KEY, type Pregunta } from "@/lib/relato-api";
import { responder } from "@/lib/responder";

export interface CasoDemo {
  id: string;
  titulo: string;
  titulo_en: string;
  tipo: string;
  texto: string;
  /** Traducción para la página en inglés; la IA lee el original. */
  texto_en?: string;
  spec: unknown;
  preguntas: unknown[];
}

const T = textos(
  {
    tipos: {
      vv: "Entre vehículos",
      moto: "Motocicleta",
      objeto: "Contra un objeto",
      peaton: "Peatón",
      volcadura: "Volcadura",
      ciclista: "Ciclista",
    } as Record<string, string>,
    elige: "Elige un relato",
    origen: (fuente: string, metodo: string) => `${fuente}. Lo que entendió la IA: ${metodo}.`,
    imagina: "Imagina que te pasó a ti",
    traduccion: "",
    entendio: "Lo que entendió la IA, campo por campo",
    falta: "Lo que falta",
    rondas: (n: number) =>
      `Rondas contestadas: ${n}. Tus respuestas ya están en la escena, marcadas como dato tuyo.`,
    corrige: "Corrige y míralo",
    corrigeCuerpo:
      "En el croquis acomodas autos y calles; en el visor lo ves en 3D y, en el panel de hipótesis, comparas qué cambia si la velocidad fuera otra. Todo se calcula aquí, en este dispositivo.",
    croquis: "Corregir en el croquis",
    ver3d: "Ver en 3D y comparar hipótesis",
    sinGuardar: (donde: string) =>
      `El navegador no permitió guardar la escena para abrirla en ${donde}.`,
    enCroquis: "el croquis",
    enVisor: "el visor",
  },
  {
    tipos: {
      vv: "Between vehicles",
      moto: "Motorcycle",
      objeto: "Against an object",
      peaton: "Pedestrian",
      volcadura: "Rollover",
      ciclista: "Cyclist",
    } as Record<string, string>,
    elige: "Choose a narrative",
    origen: (fuente: string, metodo: string) => `${fuente}. What the AI understood: ${metodo}.`,
    imagina: "Imagine it happened to you",
    traduccion: "Translation (Croquis reads the original, in Mexican Spanish):",
    entendio: "What the AI understood, field by field",
    falta: "What's missing",
    rondas: (n: number) =>
      `Rounds answered: ${n}. Your answers are already in the scene, marked as your input.`,
    corrige: "Correct it and watch it",
    corrigeCuerpo:
      "In the sketch you arrange cars and streets; in the viewer you see it in 3D and, in the hypothesis panel, compare what changes if the speed were different. Everything is computed here, on this device.",
    croquis: "Correct it in the sketch",
    ver3d: "See it in 3D and compare hypotheses",
    sinGuardar: (donde: string) =>
      `The browser did not allow saving the scene to open it in ${donde}.`,
    enCroquis: "the sketch",
    enVisor: "the viewer",
  },
);

export interface DemoAppProps {
  casos: CasoDemo[];
  fuente: string;
  metodo: string;
}

export function DemoApp({ casos, fuente, metodo }: DemoAppProps) {
  const router = useRouter();
  const { lang, ruta } = useIdioma();
  const t = useTextos(T);
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
      router.push(`${ruta("/croquis")}?fuente=relato`);
    } catch {
      setError(t.sinGuardar(t.enCroquis));
    }
  };

  const ver3d = () => {
    if (!spec) return;
    if (guardarEscenaPropia(spec)) router.push(`${ruta("/visor")}?escena=propia`);
    else setError(t.sinGuardar(t.enVisor));
  };

  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="demo-elige" className="flex flex-col gap-4">
        <h2 id="demo-elige" className="t-titulo">
          {t.elige}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {casos.map((c) => {
            const activo = caso?.id === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  data-testid={`demo-caso-${c.id}`}
                  aria-pressed={activo}
                  onClick={() => elegir(c)}
                  className={`flex min-h-24 w-full flex-col gap-1 rounded-panel border px-4 py-3 text-left transition-colors ${
                    activo
                      ? "border-texto bg-superficie-alta"
                      : "border-linea bg-superficie hover:border-texto-3"
                  }`}
                >
                  <span className="t-nota">{t.tipos[c.tipo] ?? c.tipo}</span>
                  <span className="t-interfaz text-texto">
                    {lang === "es" ? c.titulo : c.titulo_en}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="t-nota">{t.origen(fuente, metodo)}</p>
      </section>

      {caso && spec ? (
        <>
          <section aria-labelledby="demo-imagina" className="flex flex-col gap-4">
            <h2 id="demo-imagina" className="t-titulo">
              {t.imagina}
            </h2>
            <blockquote
              data-testid="demo-relato"
              lang="es-MX"
              className="t-cuerpo max-w-[68ch] border-l-2 border-linea pl-4"
            >
              {caso.texto}
            </blockquote>
            {lang === "en" && caso.texto_en ? (
              <p className="t-interfaz max-w-[68ch] text-texto-2" data-testid="demo-traduccion">
                <span className="t-nota block">{t.traduccion}</span>
                {caso.texto_en}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="demo-entendio" className="flex flex-col gap-4">
            <h2 id="demo-entendio" className="t-titulo">
              {t.entendio}
            </h2>
            <FactsPanel spec={spec} />
          </section>

          <section aria-labelledby="demo-falta" className="flex flex-col gap-4">
            <h2 id="demo-falta" className="t-titulo">
              {t.falta}
            </h2>
            {rondas > 0 ? (
              <p data-testid="demo-rondas" className="t-interfaz text-texto-2">
                {t.rondas(rondas)}
              </p>
            ) : null}
            <QuestionsPanel preguntas={preguntas} spec={spec} onSubmit={contestar} />
          </section>

          <section aria-labelledby="demo-corrige" className="flex flex-col gap-4">
            <h2 id="demo-corrige" className="t-titulo">
              {t.corrige}
            </h2>
            <p className="t-cuerpo max-w-[68ch] text-texto-2">{t.corrigeCuerpo}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                data-testid="demo-3d"
                onClick={ver3d}
                className="boton-principal"
              >
                {t.ver3d}
              </button>
              <button
                type="button"
                data-testid="demo-croquis"
                onClick={abrirCroquis}
                className="boton-secundario"
              >
                {t.croquis}
              </button>
            </div>
          </section>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="t-interfaz border-l-2 border-texto pl-3">
          {error}
        </p>
      ) : null}
      <Legend />
    </div>
  );
}
