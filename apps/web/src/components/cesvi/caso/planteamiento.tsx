"use client";
/**
 * «La incógnita»: la pantalla de Reconstrucción antes de reconstruir (ronda 2, A6; René eligió esta
 * propuesta el 2026-11-16). Antes era un mapa lejano con los marcadores encimados y un panel casi
 * vacío. Ahora es el planteamiento del problema:
 *
 * - a la izquierda, el croquis de lo que el perito colocó (dónde quedó cada vehículo y el choque),
 *   encuadrado a esa evidencia, con de dónde salió cada cosa y, punteado, por dónde llegó cada uno
 *   con su «? km/h»: lo que se va a calcular;
 * - a la derecha, la pregunta con un signo del tamaño de la respuesta, lo que la fija, lo supuesto y
 *   el botón «Reconstruir». Al reconstruir, la cifra aparece en ese mismo lugar.
 *
 * No calcula nada: solo dibuja lo que ya está en el expediente.
 */
import { enMetros, type LonLat } from "@croquis/cesvi";
import { useEffect, useMemo, useRef, useState } from "react";
import { contornoVehiculo } from "@/lib/colocar";
import { enLista } from "@/lib/pasos-caso";
import type { Calle, LineaResumen } from "@/lib/escena-facil";
import type { HuellaMapa } from "./piezas";
import type { EstadoReconstruccion } from "./reconstruccion";

/** De dónde salió algo colocado, como lo dice la app. */
export function origenDe(fuente: string | undefined): string {
  if (fuente === "supuesto") return "supuesto";
  if (fuente === "relato" || fuente === "dictamen" || fuente === "importado") return "narración";
  return "lo marcaste";
}

export interface ImpactoPlanteado {
  orden: number;
  punto: { lat: number; lon: number };
  fuente?: string;
}

/** Cuánto se dibuja de la llegada de cada vehículo antes del choque (m). */
const LLEGADA_M = 12;
const ESCALAS_M = [1, 2, 5, 10, 20, 50] as const;

interface Caja {
  ancho: number;
  alto: number;
}

/** La geometría del planteamiento en pixeles: todo cabe en la caja, con sitio para las etiquetas. */
export function geometriaPlanteamiento(
  huellas: readonly HuellaMapa[],
  impactos: readonly ImpactoPlanteado[],
  caja: Caja,
) {
  const ll = (p: { lat: number; lon: number }): LonLat => [p.lon, p.lat];
  const finales = huellas.filter((h) => h.fase === "final");
  const deImpacto = huellas.filter((h) => h.fase === "impacto");
  const ancla = impactos[0]?.punto ?? finales[0]?.punto ?? deImpacto[0]?.punto ?? null;
  if (!ancla || caja.ancho < 80 || caja.alto < 80) return null;
  const origen = ll(ancla);
  const m = (p: LonLat) => enMetros(p, origen);
  const rad = (g: number) => (g * Math.PI) / 180;
  // Por dónde llegó cada uno: de `LLEGADA_M` atrás de su pose de impacto, hacia ella.
  const llegadas = deImpacto.map((h) => {
    const c = m(ll(h.punto));
    const frente = h.largo / 2;
    const [se, sn] = [Math.sin(rad(h.rumbo)), Math.cos(rad(h.rumbo))];
    return {
      vehiculo: h.vehiculo,
      desde: {
        este: c.este - se * (LLEGADA_M + frente),
        norte: c.norte - sn * (LLEGADA_M + frente),
      },
      hasta: { este: c.este - se * frente, norte: c.norte - sn * frente },
      rumbo: h.rumbo,
    };
  });
  const contornos = finales.map((h) => ({
    vehiculo: h.vehiculo,
    fuente: h.fuente,
    centro: m(ll(h.punto)),
    puntos: contornoVehiculo(
      ll(h.punto),
      h.rumbo,
      h.largo,
      h.ancho,
      h.clase ?? "sedan_mediano",
    ).map((p) => m(p)),
  }));
  const choques = impactos.map((i) => ({ orden: i.orden, fuente: i.fuente, ...m(ll(i.punto)) }));
  const todos = [
    ...contornos.flatMap((c) => c.puntos),
    ...choques,
    ...llegadas.flatMap((l) => [l.desde, l.hasta]),
  ];
  const [e0, e1] = [Math.min(...todos.map((p) => p.este)), Math.max(...todos.map((p) => p.este))];
  const [n0, n1] = [Math.min(...todos.map((p) => p.norte)), Math.max(...todos.map((p) => p.norte))];
  // Márgenes: arriba van las pestañas; a la derecha, la columna de etiquetas.
  const angosta = caja.ancho < 620;
  const margen = { izq: 40, der: angosta ? 40 : 250, arriba: 84, abajo: 56 };
  const util = {
    ancho: Math.max(60, caja.ancho - margen.izq - margen.der),
    alto: Math.max(60, caja.alto - margen.arriba - margen.abajo),
  };
  const escala = Math.min(26, util.ancho / Math.max(4, e1 - e0), util.alto / Math.max(4, n1 - n0));
  const cx = margen.izq + util.ancho / 2;
  const cy = margen.arriba + util.alto / 2;
  const px = (p: { este: number; norte: number }) => ({
    x: cx + (p.este - (e0 + e1) / 2) * escala,
    y: cy - (p.norte - (n0 + n1) / 2) * escala,
  });
  // La barra de escala: la medida redonda que quede más cerca de 110 px.
  const metros = ESCALAS_M.reduce((a, b) =>
    Math.abs(b * escala - 110) < Math.abs(a * escala - 110) ? b : a,
  );
  return {
    escala,
    px,
    m,
    angosta,
    columna: caja.ancho - margen.der + 26,
    barra: { metros, px: metros * escala },
    llegadas: llegadas.map((l) => ({ ...l, a: px(l.desde), b: px(l.hasta) })),
    contornos: contornos.map((c) => ({ ...c, c: px(c.centro), pts: c.puntos.map(px) })),
    choques: choques.map((c) => ({ ...c, ...px(c) })),
  };
}

