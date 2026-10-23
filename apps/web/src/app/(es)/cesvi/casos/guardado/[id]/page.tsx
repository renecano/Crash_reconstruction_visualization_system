/** `/cesvi/casos/guardado/[id]`: un caso guardado en este equipo (ADR 0079). */
import type { Metadata } from "next";
import { CasoGuardadoAbierto } from "@/components/cesvi/caso/caso-guardado-abierto";

export const metadata: Metadata = {
  title: "Caso guardado · Croquis para CESVI",
  robots: { index: false, follow: false },
};

export default async function GuardadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CasoGuardadoAbierto id={id} />;
}
