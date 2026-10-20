"use client";
/**
 * ¿Qué falta? (PLAN §11.4): hasta tres preguntas por ronda, solo lo que más cambia el resultado.
 * Ninguna es obligatoria y «no sé» siempre vale. Las opciones se muestran en el idioma de la
 * página, pero su valor (en español) es el que entiende el servidor.
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { useState } from "react";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { opcionEtiqueta, preguntaVista } from "@/lib/mensajes";
import type { Pregunta } from "@/lib/relato-api";

const T = textos(
  {
    titulo: "Lo que falta",
    ayuda:
      "Solo preguntamos lo que más cambia la reconstrucción. Si no lo sabes, déjalo en blanco.",
    motivo: {
      contradiccion: "Para que todo cuadre",
      sensibilidad: "Lo que más cambia el resultado",
      ambiguedad: "Para precisar una palabra",
    },
    responder: "Responder",
    actualizando: "Actualizando…",
    sinPreguntas:
      "No hay más preguntas: con lo que contaste se puede armar el croquis. Puedes corregir cualquier detalle directamente en él.",
  },
  {
    titulo: "What's missing",
    ayuda:
      "We only ask what changes the reconstruction the most. If you don't know, leave it blank.",
    motivo: {
      contradiccion: "So that everything fits",
      sensibilidad: "What changes the result the most",
      ambiguedad: "To pin down a word",
    },
    responder: "Answer",
    actualizando: "Updating…",
    sinPreguntas:
      "No more questions: what you told is enough to build the sketch. You can correct any detail directly in it.",
  },
);

export interface QuestionsPanelProps {
  preguntas: Pregunta[];
  /** Escena actual: con ella se nombran los vehículos de las preguntas en inglés. */
  spec?: EscenaSpec | null;
  busy?: boolean;
  onSubmit: (respuestas: Record<string, string>, omitidas: string[]) => void;
  /** Botón secundario junto a «Responder» (por ejemplo, seguir sin contestar). */
  secundario?: React.ReactNode;
}

export function QuestionsPanel({
  preguntas,
  spec = null,
  busy = false,
  onSubmit,
  secundario,
}: QuestionsPanelProps) {
  const { lang } = useIdioma();
  const t = useTextos(T);
  const [values, setValues] = useState<Record<string, string>>({});
  if (preguntas.length === 0) {
    return (
      <p data-testid="sin-preguntas" className="t-cuerpo text-texto-2">
        {t.sinPreguntas}
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
    <section
      aria-labelledby="preguntas-titulo"
      data-testid="preguntas"
      className="flex flex-col gap-6"
    >
      <div>
        <h2 id="preguntas-titulo" className="t-subtitulo">
          {t.titulo}
        </h2>
        <p className="t-nota mt-1">{t.ayuda}</p>
      </div>
      <ol className="flex flex-col gap-6">
        {preguntas.map((p) => {
          const vista = preguntaVista(p, spec, lang);
          return (
            <li
              key={p.id}
              data-testid={`pregunta-${p.id}`}
              className="flex flex-col gap-2 border-t border-linea pt-4"
            >
              <span className="t-nota">{t.motivo[p.motivo]}</span>
              <label htmlFor={`q-${p.id}`} className="t-interfaz text-texto" lang={vista.lang}>
                {vista.texto}
              </label>
              {p.opciones && p.opciones.length > 0 ? (
                <div role="radiogroup" aria-label={vista.texto} className="flex flex-wrap gap-2">
                  {p.opciones.map((o) => {
                    const sel = values[p.id] === o;
                    return (
                      <button
                        key={o}
                        type="button"
                        role="radio"
                        aria-checked={sel}
                        onClick={() => set(p.id, sel ? "" : o)}
                        className={`boton-secundario min-h-11 px-4 ${sel ? "border-texto bg-superficie-alta" : ""}`}
                      >
                        {opcionEtiqueta(o, lang)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  id={`q-${p.id}`}
                  type="text"
                  inputMode={
                    p.id.startsWith("velocidad") || p.id.includes("distancia") ? "decimal" : "text"
                  }
                  className="campo max-w-xs"
                  value={values[p.id] ?? ""}
                  onChange={(e) => set(p.id, e.target.value)}
                />
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="responder"
          disabled={busy}
          onClick={submit}
          className="boton-principal"
        >
          {busy ? t.actualizando : t.responder}
        </button>
        {secundario}
      </div>
    </section>
  );
}
