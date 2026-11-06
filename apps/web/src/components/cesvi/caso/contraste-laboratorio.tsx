"use client";
/**
 * «Contra CESVI» (rediseño «Laboratorio», prompt §8): el conteo de criterios, las dos cifras con su
 * diferencia en km/h y en %, la regla con los dos marcadores, los criterios, los dos croquis y las
 * citas exactas del reporte. La tabla con cada número queda en el detalle.
 */
import type { CasoCesvi, ComparacionDictamen, Reconstruccion } from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import type { ReporteCesvi } from "@/lib/caso-guardado";
import {
  cifraContraste,
  conteoCriterios,
  criteriosContraste,
  reglaContraste,
  type EstadoCriterio,
} from "@/lib/contraste-lab";
import { METODO } from "@/lib/textos-caso";
import { MaquetaCaso } from "../escena/maqueta-caso";
import { Cuenta, Desliza } from "../movimiento";
import { Reproduccion } from "../reproduccion";
import { DetalleContraReporte } from "./pasos";
import { CARA } from "./piezas";

const ETIQUETA: Record<EstadoCriterio, string> = {
  coincide: "Coincide",
  difiere: "Difiere",
  sin_dato: "Sin dato",
};

/** Lleno si coincide, con una equis si difiere y punteado si no hay dato. */
function IconoCriterio({ estado }: { estado: EstadoCriterio }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      {estado === "coincide" ? (
        <>
          <circle cx={12} cy={12} r={11} fill="var(--texto)" />
          <path d="M7 12.5 10.5 16 17 9" fill="none" stroke="var(--fondo)" strokeWidth={2} />
        </>
      ) : estado === "difiere" ? (
        <>
          <circle cx={12} cy={12} r={11} fill="var(--senal)" />
          <path d="M8 8l8 8M16 8l-8 8" stroke="var(--fondo)" strokeWidth={2} />
        </>
      ) : (
        <>
          <circle
            cx={12}
            cy={12}
            r={10.5}
            fill="none"
            stroke="var(--texto-3)"
            strokeDasharray="3 3"
          />
          <path d="M8 12h8" stroke="var(--texto-3)" strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}

/**
 * El esquema de papel con lo que el reporte dice en datos: sus arroyos y el orden del alcance. El
 * reporte no da posiciones, así que no es un dibujo a escala ni la imagen del reporte.
 */
function EsquemaDelReporte({ caso }: { caso: CasoCesvi }) {
  const n = caso.lugar.arroyos.length;
  const ancho = 70 / Math.max(1, n);
  return (
    <svg
      viewBox="0 0 150 210"
      className="h-full w-full rounded-control"
      style={{ background: "#faf8f3" }}
      role="img"
      aria-label={`Esquema con los datos del reporte: ${n} arroyos; el vehículo B alcanza al A.`}
      data-testid="esquema-reporte"
    >
      <g transform="rotate(-12 75 105)" stroke="#2a2a28" fill="none" strokeWidth={0.8}>
        {caso.lugar.arroyos.map((a, k) => {
          const x = 30 + k * (ancho + 10);
          return (
            <g key={`${a.sentido}-${k}`}>
              <line x1={x} y1={-30} x2={x} y2={240} />
              <line x1={x + ancho} y1={-30} x2={x + ancho} y2={240} />
              <line x1={x + ancho / 2} y1={-30} x2={x + ancho / 2} y2={240} strokeDasharray="5 5" />
            </g>
          );
        })}
        <rect x={30 + ancho / 4 - 5} y={56} width={10} height={24} rx={2} fill="#faf8f3" />
        <rect x={30 + ancho / 4 - 5} y={114} width={10} height={24} rx={2} fill="#2a2a28" />
        <path
          d={`M ${30 + ancho / 4 - 3} 84 l 6 6 m 0 -6 l -6 6`}
          stroke="var(--senal)"
          strokeWidth={1.4}
        />
        <text
          x={30 + ancho / 4}
          y={70}
          fontSize={8}
          textAnchor="middle"
          fill="#2a2a28"
          stroke="none"
        >
          A
        </text>
        <text
          x={30 + ancho / 4}
          y={128}
          fontSize={8}
          textAnchor="middle"
          fill="#faf8f3"
          stroke="none"
        >
          B
        </text>
      </g>
    </svg>
  );
}

export function ActoContraste({
  reporte,
  comparacion: k,
  caso,
  r,
  calles,
  letraDe,
}: {
  reporte: ReporteCesvi;
  comparacion: ComparacionDictamen;
  /** El caso con sus datos del reporte (AXA); los reportes importados no traen geometría. */
  caso: CasoCesvi | null;
  r: Reconstruccion | null;
  calles: OverpassResponse | null;
  letraDe: (id: string) => string;
}) {
  const criterios = criteriosContraste(k);
  const n = conteoCriterios(criterios);
  const f = cifraContraste(k);
  const regla = f ? reglaContraste(f.croquis, f.cesvi) : null;
  const citas = reporte.conclusiones.zonas_contacto.filter((z) => z.cita);
  return (
    <div className="flex flex-col gap-5" data-testid="contra-reporte">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-[family-name:var(--fuente-titulo)] text-[3.75rem] leading-none font-normal tracking-[-0.03em]">
          Contra el reporte de CESVI
        </h2>
        <p className="flex gap-5 text-[0.9375rem] text-texto-2" data-testid="conteo-contra">
          <span>
            <b className="text-texto">{n.coinciden}</b>{" "}
            {n.coinciden === 1 ? "coincide" : "coinciden"}
          </span>
          <span>
            <b className="text-texto">{n.difieren}</b> {n.difieren === 1 ? "difiere" : "difieren"}
          </span>
          <span>
            <b className="text-texto">{n.sinDato}</b> sin dato
          </span>
        </p>
      </header>

      {f && regla ? (
        <section className="escena-hoja flex flex-col gap-4 p-8" data-testid="cifra-contra">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-semibold">
              {letraDe(f.vehiculo)} · {f.que}
            </h3>
            <span className="t-nota">{METODO.cesvi} · km/h</span>
          </header>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-wrap gap-14">
              <div className="flex flex-col gap-1">
                <Cuenta
                  valor={f.croquis}
                  decimales={2}
                  className="cifra-protagonista text-[clamp(4rem,9vw,8rem)]"
                  testid="cifra-contra-croquis"
                />
                <span className="t-nota">Croquis, con las medidas del reporte</span>
              </div>
              <div className="flex flex-col gap-1">
                <Cuenta
                  valor={f.cesvi}
                  decimales={2}
                  className="cifra-protagonista text-[clamp(4rem,9vw,8rem)] text-texto-2"
                  testid="cifra-contra-cesvi"
                />
                <span className="t-nota">Reporte de CESVI</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Cuenta
                valor={f.difPct}
                decimales={1}
                sufijo=" %"
                className="cifra-protagonista text-[3.25rem] leading-none"
                testid="cifra-contra-pct"
              />
              <span className="t-nota" data-testid="cifra-contra-kmh">
                diferencia · {f.difKmh.toFixed(2)} km/h
              </span>
            </div>
          </div>
          <div className="relative mt-2 h-12" data-testid="regla-contra">
            <div className="absolute inset-x-0 top-3 h-px bg-linea" />
            {regla.marcas.map((m) => (
              <div key={m.kmh} className="absolute top-0" style={{ left: `${m.pos}%` }}>
                <span className="absolute top-1 h-2 w-px bg-linea" />
                <span className="absolute top-6 -translate-x-1/2 font-mono text-[0.6875rem] text-texto-3">
                  {m.kmh}
                </span>
              </div>
            ))}
            <span
              className="absolute top-2 h-2 bg-superficie-alta"
              style={{
                left: `${Math.min(regla.croquis, regla.cesvi)}%`,
                width: `${Math.abs(regla.croquis - regla.cesvi)}%`,
              }}
            />
            <Desliza
              pos={regla.cesvi}
              className="absolute top-0 h-6 w-0.5 -translate-x-1/2 bg-texto-2"
              tip={`Reporte de CESVI: ${f.cesvi.toFixed(2)} km/h, de su conclusión`}
            />
            <Desliza
              pos={regla.croquis}
              className="absolute top-0 h-6 w-0.5 -translate-x-1/2 bg-texto"
              tip={`Croquis: ${f.croquis.toFixed(2)} km/h, con las medidas del reporte y el método de CESVI`}
            />
          </div>
        </section>
      ) : (
        <p className="t-nota" data-testid="sin-cifra-contra">
          El reporte no trae una velocidad por deformación que Croquis pueda calcular con sus
          medidas: no hay cifra que comparar. Lo demás está abajo.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="escena-hoja flex flex-col p-7">
          <h3 className="mb-3 font-semibold">Criterios</h3>
          <ul className="flex flex-col divide-y divide-[var(--linea-suave)] border-t border-linea-suave">
            {criterios.map((c) => (
              <li
                key={c.clave}
                className="fila-resalta flex items-center gap-3 py-3"
                data-estado={c.estado}
                data-testid={`eje-${c.clave}`}
              >
                <IconoCriterio estado={c.estado} />
                <div className="min-w-0 flex-1">
                  <span className="block font-semibold">{c.nombre}</span>
                  <span className="t-nota block">{c.detalle}</span>
                </div>
                <span className="t-nota shrink-0">{ETIQUETA[c.estado]}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="escena-hoja grid gap-6 p-7 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="font-semibold">Lado a lado</h3>
            <div className="grid grid-cols-2 gap-3">
              <figure className="flex min-w-0 flex-col gap-1.5">
                <div className="h-52 overflow-hidden rounded-control">
                  {caso ? (
                    <EsquemaDelReporte caso={caso} />
                  ) : (
                    <p className="t-nota grid h-full place-items-center bg-superficie-alta p-3 text-center">
                      El reporte no trae su croquis como datos.
                    </p>
                  )}
                </div>
                <figcaption className="t-nota">
                  CESVI · {caso ? "esquema con los datos del reporte, no es su imagen" : "sin dato"}
                </figcaption>
              </figure>
              <figure className="flex min-w-0 flex-col gap-1.5">
                <div className="h-52 overflow-hidden rounded-control bg-superficie-alta">
                  {r ? (
                    <MaquetaCaso r={r} calles={calles} nombres={{}} compacta />
                  ) : (
                    <p className="t-nota grid h-full place-items-center p-3 text-center">
                      Reconstruye para verlo.
                    </p>
                  )}
                </div>
                <figcaption className="t-nota">Croquis · reconstruido</figcaption>
              </figure>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3" data-testid="citas-contra">
            <h3 className="font-semibold">De dónde sale cada dato</h3>
            {citas.length ? (
              citas.map((z, i) => (
                <blockquote key={i} className="border-l border-linea pl-4">
                  <span className="t-nota block">
                    {letraDe(String(z.vehiculo))} · {CARA[z.cara] ?? z.cara}
                    {z.tercio ? `, ${z.tercio}` : ""}
                  </span>
                  <span className="font-[family-name:var(--fuente-titulo)] text-[1.15rem] leading-snug italic">
                    «{z.cita.replace(/\s+/g, " ").trim()}»
                  </span>
                </blockquote>
              ))
            ) : (
              <p className="t-nota">El reporte no trae citas de las zonas de contacto.</p>
            )}
          </div>
        </section>
      </div>

      <details data-testid="detalle-contra">
        <summary
          className="t-nota cursor-pointer py-1 font-medium text-texto"
          data-testid="ver-detalle-contra"
        >
          Ver cada número del reporte junto al de Croquis
        </summary>
        <div className="flex flex-col gap-8 pt-4">
          <DetalleContraReporte reporte={reporte} comparacion={k} />
          {caso ? <Reproduccion caso={caso} /> : null}
        </div>
      </details>
    </div>
  );
}
