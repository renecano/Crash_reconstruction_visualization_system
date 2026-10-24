"use client";
/**
 * Aparición suave al bajar (portada de CESVI): el bloque entra cuando llega a la vista. Se ve por
 * omisión (sin JavaScript, o con «reducir movimiento», está ahí desde el principio); solo se esconde
 * lo que está debajo de la pantalla al cargar.
 */
import { useEffect, useRef, type ReactNode } from "react";

export function Aparecer({
  children,
  className = "",
  como: Como = "div",
}: {
  children: ReactNode;
  className?: string;
  como?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    // Lo que ya está a la vista no se esconde; lo de abajo espera a llegar.
    if (el.getBoundingClientRect().top < window.innerHeight) return undefined;
    el.classList.add("pc-espera");
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas)
          if (e.isIntersecting) {
            e.target.classList.remove("pc-espera");
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Como ref={ref as never} className={`pc-aparecer ${className}`}>
      {children}
    </Como>
  );
}
