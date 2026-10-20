import { metadatos } from "@/components/sitio/documento";
import RelatoPagina from "@/paginas/relato";

export const metadata = metadatos("en", "relato", "/relato");

export default function Page() {
  return <RelatoPagina lang="en" />;
}
