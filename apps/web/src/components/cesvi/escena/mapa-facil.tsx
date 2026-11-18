"use client";
/**
 * El mapa de la escena fácil (René, 2026-11-05): se mueve arrastrando y se acerca con la rueda o
 * pellizcando, sin modos; un toque es un toque. Encima, solo lo de la pregunta en curso: el choque,
 * las flechas de llegada (botones grandes), los coches como coches (silueta vista desde arriba, a
 * escala, de su color, con su nombre y una flecha en el frente) y los botones redondos para girar.
 */
import { formato as F, avanzar, type LonLat, type RolPersona } from "@croquis/cesvi";
import type { GeoJSONSource, Map as MapaMl, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { metrosPorPixel, normalizar, rumboDesdePuntero, siluetaClase } from "@/lib/colocar";
import type { Punto } from "@/lib/escena-facil";
import { tomarMapa, type MapaPrestado } from "@/lib/mapa-compartido";
import { COLOR_MEDIDA, dibujoMedicion } from "@/lib/medir";
import { COLOR_ONDULACION, COLOR_SUPERFICIE, COLOR_TOPE } from "@/lib/terreno-colores";
import { estiloMapaEscena } from "./estilo-mapa-escena";
import { svgPersona } from "./figura-persona";

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

/** Un objeto del lugar que colocó el perito (W4), a escala y girado. */
export interface ObjetoMapa {
  id: string;
  tipo: string;
  nombre: string;
  punto: Punto;
  rumbo: number;
  largo: number;
  ancho: number;
}

/**
 * Un peatón o un ciclista (A3, René, 2026-11-18): donde lo golpearon, con una flecha corta hacia
 * donde iba y, si el perito lo marcó, dónde quedó con la distancia de proyección.
 */
export interface PersonaMapa {
  id: string;
  rol: RolPersona;
  nombre: string;
  punto: Punto;
  rumbo: number;
  final?: Punto | null;
  /** «Proyección 14.0 m», ya formateada. */
  proyeccion?: string | null;
}

/**
 * El color de la línea de proyección y de su etiqueta, por tema: contraste de al menos 3:1 con la
 * calle y el fondo del mapa en claro (#FFFFFF, #F4F2EC) y en oscuro (#1C2944, #0A1120).
 */
export const COLOR_PERSONA = { claro: "#6D28D9", oscuro: "#A78BFA" } as const;

export interface LineaMapa {
  puntos: Punto[];
  color: string;
}

/** Una pieza del terreno que marcó el perito (C3, W5): una zona, una zona ondulada o un tope. */
export interface TerrenoMapa {
  id: string;
  clase: "zona" | "ondulacion" | "tope";
  /** La superficie de una zona. */
  tipo?: string;
  nombre: string;
  /** El polígono de la zona o los dos extremos del tope. */
  puntos: Punto[];
  centro: Punto;
}

export interface MapaFacilProps {
  tema: "claro" | "oscuro";
  /** Dónde abre: el encuadre de estos puntos (o el centro, si es uno). */
  encuadre: Punto[];
  onToque?: (p: Punto) => void;
  choques: { orden: number; punto: Punto }[];
  /** C1: el primer golpe, los objetos de los choques intermedios y los puntos de paso. */
  marcas?: {
    id: string;
    punto: Punto;
    tipo: "golpe" | "objeto" | "paso";
    texto: string;
    color?: string;
  }[];
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
  /** El modo de medición está activo (A5): cursor en cruz y la línea que sigue al puntero. */
  midiendo?: boolean;
  /** W4: los objetos del lugar que colocó el perito. */
  objetos?: ObjetoMapa[];
  /** W5: las zonas de otra superficie, las zonas onduladas y los topes. */
  terreno?: TerrenoMapa[];
  /** A3: los peatones y los ciclistas que colocó el perito. */
  personas?: PersonaMapa[];
  /**
   * W4, corregir después: lo ya colocado se toca para seleccionarlo («coche:V1», «objeto:obj-1»,
   * «marca:golpe», «marca:objeto-2», «marca:paso-V1-1», «terreno:zona-1», «persona:per-1» y
   * «persona:per-1:final») y lo seleccionado se arrastra.
   */
  onSeleccionar?: (clave: string) => void;
  seleccion?: string | null;
  onMover?: (clave: string, p: Punto) => void;
  /**
   * El anillo de giro de lo seleccionado (René, 2026-11-17): al soltarlo, el rumbo que marca (con
   * imán de 15°; Shift lo suelta) y lo que giró desde donde se tomó.
   */
  onGirarSeleccion?: (clave: string, giro: { rumbo: number; delta: number }) => void;
  /** El nombre de cada cosa seleccionable, para leerla con el lector de pantalla. */
  nombreDe?: (clave: string) => string;
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
  const raiz = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<MapaMl | null>(null);
  const [listo, setListo] = useState(false);
  const ultimo = useRef(p);
  useEffect(() => {
    ultimo.current = p;
  });
  const marcas = useRef<Marker[]>([]);
  // La etiqueta de «Medir»; se declara aquí porque el mapa la quita al devolverse.
  const etiquetaMedida = useRef<Marker | null>(null);
  const MarkerCls = useRef<typeof Marker | null>(null);

  // El mapa: una vez. Sin giro (el norte siempre arriba: las flechas dicen «del sur» de verdad).
  useEffect(() => {
    let vivo = true;
    let prestado: MapaPrestado | null = null;
    let observador: ResizeObserver | null = null;
    const anfitrion = contenedor.current;
    if (!anfitrion) return undefined;
    const e = ultimo.current.encuadre;
    void import("maplibre-gl").then(({ Marker: M }) => {
      MarkerCls.current = M;
    });
    // El mapa es uno solo para todo el caso (`mapa-compartido`): aquí se toma prestado.
    void tomarMapa(
      anfitrion,
      {
        style: estiloMapaEscena(ultimo.current.tema),
        center: e[0] ? [e[0].lon, e[0].lat] : [-99.13, 19.43],
        zoom: e[0] ? 19 : 11,
        maxZoom: 21.5,
        girar: false,
      },
      (p) => {
        prestado = p;
        if (!vivo) {
          p.soltar();
          return;
        }
        const instancia = p.mapa;
        p.oir("click", (ev) => {
          ultimo.current.onToque?.({ lat: ev.lngLat.lat, lon: ev.lngLat.lng });
        });
        // El contenedor puede nacer sin tamaño (la pantalla aún se acomoda): el mapa se ajusta solo.
        const obs = new ResizeObserver(() => instancia.resize());
        obs.observe(anfitrion);
        observador = obs;
        // La escala a la vista (para las pruebas: tocar a tantos metros de algo).
        const escala = () => {
          if (!raiz.current) return;
          raiz.current.dataset.mPorPx = F.fijo(
            metrosPorPixel(instancia.getCenter().lat, instancia.getZoom()),
            5,
          );
        };
        p.oir("moveend", escala);
        encuadrar(instancia, ultimo.current.encuadre, false);
        mapa.current = instancia;
        ultimo.current.onMapa?.(instancia);
        setListo(true);
      },
      () => vivo,
    );
    return () => {
      vivo = false;
      observador?.disconnect();
      ultimo.current.onMapa?.(null);
      // Lo que se puso encima se quita antes de devolverlo.
      for (const x of marcas.current) x.remove();
      etiquetaMedida.current?.remove();
      if (mapa.current) mapa.current.getCanvas().style.cursor = "";
      prestado?.soltar();
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
  const claveEncuadre = p.encuadre.map((x) => `${F.fijo(x.lat, 5)},${F.fijo(x.lon, 5)}`).join("|");
  useEffect(() => {
    if (listo && mapa.current) encuadrar(mapa.current, p.encuadre, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambian los puntos
  }, [claveEncuadre, listo]);

  // Las líneas punteadas (por dónde venía, hasta dónde quedó) y la medición: una fuente GeoJSON.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    const dibujar = () => {
      // El terreno va debajo de las líneas.
      dibujarTerreno(m, ultimo.current.terreno ?? []);
      dibujarLineas(m, ultimo.current.lineas ?? []);
    };
    dibujar();
    m.on("style.load", dibujar);
    return () => {
      m.off("style.load", dibujar);
    };
  }, [listo, p.lineas, p.terreno]);

  // La medición (ronda 2, A5): con el modo activo, el cursor es una cruz y, desde el primer extremo,
  // la línea sigue al puntero con los metros en vivo.
  const [puntero, setPuntero] = useState<Punto | null>(null);
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo || !p.midiendo) {
      setPuntero(null);
      return;
    }
    const lienzo = m.getCanvas();
    const mover = (ev: { lngLat: { lat: number; lng: number } }) =>
      setPuntero({ lat: ev.lngLat.lat, lon: ev.lngLat.lng });
    const salir = () => setPuntero(null);
    lienzo.style.cursor = "crosshair";
    m.on("mousemove", mover);
    lienzo.addEventListener("mouseleave", salir);
    return () => {
      lienzo.style.cursor = "";
      m.off("mousemove", mover);
      lienzo.removeEventListener("mouseleave", salir);
    };
  }, [listo, p.midiendo]);
  useEffect(() => {
    const m = mapa.current;
    const M = MarkerCls.current;
    if (!m || !M || !listo) return;
    const { geojson, etiqueta } = dibujoMedicion(p.medicion ?? [], p.midiendo ? puntero : null);
    const dibujar = () => dibujarMedida(m, geojson);
    dibujar();
    m.on("style.load", dibujar);
    if (etiqueta) {
      if (!etiquetaMedida.current) {
        const el = document.createElement("div");
        el.className = "escena-medida-etiqueta";
        el.setAttribute("data-testid", "medida-mapa");
        etiquetaMedida.current = new M({ element: el, anchor: "bottom-left", offset: [10, -8] });
      }
      const el = etiquetaMedida.current.getElement();
      el.textContent = etiqueta.texto;
      el.dataset.viva = etiqueta.viva ? "si" : "no";
      etiquetaMedida.current.setLngLat([etiqueta.en.lon, etiqueta.en.lat]).addTo(m);
    } else etiquetaMedida.current?.remove();
    return () => {
      m.off("style.load", dibujar);
    };
  }, [listo, p.medicion, p.midiendo, puntero]);

  // Los marcadores: se rehacen cuando cambia lo que muestran (son pocos) y se escalan con el zoom. Se
  // comparan por contenido: la escena manda arreglos nuevos en cada render.
  const claveMarcadores = JSON.stringify([
    p.choques,
    p.marcas,
    p.propuesta,
    p.flechas,
    p.coches,
    p.objetos,
    p.terreno,
    p.personas,
    p.tema,
    p.seleccion,
    Boolean(p.onSeleccionar),
    Boolean(p.onMoverCoche),
    Boolean(p.onGirar),
    Boolean(p.onGirarSeleccion),
  ]);
  useEffect(() => {
    const m = mapa.current;
    const M = MarkerCls.current;
    if (!m || !M || !listo) return;
    // Los marcadores se rehacen: si el foco del teclado estaba en uno, vuelve al nuevo (al
    // seleccionarlo con Enter o moverlo con las flechas no se pierde).
    const foco = document.activeElement;
    const enfocada =
      foco instanceof HTMLElement && raiz.current?.contains(foco)
        ? (foco.closest("[data-clave]")?.getAttribute("data-clave") ?? null)
        : null;
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
    // W4: con `onSeleccionar`, lo ya colocado toma el puntero; lo seleccionado se arrastra.
    const seleccionable = (el: HTMLElement, clave: string) => {
      if (!ultimo.current.onSeleccionar) return false;
      const sel = p.seleccion === clave;
      el.classList.add("escena-seleccionable");
      if (sel) el.classList.add("escena-seleccionado");
      el.setAttribute("data-clave", clave);
      el.setAttribute("data-seleccionado", sel ? "si" : "no");
      // Con el teclado (René, 2026-11-17): Tab llega a cada cosa colocada y Enter o Espacio la
      // selecciona; las flechas, Q/E, Supr y Esc los atiende la escena.
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-label",
        ultimo.current.nombreDe?.(clave) ?? el.getAttribute("aria-label") ?? clave,
      );
      el.setAttribute("aria-pressed", sel ? "true" : "false");
      el.style.pointerEvents = "auto";
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ultimo.current.onSeleccionar?.(clave);
      });
      el.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        ev.stopPropagation();
        ultimo.current.onSeleccionar?.(clave);
      });
      return sel;
    };
    const arrastrable = (mk: Marker, clave: string) => {
      mk.setDraggable(true);
      // Al soltar, una sola vez: con `dragend` o, si MapLibre no lo dispara (el ratón se suelta
      // fuera de su manejador), con el `pointerup` de la ventana.
      let arrastrando = false;
      const soltar = () => {
        if (!arrastrando) return;
        arrastrando = false;
        window.removeEventListener("pointerup", soltar);
        const ll = mk.getLngLat();
        mk.getElement().style.pointerEvents = "auto";
        ultimo.current.onMover?.(clave, { lat: ll.lat, lon: ll.lng });
      };
      mk.on("dragstart", () => {
        arrastrando = true;
        // El anillo se queda donde estaba: mientras se arrastra no se ve.
        raiz.current
          ?.querySelectorAll<HTMLElement>(".escena-anillo")
          .forEach((x) => (x.style.visibility = "hidden"));
        window.addEventListener("pointerup", soltar);
      });
      mk.on("dragend", soltar);
    };
    /**
     * El anillo de giro de lo seleccionado (como el de «Colocar», ADR del punto 3 de René): se toma
     * de su banda y el ángulo del puntero respecto del centro es el rumbo, con imán de 15° (Shift lo
     * suelta). Con `rumbo` (un vehículo, un objeto) la silueta gira en vivo; sin él (el terreno, que
     * no guarda un rumbo), se cuenta lo girado desde donde se tomó. Al soltar se avisa una vez.
     */
    const anillo = (
      clave: string,
      centro: Punto,
      radio: () => number,
      rumbo: number | null,
      cuerpo: HTMLElement | null,
    ) => {
      if (!ultimo.current.onGirarSeleccion) return;
      const ns = "http://www.w3.org/2000/svg";
      const el = document.createElement("div");
      el.className = "escena-anillo";
      el.setAttribute("data-testid", "anillo-seleccion");
      el.setAttribute("aria-hidden", "true");
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("class", "escena-anillo-svg");
      const circulo = document.createElementNS(ns, "circle");
      circulo.setAttribute("class", "escena-anillo-circulo");
      const banda = document.createElementNS(ns, "circle");
      banda.setAttribute("class", "escena-anillo-banda");
      banda.setAttribute("data-testid", "banda-giro");
      const asa = document.createElementNS(ns, "circle");
      asa.setAttribute("class", "escena-anillo-asa");
      asa.setAttribute("r", "8");
      svg.append(circulo, banda, asa);
      const rotulo = document.createElement("span");
      rotulo.className = "escena-anillo-rotulo";
      rotulo.setAttribute("data-testid", "rotulo-giro");
      el.append(svg, rotulo);
      let angulo = rumbo ?? 0;
      const dibujar = () => {
        const r = radio();
        const lado = r + 16;
        svg.setAttribute("width", String(lado * 2));
        svg.setAttribute("height", String(lado * 2));
        svg.setAttribute("viewBox", `${-lado} ${-lado} ${lado * 2} ${lado * 2}`);
        svg.style.left = `${-lado}px`;
        svg.style.top = `${-lado}px`;
        for (const c of [circulo, banda]) c.setAttribute("r", String(r));
        const a = (angulo * Math.PI) / 180;
        asa.setAttribute("cx", String(r * Math.sin(a)));
        asa.setAttribute("cy", String(-r * Math.cos(a)));
        rotulo.style.transform = `translate(-50%, ${r + 20}px)`;
      };
      dibujar();
      escalar.push(dibujar);
      const delPuntero = (ev: PointerEvent) => {
        const caja = m.getContainer().getBoundingClientRect();
        const c = m.project([centro.lon, centro.lat]);
        return rumboDesdePuntero(
          ev.clientX - (caja.left + c.x),
          ev.clientY - (caja.top + c.y),
          m.getBearing(),
          ev.shiftKey,
        );
      };
      // Lo girado de `a0` a `a`, por el lado corto (−180°, 180°].
      const giro = (a: number, a0: number) => {
        const d = normalizar(a - a0);
        return d > 180 ? d - 360 : d;
      };
      let inicio: number | null = null;
      let ultimoAngulo = 0;
      const mover = (ev: PointerEvent) => {
        if (inicio === null) return;
        ultimoAngulo = delPuntero(ev);
        if (rumbo !== null) {
          angulo = ultimoAngulo;
          if (cuerpo) cuerpo.style.transform = `translate(-50%, -50%) rotate(${angulo}deg)`;
          rotulo.textContent = `${angulo}°`;
        } else {
          const d = giro(ultimoAngulo, inicio);
          angulo = d;
          rotulo.textContent = `${d > 0 ? "+" : ""}${d}°`;
        }
        dibujar();
      };
      const terminar = (ev: PointerEvent, cancelado: boolean) => {
        if (inicio === null) return;
        if (banda.hasPointerCapture?.(ev.pointerId)) banda.releasePointerCapture(ev.pointerId);
        const a0 = inicio;
        inicio = null;
        rotulo.textContent = "";
        const delta = giro(ultimoAngulo, a0);
        const cambio =
          !cancelado &&
          (rumbo !== null ? normalizar(ultimoAngulo) !== normalizar(rumbo) : delta !== 0);
        if (cambio) {
          ultimo.current.onGirarSeleccion?.(clave, { rumbo: ultimoAngulo, delta });
          return;
        }
        // Sin cambio (o cancelado), todo vuelve a como estaba.
        angulo = rumbo ?? 0;
        if (cuerpo && rumbo !== null)
          cuerpo.style.transform = `translate(-50%, -50%) rotate(${rumbo}deg)`;
        dibujar();
      };
      banda.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        banda.setPointerCapture?.(ev.pointerId);
        inicio = delPuntero(ev);
        ultimoAngulo = inicio;
      });
      banda.addEventListener("pointermove", mover);
      banda.addEventListener("pointerup", (ev) => terminar(ev, false));
      banda.addEventListener("pointercancel", (ev) => terminar(ev, true));
      // Que el mapa no se mueva ni tome el toque como un toque en el vacío.
      for (const tipo of ["mousedown", "touchstart", "click", "dblclick"])
        banda.addEventListener(tipo, (ev) => ev.stopPropagation());
      agregar(el, centro);
    };

    for (const c of p.choques) {
      const el = document.createElement("div");
      el.className = "escena-choque";
      el.dataset.testid = `choque-${c.orden}`;
      el.setAttribute("data-testid", `choque-${c.orden}`);
      el.innerHTML = `<span class="escena-choque-golpe"><svg viewBox="-12 -12 24 24" width="44" height="44" aria-hidden="true"><path d="M0 -11 L3 -4 L10 -6 L5 0 L10 6 L3 4 L0 11 L-3 4 L-10 6 L-5 0 L-10 -6 L-3 -4 Z" fill="#FF5A1F" stroke="#fff" stroke-width="1.4"/><circle r="2.2" fill="#fff"/></svg></span><span class="escena-etiqueta escena-etiqueta-choque">Choque</span>`;
      el.style.pointerEvents = "none";
      agregar(el, c.punto);
    }

    for (const mk of p.marcas ?? []) {
      const el = document.createElement("div");
      el.setAttribute("data-testid", `marca-${mk.id}`);
      el.style.cssText =
        "pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:2px";
      const clave = `marca:${mk.id}`;
      const borde = "border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)";
      const figura =
        mk.tipo === "paso"
          ? `<span style="display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:${mk.color ?? "#2563EB"};color:#fff;font:700 12px/1 system-ui;${borde}">${escaparHtml(mk.texto)}</span>`
          : mk.tipo === "golpe"
            ? `<span style="width:16px;height:16px;transform:rotate(45deg);background:#FF5A1F;${borde}"></span>`
            : `<span style="width:16px;height:16px;border-radius:3px;background:#1F2937;${borde}"></span>`;
      el.innerHTML =
        mk.tipo === "paso"
          ? figura
          : `${figura}<span class="escena-etiqueta">${escaparHtml(mk.texto)}</span>`;
      el.firstElementChild?.classList.add("escena-marca-figura");
      const sel = seleccionable(el, clave);
      if (sel && mk.tipo === "paso") {
        // El punto de paso solo lleva su número: seleccionado, también su nombre.
        const nombre = document.createElement("span");
        nombre.className = "escena-etiqueta";
        nombre.textContent = ultimo.current.nombreDe?.(clave) ?? mk.texto;
        nombre.style.transform = "translate(18px, -14px)";
        el.append(nombre);
      }
      const marcador = agregar(el, mk.punto);
      if (sel) arrastrable(marcador, clave);
    }

    for (const o of p.objetos ?? []) {
      const el = document.createElement("div");
      el.className = "escena-objeto";
      el.setAttribute("data-testid", `objeto-${o.id}`);
      el.setAttribute("aria-label", o.nombre);
      el.setAttribute("role", "img");
      el.style.pointerEvents = "none";
      const cuerpo = document.createElement("div");
      cuerpo.className = "escena-objeto-cuerpo";
      cuerpo.dataset.tipo = o.tipo;
      el.append(cuerpo);
      const clave = `objeto:${o.id}`;
      const sel = seleccionable(el, clave);
      if (sel) {
        const nombre = document.createElement("span");
        nombre.className = "escena-etiqueta";
        nombre.textContent = o.nombre;
        nombre.style.transform = "translate(16px, -30px)";
        el.append(nombre);
      }
      const marcador = agregar(el, o.punto);
      if (sel) arrastrable(marcador, clave);
      const ajustar = () => {
        // Nunca más chico que un dedo: un poste de 30 cm sigue siendo fácil de tocar.
        const l = Math.max(tamano(m, o.punto.lat, o.largo), 18);
        const a = Math.max(tamano(m, o.punto.lat, o.ancho), 12);
        cuerpo.style.width = `${a}px`;
        cuerpo.style.height = `${l}px`;
        cuerpo.style.transform = `translate(-50%, -50%) rotate(${o.rumbo}deg)`;
      };
      ajustar();
      escalar.push(ajustar);
      if (sel)
        anillo(
          clave,
          o.punto,
          () => Math.max(tamano(m, o.punto.lat, o.largo) * 0.6, 22) + 16,
          o.rumbo,
          cuerpo,
        );
    }

    // A3: cada persona es una insignia con su figura y una flecha corta hacia donde iba; dónde quedó,
    // un punto aparte con la distancia de proyección a la mitad de la línea.
    const colorPersona = COLOR_PERSONA[p.tema];
    for (const per of p.personas ?? []) {
      const clave = `persona:${per.id}`;
      const el = document.createElement("div");
      el.className = "escena-persona";
      el.setAttribute("data-testid", `persona-${per.id}`);
      el.setAttribute("data-rol", per.rol);
      el.setAttribute("data-rumbo", String(per.rumbo));
      el.setAttribute("aria-label", per.nombre);
      el.setAttribute("role", "img");
      el.style.pointerEvents = "none";
      const rumbo = document.createElement("div");
      rumbo.className = "escena-persona-rumbo";
      rumbo.innerHTML = `<svg viewBox="-30 -30 60 60" width="60" height="60" aria-hidden="true"><path d="M0 -29 L7.5 -19 L2.8 -19 L2.8 -15.5 L-2.8 -15.5 L-2.8 -19 L-7.5 -19 Z"/></svg>`;
      rumbo.style.transform = `translate(-50%, -50%) rotate(${per.rumbo}deg)`;
      const figura = document.createElement("span");
      figura.className = "escena-persona-figura";
      figura.innerHTML = svgPersona(per.rol, "#FFFFFF");
      el.append(rumbo, figura);
      const sel = seleccionable(el, clave);
      if (sel) {
        const nombre = document.createElement("span");
        nombre.className = "escena-etiqueta";
        nombre.textContent = ultimo.current.nombreDe?.(clave) ?? per.nombre;
        nombre.style.transform = "translate(22px, -40px)";
        el.append(nombre);
      }
      const marcador = agregar(el, per.punto);
      if (sel) {
        arrastrable(marcador, clave);
        anillo(clave, per.punto, () => 40, per.rumbo, rumbo);
      }
      if (!per.final) continue;
      const claveFinal = `${clave}:final`;
      const fin = document.createElement("div");
      fin.className = "escena-persona-final";
      fin.setAttribute("data-testid", `persona-final-${per.id}`);
      fin.setAttribute("aria-label", `Dónde quedó: ${per.nombre}`);
      fin.setAttribute("role", "img");
      fin.style.pointerEvents = "none";
      fin.style.setProperty("--color-persona", colorPersona);
      const punto = document.createElement("span");
      punto.className = "escena-persona-final-punto";
      fin.append(punto);
      const selFinal = seleccionable(fin, claveFinal);
      const mkFinal = agregar(fin, per.final);
      // Con la persona seleccionada, dónde quedó también se arrastra directo.
      if (selFinal || sel) arrastrable(mkFinal, claveFinal);
      if (per.proyeccion) {
        const medio = {
          lat: (per.punto.lat + per.final.lat) / 2,
          lon: (per.punto.lon + per.final.lon) / 2,
        };
        const caja = document.createElement("div");
        caja.className = "escena-persona-proyeccion";
        caja.style.pointerEvents = "none";
        const etiqueta = document.createElement("span");
        etiqueta.className = "escena-etiqueta escena-etiqueta-proyeccion";
        etiqueta.setAttribute("data-testid", "proyeccion-persona");
        etiqueta.setAttribute("data-persona", per.id);
        etiqueta.style.setProperty("--color-persona", colorPersona);
        etiqueta.textContent = per.proyeccion;
        caja.append(etiqueta);
        agregar(caja, medio);
      }
    }

    // W5: cada pieza del terreno lleva su etiqueta en el centro; de ahí se toca y se arrastra.
    for (const t of p.terreno ?? []) {
      const el = document.createElement("div");
      el.setAttribute("data-testid", `terreno-${t.id}`);
      el.setAttribute("data-clase", t.clase);
      el.style.pointerEvents = "none";
      const nombre = document.createElement("span");
      nombre.className = "escena-etiqueta escena-etiqueta-terreno";
      nombre.textContent = t.nombre;
      nombre.style.setProperty("--color-terreno", colorTerreno(t));
      el.append(nombre);
      const clave = `terreno:${t.id}`;
      const sel = seleccionable(el, clave);
      const marcador = agregar(el, t.centro);
      if (sel) arrastrable(marcador, clave);
      // El terreno no guarda un rumbo: el anillo cuenta lo girado desde donde se tomó.
      if (sel) anillo(clave, t.centro, () => 64, null, null);
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
      // Solo el coche que se coloca toma el puntero (se arrastra); los demás dejan tocar el mapa.
      el.style.pointerEvents = c.activo ? "auto" : "none";
      const cuerpo = document.createElement("div");
      cuerpo.className = "escena-coche-cuerpo";
      cuerpo.innerHTML = htmlCoche(c);
      const nombre = document.createElement("span");
      nombre.className = "escena-etiqueta escena-etiqueta-coche";
      nombre.textContent = c.nombre;
      nombre.style.setProperty("--color-coche", c.color);
      el.append(cuerpo, nombre);
      const clave = `coche:${c.id.replace(/-(final|impacto)$/, "")}`;
      // Solo el coche en reposo se arrastra al corregir: el del impacto se corrige con su pregunta.
      const sel = !c.activo && seleccionable(el, clave);
      const mk = agregar(el, c.punto, {
        draggable: Boolean(c.activo && ultimo.current.onMoverCoche),
      });
      if (sel && c.id.endsWith("-final")) arrastrable(mk, clave);
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
        const lejos = c.activo ? 46 : 6;
        nombre.style.transform = `translate(${Math.max(a, l) * 0.55 + lejos}px, ${-Math.max(a, l) * 0.55 - (c.activo ? 34 : 0)}px)`;
      };
      ajustar();
      escalar.push(ajustar);
      if (sel && c.id.endsWith("-final"))
        anillo(
          clave,
          c.punto,
          () => Math.max(tamano(m, c.punto.lat, c.largo) * 0.6, 34) + 14,
          c.rumbo,
          cuerpo,
        );
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
    if (enfocada)
      Array.from(raiz.current?.querySelectorAll<HTMLElement>("[data-clave]") ?? [])
        .find((x) => x.getAttribute("data-clave") === enfocada)
        ?.focus({ preventScroll: true });
    const alZoom = () => escalar.forEach((f) => f());
    m.on("zoom", alZoom);
    return () => {
      m.off("zoom", alZoom);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- por contenido: rehacer un marcador a media maniobra pierde el arrastre
  }, [listo, claveMarcadores]);

  return (
    <div
      ref={raiz}
      className="absolute inset-0"
      data-testid="mapa-facil"
      data-listo={listo ? "si" : "no"}
    >
      {/* En línea: la hoja de MapLibre (sin capa) le pone position: relative y le ganaría a la clase. */}
      <div ref={contenedor} style={{ position: "absolute", inset: 0 }} />
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

/**
 * El margen libre del mapa: a la izquierda va la hoja de la pregunta (en escritorio) y abajo, el
 * avance; en el celular la hoja va abajo.
 */
function margen(m: MapaMl) {
  const { clientWidth: w, clientHeight: h } = m.getContainer();
  return w >= 900
    ? { top: 140, bottom: 150, left: 470, right: 100 }
    : { top: 60, bottom: Math.round(h * 0.55), left: 30, right: 30 };
}

/** Lleva el mapa a los puntos: uno al centro (zoom 20.3); varios, encuadrados. */
function encuadrar(m: MapaMl, puntos: readonly Punto[], animar: boolean) {
  if (!puntos.length) return;
  const padding = margen(m);
  if (puntos.length === 1) {
    const [p] = puntos as [Punto];
    const opts = {
      center: [p.lon, p.lat] as [number, number],
      zoom: Math.max(m.getZoom(), 20.3),
      padding,
    };
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
    { padding, maxZoom: 20.6, animate: animar },
  );
}

const colorTerreno = (t: TerrenoMapa) =>
  t.clase === "tope"
    ? COLOR_TOPE
    : t.clase === "ondulacion"
      ? COLOR_ONDULACION
      : (COLOR_SUPERFICIE[t.tipo as keyof typeof COLOR_SUPERFICIE] ?? "#8A8F98");

/** El terreno marcado: las zonas como polígonos de su color y los topes como una franja amarilla. */
function dibujarTerreno(m: MapaMl, terreno: readonly TerrenoMapa[]) {
  if (!m.isStyleLoaded()) return;
  const datos = {
    type: "FeatureCollection" as const,
    features: terreno.map((t) => ({
      type: "Feature" as const,
      properties: { color: colorTerreno(t), clase: t.clase },
      geometry:
        t.clase === "tope"
          ? {
              type: "LineString" as const,
              coordinates: t.puntos.map((q) => [q.lon, q.lat]),
            }
          : {
              type: "Polygon" as const,
              coordinates: [[...t.puntos, t.puntos[0]!].map((q) => [q.lon, q.lat])],
            },
    })),
  };
  const fuente = m.getSource("escena-terreno") as GeoJSONSource | undefined;
  if (fuente) {
    fuente.setData(datos);
    return;
  }
  m.addSource("escena-terreno", { type: "geojson", data: datos });
  // Debajo de las líneas de los trayectos, si ya están.
  const antes = m.getLayer("escena-lineas") ? "escena-lineas" : undefined;
  m.addLayer(
    {
      id: "escena-terreno-zonas",
      type: "fill",
      source: "escena-terreno",
      filter: ["!=", ["get", "clase"], "tope"],
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["case", ["==", ["get", "clase"], "ondulacion"], 0.22, 0.42],
      },
    },
    antes,
  );
  m.addLayer(
    {
      id: "escena-terreno-orillas",
      type: "line",
      source: "escena-terreno",
      filter: ["!=", ["get", "clase"], "tope"],
      paint: { "line-color": ["get", "color"], "line-width": 2, "line-dasharray": [2, 1.5] },
    },
    antes,
  );
  m.addLayer(
    {
      id: "escena-terreno-topes",
      type: "line",
      source: "escena-terreno",
      filter: ["==", ["get", "clase"], "tope"],
      layout: { "line-cap": "butt" },
      paint: {
        "line-color": ["get", "color"],
        // Un tope mide de 1.4 a 5.4 m a lo largo de la vía: que se vea a cualquier acercamiento.
        "line-width": ["interpolate", ["exponential", 2], ["zoom"], 16, 3, 19, 9, 21, 28],
      },
    },
    antes,
  );
}

