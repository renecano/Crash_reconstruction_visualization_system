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
        {/* VisorApp lee la URL, así que se dibuja en el navegador. Mientras, el hueco ocupa lo mismo
            que el selector de escena y el marco del visor, para que el pie no salte (CLS, §11.6). */}
        <Suspense
          fallback={
            <div className="flex flex-col gap-6">
              <div aria-hidden className="t-interfaz invisible flex max-w-md flex-col gap-1">
                <span>&nbsp;</span>
                <span className="campo">&nbsp;</span>
              </div>
              <p className="t-nota grid h-[62vh] min-h-[360px] place-items-center rounded-panel bg-superficie">
                {t.cargando}
              </p>
            </div>
          }
        >
          <VisorApp />
        </Suspense>
      </div>
    </Marco>
  );
}
