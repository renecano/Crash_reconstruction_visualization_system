/**
 * `/cesvi/casos/reporte/[id]`: un reporte de la prueba congelada de E-R4 abierto en el recorrido,
 * con el paso «Croquis contra el reporte de CESVI» (ADR 0079).
 *
 * Cada reporte se genera la primera vez que alguien lo abre y desde ahí queda en la caché (René,
 * 2026-11-17): generar los 205 al construir metía unos 234 MB de páginas en cada despliegue de Vercel
 * (`tools/vercel/peso-salida.mjs`), y el plan Hobby se llenó. Lo que ve el perito es lo mismo.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecorridoCaso } from "@/components/cesvi/caso/recorrido-caso";
import { actoDeSegmentos } from "@/lib/actos";
import { casoDeReporte, nombreCaso } from "@/lib/casos";
import { casoPorId } from "@/lib/reproduccion-dictamenes";

/** Ninguno se genera al construir: cada reporte, al abrirlo por primera vez (y queda en la caché). */
export function generateStaticParams(): { id: string; acto: string[] }[] {
  return [];
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
