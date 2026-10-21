import { metadatos } from "@/components/sitio/documento";
import HistoriaPagina from "@/paginas/historia";

export const metadata = metadatos("es", "historia", "/historia");

export default function Page() {
  return <HistoriaPagina lang="es" />;
}
