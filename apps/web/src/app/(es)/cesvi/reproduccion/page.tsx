/**
 * `/cesvi/reproduccion`: «Reproducción de reportes» (R4, ADR 0067; diseño de R9, ADR 0073). Los
 * reportes de la prueba congelada que Croquis reconstruye: lo que concluyó CESVI y lo que obtuvo
 * Croquis de la narración sin conclusiones, con lo que coincide y lo que no. La modalidad se mide
 * contra la etiqueta de R0 y contra el título del reporte, lado a lado (ADR 0071).
 */
import type { Metadata } from "next";
import { ListaReproduccion, type RenglonReproduccion } from "@/components/cesvi/lista-reproduccion";
import { MarcoCesvi } from "@/components/cesvi/marco-cesvi";
import {
  CARA,
  MODALIDAD,
  nombreCaso,
  PAGINA,
  TITULO,
  type Tasa,
} from "@/lib/reproduccion-dictamenes";

export const metadata: Metadata = {
  title: "Reproducción de reportes · Croquis para CESVI",
  description: "Lo que concluyó CESVI y lo que reconstruyó Croquis, lado a lado.",
  robots: { index: false, follow: false },
};

const pct = (t: Tasa) => (t.pct === null ? "—" : `${t.pct.toFixed(1)} %`);
const deCuantos = (t: Tasa) => `${t.k} de ${t.n}`;

function Cifra({
  titulo,
  valor,
  detalle,
  nota,
  testid,
}: {
  titulo: string;
  valor: string;
  detalle: string;
  nota: string;
  testid?: string;
}) {
  return (
    <div className="tarjeta flex flex-col gap-1.5 p-5" data-testid={testid}>
      <span className="t-nota">{titulo}</span>
      <span className="cifras text-3xl font-semibold tracking-tight">{valor}</span>
      <span className="cifras t-nota text-texto-2">{detalle}</span>
      <span className="t-nota text-texto-3">{nota}</span>
    </div>
  );
}

export default function ReproduccionPage() {
  const r = PAGINA.resumen;
  const t = TITULO.v3.titulo_del_reporte;
  const base = (m: string) => MODALIDAD[m] ?? m;
  const renglones: RenglonReproduccion[] = PAGINA.casos.map((c) => {
    const m = c.comparacion.modalidad;
    const z = c.comparacion.zonas;
    return {
      id: c.id,
      nombre: nombreCaso(c.id),
      cesvi: m.cesvi,
      titulo: TITULO.frases[c.id]?.modalidad ?? null,
      croquis: m.croquis,
      coincide: m.coincide,
      zonas: z.cesvi
        ? `${z.coinciden} de ${z.cesvi} (${c.conclusiones.zonas_contacto.map((x) => `${x.vehiculo} ${CARA[x.cara] ?? x.cara}`).join(", ")})`
        : "—",
      primero: c.comparacion.secuencia.primero_coincide,
    };
  });
  return (
    <MarcoCesvi seccion="reproduccion" modoInicial="presentar" conModos={false}>
      <main className="px-4 py-10 md:px-8">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-8">
          <header className="flex flex-col gap-3">
            <p className="t-rotulo">Croquis para CESVI · reproducción de reportes</p>
            <h1 className="t-titulo">Esto lo analizaron ustedes; esto lo reconstruyó Croquis</h1>
            <p className="t-interfaz max-w-[70ch] text-texto-2">
              Croquis recibió solo la narración de cada reporte de CESVI, sin sus conclusiones. Leyó
              la escena, la reconstruyó y aquí se compara con lo que concluyó CESVI. Son reportes de
              la prueba congelada, que no se usaron para ajustar las reglas.
            </p>
          </header>

          <section className="flex flex-col gap-3" data-testid="resumen-r4">
            <h2 className="t-subtitulo">La modalidad, contra dos referencias</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Cifra
                titulo="Contra el título del reporte"
                valor={pct(t.croquis)}
                detalle={`${deCuantos(t.croquis)} reportes con título comparable`}
                nota={`Línea base («${base(t.linea_base.modalidad)}» siempre): ${pct(t.linea_base)}. Lo que CESVI escribe en el título; los títulos genéricos no se comparan.`}
                testid="modalidad-titulo"
              />
              <Cifra
                titulo="Contra la etiqueta de las conclusiones (R0)"
                valor={pct(r.modalidad.croquis)}
                detalle={`${deCuantos(r.modalidad.croquis)} reportes`}
                nota={`Línea base («${base(r.modalidad.linea_base.modalidad)}» siempre): ${pct(r.modalidad.linea_base)}. Lo que Claude leyó en las conclusiones de cada reporte.`}
                testid="modalidad-r0"
              />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <Cifra
              titulo="Zonas de contacto (las de CESVI que Croquis tiene)"
              valor={pct(r.zonas.exhaustividad)}
              detalle={deCuantos(r.zonas.exhaustividad)}
              nota={`Precisión: ${pct(r.zonas.precision)} (${deCuantos(r.zonas.precision)}).`}
            />
            <Cifra
              titulo="Primer impacto (quiénes participan)"
              valor={pct(r.secuencia.primer_impacto)}
              detalle={deCuantos(r.secuencia.primer_impacto)}
              nota={`Secuencia completa: ${pct(r.secuencia.completa)}.`}
            />
            <Cifra
              titulo="Posiciones finales que Croquis tiene"
              valor={pct(r.posiciones_finales.croquis_las_tiene)}
              detalle={deCuantos(r.posiciones_finales.croquis_las_tiene)}
              nota={`Velocidades por deformación: Croquis calcula ${r.velocidades.croquis_calcula} de ${r.velocidades.del_dictamen_por_deformacion}; las narraciones casi no traen el ancho dañado L.`}
            />
          </section>
          <p className="t-nota text-texto-3">
            {PAGINA.dictamenes} reportes de la prueba; {PAGINA.casos.length} se reconstruyen y están
            abajo. Mediciones: <code>eval/results/cesvi_r4d_reproduccion_prueba.json</code> (
            {PAGINA.fecha.slice(0, 10)}) y <code>eval/results/cesvi_r4c_titulo_prueba.json</code> (
            {TITULO.fecha.slice(0, 10)}).
          </p>

          <ListaReproduccion renglones={renglones} modalidades={MODALIDAD} />
        </div>
      </main>
    </MarcoCesvi>
  );
}
