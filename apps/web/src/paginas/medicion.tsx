import { Suspense } from "react";
import { MedicionApp } from "@/components/medicion/medicion-app";
import { CabeceraPagina } from "@/components/sitio/cabecera-pagina";
import { Marco } from "@/components/sitio/marco";
import { textos, textosEn, type Lang } from "@/i18n";

const T = textos(
  {
    titulo: "Medir el rendimiento",
    intro:
      "E6 en este navegador: el visor recorre las escenas canónicas a pantalla completa con la cámara cinematográfica y mide los cuadros por segundo con el mismo método que eval/e6_performance.mjs. Sirve para medir alta y ultra en la computadora de demo sin instalar nada.",
  },
  {
    titulo: "Measure performance",
    intro:
      "E6 in this browser: the viewer goes through the canonical scenes in full screen with the cinematic camera and measures frames per second with the same method as eval/e6_performance.mjs. It is for measuring high and ultra on the demo computer without installing anything.",
  },
);

export default function MedicionPagina({ lang }: { lang: Lang }) {
  const t = textosEn(T, lang);
  return (
    <Marco lang={lang}>
      <div className="pagina py-10 md:py-14">
        <CabeceraPagina titulo={t.titulo} intro={t.intro} />
        {/* Lee la configuración de la URL: se dibuja en el navegador. */}
        <Suspense>
          <MedicionApp />
        </Suspense>
      </div>
    </Marco>
  );
}
