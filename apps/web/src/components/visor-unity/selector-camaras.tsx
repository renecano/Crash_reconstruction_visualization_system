"use client";
/**
 * El selector «Cámara» del 3D (ronda 2, A6; diseño final): las generales a un clic, y un botón por
 * vehículo que abre sus vistas (detrás, lo que veía su conductor, su daño), a dos clics. Las de las
 * personas que van a pie, en bici o en moto, a un clic. Con los nombres del perito y con teclado:
 * Esc cierra el menú y regresa el foco a su botón.
 */
import { useEffect, useRef, useState } from "react";
import type { CamaraDelCaso } from "@/lib/visor-unity/camaras";
import { EnRanura, useMarco } from "./marco-vista";

/** El nombre corto de una general: «Alrededor de la escena (se puede girar)» → «Alrededor». */
export function nombreCorto(c: CamaraDelCaso): string {
  const sin = c.nombre.replace(/\s*\(.*\)$/, "");
  return sin === "Alrededor de la escena" ? "Alrededor" : sin;
}

/** Lo que dice cada vista dentro del menú de su vehículo: sin repetir el nombre del vehículo. */
export function nombreEnMenu(c: CamaraDelCaso): string {
  if (c.nombre.startsWith("Detrás de")) return "Detrás, siguiéndolo";
  if (c.nombre.startsWith("Lo que veía")) return "Lo que veía su conductor";
  if (c.nombre.startsWith("El daño")) return "Su daño, en el impacto";
  return c.nombre;
}

export function SelectorCamaras({
  camaras,
  elegida,
  onElegir,
}: {
  camaras: readonly CamaraDelCaso[];
  /** El modo de la cámara que se ve. */
  elegida: string | null;
  onElegir: (c: CamaraDelCaso) => void;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(null);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierto(null);
      caja.current?.querySelector<HTMLElement>(`[data-vehiculo="${abierto}"]`)?.focus();
    };
    window.addEventListener("pointerdown", fuera);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("pointerdown", fuera);
      window.removeEventListener("keydown", tecla);
    };
  }, [abierto]);
  const generales = camaras.filter((c) => c.grupo === "general");
  const personas = camaras.filter((c) => c.grupo === "persona");
  const vehiculos = [
    ...new Map(
      camaras.filter((c) => c.grupo === "vehiculo").map((c) => [c.vehiculo ?? c.grupoNombre, c]),
    ).values(),
  ].map((c) => ({
    id: c.vehiculo ?? c.grupoNombre,
    nombre: c.grupoNombre,
    vistas: camaras.filter((x) => x.grupo === "vehiculo" && x.vehiculo === c.vehiculo),
  }));
  const { enMarco } = useMarco();
  const selector = (
    <div
      ref={caja}
      className={
        enMarco
          ? "selector-camaras flex flex-wrap items-center gap-1"
          : "selector-camaras vidrio absolute top-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-control px-2 py-1.5"
      }
      role="group"
      aria-label="Cámara"
      data-testid="selector-camara"
    >
      <span className="t-rotulo px-1.5">Cámara</span>
      {generales.map((c) => (
        <button
          key={c.modo}
          type="button"
          className="sc-boton"
          aria-pressed={elegida === c.modo}
          title={c.nombre}
          onClick={() => onElegir(c)}
          data-testid={`camara-${c.modo}`}
        >
          {nombreCorto(c)}
        </button>
      ))}
      {vehiculos.length ? <span className="sc-separador" aria-hidden="true" /> : null}
      {vehiculos.map((v) => {
        const suya = v.vistas.find((x) => x.modo === elegida);
        return (
          <div key={v.id} className="relative">
            <button
              type="button"
              className="sc-boton sc-vehiculo"
              aria-haspopup="menu"
              aria-expanded={abierto === v.id}
              aria-pressed={Boolean(suya)}
              data-vehiculo={v.id}
              onClick={() => setAbierto(abierto === v.id ? null : v.id)}
              data-testid={`camaras-de-${v.id}`}
            >
              {v.nombre}
              <span aria-hidden="true">{abierto === v.id ? "▴" : "▾"}</span>
            </button>
            {abierto === v.id ? (
              <div className="sc-menu" role="menu" aria-label={`Cámaras de ${v.nombre}`}>
                {v.vistas.map((c, k) => (
                  <button
                    key={c.modo}
                    type="button"
                    role="menuitemradio"
                    aria-checked={elegida === c.modo}
                    autoFocus={k === 0}
                    title={c.nombre}
                    onClick={() => {
                      onElegir(c);
                      setAbierto(null);
                    }}
                    data-testid={`camara-${c.modo}`}
                  >
                    {nombreEnMenu(c)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      {personas.length ? <span className="sc-separador" aria-hidden="true" /> : null}
      {personas.map((c) => (
        <button
          key={c.modo}
          type="button"
          className="sc-boton"
          aria-pressed={elegida === c.modo}
          title={`Siguiendo a: ${c.nombre}`}
          onClick={() => onElegir(c)}
          data-testid={`camara-${c.modo}`}
        >
          {c.nombre}
        </button>
      ))}
    </div>
  );
  return enMarco ? <EnRanura ranura="izquierda">{selector}</EnRanura> : selector;
}
