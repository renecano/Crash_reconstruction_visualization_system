"use client";
/**
 * Editor del croquis (herramienta avanzada de `/croquis`, PLAN §11.4): las escenas de ejemplo o la
 * del relato, el croquis sobre el papel del parte sincronizado con la `EscenaSpec` en JSON, la
 * revisión de la escena, calles reales y exportaciones. El flujo guiado usa solo el croquis.
 */
import { Croquis } from "@croquis/croquis-2d";
import {
  FIXTURE_NAMES,
  checkEscena,
  loadFixture,
  validateEscena,
  type EscenaSpec,
  type FixtureName,
  type Problema,
} from "@croquis/scene-schema";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { croquisPdf, croquisPng, croquisSvgFile } from "@/lib/croquis-export";
import { downloadBytes, safeName } from "@/lib/download";
import { registrarE9 } from "@/lib/e9";
import { guardarEscenaPropia } from "@/lib/escena-propia";
import { mensaje } from "@/lib/mensajes";
import { RELATO_SPEC_KEY } from "@/lib/relato-api";
import { CallesReales } from "./calles-reales";
import { Legend, useTextosCroquis } from "./legend";
import { tituloEscena } from "@/i18n/vocabulario";

const T = textos(
  {
    croquis: "Croquis editable",
    deRelato: "Escena de tu relato",
    escena: "Escena",
    finales: "Mostrar posiciones finales",
    restablecer: "Restablecer",
    ayuda:
      "Arrastra vehículos, personas, objetos y marcas; gira un vehículo con el asa amarilla. Cada cambio queda marcado como «fuente: usuario» en el JSON.",
    json: "EscenaSpec en JSON",
    aplicar: "Aplicar JSON",
    descargar: "Descargar JSON",
    ver3d: "Ver en 3D",
    exportar: "Exportar el croquis (con la marca de reconstrucción ilustrativa):",
    exportarGrupo: "Exportar el croquis",
    malFormado: (e: string) => `JSON mal formado: ${e}`,
    revision: "Revisión de la escena",
    sinProblemas: "Sin problemas: la escena es coherente.",
    errores: "Errores",
    avisos: "Avisos",
  },
  {
    croquis: "Editable sketch",
    deRelato: "Scene from your narrative",
    escena: "Scene",
    finales: "Show final positions",
    restablecer: "Reset",
    ayuda:
      "Drag vehicles, people, objects and marks; rotate a vehicle with the yellow handle. Every change is marked as “fuente: usuario” in the JSON.",
    json: "EscenaSpec as JSON",
    aplicar: "Apply JSON",
    descargar: "Download JSON",
    ver3d: "View in 3D",
    exportar: "Export the sketch (with the illustrative reconstruction notice):",
    exportarGrupo: "Export the sketch",
    malFormado: (e: string) => `Malformed JSON: ${e}`,
    revision: "Scene review",
    sinProblemas: "No problems: the scene is consistent.",
    errores: "Errors",
    avisos: "Warnings",
  },
);

function toJson(spec: EscenaSpec): string {
  return JSON.stringify(spec, null, 2);
}

