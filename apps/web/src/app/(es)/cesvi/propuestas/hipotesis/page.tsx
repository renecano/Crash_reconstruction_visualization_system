import type { Metadata } from "next";
import { Suspense } from "react";
import { PropuestasHipotesis } from "@/components/cesvi/propuestas/hipotesis";

/** Prototipo de diseño (ronda 4, punto 8): no se enlaza ni se indexa; se borra al elegir. */
export const metadata: Metadata = {
  title: "Propuestas · versiones del caso",
  robots: { index: false, follow: false },
};

export default function Pagina() {
  return (
    <Suspense>
      <PropuestasHipotesis />
    </Suspense>
  );
}