/** Reparte las etiquetas en la columna: en el orden de lo que señalan, sin encimarse. */
export function repartirEtiquetas<T extends { y: number }>(
  items: readonly T[],
  minimo: number,
  tope: { arriba: number; abajo: number },
): (T & { ey: number })[] {
  const orden = [...items].sort((a, b) => a.y - b.y);
  const out: (T & { ey: number })[] = [];
  let previo = -Infinity;
  for (const it of orden) {
    const ey = Math.max(tope.arriba, it.y, previo + minimo);
    out.push({ ...it, ey });
    previo = ey;
  }
  // Si se salieron por abajo, se recorren hacia arriba.
  const sobra = (out.at(-1)?.ey ?? 0) - tope.abajo;
  if (sobra > 0) for (const o of out) o.ey = Math.max(tope.arriba, o.ey - sobra);
  return out;
}

export function CroquisPlanteamiento({
  huellas,
  impactos,
  calles,
  letraDe,
  nombreDe,
}: {
  huellas: readonly HuellaMapa[];
  impactos: readonly ImpactoPlanteado[];
  /** Las calles del mapa, si ya llegaron: se dibujan tenues, para ubicar. */
  calles: readonly Calle[];
  letraDe: (id: string) => string;
  nombreDe: (id: string) => string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState<Caja>({ ancho: 0, alto: 0 });
  useEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const medir = () => setTam({ ancho: el.clientWidth, alto: el.clientHeight });
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    medir();
    return () => obs.disconnect();
  }, []);
  const g = useMemo(() => geometriaPlanteamiento(huellas, impactos, tam), [huellas, impactos, tam]);
  const etiquetas = g
    ? repartirEtiquetas(
        [
          ...g.contornos.map((c) => ({
            clave: `v-${c.vehiculo}`,
            x: c.c.x,
            y: c.c.y,
            texto: `${nombreDe(c.vehiculo)}, donde quedó`,
            origen: origenDe(c.fuente),
            senal: false,
          })),
          ...g.choques.map((c) => ({
            clave: `x-${c.orden}`,
            x: c.x,
            y: c.y,
            texto: g.choques.length > 1 ? `El choque ${c.orden}` : "El choque",
            origen: origenDe(c.fuente),
            senal: true,
          })),
        ],
        46,
        { arriba: 110, abajo: tam.alto - 70 },
      )
    : [];
  return (
    <div
      ref={caja}
      className="planteamiento absolute inset-0 overflow-hidden"
      data-testid="croquis-planteamiento"
    >
      {g ? (
        <svg
          width={tam.ancho}
          height={tam.alto}
          role="img"
          aria-label={`Lo que se va a reconstruir: ${enLista(etiquetas.map((e) => `${e.texto} (${e.origen})`))}. Por calcular: la velocidad con que llegó cada vehículo.`}
        >
          {calles.map((c, k) => (
            <polyline
              key={k}
              className="pl-calle"
              strokeWidth={Math.max(6, c.ancho * g.escala)}
              points={c.puntos
                .map((p) => g.px(g.m(p)))
                .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                .join(" ")}
            />
          ))}
          {g.llegadas.map((l) => {
            const ang = (Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x) * 180) / Math.PI;
            const medio = { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
            // El «? km/h» va a un lado de la línea, del lado que queda dentro del dibujo.
            const lado =
              Math.abs(Math.cos((ang * Math.PI) / 180)) > 0.5 ? { x: 0, y: -14 } : { x: 16, y: 0 };
            return (
              <g key={l.vehiculo} data-testid={`llegada-${l.vehiculo}`}>
                <path className="pl-llegada" d={`M${l.a.x} ${l.a.y}L${l.b.x} ${l.b.y}`} />
                <path
                  className="pl-punta"
                  d="M0 0l-13 -6.5v13z"
                  transform={`translate(${l.b.x} ${l.b.y}) rotate(${ang})`}
                />
                <text
                  className="pl-incognita"
                  x={medio.x + lado.x}
                  y={medio.y + lado.y}
                  textAnchor={lado.x ? "start" : "middle"}
                >
                  ? km/h
                </text>
              </g>
            );
          })}
          {g.choques.map((c) => (
            <g key={c.orden}>
              <circle className="pl-anillo" cx={c.x} cy={c.y} r={Math.max(12, 1.1 * g.escala)} />
              <circle className="pl-punto" cx={c.x} cy={c.y} r={5} />
            </g>
          ))}
          {g.angosta
            ? null
            : etiquetas.map((e) => (
                <g key={e.clave}>
                  <path
                    className={e.senal ? "pl-guia pl-guia-senal" : "pl-guia"}
                    d={`M${e.x} ${e.y}L${g.columna - 34} ${e.ey - 4}H${g.columna - 8}`}
                  />
                  <text
                    className={e.senal ? "pl-etiqueta pl-etiqueta-senal" : "pl-etiqueta"}
                    x={g.columna}
                    y={e.ey}
                  >
                    {e.texto}
                  </text>
                  <text className="pl-origen" x={g.columna} y={e.ey + 15}>
                    {e.origen.toUpperCase()}
                  </text>
                </g>
              ))}
          {g.contornos.map((c) => (
            <g key={c.vehiculo}>
              <polygon
                className="pl-vehiculo"
                points={c.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
              />
              <text className="pl-letra" x={c.c.x} y={c.c.y + 4} textAnchor="middle">
                {letraDe(c.vehiculo)}
              </text>
            </g>
          ))}
        </svg>
      ) : (
        <p className="t-nota grid h-full place-items-center px-6 text-center">
          Aún no hay nada colocado. Coloca el choque y los vehículos en «La escena».
        </p>
      )}
      {g ? (
        <div className="pl-escala" aria-label={`Escala: la barra mide ${g.barra.metros} metros`}>
          <span aria-hidden="true">N ↑</span>
          <span className="pl-barra" style={{ width: `${g.barra.px}px` }} aria-hidden="true" />
          <span>{g.barra.metros} m</span>
        </div>
      ) : null}
    </div>
  );
}

