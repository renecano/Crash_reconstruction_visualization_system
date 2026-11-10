"use client";
/**
 * C3 y O4 (W5; PLAN-CESVI §3.4): lo que el terreno hizo en la reconstrucción. El perfil de
 * elevación del camino de cada vehículo (la altura bajo él a lo largo de lo que recorrió), los
 * cruces de tope con su velocidad y los dos supuestos del tope con su rango. Sale de la misma
 * simulación que la maqueta y el 3D: la escena con las velocidades reconstruidas.
 *
 * Una gráfica por vehículo (misma escala de distancia, sin doble eje): la línea en tinta, el
 * impacto y los topes marcados y rotulados, y la lectura bajo el puntero.
 */
import {
  especReconstruida,
  LIMITE_RELIEVE,
  perfilesDeElevacion,
  terrenoReconstruido,
  type PerfilDeElevacion,
  type Reconstruccion,
  type TerrenoReconstruido,
} from "@croquis/cesvi";
import type { EscenaSpec } from "@croquis/scene-schema";
import { useEffect, useState } from "react";
import { reconstruirEnNavegador } from "@/lib/reconstruct-client";
import { COLOR_TOPE } from "@/lib/terreno-colores";

// La gráfica va en una columna angosta: con este ancho, sus letras salen a tamaño de lectura.
const W = 420;
const H = 150;
const M = { izq: 52, der: 12, arriba: 20, abajo: 24 } as const;
/** A menos de esto (en unidades de la gráfica) de «Impacto», el rótulo de un extremo no se pinta. */
const CERCA = 56;

/** La escala vertical: de la altura mínima a la máxima, con al menos 20 cm para que un tope no llene todo. */
export function escalaDePerfil(p: PerfilDeElevacion): {
  z0: number;
  z1: number;
  sMax: number;
  /** Cuántas veces más grande se ve un metro de altura que un metro de camino. */
  exageracion: number;
} {
  let lo = Math.min(...p.z);
  let hi = Math.max(...p.z);
  if (hi - lo < 0.2) {
    const c = (hi + lo) / 2;
    lo = c - 0.1;
    hi = c + 0.1;
  }
  const sMax = Math.max(p.s[p.s.length - 1]!, 1);
  const porMetroZ = (H - M.arriba - M.abajo) / (hi - lo);
  const porMetroS = (W - M.izq - M.der) / sMax;
  return { z0: lo, z1: hi, sMax, exageracion: porMetroZ / porMetroS };
}

