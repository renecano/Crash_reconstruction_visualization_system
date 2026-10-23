"use client";
/**
 * Un dictamen de la reproducción (R4, ADR 0067). A la izquierda, lo que concluyó CESVI, con la
 * cita de cada dato. A la derecha, lo que obtuvo Croquis de la narración sin conclusiones, con lo que
 * coincide y lo que no. Abajo, la reconstrucción de Croquis en 2D y 3D, calculada en el navegador.
 */
import { Croquis } from "@croquis/croquis-2d";
import {
  especDeExpediente,
  especReconstruida,
  interpretarResultado,
  secuenciaCroquis,
  zonasCroquis,
  type Reconstruccion,
} from "@croquis/cesvi";
import type { EscenaSpec } from "@croquis/scene-schema";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CONTROLES_INICIALES,
  type ControlesVisor,
  VisorEscena,
} from "@/components/visor/visor-app";
import { reconstruirCompletoEnNavegador } from "@/lib/reconstruct-client";
import { CARA, type CasoReproduccion, MODALIDAD, nombreCaso } from "@/lib/reproduccion-dictamenes";

const modalidad = (m: string | null) => (m ? (MODALIDAD[m] ?? m) : "—");
const cara = (c: string, t?: string | null) => `${CARA[c] ?? c}${t ? ` (${t})` : ""}`;
const kmh = (x: number) => `${x.toFixed(2)} km/h`;

function Coincide({ ok }: { ok: boolean | null }) {
  if (ok === null) return null;
  return (
    <span
      className={`t-nota ml-2 ${ok ? "text-texto" : "text-senal-texto"}`}
      data-coincide={ok ? "si" : "no"}
    >
      {ok ? "coincide" : "no coincide"}
    </span>
  );
}

function Cita({ texto }: { texto: string }) {
  return texto ? <span className="t-nota block text-texto-3">«{texto}»</span> : null;
}

