import { metadatos } from "@/components/sitio/documento";
import CuentaPagina from "@/paginas/cuenta";

export const metadata = metadatos("es", "cuenta", "/cuenta");

export default function Page() {
  return <CuentaPagina lang="es" />;
}
