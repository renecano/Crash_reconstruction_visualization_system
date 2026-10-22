/**
 * `/cesvi`: el prototipo para los peritos de CESVI (docs/cesvi/PROTOTIPO.md), como recorrido guiado
 * de ocho pasos (ADR 0052). Reproduce el dictamen A2010930 con su método y sus números, sin placas,
 * VIN ni nombres. Es pública desde el 2026-10-21, a pedido de René (ADR 0049).
 */
import type { Metadata } from "next";
import { caso, CASO_INICIAL } from "@croquis/cesvi";
import { Recorrido } from "@/components/cesvi/recorrido/recorrido";
import { Reproduccion } from "@/components/cesvi/reproduccion";

export const metadata: Metadata = {
  title: `Caso ${CASO_INICIAL} · Croquis para CESVI`,
  description: "Reproducción de un reporte de CESVI México con su método y sus números.",
  robots: { index: false, follow: false },
};

export default function CesviPage() {
  const c = caso(CASO_INICIAL);
  return <Recorrido caso={c} reproduccion={<Reproduccion caso={c} />} />;
}