/**
 * Dibuja en cuanto se pueda: si el mapa aún carga (teselas, el estilo), lo último que se pidió se
 * dibuja cuando queda quieto. Antes se saltaba y la línea no aparecía hasta el siguiente cambio
 * (ronda 2, A5).
 */
const pendientes = new WeakMap<MapaMl, Map<string, () => void>>();
function cuandoSePueda(m: MapaMl, clave: string, dibujar: () => void) {
  if (m.isStyleLoaded()) {
    dibujar();
    return;
  }
  let p = pendientes.get(m);
  if (!p) {
    p = new Map();
    pendientes.set(m, p);
  }
  const habia = p.size > 0;
  p.set(clave, dibujar);
  if (habia) return;
  const intentar = () => {
    const q = pendientes.get(m);
    if (!q) return;
    try {
      for (const f of q.values()) f();
      pendientes.delete(m);
    } catch {
      // El estilo todavía no está: se intenta en el siguiente momento quieto.
      m.once("idle", intentar);
    }
  };
  m.once("idle", intentar);
}

/** La medida (A5): la línea sólida en el color de señal y los extremos numerados. */
function dibujarMedida(m: MapaMl, datos: ReturnType<typeof dibujoMedicion>["geojson"]) {
  cuandoSePueda(m, "medida", () => ponerMedida(m, datos));
}
function ponerMedida(m: MapaMl, datos: ReturnType<typeof dibujoMedicion>["geojson"]) {
  const fuente = m.getSource("escena-medida") as GeoJSONSource | undefined;
  if (fuente) {
    fuente.setData(datos);
    return;
  }
  m.addSource("escena-medida", { type: "geojson", data: datos });
  m.addLayer({
    id: "escena-medida-linea",
    type: "line",
    source: "escena-medida",
    filter: ["==", ["get", "tipo"], "linea"],
    layout: { "line-cap": "round" },
    paint: {
      "line-color": COLOR_MEDIDA,
      "line-width": ["interpolate", ["linear"], ["zoom"], 16, 3, 20, 5],
      "line-opacity": ["case", ["get", "viva"], 0.75, 1],
    },
  });
  m.addLayer({
    id: "escena-medida-extremo",
    type: "circle",
    source: "escena-medida",
    filter: ["==", ["get", "tipo"], "extremo"],
    paint: {
      "circle-radius": 7,
      "circle-color": "#FFFFFF",
      "circle-stroke-color": COLOR_MEDIDA,
      "circle-stroke-width": 3,
    },
  });
}

function dibujarLineas(m: MapaMl, lineas: readonly LineaMapa[]) {
  cuandoSePueda(m, "lineas", () => ponerLineas(m, lineas));
}
function ponerLineas(m: MapaMl, lineas: readonly LineaMapa[]) {
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
