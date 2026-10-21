/**
 * `/cesvi`: el prototipo para los peritos de CESVI (docs/cesvi/PROTOTIPO.md). Reproduce el dictamen
 * A2010930 con su método y sus números. Va con protección de acceso (`src/proxy.ts`) porque es un
 * caso real, y sin placas, VIN ni nombres.
 */
import type { Metadata } from "next";
import { caso, CASO_INICIAL } from "@croquis/cesvi";
import { CasoInteractivo } from "@/components/cesvi/caso-interactivo";
import { Expediente } from "@/components/cesvi/expediente";
import { Reproduccion } from "@/components/cesvi/reproduccion";
import { Logotipo } from "@/components/sitio/logo";

export const metadata: Metadata = {
  title: `Dictamen ${CASO_INICIAL} · Croquis para CESVI`,
  description: "Reproducción de un dictamen de CESVI México con su método y sus números.",
  robots: { index: false, follow: false },
};

export default function CesviPage() {
  const c = caso(CASO_INICIAL);
  return (
    <>
      <header className="pagina flex flex-wrap items-center justify-between gap-4 border-b border-linea py-4">
        <Logotipo ancho={148} />
        <p className="t-nota text-texto-2">Prototipo para CESVI México</p>
      </header>
      <main
        id="contenido"
        tabIndex={-1}
        className="pagina flex flex-col gap-16 py-10 outline-none md:py-14"
      >
        <header className="carril flex flex-col gap-3">
          <p className="t-cota text-texto-2">
            {c.aseguradora} · siniestro {c.id}
          </p>
          <h1 className="t-titulo">
            Dictamen de {c.modalidad_dictaminada}: ¿se sostiene la reversa declarada?
          </h1>
          <p className="t-cuerpo max-w-[72ch] text-texto-2">
            Croquis reproduce el dictamen con el método y los datos de CESVI, muestra cada fórmula
            con sus valores y dice dónde difiere de los números impresos. El perito valida, corrige
            y firma.
          </p>
        </header>
        <Expediente caso={c} />
        <CasoInteractivo caso={c} />
        <Reproduccion caso={c} />
      </main>
      <footer className="pagina border-t border-linea py-6">
        <p className="t-nota text-texto-2">
          Elaborado con apoyo de Croquis. El dictamen es responsabilidad del perito que lo firma.
        </p>
      </footer>
    </>
  );
}
