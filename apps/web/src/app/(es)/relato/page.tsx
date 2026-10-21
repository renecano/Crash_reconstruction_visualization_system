import { metadatos } from "@/components/sitio/documento";
import RelatoPagina from "@/paginas/relato";

export const metadata = metadatos("es", "relato", "/relato");

export default function Page() {
  return <RelatoPagina lang="es" />;
}
