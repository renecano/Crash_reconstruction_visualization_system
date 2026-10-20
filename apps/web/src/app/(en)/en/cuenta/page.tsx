import { metadatos } from "@/components/sitio/documento";
import CuentaPagina from "@/paginas/cuenta";

export const metadata = metadatos("en", "cuenta", "/cuenta");

export default function Page() {
  return <CuentaPagina lang="en" />;
}
