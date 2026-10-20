/** Marco de cada página: encabezado, contenido (destino de «Saltar al contenido») y pie. */
import type { ReactNode } from "react";
import type { Lang } from "@/i18n";
import { Encabezado } from "./encabezado";
import { Pie } from "./pie";

export function Marco({
  lang,
  children,
  sobreEscena = false,
  pie = true,
  className = "",
}: {
  lang: Lang;
  children: ReactNode;
  /** La página empieza con la escena 3D a pantalla completa (encabezado transparente). */
  sobreEscena?: boolean;
  pie?: boolean;
  className?: string;
}) {
  return (
    <>
      <Encabezado sobreEscena={sobreEscena} />
      <main
        id="contenido"
        tabIndex={-1}
        className={`flex flex-1 flex-col outline-none ${className}`}
      >
        {children}
      </main>
      {pie ? <Pie lang={lang} /> : null}
    </>
  );
}
