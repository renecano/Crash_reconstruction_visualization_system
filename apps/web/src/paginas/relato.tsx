import { RelatoApp } from "@/components/relato/relato-app";
import { CabeceraPagina } from "@/components/sitio/cabecera-pagina";
import { Marco } from "@/components/sitio/marco";
import { dict, type Lang } from "@/i18n";

export default function RelatoPagina({ lang }: { lang: Lang }) {
  const t = dict(lang).paginas.relato;
  return (
    <Marco lang={lang}>
      <div className="pagina py-10 md:py-14">
        <CabeceraPagina titulo={t.titulo} intro={t.intro} />
        <RelatoApp />
      </div>
    </Marco>
  );
}
