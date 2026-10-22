/**
 * `/cesvi/reproduccion/[id]`: un dictamen de la prueba congelada, con lo que concluyó CESVI y lo que
 * reconstruyó Croquis lado a lado, en 2D y 3D (R4, ADR 0067). Las páginas se generan al construir.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReproduccionDictamen } from "@/components/cesvi/reproduccion-dictamen";
import { casoPorId, nombreCaso, PAGINA } from "@/lib/reproduccion-dictamenes";

export function generateStaticParams() {
  return PAGINA.casos.map((c) => ({ id: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `${nombreCaso(id)} · Reproducción de reportes`,
    robots: { index: false, follow: false },
  };
}

export default async function ReproduccionCasoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caso = casoPorId(id);
  if (!caso) notFound();
  return <ReproduccionDictamen caso={caso} />;
}
