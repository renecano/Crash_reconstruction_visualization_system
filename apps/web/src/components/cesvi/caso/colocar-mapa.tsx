"use client";
/**
 * Colocar en el mapa (comentario de René, 2026-10-24, punto 3), sobre el mapa del paso del lugar:
 *
 * - **bandeja:** lo que falta colocar (el impacto X1 y V1, V2…) se arrastra al mapa; al soltarlo, el
 *   vehículo toma el rumbo de la calle más cercana (`rumboDeCalle`) y se voltea 180° si hace falta;
 * - **anillo:** alrededor del vehículo elegido; el rumbo es el ángulo del cursor respecto de su
 *   centro, absoluto y 1:1, con imán de 15° (Shift lo suelta). Mientras se arrastra, solo cambia el
 *   `transform` de la silueta y del anillo, en `requestAnimationFrame` y con captura del puntero: el
 *   expediente (y con él el mapa y el panel) cambia una sola vez, al soltar;
 * - **fantasmas:** las poses que propone Croquis, punteadas, con «Aceptar» por vehículo;
 * - **en vivo,** la distancia al punto de impacto.
 *
 * Q y E giran ±5° y los botones del panel, ±15° y 180°.
 *
 * Colocación rehecha (René, 2026-11-04, B), en tres pasos:
 * 1. el toque del impacto;
 * 2. por dónde venía cada vehículo, uno a la vez: flechas grandes sobre los carriles junto a su pose
 *    de impacto, con la de Croquis marcada;
 * 3. dónde quedó: una pieza fantasma con su silueta que se arrastra al lugar (o un toque al mapa).
 *
 * Las siluetas son por clase, la trayectoria de cada uno va punteada (inicio → impacto → reposo) y la
 * leyenda se queda fija en una esquina.
 */
import { distanciaM } from "@croquis/cesvi";
import type { Map as MapaMl } from "maplibre-gl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type Direccion,
  direccionesCandidatas,
  metrosPorPixel,
  normalizar,
  PASO_TECLA_GRADOS,
  rumboDeCalle,
  rumboDesdePuntero,
  siluetaClase,
} from "@/lib/colocar";

type Punto = { lat: number; lon: number };

/** Algo que falta colocar: un chip de la bandeja. */
export interface Colocable {
  clave: string;
  etiqueta: string;
  largo: number;
  ancho: number;
  color: string;
  /** La clase del vehículo, para su silueta. */
  clase?: string;
}

/** Una pose en el mapa: la elegida (con su anillo) o un fantasma de Croquis. */
export interface PoseMapa {
  clave: string;
  vehiculo: string;
  punto: Punto;
  rumbo: number;
  largo: number;
  ancho: number;
  color: string;
  clase?: string;
}

/** Las flechas de dirección del paso 2, alrededor de la pose de impacto de un vehículo. */
export interface DireccionesMapa {
  vehiculo: string;
  punto: Punto;
  /** El rumbo que propone Croquis (el de su pose de impacto). */
  propuesta: number;
  color: string;
}

/** La trayectoria punteada de un vehículo: inicio (si lo hay), impacto y reposo. */
export interface TrayectoriaMapa {
  vehiculo: string;
  color: string;
  puntos: Punto[];
}

/** Distancia (px) del centro a la que van las flechas del paso 2. */
const RADIO_FLECHAS_PX = 78;

