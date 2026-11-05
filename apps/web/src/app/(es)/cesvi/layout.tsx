/**
 * El diseño «Laboratorio» en todo /cesvi (prompt del rediseño, René 2026-11-04): sus colores de día
 * y noche (`data-diseno` en `styles/sistema.css`) y sus tipografías. El tema lo siguen poniendo
 * el marco y el recorrido con `data-tema`.
 */
import type { ReactNode } from "react";
import { FUENTES_LABORATORIO } from "@/components/cesvi/fuentes-laboratorio";

export default function LayoutCesvi({ children }: { children: ReactNode }) {
  return (
    <div data-diseno="laboratorio" className={FUENTES_LABORATORIO}>
      {children}
    </div>
  );
}