function Perfil({ p, nombre }: { p: PerfilDeElevacion; nombre: string }) {
  const [sobre, setSobre] = useState<number | null>(null);
  const { z0, z1, sMax, exageracion } = escalaDePerfil(p);
  const x = (s: number) => M.izq + ((W - M.izq - M.der) * s) / sMax;
  const y = (z: number) => H - M.abajo - ((H - M.arriba - M.abajo) * (z - z0)) / (z1 - z0);
  // Una muestra por pixel alcanza.
  const paso = Math.max(1, Math.floor(p.s.length / 500));
  const linea = p.s
    .flatMap((s, i) =>
      i % paso === 0 || i === p.s.length - 1 ? [`${x(s).toFixed(1)},${y(p.z[i]!).toFixed(1)}`] : [],
    )
    .join(" ");
  const cm = (z: number) => `${z >= 0 ? "+" : "−"}${Math.abs(z).toFixed(2)} m`;
  const final = p.z[p.z.length - 1]! - p.z[0]!;
  return (
    <figure className="flex flex-col gap-1" data-testid={`perfil-${p.vehiculo}`}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[0.9375rem] font-semibold">{nombre}</span>
        <span className="t-nota">
          {p.pendientePct !== null
            ? `Antes del impacto: ${p.pendientePct === 0 ? "a nivel" : `${Math.abs(p.pendientePct).toFixed(1)} % de ${p.pendientePct > 0 ? "subida" : "bajada"}`}`
            : "Casi no avanzó antes del impacto"}
          {" · "}altura exagerada ×
          {exageracion >= 10 ? Math.round(exageracion) : exageracion.toFixed(1)}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Perfil de elevación del camino de ${nombre}: recorrió ${sMax.toFixed(1)} m y terminó ${cm(final)} respecto a donde empezó${p.cruces.length ? `; cruzó ${p.cruces.length === 1 ? "un tope" : `${p.cruces.length} topes`}` : ""}.`}
        onPointerMove={(ev) => {
          const caja = ev.currentTarget.getBoundingClientRect();
          const s = (((ev.clientX - caja.left) / caja.width) * W - M.izq) / (W - M.izq - M.der);
          if (s < 0 || s > 1) return setSobre(null);
          let k = 0;
          for (let i = 1; i < p.s.length; i++)
            if (Math.abs(p.s[i]! - s * sMax) < Math.abs(p.s[k]! - s * sMax)) k = i;
          setSobre(k);
        }}
        onPointerLeave={() => setSobre(null)}
      >
        {/* Los ejes, discretos: la altura mínima y máxima, y el camino. */}
        <g stroke="var(--linea)" strokeWidth={1}>
          <line x1={M.izq} y1={y(z1)} x2={W - M.der} y2={y(z1)} strokeDasharray="2 4" />
          <line x1={M.izq} y1={y(z0)} x2={W - M.der} y2={y(z0)} />
        </g>
        <g fill="var(--texto-3)" fontSize={11} fontFamily="var(--fuente-mono, monospace)">
          <text x={M.izq - 6} y={y(z1) + 4} textAnchor="end">
            {cm(z1)}
          </text>
          <text x={M.izq - 6} y={y(z0) + 4} textAnchor="end">
            {cm(z0)}
          </text>
          {x(p.sImpacto) - M.izq > CERCA ? (
            <text x={M.izq} y={H - 6}>
              0 m
            </text>
          ) : null}
          {W - M.der - x(p.sImpacto) > CERCA ? (
            <text x={W - M.der} y={H - 6} textAnchor="end">
              {sMax.toFixed(1)} m
            </text>
          ) : null}
        </g>
        {/* El impacto. */}
        <line
          x1={x(p.sImpacto)}
          y1={M.arriba - 4}
          x2={x(p.sImpacto)}
          y2={H - M.abajo}
          stroke="var(--senal)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <text
          x={x(p.sImpacto)}
          y={H - 6}
          textAnchor={
            x(p.sImpacto) > W - M.der - 28 ? "end" : x(p.sImpacto) < M.izq + 28 ? "start" : "middle"
          }
          fontSize={11}
          fill="var(--texto-2)"
          data-testid="perfil-impacto"
        >
          Impacto
        </text>
        {/* Los topes que cruzó, con la velocidad del cruce. */}
        {p.cruces.map((c, k) => (
          <g key={k} data-testid="perfil-cruce">
            <line
              x1={x(c.s)}
              y1={M.arriba}
              x2={x(c.s)}
              y2={H - M.abajo}
              stroke={COLOR_TOPE}
              strokeWidth={3}
            />
            <text
              x={x(c.s)}
              y={M.arriba - 6}
              textAnchor={x(c.s) > W * 0.8 ? "end" : x(c.s) < W * 0.2 ? "start" : "middle"}
              fontSize={11}
              fill="var(--texto-2)"
            >
              Tope · {c.kmh.toFixed(1)} km/h
            </text>
          </g>
        ))}
        <polyline
          points={linea}
          fill="none"
          stroke="var(--texto)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {sobre !== null ? (
          <g pointerEvents="none">
            <line
              x1={x(p.s[sobre]!)}
              y1={M.arriba}
              x2={x(p.s[sobre]!)}
              y2={H - M.abajo}
              stroke="var(--texto-3)"
              strokeWidth={1}
            />
            <circle
              cx={x(p.s[sobre]!)}
              cy={y(p.z[sobre]!)}
              r={4}
              fill="var(--texto)"
              stroke="var(--superficie)"
              strokeWidth={2}
            />
          </g>
        ) : null}
      </svg>
      <p className="t-nota min-h-5 font-mono" aria-live="off" data-testid="perfil-lectura">
        {sobre !== null
          ? `A ${p.s[sobre]!.toFixed(1)} m de donde empezó: ${cm(p.z[sobre]!)}`
          : `Recorrió ${sMax.toFixed(1)} m; terminó ${cm(final)} respecto a donde empezó.`}
      </p>
    </figure>
  );
}

/** El bloque «Terreno» de la reconstrucción. No se dibuja si el terreno no entró en nada. */
export function TerrenoReconstruccion({
  r,
  nombres,
}: {
  r: Reconstruccion;
  /** Cómo se llama cada vehículo en pantalla («B · Tacoma»), por su id. */
  nombres: Record<string, string>;
}) {
  const declarado = Boolean((r.spec.lugar as { terreno?: unknown } | undefined)?.terreno);
  const [listo, setListo] = useState<{
    r: Reconstruccion;
    perfiles: PerfilDeElevacion[];
    terreno: TerrenoReconstruido | null;
  } | null>(null);
  useEffect(() => {
    if (!declarado) return undefined;
    let vivo = true;
    // La escena con las velocidades reconstruidas, sobre el mismo relieve: lo que se ve en el 3D.
    void reconstruirEnNavegador(especReconstruida(r) as unknown as EscenaSpec, r.relieve)
      .then((res) => {
        if (!vivo) return;
        const json = res as unknown as Record<string, unknown>;
        setListo({
          r,
          perfiles: perfilesDeElevacion(r.ids, json),
          terreno: terrenoReconstruido(r.ids, json),
        });
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [r, declarado]);
  if (!declarado) return null;
  const actual = listo?.r === r ? listo : null;
  const cruces = actual?.terreno?.cruces ?? [];
  const nombre = (v: string) => nombres[v] ?? v;
  return (
    <section className="flex flex-col gap-3" data-testid="terreno-reconstruccion">
      <h3 className="t-subtitulo">Terreno</h3>
      {r.terreno?.relieveFalta ? (
        <p className="t-nota" role="status" data-testid="relieve-falta">
          No se pudo obtener el relieve real del lugar: esta reconstrucción va en plano.
        </p>
      ) : null}
      {!actual ? (
        <p className="t-nota" data-testid="terreno-calculando">
          Calculando el perfil del terreno…
        </p>
      ) : (
        <>
          {actual.perfiles.length ? (
            <div className="flex flex-col gap-4" data-testid="perfiles-elevacion">
              <p className="t-nota">
                La altura del terreno bajo cada vehículo, a lo largo de lo que recorrió.
              </p>
              {actual.perfiles.map((p) => (
                <Perfil key={p.vehiculo} p={p} nombre={nombre(p.vehiculo)} />
              ))}
            </div>
          ) : (
            <p className="t-nota" data-testid="terreno-sin-altura">
              El terreno marcado no cambia la altura: solo la fricción de sus zonas.
            </p>
          )}
          {cruces.length ? (
            <ul className="flex flex-col gap-1" data-testid="cruces-tope">
              {cruces.map((c, k) => (
                <li key={k} className="t-cuerpo">
                  {nombre(c.vehiculo)} cruzó un tope a{" "}
                  <span className="font-mono">{c.kmh.toFixed(1)} km/h</span>,{" "}
                  {Math.abs(c.t).toFixed(2)} s {c.t < 0 ? "antes" : "después"} del impacto.
                </li>
              ))}
            </ul>
          ) : null}
          {actual.terreno?.supuestos.length ? (
            <details className="group" data-testid="supuestos-tope">
              <summary className="t-nota cursor-pointer py-1 font-medium text-texto">
                Qué supone Croquis al cruzar un tope
              </summary>
              <ul className="flex list-disc flex-col gap-1 pt-2 pl-5">
                {actual.terreno.supuestos.map((s) => (
                  <li key={s.clave} className="t-nota">
                    {s.texto}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
      {r.relieve ? (
        <p className="t-nota" data-testid="relieve-fuente">
          Relieve: {r.relieve.fuente}. {LIMITE_RELIEVE}{" "}
          <span className="text-texto-3">{r.relieve.licencia}</span>
        </p>
      ) : null}
    </section>
  );
}