export function PanelIncognita({
  nombres,
  lineas,
  rec,
}: {
  /** Los vehículos cuya velocidad se va a calcular («A · Jetta»). */
  nombres: readonly string[];
  /** Lo que el perito marcó y lo supuesto (los renglones de «¡La escena está lista!»). */
  lineas: readonly LineaResumen[];
  rec: EstadoReconstruccion;
}) {
  const marcado = lineas.filter((l) => !l.supuesto);
  const supuesto = lineas.filter((l) => l.supuesto);
  const calculando = rec.recalculando;
  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-3"
      data-testid="reconstruccion"
      data-fase={calculando ? "calculando" : "planteamiento"}
    >
      <p className="t-rotulo">{calculando ? "Reconstruyendo" : "La incógnita"}</p>
      <h2 className="font-[family-name:var(--fuente-titulo)] text-[2.25rem] leading-none font-normal tracking-[-0.03em]">
        {nombres.length === 1
          ? `¿A qué velocidad venía ${nombres[0]}?`
          : "¿A qué velocidad venían?"}
      </h2>
      <p className="flex items-end gap-3" aria-hidden="true">
        <span
          className="cifra-protagonista incognita-signo text-[clamp(5rem,10.6vw,9.5rem)]"
          data-calculando={calculando ? "si" : "no"}
        >
          ?
        </span>
        <span className="flex flex-col pb-2">
          <span className="text-[1.4rem]">km/h</span>
          {nombres.length > 1 ? <span className="t-nota">{enLista([...nombres])}</span> : null}
        </span>
      </p>
      <div className="flex flex-col gap-2">
        {rec.estado ? (
          <p role="status" className="t-interfaz" data-testid="estado-reconstruccion">
            {calculando
              ? "Croquis busca las velocidades con las que la física termina donde quedaron, con ese daño…"
              : rec.estado}
          </p>
        ) : null}
        <button
          type="button"
          className="boton-principal min-h-[60px] w-full text-[1.0625rem]"
          onClick={() => void rec.reconstruir()}
          disabled={calculando}
          data-testid="reconstruir"
        >
          {calculando ? "Reconstruyendo…" : "Reconstruir"}
        </button>
        <p className="t-nota">
          Tarda unos segundos. Lo que la evidencia no fija, se dice; ningún número se inventa.
        </p>
      </div>
      {marcado.length ? (
        <>
          <p className="t-rotulo pt-1">Lo que marcaste</p>
          <ul
            className="flex flex-col divide-y divide-[var(--linea-suave)] border-y border-linea-suave"
            data-testid="planteamiento-marcado"
          >
            {marcado.map((l, k) => (
              <li key={k} className="flex flex-col py-2">
                <span className="text-[0.875rem]">{l.texto}</span>
                {l.detalle ? <span className="t-nota">{l.detalle}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {supuesto.length ? (
        <>
          <p className="t-rotulo pt-1">Supuestos: se declaran en el dictamen</p>
          <ul
            className="flex flex-col divide-y divide-[var(--linea-suave)] border-y border-linea-suave"
            data-testid="planteamiento-supuestos"
          >
            {supuesto.map((l, k) => (
              <li key={k} className="flex flex-col py-2">
                <span className="text-[0.875rem]">{l.texto}</span>
                <span className="t-nota">{l.supuesto}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
