/** `/cesvi/casos/nuevo`: un caso nuevo en el recorrido (ADR 0079). */
import type { Metadata } from "next";
import { RecorridoCaso } from "@/components/cesvi/caso/recorrido-caso";
import { casoNuevo } from "@/lib/casos";

export const metadata: Metadata = {
  title: "Caso nuevo · Croquis para CESVI",
  robots: { index: false, follow: false },
};

export default function CasoNuevoPage() {
  return <RecorridoCaso inicial={casoNuevo()} />;
}
