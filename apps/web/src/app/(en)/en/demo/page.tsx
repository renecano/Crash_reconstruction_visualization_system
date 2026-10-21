import { metadatos } from "@/components/sitio/documento";
import DemoPagina from "@/paginas/demo";

export const metadata = metadatos("en", "demo", "/demo");

export default function Page() {
  return <DemoPagina lang="en" />;
}
