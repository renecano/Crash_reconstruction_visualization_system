"use client";
/**
 * «Llenar a mano» (ADR 0057): si Claude falla o no hay saldo, el perito llena aquí los datos del
 * hecho y el recorrido sigue igual. Usa las mismas claves que las preguntas del paso 2; lo que llena
 * el perito gana a lo leído.
 */
import { CAMPOS_MANUALES, MANIOBRAS, type RespuestasHecho } from "@croquis/cesvi";
import { useEffect, useRef, useState } from "react";

const SENTIDOS = [
  ["norte", "De sur a norte"],
  ["sur", "De norte a sur"],
  ["oriente", "De poniente a oriente"],
  ["poniente", "De oriente a poniente"],
] as const;
const CARRILES = ["izquierdo", "derecho", "central", "acotamiento"] as const;
const MANIOBRA: Record<string, string> = {
  circula: "Circula",
  se_detiene: "Se detiene",
  reversa: "Reversa",
  frena: "Frena",
  vira_izquierda: "Vira a la izquierda",
  vira_derecha: "Vira a la derecha",
  cambia_carril: "Cambia de carril",
  evasiva: "Maniobra evasiva",
  otra: "Otra",
};

/** Un campo de texto que se aplica al salir de él (no en cada tecla). */
function CampoTexto({
  valor,
  onCambio,
  numero,
  id,
}: {
  valor: string;
  onCambio: (v: string | number | null) => void;
  numero: boolean;
  id: string;
}) {
  const [texto, setTexto] = useState(valor);
  const aplicar = () => {
    const t = texto.trim();
    if (!t) return onCambio(null);
    if (numero) {
      const n = Number(t.replace(",", "."));
      return onCambio(Number.isFinite(n) && n >= 0 ? n : null);
    }
    onCambio(t);
  };
  return (
    <input
      id={id}
      className="campo"
      inputMode={numero ? "decimal" : undefined}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={aplicar}
      onKeyDown={(e) => e.key === "Enter" && aplicar()}
      data-testid={`manual-${id}`}
    />
  );
}

export function PanelManual({
  abierto,
  onCerrar,
  respuestas,
  onResponder,
}: {
  abierto: boolean;
  onCerrar: () => void;
  respuestas: RespuestasHecho;
  onResponder: (clave: string, v: string | number | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return undefined;
    ref.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, onCerrar]);
  const v = (k: string) =>
    respuestas[k] === undefined || respuestas[k] === null ? "" : String(respuestas[k]);
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label="Llenar a mano"
      aria-hidden={!abierto}
      inert={!abierto}
      className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col gap-5 overflow-y-auto border-l border-linea-suave bg-superficie p-6 shadow-2xl outline-none transition-transform duration-500 md:p-8 ${abierto ? "translate-x-0" : "translate-x-full"}`}
      data-testid="panel-manual"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="t-panel">Llenar a mano</h2>
          <p className="t-nota">
            Si la IA no está disponible, llena aquí los datos del hecho; el recorrido sigue igual.
            Lo que llenes gana a lo leído y queda con fuente «perito».
          </p>
        </div>
        <button
          type="button"
          className="boton-secundario boton-compacto h-10 w-10 shrink-0 px-0"
          onClick={onCerrar}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        {CAMPOS_MANUALES.map((c) => (
          <label
            key={c.clave}
            htmlFor={c.clave}
            className="flex flex-col gap-1.5 text-sm text-texto-2"
          >
            {c.etiqueta}
            {c.tipo === "sentido" || c.tipo === "carril" || c.tipo === "maniobra" ? (
              <select
                id={c.clave}
                className="campo"
                value={v(c.clave)}
                onChange={(e) => onResponder(c.clave, e.target.value || null)}
                data-testid={`manual-${c.clave}`}
              >
                <option value="">Sin dato</option>
                {c.tipo === "sentido"
                  ? SENTIDOS.map(([val, txt]) => (
                      <option key={val} value={val}>
                        {txt}
                      </option>
                    ))
                  : c.tipo === "carril"
                    ? CARRILES.map((x) => (
                        <option key={x} value={x}>
                          {x[0]!.toUpperCase() + x.slice(1)}
                        </option>
                      ))
                    : MANIOBRAS.map((x) => (
                        <option key={x} value={x}>
                          {MANIOBRA[x]}
                        </option>
                      ))}
              </select>
            ) : (
              <CampoTexto
                key={`${c.clave}-${v(c.clave)}`}
                id={c.clave}
                valor={v(c.clave)}
                numero={c.tipo === "numero"}
                onCambio={(x) => onResponder(c.clave, x)}
              />
            )}
          </label>
        ))}
      </form>
      <button type="button" className="boton-principal self-start" onClick={onCerrar}>
        Listo
      </button>
    </aside>
  );
}
