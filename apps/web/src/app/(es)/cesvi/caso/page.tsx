/**
 * `/cesvi/caso`: caso nuevo (R1, ADR 0061). El perito narra el hecho, Croquis lo lee a escena del
 * contrato 2.0.0 y el perito coloca cada vehículo en el mapa. Pública, como `/cesvi`.
 */
import type { Metadata } from "next";
import { CasoNuevo } from "@/components/cesvi/caso-nuevo";
import { MarcoCesvi } from "@/components/cesvi/marco-cesvi";

export const metadata: Metadata = {
  title: "Caso nuevo · Croquis para CESVI",
  description: "De la narración técnica del perito a la escena del hecho.",
  robots: { index: false, follow: false },
};

export default function CasoNuevoPage() {
  return (
    <MarcoCesvi seccion="caso">
      <CasoNuevo />
    </MarcoCesvi>
  );
}
