"use client";
/**
 * Los cálculos del dictamen con el método de CESVI (`@croquis/cesvi`), con los datos del reporte
 * como punto de partida. El perito puede cambiar cualquier dato y el umbral de «diferencia
 * significativa»; cada fórmula se muestra con sus valores sustituidos, como en el dictamen.
 */
import {
  compararVelocidades,
  formulaDesplazamiento,
  formulaEbs,
  formulaMcHenry,
  MEDIDAS_PERMITIDAS,
  UMBRAL_INICIAL_PCT,
  type CasoCesvi,
  type ComparacionVelocidades,
  type PasoEnergia,
  type PasoVelocidad,
} from "@croquis/cesvi";
import { useEffect, useId, useMemo, useState } from "react";
import { Formula } from "./formula";

interface Datos {
  L: string;
  A: string;
  B: string;
  C: string[];
  masaKg: string;
  a: string;
  g: string;
  umbral: string;
}

function iniciales(c: CasoCesvi): Datos {
  const d = c.calculos.deformacion_B;
  const z = c.calculos.desplazamiento;
  return {
    L: String(d.L_m.valor),
    A: String(d.A.valor),
    B: String(d.B.valor),
    C: d.C_m.map((x) => x.valor.toFixed(2)),
    masaKg: String(c.vehiculos.B.masa_kg?.valor ?? ""),
    a: String(z.a.valor),
    g: String(z.g_ms2.valor),
    umbral: String(UMBRAL_INICIAL_PCT),
  };
}

const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s.replace(",", ".")));

function Campo({
  etiqueta,
  valor,
  onCambio,
  unidad,
  testid,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  unidad?: string;
  testid?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="t-nota text-texto-2">
        {etiqueta}
        {unidad ? ` (${unidad})` : ""}
      </label>
      <input
        id={id}
        inputMode="decimal"
        className="campo cifras w-28"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        data-testid={testid}
      />
    </div>
  );
}

