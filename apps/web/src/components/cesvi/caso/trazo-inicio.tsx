"use client";
/**
 * «El trazo»: la primera pantalla de un caso nuevo (ronda 2, A1; René eligió esta propuesta el
 * 2026-11-16). En cinco segundos tiene que entenderse qué hace Croquis, qué va a pasar y qué tocar
 * primero: un titular, una sola línea que se dibuja y pasa por cinco viñetas (narras, colocas, se
 * reconstruye, comparas, firmas) con quién actúa en cada una, y un botón.
 *
 * La línea es la misma de la barra de arriba: al empezar se recoge hacia ella. Las viñetas no llevan
 * cifras: un número fijo aquí no saldría del cálculo. Con `prefers-reduced-motion` o con
 * «Transiciones» apagado no se anima nada.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Lo que tarda el trazo en recogerse antes de pasar a la narración (ms). */
export const SALIDA_MS = 260;

const ESTACIONES: readonly {
  clave: string;
  quien: "Tú" | "Croquis";
  verbo: string;
  que: string;
  dibujo: ReactNode;
}[] = [
  {
    clave: "narras",
    quien: "Tú",
    verbo: "Narras",
    que: "con tus palabras, como en un reporte",
    // Un párrafo con una frase marcada: de ahí sale cada dato, con su cita.
    dibujo: (
      <>
        <path className="tz-g" d="M12 28H162M12 52H144M12 76H72M130 76H168M12 100H156M12 124H108" />
        <rect className="tz-marca" x="76" y="66" width="50" height="20" rx="3" />
        <path className="tz-o" d="M78 76H124" />
        <path className="tz-d" d="M124 68q14 -22 34 -26M152 36l8 6l-9 5" />
      </>
    ),
  },
  {
    clave: "colocas",
    quien: "Tú",
    verbo: "Colocas",
    que: "el lugar y dónde quedó cada vehículo",
    // Un cruce del mapa con la mira del logo y los dos vehículos.
    dibujo: (
      <>
        <path className="tz-g" d="M10 46L170 26M10 126L170 106M50 6L66 156M130 6L142 156" />
        <circle className="tz-o" cx="136" cy="30" r="13" />
        <path className="tz-o" d="M136 10v8M136 42v8M156 30h-8" />
        <circle className="tz-punto" cx="136" cy="30" r="2.6" />
        <rect
          className="tz-d tz-a"
          x="-17"
          y="-8"
          width="34"
          height="16"
          rx="4.5"
          transform="translate(94 37) rotate(-7)"
        />
        <rect
          className="tz-d tz-b"
          x="-17"
          y="-8"
          width="34"
          height="16"
          rx="4.5"
          transform="translate(138 80) rotate(84)"
        />
      </>
    ),
  },
  {
    clave: "reconstruye",
    quien: "Croquis",
    verbo: "Reconstruye",
    que: "con física: velocidad, movimiento y daño",
    // Dos trayectorias que se encuentran en el impacto, con sus siluetas.
    dibujo: (
      <>
        <path className="tz-o tz-tray" d="M10 146C50 126, 72 106, 90 82" />
        <path className="tz-o tz-tray" d="M170 12C138 36, 114 58, 94 78" />
        <circle className="tz-o" cx="92" cy="80" r="15" />
        <circle className="tz-punto" cx="92" cy="80" r="4.5" />
        <rect
          className="tz-d tz-fantasma"
          x="-17"
          y="-8"
          width="34"
          height="16"
          rx="4.5"
          transform="translate(32 134) rotate(-34)"
        />
        <rect
          className="tz-d tz-lleno"
          x="-17"
          y="-8"
          width="34"
          height="16"
          rx="4.5"
          transform="translate(60 112) rotate(-44)"
        />
        <rect
          className="tz-d tz-fantasma"
          x="-17"
          y="-8"
          width="34"
          height="16"
          rx="4.5"
          transform="translate(148 28) rotate(142)"
        />
        <rect
          className="tz-d tz-lleno"
          x="-17"
          y="-8"
          width="34"
          height="16"
          rx="4.5"
          transform="translate(122 52) rotate(138)"
        />
      </>
    ),
  },
  {
    clave: "comparas",
    quien: "Tú",
    verbo: "Comparas",
    que: "con el reporte de CESVI o la declaración",
    // La velocidad con su rango, y dónde cae lo que dice el reporte. Sin cifras: no es un cálculo.
    dibujo: (
      <>
        <text className="tz-unidad" x="14" y="78">
          km/h
        </text>
        <path className="tz-d" d="M14 116H166M14 108v16M166 108v16" />
        <circle className="tz-punto" cx="94" cy="116" r="5.5" />
        <path className="tz-d tz-reporte" d="M124 98v36" />
        <text className="tz-rotulo" x="124" y="92" textAnchor="middle">
          reporte
        </text>
        <text className="tz-rotulo" x="90" y="142" textAnchor="middle">
          rango
        </text>
      </>
    ),
  },
  {
    clave: "firmas",
    quien: "Tú",
    verbo: "Firmas",
    que: "el dictamen es tuyo",
    // La hoja del dictamen con la firma y su sello.
    dibujo: (
      <>
        <rect className="tz-d tz-lleno" x="36" y="6" width="108" height="150" rx="3" />
        <path className="tz-g" d="M52 30H128M52 50H128M52 70H104" />
        <path className="tz-d" d="M54 124c10 -22 16 8 24 -8s8 18 18 2s14 4 30 -6" />
        <circle className="tz-o tz-lleno" cx="134" cy="132" r="19" />
        <path className="tz-o" d="M126 132l6 6l11 -13" />
      </>
    ),
  },
];

