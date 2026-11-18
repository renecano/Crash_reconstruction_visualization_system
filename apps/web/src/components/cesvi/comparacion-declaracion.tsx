"use client";
/**
 * R7 (ADR 0070), en el acto «Versiones» desde la ronda 4 (René, 2026-11-18): el perito pega lo que
 * declaró un conductor y elige qué vehículo conducía; Croquis la lee, simula esa versión con la
 * misma física y la agrega a la lista de versiones, con lo que cambia contra la evidencia. Es lo que
 * dice el conductor, no evidencia; Croquis no dice quién tiene razón.
 */
import {
  compararDeclarada,
  descripcionVehiculo,
  especDeclarada,
  especDeExpediente,
  versionDeclarada,
  type Expediente,
  type Reconstruccion,
  type SalidaCorpus,
} from "@croquis/cesvi";
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { useState } from "react";
import { reconstruirCompletoEnNavegador } from "@/lib/reconstruct-client";
import { textoParaClaude } from "@/lib/redaccion";
import { resumenDeDeclaracion, type VersionDeclaracion } from "@/lib/versiones-caso";

type Id = Expediente["vehiculos"][number]["id"];

/** Agregar la declaración de un conductor: el texto, quién la dio y «Leer y comparar». */
export function FormDeclaracion({
  expediente,
  reconstruccion,
  onVersion,
  nombreDe = (id) => id,
  textoInicial = "",
  declaranteInicial,
}: {
  expediente: Expediente;
  reconstruccion: Reconstruccion;
  /** La versión declarada ya leída y simulada, lista para la lista de versiones. */
  onVersion: (v: VersionDeclaracion) => void;
  /** «B · GM Camaro», por id del expediente. */
  nombreDe?: (id: string) => string;
  /** La declaración que trae el caso (AXA), ya escrita; el perito la lee o la cambia. */
  textoInicial?: string;
  declaranteInicial?: Id;
}) {
  const ids = expediente.vehiculos.map((v) => v.id);
  const [texto, setTexto] = useState(textoInicial);
  const [declarante, setDeclarante] = useState<Id>(declaranteInicial ?? ids[0]!);
  const [estado, setEstado] = useState<string | null>(null);

  const comparar = async () => {
    setEstado("Leyendo la declaración…");
    try {
      const res = await fetch("/api/cesvi/declaracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto,
          declarante,
          vehiculos: expediente.vehiculos.map((v) => ({
            id: v.id,
            descripcion: descripcionVehiculo(v),
          })),
        }),
      });
      const d = (await res.json()) as {
        metodo?: string;
        motivo?: string;
        error?: string;
        salida?: SalidaCorpus;
      };
      if (d.metodo !== "claude" || !d.salida) {
        setEstado(`No se pudo leer la declaración: ${d.motivo ?? d.error ?? "sin respuesta"}.`);
        return;
      }
      // Las citas salen del texto que vio Claude: la declaración sin datos personales (PLAN §10).
      const v = versionDeclarada(d.salida, textoParaClaude(texto), declarante, ids);
      setEstado("Simulando la versión declarada…");
      const reconstruidas = new Map(
        reconstruccion.velocidades.flatMap((x) =>
          x.previa ? [[x.vehiculo, x.previa.mejor]] : [],
        ) as [Id, number][],
      );
      const decl = especDeclarada(especDeExpediente(expediente), v, reconstruidas);
      const resultado = await reconstruirCompletoEnNavegador(decl.spec as unknown as EscenaSpec);
      const filas = compararDeclarada({
        expediente,
        reconstruccion,
        declarada: v,
        resultadoDeclarado: resultado as unknown as Record<string, unknown>,
      });
      const quien = nombreDe(declarante);
      onVersion({
        clave: `declaracion-${declarante}`,
        tipo: "declaracion",
        titulo: `Lo que declaró el conductor de ${quien}`,
        resumen: resumenDeDeclaracion(filas),
        etiqueta: `lo que declaró el conductor de ${quien}`,
        resultado: resultado as Resultado,
        escena: decl.spec as unknown as EscenaSpec,
        declarante,
        version: v,
        filas,
        sugerencia: { pedida: false, decision: null },
      });
      setEstado(null);
    } catch (e) {
      setEstado(`No se pudo comparar: ${(e as Error).message}`);
    }
  };

  const ocupado =
    estado === "Leyendo la declaración…" || estado === "Simulando la versión declarada…";
  return (
    <div className="flex flex-col gap-3" data-testid="comparacion-declaracion">
      <p className="t-nota">
        Pega lo que declaró un conductor. Croquis arma esa versión con la misma física y la dibuja
        sobre la reconstrucción. Es lo que dice el conductor, no evidencia; Croquis no dice quién
        tiene razón.
      </p>
      <label className="solo-trabajar flex flex-col gap-1.5">
        <span className="t-nota">Declaración</span>
        <textarea
          className="campo min-h-[120px]"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          data-testid="texto-declaracion"
        />
      </label>
      <label className="solo-trabajar flex flex-wrap items-center gap-2">
        <span className="t-nota">La declaró el conductor de</span>
        <select
          className="campo"
          value={declarante}
          onChange={(e) => setDeclarante(e.target.value as Id)}
          data-testid="declarante"
        >
          {expediente.vehiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {nombreDe(v.id)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="boton-principal solo-trabajar self-start"
        disabled={texto.trim().length < 20 || ocupado}
        onClick={() => void comparar()}
        data-testid="leer-declaracion"
      >
        Leer y comparar
      </button>
      {estado ? (
        <p role="status" className="t-interfaz">
          {estado}
        </p>
      ) : null}
    </div>
  );
}
