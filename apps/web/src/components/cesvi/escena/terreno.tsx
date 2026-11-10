"use client";
/**
 * C3 (W5; PLAN-CESVI §3.4): «¿Cómo es el terreno?». El perito dice si el lugar es pavimento liso o
 * si hay terracería, grava, pasto u otra superficie, una zona ondulada o topes, y toca el mapa donde
 * están. También puede pedir el relieve real del lugar. La lógica vive en `@croquis/cesvi`
 * (`terreno.ts`); aquí van las opciones con su muestra y la lista de lo marcado.
 */
import {
  LIMITE_RELIEVE,
  SUPERFICIES_TERRENO,
  TOPES_NORMA,
  type PiezaTerreno,
  type TipoSuperficie,
  type TopeNorma,
} from "@croquis/cesvi";
import type { ReactNode } from "react";
import { COLOR_ONDULACION, COLOR_SUPERFICIE, COLOR_TOPE } from "@/lib/terreno-colores";

/** Lo que se va a poner con el siguiente toque en el mapa. */
export type PoniendoTerreno =
  | { clase: "zona"; tipo: TipoSuperficie }
  | { clase: "ondulacion" }
  | { clase: "tope"; norma: TopeNorma };

/** La muestra de cada opción: un cuadro de su color con su textura, visto desde arriba (28 × 28). */
function Muestra({ que }: { que: TipoSuperficie | "liso" | "ondulacion" | "tope" }) {
  const marco = { x: 1, y: 1, width: 26, height: 26, rx: 6 } as const;
  if (que === "liso")
    return (
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <rect {...marco} fill="#4B5058" />
        <path d="M14 4v5M14 12v5M14 20v4" stroke="#F4F4F0" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (que === "ondulacion")
    return (
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <rect {...marco} fill={COLOR_ONDULACION} opacity="0.22" />
        <path
          d="M3 9c3-4 5-4 8 0s5 4 8 0 4-4 6-1M3 19c3-4 5-4 8 0s5 4 8 0 4-4 6-1"
          fill="none"
          stroke={COLOR_ONDULACION}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  if (que === "tope")
    return (
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <rect {...marco} fill="#4B5058" />
        <rect x="1" y="10" width="26" height="8" fill={COLOR_TOPE} />
        <path d="M6 10l-4 8M13 10l-4 8M20 10l-4 8M27 10l-4 8" stroke="#15181B" strokeWidth="2" />
      </svg>
    );
  // Las superficies: su color con granos (terracería, grava, tierra), hojas (pasto) o piezas.
  const granos = [
    [7, 8],
    [15, 6],
    [21, 11],
    [9, 16],
    [18, 18],
    [12, 22],
    [22, 22],
    [5, 22],
  ] as const;
  const piezas = que === "empedrado" || que === "adoquin" || que === "concreto";
  return (
    <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
      <rect {...marco} fill={COLOR_SUPERFICIE[que]} />
      {que === "pasto" ? (
        <path
          d="M6 20l2-6 1 6M13 12l2-6 1 6M19 21l2-6 1 6"
          fill="none"
          stroke="#2F4A16"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : piezas ? (
        <path d="M1 10h26M1 19h26M10 1v9M19 10v9M10 19v8" stroke="rgba(21,24,27,0.35)" />
      ) : que === "asfalto" ? null : (
        granos.map(([x, y], k) => (
          <circle
            key={k}
            cx={x}
            cy={y}
            r={que === "grava" ? 1.9 : 1.2}
            fill="rgba(21,24,27,0.38)"
          />
        ))
      )}
    </svg>
  );
}

const m2 = (x: number | undefined) => (x ?? 0).toFixed(2);

/** Lo que mide o vale una pieza, en una línea («0.10 m de alto × 1.40 m de largo»). */
export function medidasDePieza(t: PiezaTerreno): string {
  if (t.clase === "zona")
    return t.friccion !== undefined ? `fricción ${m2(t.friccion)}` : "fricción de la tabla";
  if (t.clase === "ondulacion")
    return `${m2(t.amplitud_m)} m de alto, crestas cada ${m2(t.longitud_onda_m)} m${t.porOmision ? " (supuesto)" : ""}`;
  return `${m2(t.alto_m)} m de alto × ${m2(t.largo_m)} m de largo${t.porOmision ? " (norma)" : ""}`;
}

const A_LA_VISTA: readonly TipoSuperficie[] = ["terraceria", "grava", "pasto"];

export function PreguntaTerreno({
  cabecera,
  piezas,
  relieve,
  poniendo,
  otras,
  onOtras,
  onElegir,
  onTodoElLugar,
  onRelieve,
  onQuitar,
  onListo,
}: {
  cabecera: ReactNode;
  piezas: readonly PiezaTerreno[];
  /** Se usa el relieve real del lugar. */
  relieve: boolean;
  poniendo: PoniendoTerreno | null;
  /** Se ven las demás superficies («Otro»). */
  otras: boolean;
  onOtras: () => void;
  onElegir: (p: PoniendoTerreno | null) => void;
  /** La superficie elegida vale para todo el lugar. */
  onTodoElLugar: () => void;
  onRelieve: (usar: boolean) => void;
  onQuitar: (id: string) => void;
  onListo: () => void;
}) {
  const nada = !piezas.length && !relieve;
  const elegida = (p: PoniendoTerreno) =>
    poniendo?.clase === p.clase &&
    (p.clase !== "zona" || (poniendo.clase === "zona" && poniendo.tipo === p.tipo)) &&
    (p.clase !== "tope" || (poniendo.clase === "tope" && poniendo.norma === p.norma));
  const opcion = (
    p: PoniendoTerreno,
    que: Parameters<typeof Muestra>[0]["que"],
    nombre: string,
  ) => (
    <button
      key={`${p.clase}-${"tipo" in p ? p.tipo : "norma" in p ? p.norma : ""}`}
      type="button"
      className="escena-opcion flex min-h-12 items-center gap-2 rounded-xl px-3 text-left text-[0.95rem]"
      aria-pressed={elegida(p)}
      onClick={() => onElegir(elegida(p) ? null : p)}
      data-testid={`terreno-${"tipo" in p ? p.tipo : "norma" in p ? `tope-${p.norma}` : "ondulado"}`}
    >
      <Muestra que={que} />
      <span className="font-semibold">{nombre}</span>
    </button>
  );
  const superficies = SUPERFICIES_TERRENO.filter(
    (s) =>
      A_LA_VISTA.includes(s.tipo) ||
      otras ||
      (poniendo?.clase === "zona" && poniendo.tipo === s.tipo),
  );
  return (
    <>
      {cabecera}
      <h2 className="escena-titulo" data-testid="escena-pregunta">
        ¿Cómo es el terreno?
      </h2>
      <p className="t-cuerpo text-texto-2">
        Si es pavimento liso, sigue. Si hay otra superficie, una zona ondulada o topes, elige cuál y
        toca el mapa donde está: entra en la física de la reconstrucción.
      </p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Qué hay en el terreno">
        {superficies.map((s) => opcion({ clase: "zona", tipo: s.tipo }, s.tipo, s.nombre))}
        {!otras ? (
          <button
            type="button"
            className="escena-opcion flex min-h-12 items-center gap-2 rounded-xl px-3 text-left text-[0.95rem]"
            onClick={onOtras}
            data-testid="terreno-otro"
          >
            <span className="grid h-7 w-7 place-items-center rounded-md border border-linea text-[1.1rem]">
              +
            </span>
            <span className="font-semibold">Otro</span>
          </button>
        ) : null}
        {opcion({ clase: "ondulacion" }, "ondulacion", "Ondulado")}
        {opcion({ clase: "tope", norma: "circular" }, "tope", "Tope")}
      </div>
      {poniendo?.clase === "tope" ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Qué tipo de tope">
          {TOPES_NORMA.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`${poniendo.norma === n.id ? "boton-principal" : "boton-secundario"} escena-boton`}
              aria-pressed={poniendo.norma === n.id}
              onClick={() => onElegir({ clase: "tope", norma: n.id })}
              data-testid={`terreno-norma-${n.id}`}
            >
              {n.nombre} · {m2(n.alto_m)} × {m2(n.largo_m)} m
            </button>
          ))}
        </div>
      ) : null}
      {poniendo ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-superficie-alta p-4">
          <p className="t-cuerpo" role="status" data-testid="terreno-pista">
            {poniendo.clase === "zona"
              ? "Toca el mapa en el centro de esa zona. Después la puedes mover, girar y cambiar de tamaño."
              : poniendo.clase === "ondulacion"
                ? "Toca el mapa en el centro de la zona ondulada. Croquis supone 0.10 m de alto y crestas cada 6 m hasta que las midas."
                : "Toca el mapa donde está el tope. Lleva las medidas de la norma (NOM-034, tabla 38) hasta que lo midas."}
          </p>
          {poniendo.clase === "zona" ? (
            <button
              type="button"
              className="boton-secundario escena-boton"
              onClick={onTodoElLugar}
              data-testid="terreno-todo"
            >
              Todo el lugar es así
            </button>
          ) : null}
        </div>
      ) : null}
      {piezas.length ? (
        <ul className="flex flex-col gap-1" data-testid="terreno-marcado">
          {piezas.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 rounded-control bg-superficie-alta px-3 py-1"
            >
              <span className="text-[0.9375rem]">
                {t.nombre} · <span className="text-texto-2">{medidasDePieza(t)}</span>
              </span>
              <button
                type="button"
                className="t-nota min-h-11 underline"
                onClick={() => onQuitar(t.id)}
                data-testid={`terreno-quitar-${t.id}`}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={relieve}
          onChange={(ev) => onRelieve(ev.currentTarget.checked)}
          data-testid="terreno-relieve"
        />
        <span>
          <span className="font-semibold">Usar el relieve real del lugar</span>
          <span className="t-nota block">{LIMITE_RELIEVE}</span>
        </span>
      </label>
      <button
        type="button"
        className="boton-principal escena-boton w-full"
        onClick={onListo}
        data-testid={nada ? "terreno-liso" : "terreno-listo"}
      >
        {nada ? "Es pavimento liso" : "Listo"}
      </button>
    </>
  );
}