export function TrazoInicio({
  onEscribir,
  onEjemplo,
  abrir,
  animar,
  retrasoMs = 0,
}: {
  /** Pasa a la narración (después de que el trazo se recoge). */
  onEscribir: () => void;
  /** Pone una narración de ejemplo y pasa a la narración. */
  onEjemplo: () => void;
  /** El control para abrir un caso guardado (lleva su `input` de archivo). */
  abrir: ReactNode;
  /** Si se anima (lo decide quien conoce la preferencia «Transiciones»). */
  animar: boolean;
  /** Cuánto espera el trazo a que suba la cortina del acto (ms). */
  retrasoMs?: number;
}) {
  const [saliendo, setSaliendo] = useState(false);
  const reloj = useRef<number | null>(null);
  useEffect(() => () => window.clearTimeout(reloj.current ?? undefined), []);
  const salir = (despues: () => void) => {
    const quieto =
      !animar ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (quieto) return despues();
    if (saliendo) return undefined;
    setSaliendo(true);
    reloj.current = window.setTimeout(despues, SALIDA_MS);
    return undefined;
  };
  return (
    <div
      className="trazo-inicio"
      data-testid="trazo-inicio"
      data-animar={animar ? "si" : "no"}
      data-saliendo={saliendo ? "si" : "no"}
      style={{ "--tz-retraso": `${retrasoMs}ms` } as React.CSSProperties}
    >
      <h2 className="tz-titular" data-testid="titulo-caso">
        Narra el hecho. Croquis lo reconstruye.
      </h2>
      <div className="tz-ruta">
        <svg
          className="tz-linea"
          viewBox="0 0 1000 40"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            pathLength={1}
            d="M-10 20C40 20, 60 12, 100 20S220 34, 300 20S420 6, 500 20S620 36, 700 20S820 8, 900 20S980 24, 1010 20"
          />
        </svg>
        <ol className="tz-estaciones" aria-label="Lo que va a pasar, paso a paso">
          {ESTACIONES.map((e) => (
            <li key={e.clave} data-testid={`trazo-${e.clave}`}>
              <svg className="tz-vineta" viewBox="0 0 180 160" aria-hidden="true">
                {e.dibujo}
              </svg>
              <span className="tz-texto">
                <span
                  className="t-rotulo tz-quien"
                  data-quien={e.quien === "Croquis" ? "croquis" : "tu"}
                >
                  {e.quien}
                </span>
                <span className="tz-verbo">{e.verbo}</span>
                <span className="tz-que">{e.que}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="solo-trabajar tz-acciones">
        <button
          type="button"
          className="boton-principal boton-continuar tz-empezar"
          onClick={() => salir(onEscribir)}
          // El mismo nombre que «Continuar» en los demás pasos: es el siguiente del recorrido.
          data-testid="siguiente"
        >
          Escribir la narración del hecho
          <span className="flecha-continuar" aria-hidden="true">
            →
          </span>
        </button>
        <button
          type="button"
          className="boton-secundario"
          onClick={() => salir(onEjemplo)}
          data-testid="usar-ejemplo-inicio"
        >
          Usar un ejemplo
        </button>
        {abrir}
      </div>
    </div>
  );
}
