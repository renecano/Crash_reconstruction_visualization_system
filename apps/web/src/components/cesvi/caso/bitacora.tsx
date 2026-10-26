/**
 * La bitácora de los agentes de la pizarra (R12b, ADR 0093): quién escribió qué, quién le pidió
 * qué a quién, en orden. La misma va en la trazabilidad del dictamen.
 */
import { mensajeEnPalabras, type MensajeBitacora } from "@croquis/cesvi";

export function BitacoraAgentes({ bitacora }: { bitacora: readonly MensajeBitacora[] }) {
  if (!bitacora.length) return null;
  const pedidos = bitacora.filter((m) => m.tipo === "pide" || m.tipo === "rechaza").length;
  return (
    <details className="hundido p-4" data-testid="bitacora-agentes">
      <summary className="t-interfaz cursor-pointer font-medium">
        Bitácora de los agentes ({bitacora.length} mensajes
        {pedidos ? `, ${pedidos} entre agentes` : ""})
      </summary>
      <ol className="t-nota mt-3 flex flex-col gap-1">
        {bitacora.map((m) => (
          <li key={m.n} data-de={m.de} data-tipo={m.tipo}>
            {mensajeEnPalabras(m)}
          </li>
        ))}
      </ol>
    </details>
  );
}
