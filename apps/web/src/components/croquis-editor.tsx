"use client";

import { Croquis } from "@croquis/croquis-2d";
import {
  FIXTURE_NAMES,
  checkEscena,
  fixtureTitle,
  loadFixture,
  validateEscena,
  type EscenaSpec,
  type FixtureName,
  type Problema,
} from "@croquis/scene-schema";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { croquisPdf, croquisPng, croquisSvgFile } from "@/lib/croquis-export";
import { downloadBytes, safeName } from "@/lib/download";
import { guardarEscenaPropia } from "@/lib/escena-propia";
import { RELATO_SPEC_KEY } from "@/lib/relato-api";
import { Legend } from "./legend";

function toJson(spec: EscenaSpec): string {
  return JSON.stringify(spec, null, 2);
}

export function CroquisEditor({ initial = "alcance" }: { initial?: FixtureName }) {
  const router = useRouter();
  const [exportando, setExportando] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [name, setName] = useState<FixtureName>(initial);
  const [spec, setSpec] = useState<EscenaSpec>(() => loadFixture(initial));
  const [jsonText, setJsonText] = useState<string>(() => toJson(loadFixture(initial)));
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [showFinal, setShowFinal] = useState(true);

  const problemas: Problema[] = useMemo(() => checkEscena(spec), [spec]);
  const errores = problemas.filter((p) => p.severidad === "error");
  const avisos = problemas.filter((p) => p.severidad === "advertencia");

  const applySpec = (next: EscenaSpec) => {
    setSpec(next);
    setJsonText(toJson(next));
    setJsonErrors([]);
  };

  const pick = (n: FixtureName) => {
    setName(n);
    setSelected(undefined);
    setFromRelato(false);
    applySpec(loadFixture(n));
  };

  // Escena que llega desde la página del relato (`/croquis?fuente=relato`).
  const [fromRelato, setFromRelato] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("fuente") !== "relato") return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(RELATO_SPEC_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const result = validateEscena(parsed);
    if (!result.ok) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con sessionStorage al montar
    setSpec(result.spec);
    setJsonText(toJson(result.spec));
    setFromRelato(true);
  }, []);

  const exportCroquis = async (fmt: "svg" | "png" | "pdf") => {
    setExportando(true);
    setExportError(null);
    const file = `croquis-${safeName(spec.meta.titulo ?? spec.meta.id)}.${fmt}`;
    try {
      if (fmt === "svg") downloadBytes(await croquisSvgFile(spec), file, "image/svg+xml");
      else if (fmt === "png") downloadBytes(await croquisPng(spec), file, "image/png");
      else downloadBytes(await croquisPdf(spec), file, "application/pdf");
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(false);
    }
  };

  const applyJson = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setJsonErrors([`JSON mal formado: ${(e as Error).message}`]);
      return;
    }
    const result = validateEscena(parsed);
    if (!result.ok) {
      setJsonErrors(result.errors);
      return;
    }
    setSpec(result.spec);
    setJsonErrors([]);
  };

  const download = () => {
    const blob = new Blob([toJson(spec)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spec.meta.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-label="Croquis editable" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {fromRelato ? (
            <span
              data-testid="escena-relato"
              className="rounded bg-green-100 px-2 py-1 text-sm text-green-900"
            >
              Escena de tu relato
            </span>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <span>Escena</span>
            <select
              data-testid="scene-select"
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-neutral-900"
              value={name}
              onChange={(e) => pick(e.target.value as FixtureName)}
            >
              {FIXTURE_NAMES.map((n) => (
                <option key={n} value={n}>
                  {fixtureTitle(n)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showFinal}
              onChange={(e) => setShowFinal(e.target.checked)}
            />
            Mostrar posiciones finales
          </label>
          <button
            type="button"
            data-testid="reset"
            className="rounded border border-neutral-400 px-3 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => pick(name)}
          >
            Restablecer
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
          <Croquis
            spec={spec}
            onChange={applySpec}
            showFinal={showFinal}
            selectedId={selected}
            onSelect={setSelected}
          />
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Arrastra vehículos, personas, objetos y marcas; gira un vehículo con el asa naranja. Cada
          cambio queda marcado como <code>fuente: usuario</code> en el JSON.
        </p>
        <Legend
          seed={spec.meta.semilla}
          inputHash={spec.meta.hash_relato}
          atribucion={spec.lugar.red_vial?.atribucion}
        />
      </section>

      <section aria-label="EscenaSpec en JSON" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">EscenaSpec</h2>
          <button
            type="button"
            data-testid="apply-json"
            className="rounded bg-neutral-900 px-3 py-1 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
            onClick={applyJson}
          >
            Aplicar JSON
          </button>
          <button
            type="button"
            data-testid="download-json"
            className="rounded border border-neutral-400 px-3 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={download}
          >
            Descargar JSON
          </button>
          <button
            type="button"
            data-testid="ver-3d"
            className="rounded border border-neutral-400 px-3 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => {
              // La escena (con los cambios aplicados) se reconstruye en el navegador y se ve en 3D.
              if (guardarEscenaPropia(spec)) router.push("/visor?escena=propia");
            }}
          >
            Ver en 3D
          </button>
        </div>
        <div
          className="flex flex-wrap items-center gap-2 text-sm"
          role="group"
          aria-label="Exportar el croquis"
        >
          <span className="text-neutral-600 dark:text-neutral-400">
            Exportar el croquis (con la marca de reconstrucción ilustrativa):
          </span>
          {(
            [
              ["svg", "SVG"],
              ["png", "PNG"],
              ["pdf", "PDF"],
            ] as const
          ).map(([fmt, label]) => (
            <button
              key={fmt}
              type="button"
              data-testid={`croquis-${fmt}`}
              disabled={exportando}
              className="rounded border border-neutral-400 px-3 py-1 hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
              onClick={() => void exportCroquis(fmt)}
            >
              {label}
            </button>
          ))}
          {exportError ? (
            <span role="alert" className="text-red-700 dark:text-red-400">
              {exportError}
            </span>
          ) : null}
        </div>
        <textarea
          data-testid="json"
          aria-label="EscenaSpec en JSON"
          spellCheck={false}
          className="h-[28rem] w-full resize-y rounded border border-neutral-300 bg-white p-2 font-mono text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        {jsonErrors.length > 0 && (
          <ul
            data-testid="json-errors"
            className="list-disc space-y-1 pl-5 text-sm text-red-700 dark:text-red-400"
          >
            {jsonErrors.slice(0, 12).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <div
          data-testid="problemas"
          className="rounded border border-neutral-300 p-3 text-sm dark:border-neutral-700"
        >
          <h3 className="font-semibold">Revisión de la escena</h3>
          {problemas.length === 0 ? (
            <p data-testid="sin-problemas" className="text-green-700 dark:text-green-400">
              Sin problemas: la escena es coherente.
            </p>
          ) : (
            <>
              {errores.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-red-700 dark:text-red-400">
                  {errores.map((p) => (
                    <li key={`${p.codigo}${p.ruta}`}>
                      <code>{p.codigo}</code> {p.mensaje}{" "}
                      <span className="text-neutral-500">({p.ruta})</span>
                    </li>
                  ))}
                </ul>
              )}
              {avisos.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-700 dark:text-amber-400">
                  {avisos.map((p) => (
                    <li key={`${p.codigo}${p.ruta}`}>
                      <code>{p.codigo}</code> {p.mensaje}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
