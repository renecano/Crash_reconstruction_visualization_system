import { Suspense } from "react";
import { CabeceraPagina } from "@/components/sitio/cabecera-pagina";
import { Marco } from "@/components/sitio/marco";
import { VisorApp } from "@/components/visor/visor-app";
import { dict, type Lang } from "@/i18n";

export default function VisorPagina({ lang }: { lang: Lang }) {
  const t = dict(lang).paginas.visor;
  return (
    <Marco lang={lang}>
      <div className="pagina py-10 md:py-14">
        <CabeceraPagina titulo={t.titulo} intro={t.intro} />
        <Suspense fallback={<p className="t-interfaz text-texto-2">{t.cargando}</p>}>
          <VisorApp />
        </Suspense>
      </div>
    </Marco>
  );
}