export function ReproduccionDictamen({ caso }: { caso: CasoReproduccion }) {
  const c = caso.conclusiones;
  const k = caso.comparacion;
  const e = caso.expediente;
  const [estado, setEstado] = useState<string | null>(null);
  const [r, setR] = useState<Reconstruccion | null>(null);
  const [controles, setControles] = useState<ControlesVisor>({
    ...CONTROLES_INICIALES,
    camara: "cinematica",
    auto: true,
  });
  const spec = useMemo(() => (r ? (especReconstruida(r) as unknown as EscenaSpec) : null), [r]);

  const reconstruir = async () => {
    setEstado("Reconstruyendo con el solver…");
    try {
      const base = especDeExpediente(e, caso.id);
      const res = await reconstruirCompletoEnNavegador(base.spec as unknown as EscenaSpec);
      setR(interpretarResultado(base, res as unknown as Record<string, unknown>));
      setEstado(null);
    } catch (err) {
      setEstado(`El solver no pudo reconstruir la escena: ${(err as Error).message}`);
    }
  };

  // Las mismas que compara E-R4: las de los impactos que leyó o, si no, la cara principal de los
  // daños; y la secuencia leída o, si no la dice, la única posible.
  const zonas = zonasCroquis(e);
  const secuencia = secuenciaCroquis(e, caso.narracion);

  return (
    <main className="px-4 py-10 md:px-8">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8" data-testid="reproduccion-caso">
        <header className="flex flex-col gap-3">
          <Link href="/cesvi/reproduccion" className="t-nota underline underline-offset-2">
            ← Reproducción de reportes
          </Link>
          <h1 className="t-titulo">{nombreCaso(caso.id)}</h1>
          <details className="tarjeta p-5">
            <summary className="t-interfaz cursor-pointer font-medium">
              La narración que recibió Croquis (sin las conclusiones del reporte)
            </summary>
            <p className="t-interfaz mt-3 whitespace-pre-line text-texto-2">{caso.narracion}</p>
          </details>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="tarjeta flex flex-col gap-4 p-6" data-testid="lado-cesvi">
            <h2 className="t-subtitulo">Lo que concluyó CESVI</h2>
            <div>
              <span className="t-nota">Modalidad</span>
              <p className="t-interfaz font-medium">{modalidad(c.modalidad)}</p>
            </div>
            <div>
              <span className="t-nota">Zonas de contacto</span>
              {c.zonas_contacto.length ? (
                <ul className="flex flex-col gap-1.5">
                  {c.zonas_contacto.map((z, i) => (
                    <li key={i} className="t-interfaz">
                      {z.vehiculo} · {cara(z.cara, z.tercio)}
                      <Cita texto={z.cita} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-nota text-texto-3">El reporte no las concluye.</p>
              )}
            </div>
            <div>
              <span className="t-nota">Secuencia de impactos</span>
              {c.secuencia.length ? (
                <ol className="flex flex-col gap-1.5">
                  {[...c.secuencia]
                    .sort((a, b) => a.orden - b.orden)
                    .map((s) => (
                      <li key={s.orden} className="t-interfaz">
                        {s.orden}. {s.participantes.join(" con ")}
                        {s.objeto_fijo ? ` contra ${s.objeto_fijo}` : ""}
                        <Cita texto={s.cita} />
                      </li>
                    ))}
                </ol>
              ) : (
                <p className="t-nota text-texto-3">El reporte no la concluye.</p>
              )}
            </div>
            {c.velocidades.length ? (
              <div>
                <span className="t-nota">Velocidades</span>
                <ul className="flex flex-col gap-1.5">
                  {c.velocidades.map((v, i) => (
                    <li key={i} className="t-interfaz">
                      {v.vehiculo ?? "—"} · <span className="cifras">{kmh(v.kmh)}</span> · {v.que}
                      <Cita texto={v.cita} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {c.posiciones_finales.length ? (
              <div>
                <span className="t-nota">Posiciones finales</span>
                <ul className="flex flex-col gap-1.5">
                  {c.posiciones_finales.map((p, i) => (
                    <li key={i} className="t-interfaz">
                      {p.vehiculo} · {p.descripcion}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="tarjeta flex flex-col gap-4 p-6" data-testid="lado-croquis">
            <h2 className="t-subtitulo">Lo que obtuvo Croquis</h2>
            <div>
              <span className="t-nota">Modalidad</span>
              <p className="t-interfaz font-medium" data-testid="modalidad-croquis">
                {k.modalidad.croquis ? modalidad(k.modalidad.croquis) : "sin inferir"}
                <Coincide ok={k.modalidad.coincide} />
              </p>
              <span className="t-nota text-texto-3">Por qué: {k.modalidad.motivo}.</span>
            </div>
            <div>
              <span className="t-nota">Zonas de contacto</span>
              {zonas.length ? (
                <ul className="flex flex-col gap-1">
                  {zonas.map((z) => (
                    <li key={`${z.vehiculo}:${z.cara}`} className="t-interfaz">
                      {z.vehiculo} · {cara(z.cara, z.tercio)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-nota text-texto-3">La narración no describe daños.</p>
              )}
              {k.zonas.cesvi ? (
                <span className="t-nota">
                  {k.zonas.coinciden} de {k.zonas.cesvi} zonas de CESVI coinciden por vehículo y
                  cara.
                </span>
              ) : null}
            </div>
            <div>
              <span className="t-nota">Secuencia de impactos</span>
              {secuencia.impactos.length ? (
                <ol className="flex flex-col gap-1">
                  {secuencia.impactos.map((i, n) => (
                    <li key={n} className="t-interfaz">
                      {n + 1}. {i.vehiculos.join(" con ")}
                      {i.objeto_fijo ? " contra un objeto fijo" : ""}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="t-nota text-texto-3">
                  La narración no dice el orden de los impactos.
                </p>
              )}
              {secuencia.inferida ? (
                <span className="t-nota block text-texto-3">
                  La narración no la dice: es la única posible con estos vehículos.
                </span>
              ) : null}
              <span className="t-nota block">
                Primer impacto <Coincide ok={k.secuencia.primero_coincide} />
              </span>
            </div>
            {k.velocidades.length ? (
              <div>
                <span className="t-nota">Velocidades por deformación</span>
                <ul className="flex flex-col gap-1.5" data-testid="velocidades-r4">
                  {k.velocidades.map((v, i) => (
                    <li key={i} className="t-interfaz">
                      {v.vehiculo} · CESVI <span className="cifras">{kmh(v.cesvi_kmh)}</span> ·
                      Croquis{" "}
                      {v.croquis_kmh === null ? (
                        <span className="text-texto-3">
                          sin las medidas C y L, la masa y la rigidez
                        </span>
                      ) : (
                        <span className="cifras">
                          {kmh(v.croquis_kmh)} ({v.error_pct! >= 0 ? "+" : ""}
                          {v.error_pct!.toFixed(2)} %)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {k.posiciones.cesvi ? (
              <div>
                <span className="t-nota">Posiciones finales</span>
                <ul className="flex flex-col gap-1">
                  {caso.posiciones
                    .filter((p) => p.fase === "final")
                    .map((p, i) => (
                      <li key={i} className="t-interfaz">
                        {p.vehiculo} · {p.descripcion}
                      </li>
                    ))}
                </ul>
                <span className="t-nota">
                  Croquis tiene {k.posiciones.croquis_las_tiene} de {k.posiciones.cesvi} que
                  describe CESVI.
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="tarjeta flex flex-col gap-4 p-6" data-testid="reconstruccion-r4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="t-subtitulo">La reconstrucción de Croquis en 2D y 3D</h2>
            <button
              type="button"
              className="boton-principal"
              onClick={() => void reconstruir()}
              data-testid="reconstruir-r4"
            >
              {r ? "Volver a reconstruir" : "Reconstruir"}
            </button>
          </div>
          <p className="t-nota text-texto-2">
            Sin posiciones medidas en el mapa, la disposición de los vehículos es la genérica
            (supuesto) y la física no fija velocidades: es lo que Croquis puede reconstruir solo con
            la narración. Con las posiciones del perito, en «Caso nuevo», la reconstrucción las usa
            como evidencia.
          </p>
          {estado ? <p className="t-nota">{estado}</p> : null}
          {r && spec ? (
            <div className="flex flex-col gap-6">
              <div className="hundido overflow-hidden p-2" data-testid="croquis-2d-r4">
                <Croquis spec={spec} readOnly showFinal scale={10} />
              </div>
              <div data-testid="visor-r4">
                <VisorEscena
                  spec={spec}
                  escena="propia"
                  controles={controles}
                  onControl={(key, v) =>
                    setControles((x) => {
                      if (key === "completa") return { ...x, completa: v !== null };
                      if (key === "camara") return { ...x, camara: v ?? "libre" };
                      if (key === "calidad")
                        return { ...x, calidad: (v ?? "auto") as ControlesVisor["calidad"] };
                      return { ...x, renderer: (v ?? "auto") as ControlesVisor["renderer"] };
                    })
                  }
                />
              </div>
            </div>
          ) : null}
          {r?.limites.length ? (
            <ul className="flex flex-col gap-1.5">
              {r.limites.map((l) => (
                <li
                  key={l}
                  className="rounded-control bg-[var(--falta-fondo)] px-3 py-2 text-sm text-senal-texto"
                >
                  {l}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <p className="t-nota text-texto-3">Reconstrucción de apoyo · el dictamen es del perito.</p>
      </div>
    </main>
  );
}
