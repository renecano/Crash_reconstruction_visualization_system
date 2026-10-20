import Link from "next/link";
import { DemoApp, type CasoDemo } from "@/components/demo/demo-app";
import { CabeceraPagina } from "@/components/sitio/cabecera-pagina";
import { Marco } from "@/components/sitio/marco";
import datos from "@/data/demo.json";
import { dict, ruta, type Lang } from "@/i18n";

export default function DemoPagina({ lang }: { lang: Lang }) {
  const t = dict(lang).paginas.demo;
  return (
    <Marco lang={lang}>
      <div className="pagina py-10 md:py-14">
        <CabeceraPagina titulo={t.titulo} intro={t.intro}>
          <p>
            <Link href={ruta(lang, "/cuenta")} className="t-interfaz">
              {t.propio}
            </Link>
          </p>
        </CabeceraPagina>
        <DemoApp casos={datos.casos as CasoDemo[]} metodo={datos.metodo} fuente={datos.fuente} />
      </div>
    </Marco>
  );
}
