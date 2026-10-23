/** `/cesvi/casos/importar`: cargar un reporte de CESVI y abrirlo en el recorrido (R5, ADR 0079). */
import type { Metadata } from "next";
import { RecorridoCaso } from "@/components/cesvi/caso/recorrido-caso";
import { casoImportado } from "@/lib/casos";

export const metadata: Metadata = {
  title: "Cargar un reporte · Croquis para CESVI",
  robots: { index: false, follow: false },
};

export default function ImportarPage() {
  return <RecorridoCaso inicial={casoImportado()} />;
}
