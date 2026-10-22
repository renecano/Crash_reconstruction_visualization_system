/**
 * `/cesvi/reproduccion`: «Reproducción de dictámenes» (R4, ADR 0067). Los dictámenes de la prueba
 * congelada que Croquis reconstruye: lo que concluyó CESVI y lo que obtuvo Croquis de la narración
 * sin conclusiones, con lo que coincide y lo que no. Pública, como `/cesvi`.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { CARA, MODALIDAD, nombreCaso, PAGINA } from "@/lib/reproduccion-dictamenes";

export const metadata: Metadata = {
  title: "Reproducción de dictámenes · Croquis para CESVI",
  description: "Lo que concluyó CESVI y lo que reconstruyó Croquis, lado a lado.",
  robots: { index: false, follow: false },
};

const pct = (t: { k: number; n: number; pct: number | null }) =>
  t.pct === null ? "—" : `${t.pct.toFixed(1)} % (${t.k} de ${t.n})`;

function Marca({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-texto-3">—</span>;
  return ok ? (
    <span className="font-semibold text-texto">coincide</span>
  ) : (
    <span className="text-senal-texto">no coincide</span>
  );
}

export default function ReproduccionPage() {
  const r = PAGINA.resumen;
  return (
    <main className="min-h-screen bg-fondo px-4 py-10 text-texto md:px-8" data-tema="claro">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="t-rotulo">Croquis para CESVI · reproducción de dictámenes</p>
          <h1 className="t-titulo">Esto lo analizaron ustedes; esto lo reconstruyó Croquis</h1>
          <p className="t-interfaz max-w-[70ch] text-texto-2">
            Croquis recibió solo la narración de cada dictamen, sin sus conclusiones. Leyó la
            escena, la reconstruyó y aquí se compara con lo que concluyó CESVI. Son dictámenes de la
            prueba congelada, que no se usaron para ajustar las reglas.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4" data-testid="resumen-r4">
          <div className="tarjeta flex flex-col gap-1 p-5">
            <span className="t-nota">Modalidad</span>
            <span className="cifras text-lg font-semibold">{pct(r.modalidad.croquis)}</span>
            <span className="t-nota text-texto-3">
              Línea base («
              {MODALIDAD[r.modalidad.linea_base.modalidad] ?? r.modalidad.linea_base.modalidad}»
              siempre): {pct(r.modalidad.linea_base)}
            </span>
          </div>
          <div className="tarjeta flex flex-col gap-1 p-5">
            <span className="t-nota">Zonas de contacto (las de CESVI que Croquis tiene)</span>
            <span className="cifras text-lg font-semibold">{pct(r.zonas.exhaustividad)}</span>
            <span className="t-nota text-texto-3">Precisión: {pct(r.zonas.precision)}</span>
          </div>
          <div className="tarjeta flex flex-col gap-1 p-5">
            <span className="t-nota">Primer impacto (quiénes participan)</span>
            <span className="cifras text-lg font-semibold">{pct(r.secuencia.primer_impacto)}</span>
            <span className="t-nota text-texto-3">
              Secuencia completa: {pct(r.secuencia.completa)}
            </span>
          </div>
          <div className="tarjeta flex flex-col gap-1 p-5">
            <span className="t-nota">Posiciones finales que Croquis tiene</span>
            <span className="cifras text-lg font-semibold">
              {pct(r.posiciones_finales.croquis_las_tiene)}
            </span>
            <span className="t-nota text-texto-3">
              Velocidades por deformación: Croquis calcula {r.velocidades.croquis_calcula} de{" "}
              {r.velocidades.del_dictamen_por_deformacion}
            </span>
          </div>
        </section>
        <p className="t-nota text-texto-3">
          {PAGINA.dictamenes} dictámenes de la prueba; {PAGINA.casos.length} se reconstruyen y están
          abajo. Medición: <code>eval/results/cesvi_r4_reproduccion_prueba.json</code> (
          {PAGINA.fecha.slice(0, 10)}).
        </p>

        <section className="tarjeta overflow-x-auto p-0" data-testid="casos-r4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-texto-3">
                <th className="px-4 py-3 font-medium">Dictamen</th>
                <th className="px-4 py-3 font-medium">Modalidad de CESVI</th>
                <th className="px-4 py-3 font-medium">Croquis</th>
                <th className="px-4 py-3 font-medium">Zonas de contacto</th>
                <th className="px-4 py-3 font-medium">Primer impacto</th>
              </tr>
            </thead>
            <tbody>
              {PAGINA.casos.map((c) => {
                const m = c.comparacion.modalidad;
                const z = c.comparacion.zonas;
                return (
                  <tr key={c.id} className="border-t border-linea-suave" data-caso={c.id}>
                    <td className="px-4 py-2.5">
                      <Link
                        className="font-medium underline underline-offset-2 hover:text-texto-2"
                        href={`/cesvi/reproduccion/${c.id}`}
                      >
                        {nombreCaso(c.id)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      {m.cesvi ? (MODALIDAD[m.cesvi] ?? m.cesvi) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {m.croquis ? (MODALIDAD[m.croquis] ?? m.croquis) : "sin inferir"} ·{" "}
                      <Marca ok={m.coincide} />
                    </td>
                    <td className="cifras px-4 py-2.5">
                      {z.cesvi ? `${z.coinciden} de ${z.cesvi}` : "—"}
                      {z.cesvi ? (
                        <span className="font-sans text-texto-3">
                          {" "}
                          (
                          {c.conclusiones.zonas_contacto
                            .map((x) => `${x.vehiculo} ${CARA[x.cara] ?? x.cara}`)
                            .join(", ")}
                          )
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <Marca ok={c.comparacion.secuencia.primero_coincide} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <p className="t-nota text-texto-3">Reconstrucción de apoyo · el dictamen es del perito.</p>
      </div>
    </main>
  );
}
