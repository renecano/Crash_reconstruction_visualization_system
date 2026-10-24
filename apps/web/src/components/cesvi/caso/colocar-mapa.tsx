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
 */
import { distanciaM } from "@croquis/cesvi";
import type { Map as MapaMl } from "maplibre-gl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  metrosPorPixel,
  normalizar,
  PASO_TECLA_GRADOS,
  rumboDeCalle,
  rumboDesdePuntero,
} from "@/lib/colocar";

type Punto = { lat: number; lon: number };

/** Algo que falta colocar: un chip de la bandeja. */
export interface Colocable {
  clave: string;
  etiqueta: string;
  largo: number;
  ancho: number;
  color: string;
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
}) {
  const capa = useRef<HTMLDivElement>(null);
  const anillo = useRef<HTMLDivElement>(null);
  const silueta = useRef<SVGRectElement>(null);
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
  const datos = useRef({ seleccion, fantasmas, impacto });
  const dibujar = useRef(() => {});
  // Las props de ahora y la función que dibuja: se actualizan después de cada render.
  useLayoutEffect(() => {
    datos.current = { seleccion, fantasmas, impacto };
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
        silueta.current.setAttribute("x", String(c - ancho / 2));
        silueta.current.setAttribute("y", String(c - largo / 2));
        silueta.current.setAttribute("width", String(ancho));
        silueta.current.setAttribute("height", String(largo));
        silueta.current.setAttribute("transform", `rotate(${giro} ${c} ${c})`);
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
  }, [seleccion, fantasmas, impacto]);

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

  return (
    <div
      ref={capa}
      className="pointer-events-none absolute inset-0 z-10"
      data-testid="colocar-mapa"
    >
      {seleccion ? (
        <div ref={anillo} className="absolute top-0 left-0" data-testid="anillo-giro">
          <svg ref={svg} className="overflow-visible">
            <rect
              ref={silueta}
              rx={3}
              fill={seleccion.color}
              fillOpacity={0.85}
              stroke="var(--fondo)"
              strokeWidth={1}
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
          <div
            className="absolute rounded-[3px] border-2 border-dashed"
            style={{ borderColor: f.color, background: `${f.color}22` }}
          />
        </div>
      ))}

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
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
                setArrastrando(b);
                requestAnimationFrame(() => moverArrastre(e.clientX, e.clientY));
              }}
              onPointerMove={(e) => {
                if (arrastrando?.clave === b.clave) moverArrastre(e.clientX, e.clientY);
              }}
              onPointerUp={(e) => {
                (e.currentTarget as Element).releasePointerCapture(e.pointerId);
                setArrastrando(null);
                const caja = capa.current?.getBoundingClientRect();
                if (!caja) return;
                const x = e.clientX - caja.left;
                const y = e.clientY - caja.top;
                if (x < 0 || y < 0 || x > caja.width || y > caja.height) return;
                // Soltado sobre la bandeja misma: no se coloca.
                if (
                  (e.currentTarget as HTMLElement).parentElement?.contains(
                    document.elementFromPoint(e.clientX, e.clientY),
                  )
                )
                  return;
                const q = mapa.unproject([x, y]);
                const punto = { lat: q.lat, lon: q.lng };
                const pref = rumboPreferido(b.clave);
                const rumbo =
                  rumboDeCalle(callesCerca(mapa, x, y), [punto.lon, punto.lat], pref) ?? pref ?? 0;
                onSoltar(b.clave, punto, rumbo);
              }}
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
