"use client";
/**
 * El escenario de la portada (PLAN §11.3 y §11.6): primero un cuadro estático de la escena real
 * (generado con `scripts/portada.mjs`), que es la imagen LCP y viene en el HTML del servidor; luego,
 * cuando la página está quieta y el resultado de la escena ya cargó, la escena 3D de Toluca de
 * noche y con lluvia, guiada por el scroll (`camara.ts`). Con movimiento reducido o sin
 * WebGPU/WebGL se queda el cuadro estático del capítulo.
 */
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import {
  createClock,
  createTimeline,
  isQualityLevel,
  qualityForGpu,
  readGpuRenderer,
  seek,
  type QualityLevel,
  type ViewerClock,
} from "@croquis/viewer";
import type { Guiada } from "@croquis/viewer/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { Lecturas } from "@/components/visor/lecturas";
import { poseCamara, revelado, tiempoEscena } from "./camara";

const SceneViewer = dynamic(() => import("@croquis/viewer/react").then((m) => m.SceneViewer), {
  ssr: false,
  loading: () => null,
});

/** La noche con lluvia de la apertura: solo cambia el dibujo, no la reconstrucción (ADR 0020). */
const AMBIENTE = {
  clima: "lluvia_ligera",
  iluminacion: "noche_con_alumbrado",
  estadoSuperficie: "mojado",
};

interface Props {
  spec: EscenaSpec;
  /** El resultado de la escena; mientras carga, solo se ve el cuadro estático. */
  resultado: Resultado | null;
  /** Hipótesis que se dibujan como fantasmas (capítulo «Simula»). */
  hipotesis: readonly Resultado[];
  /** Posición del scroll (0…N), leída en cada cuadro sin volver a dibujar React. */
  progreso: MutableRefObject<number>;
  /** Mostrar las lecturas de telemetría (capítulo «Impacta»). */
  enImpacta: boolean;
  reducido: boolean;
  /**
   * Cuadro estático que se ve antes del 3D o en lugar de él: ruta en /public sin extensión; hay uno
   * horizontal (`-ancho.jpg`) y uno vertical (`-alto.jpg`), generados con `scripts/portada.mjs`.
   */
  cuadro: string;
  onListo?: () => void;
}

export function Escenario({ resultado, reducido, cuadro, onListo, ...resto }: Props) {
  const [montar, setMontar] = useState(false);
  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState(false);

  // El 3D se monta cuando la página está quieta: el texto y el cuadro estático van primero.
  useEffect(() => {
    if (reducido) return undefined;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setMontar(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setMontar(true), 1200);
    return () => window.clearTimeout(id);
  }, [reducido]);

  // Avisa cuando el primer cuadro 3D ya está dibujado (para retirar el cuadro estático).
  useEffect(() => {
    if (!montar || !resultado) return undefined;
    const id = window.setInterval(() => {
      if (window.__croquisReady) {
        setListo(true);
        onListo?.();
        window.clearInterval(id);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [montar, resultado, onListo]);

  return (
    <div className="fixed inset-0 -z-0 bg-fondo" aria-hidden="true" data-testid="escenario">
      {/* Fondo de respaldo (token luz-escena) mientras no hay ni cuadro ni escena. */}
      <div className="absolute inset-0" style={{ background: "var(--efecto-luz-escena)" }} />
      <picture>
        <source media="(orientation: portrait)" srcSet={`${cuadro}-alto.jpg`} />
        <img
          src={`${cuadro}-ancho.jpg`}
          // Decorativo: la escena se describe en el texto de cada capítulo.
          alt=""
          fetchPriority="high"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            listo && !fallo ? "opacity-0" : "opacity-100"
          }`}
          data-testid="cuadro-portada"
        />
      </picture>
      {montar && resultado && !fallo ? (
        <Escena3D {...resto} resultado={resultado} listo={listo} onError={() => setFallo(true)} />
      ) : null}
    </div>
  );
}

/** La escena 3D y sus lecturas, con el reloj que sigue al scroll. */
function Escena3D({
  spec,
  resultado,
  hipotesis,
  progreso,
  enImpacta,
  listo,
  onError,
}: Omit<Props, "resultado" | "reducido" | "cuadro" | "onListo"> & {
  resultado: Resultado;
  listo: boolean;
  onError: () => void;
}) {
  const calidad: QualityLevel = useMemo(() => {
    // `?calidad=` fija el nivel, como en el visor (lo usa `scripts/portada.mjs` para los cuadros).
    const pedida = new URLSearchParams(window.location.search).get("calidad");
    if (isQualityLevel(pedida)) return pedida;
    const nivel = qualityForGpu(readGpuRenderer()).level;
    const chica = window.innerWidth < 760;
    // La portada nunca pide más que media en celular (§11.6); en escritorio, lo que dé la GPU.
    return chica && (nivel === "alta" || nivel === "ultra") ? "media" : nivel;
  }, []);

  const clock: ViewerClock = useMemo(
    () =>
      createClock(
        createTimeline(resultado.t_inicio, resultado.t_fin, resultado.dt, {
          t: tiempoEscena(0),
          playing: false,
        }),
      ),
    [resultado],
  );

  // El tiempo de la escena sigue al scroll (sin reproducir: el scroll es el tiempo).
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = tiempoEscena(progreso.current);
      if (Math.abs(clock.get().t - t) > 1e-4) clock.set((s) => ({ ...seek(s, t), playing: false }));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clock, progreso]);

  const guiada: Guiada = useMemo(
    () => ({
      pose: () => poseCamara(progreso.current, window.innerWidth / Math.max(1, window.innerHeight)),
      revelado: () => revelado(progreso.current),
    }),
    [progreso],
  );

  return (
    <>
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${listo ? "opacity-100" : "opacity-0"}`}
      >
        <SceneViewer
          spec={spec}
          resultado={resultado}
          clock={clock}
          camera="cinematica"
          quality={calidad}
          ambiente={AMBIENTE}
          guiada={guiada}
          hipotesis={hipotesis}
          onError={onError}
          className="h-full w-full"
        />
      </div>
      {enImpacta && listo ? (
        <div className="pointer-events-none absolute inset-0 pt-20 pr-[max(3rem,4vw)]">
          <div className="relative h-full w-full">
            <Lecturas clock={clock} resultado={resultado} lado="derecha" />
          </div>
        </div>
      ) : null}
    </>
  );
}
