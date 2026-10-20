/** Título de una página de herramienta o de contenido, anclado a la línea de carril. */
import type { ReactNode } from "react";

export function CabeceraPagina({
  titulo,
  intro,
  children,
}: {
  titulo: string;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="carril mb-10 flex flex-col gap-3 md:mb-14">
      <h1 className="t-titulo">{titulo}</h1>
      {intro ? <p className="t-cuerpo text-texto-2">{intro}</p> : null}
      {children}
    </header>
  );
}
