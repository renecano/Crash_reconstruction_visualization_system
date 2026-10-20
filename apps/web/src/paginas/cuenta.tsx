import { Suspense } from "react";
import { FlujoApp } from "@/components/flujo/flujo-app";
import { TEXTOS_FLUJO } from "@/components/flujo/textos";
import { CabeceraPagina } from "@/components/sitio/cabecera-pagina";
import { Marco } from "@/components/sitio/marco";
import datos from "@/data/demo.json";
import { textosEn, type Lang } from "@/i18n";

/** Relatos de ejemplo para empezar: tres casos de la demo (Relatos-MX), en su español original. */
const EJEMPLOS: { id: string; en: string }[] = [
  { id: "rmx-d001", en: "Rear-end collision on Paseo Tollocan, on a wet road" },
  { id: "rmx-d003", en: "A motorcycle and a taxi turning on the Periférico service road" },
  { id: "rmx-d005", en: "A woman crossing between cars on Hidalgo" },
];

export default function CuentaPagina({ lang }: { lang: Lang }) {
  const t = textosEn(TEXTOS_FLUJO, lang);
  const ejemplos = EJEMPLOS.map((e) => {
    const caso = datos.casos.find((c) => c.id === e.id)!;
    return { id: e.id, titulo: lang === "es" ? caso.titulo : e.en, texto: caso.texto };
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
