"use client";
/**
 * Cargar un reporte de CESVI (R5, ADR 0068). El perito sube el reporte en PDF, Markdown o texto; el texto se
 * saca en el navegador y Claude lo lee dos veces (el expediente con la cita de cada dato, y la
 * narración con lo que concluyó CESVI). Cada cita se revisa contra el texto. El expediente abre en
 * «Caso nuevo» para colocar a los vehículos y reconstruir, con lo que concluyó CESVI al lado.
 */
import {
  importarDictamen,
  type Conclusiones,
  resumenTexto,
  type DictamenImportado,
  type SalidaCorpus,
  type SalidaNarracion,
} from "@croquis/cesvi";
import { useState } from "react";
import ejemplo from "../../../../../data/cesvi/grabaciones/importar/ejemplo.json";
import { MODALIDAD } from "@/lib/nombres-cesvi";
import { textoDeArchivo, type TextoDictamen } from "@/lib/texto-dictamen";

const CARA: Record<string, string> = {
  frontal: "frente",
  posterior: "parte posterior",
  lateral_izquierdo: "costado izquierdo",
  lateral_derecho: "costado derecho",
};

function Cita({ texto }: { texto: string }) {
  return texto ? <span className="t-nota block text-texto-3">«{texto}»</span> : null;
}

/** Lo que concluyó CESVI en el reporte, con la cita de cada dato, para comparar al reconstruir. */
/** Lo que concluyó CESVI en un reporte, con la frase de donde sale cada dato. */
export function ConclusionesCesvi({ conclusiones: c }: { conclusiones: Conclusiones }) {
  return (
    <section className="flex flex-col gap-4" data-testid="conclusiones-cesvi">
      <h2 className="t-subtitulo">Lo que concluyó CESVI en este reporte</h2>
      <p className="t-nota text-texto-2">
        Para comparar con la reconstrucción de Croquis. Cada dato lleva la frase del reporte de
        donde sale.
      </p>
      <div>
        <span className="t-nota">Modalidad</span>
        <p className="t-interfaz font-medium" data-testid="modalidad-cesvi">
          {c.modalidad ? (MODALIDAD[c.modalidad] ?? c.modalidad) : "El reporte no la concluye."}
        </p>
      </div>
      {c.zonas_contacto.length ? (
        <div>
          <span className="t-nota">Zonas de contacto</span>
          <ul className="flex flex-col gap-1.5">
            {c.zonas_contacto.map((z, i) => (
              <li key={i} className="t-interfaz">
                {z.vehiculo} · {CARA[z.cara] ?? z.cara}
                {z.tercio ? ` (${z.tercio})` : ""}
                <Cita texto={z.cita} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {c.velocidades.length ? (
        <div>
          <span className="t-nota">Velocidades</span>
          <ul className="flex flex-col gap-1.5" data-testid="velocidades-cesvi">
            {c.velocidades.map((v, i) => (
              <li key={i} className="t-interfaz">
                {v.vehiculo ?? "—"} · <span className="cifras">{v.kmh.toFixed(2)} km/h</span> ·{" "}
                {v.que}
                <Cita texto={v.cita} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Cargar un reporte de CESVI (R5) como primer paso de un caso importado del recorrido (ADR 0079):
 * el texto se saca en el equipo, Claude lo lee y Croquis arma el expediente con la cita de cada dato.
 */
export function CargaReporte({
  onImportado,
}: {
  onImportado: (d: DictamenImportado, archivo: string) => void;
}) {
  const [archivo, setArchivo] = useState<string | null>(null);
  const [texto, setTexto] = useState<TextoDictamen | null>(null);
  const [estado, setEstado] = useState<string | null>(null);

  const elegir = async (f: File | undefined) => {
    if (!f) return;
    setEstado("Sacando el texto del archivo…");
    try {
      const t = await textoDeArchivo(f);
      setArchivo(f.name);
      setTexto(t);
      setEstado(
        t.texto.length < 200
          ? "El archivo casi no trae texto: si es un PDF escaneado, hace falta el PDF con texto."
          : null,
      );
    } catch {
      setEstado("No se pudo leer el archivo.");
    }
  };

  const leer = async () => {
    if (!texto) return;
    setEstado("Leyendo el reporte con Claude (dos lecturas; puede tardar un par de minutos)…");
    try {
      const r = await fetch("/api/cesvi/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.texto }),
      });
      const d = (await r.json()) as {
        metodo?: string;
        motivo?: string;
        corpus?: SalidaCorpus;
        narracion?: SalidaNarracion;
      };
      if (d.metodo !== "claude" || !d.corpus || !d.narracion) {
        setEstado(`No se pudo leer con Claude (${d.motivo ?? "sin respuesta"}).`);
        return;
      }
      const nombre = archivo ?? "reporte";
      onImportado(importarDictamen(texto.texto, d.corpus, d.narracion, nombre), nombre);
      setEstado(null);
    } catch {
      setEstado("No se pudo leer el reporte.");
    }
  };

  const r = texto ? resumenTexto(texto.texto) : null;
  return (
    <section className="flex flex-col gap-4" data-testid="importar-dictamen">
      <label
        className="hundido flex cursor-pointer flex-col items-center gap-1 rounded-panel border border-dashed border-linea px-6 py-8 text-center hover:border-texto-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void elegir(e.dataTransfer.files[0]);
        }}
        data-testid="zona-archivo"
      >
        <span className="t-interfaz font-semibold">
          {archivo ? archivo : "Elige el reporte en PDF, Markdown o texto"}
        </span>
        <span className="t-nota text-texto-3">
          {archivo ? "Toca para elegir otro" : "o arrástralo aquí"}
        </span>
        <input
          type="file"
          className="sr-only"
          accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
          onChange={(e) => void elegir(e.target.files?.[0])}
          data-testid="archivo-dictamen"
        />
      </label>
      <button
        type="button"
        className="boton-secundario self-start"
        onClick={() => {
          setArchivo(ejemplo.archivo);
          setTexto({ texto: ejemplo.texto, paginas: null });
          setEstado(null);
        }}
        data-testid="ejemplo-dictamen"
      >
        Usar el reporte de ejemplo (caso A2010930, redactado)
      </button>
      {texto && r ? (
        <div className="hundido flex flex-col gap-2 p-4" data-testid="texto-dictamen">
          <span className="t-nota">
            {archivo} · {r.palabras.toLocaleString("es-MX")} palabras
            {texto.paginas ? ` · ${texto.paginas} páginas` : ""}
          </span>
          <p className="t-nota line-clamp-4 whitespace-pre-line text-texto-2">
            {texto.texto.slice(0, 600)}
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="boton-principal"
          onClick={() => void leer()}
          disabled={!texto || texto.texto.length < 200}
          data-testid="leer-dictamen"
        >
          Leer el reporte
        </button>
        {estado ? (
          <span role="status" className="t-nota" data-testid="estado-importar">
            {estado}
          </span>
        ) : null}
      </div>
      <p className="t-nota text-texto-3">El archivo no se guarda: el texto se saca en tu equipo.</p>
    </section>
  );
}
