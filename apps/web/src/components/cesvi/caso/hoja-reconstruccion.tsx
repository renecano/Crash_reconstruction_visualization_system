"use client";
/**
 * La cifra de la reconstrucción (rediseño «Laboratorio», prompt §8, «el pico»): la velocidad al
 * impacto del vehículo protagonista, el histograma de las simulaciones reales (una barra por km/h),
 * los percentiles con lo que significan y lo que fija el resultado. Toda cifra lleva su método.
 */
import {
  formato as F,
  evidenciaEnPalabras,
  mejorFueraDelRango,
  type Reconstruccion,
  sinCifraEnTexto,
} from "@croquis/cesvi";
import type { ReactNode } from "react";
import {
  frasePercentil,
  histograma,
  protagonista,
  rangoDeVelocidad,
  sinDispersion,
} from "@/lib/reconstruccion-lab";
import { METODO } from "@/lib/textos-caso";
import { Cuenta } from "../movimiento";
import { NubeSimulaciones } from "./nube-simulaciones";

export function CifraReconstruccion({
  r,
  nombres,
  decisiones,
  onRepetir,
}: {
  r: Reconstruccion;
  /** Cómo se llama cada vehículo en pantalla («B · Tacoma»), por su id. */
  nombres: Record<string, string>;
  /** Lo que Croquis decidió porque el perito no lo sabía («por dónde venía B · Tacoma»). */
  decisiones: readonly string[];
  onRepetir: () => void;
}) {
  const v = protagonista(r);
  const i = v?.impacto ?? null;
  const mejor = v?.previa?.mejor;
  const barras = histograma(i?.valores ?? [], i?.p10, i?.p90, mejor);
  const muestras = i?.valores?.length ?? 0;
  const otras = r.velocidades.filter((x) => x.vehiculo !== v?.vehiculo);
  const n = r.evidencia.length;
  const quieta = v ? sinDispersion(v) : false;
  const rango = v ? rangoDeVelocidad(v) : null;
  // Si el rango es el lineal, va centrado en el mejor ajuste y no lo deja fuera.
  const fuera = rango && !rango.lineal ? mejorFueraDelRango(v?.previa) : null;
  // Las posiciones contradicen lo narrado (René, 2026-11-22): junto a la cifra, de cada vehículo que
  // la contradiga (no solo del que encabeza: en la curva es la CR-V), con su nombre en vez de «V2».
  const contras = r.limites.flatMap((l) => {
    const m = /^(V\d+): (la narración dice .*las posiciones dan .*)$/.exec(l);
    return m ? [`${nombres[m[1]!] ?? m[1]}: ${m[2]}`] : [];
  });
  // Una cifra muy por arriba del límite de su vía (René, 2026-11-26): junto a la cifra.
  const sobreElLimite = r.limites.flatMap((l) => {
    const m = /^(V\d+): (la cifra .* arriba del límite de esta vía .*)$/.exec(l);
    return m ? [`${nombres[m[1]!] ?? m[1]}: ${m[2]}`] : [];
  });
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
              decimales={F.DECIMALES.reconstruccion}
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
                  {rango.lineal ? "rango lineal" : "rango"}{" "}
                  {F.rangoKmh(rango.p10, rango.p90, "reconstruccion")}
                </span>
              ) : null}
            </span>
          </p>
          <p className="t-nota" data-testid="metodo-cifra">
            {METODO.reconstruccion} · mejor ajuste
          </p>
          {fuera ? (
            <p className="t-nota text-senal-texto" role="note" data-testid="mejor-fuera-del-rango">
              El mejor ajuste queda {fuera === "arriba" ? "por arriba" : "por debajo"} del rango: el
              rango es donde cae el 80 % de las simulaciones, y aquí la solución depende mucho de la
              evidencia y de los supuestos. Revisa los límites antes de citar la cifra.
            </p>
          ) : null}
          {contras.map((c) => (
            <p
              key={c}
              className="t-nota text-senal-texto"
              role="note"
              data-testid="contra-narracion"
            >
              {c}
            </p>
          ))}
          {sobreElLimite.map((c) => (
            <p
              key={c}
              className="t-nota text-senal-texto"
              role="note"
              data-testid="sobre-el-limite"
            >
              {c}
            </p>
          ))}
          {quieta ? (
            <p className="t-nota" data-testid="sin-dispersion">
              Las {muestras} simulaciones dan la misma velocidad: el ajuste a la evidencia tiene un
              quiebre en esta solución y no dicen cuánto podría variar.
              {rango?.lineal
                ? " El rango de arriba es una aproximación del cálculo."
                : " No hay un rango que dar."}
            </p>
          ) : null}
          {/* A6 (ronda 2): la nube de puntos va a la vista; cada punto es una simulación real. */}
          {quieta || !barras.length ? null : (
            <NubeSimulaciones
              barras={barras}
              muestras={muestras}
              mejor={mejor}
              p10={i?.p10}
              p90={i?.p90}
            />
          )}
          {/* Los percentiles y la mediana siguen plegados (W4b). */}
          <details className="group" data-testid="detalle-cifra">
            <summary
              className="t-nota cursor-pointer py-1 font-medium text-texto"
              data-testid="ver-detalle-cifra"
            >
              Los percentiles de las simulaciones
            </summary>
            <div className="flex flex-col gap-3 pt-2">
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
                      {p} · {F.kmh(i[p], "reconstruccion")}
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
                    {F.kmhConUnidad(i.p50, "reconstruccion")}
                  </span>
                </p>
              ) : null}
            </div>
          </details>
        </>
      ) : r.noCuadra ? (
        // El candado físico (René, 2026-11-24): la cifra no se presenta; se dice qué no cuadra y qué
        // revisar. El 3D deja a los vehículos donde quedaron, sin animar el choque.
        <div className="flex flex-col gap-2" data-testid="no-cuadra">
          <p className="t-cuerpo font-semibold">
            La reconstrucción no cuadra: Croquis no presenta una velocidad.
          </p>
          <ul className="t-cuerpo flex list-disc flex-col gap-1 pl-5">
            {r.noCuadra.motivos.map((m) => (
              <li key={m}>{conNombres(m, nombres)}</li>
            ))}
          </ul>
          <p className="t-cuerpo">Revisa {r.noCuadra.revisar.join("; ")}.</p>
          <p className="t-nota">
            El 3D muestra a cada vehículo donde quedó, sin animar el choque, hasta que cuadre.
          </p>
        </div>
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
              {o.previa
                ? F.kmhConUnidad(o.previa.mejor, "reconstruccion")
                : sinCifraEnTexto(r, o.vehiculo)}
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
 * Lo demás del acto (la tabla de velocidades, la evidencia, los límites y la declaración): plegado cuando ya hay una cifra; sin ella, a la vista.
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
        Ver el detalle: velocidades, evidencia y límites
      </summary>
      <div className="flex flex-col gap-5 pt-3">{children}</div>
    </details>
  );
}

/** «V2 y V3 quedan encimados…» con el nombre que ve el perito («B · Aveo»). */
function conNombres(texto: string, nombres: Record<string, string>): string {
  return texto.replace(/\bV\d+\b/g, (id) => nombres[id] ?? id);
}
