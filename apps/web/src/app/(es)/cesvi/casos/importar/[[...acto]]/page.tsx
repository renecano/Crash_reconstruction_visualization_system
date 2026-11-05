/** `/cesvi/casos/importar`: cargar un reporte de CESVI y abrirlo en el recorrido (R5, ADR 0079). */
import type { Metadata } from "next";
import { RecorridoCaso } from "@/components/cesvi/caso/recorrido-caso";
import { ACTOS, actoDeSegmentos } from "@/lib/actos";
import { casoImportado } from "@/lib/casos";

export const metadata: Metadata = {
  title: "Cargar un reporte · Croquis para CESVI",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return [{ acto: [] }, ...ACTOS.map((a) => ({ acto: [a.clave] }))];
}

/** Con `[[...acto]]`: `/<acto>` abre en ese acto si ya se puede (prompt §4 del Laboratorio). */
export default async function ImportarPage({ params }: { params: Promise<{ acto?: string[] }> }) {
  const { acto } = await params;
  return <RecorridoCaso inicial={casoImportado()} actoInicial={actoDeSegmentos(acto)} />;
}
