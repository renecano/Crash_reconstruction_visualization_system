"use client";

/**
 * Página de quien facilita E9 (`docs/e9/protocolo.md`): abre la sesión con un código de
 * participante, la cierra con el SUS y descarga el JSON de métricas. Nada sale del dispositivo
 * hasta que quien facilita descarga el archivo.
 */
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
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
  const sesion = useSyncExternalStore(subscribeE9, leerE9, serverSnapshot);
  const [codigo, setCodigo] = useState("");
  const [consentimiento, setConsentimiento] = useState(false);
  const [sus, setSus] = useState<(number | null)[]>(SUS_ITEMS.map(() => null));
  const [error, setError] = useState<string | null>(null);

  if (!sesion) {
    return (
      <section aria-label="Nueva sesión" className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Código de participante</span>
          <input
            data-testid="e9-codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="P01"
            className="w-32 rounded border border-neutral-300 p-2 dark:border-neutral-700"
          />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="e9-consentimiento"
            checked={consentimiento}
            onChange={(e) => setConsentimiento(e.target.checked)}
          />
          <span>
            La persona leyó el consentimiento (<code>docs/e9/consentimiento.md</code>) y aceptó
            participar.
          </span>
        </label>
        <button
          type="button"
          data-testid="e9-iniciar"
          disabled={!PARTICIPANTE.test(codigo) || !consentimiento}
          onClick={() => {
            iniciarE9(codigo);
          }}
          className="w-fit rounded bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          Empezar la sesión
        </button>
      </section>
    );
  }

  const r = resumenE9(sesion);
  if (sesion.terminada !== undefined) {
    return (
      <section aria-label="Sesión terminada" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Sesión {sesion.participante} terminada</h2>
        <dl data-testid="e9-resumen" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt>Hasta la primera reconstrucción</dt>
          <dd>
            {r.segundos_hasta_primera_reconstruccion === null
              ? "no llegó"
              : `${r.segundos_hasta_primera_reconstruccion} s`}
          </dd>
          <dt>Correcciones en el croquis</dt>
          <dd>{r.correcciones_croquis}</dd>
          <dt>Rondas de preguntas contestadas</dt>
          <dd>{r.rondas_de_preguntas}</dd>
          <dt>SUS</dt>
          <dd>{r.sus}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="e9-descargar"
            onClick={() => descargar(sesion)}
            className="rounded bg-neutral-900 px-4 py-2 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Descargar {`e9-${sesion.participante}.json`}
          </button>
          <button
            type="button"
            data-testid="e9-borrar"
            onClick={() => {
              borrarE9();
            }}
            className="rounded border border-neutral-400 px-4 py-2"
          >
            Borrar la sesión de este dispositivo
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Sesión activa" className="flex flex-col gap-4">
      <p data-testid="e9-activa">
        Sesión <strong>{sesion.participante}</strong> activa: {sesion.eventos.length} eventos
        anotados.{" "}
        <Link href="/relato" className="underline">
          Ir a contar qué pasó
        </Link>
      </p>
      <h2 className="text-lg font-semibold">Al terminar: cuestionario (SUS)</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        1 = totalmente en desacuerdo, 5 = totalmente de acuerdo. Traducción propia del SUS de Brooke
        (1996); no es una versión validada.
      </p>
      <ol className="flex flex-col gap-3">
        {SUS_ITEMS.map((item, i) => (
          <li key={item} className="flex flex-col gap-1">
            <span>
              {i + 1}. {item}
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
                  className={`h-9 w-9 rounded border ${
                    sus[i] === v
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                      : "border-neutral-400"
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
        className="w-fit rounded bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        Terminar la sesión
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </section>
  );
}
