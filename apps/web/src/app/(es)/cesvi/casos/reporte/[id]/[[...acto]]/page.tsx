/**
 * `/cesvi/casos/reporte/[id]`: un reporte de la prueba congelada de E-R4 abierto en el recorrido,
 * con el paso «Croquis contra el reporte de CESVI» (ADR 0079). Las páginas se generan al construir.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecorridoCaso } from "@/components/cesvi/caso/recorrido-caso";
import { actoDeSegmentos } from "@/lib/actos";
import { casoDeReporte, nombreCaso } from "@/lib/casos";
import { casoPorId, PAGINA } from "@/lib/reproduccion-dictamenes";

/** Cada reporte en su ruta base; las de cada acto se generan al pedirlas. */
export function generateStaticParams() {
  return PAGINA.casos.map((c) => ({ id: c.id, acto: [] }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; acto?: string[] }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `${nombreCaso(id)} · Croquis para CESVI`,
    robots: { index: false, follow: false },
  };
}

export default async function ReporteCasoPage({
  params,
}: {
  params: Promise<{ id: string; acto?: string[] }>;
}) {
  const { id, acto } = await params;
  const c = casoPorId(id);
  if (!c) notFound();
  return <RecorridoCaso inicial={casoDeReporte(c)} actoInicial={actoDeSegmentos(acto)} />;
}
