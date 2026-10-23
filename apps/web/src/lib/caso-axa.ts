/**
 * El caso de AXA A2010930 como caso de ejemplo del recorrido (V2-4, ADR 0080): la misma interfaz y
 * los mismos pasos que cualquier caso.
 *
 * - La escena es el expediente que se lee del reporte redactado (la misma lectura grabada de la
 *   e2e de «Cargar un reporte»): vehículos, daños, masas y las medidas C y L de la deformación, con
 *   la cita de cada dato, para que la verificación reproduzca el método de CESVI. Va sin posiciones:
 *   el perito las coloca en el paso del lugar, como en cualquier caso. El mapa abre en la ubicación
 *   ilustrativa (ADR 0056), que va como supuesto.
 * - La narración es la del ejemplo del hecho.
 * - Lo que concluyó CESVI sale de la lectura grabada del reporte redactado (la misma de la e2e de
 *   «Cargar un reporte»), con la cita de cada dato.
 *
 * Solo se usa en el servidor: la lectura grabada no viaja al navegador, solo el caso armado.
 */
import {
  caso as casoCesvi,
  CASO_INICIAL,
  ejemploHecho,
  importarDictamen,
  problemasExpediente,
  ubicacionIlustrativa,
  type Expediente,
  type SalidaCorpus,
  type SalidaNarracion,
} from "@croquis/cesvi";
import lecturas from "../../../../data/cesvi/grabaciones/importar/lecturas-a2010930.json";
import ejemplo from "../../../../data/cesvi/grabaciones/importar/ejemplo.json";
import type { CasoExpediente } from "./casos";

export function casoAxa(): CasoExpediente {
  const c = casoCesvi(CASO_INICIAL);
  const u = ubicacionIlustrativa(c.id);
  const leido = importarDictamen(
    ejemplo.texto,
    lecturas.corpus as unknown as SalidaCorpus,
    lecturas.narracion as unknown as SalidaNarracion,
    ejemplo.archivo,
  );
  const expediente: Expediente = u
    ? {
        ...leido.expediente,
        caso: {
          ...leido.expediente.caso,
          lugar: {
            ...leido.expediente.caso.lugar,
            coordenadas: { lat: u.lat, lon: u.lon },
            descripcion: {
              valor: `Ubicación ilustrativa sobre ${u.via.ref}: el reporte no da coordenadas.`,
              fuente: "supuesto",
            },
          },
        },
      }
    : leido.expediente;
  return {
    id: c.id.toLowerCase(),
    origen: "ejemplo",
    titulo: `${c.aseguradora} · ${c.id}`,
    narracion: ejemploHecho(c.id)?.descripcion ?? null,
    escena: {
      expediente,
      posiciones: [],
      conteos: leido.conteos,
      problemas: problemasExpediente(expediente),
      preguntas: [],
    },
    reporte: { nombre: `Reporte ${c.id}`, conclusiones: leido.narracion.conclusiones },
    validacion: null,
    ejemplo: c,
  };
}
