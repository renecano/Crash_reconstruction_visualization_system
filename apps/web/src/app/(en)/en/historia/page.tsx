import { metadatos } from "@/components/sitio/documento";
import HistoriaPagina from "@/paginas/historia";

export const metadata = metadatos("en", "historia", "/historia");

export default function Page() {
  return <HistoriaPagina lang="en" />;
}
