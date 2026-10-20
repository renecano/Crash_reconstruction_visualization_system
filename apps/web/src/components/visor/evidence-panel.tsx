"use client";

import type { Resultado } from "@croquis/scene-schema";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { fmtNumber } from "@/lib/format-number";
import { mensaje } from "@/lib/mensajes";
import { Desplazable } from "@/components/sitio/desplazable";
import {
  evidenceLabel,
  inicialTexto,
  parametroInversion,
  unidadInversion,
} from "@/lib/textos-resultado";

type Inversion = NonNullable<Resultado["inversion"]>;
type Parametro = Inversion["parametros"][number];

const fmt = fmtNumber;

export { evidenceLabel };

const T = textos(
  {
    titulo: "Lo que dice la evidencia física",
    noBasta: "La evidencia no basta para estimarlo.",
    enLimite: (valor: string) =>
      `La evidencia lleva este dato hasta el límite del modelo (${valor}), así que no cabe bien con lo demás. Conviene revisar los datos.`,
    mejorAjuste: "mejor ajuste",
    declarada: (lista: string) => `Evidencia declarada: ${lista}.`,
    vehiculo: "Vehículo",
    dato: "Dato",
    partida: "Valor de partida",
    segun: "Según la evidencia (80 %)",
    nota: (muestras: number, semilla: number | string) =>
      `Velocidades y direcciones con las que el solver reproduce la evidencia (mínimos cuadrados robustos), repetidas ${muestras} veces con la fricción, las masas y la evidencia dentro de su incertidumbre (semilla ${semilla}). Las direcciones solo se ajustan si nadie las dijo, hasta 20° del supuesto.`,
    sinEvidencia:
      "La escena no declara posiciones finales, marcas de frenado, distancia de proyección ni daño medible: las velocidades salen de lo dicho y de los supuestos.",
    noCuadran: "Datos que no cuadran",
  },
  {
    titulo: "What the physical evidence says",
    noBasta: "The evidence is not enough to estimate it.",
    enLimite: (valor: string) =>
      `The evidence pushes this value to the limit of the model (${valor}), so it does not fit well with the rest. It is worth checking the data.`,
    mejorAjuste: "best fit",
    declarada: (lista: string) => `Stated evidence: ${lista}.`,
    vehiculo: "Vehicle",
    dato: "Value",
    partida: "Starting value",
    segun: "According to the evidence (80 %)",
    nota: (muestras: number, semilla: number | string) =>
      `Speeds and directions with which the solver reproduces the evidence (robust least squares), repeated ${muestras} times with friction, masses and evidence within their uncertainty (seed ${semilla}). Directions are only adjusted if nobody stated them, up to 20° from the assumption.`,
    sinEvidencia:
      "The scene does not state final positions, skid marks, throw distance or measurable damage: the speeds come from what was told and from the assumptions.",
    noCuadran: "Data that do not fit",
  },
);

function Estimate({ p }: { p: Parametro }) {
  const t = useTextos(T);
  const unit = p.unidad === "deg" ? "°" : " km/h";
  if (!p.identificable || !p.estimacion) {
    return <span>{t.noBasta}</span>;
  }
  const e = p.estimacion;
  if (p.en_limite) {
    return <span className="cifras">{t.enLimite(`${fmt(e.mejor)}${unit}`)}</span>;
  }
  return (
    <span className="cifras">
      {fmt(e.p10)}–{fmt(e.p90)}
      {unit}
      <span className="t-nota block">
        {t.mejorAjuste} {fmt(e.mejor)}
        {unit}
      </span>
    </span>
  );
}

const TH = "t-nota py-2 pr-3 align-bottom font-normal";
const TD = "py-2 pr-3 align-top";

/**
 * Inversión y consistencia (PLAN §6.1.10 y §6.1.12): qué velocidades y ángulos fija la evidencia
 * física declarada y qué datos no cuadran con ninguna solución física. Nunca asigna culpa.
 */
export function EvidencePanel({ resultado }: { resultado: Resultado }) {
  const { lang } = useIdioma();
  const t = useTextos(T);
  const inv = resultado.inversion;
  const flags = resultado.consistencia ?? [];
  const roles = new Map(resultado.vehiculos.map((v) => [v.id, v.rol]));
  if (!inv && flags.length === 0) return null;
  return (
    <section
      aria-label={t.titulo}
      data-testid="evidencia"
      className="t-interfaz flex flex-col gap-4"
    >
      <h3 className="t-subtitulo">{t.titulo}</h3>
      {inv && inv.evidencia.length > 0 ? (
        <>
          <p>{t.declarada(inv.evidencia.map((l) => evidenceLabel(l, roles, lang)).join(", "))}</p>
          <Desplazable etiqueta={t.titulo}>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-linea">
                  <th className={TH}>{t.vehiculo}</th>
                  <th className={TH}>{t.dato}</th>
                  <th className={TH}>{t.partida}</th>
                  <th className={TH}>{t.segun}</th>
                </tr>
              </thead>
              <tbody>
                {inv.parametros.map((p) => (
                  <tr key={`${p.parametro}-${p.vehiculo}`} className="border-b border-linea">
                    <td className={TD}>{roles.get(p.vehiculo) ?? p.vehiculo}</td>
                    <td className={TD}>{parametroInversion(p, lang)}</td>
                    <td className={`${TD} cifras`}>
                      {fmt(p.inicial)}
                      {unidadInversion(p)}{" "}
                      <span className="t-nota">({inicialTexto(p.inicial_declarado, lang)})</span>
                    </td>
                    <td className={TD}>
                      <Estimate p={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Desplazable>
          <p className="t-nota">{t.nota(inv.muestras, inv.semilla)}</p>
        </>
      ) : (
        <p>{t.sinEvidencia}</p>
      )}
      {flags.length > 0 ? (
        <div className="border-t border-linea pt-3">
          <h4 className="t-interfaz">{t.noCuadran}</h4>
          <ul className="mt-2 flex flex-col gap-2" data-testid="consistencia">
            {flags.map((f) => {
              const m = mensaje(f.mensaje, lang);
              return (
                <li
                  key={`${f.codigo}-${f.datos.vehiculo}`}
                  lang={m.lang}
                  className="border-l-2 border-evidencia py-1 pl-3"
                >
                  {m.texto}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