function Problemas({
  lista,
  titulo,
  lang,
}: {
  lista: Problema[];
  titulo: string;
  lang: "es" | "en";
}) {
  if (lista.length === 0) return null;
  return (
    <div className="mt-3">
      <h4 className="t-nota mb-1">{titulo}</h4>
      <ul className="t-nota flex flex-col gap-1 text-texto">
        {lista.map((p) => {
          const m = mensaje(p.mensaje, lang);
          return (
            <li key={`${p.codigo}${p.ruta}`}>
              <code className="cifras">{p.codigo}</code> <span lang={m.lang}>{m.texto}</span>{" "}
              <span className="text-texto-3">({p.ruta})</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CroquisEditor({ initial = "alcance" }: { initial?: FixtureName }) {
  const { lang, ruta } = useIdioma();
  const t = useTextos(T);
  const textosCroquis = useTextosCroquis();
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

  // Escena que llega desde el relato (`/croquis?fuente=relato`).
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
      setJsonErrors([t.malFormado((e as Error).message)]);
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
    <div className="grid gap-10 lg:grid-cols-12">
      <section aria-label={t.croquis} className="flex min-w-0 flex-col gap-4 lg:col-span-7">
        <div className="flex flex-wrap items-end gap-4">
          {fromRelato ? (
            <span data-testid="escena-relato" className="t-interfaz border-l-2 border-texto pl-3">
              {t.deRelato}
            </span>
          ) : null}
          <label className="t-nota flex flex-col gap-1">
            <span>{t.escena}</span>
            <select
              data-testid="scene-select"
              className="campo w-full max-w-xl"
              value={name}
              onChange={(e) => pick(e.target.value as FixtureName)}
            >
              {FIXTURE_NAMES.map((n) => (
                <option key={n} value={n}>
                  {tituloEscena(n, lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="t-interfaz flex min-h-11 cursor-pointer items-center gap-3 pb-3">
            <input
              type="checkbox"
              checked={showFinal}
              onChange={(e) => setShowFinal(e.target.checked)}
              className="h-5 w-5 accent-[var(--accion)]"
            />
            {t.finales}
          </label>
          <button
            type="button"
            data-testid="reset"
            className="boton-secundario mb-1 min-h-11 px-4"
            onClick={() => pick(name)}
          >
            {t.restablecer}
          </button>
        </div>
        <div className="overflow-hidden rounded-panel" data-tema="papel">
          <Croquis
            spec={spec}
            onChange={(next) => {
              registrarE9("correccion_croquis");
              applySpec(next);
            }}
            showFinal={showFinal}
            selectedId={selected}
            onSelect={setSelected}
            textos={textosCroquis}
          />
        </div>
        <p className="t-nota">{t.ayuda}</p>
        <CallesReales spec={spec} onApply={applySpec} />
        <Legend
          seed={spec.meta.semilla}
          inputHash={spec.meta.hash_relato}
          atribucion={spec.lugar.red_vial?.atribucion}
        />
      </section>

      <section aria-label={t.json} className="flex min-w-0 flex-col gap-4 lg:col-span-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="t-subtitulo mr-auto">EscenaSpec</h2>
          <button
            type="button"
            data-testid="ver-3d"
            className="boton-principal"
            onClick={() => {
              // La escena (con los cambios aplicados) se reconstruye en el navegador y se ve en 3D.
              if (guardarEscenaPropia(spec)) router.push(`${ruta("/visor")}?escena=propia`);
            }}
          >
            {t.ver3d}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="apply-json"
            className="boton-secundario min-h-11 px-4"
            onClick={applyJson}
          >
            {t.aplicar}
          </button>
          <button
            type="button"
            data-testid="download-json"
            className="boton-secundario min-h-11 px-4"
            onClick={download}
          >
            {t.descargar}
          </button>
        </div>
        <div className="flex flex-col gap-2" role="group" aria-label={t.exportarGrupo}>
          <span className="t-nota">{t.exportar}</span>
          <div className="flex flex-wrap gap-2">
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
                className="boton-secundario min-h-11 px-4"
                onClick={() => void exportCroquis(fmt)}
              >
                {label}
              </button>
            ))}
          </div>
          {exportError ? (
            <span role="alert" className="t-nota border-l-2 border-texto pl-3 text-texto">
              {exportError}
            </span>
          ) : null}
        </div>
        <textarea
          data-testid="json"
          aria-label={t.json}
          spellCheck={false}
          className="campo h-[28rem] resize-y font-mono text-xs leading-relaxed"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        {jsonErrors.length > 0 && (
          <ul
            data-testid="json-errors"
            className="t-nota flex flex-col gap-1 border-l-2 border-texto pl-3 text-texto"
          >
            {jsonErrors.slice(0, 12).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <div data-testid="problemas" className="border-t border-linea pt-4">
          <h3 className="t-interfaz">{t.revision}</h3>
          {problemas.length === 0 ? (
            <p data-testid="sin-problemas" className="t-nota mt-2">
              {t.sinProblemas}
            </p>
          ) : (
            <>
              <Problemas lista={errores} titulo={t.errores} lang={lang} />
              <Problemas lista={avisos} titulo={t.avisos} lang={lang} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
