"use client";
/**
 * La cifra de la reconstrucción (rediseño «Laboratorio», prompt §8, «el pico»): la velocidad al
 * impacto del vehículo protagonista, el histograma de las simulaciones reales (una barra por km/h),
 * los percentiles con lo que significan y lo que fija el resultado. Toda cifra lleva su método.
 */
import { evidenciaEnPalabras, type Reconstruccion } from "@croquis/cesvi";
import { useState, type ReactNode } from "react";
import {
  frasePercentil,
  histograma,
  marcasDelEje,
  protagonista,
  textoBarra,
} from "@/lib/reconstruccion-lab";
import { METODO } from "@/lib/textos-caso";

export function CifraReconstruccion({
  r,
  nombres,
  mensajes,
  decisiones,
  onRepetir,
}: {
  r: Reconstruccion;
  /** Cómo se llama cada vehículo en pantalla («B · Tacoma»), por su id. */
  nombres: Record<string, string>;
  /** Los mensajes de la bitácora. */
  mensajes: number;
  /** Lo que Croquis decidió porque el perito no lo sabía («por dónde venía B · Tacoma»). */
  decisiones: readonly string[];
  onRepetir: () => void;
}) {
  const v = protagonista(r);
  const i = v?.impacto ?? null;
  const barras = histograma(i?.valores ?? [], i?.p10, i?.p90);
  const marcas = marcasDelEje(barras);
  const tope = Math.max(1, ...barras.map((b) => b.n));
  const muestras = i?.valores?.length ?? 0;
  const [explica, setExplica] = useState<string | null>(null);
  const otras = r.velocidades.filter((x) => x.vehiculo !== v?.vehiculo);
  const n = r.evidencia.length;
  const ini = barras[0]?.desde ?? 0;
  const rango = barras.length ? barras.length : 1;
  return (
    <section className="flex flex-col gap-3" data-testid="cifra-reconstruccion">
      <div className="flex items-center justify-between gap-3">
        <span className="t-nota">
          Solver resuelto · {mensajes} {mensajes === 1 ? "mensaje" : "mensajes"}
        </span>
        <button
          type="button"
          className="boton-secundario boton-compacto min-h-8!"
          onClick={onRepetir}
          data-testid="repetir-reconstruccion"
        >
          Repetir
        </button>
      </div>
      <h2 className="font-[family-name:var(--fuente-titulo)] text-[2.25rem] leading-none font-normal tracking-[-0.03em]">
        Velocidad al impacto
      </h2>
      {v && i?.p50 !== undefined ? (
        <>
          <p className="flex items-end gap-3">
            <span
              className="cifra-protagonista text-[clamp(6rem,12.8vw,11.5rem)]"
              data-testid="cifra-impacto"
            >
              {i.p50.toFixed(1)}
            </span>
            <span className="flex flex-col pb-2">
              <span className="text-[1.4rem]">km/h</span>
              <span className="t-nota" data-testid="cifra-de-quien">
                {nombres[v.vehiculo] ?? v.vehiculo}
              </span>
            </span>
          </p>
          <p className="t-nota" data-testid="metodo-cifra">
            {METODO.reconstruccion} · mediana de las simulaciones
          </p>
          {barras.length ? (
            <div className="flex flex-col gap-1" data-testid="histograma">
              <span className="t-nota">
                Distribución de las {muestras} simulaciones · pasa el puntero
              </span>
              <div className="flex h-16 items-end gap-px" role="list" aria-label="Histograma">
                {barras.map((b) => (
                  <button
                    key={b.desde}
                    type="button"
                    role="listitem"
                    className="h-full min-w-0 flex-1 cursor-default bg-transparent p-0"
                    aria-label={textoBarra(b)}
                    title={textoBarra(b)}
                    onMouseEnter={() => setExplica(textoBarra(b))}
                    onMouseLeave={() => setExplica(null)}
                    onFocus={() => setExplica(textoBarra(b))}
                    onBlur={() => setExplica(null)}
                    data-en-rango={b.enRango ? "si" : "no"}
                  >
                    <span
                      className={`block w-full ${b.enRango ? "bg-texto" : "bg-linea"}`}
                      style={{
                        height: `${(b.n / tope) * 100}%`,
                        marginTop: `${(1 - b.n / tope) * 4}rem`,
                      }}
                    />
                  </button>
                ))}
              </div>
              <div className="relative h-4 border-t border-linea font-mono text-[0.6875rem] text-texto-3">
                {marcas.map((m) => (
                  <span
                    key={m}
                    className="absolute top-0.5 -translate-x-1/2"
                    style={{ left: `${((m - ini) / rango) * 100}%` }}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-2" data-testid="percentiles">
            {(["p10", "p50", "p90"] as const).map((p) =>
              i[p] !== undefined ? (
                <button
                  key={p}
                  type="button"
                  className="boton-secundario boton-compacto font-mono"
                  onMouseEnter={() => setExplica(frasePercentil(p, i[p]!))}
                  onMouseLeave={() => setExplica(null)}
                  onFocus={() => setExplica(frasePercentil(p, i[p]!))}
                  onBlur={() => setExplica(null)}
                  data-testid={`percentil-${p}`}
                >
                  {p} · {i[p]!.toFixed(1)}
                </button>
              ) : null,
            )}
          </div>
          <p className="t-nota min-h-5" role="status" data-testid="explica-cifra">
            {explica ?? "Pasa el puntero por un percentil para ver qué significa."}
          </p>
        </>
      ) : (
        <p className="t-cuerpo" data-testid="sin-cifra">
          La evidencia no fija la velocidad al impacto de ningún vehículo. Agrega posiciones finales
          o medidas de deformación.
        </p>
      )}
      <dl className="flex flex-col divide-y divide-[var(--linea-suave)] border-y border-linea-suave">
        {v?.previa ? (
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="t-nota">{nombres[v.vehiculo] ?? v.vehiculo} venía a</dt>
            <dd className="font-mono text-[0.875rem]">
              {v.previa.mejor.toFixed(1)} km/h
              {v.previa.p10 !== undefined && v.previa.p90 !== undefined
                ? ` · ${v.previa.p10.toFixed(1)}–${v.previa.p90.toFixed(1)}`
                : ""}
            </dd>
          </div>
        ) : null}
        {otras.map((o) => (
          <div key={o.vehiculo} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="t-nota">{nombres[o.vehiculo] ?? o.vehiculo}</dt>
            <dd className="font-mono text-[0.875rem]">
              {o.previa ? `${o.previa.mejor.toFixed(1)} km/h` : "la evidencia no la fija"}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt className="t-nota">Lo fijan</dt>
          <dd
            className="text-right text-[0.875rem]"
            title={r.evidencia.map((x) => evidenciaEnPalabras(x, r.ids)).join(", ")}
            data-testid="lo-fijan"
          >
            {n} {n === 1 ? "evidencia" : "evidencias"}
            {decisiones.length ? (
              <>
                {" · "}
                <span
                  className="underline underline-offset-2"
                  title={`Croquis eligió ${decisiones.join(" y ")}.`}
                  data-testid="decisiones-croquis"
                >
                  {decisiones.length} {decisiones.length === 1 ? "decisión" : "decisiones"} de
                  Croquis
                </span>
              </>
            ) : null}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * Lo demás del acto (la tabla de velocidades, la evidencia, los límites, la bitácora y la
 * declaración): plegado cuando ya hay una cifra; sin ella, a la vista.
 */
export function DetalleReconstruccion({
  plegado,
  children,
}: {
  plegado: boolean;
  children: ReactNode;
}) {
  if (!plegado) return <div className="flex flex-col gap-5">{children}</div>;
  return (
    <details className="group" data-testid="detalle-reconstruccion">
      <summary
        className="t-nota cursor-pointer py-1 font-medium text-texto"
        data-testid="ver-detalle-reconstruccion"
      >
        Ver el detalle: velocidades, evidencia, límites y bitácora
      </summary>
      <div className="flex flex-col gap-5 pt-3">{children}</div>
    </details>
  );
}
