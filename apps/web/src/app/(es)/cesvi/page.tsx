/**
 * `/cesvi`: la lista de casos de Croquis para CESVI (ADR 0079). Todo caso (nuevo, importado,
 * guardado o de ejemplo) se abre en el mismo recorrido de pasos.
 */
import type { Metadata } from "next";
import { caso, CASO_INICIAL } from "@croquis/cesvi";
import { ListaCasos } from "@/components/cesvi/lista-casos";
import { MarcoCesvi } from "@/components/cesvi/marco-cesvi";
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
  const m = c.modalidad_dictaminada;
  const reportes = PAGINA.casos.slice(0, EJEMPLOS).map((r) => ({
    id: r.id,
    modalidad: r.conclusiones.modalidad
      ? (MODALIDAD[r.conclusiones.modalidad] ?? r.conclusiones.modalidad)
      : "Sin modalidad concluida",
    vehiculos: r.expediente.vehiculos.length,
  }));
  return (
    <MarcoCesvi seccion="casos">
      <ListaCasos
        axa={{
          titulo: `${c.aseguradora} · ${c.id}`,
          detalle: `${m.charAt(0).toUpperCase()}${m.slice(1)} en ${c.lugar.municipio}, ${c.lugar.estado}: el reporte de CESVI reproducido con su método y sus números.`,
        }}
        reportes={reportes}
      />
    </MarcoCesvi>
  );
}
