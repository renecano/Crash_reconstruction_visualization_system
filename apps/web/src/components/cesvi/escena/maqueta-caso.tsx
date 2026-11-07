"use client";
/**
 * La maqueta de un caso reconstruido: la escena con las velocidades reconstruidas (la misma que el
 * 3D), calculada en el worker para no bloquear la página, y con las calles del mapa si ya llegaron.
 */
import { especReconstruida, type Reconstruccion } from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import type { EscenaSpec } from "@croquis/scene-schema";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { conCallesDelMapa } from "@/lib/calles-del-mapa";
import { METODO } from "@/lib/textos-caso";
import { kmhAntesDe, kmhEn, tImpacto, type ResultadoMaqueta } from "@/lib/maqueta";
import { reconstruirEnNavegador } from "@/lib/reconstruct-client";
import { EscenaMaqueta } from "./maqueta";

export function MaquetaCaso({
  r,
  calles,
  nombres,
  detalles = {},
  anchoVia = null,
  compacta = false,
  tips = {},
  tipDelImpacto = null,
}: {
  tips?: Record<string, string>;
  tipDelImpacto?: string | null;
  /** Solo el croquis, sin línea de tiempo ni leyenda («Lado a lado» de Contra CESVI). */
  compacta?: boolean;
  /** El ancho de la vía si el caso lo trae medido, con su origen. */
  anchoVia?: { m: number; de: string } | null;
  r: Reconstruccion;
  calles: OverpassResponse | null;
  nombres: Record<string, string>;
  /** La segunda línea de cada etiqueta (su daño). */
  detalles?: Record<string, string>;
}) {
  const spec = useMemo(() => {
    let s = especReconstruida(r);
    if (r.origen && calles) s = conCallesDelMapa(s, r.origen, calles);
    return s as unknown as EscenaSpec;
  }, [r, calles]);
  const [listo, setListo] = useState<{ spec: EscenaSpec; res: ResultadoMaqueta } | null>(null);
  useEffect(() => {
    let vivo = true;
    void reconstruirEnNavegador(spec)
      .then((res) => {
        if (vivo) setListo({ spec, res: res as unknown as ResultadoMaqueta });
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [spec]);
  if (!listo || listo.spec !== spec)
    return (
      <p
        className="t-nota grid h-full place-items-center text-texto-3"
        data-testid="maqueta-calculando"
      >
        Calculando la maqueta…
      </p>
    );
  const conCalles = Boolean((spec as { lugar?: { red_vial?: unknown } }).lugar?.red_vial);
  // El que llega más rápido: su velocidad, de la llegada al impacto, en la propia simulación.
  const ti = tImpacto(listo.res);
  const veloz = [...listo.res.vehiculos].sort(
    (a, b) => kmhAntesDe(b.trayectoria, ti) - kmhAntesDe(a.trayectoria, ti),
  )[0];
  if (compacta) return <EscenaMaqueta spec={spec} resultado={listo.res} sinEtiquetas />;
  return (
    <div className="relative h-full w-full">
      <ConLineaDeTiempo resultado={listo.res}>
        {(t) => (
          <EscenaMaqueta
            spec={spec}
            resultado={listo.res}
            nombres={nombres}
            detalles={detalles}
            anchoVia={anchoVia}
            t={t}
            tips={tips}
            tipDelImpacto={tipDelImpacto}
          />
        )}
      </ConLineaDeTiempo>
      {/* Cada cifra con su método (prompt §0): la de la maqueta no es el p50 de la tabla. */}
      <div
        className="vidrio absolute bottom-[6.25rem] left-4 flex max-w-[27rem] flex-col gap-0.5 rounded-control px-3 py-2 text-[0.75rem] leading-snug text-texto-2"
        data-testid="maqueta-leyenda"
      >
        {veloz ? (
          <span className="font-mono text-texto" data-testid="maqueta-velocidad">
            velocidad de {nombres[veloz.id] ?? veloz.rol} · {kmhEn(veloz.trayectoria, 0).toFixed(2)}{" "}
            → {kmhAntesDe(veloz.trayectoria, ti).toFixed(2)} km/h
          </span>
        ) : null}
        <span>
          {METODO.reconstruccion}: la simulación con las velocidades ajustadas; puede diferir del
          p50 de las simulaciones con incertidumbre.
        </span>
        <span className="text-texto-3">
          Más naranja, más rápido · siluetas cada 0.4 s · reposo punteado.
        </span>
      </div>
      {conCalles ? null : (
        // Sin las calles del mapa no se dibuja una vía inventada: solo lo que calculó el solver.
        <p
          className="vidrio t-nota absolute top-20 left-4 rounded-control px-3 py-1.5"
          data-testid="maqueta-sin-calles"
        >
          Sin las calles del mapa: la maqueta muestra las trayectorias, el impacto y los reposos.
        </p>
      )}
    </div>
  );
}

/**
 * La línea de tiempo de la maqueta (Laboratorio §8): de la llegada al reposo final, con el impacto
 * marcado. Nada se mueve solo: corre al pulsar reproducir, a 1× o a ¼×.
 */
function ConLineaDeTiempo({
  resultado,
  children,
}: {
  resultado: ResultadoMaqueta;
  children: (t: number) => ReactNode;
}) {
  const ti = tImpacto(resultado);
  const { t_inicio: ini, t_fin: fin } = resultado;
  const [t, setT] = useState(ti);
  const [corre, setCorre] = useState(false);
  const [velocidad, setVelocidad] = useState<1 | 0.25>(1);
  const ultimo = useRef(0);
  const actual = useRef(ti);
  useEffect(() => {
    actual.current = t;
  }, [t]);
  useEffect(() => {
    if (!corre) return;
    let id = 0;
    ultimo.current = performance.now();
    const paso = (ahora: number) => {
      const dt = ((ahora - ultimo.current) / 1000) * velocidad;
      ultimo.current = ahora;
      const n = Math.min(actual.current + dt, fin);
      actual.current = n;
      setT(n);
      if (n >= fin) setCorre(false);
      else id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [corre, velocidad, fin]);
  const fraccion = (x: number) => (fin > ini ? ((x - ini) / (fin - ini)) * 100 : 0);
  return (
    <>
      {children(t)}
      <div
        className="escena-avance absolute right-4 bottom-4 left-4 z-10 flex items-center gap-4 p-3"
        data-testid="linea-de-tiempo"
      >
        <button
          type="button"
          className="boton-principal grid h-11 w-11 shrink-0 place-items-center rounded-control p-0"
          aria-label={corre ? "Pausar" : "Reproducir"}
          onClick={() => {
            if (!corre && t >= fin) setT(ini);
            setCorre(!corre);
          }}
          data-testid="reproducir-maqueta"
        >
          {corre ? "❚❚" : "▶"}
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            type="range"
            className="w-full accent-[var(--texto)]"
            min={ini}
            max={fin}
            step={0.01}
            value={t}
            aria-label="Instante de la reconstrucción"
            aria-valuetext={`${t.toFixed(2)} segundos`}
            onChange={(e) => {
              setCorre(false);
              setT(Number(e.target.value));
            }}
            data-testid="tiempo-maqueta"
          />
          <span
            className="pointer-events-none absolute top-0 h-3 w-0.5 bg-senal"
            style={{ left: `${fraccion(ti)}%` }}
            aria-hidden="true"
          />
          <div
            className="h-1.5 bg-[repeating-linear-gradient(90deg,var(--linea)_0_1px,transparent_1px_5%)]"
            aria-hidden="true"
          />
          <div className="relative mt-0.5 h-4 font-mono text-[0.6875rem] text-texto-3">
            <span className="absolute left-0">Llegada</span>
            <span className="absolute -translate-x-1/2" style={{ left: `${fraccion(ti)}%` }}>
              Impacto · t {(t - ti).toFixed(2)} s
            </span>
            <span className="absolute right-0">Reposo final</span>
          </div>
        </div>
        <div className="segmentado shrink-0" role="group" aria-label="Velocidad de reproducción">
          {([0.25, 1] as const).map((v) => (
            <button
              key={v}
              type="button"
              className="px-3"
              aria-pressed={velocidad === v}
              onClick={() => setVelocidad(v)}
            >
              {v === 1 ? "1×" : "¼×"}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
