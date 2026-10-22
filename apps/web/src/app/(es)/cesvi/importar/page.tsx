/**
 * `/cesvi/importar`: cargar un reporte de CESVI (R5, ADR 0068). El perito sube un reporte en PDF, Markdown
 * o texto; Croquis arma el expediente y abre «Caso nuevo» para reconstruirlo. Pública, como `/cesvi`.
 */
import type { Metadata } from "next";
import { ImportarDictamen } from "@/components/cesvi/importar-dictamen";

export const metadata: Metadata = {
  title: "Cargar un reporte · Croquis para CESVI",
  description:
    "Del reporte de CESVI en PDF, Markdown o texto al expediente, listo para reconstruir.",
  robots: { index: false, follow: false },
};

export default function ImportarPage() {
  return <ImportarDictamen />;
}
