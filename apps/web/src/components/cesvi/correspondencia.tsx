"use client";
/**
 * Los criterios de correspondencia de CESVI de un vehículo (Hito 3, ADR 0051): el perito marca cada
 * uno con tres opciones y puede escribir una nota. Va en los daños del acto de Análisis (ADR 0052).
 */
import {
  CRITERIOS,
  type ClaveCriterio,
  type CriterioMarcado,
  type MarcaCriterio,
} from "@croquis/cesvi";

const OPCIONES: readonly { marca: NonNullable<MarcaCriterio>; texto: string }[] = [
  { marca: "corresponde", texto: "Corresponde" },
  { marca: "no_corresponde", texto: "No corresponde" },
  { marca: "no_determinable", texto: "No se puede saber" },
];

export function Criterios({
  letra,
  valores,
  onCambio,
}: {
  letra: "A" | "B";
  valores: Record<ClaveCriterio, CriterioMarcado>;
  onCambio: (clave: ClaveCriterio, v: CriterioMarcado) => void;
}) {
  return (
    <div className="flex flex-col divide-y divide-[var(--linea-suave)] border-t border-linea-suave">
      {CRITERIOS.map((c) => {
        const v = valores[c.clave];
        return (
          <div key={c.clave} className="flex flex-col gap-2 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 basis-56">
                <span className="font-semibold">{c.nombre}</span>
                <span className="t-nota block">{c.descripcion}</span>
              </div>
              <div
                className="segmentado shrink-0"
                role="group"
                aria-label={`${c.nombre}, vehículo ${letra}`}
                data-testid={`criterio-${letra}-${c.clave}`}
              >
                {OPCIONES.map((o) => (
                  <button
                    key={o.marca}
                    type="button"
                    className="px-3 whitespace-nowrap"
                    aria-pressed={v.marca === o.marca}
                    // Volver a tocar la opción marcada la quita.
                    onClick={() =>
                      onCambio(c.clave, { ...v, marca: v.marca === o.marca ? null : o.marca })
                    }
                    data-marca={o.marca}
                  >
                    {o.texto}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="campo min-w-0"
              placeholder="Nota del perito (opcional)"
              aria-label={`Nota: ${c.nombre}, vehículo ${letra}`}
              value={v.nota}
              onChange={(e) => onCambio(c.clave, { ...v, nota: e.target.value })}
            />
          </div>
        );
      })}
    </div>
  );
}
