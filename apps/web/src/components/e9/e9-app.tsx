"use client";

/**
 * Página de quien facilita E9 (`docs/e9/protocolo.md`): abre la sesión con un código de
 * participante, la cierra con el SUS y descarga el JSON de métricas. Nada sale del dispositivo
 * hasta que quien facilita descarga el archivo.
 *
 * El cuestionario se queda en español en las dos versiones de la página: es el instrumento del
 * protocolo (traducción propia del SUS) y cambiarlo cambiaría la medición.
 */
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import {
  borrarE9,
  iniciarE9,
  leerE9,
  PARTICIPANTE,
  resumenE9,
  subscribeE9,
  SUS_ITEMS,
  terminarE9,
  type SesionE9,
} from "@/lib/e9";

const T = textos(
  {
    nueva: "Nueva sesión",
    codigo: "Código de participante",
    consentimiento:
      "La persona leyó el consentimiento (docs/e9/consentimiento.md) y aceptó participar.",
    empezar: "Empezar la sesión",
    terminadaTitulo: (p: string) => `Sesión ${p} terminada`,
    hastaPrimera: "Hasta la primera reconstrucción",
    noLlego: "no llegó",
    correcciones: "Correcciones en el croquis",
    rondas: "Rondas de preguntas contestadas",
    sus: "SUS",
    descargar: (f: string) => `Descargar ${f}`,
    borrar: "Borrar la sesión de este dispositivo",
    activaEtiqueta: "Sesión activa",
    activa: (p: string, n: number) => `Sesión ${p} activa: ${n} eventos anotados.`,
    ir: "Ir a contar qué pasó",
    susTitulo: "Al terminar: cuestionario (SUS)",
    susNota:
      "1 = totalmente en desacuerdo, 5 = totalmente de acuerdo. Traducción propia del SUS de Brooke (1996); no es una versión validada.",
    terminar: "Terminar la sesión",
  },
  {
    nueva: "New session",
    codigo: "Participant code",
    consentimiento:
      "The person read the consent form (docs/e9/consentimiento.md) and agreed to take part.",
    empezar: "Start the session",
    terminadaTitulo: (p: string) => `Session ${p} finished`,
    hastaPrimera: "Until the first reconstruction",
    noLlego: "did not get there",
    correcciones: "Corrections in the sketch",
    rondas: "Question rounds answered",
    sus: "SUS",
    descargar: (f: string) => `Download ${f}`,
    borrar: "Delete the session from this device",
    activaEtiqueta: "Active session",
    activa: (p: string, n: number) => `Session ${p} active: ${n} events recorded.`,
    ir: "Go tell what happened",
    susTitulo: "At the end: questionnaire (SUS)",
    susNota:
      "1 = strongly disagree, 5 = strongly agree. The questionnaire stays in Spanish: it is our own translation of Brooke's SUS (1996) that the protocol uses, not a validated version.",
    terminar: "Finish the session",
  },
);

const serverSnapshot = () => null;

function descargar(s: SesionE9) {
  const blob = new Blob([`${JSON.stringify(s, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `e9-${s.participante}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function E9App() {
  const { ruta } = useIdioma();
  const t = useTextos(T);
  const sesion = useSyncExternalStore(subscribeE9, leerE9, serverSnapshot);
  const [codigo, setCodigo] = useState("");
  const [consentimiento, setConsentimiento] = useState(false);
  const [sus, setSus] = useState<(number | null)[]>(SUS_ITEMS.map(() => null));
  const [error, setError] = useState<string | null>(null);

  if (!sesion) {
    return (
      <section aria-label={t.nueva} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="t-interfaz">{t.codigo}</span>
          <input
            data-testid="e9-codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="P01"
            autoComplete="off"
            className="campo w-32 cifras"
          />
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            data-testid="e9-consentimiento"
            checked={consentimiento}
            onChange={(e) => setConsentimiento(e.target.checked)}
            className="mt-1 h-5 w-5 accent-[var(--accion)]"
          />
          <span className="t-interfaz max-w-[60ch]">{t.consentimiento}</span>
        </label>
        <button
          type="button"
          data-testid="e9-iniciar"
          disabled={!PARTICIPANTE.test(codigo) || !consentimiento}
          onClick={() => {
            iniciarE9(codigo);
          }}
          className="boton-principal self-start"
        >
          {t.empezar}
        </button>
      </section>
    );
  }

  const r = resumenE9(sesion);
  if (sesion.terminada !== undefined) {
    return (
      <section aria-labelledby="e9-terminada" className="flex flex-col gap-5">
        <h2 id="e9-terminada" className="t-titulo">
          {t.terminadaTitulo(sesion.participante)}
        </h2>
        <dl
          data-testid="e9-resumen"
          className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-linea pt-4"
        >
          <dt className="t-interfaz text-texto-2">{t.hastaPrimera}</dt>
          <dd className="t-cota">
            {r.segundos_hasta_primera_reconstruccion === null
              ? t.noLlego
              : `${r.segundos_hasta_primera_reconstruccion} s`}
          </dd>
          <dt className="t-interfaz text-texto-2">{t.correcciones}</dt>
          <dd className="t-cota">{r.correcciones_croquis}</dd>
          <dt className="t-interfaz text-texto-2">{t.rondas}</dt>
          <dd className="t-cota">{r.rondas_de_preguntas}</dd>
          <dt className="t-interfaz text-texto-2">{t.sus}</dt>
          <dd className="t-cota">{r.sus}</dd>
        </dl>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="e9-descargar"
            onClick={() => descargar(sesion)}
            className="boton-principal"
          >
            {t.descargar(`e9-${sesion.participante}.json`)}
          </button>
          <button
            type="button"
            data-testid="e9-borrar"
            onClick={() => {
              borrarE9();
            }}
            className="boton-secundario"
          >
            {t.borrar}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={t.activaEtiqueta} className="flex flex-col gap-6">
      <p
        data-testid="e9-activa"
        className="t-interfaz flex flex-wrap items-baseline gap-x-4 gap-y-2"
      >
        <span>{t.activa(sesion.participante, sesion.eventos.length)}</span>
        <Link href={ruta("/cuenta")} className="t-interfaz">
          {t.ir}
        </Link>
      </p>
      <h2 className="t-titulo">{t.susTitulo}</h2>
      <p className="t-nota max-w-[68ch]">{t.susNota}</p>
      <ol className="flex flex-col gap-5" lang="es-MX">
        {SUS_ITEMS.map((item, i) => (
          <li key={item} className="flex flex-col gap-2">
            <span className="t-interfaz">
              <span className="cifras text-texto-3">{i + 1}.</span> {item}
            </span>
            <div role="radiogroup" aria-label={item} className="flex gap-2">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={sus[i] === v}
                  data-testid={`e9-sus-${i + 1}-${v}`}
                  onClick={() => setSus((s) => s.map((x, k) => (k === i ? v : x)))}
                  className={`cifras h-11 w-11 rounded-control border t-interfaz ${
                    sus[i] === v
                      ? "border-texto bg-texto text-fondo"
                      : "border-linea text-texto hover:border-texto-3"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        data-testid="e9-terminar"
        disabled={sus.some((x) => x === null)}
        onClick={() => {
          try {
            terminarE9(sus as number[]);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
        className="boton-principal self-start"
      >
        {t.terminar}
      </button>
      {error ? (
        <p role="alert" className="t-interfaz border-l-2 border-texto pl-3">
          {error}
        </p>
      ) : null}
    </section>
  );
}
