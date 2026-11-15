"use client";

/**
 * La barra de reproducción del 3D de Unity (auditoría del 2026-11-15, I3): la misma de la maqueta 2D
 * (reproducir, deslizador y velocidad) más «Ir al impacto», «Ver todo» y «Repetir». Solo manda
 * mensajes que el puente ya tenía; Unity sigue reproduciendo el Resultado, sin calcular nada.
 *
 * Va arriba de la leyenda del visor («Reconstrucción ilustrativa…»), que nunca se tapa.
 */
import { formato as F } from "@croquis/cesvi";
import {
  etiquetaVelocidad,
  VELOCIDADES,
  type Accion,
  type EstadoReproduccion,
  type Intervalo,
} from "@/lib/visor-unity/reproduccion";

export function BarraReproduccion({
  estado,
  intervalo,
  corre,
  onAccion,
}: {
  estado: EstadoReproduccion;
  intervalo: Intervalo;
  /** Si Unity está reproduciendo ahora (el 3D a la vista y sin pausar). */
  corre: boolean;
  onAccion: (a: Accion) => void;
}) {
  const { inicio, fin } = intervalo;
  const fraccion = (x: number) => (fin > inicio ? ((x - inicio) / (fin - inicio)) * 100 : 0);
  return (
    <div
      className="escena-avance absolute right-4 bottom-14 left-4 z-10 flex flex-wrap items-center gap-3 p-3"
      data-testid="controles-unity"
      data-t={F.fijo(estado.t, 2)}
      data-pausado={estado.pausado ? "si" : "no"}
    >
      <button
        type="button"
        className="boton-principal grid h-11 w-11 shrink-0 place-items-center rounded-control p-0"
        aria-label={corre ? "Pausar" : "Reproducir"}
        onClick={() => onAccion({ tipo: "alternar" })}
        data-testid="reproducir-unity"
      >
        {corre ? "❚❚" : "▶"}
      </button>
      <div className="relative min-w-40 flex-1">
        <input
          type="range"
          className="w-full accent-[var(--texto)]"
          min={inicio}
          max={fin}
          step={0.01}
          value={estado.t}
          aria-label="Instante de la reconstrucción"
          aria-valuetext={`${F.numero(estado.t, 2)} segundos respecto al impacto`}
          onChange={(e) => onAccion({ tipo: "ir", t: Number(e.target.value) })}
          data-testid="tiempo-unity"
        />
        <span
          className="pointer-events-none absolute top-0 h-3 w-0.5 bg-senal"
          style={{ left: `${fraccion(0)}%` }}
          aria-hidden="true"
        />
        <div className="relative mt-0.5 h-4 font-mono text-[0.6875rem] text-texto-3">
          <span className="absolute left-0">Llegada</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${fraccion(0)}%` }}>
            Impacto · t {F.instante(estado.t)}
          </span>
          <span className="absolute right-0">Reposo final</span>
        </div>
      </div>
      <div className="segmentado shrink-0" role="group" aria-label="Velocidad de reproducción">
        {VELOCIDADES.map((v) => (
          <button
            key={v}
            type="button"
            className="px-3"
            aria-pressed={estado.velocidad === v}
            onClick={() => onAccion({ tipo: "velocidad", x: v })}
            data-testid={`velocidad-unity-${v}`}
          >
            {etiquetaVelocidad(v)}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="boton-secundario boton-compacto"
          onClick={() => onAccion({ tipo: "impacto" })}
          data-testid="ir-al-impacto-unity"
        >
          Ir al impacto
        </button>
        <button
          type="button"
          className="boton-secundario boton-compacto"
          onClick={() => onAccion({ tipo: "todo" })}
          data-testid="ver-todo-unity"
        >
          Ver todo
        </button>
        <button
          type="button"
          className="boton-secundario boton-compacto"
          onClick={() => onAccion({ tipo: "repetir" })}
          data-testid="repetir-unity"
        >
          Repetir
        </button>
      </div>
    </div>
  );
}
