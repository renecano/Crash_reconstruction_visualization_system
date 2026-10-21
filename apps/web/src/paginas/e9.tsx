import { E9App } from "@/components/e9/e9-app";
import { CabeceraPagina } from "@/components/sitio/cabecera-pagina";
import { Marco } from "@/components/sitio/marco";
import { dict, type Lang } from "@/i18n";

export default function E9Pagina({ lang }: { lang: Lang }) {
  const t = dict(lang).paginas.e9;
  return (
    <Marco lang={lang}>
      <div className="pagina max-w-4xl py-10 md:py-14">
        <CabeceraPagina titulo={t.titulo} intro={t.intro} />
        <E9App />
      </div>
    </Marco>
  );
}
