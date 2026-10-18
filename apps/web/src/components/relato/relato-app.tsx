"use client";

import { findTerms, redact, type Span } from "@croquis/extraction";
import type { EscenaSpec } from "@croquis/scene-schema";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Legend } from "@/components/legend";
import { useEnLinea } from "@/lib/en-linea";
import {
  ApiError,
  extraer,
  RELATO_SPEC_KEY,
  responder,
  type ExtraerRespuesta,
  type Pregunta,
  type Progreso,
} from "@/lib/relato-api";
import { FactsPanel } from "./facts-panel";
import { QuestionsPanel } from "./questions-panel";

/** Texto del botón mientras el servidor lee el relato. */
export function leyendo(p: Progreso | null): string {
  if (!p || p.metodo !== "claude") return "Leyendo…";
  return p.caracteres > 0
    ? `Claude está leyendo… (${p.caracteres} caracteres)`
    : "Claude está leyendo…";
}

const EJEMPLO =
  "Iba por Paseo Tollocan en mi Aveo gris, como a 50, y la camioneta de enfrente frenó de golpe " +
  "en el semáforo. No alcancé a frenar y le pegué por detrás. Estaba chispeando y el piso mojado.";

const MARKER: Record<Span["kind"], string> = {
  NOMBRE: "nombre",
  PLACA: "placa",
  TELEFONO: "teléfono",
  CORREO: "correo",
  CURP: "CURP",
  RFC: "RFC",
  NUMERO: "número de domicilio",
};

