"use client";
/**
 * La parte interactiva de `/cesvi`: el croquis sobre el mapa y los cálculos comparten la separación
 * de los restos. La que mide el perito en el mapa pasa al cálculo 2 con fuente «perito».
 */
import type { CasoCesvi } from "@croquis/cesvi";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Calculos, type DistanciaRestos, type ResultadosCalculo } from "./calculos";
import { Correspondencia, type CapturaCroquis } from "./correspondencia";

// MapLibre solo en el navegador (y fuera del JavaScript inicial).
const MapaCroquis = dynamic(() => import("./mapa").then((m) => m.MapaCroquis), {
  ssr: false,
  loading: () => (
    <div className="t-nota grid h-[60vh] min-h-[360px] place-items-center rounded-panel bg-superficie">
      Cargando el mapa…
    </div>
  ),
});

export function CasoInteractivo({
  caso,
  reproduccion,
}: {
  caso: CasoCesvi;
  /** La tabla de reproducción (se arma en el servidor), entre los cálculos y la correspondencia. */
  reproduccion: ReactNode;
}) {
  const [distancia, setDistancia] = useState<DistanciaRestos>({
    valor: String(caso.calculos.desplazamiento.D_m.valor),
    fuente: "dictamen",
  });
  const [resultados, setResultados] = useState<ResultadosCalculo | null>(null);
  const captura = useRef<() => CapturaCroquis | null>(() => null);
  const alCapturar = useCallback((f: () => CapturaCroquis | null) => {
    captura.current = f;
  }, []);
  return (
    <>
      <MapaCroquis
        caso={caso}
        onCaptura={alCapturar}
        onDistanciaRestos={(m) => {
          setDistancia({ valor: String(m), fuente: "perito" });
          document.getElementById("calculo-2")?.scrollIntoView({ behavior: "smooth" });
        }}
      />
      <Calculos
        caso={caso}
        distancia={distancia}
        onDistancia={setDistancia}
        onResultados={setResultados}
      />
      {reproduccion}
      <Correspondencia
        caso={caso}
        resultados={resultados}
        distancia={distancia}
        capturarCroquis={() => captura.current()}
      />
    </>
  );
}
