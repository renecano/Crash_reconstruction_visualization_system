import { metadatos } from "@/components/sitio/documento";
import RecorridoPagina from "@/paginas/recorrido";

export const metadata = metadatos("es", "recorrido", "/recorrido");

export default function Page() {
  return <RecorridoPagina lang="es" />;
}
