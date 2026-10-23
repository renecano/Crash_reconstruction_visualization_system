/**
 * `/cesvi/casos/a2010930`: el caso de ejemplo de AXA (antes `/cesvi`; ADR 0079), en el mismo
 * recorrido que cualquier caso (V2-4, ADR 0080). Reproduce el reporte A2010930 con su método y sus
 * números, sin placas, VIN ni nombres. Es pública desde el 2026-10-21, a pedido de René (ADR 0049).
 */
import type { Metadata } from "next";
import { CASO_INICIAL } from "@croquis/cesvi";
import { RecorridoCaso } from "@/components/cesvi/caso/recorrido-caso";
import { casoAxa } from "@/lib/caso-axa";

export const metadata: Metadata = {
  title: `Caso ${CASO_INICIAL} · Croquis para CESVI`,
  description: "Reproducción de un reporte de CESVI México con su método y sus números.",
  robots: { index: false, follow: false },
};

export default function AxaPage() {
  return <RecorridoCaso inicial={casoAxa()} />;
}
