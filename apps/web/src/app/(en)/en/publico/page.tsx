import { metadatos } from "@/components/sitio/documento";
import InicioPagina from "@/paginas/inicio";

/** La portada para el público (la de antes de la portada de CESVI, punto 4 de René). */
export const metadata = metadatos("en", "inicio", "/publico");

export default function Page() {
  return <InicioPagina lang="en" />;
}
