"use client";

/**
 * «Calles reales» del croquis (ADR 0040): con unas coordenadas sobre el cruce, la escena toma las
 * calles de OpenStreetMap. Necesita red; la escena resultante funciona sin ella.
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { useState } from "react";
import { useEnLinea } from "@/lib/en-linea";
import { MapaError, parseCoordenadas, traerCalles } from "@/lib/mapa";

export interface CallesRealesProps {
  spec: EscenaSpec;
  onApply: (spec: EscenaSpec) => void;
  fetcher?: typeof fetch;
}

export function CallesReales({ spec, onApply, fetcher }: CallesRealesProps) {
  const enLinea = useEnLinea();
  const [texto, setTexto] = useState("");
  const [radio, setRadio] = useState(150);
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const coords = parseCoordenadas(texto);

  const traer = async () => {
    if (!coords) return;
    setBusy(true);
    setMensaje(null);
    try {
      const r = await traerCalles(spec, coords, radio, fetcher);
      onApply(r.spec);
      setMensaje({
        ok: true,
        texto: `Se trajeron ${r.vias} calles de OpenStreetMap; el cruce quedó en el origen.`,
      });
    } catch (e) {
      setMensaje({
        ok: false,
        texto: e instanceof MapaError || e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded border border-neutral-300 p-3 text-sm dark:border-neutral-700">
      <summary className="cursor-pointer font-medium">Calles reales (OpenStreetMap)</summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-neutral-600 dark:text-neutral-400">
          Pega las coordenadas del cruce (por ejemplo, desde un mapa: «19.27897, -99.65399»). Las
          calles se guardan en la escena; después funciona sin red.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            data-testid="mapa-coordenadas"
            aria-label="Coordenadas del cruce"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="19.27897, -99.65399"
            className="w-56 rounded border border-neutral-300 bg-white px-2 py-1 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
          />
          <label className="flex items-center gap-1">
            <span>Radio</span>
            <select
              aria-label="Radio"
              value={radio}
              onChange={(e) => setRadio(Number(e.target.value))}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-neutral-900"
            >
              {[100, 150, 200].map((r) => (
                <option key={r} value={r}>
                  {r} m
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="mapa-traer"
            disabled={!coords || busy || !enLinea}
            onClick={() => void traer()}
            className="rounded bg-neutral-900 px-3 py-1 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {busy ? "Consultando…" : "Traer calles"}
          </button>
        </div>
        {!enLinea ? (
          <p className="text-amber-800 dark:text-amber-200">
            Sin conexión: traer calles necesita internet.
          </p>
        ) : null}
        {mensaje ? (
          <p
            role={mensaje.ok ? "status" : "alert"}
            data-testid="mapa-mensaje"
            className={
              mensaje.ok ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-400"
            }
          >
            {mensaje.texto}
          </p>
        ) : null}
      </div>
    </details>
  );
}
