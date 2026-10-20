import { Marco } from "@/components/sitio/marco";
import type { Lang } from "@/i18n";

// Provisional: la página de medición se construye en el paso 4 de F11a.
export default function MedicionPagina({ lang }: { lang: Lang }) {
  return (
    <Marco lang={lang}>
      <div className="pagina py-16" />
    </Marco>
  );
}
