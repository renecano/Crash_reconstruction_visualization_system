"use client";

import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { AIRBAG_SOURCE, airbagForVehicle, PROFILES } from "@croquis/viewer";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { fmtNumber } from "@/lib/format-number";
import { mensaje } from "@/lib/mensajes";
import { Desplazable } from "@/components/sitio/desplazable";
import {
  AIRBAG_SOURCE_EN,
  airbagTexto,
  campoIncierto,
  claseTexto,
  clockHour,
  paramTexto,
  rigidezTexto,
  supuestoEntorno,
  tipoTexto,
} from "@/lib/textos-resultado";

export { clockHour };

const fmt = fmtNumber;

const T = textos(
  {
    region: "Resultados de la reconstrucción",
    vehiculos: "Vehículos",
    vehiculo: "Vehículo",
    velocidadImpacto: "Velocidad al impacto",
    deltaV: "Cambio de velocidad (ΔV)",
    direccionFuerza: "Dirección de la fuerza",
    energia: "Energía de deformación",
    rigidez: "Rigidez usada",
    bolsas: "Bolsas de aire (ilustrativo)",
    noParticipa: " (no participa en el impacto)",
    notaRangos: (validas: number, semilla: number | string) =>
      `Valor nominal del modelo físico y, debajo, el rango donde cae el 80 % de ${validas} reconstrucciones con los datos inciertos muestreados (semilla ${semilla}).`,
    nominales: "Valores nominales del modelo físico.",
    notaBolsas: (fuente: string) => ` Bolsas de aire: regla ilustrativa con umbrales de ${fuente}`,
    inciertos: "Datos inciertos y sus rangos",
    volcadura: "Volcadura (criterio de tropiezo)",
    volcaduraTexto: (rol: string, lateral: string, critica: string, ssf: string, inicia: boolean) =>
      `Vehículo ${rol}: llega a la orilla con ${lateral} km/h hacia ella; el tropiezo necesita ${critica} km/h (factor de estabilidad ${ssf}). ${inicia ? "Alcanza para volcar." : "No alcanza para volcar."} La secuencia de vueltas del visor es ilustrativa.`,
    avisos: "Avisos de la reconstrucción",
    parametros: "Parámetros y su fuente",
    rango: (a: string, b: string) => ` (rango ${a}–${b})`,
    entorno: "Entorno",
  },
  {
    region: "Reconstruction results",
    vehiculos: "Vehicles",
    vehiculo: "Vehicle",
    velocidadImpacto: "Impact speed",
    deltaV: "Change in speed (ΔV)",
    direccionFuerza: "Direction of force",
    energia: "Deformation energy",
    rigidez: "Stiffness used",
    bolsas: "Airbags (illustrative)",
    noParticipa: " (not part of the impact)",
    notaRangos: (validas: number, semilla: number | string) =>
      `Nominal value from the physical model and, below it, the range where 80 % of ${validas} reconstructions fall with the uncertain data sampled (seed ${semilla}).`,
    nominales: "Nominal values from the physical model.",
    notaBolsas: (fuente: string) => ` Airbags: illustrative rule with thresholds from ${fuente}`,
    inciertos: "Uncertain data and their ranges",
    volcadura: "Rollover (tripping criterion)",
    volcaduraTexto: (rol: string, lateral: string, critica: string, ssf: string, inicia: boolean) =>
      `Vehicle ${rol}: it reaches the edge at ${lateral} km/h toward it; tripping needs ${critica} km/h (stability factor ${ssf}). ${inicia ? "It is enough to roll over." : "It is not enough to roll over."} The roll sequence in the viewer is illustrative.`,
    avisos: "Reconstruction notices",
    parametros: "Parameters and their source",
    rango: (a: string, b: string) => ` (range ${a}–${b})`,
    entorno: "Environment",
  },
);

interface Pct {
  p10: number;
  p90: number;
}

/** Intervalo p10–p90 de Monte Carlo (80 % de las muestras), si el resultado lo trae. */
function Range({ pct, unit }: { pct: Pct | undefined; unit: string }) {
  if (!pct) return null;
  return (
    <span className="t-nota cifras block">
      80 %: {fmt(pct.p10)}–{fmt(pct.p90)} {unit}
    </span>
  );
}

const TH = "t-nota py-2 pr-3 align-bottom font-normal";
const TD = "py-2 pr-3 align-top";

