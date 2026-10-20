import { CroquisEditor } from "@/components/croquis-editor";
import { CabeceraPagina } from "@/components/sitio/cabecera-pagina";
import { Marco } from "@/components/sitio/marco";
import { dict, type Lang } from "@/i18n";

export default function CroquisPagina({ lang }: { lang: Lang }) {
  const t = dict(lang).paginas.croquis;
  return (
    <Marco lang={lang}>
      <div className="pagina py-10 md:py-14">
        <CabeceraPagina titulo={t.titulo} intro={t.intro} />
        <CroquisEditor />
      </div>
    </Marco>
  );
}