/** La silueta de una clase en la caja de 1 × 1 (frente arriba), punteada o llena. */
function Silueta({ clase, color, llena }: { clase?: string; color: string; llena: boolean }) {
  return (
    <svg
      viewBox="-0.55 -0.55 1.1 1.1"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full overflow-visible"
    >
      <path
        d={siluetaClase(clase ?? "")}
        fill={color}
        fillOpacity={llena ? 0.85 : 0.14}
        stroke={llena ? "var(--fondo)" : color}
        strokeWidth={llena ? 1 : 2}
        strokeDasharray={llena ? undefined : "4 3"}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

declare global {
  interface Window {
    /** Medición del giro (eval/giro-mapa.mjs): cuadros dibujados y su tiempo mientras se arrastra. */
    __croquisGiro?: { cuadros: number; ms: number };
  }
}

/** Las líneas de calles dibujadas cerca de un punto de la pantalla (mosaicos de OpenMapTiles). */
function callesCerca(m: MapaMl, x: number, y: number): [number, number][][] {
  const r = 60;
  const fs = m.queryRenderedFeatures([
    [x - r, y - r],
    [x + r, y + r],
  ]);
  const lineas: [number, number][][] = [];
  for (const f of fs) {
    if (f.sourceLayer !== "transportation") continue;
    const g = f.geometry;
    if (g.type === "LineString") lineas.push(g.coordinates as [number, number][]);
    else if (g.type === "MultiLineString")
      for (const l of g.coordinates) lineas.push(l as [number, number][]);
  }
  return lineas;
}

const distanciaTexto = (a: Punto, b: Punto) =>
  `a ${distanciaM([a.lon, a.lat], [b.lon, b.lat]).toFixed(1)} m del impacto`;

export function ColocarMapa({
  mapa,
  bandeja,
  seleccion,
  fantasmas,
  impacto,
  rumboPreferido,
  onSoltar,
  onGirar,
  onAceptar,
  direcciones = null,
  onDireccion,
  piezaFinal = null,
  trayectorias = [],
}: {
  mapa: MapaMl;
  bandeja: Colocable[];
  seleccion: PoseMapa | null;
  fantasmas: PoseMapa[];
  impacto: Punto | null;
  /** El rumbo con que conviene orientar algo al soltarlo (p. ej. el de su pose de impacto). */
  rumboPreferido: (clave: string) => number | null;
  onSoltar: (clave: string, punto: Punto, rumbo: number) => void;
  onGirar: (rumbo: number) => void;
  onAceptar: (vehiculo: string) => void;
  /** Paso 2: las flechas por las que pudo llegar el vehículo de este momento. */
  direcciones?: DireccionesMapa | null;
  onDireccion?: (vehiculo: string, rumbo: number) => void;
  /** Paso 3: la pieza fantasma del vehículo que falta, para arrastrarla a donde quedó. */
  piezaFinal?: (Colocable & { punto: Punto; rumbo: number }) | null;
  trayectorias?: TrayectoriaMapa[];
}) {
  const capa = useRef<HTMLDivElement>(null);
  const anillo = useRef<HTMLDivElement>(null);
  const silueta = useRef<SVGPathElement>(null);
  const flechas = useRef<HTMLDivElement>(null);
  const flechasRef = useRef<(HTMLButtonElement | null)[]>([]);
  const pieza = useRef<HTMLDivElement>(null);
  const trazos = useRef<(SVGPolylineElement | null)[]>([]);
  const circulo = useRef<SVGCircleElement>(null);
  const asa = useRef<SVGCircleElement>(null);
  const banda = useRef<SVGCircleElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const rotulo = useRef<HTMLSpanElement>(null);
  const fantasmasRef = useRef<(HTMLDivElement | null)[]>([]);
  const arrastre = useRef<HTMLDivElement>(null);
  const arrastreTexto = useRef<HTMLSpanElement>(null);
  // Lo que cambia mientras se arrastra vive en refs: no pasa por React hasta soltar.
  const vivo = useRef({ rumbo: seleccion?.rumbo ?? 0, girando: false, cuadro: 0 });
  const puntero = useRef({ x: 0, y: 0, libre: false });
  const [arrastrando, setArrastrando] = useState<Colocable | null>(null);
  // Las flechas salen de las calles dibujadas cerca del punto: se recalculan cuando el mapa termina
  // de cargar sus mosaicos.
  const [opciones, setOpciones] = useState<Direccion[]>([]);
  const dVehiculo = direcciones?.vehiculo ?? null;
  const dLat = direcciones?.punto.lat ?? 0;
  const dLon = direcciones?.punto.lon ?? 0;
  const dPropuesta = direcciones?.propuesta ?? 0;
  useEffect(() => {
    if (dVehiculo === null) {
      const r = requestAnimationFrame(() => setOpciones([]));
      return () => cancelAnimationFrame(r);
    }
    const calcular = () => {
      const p = mapa.project([dLon, dLat]);
      setOpciones(direccionesCandidatas(callesCerca(mapa, p.x, p.y), [dLon, dLat], dPropuesta));
    };
    const r = requestAnimationFrame(calcular);
    mapa.on("idle", calcular);
    return () => {
      cancelAnimationFrame(r);
      mapa.off("idle", calcular);
    };
  }, [mapa, dVehiculo, dLat, dLon, dPropuesta]);
  const datos = useRef({
    seleccion,
    fantasmas,
    impacto,
    direcciones,
    opciones,
    piezaFinal,
    trayectorias,
  });
  const dibujar = useRef(() => {});
  // Las props de ahora y la función que dibuja: se actualizan después de cada render.
  useLayoutEffect(() => {
    datos.current = {
      seleccion,
      fantasmas,
      impacto,
      direcciones,
      opciones,
      piezaFinal,
      trayectorias,
    };
    /** Coloca el anillo, la silueta y los fantasmas sobre el mapa (un cuadro). */
    dibujar.current = () => {
      const bearing = mapa.getBearing();
      const zoom = mapa.getZoom();
      const s = datos.current.seleccion;
      if (s && anillo.current && svg.current && silueta.current && circulo.current && asa.current) {
        const p = mapa.project([s.punto.lon, s.punto.lat]);
        const mpp = metrosPorPixel(s.punto.lat, zoom);
        const largo = s.largo / mpp;
        const ancho = s.ancho / mpp;
        const radio = Math.max(40, Math.max(largo, ancho) / 2 + 22);
        const lado = 2 * radio + 24;
        const c = lado / 2;
        anillo.current.style.transform = `translate(${p.x - c}px, ${p.y - c}px)`;
        svg.current.setAttribute("width", String(lado));
        svg.current.setAttribute("height", String(lado));
        circulo.current.setAttribute("cx", String(c));
        circulo.current.setAttribute("cy", String(c));
        circulo.current.setAttribute("r", String(radio));
        for (const [k, v] of [
          ["cx", c],
          ["cy", c],
          ["r", radio],
        ] as const)
          banda.current?.setAttribute(k, String(v));
        const r = vivo.current.girando ? vivo.current.rumbo : s.rumbo;
        const giro = r - bearing;
        silueta.current.setAttribute(
          "transform",
          `translate(${c} ${c}) rotate(${giro}) scale(${ancho} ${largo})`,
        );
        const a = (giro * Math.PI) / 180;
        asa.current.setAttribute("cx", String(c + radio * Math.sin(a)));
        asa.current.setAttribute("cy", String(c - radio * Math.cos(a)));
        if (rotulo.current) {
          const imp = datos.current.impacto;
          rotulo.current.textContent = `${Math.round(normalizar(r))}°${
            imp && s.clave.startsWith("final") ? ` · ${distanciaTexto(s.punto, imp)}` : ""
          }`;
        }
      }
      datos.current.fantasmas.forEach((f, i) => {
        const el = fantasmasRef.current[i];
        if (!el) return;
        const p = mapa.project([f.punto.lon, f.punto.lat]);
        const mpp = metrosPorPixel(f.punto.lat, zoom);
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        const caja = el.firstElementChild as HTMLElement | null;
        if (caja) {
          caja.style.width = `${f.ancho / mpp}px`;
          caja.style.height = `${f.largo / mpp}px`;
          caja.style.transform = `translate(-50%, -50%) rotate(${f.rumbo - bearing}deg)`;
        }
      });
      // Paso 2: las flechas alrededor de la pose de impacto, cada una del lado de donde viene el
      // vehículo y apuntando hacia donde va.
      const d = datos.current.direcciones;
      if (d && flechas.current) {
        const p = mapa.project([d.punto.lon, d.punto.lat]);
        flechas.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
        datos.current.opciones.forEach((o, i) => {
          const el = flechasRef.current[i];
          if (!el) return;
          const a = ((o.rumbo + 180 - bearing) * Math.PI) / 180;
          const x = RADIO_FLECHAS_PX * Math.sin(a);
          const y = -RADIO_FLECHAS_PX * Math.cos(a);
          el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${o.rumbo - bearing}deg)`;
        });
      }
      // Paso 3: la pieza fantasma que se arrastra.
      const pf = datos.current.piezaFinal;
      if (pf && pieza.current) {
        const p = mapa.project([pf.punto.lon, pf.punto.lat]);
        const mpp = metrosPorPixel(pf.punto.lat, zoom);
        pieza.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
        const caja = pieza.current.firstElementChild as HTMLElement | null;
        if (caja) {
          caja.style.width = `${Math.max(14, pf.ancho / mpp)}px`;
          caja.style.height = `${Math.max(28, pf.largo / mpp)}px`;
          caja.style.transform = `translate(-50%, -50%) rotate(${pf.rumbo - bearing}deg)`;
        }
      }
      datos.current.trayectorias.forEach((t, i) => {
        const el = trazos.current[i];
        if (!el) return;
        el.setAttribute(
          "points",
          t.puntos
            .map((q) => {
              const xy = mapa.project([q.lon, q.lat]);
              return `${xy.x},${xy.y}`;
            })
            .join(" "),
        );
      });
    };
  });

  // Sigue al mapa: cada movimiento o zoom vuelve a colocar lo de encima, en un cuadro.
  useEffect(() => {
    let pendiente = 0;
    const alMover = () => {
      if (pendiente) return;
      pendiente = requestAnimationFrame(() => {
        pendiente = 0;
        dibujar.current();
      });
    };
    mapa.on("move", alMover);
    mapa.on("resize", alMover);
    dibujar.current();
    return () => {
      mapa.off("move", alMover);
      mapa.off("resize", alMover);
      cancelAnimationFrame(pendiente);
    };
  }, [mapa]);
  useEffect(() => {
    vivo.current.rumbo = seleccion?.rumbo ?? 0;
    dibujar.current();
  }, [seleccion, fantasmas, impacto, direcciones, opciones, piezaFinal, trayectorias]);

  // Q y E: ±5° al elegido (si no se está escribiendo).
  useEffect(() => {
    if (!seleccion) return undefined;
    const tecla = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== "q" && k !== "e") return;
      e.preventDefault();
      onGirar(normalizar(seleccion.rumbo + (k === "e" ? PASO_TECLA_GRADOS : -PASO_TECLA_GRADOS)));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [seleccion, onGirar]);

  // --- El anillo: captura del puntero y un cuadro por movimiento ------------------------------------
  const cuadroGiro = () => {
    vivo.current.cuadro = 0;
    const s = datos.current.seleccion;
    if (!s || !capa.current) return;
    const t0 = performance.now();
    const caja = capa.current.getBoundingClientRect();
    const c = mapa.project([s.punto.lon, s.punto.lat]);
    vivo.current.rumbo = rumboDesdePuntero(
      puntero.current.x - (caja.left + c.x),
      puntero.current.y - (caja.top + c.y),
      mapa.getBearing(),
      puntero.current.libre,
    );
    dibujar.current();
    const m = (window.__croquisGiro ??= { cuadros: 0, ms: 0 });
    m.cuadros += 1;
    m.ms += performance.now() - t0;
  };
  const alMoverAnillo = (e: React.PointerEvent) => {
    if (!vivo.current.girando) return;
    puntero.current = { x: e.clientX, y: e.clientY, libre: e.shiftKey };
    if (!vivo.current.cuadro) vivo.current.cuadro = requestAnimationFrame(cuadroGiro);
  };

  // --- La bandeja: el chip se arrastra al mapa -----------------------------------------------------
  const moverArrastre = (x: number, y: number) => {
    const caja = capa.current?.getBoundingClientRect();
    if (!caja || !arrastre.current) return;
    arrastre.current.style.transform = `translate(${x - caja.left}px, ${y - caja.top}px)`;
    const imp = datos.current.impacto;
    if (arrastreTexto.current) {
      const q = mapa.unproject([x - caja.left, y - caja.top]);
      arrastreTexto.current.textContent = imp
        ? distanciaTexto({ lat: q.lat, lon: q.lng }, imp)
        : "";
    }
  };

  /** Empieza a arrastrar algo (un chip de la bandeja o la pieza fantasma del paso 3). */
  const empezarArrastre = (b: Colocable, e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setArrastrando(b);
    requestAnimationFrame(() => moverArrastre(e.clientX, e.clientY));
  };
  /** Lo suelta: si cae en el mapa (y no sobre su propio origen), lo coloca alineado a la calle. */
  const soltarArrastre = (b: Colocable, e: React.PointerEvent, origen: Element | null) => {
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    setArrastrando(null);
    const caja = capa.current?.getBoundingClientRect();
    if (!caja) return;
    const x = e.clientX - caja.left;
    const y = e.clientY - caja.top;
    if (x < 0 || y < 0 || x > caja.width || y > caja.height) return;
    if (origen?.contains(document.elementFromPoint(e.clientX, e.clientY))) return;
    const q = mapa.unproject([x, y]);
    const punto = { lat: q.lat, lon: q.lng };
    const pref = rumboPreferido(b.clave);
    const rumbo = rumboDeCalle(callesCerca(mapa, x, y), [punto.lon, punto.lat], pref) ?? pref ?? 0;
    onSoltar(b.clave, punto, rumbo);
  };

  return (
    <div
      ref={capa}
      className="pointer-events-none absolute inset-0 z-10"
      data-testid="colocar-mapa"
    >
      {/* La trayectoria de cada vehículo, punteada: inicio (si lo hay) → impacto → reposo. */}
      {trayectorias.length ? (
        <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          {trayectorias.map((t, i) => (
            <polyline
              key={t.vehiculo}
              ref={(el) => {
                trazos.current[i] = el;
              }}
              fill="none"
              stroke={t.color}
              strokeWidth={2.5}
              strokeDasharray="2 6"
              strokeLinecap="round"
              data-testid={`trayectoria-${t.vehiculo}`}
            />
          ))}
        </svg>
      ) : null}
      {seleccion ? (
        <div ref={anillo} className="absolute top-0 left-0" data-testid="anillo-giro">
          <svg ref={svg} className="overflow-visible">
            <path
              ref={silueta}
              d={siluetaClase(seleccion.clase ?? "")}
              fill={seleccion.color}
              fillOpacity={0.85}
              stroke="var(--fondo)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <circle
              ref={circulo}
              fill="none"
              stroke={seleccion.color}
              strokeWidth={2}
              strokeDasharray="4 4"
              pointerEvents="none"
            />
            {/* La banda que se toma para girar: ancha e invisible, sobre el círculo. */}
            <circle
              ref={banda}
              fill="none"
              stroke="transparent"
              strokeWidth={22}
              className="pointer-events-auto cursor-grab"
              data-testid="banda-giro"
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
                vivo.current.girando = true;
                puntero.current = { x: e.clientX, y: e.clientY, libre: e.shiftKey };
                vivo.current.cuadro = requestAnimationFrame(cuadroGiro);
              }}
              onPointerMove={alMoverAnillo}
              onPointerUp={(e) => {
                (e.currentTarget as Element).releasePointerCapture(e.pointerId);
                cancelAnimationFrame(vivo.current.cuadro);
                vivo.current.cuadro = 0;
                vivo.current.girando = false;
                if (seleccion && vivo.current.rumbo !== seleccion.rumbo)
                  onGirar(vivo.current.rumbo);
              }}
            />
            <circle
              ref={asa}
              r={7}
              fill={seleccion.color}
              stroke="var(--fondo)"
              strokeWidth={2}
              pointerEvents="none"
            />
          </svg>
          <span
            ref={rotulo}
            className="vidrio cifras absolute left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[0.75rem]"
            style={{ top: "calc(100% + 4px)" }}
            data-testid="rotulo-giro"
          />
        </div>
      ) : null}

      {/* Lo que propone Croquis: los fantasmas en el mapa y un «Aceptar» por vehículo en una barra
          aparte (sobre el mapa, los botones de dos vehículos juntos se tapaban). */}
      {fantasmas.length ? (
        <div
          className="vidrio pointer-events-auto absolute bottom-28 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-panel py-1.5 pr-1.5 pl-4"
          data-testid="propuesta-croquis"
        >
          <span className="t-nota whitespace-nowrap">Croquis propone dónde estaba cada uno:</span>
          {fantasmas.map((f) => (
            <button
              key={f.clave}
              type="button"
              className="boton-secundario boton-compacto"
              onClick={() => onAceptar(f.vehiculo)}
              data-testid={`aceptar-${f.vehiculo}`}
            >
              Aceptar {f.vehiculo}
            </button>
          ))}
        </div>
      ) : null}
      {fantasmas.map((f, i) => (
        <div
          key={f.clave}
          ref={(el) => {
            fantasmasRef.current[i] = el;
          }}
          className="absolute top-0 left-0"
          data-testid={`fantasma-${f.vehiculo}`}
        >
          <div className="absolute">
            <Silueta clase={f.clase} color={f.color} llena={false} />
          </div>
        </div>
      ))}

      {/* Paso 2: por dónde venía. La flecha de Croquis va llena; tocar una la elige. */}
      {direcciones && opciones.length ? (
        <div
          ref={flechas}
          className="absolute top-0 left-0"
          data-testid={`direcciones-${direcciones.vehiculo}`}
        >
          {opciones.map((o, i) => (
            <button
              key={o.rumbo}
              ref={(el) => {
                flechasRef.current[i] = el;
              }}
              type="button"
              className="pointer-events-auto absolute top-0 left-0 grid h-11 w-11 place-items-center rounded-full"
              style={{
                background: o.propuesta ? direcciones.color : "var(--superficie)",
                border: `2px solid ${direcciones.color}`,
                color: o.propuesta ? "#fff" : direcciones.color,
              }}
              aria-label={`${direcciones.vehiculo} venía hacia ${o.rumbo}°${o.propuesta ? " (propuesta de Croquis)" : ""}`}
              onClick={() => onDireccion?.(direcciones.vehiculo, o.rumbo)}
              data-testid={`direccion-${o.rumbo}`}
              data-propuesta={o.propuesta ? "si" : "no"}
            >
              <svg viewBox="-12 -12 24 24" className="h-6 w-6" aria-hidden="true">
                <path d="M 0 -9 L 8 3 L 3 3 L 3 9 L -3 9 L -3 3 L -8 3 Z" fill="currentColor" />
              </svg>
            </button>
          ))}
        </div>
      ) : null}

      {/* Paso 3: la pieza fantasma; se arrastra a donde quedó el vehículo. */}
      {piezaFinal ? (
        <div
          ref={pieza}
          className="absolute top-0 left-0"
          data-testid={`pieza-${piezaFinal.clave}`}
        >
          <div
            className="pointer-events-auto absolute cursor-grab touch-none"
            onPointerDown={(e) => empezarArrastre(piezaFinal, e)}
            onPointerMove={(e) => {
              if (arrastrando?.clave === piezaFinal.clave) moverArrastre(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => soltarArrastre(piezaFinal, e, null)}
          >
            {/* El área para tomarla es más grande que la pieza: de lejos un auto mide pocos px. */}
            <span className="absolute -inset-5 rounded-full" aria-hidden="true" />
            <Silueta clase={piezaFinal.clase} color={piezaFinal.color} llena={false} />
          </div>
          <span
            className="vidrio absolute top-7 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[0.75rem] whitespace-nowrap"
            data-testid="pieza-ayuda"
          >
            Arrástrala a donde quedó {piezaFinal.etiqueta}
          </span>
        </div>
      ) : null}

      {/* La leyenda, fija. */}
      <div
        className="vidrio pointer-events-none absolute bottom-14 left-3 flex flex-col gap-1 rounded-panel px-3 py-2 text-[0.6875rem]"
        data-testid="leyenda-colocar"
      >
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5B2E]" /> Impacto
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-2 rounded-[2px] bg-texto-2" /> Colocado por el perito
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-2 rounded-[2px] border border-dashed border-texto-2" /> Propuesta
          de Croquis
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 border-t-2 border-dotted border-texto-2" /> Trayectoria
        </span>
      </div>

      {bandeja.length ? (
        <div
          className="vidrio pointer-events-auto absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full py-1.5 pr-1.5 pl-4"
          data-testid="bandeja"
        >
          <span className="t-nota whitespace-nowrap">Arrastra al mapa:</span>
          {bandeja.map((b) => (
            <button
              key={b.clave}
              type="button"
              className="cursor-grab touch-none rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold text-white"
              style={{ background: b.color }}
              data-testid={`chip-${b.clave}`}
              onPointerDown={(e) => empezarArrastre(b, e)}
              onPointerMove={(e) => {
                if (arrastrando?.clave === b.clave) moverArrastre(e.clientX, e.clientY);
              }}
              // Soltado sobre la bandeja misma: no se coloca.
              onPointerUp={(e) =>
                soltarArrastre(b, e, (e.currentTarget as HTMLElement).parentElement)
              }
            >
              {b.etiqueta}
            </button>
          ))}
        </div>
      ) : null}

      {arrastrando ? (
        <div ref={arrastre} className="absolute top-0 left-0" data-testid="arrastre">
          <span
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ background: arrastrando.color }}
          />
          <span
            ref={arrastreTexto}
            className="vidrio cifras absolute top-3 left-3 rounded-full px-2 py-0.5 text-[0.75rem] whitespace-nowrap"
            data-testid="distancia-arrastre"
          />
        </div>
      ) : null}
    </div>
  );
}

const GUIA_KEY = "croquis:guia-colocar";

/** La guía de 3 pasos que sale la primera vez en el paso del lugar, con «No volver a mostrar». */
export function GuiaColocar() {
  const [ver, setVer] = useState(false);
  const [paso, setPaso] = useState(0);
  const [noMostrar, setNoMostrar] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee al montar (localStorage)
      setVer(localStorage.getItem(GUIA_KEY) !== "no");
    } catch {
      setVer(true);
    }
  }, []);
  if (!ver) return null;
  const pasos = [
    {
      titulo: "1 · Arrastra cada vehículo al mapa",
      texto:
        "Toma V1, V2… de la bandeja y suéltalos donde quedaron. Se alinean solos con la calle más cercana; «Voltear 180°» los da vuelta.",
      clase: "guia-arrastre",
    },
    {
      titulo: "2 · Gira con el anillo",
      texto:
        "Arrastra el anillo alrededor del vehículo: apunta hacia donde mira su frente, de 15° en 15° (con Shift, libre). Q y E giran 5°.",
      clase: "guia-giro",
    },
    {
      titulo: "3 · Acepta lo que propone Croquis",
      texto:
        "Al marcar el impacto, Croquis propone dónde estaba cada vehículo: se ven punteados, con «Aceptar». Muévelos o gíralos si no es así.",
      clase: "guia-fantasma",
    },
  ] as const;
  const p = pasos[paso]!;
  const cerrar = () => {
    if (noMostrar)
      try {
        localStorage.setItem(GUIA_KEY, "no");
      } catch {
        // Sin almacenamiento, la guía vuelve a salir la próxima vez.
      }
    setVer(false);
  };
  return (
    <div
      className="hundido flex flex-col gap-3 rounded-panel p-4"
      role="dialog"
      aria-label="Cómo colocar en el mapa"
      data-testid="guia-colocar"
    >
      <div className="guia-escena" aria-hidden="true">
        <span className={`guia-figura ${p.clase}`} />
      </div>
      <p className="t-interfaz font-semibold">{p.titulo}</p>
      <p className="t-nota">{p.texto}</p>
      <label className="t-nota flex items-center gap-2">
        <input
          type="checkbox"
          checked={noMostrar}
          onChange={(e) => setNoMostrar(e.target.checked)}
          data-testid="guia-no-mostrar"
        />
        No volver a mostrar
      </label>
      <div className="flex justify-between gap-2">
        <span className="t-nota cifras text-texto-3">{paso + 1} de 3</span>
        {paso < 2 ? (
          <button
            type="button"
            className="boton-principal boton-compacto"
            onClick={() => setPaso(paso + 1)}
            data-testid="guia-siguiente"
          >
            Siguiente
          </button>
        ) : (
          <button
            type="button"
            className="boton-principal boton-compacto"
            onClick={cerrar}
            data-testid="guia-cerrar"
          >
            Entendido
          </button>
        )}
      </div>
      <button type="button" className="t-nota self-start underline" onClick={cerrar}>
        Cerrar
      </button>
    </div>
  );
}
