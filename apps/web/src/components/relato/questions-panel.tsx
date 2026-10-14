"use client";

import { useState } from "react";
import type { Pregunta } from "@/lib/relato-api";

const MOTIVO: Record<Pregunta["motivo"], string> = {
  contradiccion: "Para que todo cuadre",
  sensibilidad: "Lo que más cambia el resultado",
  ambiguedad: "Para precisar una palabra",
};

export interface QuestionsPanelProps {
  preguntas: Pregunta[];
  busy?: boolean;
  onSubmit: (respuestas: Record<string, string>, omitidas: string[]) => void;
}

/** Hasta tres preguntas por ronda; ninguna es obligatoria y "no sé" siempre es válido. */
export function QuestionsPanel({ preguntas, busy = false, onSubmit }: QuestionsPanelProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  if (preguntas.length === 0) {
    return (
      <p data-testid="sin-preguntas" className="text-sm text-neutral-700 dark:text-neutral-300">
        No hay más preguntas: con lo que contaste se puede armar el croquis. Puedes corregir
        cualquier detalle directamente en él.
      </p>
    );
  }
  const set = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }));
  const submit = () => {
    const respuestas: Record<string, string> = {};
    const omitidas: string[] = [];
    for (const p of preguntas) {
      const v = (values[p.id] ?? "").trim();
      if (v) respuestas[p.id] = v;
      else omitidas.push(p.id);
    }
    setValues({});
    onSubmit(respuestas, omitidas);
  };
  return (
    <section aria-label="Preguntas" data-testid="preguntas" className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Unas preguntas</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Solo preguntamos lo que más cambia la reconstrucción. Si no lo sabes, déjalo en blanco.
      </p>
      <ol className="flex flex-col gap-4">
        {preguntas.map((p) => (
          <li key={p.id} data-testid={`pregunta-${p.id}`} className="flex flex-col gap-2">
            <span className="text-xs tracking-wide text-neutral-500 uppercase">
              {MOTIVO[p.motivo]}
            </span>
            <label htmlFor={`q-${p.id}`} className="font-medium">
              {p.texto}
            </label>
            {p.opciones && p.opciones.length > 0 ? (
              <div role="radiogroup" aria-label={p.texto} className="flex flex-wrap gap-2">
                {p.opciones.map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={values[p.id] === o}
                    onClick={() => set(p.id, values[p.id] === o ? "" : o)}
                    className={`rounded border px-3 py-1 text-sm ${
                      values[p.id] === o
                        ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                        : "border-neutral-400"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            ) : (
              <input
                id={`q-${p.id}`}
                type="text"
                inputMode={
                  p.id.startsWith("velocidad") || p.id.includes("distancia") ? "decimal" : "text"
                }
                className="max-w-xs rounded border border-neutral-300 bg-white px-2 py-1 text-neutral-900"
                value={values[p.id] ?? ""}
                onChange={(e) => set(p.id, e.target.value)}
              />
            )}
          </li>
        ))}
      </ol>
      <div>
        <button
          type="button"
          data-testid="responder"
          disabled={busy}
          onClick={submit}
          className="rounded bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {busy ? "Actualizando…" : "Responder"}
        </button>
      </div>
    </section>
  );
}
