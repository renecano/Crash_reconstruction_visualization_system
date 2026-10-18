"use client";

import type { LegendInfo } from "@croquis/scene-schema";
import { framePng, type ViewerClock, type ViewerExportApi } from "@croquis/viewer";
import { useState } from "react";
import { downloadBytes, safeName } from "@/lib/download";

/** Resoluciones de los cuadros: la del visor o un tamaño fijo (16:9). */
const RESOLUCIONES = [
  { value: "pantalla", label: "La del visor" },
  { value: "1280x720", label: "1280 × 720" },
  { value: "1920x1080", label: "1920 × 1080" },
  { value: "3840x2160", label: "3840 × 2160" },
] as const;
type Resolucion = (typeof RESOLUCIONES)[number]["value"];

function tamaño(r: Resolucion): { width?: number; height?: number } {
  if (r === "pantalla") return {};
  const [w, h] = r.split("x").map(Number);
  return { width: w, height: h };
}

export interface ExportPanelProps {
  api: ViewerExportApi | null;
  clock: ViewerClock | null;
  legend: LegendInfo;
  /** Base del nombre de los archivos (la escena). */
  nombre: string;
}

/**
 * Exportaciones del visor (F9, PLAN §7.9): cuadro PNG y escena glTF, generados en el navegador y
 * siempre con la marca de reconstrucción ilustrativa (PLAN §10).
 */
export function ExportPanel({ api, clock, legend, nombre }: ExportPanelProps) {
  const [resolucion, setResolucion] = useState<Resolucion>("pantalla");
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const base = safeName(nombre);

  const run = async (label: string, work: () => Promise<string>) => {
    setOcupado(true);
    setError(null);
    setEstado(`${label}…`);
    try {
      setEstado(await work());
    } catch (e) {
      setEstado(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const png = () =>
    run("Generando el cuadro", async () => {
      if (!api) throw new Error("El visor aún no está listo.");
      const t = clock?.get().t ?? api.tStart;
      const frame = api.captureFrame({ t, ...tamaño(resolucion) });
      const bytes = await framePng(frame, legend);
      const file = `croquis-${base}-t${t.toFixed(2)}s-${frame.width}x${frame.height}.png`;
      downloadBytes(bytes, file, "image/png");
      return `Listo: ${file}`;
    });

  const glb = () =>
    run("Generando la escena glTF", async () => {
      if (!api) throw new Error("El visor aún no está listo.");
      const bytes = await api.exportGlb(legend);
      const file = `croquis-${base}.glb`;
      downloadBytes(bytes, file, "model/gltf-binary");
      return `Listo: ${file}`;
    });

  const disabled = !api || ocupado;
  return (
    <section
      aria-label="Exportar"
      data-testid="exportar"
      className="flex flex-col gap-2 rounded border border-neutral-300 p-3 text-sm dark:border-neutral-700"
    >
      <h2 className="font-semibold">Exportar</h2>
      <p className="text-neutral-600 dark:text-neutral-400">
        Se genera en este dispositivo y lleva la marca de reconstrucción ilustrativa, la semilla y
        el hash de entradas.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          Tamaño del cuadro
          <select
            value={resolucion}
            onChange={(e) => setResolucion(e.target.value as Resolucion)}
            className="rounded border border-neutral-400 bg-transparent px-2 py-1"
            data-testid="export-resolucion"
          >
            {RESOLUCIONES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-testid="export-png"
          disabled={disabled}
          onClick={() => void png()}
          className="rounded border border-neutral-400 px-3 py-1 hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
        >
          Cuadro PNG del instante actual
        </button>
        <button
          type="button"
          data-testid="export-glb"
          disabled={disabled}
          onClick={() => void glb()}
          className="rounded border border-neutral-400 px-3 py-1 hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
        >
          Escena glTF con animación
        </button>
      </div>
      {estado ? (
        <p
          role="status"
          data-testid="export-estado"
          className="text-neutral-700 dark:text-neutral-300"
        >
          {estado}
        </p>
      ) : null}
      {error ? (
        <p role="alert" data-testid="export-error" className="text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </section>
  );
}