/** Resultados por vehículo, avisos y parámetros con su fuente. Nunca asigna culpa (PLAN §10). */
export function ResultPanel({
  resultado,
  supuestosEntorno,
  spec,
}: {
  resultado: Resultado;
  supuestosEntorno: string[];
  spec?: EscenaSpec;
}) {
  const { lang } = useIdioma();
  const t = useTextos(T);
  const inc = resultado.incertidumbre;
  const incV = new Map((inc?.vehiculos ?? []).map((v) => [v.id, v]));
  return (
    <section className="t-interfaz flex flex-col gap-6" aria-label={t.region}>
      <Desplazable etiqueta={t.vehiculos}>
        <table className="w-full border-collapse text-left">
          <caption className="t-subtitulo mb-3 text-left">{t.vehiculos}</caption>
          <thead>
            <tr className="border-b border-linea">
              <th className={TH}>{t.vehiculo}</th>
              <th className={TH}>{t.velocidadImpacto}</th>
              <th className={TH}>{t.deltaV}</th>
              <th className={TH}>{t.direccionFuerza}</th>
              <th className={TH}>{t.energia}</th>
              <th className={TH}>{t.rigidez}</th>
              {spec ? <th className={TH}>{t.bolsas}</th> : null}
            </tr>
          </thead>
          <tbody>
            {resultado.vehiculos.map((v) => (
              <tr key={v.id} className="border-b border-linea">
                <td className={TD}>
                  {v.rol} · {claseTexto(v.clase, lang)}
                  {!v.involucrado ? t.noParticipa : ""}
                </td>
                <td className={`${TD} cifras`}>
                  {fmt(v.v_impacto_kmh)} km/h
                  <Range pct={incV.get(v.id)?.v_impacto_kmh} unit="km/h" />
                </td>
                <td className={`${TD} cifras`}>
                  {fmt(v.delta_v_kmh)} km/h
                  <Range pct={incV.get(v.id)?.delta_v_kmh} unit="km/h" />
                </td>
                <td className={`${TD} cifras`}>
                  {v.pdof_horas !== undefined ? clockHour(v.pdof_horas, lang) : "—"}
                </td>
                <td className={`${TD} cifras`}>{fmt(v.dano.energia_j / 1000, 1)} kJ</td>
                <td className={TD}>{rigidezTexto(v.dano.origen_rigidez, lang)}</td>
                {spec ? (
                  <td className={`${TD} t-nota cifras`}>
                    {airbagTexto(
                      airbagForVehicle(
                        {
                          id: v.id,
                          delta_v_kmh: v.delta_v_kmh,
                          pdof_horas: v.pdof_horas,
                          dosRuedas: PROFILES[v.clase]?.kind === "two_wheel",
                        },
                        {
                          personas: spec.personas,
                          objetos: spec.entorno.objetos ?? [],
                          eventos: resultado.eventos,
                        },
                      ).motivo,
                      lang,
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="t-nota mt-2">
          {inc ? t.notaRangos(inc.validas, inc.semilla) : t.nominales}
          {spec ? t.notaBolsas(lang === "en" ? AIRBAG_SOURCE_EN : AIRBAG_SOURCE) : ""}
        </p>
      </Desplazable>
      {inc && inc.campos.length > 0 ? (
        <details data-testid="incertidumbre" className="border-t border-linea pt-3">
          <summary className="t-interfaz cursor-pointer">{t.inciertos}</summary>
          <ul className="mt-2 flex flex-col">
            {inc.campos.map((c) => (
              <li key={c.ruta} className="t-nota cifras border-t border-linea py-2 text-texto">
                {campoIncierto(c, resultado, lang)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {resultado.vehiculos.some((v) => v.volcadura) ? (
        <div className="border-t border-linea pt-3">
          <h3 className="t-interfaz">{t.volcadura}</h3>
          <ul className="mt-1 flex flex-col" data-testid="volcadura">
            {resultado.vehiculos.map((v) =>
              v.volcadura ? (
                <li key={v.id} className="cifras border-t border-linea py-2 first:border-t-0">
                  {t.volcaduraTexto(
                    v.rol,
                    fmt(v.volcadura.velocidad_lateral_kmh),
                    fmt(v.volcadura.velocidad_critica_kmh),
                    fmt(v.volcadura.ssf, 2),
                    v.volcadura.inicia,
                  )}
                </li>
              ) : null,
            )}
          </ul>
        </div>
      ) : null}
      {resultado.banderas.length > 0 ? (
        <div className="border-t border-linea pt-3">
          <h3 className="t-interfaz">{t.avisos}</h3>
          <ul className="mt-1 flex flex-col" data-testid="banderas">
            {resultado.banderas.map((b) => {
              const m = mensaje(b, lang);
              return (
                <li key={b} lang={m.lang} className="border-t border-linea py-2 first:border-t-0">
                  {m.texto}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <details className="border-t border-linea pt-3">
        <summary className="t-interfaz cursor-pointer">{t.parametros}</summary>
        <ul className="mt-2 flex flex-col">
          {Object.entries(resultado.parametros).map(([k, p]) =>
            p ? (
              <li key={k} className="border-t border-linea py-2">
                <span className="text-texto">{paramTexto(k, lang)}</span>:{" "}
                <span className="cifras">
                  {fmt(p.valor, 2)}
                  {p.rango ? t.rango(fmt(p.rango[0], 2), fmt(p.rango[1], 2)) : ""}
                </span>{" "}
                · <span className="text-texto-2">{tipoTexto(p.tipo, lang)}</span>
                {p.fuente ? <span className="t-nota block">{p.fuente}</span> : null}
              </li>
            ) : null,
          )}
          {supuestosEntorno.map((s) => {
            const m = supuestoEntorno(s, lang);
            return (
              <li key={s} className="border-t border-linea py-2">
                <span className="text-texto">{t.entorno}</span>:{" "}
                <span lang={m.lang}>{m.texto}</span>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
