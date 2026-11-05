"use client";
/**
 * La maqueta de un caso reconstruido: la escena con las velocidades reconstruidas (la misma que el
 * 3D), calculada en el worker para no bloquear la página, y con las calles del mapa si ya llegaron.
 */
import { especReconstruida, type Reconstruccion } from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import type { EscenaSpec } from "@croquis/scene-schema";
import { useEffect, useMemo, useState } from "react";
import { conCallesDelMapa } from "@/lib/calles-del-mapa";
import { METODO } from "@/lib/textos-caso";
import type { ResultadoMaqueta } from "@/lib/maqueta";
import { reconstruirEnNavegador } from "@/lib/reconstruct-client";
import { EscenaMaqueta } from "./maqueta";

export function MaquetaCaso({
  r,
  calles,
  nombres,
}: {
  r: Reconstruccion;
  calles: OverpassResponse | null;
  nombres: Record<string, string>;
}) {
  const spec = useMemo(() => {
    let s = especReconstruida(r);
    if (r.origen && calles) s = conCallesDelMapa(s, r.origen, calles);
    return s as unknown as EscenaSpec;
  }, [r, calles]);
  const [listo, setListo] = useState<{ spec: EscenaSpec; res: ResultadoMaqueta } | null>(null);
  useEffect(() => {
    let vivo = true;
    void reconstruirEnNavegador(spec)
      .then((res) => {
        if (vivo) setListo({ spec, res: res as unknown as ResultadoMaqueta });
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [spec]);
  if (!listo || listo.spec !== spec)
    return (
      <p
        className="t-nota grid h-full place-items-center text-texto-3"
        data-testid="maqueta-calculando"
      >
        Calculando la maqueta…
      </p>
    );
  const conCalles = Boolean((spec as { lugar?: { red_vial?: unknown } }).lugar?.red_vial);
  return (
    <div className="relative h-full w-full overflow-hidden rounded-panel">
      <EscenaMaqueta spec={spec} resultado={listo.res} nombres={nombres} />
      {/* Cada cifra con su método (prompt §0): la de la maqueta no es el p50 de la tabla. */}
      <div
        className="vidrio t-nota absolute top-3 left-3 flex max-w-[26rem] flex-col gap-1 rounded-control px-3 py-2"
        data-testid="maqueta-leyenda"
      >
        <span>
          {METODO.reconstruccion}: la simulación con las velocidades previas ajustadas. Su velocidad
          al impacto puede diferir del p50 de la tabla, que sale de las simulaciones con
          incertidumbre.
        </span>
        <span className="text-texto-3">
          Trayectoria: más naranja cuanto más rápido · siluetas cada 0.4 s antes del impacto ·
          reposo punteado.
        </span>
      </div>
      {conCalles ? null : (
        // Sin las calles del mapa no se dibuja una vía inventada: solo lo que calculó el solver.
        <p
          className="vidrio t-nota absolute bottom-3 left-3 rounded-control px-3 py-1.5"
          data-testid="maqueta-sin-calles"
        >
          Sin las calles del mapa: la maqueta muestra las trayectorias, el impacto y los reposos.
        </p>
      )}
    </div>
  );
}
