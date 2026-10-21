import { metadatos } from "@/components/sitio/documento";
import E9Pagina from "@/paginas/e9";

export const metadata = metadatos("es", "e9", "/e9", { robots: { index: false, follow: false } });

export default function Page() {
  return <E9Pagina lang="es" />;
}
