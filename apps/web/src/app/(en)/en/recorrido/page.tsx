import { metadatos } from "@/components/sitio/documento";
import RecorridoPagina from "@/paginas/recorrido";

export const metadata = metadatos("en", "recorrido", "/recorrido");

export default function Page() {
  return <RecorridoPagina lang="en" />;
}
