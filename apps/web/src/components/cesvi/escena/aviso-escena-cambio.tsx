"use client";
/**
 * El aviso de que la escena cambió después de reconstruir (René, 2026-11-17): lo dice y ofrece
 * reconstruir de nuevo, sin borrar nada más. Mientras tanto se siguen viendo los números de antes,
 * con este aviso encima. Va en «La escena» y en «La reconstrucción».
 */
import { AVISO_ESCENA_CAMBIO, type EstadoFrenteAEscena } from "@/lib/seleccion-escena";

export function AvisoEscenaCambio({
  estado,
  onReconstruir,
  error = null,
  className = "",
}: {
  estado: EstadoFrenteAEscena;
  onReconstruir: () => void;
  /** Si la última vez no se pudo reconstruir, por qué. */
  error?: string | null;
  className?: string;
}) {
  if (estado !== "vieja" && estado !== "calculando") return null;
  const calculando = estado === "calculando";
  return (
    <div
      className={`escena-mensaje flex-wrap ${className}`}
      data-tipo="alerta"
      role="status"
      aria-busy={calculando}
      data-testid="aviso-escena-cambio"
      data-estado={estado}
    >
      {/* Sin el círculo «!» de los mensajes: en el tema oscuro su blanco sobre ámbar no llega a AA. */}
      <span className="min-w-0 flex-1 text-[0.95rem] font-medium">
        {calculando ? "Reconstruyendo con la escena como está ahora…" : AVISO_ESCENA_CAMBIO}
        {error && !calculando ? (
          <span className="mt-1 block t-nota" data-testid="aviso-escena-error">
            {error}
          </span>
        ) : null}
      </span>
      {calculando ? null : (
        <button
          type="button"
          className="boton-principal escena-boton"
          onClick={onReconstruir}
          data-testid="reconstruir-de-nuevo"
        >
          Reconstruir de nuevo
        </button>
      )}
    </div>
  );
}
