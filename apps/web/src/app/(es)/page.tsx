import { metadatos } from "@/components/sitio/documento";
import InicioPagina from "@/paginas/inicio";

export const metadata = metadatos("es", "inicio", "/");

export default function Page() {
  return <InicioPagina lang="es" />;
}