/** Ejecuta un cálculo y, si los datos no lo permiten, devuelve el mensaje en lugar de romper. */
function intentar<T>(f: () => T): { ok: true; valor: T } | { ok: false; error: string } {
  try {
    return { ok: true, valor: f() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Lo que calculan los cálculos, para la sugerencia, el borrador y el dictamen en PDF. */
export interface ResultadosCalculo {
  mcHenry: PasoEnergia | null;
  ebsDatos: PasoVelocidad | null;
  ebsReporte: PasoVelocidad | null;
  v3: PasoVelocidad | null;
  /** Velocidad de impacto partiendo de la energía del reporte contra la de desplazamiento. */
  comparacion: ComparacionVelocidades | null;
}

/** La separación de los restos para el cálculo 2: la del dictamen o la que mide el perito. */
export interface DistanciaRestos {
  valor: string;
  fuente: "dictamen" | "perito";
}

export function Calculos({
  caso,
  distancia,
  onDistancia,
  onResultados,
}: {
  caso: CasoCesvi;
  distancia: DistanciaRestos;
  onDistancia: (d: DistanciaRestos) => void;
  onResultados?: (r: ResultadosCalculo) => void;
}) {
  const [datos, setDatos] = useState<Datos>(() => iniciales(caso));
  const cambia = (k: keyof Omit<Datos, "C">) => (v: string) => setDatos((d) => ({ ...d, [k]: v }));
  const reporte = caso.calculos.deformacion_B.reporte;
  const masaT = num(datos.masaKg) / 1000;

  const mc = useMemo(
    () =>
      intentar(() =>
        formulaMcHenry(
          { L: num(datos.L), A: num(datos.A), B: num(datos.B), C: datos.C.map(num) },
          "kJ",
        ),
      ),
    [datos.L, datos.A, datos.B, datos.C],
  );
  const ebsDatos = useMemo(
    () =>
      mc.ok
        ? intentar(() =>
            formulaEbs(
              mc.valor.calculo.energia,
              masaT,
              mc.valor.calculo.energia.toFixed(3),
              String(masaT),
            ),
          )
        : mc,
    [mc, masaT],
  );
  const ebsReporte = useMemo(
    () => intentar(() => formulaEbs(reporte.energia.valor, masaT, undefined, String(masaT))),
    [reporte.energia.valor, masaT],
  );
  const v3 = useMemo(
    () => intentar(() => formulaDesplazamiento(num(datos.a), num(datos.g), num(distancia.valor))),
    [datos.a, datos.g, distancia.valor],
  );
  const umbral = num(datos.umbral);

  // Avisa al padre (sugerencia, borrador y PDF) cada vez que cambian los resultados.
  useEffect(() => {
    if (!onResultados) return;
    const vImpacto = ebsReporte.ok ? ebsReporte.valor.calculo.kmh : null;
    onResultados({
      mcHenry: mc.ok ? mc.valor : null,
      ebsDatos: ebsDatos.ok ? ebsDatos.valor : null,
      ebsReporte: ebsReporte.ok ? ebsReporte.valor : null,
      v3: v3.ok ? v3.valor : null,
      comparacion:
        vImpacto !== null && v3.ok && umbral >= 0
          ? compararVelocidades(vImpacto, v3.valor.calculo.kmh, umbral)
          : null,
    });
  }, [onResultados, mc, ebsDatos, ebsReporte, v3, umbral]);

  const comparar = (etiqueta: string, v1: number | null, testid: string) => {
    if (v1 === null || !v3.ok || !(umbral >= 0)) return null;
    const r = compararVelocidades(v1, v3.valor.calculo.kmh, umbral);
    return (
      <li className="t-interfaz" data-testid={testid}>
        {etiqueta}: <span className="cifras">{v1.toFixed(2)}</span> contra{" "}
        <span className="cifras">{v3.valor.calculo.kmh.toFixed(2)} km/h</span>, diferencia de{" "}
        <span className="cifras">
          {r.diferenciaKmh.toFixed(2)} km/h ({r.diferenciaPct.toFixed(2)} %)
        </span>
        :{" "}
        <strong className="font-semibold">
          {r.significativa ? "significativa" : "no significativa"}
        </strong>{" "}
        con el umbral de {r.umbralPct} %.
      </li>
    );
  };

  return (
    <section aria-labelledby="calculos" className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="calculos" className="t-titulo">
          Cálculos con el método de CESVI
        </h2>
        <button
          type="button"
          className="boton-secundario min-h-11 px-4"
          onClick={() => {
            setDatos(iniciales(caso));
            onDistancia({
              valor: String(caso.calculos.desplazamiento.D_m.valor),
              fuente: "dictamen",
            });
          }}
        >
          Volver a los datos del reporte
        </button>
      </div>

      <section aria-labelledby="calculo-1" className="flex flex-col gap-4">
        <h3 id="calculo-1" className="t-subtitulo">
          1. Energía de deformación de la Tacoma (McHenry) y velocidad de impacto
        </h3>
        <div className="flex flex-wrap gap-4">
          <Campo etiqueta="L" unidad="m" valor={datos.L} onCambio={cambia("L")} />
          <Campo etiqueta="A" unidad="kN/m" valor={datos.A} onCambio={cambia("A")} />
          <Campo etiqueta="B" unidad="kN/m²" valor={datos.B} onCambio={cambia("B")} />
          <Campo etiqueta="Masa" unidad="kg" valor={datos.masaKg} onCambio={cambia("masaKg")} />
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="t-nota mb-2 text-texto-2">
            Profundidades de deformación, equiespaciadas (m)
          </legend>
          <div className="flex flex-wrap items-end gap-4">
            {datos.C.map((c, i) => (
              <Campo
                key={i}
                etiqueta={`C${i + 1}`}
                valor={c}
                onCambio={(v) =>
                  setDatos((d) => ({ ...d, C: d.C.map((x, j) => (j === i ? v : x)) }))
                }
                testid={`c${i + 1}`}
              />
            ))}
            <label className="t-nota flex flex-col gap-1 text-texto-2">
              Medidas
              <select
                className="campo w-24"
                value={datos.C.length}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setDatos((d) => ({
                    ...d,
                    C: Array.from({ length: n }, (_, i) => d.C[i] ?? d.C[d.C.length - 1] ?? "0"),
                  }));
                }}
              >
                {MEDIDAS_PERMITIDAS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <p className="t-nota max-w-[72ch] text-texto-2">
          El reporte imprime A y B en «N/m» y la energía en «Julios», pero divide entre la masa en
          toneladas: eso solo es consistente con A en kN/m, B en kN/m² y la energía en kJ, y así se
          muestran aquí. La de 6 medidas va en su forma de libro, sin las erratas de la fórmula
          impresa (ADR 0048).
        </p>
        {mc.ok ? (
          <Formula paso={mc.valor} etiqueta="Con los datos capturados" />
        ) : (
          <p role="alert" className="t-interfaz">
            {mc.error}
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {ebsDatos.ok ? (
            <Formula paso={ebsDatos.valor} etiqueta="EBS con la energía de arriba" />
          ) : null}
          {ebsReporte.ok ? (
            <Formula
              paso={ebsReporte.valor}
              etiqueta={`EBS partiendo de la energía del reporte (${reporte.energia.valor})`}
            />
          ) : null}
        </div>
      </section>

      <section aria-labelledby="calculo-2" className="flex flex-col gap-4">
        <h3 id="calculo-2" className="t-subtitulo">
          2. Velocidad por desplazamiento
        </h3>
        <div className="flex flex-wrap gap-4">
          <Campo
            etiqueta={`D, separación de los restos (${distancia.fuente === "perito" ? "medida por el perito" : "del reporte"})`}
            unidad="m"
            valor={distancia.valor}
            onCambio={(v) => onDistancia({ valor: v, fuente: "perito" })}
            testid="distancia-restos"
          />
          <Campo etiqueta="a, coeficiente de adherencia" valor={datos.a} onCambio={cambia("a")} />
          <Campo etiqueta="g" unidad="m/s²" valor={datos.g} onCambio={cambia("g")} />
        </div>
        {v3.ok ? (
          <Formula paso={v3.valor} />
        ) : (
          <p role="alert" className="t-interfaz">
            {v3.error}
          </p>
        )}
      </section>

      <section aria-labelledby="comparacion" className="flex flex-col gap-4">
        <h3 id="comparacion" className="t-subtitulo">
          3. ¿Las velocidades difieren de forma significativa?
        </h3>
        <div className="flex flex-wrap items-end gap-4">
          <Campo
            etiqueta="Umbral de diferencia significativa"
            unidad="%"
            valor={datos.umbral}
            onCambio={cambia("umbral")}
            testid="umbral"
          />
          <p className="t-nota max-w-[56ch] text-texto-2">
            El reporte no dice qué criterio usa. El umbral lo fija el perito; {UMBRAL_INICIAL_PCT} %
            es solo el valor con que abre la página. La diferencia se mide respecto a la mayor de
            las dos velocidades.
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {comparar(
            "Velocidad de impacto partiendo de la energía del reporte",
            ebsReporte.ok ? ebsReporte.valor.calculo.kmh : null,
            "comparacion-reporte",
          )}
          {comparar(
            "Velocidad de impacto con los datos capturados",
            ebsDatos.ok ? ebsDatos.valor.calculo.kmh : null,
            "comparacion-datos",
          )}
        </ul>
      </section>
    </section>
  );
}
