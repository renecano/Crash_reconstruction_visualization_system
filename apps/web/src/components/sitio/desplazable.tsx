/**
 * Contenedor con desplazamiento horizontal para tablas anchas en el celular. Se puede enfocar con
 * teclado para desplazarlo con las flechas (WCAG 2.1.1, regla `scrollable-region-focusable` de
 * axe) y lleva nombre de región para que el foco anuncie qué contiene.
 */
import type { ReactNode } from "react";

export function Desplazable({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={etiqueta} tabIndex={0} className="overflow-x-auto">
      {children}
    </div>
  );
}
