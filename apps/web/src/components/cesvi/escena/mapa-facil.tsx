"use client";
/**
 * El mapa de la escena fácil (René, 2026-11-05): se mueve arrastrando y se acerca con la rueda o
 * pellizcando, sin modos; un toque es un toque. Encima, solo lo de la pregunta en curso: el choque,
 * las flechas de llegada (botones grandes), los coches como coches (silueta vista desde arriba, a
 * escala, de su color, con su nombre y una flecha en el frente) y los botones redondos para girar.
 */
import { avanzar, type LonLat } from "@croquis/cesvi";
import type { GeoJSONSource, Map as MapaMl, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { metrosPorPixel, siluetaClase } from "@/lib/colocar";
import type { Punto } from "@/lib/escena-facil";
import { estiloMapaEscena } from "./estilo-mapa-escena";

export interface CocheMapa {
  id: string;
  nombre: string;
  color: string;
  clase: string;
  largo: number;
  ancho: number;
  punto: Punto;
  rumbo: number;
  /** Se está colocando: se puede arrastrar y lleva los botones para girar. */
  activo?: boolean;
  /** Lo propone Croquis y aún no se confirma: más tenue. */
  tenue?: boolean;
}

export interface FlechaMapa {
  en: Punto;
  rumbo: number;
  texto: string;
  /** La que propone Croquis (viene resaltada). */
  propuesta: boolean;
  color: string;
}

export interface LineaMapa {
  puntos: Punto[];
  color: string;
}

export interface MapaFacilProps {
  tema: "claro" | "oscuro";
  /** Dónde abre: el encuadre de estos puntos (o el centro, si es uno). */
  encuadre: Punto[];
  onToque?: (p: Punto) => void;
  choques: { orden: number; punto: Punto }[];
  /** El lugar que propone Croquis para el choque, con su pregunta («¿Aquí? Toca…»). */
  propuesta?: { punto: Punto; texto: string } | null;
  flechas?: FlechaMapa[];
  onFlecha?: (i: number) => void;
  coches: CocheMapa[];
  lineas?: LineaMapa[];
  onMoverCoche?: (id: string, p: Punto) => void;
  onGirar?: (id: string, grados: number) => void;
  /** Para centrar el mapa desde fuera (buscar el lugar). */
  onMapa?: (m: MapaMl | null) => void;
  /** Lo medido en «Más herramientas»: dos puntos y la distancia. */
  medicion?: Punto[];
}

const tamano = (m: MapaMl, lat: number, metros: number) =>
  Math.max(6, metros / metrosPorPixel(lat, m.getZoom()));

/**
 * El coche como coche: silueta de su clase, parabrisas, medallón y una flecha en el frente. La caja
 * del SVG es de 1.2 anchos × 1.9 largos con el centro del coche al centro; se estira al ancho y al
 * largo reales (sin conservar la proporción) y los trazos no se deforman.
 */
export const CAJA_COCHE = { ancho: 1.2, largo: 1.9 } as const;
function htmlCoche(c: CocheMapa): string {
  const claro = /^#(f|e|d)/i.test(c.color);
  const borde = claro ? "#5B616C" : "rgba(11,13,18,0.6)";
  const trazo = `stroke="${borde}" stroke-width="1.3" vector-effect="non-scaling-stroke"`;
  return `<svg viewBox="-0.6 -0.95 1.2 1.9" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true" style="overflow:visible;filter:drop-shadow(0 3px 4px rgba(27,34,48,.35))">
    <path d="M0 -0.9 L0.22 -0.68 L0.08 -0.68 L0.08 -0.56 L-0.08 -0.56 L-0.08 -0.68 L-0.22 -0.68 Z" fill="${claro ? "#3A3F49" : c.color}" ${trazo}/>
    <path d="${siluetaClase(c.clase)}" fill="${c.color}" ${trazo}/>
    <rect x="-0.36" y="-0.27" width="0.72" height="0.13" rx="0.05" fill="rgba(15,23,42,0.55)"/>
    <rect x="-0.34" y="0.24" width="0.68" height="0.1" rx="0.04" fill="rgba(15,23,42,0.45)"/>
  </svg>`;
}

export function MapaFacil(p: MapaFacilProps) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<MapaMl | null>(null);
  const [listo, setListo] = useState(false);
  const ultimo = useRef(p);
  useEffect(() => {
    ultimo.current = p;
  });
  const marcas = useRef<Marker[]>([]);
  const MarkerCls = useRef<typeof Marker | null>(null);

  // El mapa: una vez. Sin giro (el norte siempre arriba: las flechas dicen «del sur» de verdad).
  useEffect(() => {
    let vivo = true;
    let instancia: MapaMl | null = null;
    void import("maplibre-gl").then(({ Map, Marker: M, getVersion, setWorkerUrl }) => {
      if (!vivo || !contenedor.current) return;
      setWorkerUrl(`/maplibre/worker-${getVersion()}.mjs`);
      MarkerCls.current = M;
      const e = ultimo.current.encuadre;
      instancia = new Map({
        container: contenedor.current,
        style: estiloMapaEscena(ultimo.current.tema),
        center: e[0] ? [e[0].lon, e[0].lat] : [-99.13, 19.43],
        zoom: e[0] ? 19 : 11,
        maxZoom: 21.5,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      instancia.touchZoomRotate.disableRotation();
      instancia.keyboard.disableRotation();
      instancia.on("click", (ev) => {
        ultimo.current.onToque?.({ lat: ev.lngLat.lat, lon: ev.lngLat.lng });
      });
      instancia.on("load", () => {
        if (!vivo || !instancia) return;
        encuadrar(instancia, ultimo.current.encuadre, false);
        mapa.current = instancia;
        ultimo.current.onMapa?.(instancia);
        setListo(true);
      });
    });
    return () => {
      vivo = false;
      ultimo.current.onMapa?.(null);
      instancia?.remove();
      mapa.current = null;
    };
  }, []);

  // El tema.
  const tema = useRef(p.tema);
  useEffect(() => {
    if (!listo || tema.current === p.tema) return;
    tema.current = p.tema;
    mapa.current?.setStyle(estiloMapaEscena(p.tema));
  }, [p.tema, listo]);

  // El encuadre cambia cuando cambia la pregunta (el choque marcado, un coche nuevo).
  const claveEncuadre = p.encuadre.map((x) => `${x.lat.toFixed(5)},${x.lon.toFixed(5)}`).join("|");
  useEffect(() => {
    if (listo && mapa.current) encuadrar(mapa.current, p.encuadre, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambian los puntos
  }, [claveEncuadre, listo]);

  // Las líneas punteadas (por dónde venía, hasta dónde quedó) y la medición: una fuente GeoJSON.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    const dibujar = () =>
      dibujarLineas(m, ultimo.current.lineas ?? [], ultimo.current.medicion ?? []);
    dibujar();
    m.on("style.load", dibujar);
    return () => {
      m.off("style.load", dibujar);
    };
  }, [listo, p.lineas, p.medicion]);

  // Los marcadores: se rehacen con cada cambio (son pocos) y se escalan con el zoom.
  useEffect(() => {
    const m = mapa.current;
    const M = MarkerCls.current;
    if (!m || !M || !listo) return;
    for (const x of marcas.current) x.remove();
    marcas.current = [];
    const escalar: (() => void)[] = [];
    const agregar = (el: HTMLElement, at: Punto, opts: { draggable?: boolean } = {}) => {
      const mk = new M({ element: el, draggable: opts.draggable ?? false })
        .setLngLat([at.lon, at.lat])
        .addTo(m);
      marcas.current.push(mk);
      return mk;
    };

    for (const c of p.choques) {
      const el = document.createElement("div");
      el.className = "escena-choque";
      el.dataset.testid = `choque-${c.orden}`;
      el.setAttribute("data-testid", `choque-${c.orden}`);
      el.innerHTML = `<svg viewBox="-12 -12 24 24" width="44" height="44" aria-hidden="true"><path d="M0 -11 L3 -4 L10 -6 L5 0 L10 6 L3 4 L0 11 L-3 4 L-10 6 L-5 0 L-10 -6 L-3 -4 Z" fill="#FF5A1F" stroke="#fff" stroke-width="1.4"/><circle r="2.2" fill="#fff"/></svg><span class="escena-etiqueta escena-etiqueta-choque">Choque</span>`;
      el.style.pointerEvents = "none";
      agregar(el, c.punto);
    }

    if (p.propuesta) {
      const el = document.createElement("div");
      el.className = "escena-propuesta";
      el.setAttribute("data-testid", "propuesta-choque");
      el.innerHTML = `<span class="escena-pulso"></span><span class="escena-punto"></span><span class="escena-globo">${escaparHtml(p.propuesta.texto)}</span>`;
      el.style.pointerEvents = "none";
      agregar(el, p.propuesta.punto);
    }

    (p.flechas ?? []).forEach((f, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `escena-flecha${f.propuesta ? " escena-flecha-propuesta" : ""}`;
      b.setAttribute("data-testid", `flecha-${i}`);
      b.setAttribute("data-propuesta", f.propuesta ? "si" : "no");
      b.setAttribute("aria-label", f.texto);
      b.style.setProperty("--color-flecha", f.color);
      b.innerHTML = `<svg viewBox="-20 -24 40 48" width="56" height="64" aria-hidden="true" style="transform:rotate(${f.rumbo}deg)"><path d="M0 -22 L18 -2 L7 -2 L7 22 L-7 22 L-7 -2 L-18 -2 Z" /></svg><span class="escena-etiqueta">${escaparHtml(f.texto.split(",")[0]!)}</span>`;
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ultimo.current.onFlecha?.(i);
      });
      agregar(b, f.en);
    });

    for (const c of p.coches) {
      const el = document.createElement("div");
      el.className = `escena-coche${c.activo ? " escena-coche-activo" : ""}${c.tenue ? " escena-coche-tenue" : ""}`;
      el.setAttribute("data-testid", `coche-${c.id}`);
      el.setAttribute("aria-label", c.nombre);
      el.setAttribute("role", "img");
      const cuerpo = document.createElement("div");
      cuerpo.className = "escena-coche-cuerpo";
      cuerpo.innerHTML = htmlCoche(c);
      const nombre = document.createElement("span");
      nombre.className = "escena-etiqueta escena-etiqueta-coche";
      nombre.textContent = c.nombre;
      nombre.style.setProperty("--color-coche", c.color);
      el.append(cuerpo, nombre);
      const mk = agregar(el, c.punto, {
        draggable: Boolean(c.activo && ultimo.current.onMoverCoche),
      });
      if (c.activo && ultimo.current.onMoverCoche) {
        mk.on("dragend", () => {
          const ll = mk.getLngLat();
          ultimo.current.onMoverCoche?.(c.id, { lat: ll.lat, lon: ll.lng });
        });
      }
      const ajustar = () => {
        const l = tamano(m, c.punto.lat, c.largo);
        const a = tamano(m, c.punto.lat, c.ancho);
        cuerpo.style.width = `${a * CAJA_COCHE.ancho}px`;
        cuerpo.style.height = `${l * CAJA_COCHE.largo}px`;
        cuerpo.style.transform = `translate(-50%, -50%) rotate(${c.rumbo}deg)`;
        nombre.style.transform = `translate(${Math.max(a, l) * 0.55 + 6}px, ${-Math.max(a, l) * 0.55}px)`;
      };
      ajustar();
      escalar.push(ajustar);
      if (c.activo && ultimo.current.onGirar) {
        // Dos botones redondos grandes para girarlo 15°, a sus lados.
        const giro = document.createElement("div");
        giro.className = "escena-giro";
        const boton = (grados: number, texto: string, id: string) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "escena-boton-giro";
          b.setAttribute("aria-label", texto);
          b.setAttribute("data-testid", id);
          b.innerHTML =
            grados < 0
              ? `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4.5h4.5"/></svg>`
              : `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v4.5h-4.5"/></svg>`;
          b.addEventListener("click", (ev) => {
            ev.stopPropagation();
            ultimo.current.onGirar?.(c.id, grados);
          });
          return b;
        };
        const izq = boton(-15, `Girar ${c.nombre} 15° a la izquierda`, "girar-izquierda");
        const der = boton(15, `Girar ${c.nombre} 15° a la derecha`, "girar-derecha");
        giro.append(izq, der);
        const ajustarGiro = () => {
          const d = Math.max(tamano(m, c.punto.lat, c.largo) * 0.6, 34) + 30;
          izq.style.transform = `translate(${-d}px, 0)`;
          der.style.transform = `translate(${d}px, 0)`;
        };
        ajustarGiro();
        escalar.push(ajustarGiro);
        agregar(giro, c.punto);
      }
    }
    const alZoom = () => escalar.forEach((f) => f());
    m.on("zoom", alZoom);
    return () => {
      m.off("zoom", alZoom);
    };
  }, [listo, p.choques, p.propuesta, p.flechas, p.coches]);

  return (
    <div className="absolute inset-0" data-testid="mapa-facil" data-listo={listo ? "si" : "no"}>
      <div ref={contenedor} className="absolute inset-0" />
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          className="escena-zoom"
          aria-label="Acercar"
          onClick={() => mapa.current?.zoomIn()}
          data-testid="acercar"
        >
          +
        </button>
        <button
          type="button"
          className="escena-zoom"
          aria-label="Alejar"
          onClick={() => mapa.current?.zoomOut()}
          data-testid="alejar"
        >
          −
        </button>
      </div>
      <p className="pointer-events-none absolute right-4 bottom-3 z-10 text-[0.6875rem] text-texto-3">
        © OpenStreetMap · OpenFreeMap
      </p>
    </div>
  );
}

function escaparHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

/** Lleva el mapa a los puntos: uno al centro (zoom 19.5); varios, encuadrados. */
function encuadrar(m: MapaMl, puntos: readonly Punto[], animar: boolean) {
  if (!puntos.length) return;
  if (puntos.length === 1) {
    const [p] = puntos as [Punto];
    const opts = { center: [p.lon, p.lat] as [number, number], zoom: Math.max(m.getZoom(), 19.5) };
    if (animar) m.easeTo({ ...opts, duration: 500 });
    else m.jumpTo(opts);
    return;
  }
  const lons = puntos.map((p) => p.lon);
  const lats = puntos.map((p) => p.lat);
  m.fitBounds(
    [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    { padding: { top: 120, bottom: 160, left: 120, right: 120 }, maxZoom: 20.2, animate: animar },
  );
}

function dibujarLineas(m: MapaMl, lineas: readonly LineaMapa[], medicion: readonly Punto[]) {
  if (!m.isStyleLoaded()) return;
  const datos = {
    type: "FeatureCollection" as const,
    features: [
      ...lineas
        .filter((l) => l.puntos.length >= 2)
        .map((l) => ({
          type: "Feature" as const,
          properties: { color: l.color, tipo: "trayecto" },
          geometry: {
            type: "LineString" as const,
            coordinates: l.puntos.map((p) => [p.lon, p.lat]),
          },
        })),
      ...(medicion.length === 2
        ? [
            {
              type: "Feature" as const,
              properties: { color: "#0B0D12", tipo: "medida" },
              geometry: {
                type: "LineString" as const,
                coordinates: medicion.map((p) => [p.lon, p.lat]),
              },
            },
          ]
        : []),
    ],
  };
  const fuente = m.getSource("escena-lineas") as GeoJSONSource | undefined;
  if (fuente) {
    fuente.setData(datos);
    return;
  }
  m.addSource("escena-lineas", { type: "geojson", data: datos });
  m.addLayer({
    id: "escena-lineas",
    type: "line",
    source: "escena-lineas",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 16, 2, 20, 4],
      "line-dasharray": [0.6, 1.6],
    },
  });
}

/** El trayecto de llegada: de `metros` antes del choque hasta él, en el rumbo dado. */
export function trayectoDeLlegada(choque: Punto, rumbo: number, metros = 30): Punto[] {
  const atras = avanzar([choque.lon, choque.lat] as LonLat, (rumbo + 180) % 360, metros);
  return [{ lat: atras[1], lon: atras[0] }, choque];
}
