import { Marco } from "@/components/sitio/marco";
import type { Lang } from "@/i18n";

// Provisional: la portada de lanzamiento se construye en el paso 3 de F11a.
export default function InicioPagina({ lang }: { lang: Lang }) {
  return (
    <Marco lang={lang}>
      <div className="pagina py-16" />
    </Marco>
  );
}
