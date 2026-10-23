/**
 * El caso del recorrido de /cesvi (A2010930) como expediente del contrato 2.0.0, para verlo en 3D
 * con el solver (R9, ADR 0073): los mismos pasos que «Caso nuevo» (`especDeExpediente`, solver,
 * `especReconstruida`).
 *
 * Los vehículos, los daños, la masa y los restos salen del caso (lo que imprime el reporte); las
 * posiciones de impacto y finales, de la versión de la evidencia que el perito ve y ajusta en el
 * paso 4. A es V1 y B es V2. El primer impacto es B contra A: B alcanza a A por detrás.
 */
import type { CasoCesvi } from "./caso";
import type { Expediente } from "./corpus";
import type { VersionCroquis } from "./versiones";

const ID = { A: "V1", B: "V2" } as const;

export function expedienteDelRecorrido(caso: CasoCesvi, evidencia: VersionCroquis): Expediente {
  const v = (l: "A" | "B") => caso.vehiculos[l];
  const masaB = v("B").masa_kg;
  const posiciones = (["A", "B"] as const).flatMap((l) =>
    (["impacto", "final"] as const).map((fase) => {
      const p = evidencia.vehiculos[l][fase];
      return {
        vehiculo: ID[l],
        fase,
        punto: { lon: p.punto[0], lat: p.punto[1] },
        rumbo: ((p.rumbo % 360) + 360) % 360,
        fuente: "perito" as const,
      };
    }),
  );
  return {
    caso: { modalidades: [caso.modalidad_dictaminada] },
    vehiculos: [
      {
        id: "V1",
        marca: { valor: v("A").marca, fuente: "dictamen_importado" },
        modelo: { valor: v("A").tipo, fuente: "dictamen_importado" },
        anio: v("A").modelo,
        clase: "pickup",
      },
      {
        id: "V2",
        marca: { valor: v("B").marca, fuente: "dictamen_importado" },
        modelo: { valor: v("B").tipo, fuente: "dictamen_importado" },
        anio: v("B").modelo,
        clase: "pickup",
        ...(masaB
          ? { masa: { valor: masaB.valor, unidad: "kg", fuente: "dictamen_importado" } }
          : {}),
      },
    ],
    danos: [
      {
        vehiculo: "V1",
        zona: { cara: "posterior", tercio: "izquierdo" },
        fuente: "dictamen_importado",
      },
      {
        vehiculo: "V2",
        zona: { cara: "frontal", tercio: "derecho" },
        fuente: "dictamen_importado",
      },
    ],
    impactos: [
      {
        orden: 1,
        vehiculos: ["V2", "V1"],
        zonas: [
          { vehiculo: "V2", zona: { cara: "frontal", tercio: "derecho" } },
          { vehiculo: "V1", zona: { cara: "posterior", tercio: "izquierdo" } },
        ],
        fuente: "perito",
      },
    ],
    versiones: [{ tipo: "evidencia", posiciones }],
    evidencias: {
      restos: {
        longitud: {
          valor: caso.evidencia.restos.distancia_m.valor,
          unidad: "m",
          fuente: "dictamen_importado",
        },
      },
    },
  } as Expediente;
}
