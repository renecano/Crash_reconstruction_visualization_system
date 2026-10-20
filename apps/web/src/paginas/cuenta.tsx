import { Suspense } from "react";
import { FlujoApp } from "@/components/flujo/flujo-app";
import { TEXTOS_FLUJO } from "@/components/flujo/textos";
import { CabeceraPagina } from "@/components/sitio/cabecera-pagina";
import { Marco } from "@/components/sitio/marco";
import datos from "@/data/demo.json";
import { textosEn, type Lang } from "@/i18n";

/** Relatos de ejemplo para empezar: tres casos de la demo (Relatos-MX), en su español original. */
const EJEMPLOS = ["rmx-d001", "rmx-d003", "rmx-d005"];

export default function CuentaPagina({ lang }: { lang: Lang }) {
  const t = textosEn(TEXTOS_FLUJO, lang);
  const ejemplos = EJEMPLOS.map((id) => {
    const caso = datos.casos.find((c) => c.id === id)!;
    return { id, titulo: lang === "es" ? caso.titulo : caso.titulo_en, texto: caso.texto };
  });
  return (
    <Marco lang={lang}>
      <div className="pagina py-10 md:py-14">
        <CabeceraPagina titulo={t.titulo} />
        <Suspense fallback={null}>
          <FlujoApp ejemplos={ejemplos} />
        </Suspense>
      </div>
    </Marco>
  );
}
