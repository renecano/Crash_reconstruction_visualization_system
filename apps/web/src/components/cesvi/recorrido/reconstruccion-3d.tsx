"use client";
/**
 * El 3D en el recorrido de /cesvi (R9, ADR 0073): la versión de la evidencia del paso 4 pasa por el
 * solver (las mismas piezas que «Caso nuevo») y se ve en el visor, a pantalla completa. Las
 * velocidades son las que estima Croquis para reproducir las posiciones; las que la evidencia no
 * fija se dicen así.
 */
import {
  especDeExpediente,
  especReconstruida,
  expedienteDelRecorrido,
  interpretarResultado,
  type CasoCesvi,
  type Reconstruccion,
  type VersionCroquis,
} from "@croquis/cesvi";
import type { EscenaSpec } from "@croquis/scene-schema";
import { useEffect, useMemo, useState } from "react";
import {
  CONTROLES_INICIALES,
  type ControlesVisor,
  VisorEscena,
} from "@/components/visor/visor-app";
import { reconstruirCompletoEnNavegador } from "@/lib/reconstruct-client";

const kmh = (x?: number) => (x === undefined ? "—" : x.toFixed(1));

export function Reconstruccion3dRecorrido({
  caso,
  evidencia,
  nombres,
  tema,
  onCerrar,
}: {
  caso: CasoCesvi;
  evidencia: VersionCroquis;
  /** Cómo se llama cada vehículo en el recorrido («A · Silverado»). */
  nombres: Record<"A" | "B", string>;
  tema: "claro" | "oscuro";
  onCerrar: () => void;
}) {
  const [r, setR] = useState<Reconstruccion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controles, setControles] = useState<ControlesVisor>({
    ...CONTROLES_INICIALES,
    camara: "cinematica",
    auto: true,
  });
  useEffect(() => {
    let vivo = true;
    const base = especDeExpediente(expedienteDelRecorrido(caso, evidencia), `recorrido-${caso.id}`);
    reconstruirCompletoEnNavegador(base.spec as unknown as EscenaSpec)
      .then((res) => {
        if (vivo) setR(interpretarResultado(base, res as unknown as Record<string, unknown>));
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      vivo = false;
    };
  }, [caso, evidencia]);
  const spec3d = useMemo(() => (r ? (especReconstruida(r) as unknown as EscenaSpec) : null), [r]);
  const letra = (id: string) => (id === "V1" ? "A" : "B") as "A" | "B";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto bg-fondo p-4 text-texto md:p-6"
      data-tema={tema}
      role="dialog"
      aria-modal="true"
      aria-label="La reconstrucción en 3D"
      data-testid="recorrido-3d"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="t-titulo">La reconstrucción en 3D</h2>
          <p className="t-nota max-w-[80ch]">
            La versión de la evidencia del paso 4, con el solver de Croquis: las velocidades son las
            que reproducen las posiciones (supuesto, con su rango). Reconstrucción de apoyo: el
            dictamen es del perito.
          </p>
        </div>
        <button
          type="button"
          className="boton-secundario"
          onClick={onCerrar}
          data-testid="cerrar-3d"
        >
          Cerrar
        </button>
      </div>
      {error ? (
        <p role="status" className="t-interfaz">
          El solver no pudo reconstruir la escena: {error}
        </p>
      ) : !r || !spec3d ? (
        <p role="status" className="t-interfaz">
          Reconstruyendo con el solver…
        </p>
      ) : (
        <>
          <ul className="cifras t-nota flex flex-wrap gap-x-6 gap-y-1" data-testid="velocidades-3d">
            {r.velocidades.map((v) => (
              <li key={v.vehiculo}>
                <span className="font-sans font-medium text-texto">
                  {nombres[letra(v.vehiculo)]}
                </span>
                {": "}
                {v.previa
                  ? `${v.previa.mejor.toFixed(1)} km/h (${kmh(v.previa.p10)}–${kmh(v.previa.p90)})`
                  : "la evidencia no la fija"}
              </li>
            ))}
          </ul>
          <VisorEscena
            spec={spec3d}
            escena="propia"
            controles={controles}
            onControl={(k, v) =>
              setControles((c) => {
                if (k === "completa") return { ...c, completa: v !== null };
                if (k === "camara") return { ...c, camara: v ?? "libre" };
                if (k === "calidad")
                  return { ...c, calidad: (v ?? "auto") as ControlesVisor["calidad"] };
                return { ...c, renderer: (v ?? "auto") as ControlesVisor["renderer"] };
              })
            }
          />
        </>
      )}
    </div>
  );
}
