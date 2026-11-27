"use client";

import { useEffect, useRef, useState } from "react";
import {
  cambiosDeVelocidad,
  especDeHipotesisVelocidad,
  MEDIO_EN_PALABRAS,
  especReconstruida,
  resumenHipotesisVelocidad,
  tituloHipotesisVelocidad,
  VELOCIDAD_HIPOTESIS_KMH,
  type CambioVersion,
  type EscenaSolver,
  type Reconstruccion,
  type VelocidadElegida,
} from "@croquis/cesvi";
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { reconstruirEnNavegador } from "@/lib/reconstruct-client";
import { claveHipotesis, type VersionCaso, type VersionVelocidad } from "@/lib/versiones-caso";
import { Tarjeta } from "./versiones";

/**
 * «¿Y si…?» a otra velocidad, en la Reconstrucción (pedido de CESVI; René, 2026-11-26): el perito
 * cambia la velocidad de cada vehículo y ve cómo habría sido el choque, simulado hacia adelante con la
 * misma física. La línea base es la misma simulación a la velocidad reconstruida (la del 3D). Es una
 * hipótesis: la cifra reconstruida no cambia, y así se dice.
 */
export function HipotesisVelocidad({
  r,
  nombreDe,
  versiones,
  onVersion,
  activa,
  onActiva,
}: {
  r: Reconstruccion;
  nombreDe: (id: string) => string;
  versiones: readonly VersionCaso[];
  onVersion: (v: VersionVelocidad) => void;
  /** La hipótesis que se ve encima de la reconstrucción (2D y 3D), o null. */
  activa: string | null;
  onActiva: (clave: string | null) => void;
}) {
  const reconstruida = (id: string) =>
    r.velocidades.find((v) => v.vehiculo === id)?.previa?.mejor ?? null;
  const ids = [...new Set(Object.values(r.ids).map(String))].sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true }),
  );
  const [kmh, setKmh] = useState<Record<string, string>>(() =>
    Object.fromEntries(ids.map((id) => [id, String(Math.round(reconstruida(id) ?? 0))])),
  );
  const [estado, setEstado] = useState<string | null>(null);
  const [ultima, setUltima] = useState<{ clave: string; cambios: CambioVersion[] } | null>(null);
  const [lo, hi] = VELOCIDAD_HIPOTESIS_KMH;

  const elegidas = (): VelocidadElegida[] | null => {
    const out: VelocidadElegida[] = [];
    for (const id of ids) {
      const t = (kmh[id] ?? "").trim().replace(",", ".");
      const x = Number(t);
      if (!t || !Number.isFinite(x) || x < lo || x > hi) return null;
      const rec = reconstruida(id);
      if (rec === null || Math.abs(x - rec) >= 0.5) out.push({ vehiculo: id, kmh: x });
    }
    return out;
  };

  // La velocidad que declaró el conductor o un testigo (René, 2026-11-27): si la física da otra,
  // la simulación con la declarada queda sola en Versiones, una vez por vehículo, para compararla y
  // elegir cuál lleva el dictamen. La cifra reconstruida no cambia.
  const declaradas = Object.entries(r.narradas ?? {}).flatMap(([id, n]) => {
    if (n.origen !== "perito" || n.como_se_sabe === "medida") return [];
    const rec = reconstruida(id);
    if (rec === null || Math.abs(n.kmh - rec) < 0.5) return [];
    return [{ id, kmh: n.kmh, medio: n.medio ?? "conductor" }];
  });
  const pedidas = useRef(new Set<string>());
  useEffect(() => {
    for (const d of declaradas) {
      const clave = `declarada-${d.id}`;
      if (pedidas.current.has(clave) || versiones.some((v) => v.clave === clave)) continue;
      pedidas.current.add(clave);
      const e: VelocidadElegida[] = [{ vehiculo: d.id, kmh: d.kmh }];
      const base = { ...r, spec: especReconstruida(r) } as unknown as EscenaSolver;
      const hip = especDeHipotesisVelocidad(base, new Map(), e);
      void Promise.all([
        reconstruirEnNavegador(base.spec as unknown as EscenaSpec, r.relieve),
        reconstruirEnNavegador(hip.spec as unknown as EscenaSpec, r.relieve),
      ])
        .then(([linea, resultado]) => {
          const cambios = cambiosDeVelocidad(r.ids, resultado, linea, nombreDe);
          onVersion({
            clave,
            tipo: "hipotesis",
            clase: "velocidad",
            titulo: `Con la velocidad declarada: ${nombreDe(d.id)} a ${d.kmh} km/h (${MEDIO_EN_PALABRAS[d.medio]})`,
            resumen: resumenHipotesisVelocidad(cambios),
            etiqueta: `la velocidad que declaró ${MEDIO_EN_PALABRAS[d.medio]}`,
            resultado: resultado as Resultado,
            escena: hip.spec as unknown as EscenaSpec,
            velocidades: e,
            cambios,
          });
        })
        .catch(() => pedidas.current.delete(clave));
    }
    // Una vez por reconstrucción y por velocidad declarada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, declaradas.map((d) => `${d.id}:${d.kmh}`).join(",")]);

  const simular = async () => {
    const e = elegidas();
    if (!e) {
      setEstado(`Escribe una velocidad entre ${lo} y ${hi} km/h para cada vehículo.`);
      return;
    }
    if (!e.length) {
      setEstado("Cambia la velocidad de al menos un vehículo.");
      return;
    }
    setEstado("Simulando la hipótesis…");
    try {
      // La línea base es la escena del 3D (las velocidades reconstruidas); la hipótesis, la misma
      // con las velocidades del perito.
      const base = { ...r, spec: especReconstruida(r) } as unknown as EscenaSolver;
      const hip = especDeHipotesisVelocidad(base, new Map(), e);
      const [linea, resultado] = await Promise.all([
        reconstruirEnNavegador(base.spec as unknown as EscenaSpec, r.relieve),
        reconstruirEnNavegador(hip.spec as unknown as EscenaSpec, r.relieve),
      ]);
      const cambios = cambiosDeVelocidad(r.ids, resultado, linea, nombreDe);
      const clave = claveHipotesis(versiones);
      onVersion({
        clave,
        tipo: "hipotesis",
        clase: "velocidad",
        titulo: tituloHipotesisVelocidad(e, nombreDe),
        resumen: resumenHipotesisVelocidad(cambios),
        etiqueta: "la hipótesis «¿y si…?» del perito",
        resultado: resultado as Resultado,
        escena: hip.spec as unknown as EscenaSpec,
        velocidades: e,
        cambios,
      });
      setUltima({ clave, cambios });
      onActiva(clave);
      setEstado(null);
    } catch (err) {
      setEstado(`No se pudo simular: ${(err as Error).message}`);
    }
  };

  return (
    <details className="hundido rounded-control p-4" data-testid="ysi-velocidad">
      <summary className="t-interfaz cursor-pointer font-semibold" data-testid="abrir-ysi">
        ¿Y si…? Cambiar la velocidad
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="t-nota">
          Elige otra velocidad y Croquis simula el choque con la misma física, hacia adelante: en el
          mismo punto de impacto, con su daño y a dónde llegan. Es una hipótesis tuya: la cifra
          reconstruida no cambia.
        </p>
        <div className="flex flex-col gap-2">
          {ids.map((id) => {
            const rec = reconstruida(id);
            return (
              <label key={id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[10rem] text-[0.9375rem]">{nombreDe(id)}</span>
                <input
                  className="campo cifras w-24"
                  inputMode="decimal"
                  value={kmh[id] ?? ""}
                  onChange={(ev) => setKmh((k) => ({ ...k, [id]: ev.target.value }))}
                  aria-label={`Velocidad de ${nombreDe(id)} en la hipótesis, km/h`}
                  data-testid={`ysi-kmh-${id}`}
                />
                <span className="t-nota">
                  km/h ·{" "}
                  {rec === null
                    ? "la reconstrucción no la fija"
                    : `reconstruida: ${Math.round(rec)}`}
                </span>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          className="boton-principal self-start"
          onClick={() => void simular()}
          disabled={estado === "Simulando la hipótesis…"}
          data-testid="ysi-simular"
        >
          Simular
        </button>
        {estado ? (
          <p className="t-nota" role="status" data-testid="ysi-estado">
            {estado}
          </p>
        ) : null}
        {ultima ? (
          <div className="flex flex-col gap-2" data-testid="ysi-resultado">
            <p
              className="t-nota border-l-2 border-senal pl-3 text-senal-texto"
              data-testid="ysi-aviso"
            >
              Hipótesis del perito: la cifra reconstruida no cambia. En el mapa y en el 3D, la
              hipótesis va encima de la reconstrucción.
            </p>
            <div className="segmentado self-start" role="group" aria-label="Qué se ve">
              <button
                type="button"
                aria-pressed={activa === ultima.clave}
                onClick={() => onActiva(ultima.clave)}
                className="px-4"
                data-testid="ysi-ver"
              >
                Con la hipótesis encima
              </button>
              <button
                type="button"
                aria-pressed={activa !== ultima.clave}
                onClick={() => onActiva(null)}
                className="px-4"
                data-testid="ysi-ocultar"
              >
                Solo la reconstrucción
              </button>
            </div>
            <ul className="flex flex-col gap-2" data-testid="ysi-cambios">
              {ultima.cambios.map((c) => (
                <Tarjeta
                  key={c.concepto}
                  fila={c.clave}
                  concepto={c.concepto}
                  filas={[
                    ["Con la hipótesis", c.version],
                    ["A la velocidad reconstruida", c.reconstruccion],
                  ]}
                  estado={
                    c.cambia
                      ? { texto: "Cambia", clase: "insignia insignia-senal" }
                      : { texto: "Igual", clase: "insignia" }
                  }
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
