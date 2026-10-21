"use client";
/**
 * La parte interactiva de `/cesvi`: el croquis sobre el mapa y los cálculos comparten la separación
 * de los restos. La que mide el perito en el mapa pasa al cálculo 2 con fuente «perito».
 */
import type { CasoCesvi } from "@croquis/cesvi";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Calculos, type DistanciaRestos } from "./calculos";

// MapLibre solo en el navegador (y fuera del JavaScript inicial).
const MapaCroquis = dynamic(() => import("./mapa").then((m) => m.MapaCroquis), {
  ssr: false,
  loading: () => (
    <div className="t-nota grid h-[60vh] min-h-[360px] place-items-center rounded-panel bg-superficie">
      Cargando el mapa…
    </div>
  ),
});

export function CasoInteractivo({ caso }: { caso: CasoCesvi }) {
  const [distancia, setDistancia] = useState<DistanciaRestos>({
    valor: String(caso.calculos.desplazamiento.D_m.valor),
    fuente: "dictamen",
  });
  return (
    <>
      <MapaCroquis
        caso={caso}
        onDistanciaRestos={(m) => {
          setDistancia({ valor: String(m), fuente: "perito" });
          document.getElementById("calculo-2")?.scrollIntoView({ behavior: "smooth" });
        }}
      />
      <Calculos caso={caso} distancia={distancia} onDistancia={setDistancia} />
    </>
  );
}
