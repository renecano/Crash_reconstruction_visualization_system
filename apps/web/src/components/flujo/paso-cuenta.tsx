"use client";
/**
 * Paso «Cuenta» (PLAN §11.4): el relato, ejemplos para empezar, lo que ya se entiende mientras
 * se escribe (reglas en el dispositivo, con su cita) y lo que de verdad sale del dispositivo
 * (sin datos personales).
 */
import { extractFacts, redact, type Fact, type Span } from "@croquis/extraction";
import { useDeferredValue, useMemo, useState } from "react";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { palabra, VALOR } from "@/i18n/vocabulario";
import { TEXTOS_FLUJO } from "./textos";

export const MAX_RELATO = 5000;

export interface Ejemplo {
  id: string;
  titulo: string;
  texto: string;
}

const MARCADOR: Record<Span["kind"], keyof (typeof TEXTOS_FLUJO)["es"]["cuenta"]["marcadores"]> = {
  NOMBRE: "nombre",
  PLACA: "placa",
  TELEFONO: "teléfono",
  CORREO: "correo",
  CURP: "CURP",
  RFC: "RFC",
  NUMERO: "número de domicilio",
};

/** Un dato entendido con reglas, listo para mostrar: valor en palabras y su cita. */
interface Entendido {
  clave: string;
  valor: string;
  cita: string;
}

const UNIDAD: Record<string, string> = {
  velocidad_kmh: "km/h",
  "evidencias.marcas_m": "m",
  "evidencias.distancia_proyeccion_m": "m",
};

function entendidos(texto: string, lang: "es" | "en"): { lista: Entendido[]; vehiculos: number; personas: number } {
  const f = extractFacts(texto);
  const lista: Entendido[] = [];
  const add = (clave: string, x: Fact | undefined, unidad?: string) => {
    if (!x?.cita) return;
    const v = typeof x.valor === "number" ? `${x.valor}${unidad ? ` ${unidad}` : ""}` : palabra(VALOR, x.valor, lang);
    lista.push({ clave, valor: v, cita: x.cita });
  };
  for (const [k, x] of f.escalares) add(k, x, UNIDAD[k]);
  f.vehiculos.forEach((v, i) => {
    for (const campo of ["clase", "maniobra", "velocidad_kmh"]) add(`v${i}.${campo}`, v.get(campo), UNIDAD[campo]);
  });
  f.dispositivos.forEach((d, i) => add(`d${i}`, d));
  return { lista, vehiculos: f.vehiculos.length, personas: f.personas.length };
}

export function PasoCuenta({
  texto,
  onTexto,
  ejemplos,
  ocupado,
  enLinea,
  onLeer,
}: {
  texto: string;
  onTexto: (t: string) => void;
  ejemplos: readonly Ejemplo[];
  ocupado: boolean;
  enLinea: boolean;
  onLeer: () => void;
}) {
  const { lang } = useIdioma();
  const t = useTextos(TEXTOS_FLUJO).cuenta;
  const [verEnvio, setVerEnvio] = useState(false);
  const red = useMemo(() => redact(texto), [texto]);
  // Las reglas corren con el texto diferido: escribir nunca se traba.
  const diferido = useDeferredValue(red.text);
  const entendido = useMemo(() => entendidos(diferido, lang), [diferido, lang]);
  const conteo = red.spans.reduce<Record<string, number>>((acc, s) => {
    const k = t.marcadores[MARCADOR[s.kind]];
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const vacio = red.text.trim().length === 0;

  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="flex flex-col gap-4 lg:col-span-7">
        <label htmlFor="relato" className="t-subtitulo">
          {t.etiqueta}
        </label>
        <p id="relato-ayuda" className="t-cuerpo text-texto-2">
          {t.ayuda}
        </p>
        <textarea
          id="relato"
          data-testid="relato"
          aria-describedby="relato-ayuda relato-privacidad"
          className="campo min-h-56 resize-y leading-relaxed"
          value={texto}
          maxLength={MAX_RELATO}
          onChange={(e) => onTexto(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="t-nota cifras" aria-live="off">
            {t.caracteres(texto.length, MAX_RELATO)}
          </p>
          <button
            type="button"
            data-testid="entender"
            className="boton-principal"
            disabled={ocupado || !enLinea || vacio}
            onClick={onLeer}
          >
            {t.leer}
          </button>
        </div>
        <p id="relato-privacidad" data-testid="privacidad" className="t-nota">
          {red.spans.length > 0
            ? t.privacidad(
                Object.entries(conteo)
                  .map(([k, n]) => `${n} ${k}`)
                  .join(", "),
              )
            : t.privacidadVacia}{" "}
          {!vacio ? (
            <button
              type="button"
              className="underline underline-offset-4"
              aria-expanded={verEnvio}
              onClick={() => setVerEnvio((v) => !v)}
            >
              {t.verEnvio}
            </button>
          ) : null}
        </p>
        {verEnvio && !vacio ? (
          <p
            data-testid="texto-redactado"
            className="t-nota border-l-2 border-linea pl-4 whitespace-pre-wrap text-texto"
          >
            {red.text}
          </p>
        ) : null}
        {!enLinea ? (
          <p role="status" data-testid="sin-red" className="t-interfaz border-l-2 border-accion pl-4">
            {t.sinRed}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-3">
          <p className="t-interfaz text-texto-2">{t.ejemplos}</p>
          <ul className="flex flex-wrap gap-2">
            {ejemplos.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="boton-secundario min-h-11 px-4 text-left"
                  data-testid={`ejemplo-${e.id}`}
                  onClick={() => onTexto(e.texto)}
                >
                  {e.titulo}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <aside aria-labelledby="entendido-titulo" className="carril self-start lg:col-span-5" data-testid="entendido">
        <h2 id="entendido-titulo" className="t-subtitulo">
          {t.entiende}
        </h2>
        <p className="t-nota mt-1 mb-4">{t.entiendeNota}</p>
        {entendido.lista.length === 0 && entendido.vehiculos === 0 ? (
          <p className="t-interfaz text-texto-3">{t.entiendeVacio}</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-live="polite">
            {entendido.vehiculos > 0 ? (
              <li className="t-interfaz">
                {t.vehiculos(entendido.vehiculos)}
                {entendido.personas > 0 ? ` · ${t.personas(entendido.personas)}` : ""}
              </li>
            ) : null}
            {entendido.lista.slice(0, 10).map((e) => (
              <li key={e.clave} className="flex flex-col">
                <span className="t-interfaz">{e.valor}</span>
                <span className="t-nota">
                  <q className="cita">{e.cita}</q>
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
