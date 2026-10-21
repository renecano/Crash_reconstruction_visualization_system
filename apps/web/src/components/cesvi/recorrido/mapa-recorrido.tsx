"use client";
/**
 * El mapa del recorrido del perito (ADR 0052 y 0053): una sola instancia de MapLibre para todos los
 * pasos, así la cámara vuela de un paso al siguiente.
 *
 * - Dibuja las calles, la versión a la vista (completa, o animada de la posición inicial al impacto
 *   y a la final) y la zona de restos. Cada vehículo va en su color y con su nombre («A · Silverado»).
 * - En los pasos que lo permiten, el perito elige y arrastra el punto de impacto, los extremos de
 *   los restos y las tres posiciones de cada vehículo. Cada punto lleva su etiqueta (en dos columnas,
 *   con una línea al punto); lo elegido se resalta.
 * - Entrega una consulta de las calles de los mosaicos ya cargados, para no esperar a Overpass.
 */
import {
  avanzar,
  distanciaM,
  FASES,
  rectanguloVehiculo,
  rumboCercano,
  rumboDeg,
  type Calle,
  type Fase,
  type LonLat,
  type Medidas,
  type Pose,
  type VersionCroquis,
} from "@croquis/cesvi";
import type { Feature, Position } from "geojson";
import type { GeoJSONSource, Map as MapaMl, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { colores, ESTILO_MAPA, marcador, vacio } from "../mapa-comun";
import { acomodarEtiquetas, ALTO_ETIQUETA } from "./etiquetas-mapa";

export type Camara =
  | { tipo: "vista"; centro: LonLat; zoom: number }
  | { tipo: "encuadre"; puntos: LonLat[]; zoomMax: number };

/** Lo que el perito puede elegir y mover en el mapa. */
export type Seleccion =
  | { tipo: "pose"; letra: "A" | "B"; fase: Fase }
  | { tipo: "impacto" }
  | { tipo: "restos"; extremo: "inicio" | "fin" };

export interface EdicionMapa {
  seleccion: Seleccion;
  onSeleccion: (s: Seleccion) => void;
  onMover: (s: Seleccion, p: LonLat) => void;
}

type Lado = "izq" | "der";
const LADO: Record<"A" | "B", Lado> = { A: "izq", B: "der" };

interface ItemEtiqueta {
  /** También es su `data-testid`. */
  id: string;
  texto: string;
  clase: string;
  lado: Lado;
  punto: LonLat;
  /** Color de la línea que la une con su punto. */
  color: string;
  elegida?: boolean;
  onClick?: () => void;
}

const idMarca = (s: Seleccion) =>
  s.tipo === "pose"
    ? `marca-${s.letra}-${s.fase}`
    : s.tipo === "impacto"
      ? "marca-impacto"
      : `marca-restos-${s.extremo}`;

/**
 * Crea la capa de etiquetas sobre el mapa y devuelve la función que la dibuja con lo que haya en
 * `items`: sincroniza los elementos, los acomoda en dos columnas y traza la línea a cada punto.
 */
function capaDeEtiquetas(m: MapaMl, items: { current: ItemEtiqueta[] }): () => void {
  const capa = document.createElement("div");
  capa.className = "capa-etiquetas";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  capa.appendChild(svg);
  m.getContainer().appendChild(capa);
  const elementos = new Map<string, HTMLElement>();
  const clics = new Map<string, (() => void) | undefined>();
  return () => {
    const lista = items.current;
    for (const [id, el] of elementos) {
      if (!lista.some((it) => it.id === id)) {
        el.remove();
        elementos.delete(id);
      }
    }
    for (const it of lista) {
      let el = elementos.get(it.id);
      if (!el) {
        el = document.createElement(it.onClick ? "button" : "div");
        if (el instanceof HTMLButtonElement) el.type = "button";
        el.dataset.testid = it.id;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          clics.get(it.id)?.();
        });
        capa.appendChild(el);
        elementos.set(it.id, el);
      }
      clics.set(it.id, it.onClick);
      el.className = `etiqueta-mapa ${it.clase}${it.elegida ? " marca-elegida" : ""}`;
      if (el.textContent !== it.texto) el.textContent = it.texto;
      if (it.elegida) el.setAttribute("aria-pressed", "true");
      else el.removeAttribute("aria-pressed");
    }
    const colocadas = acomodarEtiquetas(
      lista.map((it) => {
        const p = m.project([it.punto[0], it.punto[1]]);
        return {
          id: it.id,
          lado: it.lado,
          punto: { x: p.x, y: p.y },
          ancho: elementos.get(it.id)!.offsetWidth,
        };
      }),
      { ancho: capa.clientWidth, alto: capa.clientHeight },
    );
    const lineas: string[] = [];
    for (const c of colocadas) {
      const el = elementos.get(c.id)!;
      const it = lista.find((x) => x.id === c.id)!;
      el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`;
      const borde = it.lado === "izq" ? c.x + el.offsetWidth : c.x;
      const y = c.y + ALTO_ETIQUETA / 2;
      lineas.push(
        `<line x1="${borde.toFixed(1)}" y1="${y.toFixed(1)}" x2="${c.ancla.x.toFixed(1)}" y2="${c.ancla.y.toFixed(1)}" stroke="${it.color}" stroke-width="${it.elegida ? 2.5 : 1.5}" stroke-opacity="0.8"/>`,
        `<circle cx="${c.ancla.x.toFixed(1)}" cy="${c.ancla.y.toFixed(1)}" r="3" fill="${it.color}"/>`,
      );
    }
    svg.innerHTML = lineas.join("");
  };
}

const ETIQUETA_FASE: Record<Fase, string> = {
  inicial: "inicial",
  impacto: "impacto",
  final: "final",
};
const movimientoReducido = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const igualSeleccion = (a: Seleccion, b: Seleccion) =>
  a.tipo === b.tipo &&
  (a.tipo !== "pose" || (b.tipo === "pose" && a.letra === b.letra && a.fase === b.fase)) &&
  (a.tipo !== "restos" || (b.tipo === "restos" && a.extremo === b.extremo));

/** La pose de un vehículo en el instante t∈[0,1]: de la inicial al impacto y del impacto a la final. */
function poseEn(v: VersionCroquis, letra: "A" | "B", t: number): Pose {
  const p = v.vehiculos[letra];
  const [a, b, f] =
    t < 0.5 ? [p.inicial, p.impacto, t / 0.5] : [p.impacto, p.final, (t - 0.5) / 0.5];
  const s = f * f * (3 - 2 * f);
  const d = distanciaM(a.punto, b.punto);
  // En línea recta de a a b (a la escala de un hecho de tránsito basta).
  const punto: [number, number] =
    d > 0 ? avanzar(a.punto, rumboDeg(a.punto, b.punto), d * s) : [a.punto[0], a.punto[1]];
  return { punto, rumbo: a.rumbo + (b.rumbo - a.rumbo) * s, fuente: a.fuente };
}

const poligono = (p: Pose, m: Medidas): [number, number][] =>
  rectanguloVehiculo(p.punto, p.rumbo, m.largo, m.ancho);

/** Ancho de la banda de la zona de restos en el mapa (ilustrativo; el dictamen da su largo). */
const ANCHO_RESTOS_M = 1.6;

/** La zona de restos como banda (rayada en el mapa), o nada si mide menos de 5 cm. */
function bandaRestos(inicio: LonLat, fin: LonLat): Feature | null {
  const d = distanciaM(inicio, fin);
  if (d < 0.05) return null;
  const centro: LonLat = [(inicio[0] + fin[0]) / 2, (inicio[1] + fin[1]) / 2];
  return {
    type: "Feature",
    properties: { tipo: "restos" },
    geometry: {
      type: "Polygon",
      coordinates: [rectanguloVehiculo(centro, rumboDeg(inicio, fin), d, ANCHO_RESTOS_M)],
    },
  };
}

/** El recorrido de cada vehículo: de la posición inicial al impacto y a la final. */
function trayectorias(v: VersionCroquis, tipo: "trayectoria" | "superpuesta"): Feature[] {
  return (["A", "B"] as const).flatMap((letra) => {
    const p = v.vehiculos[letra];
    const puntos = [p.inicial.punto, p.impacto.punto, p.final.punto].filter(
      (q, i, todos) => i === 0 || distanciaM(todos[i - 1]!, q) > 0.05,
    );
    if (puntos.length < 2) return [];
    return [
      {
        type: "Feature",
        properties: { tipo, letra },
        geometry: { type: "LineString", coordinates: puntos as unknown as Position[] },
      } satisfies Feature,
    ];
  });
}

function geojsonCompleto(
  v: VersionCroquis,
  medidas: Record<"A" | "B", Medidas>,
  sel: Seleccion | null,
  superpuesta: VersionCroquis | null,
) {
  const features: Feature[] = [];
  if (superpuesta) {
    features.push(...trayectorias(superpuesta, "superpuesta"));
    for (const letra of ["A", "B"] as const) {
      features.push({
        type: "Feature",
        properties: { tipo: "superpuesta", letra },
        geometry: {
          type: "Polygon",
          coordinates: [poligono(superpuesta.vehiculos[letra].final, medidas[letra])],
        },
      });
    }
  }
  const banda = bandaRestos(v.restos.inicio, v.restos.fin);
  if (banda) features.push(banda);
  features.push(...trayectorias(v, "trayectoria"));
  for (const letra of ["A", "B"] as const) {
    for (const fase of FASES) {
      const elegida = sel?.tipo === "pose" && sel.letra === letra && sel.fase === fase;
      features.push({
        type: "Feature",
        properties: { tipo: "vehiculo", letra, fase, elegida },
        geometry: {
          type: "Polygon",
          coordinates: [poligono(v.vehiculos[letra][fase], medidas[letra])],
        },
      });
    }
  }
  return { type: "FeatureCollection" as const, features };
}

function geojsonAnimado(v: VersionCroquis, medidas: Record<"A" | "B", Medidas>, t: number) {
  const features: Feature[] = [];
  // Los restos aparecen con el impacto y crecen con el desplazamiento.
  if (t >= 0.5) {
    const f = Math.min(1, (t - 0.5) / 0.5);
    const fin: LonLat = [
      v.restos.inicio[0] + (v.restos.fin[0] - v.restos.inicio[0]) * f,
      v.restos.inicio[1] + (v.restos.fin[1] - v.restos.inicio[1]) * f,
    ];
    const banda = bandaRestos(v.restos.inicio, fin);
    if (banda) features.push(banda);
  }
  features.push(...trayectorias(v, "trayectoria"));
  for (const letra of ["A", "B"] as const) {
    features.push({
      type: "Feature",
      properties: { tipo: "vehiculo", letra, fase: "final", elegida: false },
      geometry: { type: "Polygon", coordinates: [poligono(poseEn(v, letra, t), medidas[letra])] },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

/** El rayado de la zona de restos (maqueta del paso 4): diagonales claras sobre transparente. */
function rayado(color: string): { width: number; height: number; data: Uint8Array } {
  const n = 8;
  const data = new Uint8Array(n * n * 4);
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = (y * n + x) * 4;
      const linea = (x + y) % n < 2;
      data[k] = r!;
      data[k + 1] = g!;
      data[k + 2] = b!;
      data[k + 3] = linea ? 110 : 10;
    }
  }
  return { width: n, height: n, data };
}

/** Las calles de los mosaicos ya cargados a menos de `radioM` del punto (OpenMapTiles). */
function callesDeMosaicos(m: MapaMl, p: LonLat, radioM: number): Calle[] {
  const fuente = Object.keys(m.getStyle()?.sources ?? {}).find((s) => s === "openmaptiles");
  if (!fuente) return [];
  const out: Calle[] = [];
  for (const f of m.querySourceFeatures(fuente, { sourceLayer: "transportation" })) {
    const g = f.geometry;
    const lineas =
      g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    for (const l of lineas) {
      const puntos = l.map((c) => [c[0], c[1]] as LonLat);
      const r = rumboCercano(puntos, p);
      if (!r || r.distancia > radioM) continue;
      const props = f.properties as Record<string, unknown>;
      out.push({
        tipo: String(props.class ?? "calle"),
        ...(props.name ? { nombre: String(props.name) } : {}),
        puntos,
        fuente: "mosaicos",
      });
    }
  }
  return out;
}

export function MapaRecorrido({
  camara,
  calles,
  version,
  superpuesta = null,
  medidas,
  nombres,
  animacion,
  edicion,
  onClic,
  onCaptura,
  onConsultaCalles,
  atenuado,
}: {
  camara: Camara | null;
  calles: Calle[];
  version: VersionCroquis | null;
  /** La otra versión, punteada debajo («Superponer la declarada»). */
  superpuesta?: VersionCroquis | null;
  medidas: Record<"A" | "B", Medidas>;
  /** «A · Silverado», «B · Tacoma». */
  nombres: Record<"A" | "B", string>;
  /** Progreso de la animación (0 a 1); null dibuja la versión completa. */
  animacion: number | null;
  edicion: EdicionMapa | null;
  onClic?: (p: LonLat) => void;
  onCaptura?: (capturar: () => string | null) => void;
  /** Entrega la consulta de las calles de los mosaicos (inmediata, sin red). */
  onConsultaCalles?: (consultar: (p: LonLat, radioM: number) => Calle[]) => void;
  /** El mapa queda detrás, oscurecido (pasos que no son del mapa). */
  atenuado: boolean;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaMl | null>(null);
  const marcas = useRef<Marker[]>([]);
  const [listo, setListo] = useState(false);
  const coloresVehiculo = useRef({ A: "#5AA9FF", B: "#FFC24B", evidencia: "#FF5B2E" });
  // La capa de etiquetas (HTML sobre el mapa) y lo que muestra; se redibuja al mover el mapa.
  const etiquetas = useRef<ItemEtiqueta[]>([]);
  const dibujarEtiquetas = useRef<() => void>(() => {});
  const avisos = useRef({ onClic, onCaptura, onConsultaCalles });
  useEffect(() => {
    avisos.current = { onClic, onCaptura, onConsultaCalles };
  }, [onClic, onCaptura, onConsultaCalles]);

  useEffect(() => {
    let vivo = true;
    let instancia: MapaMl | null = null;
    void import("maplibre-gl").then(({ Map, getVersion, setWorkerUrl }) => {
      if (!vivo || !contenedor.current) return;
      setWorkerUrl(`/maplibre/worker-${getVersion()}.mjs`);
      instancia = new Map({
        container: contenedor.current,
        style: ESTILO_MAPA,
        center: [-102.5, 23.6],
        zoom: 4,
        // La atribución va en el pie del recorrido (OpenStreetMap, OpenFreeMap, OpenMapTiles).
        attributionControl: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      instancia.on("click", (e) => avisos.current.onClic?.([e.lngLat.lng, e.lngLat.lat]));
      instancia.on("load", () => {
        if (!vivo || !instancia) return;
        const c = colores();
        const s = getComputedStyle(document.documentElement);
        const colorA = s.getPropertyValue("--marca-vehiculo-a").trim() || "#5AA9FF";
        const colorB = s.getPropertyValue("--marca-vehiculo-b").trim() || "#FFC24B";
        const porVehiculo = ["match", ["get", "letra"], "A", colorA, colorB] as unknown as string;
        coloresVehiculo.current = { A: colorA, B: colorB, evidencia: c.evidencia };
        dibujarEtiquetas.current = capaDeEtiquetas(instancia, etiquetas);
        instancia.on("move", () => dibujarEtiquetas.current());
        instancia.on("resize", () => dibujarEtiquetas.current());
        instancia.addSource("calles", { type: "geojson", data: vacio });
        instancia.addLayer({
          id: "calles",
          type: "line",
          source: "calles",
          paint: { "line-color": c.texto2, "line-width": 2, "line-opacity": 0.8 },
        });
        instancia.addSource("croquis", { type: "geojson", data: vacio });
        instancia.addImage("rayado", rayado(c.texto2.startsWith("#") ? c.texto2 : "#A4A9B3"));
        instancia.addLayer({
          id: "restos",
          type: "fill",
          source: "croquis",
          filter: ["==", ["get", "tipo"], "restos"],
          paint: { "fill-pattern": "rayado" },
        });
        instancia.addLayer({
          id: "superpuesta",
          type: "line",
          source: "croquis",
          filter: ["==", ["get", "tipo"], "superpuesta"],
          paint: { "line-color": c.texto3, "line-width": 1.5, "line-dasharray": [3, 3] },
        });
        instancia.addLayer({
          id: "trayectorias",
          type: "line",
          source: "croquis",
          filter: ["==", ["get", "tipo"], "trayectoria"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": porVehiculo, "line-width": 3, "line-opacity": 0.85 },
        });
        instancia.addLayer({
          id: "vehiculos",
          type: "fill",
          source: "croquis",
          filter: ["==", ["get", "tipo"], "vehiculo"],
          paint: {
            "fill-color": porVehiculo,
            "fill-opacity": ["match", ["get", "fase"], "final", 0.95, "impacto", 0.3, 0],
          },
        });
        instancia.addLayer({
          id: "vehiculos-borde",
          type: "line",
          source: "croquis",
          filter: ["==", ["get", "tipo"], "vehiculo"],
          paint: {
            "line-color": ["case", ["get", "elegida"], c.texto, porVehiculo] as unknown as string,
            "line-width": ["case", ["get", "elegida"], 2.5, 1.5] as unknown as number,
            "line-opacity": ["match", ["get", "fase"], "final", 1, 0.75],
            "line-dasharray": [
              "match",
              ["get", "fase"],
              "inicial",
              ["literal", [2.5, 2]],
              ["literal", [1, 0]],
            ],
          },
        });
        mapa.current = instancia;
        setListo(true);
        avisos.current.onCaptura?.(() => mapa.current?.getCanvas().toDataURL("image/png") ?? null);
        avisos.current.onConsultaCalles?.((p, radioM) =>
          mapa.current ? callesDeMosaicos(mapa.current, p, radioM) : [],
        );
      });
    });
    return () => {
      vivo = false;
      instancia?.remove();
      mapa.current = null;
    };
  }, []);

  // La cámara vuela a lo que pide el paso.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo || !camara) return;
    const duracion = movimientoReducido() ? 0 : 2200;
    if (camara.tipo === "vista") {
      m.flyTo({
        center: [camara.centro[0], camara.centro[1]],
        zoom: camara.zoom,
        duration: duracion,
      });
    } else if (camara.puntos.length) {
      const lons = camara.puntos.map((p) => p[0]);
      const lats = camara.puntos.map((p) => p[1]);
      m.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        // Deja libres el selector de versión (arriba), la tarjeta de los restos (abajo a la
        // izquierda) y la leyenda (abajo a la derecha).
        {
          padding: { top: 150, bottom: 110, left: 300, right: 220 },
          maxZoom: camara.zoomMax,
          duration: duracion,
        },
      );
    }
  }, [listo, camara]);

  // Calles y croquis (completo o animado).
  const seleccion = edicion?.seleccion ?? null;
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    (m.getSource("calles") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: calles.map((v) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: v.puntos as unknown as Position[] },
      })),
    });
    (m.getSource("croquis") as GeoJSONSource | undefined)?.setData(
      version === null
        ? vacio
        : animacion === null
          ? geojsonCompleto(version, medidas, seleccion, superpuesta)
          : geojsonAnimado(version, medidas, animacion),
    );
  }, [listo, calles, version, superpuesta, medidas, animacion, seleccion]);

  // La X del impacto (con su resplandor) y la medida de la zona de restos, cuando no se edita: en
  // la edición, la X es el punto que se arrastra.
  const fijos = useRef<Marker[]>([]);
  useEffect(() => {
    const m = mapa.current;
    for (const mk of fijos.current) mk.remove();
    fijos.current = [];
    if (!m || !listo || !version) return;
    let vivo = true;
    void import("maplibre-gl").then(({ Marker }) => {
      if (!vivo) return;
      const editando = edicion !== null && animacion === null;
      if (!editando && (animacion === null || animacion >= 0.5)) {
        const x = marcador("✕", "punto-mapa punto-impacto");
        x.setAttribute("aria-hidden", "true");
        x.style.pointerEvents = "none";
        fijos.current.push(new Marker({ element: x }).setLngLat(version.impacto.punto).addTo(m));
      }
      const d = distanciaM(version.restos.inicio, version.restos.fin);
      if (animacion === null && d >= 0.05) {
        const medio: LonLat = [
          (version.restos.inicio[0] + version.restos.fin[0]) / 2,
          (version.restos.inicio[1] + version.restos.fin[1]) / 2,
        ];
        const el = marcador(`${d.toFixed(2)} m`, "pildora-medida");
        el.dataset.testid = "medida-restos";
        fijos.current.push(
          new Marker({ element: el, offset: [-64, 0] }).setLngLat([medio[0], medio[1]]).addTo(m),
        );
      }
    });
    return () => {
      vivo = false;
    };
  }, [listo, version, edicion, animacion]);

  // Las etiquetas: el nombre de cada vehículo («A · Silverado», también mientras se anima) y, al
  // editar, una por marca («A · final», «✕ impacto», «R1 restos»). Van en dos columnas con una
  // línea a su punto, porque los puntos de una versión pueden coincidir (etiquetas-mapa.ts).
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    const col = coloresVehiculo.current;
    const items: ItemEtiqueta[] = [];
    if (version) {
      for (const letra of ["A", "B"] as const) {
        const pose =
          animacion === null ? version.vehiculos[letra].final : poseEn(version, letra, animacion);
        items.push({
          id: `nombre-${letra}`,
          texto: nombres[letra],
          clase: `etiqueta-nombre etiqueta-nombre-${letra.toLowerCase()}`,
          lado: LADO[letra],
          punto: pose.punto,
          color: col[letra],
        });
      }
      if (edicion && animacion === null) {
        const nueva = (sel: Seleccion, texto: string, clase: string, lado: Lado, punto: LonLat) =>
          items.push({
            id: idMarca(sel),
            texto,
            clase,
            lado,
            punto,
            color: sel.tipo === "pose" ? col[sel.letra] : col.evidencia,
            elegida: igualSeleccion(sel, edicion.seleccion),
            onClick: () => edicion.onSeleccion(sel),
          });
        for (const letra of ["A", "B"] as const) {
          for (const fase of FASES) {
            nueva(
              { tipo: "pose", letra, fase },
              `${letra} · ${ETIQUETA_FASE[fase]}`,
              `etiqueta-fase etiqueta-fase-${letra.toLowerCase()}`,
              LADO[letra],
              version.vehiculos[letra][fase].punto,
            );
          }
        }
        nueva({ tipo: "impacto" }, "✕ impacto", "etiqueta-evidencia", "der", version.impacto.punto);
        nueva(
          { tipo: "restos", extremo: "inicio" },
          "R1 restos",
          "etiqueta-evidencia",
          "izq",
          version.restos.inicio,
        );
        nueva(
          { tipo: "restos", extremo: "fin" },
          "R2 restos",
          "etiqueta-evidencia",
          "izq",
          version.restos.fin,
        );
      }
    }
    etiquetas.current = items;
    dibujarEtiquetas.current();
  }, [listo, version, edicion, animacion, nombres]);

  // Los puntos que el perito arrastra (sin animación), justo en su lugar: las tres posiciones de
  // cada vehículo, el punto de impacto y los extremos de los restos. El elegido queda encima.
  useEffect(() => {
    const m = mapa.current;
    for (const mk of marcas.current) mk.remove();
    marcas.current = [];
    if (!m || !listo || !version || !edicion || animacion !== null) return;
    let vivo = true;
    void import("maplibre-gl").then(({ Marker }) => {
      if (!vivo) return;
      const nuevo = (sel: Seleccion, clase: string, texto: string, p: LonLat) => {
        const elegida = igualSeleccion(sel, edicion.seleccion);
        const el = marcador(texto, `punto-mapa ${clase}${elegida ? " marca-elegida" : ""}`);
        el.setAttribute("aria-hidden", "true");
        el.dataset.testid = `punto-${idMarca(sel).slice("marca-".length)}`;
        el.style.zIndex = elegida ? "3" : "1";
        const mk = new Marker({ element: el, draggable: true }).setLngLat([p[0], p[1]]).addTo(m);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          edicion.onSeleccion(sel);
        });
        mk.on("dragstart", () => edicion.onSeleccion(sel));
        // La línea de su etiqueta sigue al punto mientras se arrastra.
        mk.on("drag", () => {
          const ll = mk.getLngLat();
          const it = etiquetas.current.find((x) => x.id === idMarca(sel));
          if (it) it.punto = [ll.lng, ll.lat];
          dibujarEtiquetas.current();
        });
        mk.on("dragend", () => {
          const ll = mk.getLngLat();
          edicion.onMover(sel, [ll.lng, ll.lat]);
        });
        marcas.current.push(mk);
      };
      for (const letra of ["A", "B"] as const) {
        for (const fase of FASES) {
          nuevo(
            { tipo: "pose", letra, fase },
            `punto-${letra.toLowerCase()}`,
            "",
            version.vehiculos[letra][fase].punto,
          );
        }
      }
      nuevo({ tipo: "impacto" }, "punto-impacto", "✕", version.impacto.punto);
      nuevo({ tipo: "restos", extremo: "inicio" }, "punto-evidencia", "", version.restos.inicio);
      nuevo({ tipo: "restos", extremo: "fin" }, "punto-evidencia", "", version.restos.fin);
    });
    return () => {
      vivo = false;
    };
  }, [listo, version, edicion, animacion]);

  return (
    <div
      ref={contenedor}
      className={`absolute inset-0 transition-[filter,opacity] duration-700 ${atenuado ? "opacity-30 saturate-50" : "opacity-100"}`}
      data-testid="mapa"
    />
  );
}
