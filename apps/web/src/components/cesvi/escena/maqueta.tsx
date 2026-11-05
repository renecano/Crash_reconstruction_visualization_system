"use client";
/**
 * La maqueta del caso (rediseño «Laboratorio», prompt §7): la escena vista desde arriba que genera
 * el caso, sin videos ni coches decorativos.
 *
 * - **La vía:** las calles del mapa real a su ancho (o la plantilla de la escena), con orillas,
 *   camellón y carriles.
 * - **Los vehículos:** con las medidas de su ficha, como piezas de maqueta con sombra, en el
 *   instante del impacto, con su zona de contacto teñida.
 * - **La estela:** sus poses reales cada 0.4 s antes del impacto, más visibles al acercarse.
 * - **La trayectoria:** con un degradado por su velocidad real.
 * - **Las posiciones finales:** punteadas.
 * - **Etiquetas** con líneas guía.
 *
 * Coordenadas: las del solver en metros. El SVG usa metros como unidad, con Y hacia abajo.
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { sceneLayout } from "@croquis/croquis-2d";
import { useMemo } from "react";
import { siluetaClase } from "@/lib/colocar";
import {
  encuadre,
  estela,
  kmhEn,
  poseEn,
  type Pose,
  type ResultadoMaqueta,
  tImpacto,
  tramosPorVelocidad,
  type VehiculoResultado,
} from "@/lib/maqueta";

/** La zona de contacto en la caja de 1 × 1 de la silueta (frente arriba), del lado del daño. */
function zonaDeContacto(
  v: VehiculoResultado,
): { x: number; y: number; w: number; h: number } | null {
  const lado = v.dano?.cdc?.lado;
  if (!v.dano || !lado) return null;
  const { largo_m: L, ancho_m: A } = v.dimensiones;
  if (lado === "F" || lado === "B") {
    const w = Math.min(1, v.dano.ancho_m / A);
    const cx = Math.max(-0.5 + w / 2, Math.min(0.5 - w / 2, -v.dano.centro_m / A));
    return { x: cx - w / 2, y: lado === "F" ? -0.5 : 0.32, w, h: 0.18 };
  }
  const h = Math.min(1, v.dano.ancho_m / L);
  const cy = Math.max(-0.5 + h / 2, Math.min(0.5 - h / 2, -v.dano.centro_m / L));
  return { x: lado === "L" ? -0.5 : 0.3, y: cy - h / 2, w: 0.2, h };
}

