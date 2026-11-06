/**
 * `/cesvi`: la lista de casos de Croquis para CESVI (ADR 0079). Todo caso (nuevo, importado,
 * guardado o de ejemplo) se abre en el mismo recorrido de pasos.
 */
import type { Metadata } from "next";
import { caso, CASO_INICIAL, comparar } from "@croquis/cesvi";
import { ListaCasos } from "@/components/cesvi/lista-casos";
import { MarcoCesvi } from "@/components/cesvi/marco-cesvi";
import { casoAxa } from "@/lib/caso-axa";
import { estadoDeReporte } from "@/lib/casos-lab";
import { cifraContraste, pctConSigno } from "@/lib/contraste-lab";
import { tituloDelHecho } from "@/lib/hecho-laboratorio";
import { MODALIDAD, PAGINA } from "@/lib/reproduccion-dictamenes";

export const metadata: Metadata = {
  title: "Casos · Croquis para CESVI",
  description: "Reconstrucción de apoyo para los peritos de CESVI México.",
  robots: { index: false, follow: false },
};

/** Cuántos reportes de la reproducción se muestran como ejemplo (el resto, en su página). */
const EJEMPLOS = 6;

export default function CesviPage() {
  const c = caso(CASO_INICIAL);
  const a = casoAxa();
  const k = comparar(
    a.reporte!.conclusiones,
    a.escena!.expediente,
    a.escena!.posiciones,
    a.narracion ?? "",
  );
  const cifra = cifraContraste(k);
  const modalidadAxa = k.modalidad.cesvi
    ? (MODALIDAD[k.modalidad.cesvi] ?? k.modalidad.cesvi)
    : "Sin modalidad concluida";
  const vehiculosAxa = a.escena!.expediente.vehiculos.length;
  const clave = `${c.aseguradora} · ${c.id}`;
  const titulo = tituloDelHecho(a.escena!.expediente, a.narracion);
  const reportes = [
    {
      id: c.id.toLowerCase(),
      titulo,
      clave,
      href: "/cesvi/casos/a2010930",
      modalidad: modalidadAxa,
      vehiculos: vehiculosAxa,
      estado: estadoDeReporte(k),
    },
    ...PAGINA.casos.slice(0, EJEMPLOS).map((r) => ({
      id: r.id,
      modalidad: r.conclusiones.modalidad
        ? (MODALIDAD[r.conclusiones.modalidad] ?? r.conclusiones.modalidad)
        : "Sin modalidad concluida",
      vehiculos: r.expediente.vehiculos.length,
      estado: estadoDeReporte(r.comparacion),
    })),
  ];
  return (
    <MarcoCesvi seccion="casos">
      <ListaCasos
        axa={{
          clave,
          titulo,
          modalidad: modalidadAxa,
          vehiculos: vehiculosAxa,
          croquisKmh: cifra ? cifra.croquis.toFixed(2) : null,
          cesviKmh: cifra ? cifra.cesvi.toFixed(2) : null,
          difPct: cifra ? pctConSigno(cifra.difPct) : null,
          zonas: `${k.zonas.coinciden} de ${k.zonas.cesvi}`,
        }}
        reportes={reportes}
      />
    </MarcoCesvi>
  );
}