/** El texto redactado con los marcadores resaltados (lo que de verdad sale del dispositivo). */
function RedactedText({ text }: { text: string }) {
  const parts = text.split(/(\[(?:NOMBRE|PLACA|TELEFONO|CORREO|CURP|RFC|NUMERO)\])/);
  return (
    <p data-testid="texto-redactado" className="leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) =>
        /^\[[A-Z]+\]$/.test(part) ? (
          <mark
            key={i}
            className="rounded bg-neutral-800 px-1 text-xs text-white dark:bg-neutral-200 dark:text-neutral-900"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

export interface RelatoAppProps {
  fetcher?: typeof fetch;
}

export function RelatoApp({ fetcher }: RelatoAppProps) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ExtraerRespuesta | null>(null);
  const [spec, setSpec] = useState<EscenaSpec | null>(null);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [contestadas, setContestadas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const enLinea = useEnLinea();

  // Todo esto corre en el navegador: nada del texto original sale de aquí.
  const red = useMemo(() => redact(texto), [texto]);
  const terminos = useMemo(() => findTerms(red.text).filter((t) => t.ambiguo), [red.text]);
  const conteo = red.spans.reduce<Record<string, number>>((acc, s) => {
    acc[MARKER[s.kind]] = (acc[MARKER[s.kind]] ?? 0) + 1;
    return acc;
  }, {});

  const fail = (e: unknown) =>
    setError(e instanceof ApiError || e instanceof Error ? e.message : String(e));

  const entender = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await extraer(red.text, "auto", fetcher, setProgreso);
      setResultado(r);
      setSpec(r.spec);
      setPreguntas(r.preguntas);
      setContestadas([]);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      setProgreso(null);
    }
  };

  const contestar = async (respuestas: Record<string, string>, omitidas: string[]) => {
    if (!spec) return;
    setBusy(true);
    setError(null);
    const ya = [...contestadas, ...omitidas, ...Object.keys(respuestas)];
    try {
      const r = await responder(spec, red.text, respuestas, ya, fetcher);
      setSpec(r.spec);
      setPreguntas(r.preguntas);
      setContestadas(ya);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const abrirCroquis = () => {
    if (!spec) return;
    try {
      sessionStorage.setItem(RELATO_SPEC_KEY, JSON.stringify(spec));
    } catch {
      setError("El navegador no permitió guardar la escena para abrirla en el croquis.");
      return;
    }
    router.push("/croquis?fuente=relato");
  };

  const descargar = () => {
    if (!spec) return;
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spec.meta.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section aria-label="Tu relato" className="flex flex-col gap-4">
        <label htmlFor="relato" className="text-lg font-semibold">
          Cuenta qué pasó
        </label>
        <textarea
          id="relato"
          data-testid="relato"
          className="h-48 w-full resize-y rounded border border-neutral-300 bg-white p-3 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
          placeholder={EJEMPLO}
          value={texto}
          maxLength={5000}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="entender"
            disabled={busy || !enLinea || red.text.trim().length === 0}
            onClick={() => void entender()}
            className="rounded bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {busy && !resultado ? leyendo(progreso) : "Entender el relato"}
          </button>
          <button
            type="button"
            className="rounded border border-neutral-400 px-4 py-2 text-sm"
            onClick={() => setTexto(EJEMPLO)}
          >
            Usar un ejemplo
          </button>
        </div>
        <div className="rounded border border-neutral-300 p-3 text-sm dark:border-neutral-700">
          <h2 className="mb-2 font-semibold">Lo que se envía (sin datos personales)</h2>
          {texto.trim() ? <RedactedText text={red.text} /> : <p className="text-neutral-500">—</p>}
          <p data-testid="privacidad" className="mt-2 text-neutral-600 dark:text-neutral-400">
            {red.spans.length > 0
              ? `Se quitaron aquí, en tu dispositivo: ${Object.entries(conteo)
                  .map(([k, n]) => `${n} ${k}`)
                  .join(", ")}.`
              : "Los nombres, placas, teléfonos y correos se quitan aquí, en tu dispositivo, antes de enviar."}
          </p>
        </div>
        {terminos.length > 0 ? (
          <div data-testid="glosario" className="text-sm text-neutral-700 dark:text-neutral-300">
            <h2 className="font-semibold">Expresiones que pueden significar varias cosas</h2>
            <ul className="list-disc pl-5">
              {terminos.map((t) => (
                <li key={`${t.id}-${t.start}`}>
                  <q>{t.texto}</q>
                  {t.pregunta ? ` — ${t.pregunta}` : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {!enLinea ? (
          <p
            role="status"
            data-testid="sin-red"
            className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            Sin conexión. Entender el relato necesita internet (la extracción con Claude corre en el
            servidor). Sin red puedes abrir las escenas precargadas en el{" "}
            <a className="underline" href="/visor">
              visor
            </a>{" "}
            o armar una escena en el{" "}
            <a className="underline" href="/croquis">
              croquis
            </a>
            ; se reconstruye en este dispositivo.
          </p>
        ) : null}
        {error ? (
          <p role="alert" data-testid="error" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </section>

      <section aria-label="Resultado" className="flex flex-col gap-6">
        {resultado && spec ? (
          <>
            <p data-testid="metodo" className="text-sm text-neutral-600 dark:text-neutral-400">
              {resultado.metodo === "claude"
                ? "Extraído con Claude y verificado contra tu texto."
                : "Extraído con reglas de español mexicano y verificado contra tu texto."}{" "}
              {resultado.motivo ?? ""}
            </p>
            <FactsPanel spec={spec} />
            <QuestionsPanel
              preguntas={preguntas}
              busy={busy}
              onSubmit={(r, o) => void contestar(r, o)}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="abrir-croquis"
                onClick={abrirCroquis}
                className="rounded bg-neutral-900 px-4 py-2 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
              >
                Abrir en el croquis
              </button>
              <button
                type="button"
                data-testid="descargar"
                onClick={descargar}
                className="rounded border border-neutral-400 px-4 py-2 text-sm"
              >
                Descargar EscenaSpec
              </button>
            </div>
            <Legend seed={spec.meta.semilla} atribucion={spec.lugar.red_vial?.atribucion} />
          </>
        ) : (
          <p className="text-neutral-600 dark:text-neutral-400">
            Escribe con tus palabras, como se lo contarías a alguien. La IA traduce tu relato, la
            física decide qué pudo pasar y tú corriges lo que no cuadre.
          </p>
        )}
      </section>
    </div>
  );
}
