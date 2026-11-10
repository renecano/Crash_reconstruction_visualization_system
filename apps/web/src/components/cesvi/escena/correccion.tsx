"use client";
/**
 * W4, «Corregir después» (René, 2026-11-09; PLAN-CESVI §3.4): con la escena lista, el perito toca
 * algo ya colocado para corregirlo, o agrega un objeto del lugar desde la paleta. Aquí van el panel
 * con la paleta y la barra de controles grandes de lo seleccionado; la lógica vive en
 * `@croquis/cesvi` (objetos) y en `@/lib/escena-facil` (lo demás).
 */
import { TIPOS_OBJETO, type TipoObjeto } from "@croquis/cesvi";

/** La silueta de cada objeto de la paleta, vista desde arriba (24 × 24). */
function Silueta({ tipo }: { tipo: TipoObjeto }) {
  const trazo = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
  } as const;
  switch (tipo) {
    case "poste":
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <path d="M3 12h4M17 12h4" {...trazo} />
        </svg>
      );
    case "muro":
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <rect x="2" y="9" width="20" height="6" rx="1" fill="currentColor" />
        </svg>
      );
    case "arbol":
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.35" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        </svg>
      );
    case "barrera":
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path d="M2 10h20M2 14h20" {...trazo} />
          <path d="M5 8v8M12 8v8M19 8v8" {...trazo} />
        </svg>
      );
    case "guarnicion":
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <rect x="2" y="10" width="20" height="4" fill="currentColor" />
          <path d="M2 18h20" {...trazo} opacity="0.5" />
        </svg>
      );
    case "senal":
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path d="M12 4l6 6-6 6-6-6z" fill="currentColor" opacity="0.35" />
          <path d="M12 16v5" {...trazo} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <rect x="7" y="2" width="10" height="20" rx="3" fill="currentColor" />
        </svg>
      );
  }
}

/** El panel para corregir: la pista de qué se puede tocar y la paleta de objetos del lugar. */
export function PanelCorregir({
  poniendo,
  onElegir,
  onListo,
}: {
  poniendo: TipoObjeto | null;
  onElegir: (t: TipoObjeto | null) => void;
  onListo: () => void;
}) {
  return (
    <section
      className="escena-hoja pointer-events-auto flex max-h-[calc(100dvh-250px)] w-[min(420px,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto p-5"
      aria-labelledby="corregir-titulo"
      data-testid="panel-corregir"
    >
      <h2 id="corregir-titulo" className="escena-titulo">
        Corregir la escena
      </h2>
      <p className="t-cuerpo text-texto-2">
        Toca un coche, una marca o un objeto para moverlo, girarlo o quitarlo. O agrega algo que
        está en el lugar.
      </p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Agregar un objeto del lugar">
        {TIPOS_OBJETO.map((t) => (
          <button
            key={t.tipo}
            type="button"
            className="escena-opcion flex min-h-12 items-center gap-2 rounded-xl px-3 text-left text-[0.95rem]"
            aria-pressed={poniendo === t.tipo}
            onClick={() => onElegir(poniendo === t.tipo ? null : t.tipo)}
            data-testid={`paleta-${t.tipo}`}
          >
            <Silueta tipo={t.tipo} />
            <span className="font-semibold">{t.nombre}</span>
          </button>
        ))}
      </div>
      {poniendo ? (
        <p className="t-nota" role="status" data-testid="paleta-pista">
          Toca el mapa donde está{" "}
          {TIPOS_OBJETO.find((t) => t.tipo === poniendo)!.nombre.toLowerCase()}.
        </p>
      ) : null}
      <button
        type="button"
        className="boton-principal escena-boton"
        onClick={onListo}
        data-testid="corregir-listo"
      >
        Listo, ver el resumen
      </button>
    </section>
  );
}

export interface AccionSeleccion {
  id: string;
  texto: string;
  hacer: () => void;
  peligro?: boolean;
}

/** La barra de controles grandes de lo seleccionado: su nombre y lo que se le puede hacer. */
export function BarraSeleccion({
  nombre,
  acciones,
  onListo,
}: {
  nombre: string;
  acciones: readonly AccionSeleccion[];
  onListo: () => void;
}) {
  return (
    <div
      className="escena-barra-seleccion pointer-events-auto"
      role="toolbar"
      aria-label={`Corregir: ${nombre}`}
      data-testid="seleccion"
    >
      <span className="mr-1 font-semibold" data-testid="seleccion-nombre">
        {nombre}
      </span>
      {acciones.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`${a.peligro ? "boton-secundario text-[var(--peligro,#B91C1C)]" : "boton-secundario"} escena-boton`}
          onClick={a.hacer}
          data-testid={`sel-${a.id}`}
        >
          {a.texto}
        </button>
      ))}
      <button
        type="button"
        className="boton-principal escena-boton"
        onClick={onListo}
        data-testid="sel-listo"
      >
        Listo
      </button>
    </div>
  );
}