export function EscenaMaqueta({
  spec,
  resultado,
  nombres = {},
}: {
  spec: EscenaSpec;
  resultado: ResultadoMaqueta;
  /** El nombre de cada vehículo para su etiqueta («V1 · VW Jetta»), por id del resultado. */
  nombres?: Record<string, string>;
}) {
  const layout = useMemo(() => sceneLayout(spec), [spec]);
  const ti = tImpacto(resultado);
  const [x0, y0, x1, y1] = encuadre(resultado);
  const W = x1 - x0;
  const H = y1 - y0;
  const px = (x: number) => x - x0;
  const py = (y: number) => y1 - y;
  /** La silueta de un vehículo en una pose: unidad → metros, girada a su rumbo. */
  const colocar = (p: Pose, v: VehiculoResultado) =>
    `translate(${px(p.x)} ${py(p.y)}) rotate(${90 - (p.rumbo * 180) / Math.PI}) scale(${v.dimensiones.ancho_m} ${v.dimensiones.largo_m})`;
  const impacto = resultado.punto_impacto ?? null;
  const fuente = Math.max(1, Math.min(3, Math.max(W, H) / 40));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      overflow="visible"
      className="h-full w-full"
      role="img"
      aria-label="Escena reconstruida vista desde arriba: la vía, la trayectoria de cada vehículo con su velocidad, sus posiciones cada 0.4 s antes del impacto, el impacto y las posiciones finales."
      data-testid="maqueta"
    >
      <defs>
        <radialGradient id="mq-luz" cx="0.3" cy="0.4" r="0.85">
          <stop offset="0" stopColor="var(--escena-luz)" />
          <stop offset="1" stopColor="var(--escena-sombra)" />
        </radialGradient>
        <filter id="mq-sombra" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx="0.5"
            dy="0.7"
            stdDeviation="0.5"
            floodColor="#000"
            floodOpacity="0.28"
          />
        </filter>
        <filter id="mq-losa" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="0.4" stdDeviation="0.7" floodColor="#000" floodOpacity="0.1" />
        </filter>
      </defs>
      {/* El fondo sigue más allá del encuadre: la escena va a sangre en cualquier proporción. */}
      <rect x={-W * 3} y={-H * 3} width={W * 7} height={H * 7} fill="url(#mq-luz)" />

      {/* La vía: calles del mapa a su ancho; si no hay mapa, la plantilla de la escena. */}
      <g filter="url(#mq-losa)">
        {layout.mapa
          ? layout.mapa.vias.map((v) => {
              const puntos = v.puntos.map((p) => `${px(p.x)},${py(p.y)}`).join(" ");
              return (
                <g key={v.id}>
                  <polyline
                    points={puntos}
                    fill="none"
                    stroke="var(--escena-orilla)"
                    strokeWidth={v.ancho + 0.35}
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={puntos}
                    fill="none"
                    stroke="var(--escena-losa)"
                    strokeWidth={v.ancho}
                    strokeLinejoin="round"
                  />
                  {(v.carriles ?? 1) > 1 ? (
                    <polyline
                      points={puntos}
                      fill="none"
                      stroke="var(--escena-carril)"
                      strokeWidth={0.15}
                      strokeDasharray="3 3.5"
                    />
                  ) : null}
                </g>
              );
            })
          : null}
      </g>

      {resultado.vehiculos.map((v) => {
        const tr = v.trayectoria;
        const pi = poseEn(tr, ti);
        const fin = v.pose_final;
        const zona = zonaDeContacto(v);
        return (
          <g key={v.id} data-testid={`maqueta-${v.rol}`}>
            {/* La trayectoria hasta el impacto, con su velocidad real como degradado. */}
            {tramosPorVelocidad(tr, ti).map((s, k) => (
              <line
                key={k}
                x1={px(s.x1)}
                y1={py(s.y1)}
                x2={px(s.x2)}
                y2={py(s.y2)}
                stroke={`color-mix(in srgb, var(--senal) ${Math.round(s.f * 100)}%, var(--velocidad-inicio))`}
                strokeWidth={0.35}
                strokeLinecap="round"
              />
            ))}
            {/* La estela: sus poses cada 0.4 s antes del impacto. */}
            {estela(tr, resultado.t_inicio, ti).map((e) => (
              <path
                key={e.t}
                d={siluetaClase(v.clase)}
                transform={colocar(e.pose, v)}
                fill="var(--escena-vehiculo)"
                fillOpacity={e.opacidad}
                stroke="var(--texto-3)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                opacity={e.opacidad}
              >
                <title>{`${nombres[v.id] ?? v.rol} a t = ${e.t.toFixed(1)} s`}</title>
              </path>
            ))}
            {/* La posición final, punteada, con la línea desde el impacto. */}
            {fin ? (
              <>
                <line
                  x1={px(pi.x)}
                  y1={py(pi.y)}
                  x2={px(fin.x)}
                  y2={py(fin.y)}
                  stroke="var(--texto-3)"
                  strokeWidth={0.18}
                  strokeDasharray="0.4 0.6"
                />
                <path
                  d={siluetaClase(v.clase)}
                  transform={colocar(
                    { x: fin.x, y: fin.y, rumbo: (fin.rumbo_deg * Math.PI) / 180 },
                    v,
                  )}
                  fill="none"
                  stroke="var(--texto-2)"
                  strokeWidth={1.4}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                  data-testid={`maqueta-final-${v.rol}`}
                />
              </>
            ) : null}
            {/* La pieza en el impacto, con sombra y su zona de contacto teñida. */}
            <g transform={colocar(pi, v)} filter="url(#mq-sombra)">
              <path
                d={siluetaClase(v.clase)}
                fill="var(--escena-vehiculo)"
                stroke="var(--texto-3)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {zona ? (
                <rect
                  x={zona.x}
                  y={zona.y}
                  width={zona.w}
                  height={zona.h}
                  fill="var(--senal)"
                  fillOpacity={0.45}
                  data-testid={`maqueta-dano-${v.rol}`}
                />
              ) : null}
            </g>
            {/* La etiqueta con su línea guía. */}
            <line
              x1={px(pi.x)}
              y1={py(pi.y)}
              x2={px(pi.x) + 3.2}
              y2={py(pi.y) - 3.2}
              stroke="var(--texto-3)"
              strokeWidth={0.08}
            />
            <text
              x={px(pi.x) + 3.4}
              y={py(pi.y) - 3.4}
              fontSize={fuente}
              fill="var(--texto)"
              fontFamily="var(--fuente-mono)"
            >
              {`${nombres[v.id] ?? v.rol}${v.v_impacto_kmh !== undefined ? ` · ${v.v_impacto_kmh.toFixed(1)} km/h al impacto` : ""}`}
            </text>
            <title>{`${nombres[v.id] ?? v.rol}: ${kmhEn(tr, 0).toFixed(1)} km/h al inicio`}</title>
          </g>
        );
      })}

      {impacto ? (
        <g data-testid="maqueta-impacto">
          <circle
            cx={px(impacto.x)}
            cy={py(impacto.y)}
            r={1.4}
            fill="none"
            stroke="var(--senal)"
            strokeWidth={0.15}
          />
          <circle cx={px(impacto.x)} cy={py(impacto.y)} r={0.45} fill="var(--senal)" />
        </g>
      ) : null}
    </svg>
  );
}
