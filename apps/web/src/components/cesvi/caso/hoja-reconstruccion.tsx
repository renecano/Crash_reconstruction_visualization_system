"use client";
/**
 * La cifra de la reconstrucción (rediseño «Laboratorio», prompt §8, «el pico»): la velocidad al
 * impacto del vehículo protagonista, el histograma de las simulaciones reales (una barra por km/h),
 * los percentiles con lo que significan y lo que fija el resultado. Toda cifra lleva su método.
 */
import { evidenciaEnPalabras, type Reconstruccion } from "@croquis/cesvi";
import type { ReactNode } from "react";
import {
  frasePercentil,
  histograma,
  marcasDelEje,
  protagonista,
  posEnHistograma,
  rangoDeVelocidad,
  sinDispersion,
  textoBarra,
} from "@/lib/reconstruccion-lab";
import { METODO } from "@/lib/textos-caso";
import { Crece, Cuenta } from "../movimiento";

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
  const mejor = v?.previa?.mejor;
  const barras = histograma(i?.valores ?? [], i?.p10, i?.p90, mejor);
  const posMejor = mejor === undefined ? null : posEnHistograma(barras, mejor);
  const marcas = marcasDelEje(barras);
  const tope = Math.max(1, ...barras.map((b) => b.n));
  const muestras = i?.valores?.length ?? 0;
  const otras = r.velocidades.filter((x) => x.vehiculo !== v?.vehiculo);
  const n = r.evidencia.length;
  const quieta = v ? sinDispersion(v) : false;
  const rango = v ? rangoDeVelocidad(v) : null;
  const ini = barras[0]?.desde ?? 0;
  const anchoEje = barras.length ? barras.length : 1;
  return (
    <section className="flex flex-col gap-3" data-testid="cifra-reconstruccion">
      <div className="flex items-center justify-end gap-3">
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
        Velocidad antes del impacto
      </h2>
      {v && mejor !== undefined ? (
        <>
          <p className="flex items-end gap-3">
            <Cuenta
              valor={mejor}
              decimales={2}
              className="cifra-protagonista text-[clamp(5rem,10.6vw,9.5rem)]"
              testid="cifra-reconstruida"
            />
            <span className="flex flex-col pb-2">
              <span className="text-[1.4rem]">km/h</span>
              <span className="t-nota" data-testid="cifra-de-quien">
                {nombres[v.vehiculo] ?? v.vehiculo}
              </span>
              {rango ? (
                <span
                  className="font-mono text-[0.75rem] whitespace-nowrap text-texto-2"
                  data-testid="cifra-rango"
                >
                  {rango.lineal ? "rango lineal" : "rango"} {rango.p10.toFixed(2)}–
                  {rango.p90.toFixed(2)}
                </span>
              ) : null}
            </span>
          </p>
          <p className="t-nota" data-testid="metodo-cifra">
            {METODO.reconstruccion} · mejor ajuste
          </p>
          {quieta ? (
            <p className="t-nota" data-testid="sin-dispersion">
              Las {muestras} simulaciones dan la misma velocidad: el costo tiene un quiebre en esta
              solución y no dicen cuánto podría variar.
              {rango?.lineal
                ? " El rango de arriba es la aproximación lineal del solver."
                : " No hay un rango que dar."}
            </p>
          ) : null}
          {/* W4b: la reparto de las simulaciones no va en un dictamen de CESVI; se pliega. */}
          <details className="group" data-testid="detalle-cifra">
            <summary
              className="t-nota cursor-pointer py-1 font-medium text-texto"
              data-testid="ver-detalle-cifra"
            >
              Cómo se reparten las simulaciones
            </summary>
            <div className="flex flex-col gap-3 pt-2">
              {quieta ? null : barras.length ? (
                <div className="flex flex-col gap-1" data-testid="histograma">
                  <span className="t-nota flex items-center gap-1.5">
                    <span>Las {muestras} simulaciones, al contacto ·</span>
                    <span className="inline-block h-3 w-0.5 bg-senal" aria-hidden="true" />
                    <span>mejor ajuste</span>
                  </span>
                  <div className="relative h-16">
                    <div
                      className="flex h-full items-end gap-px"
                      role="list"
                      aria-label="Histograma"
                    >
                      {barras.map((b, k) => (
                        <button
                          key={b.desde}
                          type="button"
                          role="listitem"
                          className="h-full min-w-0 flex-1 cursor-default bg-transparent p-0"
                          aria-label={textoBarra(b)}
                          data-tip={textoBarra(b)}
                          data-en-rango={b.enRango ? "si" : "no"}
                        >
                          <Crece
                            i={k}
                            className={`block w-full ${b.enRango ? "bg-texto" : "bg-linea"}`}
                            style={{
                              height: `${(b.n / tope) * 100}%`,
                              marginTop: `${(1 - b.n / tope) * 4}rem`,
                            }}
                          />
                        </button>
                      ))}
                    </div>
                    {posMejor !== null ? (
                      <span
                        className="absolute inset-y-0 z-10 flex w-2.5 -translate-x-1/2 justify-center"
                        style={{ left: `${posMejor}%` }}
                        tabIndex={0}
                        data-tip={`Mejor ajuste: ${mejor!.toFixed(2)} km/h`}
                        data-testid="marca-mejor-ajuste"
                      >
                        <span className="h-full w-0.5 bg-senal" />
                      </span>
                    ) : null}
                  </div>
                  <div className="relative h-4 border-t border-linea font-mono text-[0.6875rem] text-texto-3">
                    {marcas.map((m) => (
                      <span
                        key={m}
                        className="absolute top-0.5 -translate-x-1/2"
                        style={{ left: `${((m - ini) / anchoEje) * 100}%` }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div
                className={quieta ? "hidden" : "grid grid-cols-3 gap-2"}
                data-testid="percentiles"
              >
                {(["p10", "p50", "p90"] as const).map((p) =>
                  i?.[p] !== undefined ? (
                    <button
                      key={p}
                      type="button"
                      className="boton-secundario boton-compacto font-mono"
                      data-tip={frasePercentil(p, i[p])}
                      data-testid={`percentil-${p}`}
                    >
                      {p} · {i[p].toFixed(2)}
                    </button>
                  ) : null,
                )}
              </div>
              {quieta ? null : (
                <p className="t-nota" data-testid="explica-cifra">
                  Pasa el puntero por un percentil para ver qué significa.
                </p>
              )}
              {i?.p50 !== undefined && !quieta ? (
                <p className="flex items-baseline justify-between gap-3">
                  <span className="t-nota">Mediana de las simulaciones</span>
                  <span className="font-mono text-[0.875rem]" data-testid="fila-mediana">
                    {i.p50.toFixed(2)} km/h
                  </span>
                </p>
              ) : null}
              <p className="t-nota">
                Solver resuelto · {mensajes} {mensajes === 1 ? "mensaje" : "mensajes"}
              </p>
            </div>
          </details>
        </>
      ) : (
        <p className="t-cuerpo" data-testid="sin-cifra">
          La evidencia no fija la velocidad de ningún vehículo. Agrega posiciones finales o medidas
          de deformación.
        </p>
      )}
      <dl className="flex flex-col divide-y divide-[var(--linea-suave)] border-y border-linea-suave">
        {otras.map((o) => (
          <div key={o.vehiculo} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="t-nota">{nombres[o.vehiculo] ?? o.vehiculo}</dt>
            <dd className="font-mono text-[0.875rem]">
              {o.previa ? `${o.previa.mejor.toFixed(2)} km/h` : "la evidencia no la fija"}
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
