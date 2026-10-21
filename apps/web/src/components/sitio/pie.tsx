/** Pie del sitio: lo que no es Croquis, herramientas, proyecto y atribuciones. */
import Link from "next/link";
import { dict, ruta, type Lang } from "@/i18n";
import { Logotipo } from "./logo";

const REPO = "https://github.com/renecano/Crash_reconstruction_visualization_system";

export function Pie({ lang }: { lang: Lang }) {
  const t = dict(lang).sitio;
  const r = (p: string) => ruta(lang, p);
  return (
    <footer
      className="pagina relative z-20 mt-auto border-t border-linea bg-fondo pt-12 pb-16"
      data-testid="pie"
    >
      <div className="grid gap-10 md:grid-cols-12">
        <div className="flex flex-col gap-4 md:col-span-5">
          <Logotipo ancho={160} alt="Croquis" />
          <p className="t-nota max-w-[46ch]">{t.pie.leyenda}</p>
        </div>
        <nav aria-label={t.pie.herramientas} className="md:col-span-2">
          <h2 className="t-interfaz mb-3 text-texto">{t.pie.herramientas}</h2>
          <ul className="t-nota flex flex-col gap-1 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
            <li>
              <Link href={r("/visor")}>{t.pie.visor}</Link>
            </li>
            <li>
              <Link href={r("/croquis")}>{t.pie.croquis}</Link>
            </li>
            <li>
              <Link href={r("/medicion")}>{t.pie.medicion}</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={t.pie.proyecto} className="md:col-span-2">
          <h2 className="t-interfaz mb-3 text-texto">{t.pie.proyecto}</h2>
          <ul className="t-nota flex flex-col gap-1 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
            <li>
              <Link href={r("/historia")}>{t.nav.historia}</Link>
            </li>
            <li>
              <Link href={r("/recorrido")}>{t.nav.mide}</Link>
            </li>
            <li>
              <a href={REPO}>{t.pie.codigo}</a>
            </li>
          </ul>
        </nav>
        <div className="md:col-span-3">
          <h2 className="t-interfaz mb-3 text-texto">{t.pie.fuentes}</h2>
          <ul className="t-nota flex flex-col gap-1 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
            <li>{t.pie.osm}</li>
            <li>{t.pie.datos}</li>
            <li>{t.pie.fuente}</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
