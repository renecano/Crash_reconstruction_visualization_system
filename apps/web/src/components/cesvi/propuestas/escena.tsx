"use client";
/**
 * PROTOTIPO (ronda 4; René, 2026-11-18: «la primera experiencia en La escena»). Tres propuestas de
 * cómo recibe La escena al perito, sobre La escena real y con la escena que arma Croquis
 * (`proponerEscena`), para que René elija antes de construir. Solo con `?propuesta=1|2|3`: sin el
 * parámetro no aparece nada. Los botones del prototipo no hacen nada todavía, salvo «Deshacer» y
 * «Rehacer», que ya existen.
 *
 * - **1 · Revisar lo que armó Croquis:** la escena completa en el mapa y, a la izquierda, la lista de
 *   lo propuesto (con su porqué, «Confirmar» o «Corregir») y de lo que falta.
 * - **2 · Una pregunta a la vez, con la respuesta ya puesta:** el recorrido de hoy, pero cada pregunta
 *   llega contestada por Croquis en el mapa; el perito confirma con un toque o corrige.
 * - **3 · La escena primero, las dudas sobre el mapa:** sin panel; cada cosa propuesta lleva en el
 *   mapa su etiqueta «¿Así fue?», y una tarjeta chica dice cuánto falta.
 */
import type { Map as MapaMl } from "maplibre-gl";
import { useEffect, useState } from "react";
import type { EscenaPropuesta } from "@/lib/escena-propuesta";
import { poseDe } from "@/lib/escena-facil";

/** Las herramientas a la vista desde el primer instante, cada una con su tecla. */
const HERRAMIENTAS: { texto: string; tecla: string; id: string }[] = [
  { texto: "Mover", tecla: "V", id: "mover" },
  { texto: "Girar", tecla: "R", id: "girar" },
  { texto: "Alinear con la calle", tecla: "A", id: "alinear" },
  { texto: "Voltear 180°", tecla: "F", id: "voltear" },
  { texto: "Deshacer", tecla: "Ctrl+Z", id: "deshacer" },
  { texto: "Rehacer", tecla: "Ctrl+Y", id: "rehacer" },
  { texto: "Acercar", tecla: "+ −", id: "acercar" },
  { texto: "Medir", tecla: "M", id: "medir" },
];

function Herramientas({ compacta = false }: { compacta?: boolean }) {
  return (
    <div
      className="vidrio pointer-events-auto flex flex-wrap items-center gap-1 rounded-panel p-1.5"
      role="toolbar"
      aria-label="Herramientas de la escena"
      data-testid="propuesta-herramientas"
    >
      {HERRAMIENTAS.map((h, i) => (
        <button
          key={h.id}
          type="button"
          aria-pressed={i === 0}
          className={`flex items-center gap-2 rounded-control px-2.5 py-1.5 text-[0.8125rem] ${i === 0 ? "bg-texto text-fondo" : "hover:bg-hundido"}`}
        >
          <span>{h.texto}</span>
          {compacta ? null : (
            <kbd className="rounded border border-linea-suave px-1 font-mono text-[0.6875rem] text-texto-3">
              {h.tecla}
            </kbd>
          )}
        </button>
      ))}
    </div>
  );
}

function Guia({ propuesta, onCerrar }: { propuesta: EscenaPropuesta; onCerrar: () => void }) {
  return (
    <div
      className="vidrio pointer-events-auto flex max-w-[26rem] flex-col gap-2 rounded-panel p-4"
      role="dialog"
      aria-label="Cómo empezar"
      data-testid="propuesta-guia"
    >
      <p className="text-[0.9375rem] font-semibold">Croquis ya armó la escena con lo que leyó</p>
      <ol className="t-nota flex list-decimal flex-col gap-1 pl-5">
        <li>
          Lo <b>punteado</b> es propuesto ({propuesta.propuestos.length}): revísalo y confírmalo.
        </li>
        <li>
          Toca un vehículo para moverlo; gíralo con su anillo o con R, y A lo alinea con la calle.
        </li>
        <li>
          Falta {propuesta.faltan.length === 1 ? "una cosa" : `${propuesta.faltan.length} cosas`}{" "}
          que solo tú sabes: {propuesta.faltan[0]?.texto.toLowerCase() ?? "nada"}.
        </li>
      </ol>
      <button type="button" className="boton-principal self-start" onClick={onCerrar}>
        Empezar a revisar
      </button>
    </div>
  );
}

function Fila({
  texto,
  porque,
  estado,
}: {
  texto: string;
  porque: string;
  estado: "propuesto" | "falta";
}) {
  return (
    <li className="flex flex-col gap-1.5 border-t border-linea-suave py-3 first:border-t-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[0.9375rem] font-medium">{texto}</span>
        <span
          className={`insignia shrink-0 ${estado === "propuesto" ? "insignia-supuesto" : "insignia-senal"}`}
        >
          {estado === "propuesto" ? "Propuesto" : "Falta"}
        </span>
      </div>
      <span className="t-nota">Por qué: {porque}.</span>
      <div className="flex gap-2">
        {estado === "propuesto" ? (
          <>
            <button type="button" className="boton-compacto boton-principal">
              Confirmar
            </button>
            <button type="button" className="boton-compacto boton-secundario">
              Corregir
            </button>
          </>
        ) : (
          <button type="button" className="boton-compacto boton-principal">
            Marcar en el mapa
          </button>
        )}
      </div>
    </li>
  );
}

