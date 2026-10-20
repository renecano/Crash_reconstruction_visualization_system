"use client";
/**
 * Paso «¿Qué falta?» (PLAN §11.4): el relato con la cita de cada dato, lo que se entendió y las
 * preguntas que más cambian el resultado. Se puede contestar o seguir sin contestar.
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { Legend } from "@/components/legend";
import { FactsPanel } from "@/components/relato/facts-panel";
import { QuestionsPanel } from "@/components/relato/questions-panel";
import { RelatoConCitas } from "@/components/relato/relato-con-citas";
import { textos } from "@/i18n";
import { useTextos } from "@/i18n/cliente";
import type { ExtraerRespuesta, Pregunta, TerminoGlosario } from "@/lib/relato-api";
import { TEXTOS_FLUJO } from "./textos";

const T = textos(
  {
    glosario: "Expresiones que pueden significar varias cosas",
    descargar: "Descargar la escena (JSON)",
  },
  {
    glosario: "Expressions that can mean several things",
    descargar: "Download the scene (JSON)",
  },
);

export type Lectura = Pick<
  ExtraerRespuesta,
  "texto" | "metodo" | "motivo" | "verificador" | "glosario"
>;

export function PasoFalta({
  lectura,
  spec,
  preguntas,
  ocupado,
  onResponder,
  onSeguir,
}: {
  lectura: Lectura;
  spec: EscenaSpec;
  preguntas: Pregunta[];
  ocupado: boolean;
  onResponder: (respuestas: Record<string, string>, omitidas: string[]) => void;
  onSeguir: () => void;
}) {
  const t = useTextos(TEXTOS_FLUJO).falta;
  const tl = useTextos(T);
  const ambiguos = lectura.glosario.filter((g: TerminoGlosario) => g.ambiguo);
  const descargar = () => {
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spec.meta.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const seguir = (
    <button
      type="button"
      data-testid="abrir-croquis"
      className="boton-secundario"
      onClick={onSeguir}
    >
      {preguntas.length > 0 ? t.saltar : t.seguir}
    </button>
  );
  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <div className="flex flex-col gap-6 lg:col-span-7">
        <p data-testid="metodo" className="t-nota">
          {lectura.metodo === "claude" ? t.metodoClaude : t.metodoReglas}{" "}
          {t.verificador(lectura.verificador.revisados, lectura.verificador.corregidos)}
          {lectura.motivo ? <span lang="es-MX"> {lectura.motivo}</span> : null}
        </p>
        <section aria-labelledby="tu-relato" className="carril flex flex-col gap-3">
          <h2 id="tu-relato" className="t-subtitulo">
            {t.tuRelato}
          </h2>
          <RelatoConCitas texto={lectura.texto} spec={spec} />
          <p className="t-nota">{t.leyendaCitas}</p>
        </section>
        {ambiguos.length > 0 ? (
          <section data-testid="glosario" aria-labelledby="glosario-titulo">
            <h2 id="glosario-titulo" className="t-interfaz mb-2">
              {tl.glosario}
            </h2>
            <ul className="t-nota flex flex-col gap-1" lang="es-MX">
              {ambiguos.map((g) => (
                <li key={`${g.id}-${g.inicio}`}>
                  <q className="cita text-texto">{g.texto}</q>
                  {g.pregunta ? ` — ${g.pregunta}` : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="flex flex-col gap-6">
          <QuestionsPanel
            preguntas={preguntas}
            spec={spec}
            busy={ocupado}
            onSubmit={onResponder}
            secundario={preguntas.length > 0 ? seguir : null}
          />
          {preguntas.length === 0 ? (
            <div>
              <button
                type="button"
                data-testid="abrir-croquis"
                className="boton-principal"
                onClick={onSeguir}
              >
                {t.seguir}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-8 lg:col-span-5">
        <FactsPanel spec={spec} />
        <div className="flex flex-col gap-4 border-t border-linea pt-4">
          <button
            type="button"
            data-testid="descargar"
            className="t-interfaz self-start underline"
            onClick={descargar}
          >
            {tl.descargar}
          </button>
          <Legend seed={spec.meta.semilla} atribucion={spec.lugar.red_vial?.atribucion} />
        </div>
      </div>
    </div>
  );
}
