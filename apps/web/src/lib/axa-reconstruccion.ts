/**
 * El caso de AXA A2010930 colocado en el mapa, como lo reconstruye la app (ADR 0091): una sola
 * construcción para el video de R11 (`tools/demo/escena-axa.mts`), el diagnóstico
 * (`eval/cesvi_axa_diagnostico.mts`) y la medición con semillas (`eval/cesvi_axa_semillas.mts`),
 * para que todos muestren lo mismo que el paso 6.
 *
 * - **El expediente** es el del caso de ejemplo de /cesvi (`casoAxa`): la lectura grabada del
 *   reporte, con la masa de V1 de su ficha técnica.
 * - **Las posiciones** son las de la versión de la evidencia (`proponerVersiones`) sobre el tramo de
 *   MEX 15D del caso: A queda a 15.89 m del impacto, donde terminan los restos. El reposo de B no lo
 *   da el reporte: se usa el supuesto del método de los restos (B justo detrás de A) y se marca como
 *   supuesto, como lo marcaría el perito en el paso 3.
 * - **La semilla** es la de la app: `especDeExpediente` con su identificador por omisión.
 */
import {
  avanzar,
  callesCerca,
  caso,
  proponerVersiones,
  tramoDelCaso,
  ubicacionIlustrativa,
  type Expediente,
} from "@croquis/cesvi";
import { casoAxa } from "./caso-axa";
import { RADIO_CALLES_M } from "./calles-del-mapa";

/** El identificador de escena con que la app reconstruye un caso (el de `especDeExpediente`). */
export const SPEC_ID_APP = "caso-nuevo";

export interface OpcionesAxa {
  /** Distancia del reposo de A (V1) al impacto, en la vía (m); por omisión, la de los restos. */
  reposoA?: number;
  /** Dónde reposa B (V2): detrás de A tocándolo (el método de los restos), en el impacto, o sin dato. */
  reposoB?: "detras" | "impacto" | "ninguno";
  /** Giro del rumbo de B en el impacto respecto de la vía (grados). */
  anguloB?: number;
  /** El reposo de B marcado como supuesto (por omisión, sí: el reporte no lo da). */
  reposoBSupuesto?: boolean;
}

export function viaAxa() {
  const c = caso("A2010930");
  const u = ubicacionIlustrativa(c.id)!;
  const via = callesCerca(tramoDelCaso(c.id), [u.lon, u.lat], RADIO_CALLES_M).cercana;
  if (!via) throw new Error("El punto ilustrativo no está cerca del tramo del caso.");
  return { c, u, via };
}

export function expedienteAxaReconstruccion(o: OpcionesAxa = {}): Expediente {
  const { c, u, via } = viaAxa();
  const base = casoAxa().escena?.expediente;
  if (!base) throw new Error("El caso de AXA no trae su expediente");
  const ev = proponerVersiones({
    impacto: [u.lon, u.lat],
    rumboVia: via.rumbo,
    medidas: { A: { largo: 5.34, ancho: 1.86 }, B: { largo: 5.34, ancho: 1.86 } },
    distanciaRestos: o.reposoA ?? c.evidencia.restos.distancia_m.valor,
    reversaM: 3,
  }).evidencia;
  // A es V1 y B es V2, como en el recorrido (`recorrido-3d.ts`).
  const ID = { A: "V1", B: "V2" } as const;
  const reposoB = o.reposoB ?? "detras";
  const finalB =
    reposoB === "detras"
      ? { punto: avanzar(ev.vehiculos.A.final.punto, via.rumbo, -5.34), rumbo: via.rumbo }
      : reposoB === "impacto"
        ? ev.vehiculos.B.final
        : null;
  const supuesto = o.reposoBSupuesto ?? true;
  const posiciones = (["A", "B"] as const).flatMap((l) =>
    (["impacto", "final"] as const).flatMap((fase) => {
      const p = l === "B" && fase === "final" ? finalB : ev.vehiculos[l][fase];
      if (!p) return [];
      const rumbo = l === "B" && fase === "impacto" ? p.rumbo + (o.anguloB ?? 0) : p.rumbo;
      return [
        {
          vehiculo: ID[l],
          fase,
          punto: { lon: p.punto[0], lat: p.punto[1] },
          rumbo: ((rumbo % 360) + 360) % 360,
          fuente:
            l === "B" && fase === "final" && supuesto ? ("supuesto" as const) : ("perito" as const),
        },
      ];
    }),
  );
  return { ...base, versiones: [{ tipo: "evidencia", posiciones }] };
}
