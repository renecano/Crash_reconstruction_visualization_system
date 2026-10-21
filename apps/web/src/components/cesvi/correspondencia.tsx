"use client";
/**
 * Los criterios de correspondencia de CESVI por vehículo (Hito 3, ADR 0051): el perito marca cada
 * uno y escribe una nota. Va en el panel de detalle del paso «Los daños» del recorrido (ADR 0052).
 */
import {
  CRITERIOS,
  type ClaveCriterio,
  type CriterioMarcado,
  type MarcaCriterio,
} from "@croquis/cesvi";
import { useId } from "react";

export function Criterios({
  letra,
  nombre,
  valores,
  onCambio,
}: {
  letra: "A" | "B";
  /** «A · Silverado». */
  nombre?: string;
  valores: Record<ClaveCriterio, CriterioMarcado>;
  onCambio: (clave: ClaveCriterio, v: CriterioMarcado) => void;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend
        className={`t-subtitulo mb-2 ${letra === "A" ? "text-vehiculo-a" : "text-vehiculo-b"}`}
      >
        {nombre ?? `Vehículo ${letra}`}
      </legend>
      {CRITERIOS.map((c) => (
        <div key={c.clave} className="flex flex-col gap-1 border-b border-linea pb-3">
          <label htmlFor={`${id}-${c.clave}`} className="t-interfaz">
            {c.nombre}
            <span className="t-nota block text-texto-2">{c.descripcion}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <select
              id={`${id}-${c.clave}`}
              className="campo w-56"
              value={valores[c.clave].marca ?? ""}
              data-testid={`criterio-${letra}-${c.clave}`}
              onChange={(e) =>
                onCambio(c.clave, {
                  ...valores[c.clave],
                  marca: (e.target.value || null) as MarcaCriterio,
                })
              }
            >
              <option value="">Sin marcar</option>
              <option value="corresponde">Corresponde</option>
              <option value="no_corresponde">No corresponde</option>
              <option value="no_determinable">No se puede determinar</option>
            </select>
            <input
              className="campo min-w-0 flex-1"
              placeholder="Nota del perito"
              aria-label={`Nota: ${c.nombre}, vehículo ${letra}`}
              value={valores[c.clave].nota}
              onChange={(e) => onCambio(c.clave, { ...valores[c.clave], nota: e.target.value })}
            />
          </div>
        </div>
      ))}
    </fieldset>
  );
}
