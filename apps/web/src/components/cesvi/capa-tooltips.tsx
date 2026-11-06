"use client";
/**
 * Los tooltips de /cesvi (rediseño «Laboratorio», prompt §9): invertidos, en 170 ms y 8 px arriba
 * del objeto. Cualquier elemento, de HTML o de SVG, lleva su texto en `data-tip`; esta capa los
 * muestra al pasar el puntero y con el foco de teclado, sin un componente por cada objeto.
 */
import { useEffect, useRef, useState } from "react";
import { posicionTooltip } from "@/lib/movimiento";

export function CapaTooltips() {
  const [texto, setTexto] = useState<string | null>(null);
  const [objeto, setObjeto] = useState<Element | null>(null);
  const nodo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const conTip = (t: EventTarget | null) =>
      t instanceof Element ? t.closest("[data-tip]") : null;
    const abre = (e: Event) => {
      const el = conTip(e.target);
      if (!el) return;
      setObjeto(el);
      setTexto(el.getAttribute("data-tip"));
    };
    const cierra = (e: Event) => {
      const el = conTip(e.target);
      if (!el) return;
      // Sigue adentro del mismo objeto: no se cierra.
      const hacia = (e as PointerEvent | FocusEvent).relatedTarget;
      if (hacia instanceof Node && el.contains(hacia)) return;
      setTexto(null);
      setObjeto(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTexto(null);
    };
    document.addEventListener("pointerover", abre);
    document.addEventListener("pointerout", cierra);
    document.addEventListener("focusin", abre);
    document.addEventListener("focusout", cierra);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerover", abre);
      document.removeEventListener("pointerout", cierra);
      document.removeEventListener("focusin", abre);
      document.removeEventListener("focusout", cierra);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  // Se coloca al medir su tamaño real, ya con el texto.
  useEffect(() => {
    const n = nodo.current;
    if (!n || !objeto || !texto) return;
    const c = posicionTooltip(objeto.getBoundingClientRect(), n.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    n.style.left = `${c.left}px`;
    n.style.top = `${c.top}px`;
  }, [objeto, texto]);

  if (!texto) return null;
  return (
    <div ref={nodo} role="tooltip" className="tooltip-lab" data-testid="tooltip">
      {texto}
    </div>
  );
}
