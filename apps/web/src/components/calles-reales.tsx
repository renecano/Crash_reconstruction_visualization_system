"use client";

/**
 * «Calles reales» del croquis (ADR 0040): con unas coordenadas sobre el cruce, la escena toma las
 * calles de OpenStreetMap. Necesita red; la escena resultante funciona sin ella.
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { useState } from "react";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { useEnLinea } from "@/lib/en-linea";
import { MapaError, parseCoordenadas, traerCalles } from "@/lib/mapa";

const T = textos(
  {
    titulo: "Calles reales (OpenStreetMap)",
    ayuda:
      "Pega las coordenadas del cruce (por ejemplo, desde un mapa: «19.27897, -99.65399»). Las calles se guardan en la escena; después funciona sin red.",
    coordenadas: "Coordenadas del cruce",
    radio: "Radio",
    traer: "Traer calles",
    consultando: "Consultando…",
    sinRed: "Sin conexión: traer calles necesita internet.",
    listo: (n: number) => `Se trajeron ${n} calles de OpenStreetMap; el cruce quedó en el origen.`,
  },
  {
    titulo: "Real streets (OpenStreetMap)",
    ayuda:
      "Paste the coordinates of the intersection (for example, from a map: “19.27897, -99.65399”). The streets are saved in the scene; after that it works offline.",
    coordenadas: "Coordinates of the intersection",
    radio: "Radius",
    traer: "Get streets",
    consultando: "Querying…",
    sinRed: "Offline: getting streets needs internet.",
    listo: (n: number) =>
      `${n} streets came from OpenStreetMap; the intersection is now at the origin.`,
  },
);

/** Los errores conocidos del mapa (servidor y `applyMap`) en inglés. */
const ERRORES_EN: [RegExp, string][] = [
  [
    /^OpenStreetMap no respondió/,
    "OpenStreetMap did not respond: its public servers are overloaded. Try again in a few minutes; scenes that already have their streets do not need it.",
  ],
  [/^Demasiadas consultas al mapa/, "Too many map queries in one hour. Try again later."],
  [
    /^No encontré un cruce de calles a menos de 60 m/,
    "No intersection was found within 60 m of those coordinates. Put them on the intersection.",
  ],
  [/^No se pudo consultar OpenStreetMap/, "OpenStreetMap could not be queried."],
  [
    /^La escena con las calles no cumple el contrato/,
    "The scene with the streets does not meet the scene contract.",
  ],
  [/^Coordenadas inválidas/, "Invalid coordinates."],
];

export interface CallesRealesProps {
  spec: EscenaSpec;
  onApply: (spec: EscenaSpec) => void;
  fetcher?: typeof fetch;
}

export function CallesReales({ spec, onApply, fetcher }: CallesRealesProps) {
  const { lang } = useIdioma();
  const t = useTextos(T);
  const enLinea = useEnLinea();
  const [texto, setTexto] = useState("");
  const [radio, setRadio] = useState(150);
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const coords = parseCoordenadas(texto);

  const traer = async () => {
    if (!coords) return;
    setBusy(true);
    setMensaje(null);
    try {
      const r = await traerCalles(spec, coords, radio, fetcher);
      onApply(r.spec);
      setMensaje({ ok: true, texto: t.listo(r.vias) });
    } catch (e) {
      const es = e instanceof MapaError || e instanceof Error ? e.message : String(e);
      const en = lang === "en" ? ERRORES_EN.find(([re]) => re.test(es))?.[1] : undefined;
      setMensaje({ ok: false, texto: en ?? es });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="border-t border-linea pt-4">
      <summary className="t-interfaz cursor-pointer">{t.titulo}</summary>
      <div className="mt-4 flex flex-col gap-3">
        <p className="t-nota">{t.ayuda}</p>
        <div className="flex flex-wrap items-end gap-3">
          <input
            data-testid="mapa-coordenadas"
            aria-label={t.coordenadas}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="19.27897, -99.65399"
            inputMode="decimal"
            className="campo w-60 cifras"
          />
          <label className="t-nota flex flex-col gap-1">
            <span>{t.radio}</span>
            <select
              aria-label={t.radio}
              value={radio}
              onChange={(e) => setRadio(Number(e.target.value))}
              className="campo w-auto"
            >
              {[100, 150, 200].map((r) => (
                <option key={r} value={r}>
                  {r} m
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="mapa-traer"
            disabled={!coords || busy || !enLinea}
            onClick={() => void traer()}
            className="boton-secundario"
          >
            {busy ? t.consultando : t.traer}
          </button>
        </div>
        {!enLinea ? <p className="t-nota border-l-2 border-texto-2 pl-3">{t.sinRed}</p> : null}
        {mensaje ? (
          <p
            role={mensaje.ok ? "status" : "alert"}
            data-testid="mapa-mensaje"
            className={`t-nota border-l-2 pl-3 text-texto ${mensaje.ok ? "border-texto-2" : "border-texto"}`}
          >
            {mensaje.texto}
          </p>
        ) : null}
      </div>
    </details>
  );
}