/** Dónde va en pantalla cada cosa propuesta (para las etiquetas de la propuesta 3). */
function useEnPantalla(mapa: MapaMl | null, propuesta: EscenaPropuesta) {
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  useEffect(() => {
    if (!mapa) return undefined;
    const calcular = () => {
      const out: Record<string, { x: number; y: number }> = {};
      const c = propuesta.puntos[1];
      if (c) out["choque-1"] = mapa.project([c.lon, c.lat]);
      for (const el of propuesta.propuestos) {
        const v = el.clave.replace(/^direccion-/, "");
        const p = poseDe(propuesta.expediente, v, "impacto");
        if (p) out[el.clave] = mapa.project([p.punto.lon, p.punto.lat]);
      }
      setPos(out);
    };
    mapa.on("moveend", calcular);
    mapa.once("idle", calcular);
    mapa.triggerRepaint();
    return () => {
      mapa.off("moveend", calcular);
    };
  }, [mapa, propuesta]);
  return pos;
}

export function PropuestaEscena({
  variante,
  propuesta,
  mapa,
}: {
  variante: 1 | 2 | 3;
  propuesta: EscenaPropuesta;
  mapa: MapaMl | null;
}) {
  const [guia, setGuia] = useState(true);
  const pos = useEnPantalla(variante === 3 ? mapa : null, propuesta);
  const total = propuesta.propuestos.length + propuesta.faltan.length;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      data-testid={`propuesta-escena-${variante}`}
    >
      {/* Las herramientas, siempre arriba del mapa. */}
      <div
        className={`absolute top-4 ${variante === 1 ? "left-[480px]" : "left-1/2 -translate-x-1/2"}`}
      >
        <Herramientas compacta={variante === 3} />
      </div>

      {variante === 1 ? (
        <aside
          className="escena-hoja pointer-events-auto absolute top-4 bottom-4 left-4 flex w-[448px] flex-col gap-3 overflow-y-auto p-6"
          data-testid="propuesta-lista"
        >
          <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-texto-3 uppercase">
            La escena · revisa lo propuesto
          </span>
          <h2 className="text-[1.75rem] leading-tight font-semibold">
            Croquis armó la escena. Revisa y corrige.
          </h2>
          <p className="t-nota">
            {propuesta.propuestos.length} propuestos · {propuesta.faltan.length} por marcar. Lo
            propuesto es un supuesto hasta que lo confirmas.
          </p>
          <ul>
            {propuesta.propuestos.map((p) => (
              <Fila key={p.clave} texto={p.texto} porque={p.porque} estado="propuesto" />
            ))}
            {propuesta.faltan.map((p) => (
              <Fila key={p.clave} texto={p.texto} porque={p.porque} estado="falta" />
            ))}
          </ul>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-linea-suave pt-4">
            <span className="t-nota">0 de {total} listos</span>
            <button type="button" className="boton-principal" disabled>
              Ver la reconstrucción →
            </button>
          </div>
        </aside>
      ) : null}

      {variante === 2 ? (
        <div
          className="vidrio pointer-events-auto absolute right-4 bottom-28 flex w-[20rem] flex-col gap-1 rounded-panel p-3"
          data-testid="propuesta-faltan"
        >
          <span className="text-[0.8125rem] font-semibold">
            Lo que falta · 0 de {total} confirmados
          </span>
          {[...propuesta.propuestos, ...propuesta.faltan].map((p, i) => (
            <span key={p.clave} className="t-nota flex items-center gap-2">
              <span aria-hidden="true">{i < propuesta.propuestos.length ? "◌" : "○"}</span>
              {p.texto}
              {i < propuesta.propuestos.length ? " (propuesto)" : ""}
            </span>
          ))}
        </div>
      ) : null}

      {variante === 3 ? (
        <>
          {propuesta.propuestos.map((p, k) =>
            pos[p.clave] ? (
              <div
                key={p.clave}
                className="vidrio pointer-events-auto absolute flex -translate-x-1/2 translate-y-6 items-center gap-2 rounded-full px-3 py-1.5 text-[0.8125rem]"
                style={{
                  // A la derecha de lo propuesto, una debajo de otra (no se enciman).
                  left: pos[p.clave]!.x + 230,
                  top: pos[p.clave]!.y - 90 + k * 48,
                }}
              >
                <span className="font-medium">{p.texto.replace(/^El choque, /, "Choque: ")}</span>
                <button type="button" className="boton-compacto boton-principal">
                  ¿Así fue? Sí
                </button>
                <button type="button" className="boton-compacto boton-secundario">
                  Corregir
                </button>
              </div>
            ) : null,
          )}
          <div className="vidrio pointer-events-auto absolute bottom-6 left-6 flex w-[20rem] flex-col gap-1 rounded-panel p-3">
            <span className="text-[0.9375rem] font-semibold">
              {propuesta.propuestos.length} propuestos, {propuesta.faltan.length} por marcar
            </span>
            {propuesta.faltan.map((f) => (
              <span key={f.clave} className="t-nota">
                ○ {f.texto}
              </span>
            ))}
            <button type="button" className="boton-compacto boton-secundario mt-1 self-start">
              Marcar lo que falta
            </button>
          </div>
        </>
      ) : null}

      {guia ? (
        <div className="absolute inset-x-0 top-24 flex justify-center">
          <Guia propuesta={propuesta} onCerrar={() => setGuia(false)} />
        </div>
      ) : null}
    </div>
  );
}
