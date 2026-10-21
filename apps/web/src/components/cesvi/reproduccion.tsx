/**
 * «Reproducción del dictamen»: cada número del reporte junto al de Croquis, con la diferencia
 * absoluta y en porcentaje; la discrepancia de la energía, explicada; las preguntas para CESVI y la
 * segunda opinión de Croquis, aparte (docs/cesvi/PROTOTIPO.md, ADR 0048).
 */
import {
  DISCREPANCIA_A2010930,
  PREGUNTAS_PARA_CESVI,
  reproducir,
  segundaOpinion,
  type CasoCesvi,
  type FilaReproduccion,
} from "@croquis/cesvi";
import { Desplazable } from "@/components/sitio/desplazable";

/** Decimales para el número de Croquis: dos más que el reporte para ver la diferencia, hasta 4. */
const decimalesCroquis = (f: FilaReproduccion) => Math.min(f.decimalesReporte + 2, 4);
const signo = (x: number, d: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}`;
/** Porcentaje con 2 decimales, o con 4 si es menor que 0.01 % (para que no se lea «0.00»). */
const pct = (x: number) => signo(x, Math.abs(x) < 0.01 ? 4 : 2);

function Coincide({ f }: { f: FilaReproduccion }) {
  if (f.coincide === "redondeo") return <>Coincide</>;
  if (f.coincide === "truncamiento") return <>Coincide (el reporte trunca)</>;
  return <strong className="font-semibold text-evidencia">Difiere</strong>;
}

export function Reproduccion({ caso }: { caso: CasoCesvi }) {
  const { filas } = reproducir(caso);
  const d = DISCREPANCIA_A2010930;
  const deformacion = caso.calculos.deformacion_B;
  const segunda = segundaOpinion(
    deformacion.C_m.map((x) => x.valor),
    deformacion.L_m.valor,
    caso.vehiculos.B.masa_kg?.valor ?? Number.NaN,
    "pickup",
  );
  return (
    <section aria-labelledby="reproduccion" className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 id="reproduccion" className="t-titulo">
          Reproducción del dictamen
        </h2>
        <p className="t-cuerpo max-w-[72ch] text-texto-2">
          Cada número del reporte junto al que calcula Croquis con el mismo método y los mismos
          datos. Nada se ajusta para que cuadre.
        </p>
      </div>
      <Desplazable etiqueta="Tabla de reproducción del dictamen">
        <table
          className="w-full min-w-[48rem] border-collapse text-left"
          data-testid="reproduccion"
        >
          <thead>
            <tr className="t-nota border-b border-linea">
              <th className="py-2 pr-4 font-normal">Concepto</th>
              <th className="py-2 pr-4 font-normal">Croquis parte de</th>
              <th className="py-2 pr-4 text-right font-normal">Reporte</th>
              <th className="py-2 pr-4 text-right font-normal">Croquis</th>
              <th className="py-2 pr-4 text-right font-normal">Diferencia</th>
              <th className="py-2 pr-4 text-right font-normal">%</th>
              <th className="py-2 font-normal">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className="t-interfaz border-b border-linea" data-fila={f.clave}>
                <td className="py-2 pr-4">{f.concepto}</td>
                <td className="t-nota py-2 pr-4 text-texto-2">{f.partida}</td>
                <td className="cifras py-2 pr-4 text-right">
                  {f.reporte.toFixed(f.decimalesReporte)} {f.unidad}
                </td>
                <td className="cifras py-2 pr-4 text-right">
                  {f.croquis.toFixed(decimalesCroquis(f))} {f.unidad}
                </td>
                <td className="cifras py-2 pr-4 text-right">
                  {signo(f.diferencia, decimalesCroquis(f))}
                </td>
                <td className="cifras py-2 pr-4 text-right">{pct(f.diferenciaPct)} %</td>
                <td className="py-2">
                  <Coincide f={f} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Desplazable>

      <section aria-labelledby="discrepancia" className="flex flex-col gap-3">
        <h3 id="discrepancia" className="t-subtitulo">
          Por qué la energía difiere
        </h3>
        <p className="t-cuerpo max-w-[72ch]">
          Con la fórmula de 4 medidas que imprime el dictamen y sus propios datos, la energía es{" "}
          <span className="cifras">{d.energiaDatosImpresos.toFixed(3)} kJ</span>, no{" "}
          <span className="cifras">{d.energiaReporte}</span> (
          <span className="cifras">{signo(d.diferenciaPct, 2)} %</span>). El paso de energía a
          velocidad del reporte sí es exacto: partiendo de su energía, Croquis da los mismos 63.15
          km/h. Se probaron las causas posibles sin ajustar nada:
        </p>
        <ul className="t-cuerpo flex max-w-[72ch] list-disc flex-col gap-1 pl-5">
          <li>
            Si las C impresas estuvieran redondeadas (±0.005 m), la energía quedaría entre{" "}
            <span className="cifras">{d.redondeoC.minimo.toFixed(3)}</span> y{" "}
            <span className="cifras">{d.redondeoC.maximo.toFixed(3)} kJ</span>:{" "}
            {d.redondeoC.contieneAlReporte ? "contiene" : "no contiene"} la del reporte.
          </li>
          <li>
            Un dígito mal leído en L, A o B: el más cercano ({d.digitoMasCercano.parametro} ={" "}
            <span className="cifras">{d.digitoMasCercano.leido}</span> en lugar de{" "}
            <span className="cifras">{d.digitoMasCercano.impreso}</span>) da{" "}
            <span className="cifras">{d.digitoMasCercano.energia.toFixed(3)} kJ</span>.
          </li>
          <li>
            Variantes de la fórmula (pesos, productos vecinos, término A²/2B): la más cercana queda
            a <span className="cifras">{d.varianteMasCercana.toFixed(3)} kJ</span>, y ninguna da los
            7 decimales impresos.
          </li>
        </ul>
        <p className="t-cuerpo max-w-[72ch]">
          Lo más probable es que la energía se calculara con datos que el reporte no imprime
          (medidas sin redondear o una hoja de cálculo). Para cerrarlo hace falta el PDF original o
          la hoja de CESVI.
        </p>
      </section>

      <section aria-labelledby="preguntas" className="flex flex-col gap-3">
        <h3 id="preguntas" className="t-subtitulo">
          Preguntas para CESVI
        </h3>
        <ol className="t-cuerpo flex max-w-[72ch] list-decimal flex-col gap-2 pl-5">
          {PREGUNTAS_PARA_CESVI.map((p) => (
            <li key={p.tema}>
              <span className="font-semibold">{p.tema}.</span> {p.pregunta}
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="segunda-opinion"
        className="flex flex-col gap-3 border-t border-linea pt-6"
      >
        <h3 id="segunda-opinion" className="t-subtitulo">
          Segunda opinión de Croquis (no reemplaza el cálculo de CESVI)
        </h3>
        <p className="t-cuerpo max-w-[72ch]">
          La misma deformación con la rigidez que Croquis midió para pickups en{" "}
          <span className="cifras">{segunda.pruebas}</span> pruebas de choque frontales de NHTSA, en
          lugar de los coeficientes del dictamen: A ={" "}
          <span className="cifras">{(segunda.A / 1000).toFixed(1)} kN/m</span> y B ={" "}
          <span className="cifras">{(segunda.B / 1000).toFixed(1)} kN/m²</span> (mediana), contra{" "}
          <span className="cifras">{deformacion.A.valor}</span> y{" "}
          <span className="cifras">{deformacion.B.valor}</span> del dictamen.
        </p>
        <p className="t-interfaz" data-testid="segunda-opinion">
          Energía de <span className="cifras">{(segunda.energiaJ / 1000).toFixed(1)} kJ</span> y
          velocidad de impacto de <span className="cifras">{segunda.kmh.toFixed(1)} km/h</span>
          {segunda.intervaloKmh ? (
            <>
              {" "}
              (80 % de las pruebas entre{" "}
              <span className="cifras">{segunda.intervaloKmh[0].toFixed(1)}</span> y{" "}
              <span className="cifras">{segunda.intervaloKmh[1].toFixed(1)} km/h</span>)
            </>
          ) : null}
          .
        </p>
        <p className="t-nota max-w-[72ch] text-texto-2">
          La diferencia viene de los coeficientes de rigidez, no del método: las pruebas de NHTSA
          son de vehículos de Estados Unidos contra una barrera rígida, y no se sabe de dónde salen
          los del dictamen (ver las preguntas). Es una referencia para el perito, no una corrección.
        </p>
      </section>
    </section>
  );
}
