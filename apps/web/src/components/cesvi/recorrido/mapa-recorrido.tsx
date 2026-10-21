"use client";
/**
 * El mapa del recorrido del perito (ADR 0052): una sola instancia de MapLibre para todos los pasos,
 * así la cámara vuela de un paso al siguiente. Dibuja las calles de OSM, la versión a la vista
 * (completa, o animada de la posición inicial al impacto y a la final) y la zona de restos; en los
 * pasos que lo permiten, el perito arrastra el punto de impacto, los extremos de los restos y el
 * vehículo elegido.
 */
import {
  avanzar,
  distanciaM,
  rectanguloVehiculo,
  rumboDeg,
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
import { colores, ESTILO_MAPA, geojson, marcador, vacio, type ViaOsm } from "../mapa-comun";

export type Camara =
  | { tipo: "vista"; centro: LonLat; zoom: number }
  | { tipo: "encuadre"; puntos: LonLat[]; zoomMax: number };

export interface EdicionMapa {
  seleccion: { letra: "A" | "B"; fase: Fase };
  onMover: (cambio: {
    impacto?: LonLat;
    restos?: { inicio?: LonLat; fin?: LonLat };
    pose?: LonLat;
  }) => void;
}

const movimientoReducido = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

function geojsonAnimado(v: VersionCroquis, medidas: Record<"A" | "B", Medidas>, t: number) {
  const features: Feature[] = [];
  for (const letra of ["A", "B"] as const) {
    const p = poseEn(v, letra, t);
    features.push({
      type: "Feature",
      properties: { tipo: "vehiculo", letra, fase: "final" },
      geometry: {
        type: "Polygon",
        coordinates: [
          rectanguloVehiculo(p.punto, p.rumbo, medidas[letra].largo, medidas[letra].ancho),
        ],
      },
    });
  }
  // Los restos aparecen con el impacto y crecen con el desplazamiento.
  if (t >= 0.5) {
    const f = Math.min(1, (t - 0.5) / 0.5);
    const fin: [number, number] = [
      v.restos.inicio[0] + (v.restos.fin[0] - v.restos.inicio[0]) * f,
      v.restos.inicio[1] + (v.restos.fin[1] - v.restos.inicio[1]) * f,
    ];
    features.push({
      type: "Feature",
      properties: { tipo: "restos" },
      geometry: {
        type: "LineString",
        coordinates: [v.restos.inicio, fin] as unknown as Position[],
      },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

export function MapaRecorrido({
  camara,
  vias,
  version,
  medidas,
  animacion,
  edicion,
  onClic,
  onCaptura,
  atenuado,
}: {
  camara: Camara | null;
  vias: ViaOsm[];
  version: VersionCroquis | null;
  medidas: Record<"A" | "B", Medidas>;
  /** Progreso de la animación (0 a 1); null dibuja la versión completa. */
  animacion: number | null;
  edicion: EdicionMapa | null;
  onClic?: (p: LonLat) => void;
  onCaptura?: (capturar: () => string | null) => void;
  /** El mapa queda detrás, oscurecido (pasos que no son del mapa). */
  atenuado: boolean;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaMl | null>(null);
  const marcadores = useRef<Marker[]>([]);
  const [listo, setListo] = useState(false);
  const avisos = useRef({ onClic, onCaptura });
  useEffect(() => {
    avisos.current = { onClic, onCaptura };
  }, [onClic, onCaptura]);

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
        attributionControl: { compact: true },
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      instancia.on("click", (e) => avisos.current.onClic?.([e.lngLat.lng, e.lngLat.lat]));
      instancia.on("load", () => {
        if (!vivo || !instancia) return;
        const c = colores();
        instancia.addSource("calles", { type: "geojson", data: vacio });
        instancia.addLayer({
          id: "calles",
          type: "line",
          source: "calles",
          paint: { "line-color": c.texto2, "line-width": 2, "line-opacity": 0.8 },
        });
        instancia.addSource("croquis", { type: "geojson", data: vacio });
        instancia.addLayer({
          id: "vehiculos",
          type: "fill",
          source: "croquis",
          filter: ["==", ["get", "tipo"], "vehiculo"],
          paint: {
            "fill-color": c.texto,
            "fill-opacity": ["match", ["get", "fase"], "final", 0.6, "impacto", 0.3, 0.12],
          },
        });
        instancia.addLayer({
          id: "vehiculos-borde",
          type: "line",
          source: "croquis",
          filter: ["==", ["get", "tipo"], "vehiculo"],
          paint: {
            "line-color": c.texto,
            "line-width": 1.5,
            "line-dasharray": [
              "match",
              ["get", "fase"],
              "inicial",
              ["literal", [2, 2]],
              ["literal", [1, 0]],
            ],
          },
        });
        instancia.addLayer({
          id: "restos",
          type: "line",
          source: "croquis",
          filter: ["==", ["get", "tipo"], "restos"],
          paint: { "line-color": c.evidencia, "line-width": 4, "line-dasharray": [1, 1] },
        });
        mapa.current = instancia;
        setListo(true);
        avisos.current.onCaptura?.(() => mapa.current?.getCanvas().toDataURL("image/png") ?? null);
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
        // Deja libres el selector de versión (arriba) y la tarjeta de los restos (abajo a la izquierda).
        {
          padding: { top: 150, bottom: 90, left: 300, right: 90 },
          maxZoom: camara.zoomMax,
          duration: duracion,
        },
      );
    }
  }, [listo, camara]);

  // Calles y croquis (completo o animado).
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    (m.getSource("calles") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: vias.map((v) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: v.puntos as unknown as Position[] },
      })),
    });
    (m.getSource("croquis") as GeoJSONSource | undefined)?.setData(
      version === null
        ? vacio
        : animacion === null
          ? geojson(version, medidas, [])
          : geojsonAnimado(version, medidas, animacion),
    );
  }, [listo, vias, version, medidas, animacion]);

  // Marcas que el perito arrastra (solo en los pasos que lo permiten y sin animación).
  useEffect(() => {
    const m = mapa.current;
    for (const mk of marcadores.current) mk.remove();
    marcadores.current = [];
    if (!m || !listo || !version || !edicion || animacion !== null) return;
    void import("maplibre-gl").then(({ Marker }) => {
      const nuevo = (
        el: HTMLElement,
        p: LonLat,
        alSoltar: (q: LonLat) => void,
        offset: [number, number] = [0, 0],
      ) => {
        const mk = new Marker({ element: el, draggable: true, offset })
          .setLngLat([p[0], p[1]])
          .addTo(m);
        mk.on("dragend", () => {
          const ll = mk.getLngLat();
          alSoltar([ll.lng, ll.lat]);
        });
        marcadores.current.push(mk);
      };
      for (const letra of ["A", "B"] as const) {
        const final = version.vehiculos[letra].final.punto;
        marcadores.current.push(
          new Marker({ element: marcador(letra, "marca-etiqueta"), offset: [34, 0] })
            .setLngLat([final[0], final[1]])
            .addTo(m),
        );
      }
      const { letra, fase } = edicion.seleccion;
      nuevo(
        marcador(letra, "marca-mapa marca-vehiculo"),
        version.vehiculos[letra][fase].punto,
        (q) => edicion.onMover({ pose: q }),
        [-34, 0],
      );
      nuevo(marcador("✕", "marca-mapa marca-impacto"), version.impacto.punto, (q) =>
        edicion.onMover({ impacto: q }),
      );
      nuevo(
        marcador("R1", "marca-mapa marca-restos"),
        version.restos.inicio,
        (q) => edicion.onMover({ restos: { inicio: q } }),
        [34, 22],
      );
      nuevo(
        marcador("R2", "marca-mapa marca-restos"),
        version.restos.fin,
        (q) => edicion.onMover({ restos: { fin: q } }),
        [34, -22],
      );
    });
  }, [listo, version, edicion, animacion]);

  return (
    <div
      ref={contenedor}
      className={`absolute inset-0 transition-[filter,opacity] duration-700 ${atenuado ? "opacity-30 saturate-50" : "opacity-100"}`}
      data-testid="mapa"
    />
  );
}
