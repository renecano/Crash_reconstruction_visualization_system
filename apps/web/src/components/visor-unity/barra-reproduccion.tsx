"use client";

/**
 * La barra de reproducción, una sola para el 3D y el 2D (ronda 2, A6): reproducir, línea de tiempo,
 * velocidad, «Ir al impacto», «Ver todo» y «Repetir», con los mismos controles en el mismo lugar. En
 * el 3D manda mensajes que el puente ya tenía (Unity sigue reproduciendo el Resultado, sin calcular
 * nada); en el 2D mueve el reloj de la maqueta. El instante se conserva al cambiar de pestaña.
 *
 * En el 3D va arriba de la leyenda del visor («Reconstrucción ilustrativa…»), que nunca se tapa.
 */
import { formato as F } from "@croquis/cesvi";
import {
  alFinal,
  etiquetaVelocidad,
  VELOCIDADES,
  type Accion,
  type EstadoReproduccion,
  type Intervalo,
} from "@/lib/visor-unity/reproduccion";
import { EnRanura, useMarco } from "./marco-vista";

export function BarraReproduccion({
  estado,
  intervalo,
  corre,
  onAccion,
  de = "unity",
}: {
  /** De qué vista es: cambia dónde se apoya y sus nombres para las pruebas. */
  de?: "unity" | "maqueta";
  estado: EstadoReproduccion;
  intervalo: Intervalo;
  /** Si Unity está reproduciendo ahora (el 3D a la vista y sin pausar). */
  corre: boolean;
  onAccion: (a: Accion) => void;
}) {
  const { inicio, fin } = intervalo;
  // Al final, el botón dice «Repetir» (↻) y vuelve a empezar.
  const terminada = estado.pausado && alFinal(estado.t, intervalo);
  const fraccion = (x: number) => (fin > inicio ? ((x - inicio) / (fin - inicio)) * 100 : 0);
  // Con el marco del caso (René, 2026-11-17) va abajo, fuera de la escena; sin él, encima.
  const { enMarco } = useMarco();
  const barra = (
    <div
      className={
        enMarco
          ? "flex flex-wrap items-center gap-3"
          : `escena-avance absolute right-4 left-4 z-10 flex flex-wrap items-center gap-3 p-3 ${de === "unity" ? "bottom-14" : "bottom-4"}`
      }
      data-testid={de === "unity" ? "controles-unity" : "linea-de-tiempo"}
      data-t={F.fijo(estado.t, 2)}
      data-pausado={estado.pausado ? "si" : "no"}
    >
      <button
        type="button"
        className="boton-principal grid h-11 w-11 shrink-0 place-items-center rounded-control p-0"
        aria-label={corre ? "Pausar" : terminada ? "Repetir" : "Reproducir"}
        onClick={() => onAccion({ tipo: "alternar" })}
        data-testid={`reproducir-${de}`}
        // Espacio, a pantalla completa, toca este botón (el marco lo busca por aquí).
        data-reproducir
      >
        {corre ? "❚❚" : terminada ? "↻" : "▶"}
      </button>
      {/* Un contenedor con nombre: las etiquetas se acomodan según el ancho de la línea, no de la
          ventana (a 1280 px «Llegada» e «Impacto» se encimaban; René, 2026-11-18). */}
      <div className="@container relative min-w-40 flex-1">
        <input
          type="range"
          className="w-full accent-[var(--texto)]"
          min={inicio}
          max={fin}
          // Sin paso: con 0.01 la perilla saltaba de 1 en 1 o de 2 en 2 centésimas por cuadro y temblaba
          // (René, 2026-11-28).
          step="any"
          value={estado.t}
          aria-label="Instante de la reconstrucción"
          aria-valuetext={`${F.numero(estado.t, 2)} segundos respecto al impacto`}
          onChange={(e) => onAccion({ tipo: "ir", t: Number(e.target.value) })}
          data-testid={`tiempo-${de}`}
        />
        <span
          className="pointer-events-none absolute top-0 h-3 w-0.5 bg-senal"
          style={{ left: `${fraccion(0)}%` }}
          aria-hidden="true"
        />
        {/* Angosta: «Llegada» y «Reposo final» arriba y el impacto en su propio renglón. Ancha: un
            renglón, y el impacto nunca se acerca a las de los extremos más de lo que miden. */}
        <div
          className="relative mt-0.5 h-8 font-mono text-[0.6875rem] leading-4 whitespace-nowrap text-texto-3 [--der:4.75rem] [--izq:4.75rem] @md:h-4 @md:[--der:10rem] @md:[--izq:8rem]"
          data-testid="etiquetas-tiempo"
        >
          <span className="absolute top-0 left-0" data-etiqueta="llegada">
            Llegada
          </span>
          <span
            className="absolute top-4 -translate-x-1/2 @md:top-0"
            style={{
              left: `clamp(var(--izq), ${fraccion(0)}%, calc(100% - var(--der)))`,
            }}
            data-etiqueta="impacto"
          >
            Impacto · t {F.instante(estado.t)}
          </span>
          <span className="absolute top-0 right-0" data-etiqueta="reposo">
            Reposo final
          </span>
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
            data-testid={`velocidad-${de}-${v}`}
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
          data-testid={`ir-al-impacto-${de}`}
        >
          Ir al impacto
        </button>
        <button
          type="button"
          className="boton-secundario boton-compacto"
          onClick={() => onAccion({ tipo: "todo" })}
          data-testid={`ver-todo-${de}`}
        >
          Ver todo
        </button>
        <button
          type="button"
          className="boton-secundario boton-compacto"
          onClick={() => onAccion({ tipo: "repetir" })}
          data-testid={`repetir-${de}`}
        >
          Repetir
        </button>
      </div>
    </div>
  );
  return enMarco ? <EnRanura ranura="abajo">{barra}</EnRanura> : barra;
}
