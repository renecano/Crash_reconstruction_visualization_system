"use client";
/**
 * El lugar y el croquis sobre el mapa (Hito 2, docs/cesvi/PROTOTIPO.md). El perito busca el lugar
 * o escribe coordenadas, toca el punto de impacto y Croquis importa las calles de OpenStreetMap
 * (`/api/osm`, ADR 0040) para tomar el rumbo de la vía y proponer las dos versiones (declarada y de
 * la evidencia). El perito mueve y gira cada vehículo en cada fase, mueve el punto de impacto y los
 * extremos de la zona de restos, y mide distancias; todo lo que mueve queda con fuente «perito».
 * La separación de los restos que mide alimenta el cálculo 2.
 *
 * Mapa: MapLibre GL con los mosaicos vectoriales gratuitos de OpenFreeMap (ADR 0050).
 */
import {
  avanzar,
  distanciaM,
  FASES,
  moverPose,
  proponerVersiones,
  rectanguloVehiculo,
  rumboCercano,
  rumboHaciaElNorte,
  type CasoCesvi,
  type ClaveVersion,
  type Fase,
  type LonLat,
  type Medidas,
  type VersionCroquis,
} from "@croquis/cesvi";
import { VEHICLE_CLASSES } from "@croquis/scene-schema";
import type { Feature, FeatureCollection, Position } from "geojson";
import type { GeoJSONSource, Map as MapaMl, Marker } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

export const ESTILO_MAPA = "https://tiles.openfreemap.org/styles/dark";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const RADIO_OSM_M = 250;
/** «Unos metros»: valor con que se dibuja la reversa declarada; el perito lo cambia. */
const REVERSA_INICIAL_M = 3;

const tipico = VEHICLE_CLASSES.pickup?.tipico;
const MEDIDAS_PICKUP: Medidas = { largo: tipico?.largo_m ?? 5.34, ancho: tipico?.ancho_m ?? 1.86 };

const NOMBRE_FASE: Record<Fase, string> = {
  inicial: "posición inicial",
  impacto: "impacto",
  final: "posición final",
};

interface ViaOsm {
  nombre?: string;
  tipo: string;
  puntos: LonLat[];
}

interface Resultado {
  display_name: string;
  lat: string;
  lon: string;
}

/** Calles de la respuesta de Overpass como líneas [lon, lat]. */
function viasDe(respuesta: unknown): ViaOsm[] {
  const elementos = (respuesta as { elements?: Record<string, unknown>[] }).elements ?? [];
  const nodos = new Map<number, LonLat>();
  for (const e of elementos) {
    if (e.type === "node") nodos.set(e.id as number, [e.lon as number, e.lat as number]);
  }
  const vias: ViaOsm[] = [];
  for (const e of elementos) {
    const tags = (e.tags ?? {}) as Record<string, string>;
    if (e.type !== "way" || !tags.highway) continue;
    const puntos = ((e.nodes as number[]) ?? [])
      .map((id) => nodos.get(id))
      .filter((p): p is LonLat => p !== undefined);
    if (puntos.length > 1) vias.push({ nombre: tags.name ?? tags.ref, tipo: tags.highway, puntos });
  }
  return vias;
}

const vacio: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Lo que se dibuja de una versión: vehículos por fase, la zona de restos y la medición. */
function geojson(
  v: VersionCroquis | null,
  medidas: Record<"A" | "B", Medidas>,
  medicion: LonLat[],
) {
  const features: Feature[] = [];
  if (v) {
    for (const letra of ["A", "B"] as const) {
      for (const fase of FASES) {
        const p = v.vehiculos[letra][fase];
        const m = medidas[letra];
        features.push({
          type: "Feature",
          properties: { tipo: "vehiculo", letra, fase },
          geometry: {
            type: "Polygon",
            coordinates: [rectanguloVehiculo(p.punto, p.rumbo, m.largo, m.ancho)],
          },
        });
      }
    }
    features.push({
      type: "Feature",
      properties: { tipo: "restos" },
      geometry: { type: "LineString", coordinates: [v.restos.inicio, v.restos.fin] },
    });
  }
  if (medicion.length === 2) {
    features.push({
      type: "Feature",
      properties: { tipo: "medicion" },
      geometry: { type: "LineString", coordinates: medicion as unknown as Position[] },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

function colores(): { texto: string; texto2: string; evidencia: string; accion: string } {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d;
  return {
    texto: v("--texto", "#f2f0e9"),
    texto2: v("--texto-2", "#a7aab0"),
    evidencia: v("--evidencia", "#ff6a1a"),
    accion: v("--accion", "#ffc21a"),
  };
}

function marcador(texto: string, clase: string): HTMLElement {
  const el = document.createElement("div");
  el.className = clase;
  el.textContent = texto;
  return el;
}

export function MapaCroquis({
  caso,
  onDistanciaRestos,
  onCaptura,
}: {
  caso: CasoCesvi;
  /** La separación de los restos medida por el perito, para el cálculo 2. */
  onDistanciaRestos: (metros: number) => void;
  /** Entrega la función que captura el croquis sobre el mapa (para el dictamen en PDF). */
  onCaptura?: (capturar: () => { imagen: string; version: string } | null) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaMl | null>(null);
  const marcadores = useRef<Marker[]>([]);
  const [listo, setListo] = useState(false);
  const [busqueda, setBusqueda] = useState(`${caso.lugar.municipio}, ${caso.lugar.estado}`);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [coordenadas, setCoordenadas] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [vias, setVias] = useState<ViaOsm[]>([]);
  const [viaCercana, setViaCercana] = useState<string | null>(null);
  const [versiones, setVersiones] = useState<Record<ClaveVersion, VersionCroquis> | null>(null);
  const [activa, setActiva] = useState<ClaveVersion>("evidencia");
  const [seleccion, setSeleccion] = useState<{ letra: "A" | "B"; fase: Fase }>({
    letra: "A",
    fase: "final",
  });
  const [herramienta, setHerramienta] = useState<"impacto" | "medir">("impacto");
  const [medicion, setMedicion] = useState<LonLat[]>([]);
  const [reversaM, setReversaM] = useState(REVERSA_INICIAL_M);
  const medidas = useMemo(() => ({ A: MEDIDAS_PICKUP, B: MEDIDAS_PICKUP }), []);
  const distanciaDictamen = caso.evidencia.restos.distancia_m.valor;
  const version = versiones?.[activa] ?? null;
  // El mapa se crea una sola vez: la función para avisar de la captura se lee de una ref.
  const avisarCaptura = useRef(onCaptura);
  useEffect(() => {
    avisarCaptura.current = onCaptura;
  }, [onCaptura]);
  // La versión a la vista, para el pie del croquis en el PDF (la captura no se rehace al cambiarla).
  const tituloVersion = useRef<string | null>(null);
  useEffect(() => {
    tituloVersion.current = version ? version.titulo.toLowerCase() : null;
  }, [version]);

  // El mapa se crea una vez; MapLibre se carga solo en el navegador y solo en esta página.
  useEffect(() => {
    let vivo = true;
    let instancia: MapaMl | null = null;
    void import("maplibre-gl").then(({ Map, getVersion, setWorkerUrl }) => {
      if (!vivo || !contenedor.current) return;
      // El worker lo publica scripts/maplibre-worker.mjs (Turbopack no lo copia).
      setWorkerUrl(`/maplibre/worker-${getVersion()}.mjs`);
      instancia = new Map({
        container: contenedor.current,
        style: ESTILO_MAPA,
        // Para poder copiar el lienzo al PDF del dictamen.
        canvasContextAttributes: { preserveDrawingBuffer: true },
        center: [-102.5, 23.6],
        zoom: 4,
        attributionControl: { compact: false },
      });
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
            "fill-opacity": ["match", ["get", "fase"], "final", 0.55, "impacto", 0.3, 0.12],
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
        instancia.addLayer({
          id: "medicion",
          type: "line",
          source: "croquis",
          filter: ["==", ["get", "tipo"], "medicion"],
          paint: { "line-color": c.accion, "line-width": 2 },
        });
        mapa.current = instancia;
        setListo(true);
        avisarCaptura.current?.(() => {
          const m = mapa.current;
          if (!m || !tituloVersion.current) return null;
          return { imagen: m.getCanvas().toDataURL("image/png"), version: tituloVersion.current };
        });
      });
    });
    return () => {
      vivo = false;
      instancia?.remove();
      mapa.current = null;
    };
  }, []);

  /** Fija el punto de impacto: importa las calles de OSM y propone las dos versiones. */
  const fijarImpacto = useCallback(
    async (p: LonLat) => {
      setAviso("Importando las calles de OpenStreetMap…");
      let lista: ViaOsm[] = [];
      try {
        const r = await fetch(`/api/osm?lat=${p[1]}&lon=${p[0]}&radio=${RADIO_OSM_M}`);
        if (!r.ok)
          throw new Error(((await r.json()) as { error?: string }).error ?? `HTTP ${r.status}`);
        lista = viasDe(await r.json());
      } catch (e) {
        setAviso(
          `No se pudieron importar las calles (${e instanceof Error ? e.message : String(e)}). Se usa el rumbo norte; gira los vehículos a mano.`,
        );
      }
      setVias(lista);
      let rumbo = 0;
      let nombre: string | null = null;
      let mejor = Number.POSITIVE_INFINITY;
      for (const v of lista) {
        const c = rumboCercano(v.puntos, p);
        if (c && c.distancia < mejor) {
          mejor = c.distancia;
          rumbo = c.rumbo;
          nombre = `${v.nombre ?? v.tipo} (a ${c.distancia.toFixed(1)} m)`;
        }
      }
      setViaCercana(nombre);
      if (lista.length) setAviso(null);
      else
        setAviso((a) =>
          a?.startsWith("No se pudieron")
            ? a
            : `OpenStreetMap no tiene calles a ${RADIO_OSM_M} m de este punto: se usa el rumbo norte. Marca un punto sobre la vía o gira los vehículos a mano.`,
        );
      const propuestas = proponerVersiones({
        impacto: p,
        rumboVia: rumboHaciaElNorte(rumbo),
        medidas,
        distanciaRestos: distanciaDictamen,
        reversaM,
      });
      setVersiones(propuestas);
      // Encuadra las dos versiones completas (posiciones y zona de restos).
      const puntos = (["declarada", "evidencia"] as const).flatMap((k) => [
        ...(["A", "B"] as const).flatMap((l) =>
          FASES.map((f) => propuestas[k].vehiculos[l][f].punto),
        ),
        propuestas[k].restos.inicio,
        propuestas[k].restos.fin,
      ]);
      const lons = puntos.map((q) => q[0]);
      const lats = puntos.map((q) => q[1]);
      mapa.current?.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 80, maxZoom: 20.5, maxDuration: 2000 },
      );
    },
    [medidas, distanciaDictamen, reversaM],
  );

  // Clic en el mapa: punto de impacto (sin versiones todavía) o medición.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return undefined;
    const alClic = (e: { lngLat: { lng: number; lat: number } }) => {
      const p: LonLat = [e.lngLat.lng, e.lngLat.lat];
      if (herramienta === "medir") {
        setMedicion((actual) => (actual.length >= 2 ? [p] : [...actual, p]));
      } else if (!versiones) {
        void fijarImpacto(p);
      }
    };
    m.on("click", alClic);
    return () => {
      m.off("click", alClic);
    };
  }, [listo, herramienta, versiones, fijarImpacto]);

  // Dibujo: calles y croquis.
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
      geojson(version, medidas, medicion),
    );
  }, [listo, vias, version, medidas, medicion]);

  // Marcadores que el perito arrastra: el vehículo y la fase elegidos, el punto de impacto y los
  // extremos de la zona de restos. Se rehacen con cada cambio (son pocos).
  useEffect(() => {
    const m = mapa.current;
    for (const mk of marcadores.current) mk.remove();
    marcadores.current = [];
    if (!m || !listo || !version) return;
    void import("maplibre-gl").then(({ Marker }) => {
      // Las marcas que pueden coincidir (R1 empieza en el punto de impacto; A termina junto a R2)
      // se dibujan a un lado de su punto para que ninguna tape a otra.
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
      const cambiar = (f: (v: VersionCroquis) => VersionCroquis) =>
        setVersiones((vs) => (vs ? { ...vs, [activa]: f(vs[activa]) } : vs));
      for (const letra of ["A", "B"] as const) {
        const final = version.vehiculos[letra].final.punto;
        const etiqueta = new Marker({ element: marcador(letra, "marca-etiqueta"), offset: [34, 0] })
          .setLngLat([final[0], final[1]])
          .addTo(m);
        marcadores.current.push(etiqueta);
      }
      const pose = version.vehiculos[seleccion.letra][seleccion.fase];
      nuevo(
        marcador(`${seleccion.letra}`, "marca-mapa marca-vehiculo"),
        pose.punto,
        (q) =>
          cambiar((v) => moverPose(v, seleccion.letra, seleccion.fase, { punto: [q[0], q[1]] })),
        [-34, 0],
      );
      nuevo(marcador("✕", "marca-mapa marca-impacto"), version.impacto.punto, (q) =>
        cambiar((v) => ({ ...v, impacto: { punto: [q[0], q[1]], fuente: "perito" } })),
      );
      nuevo(
        marcador("R1", "marca-mapa marca-restos"),
        version.restos.inicio,
        (q) =>
          cambiar((v) => ({
            ...v,
            restos: { ...v.restos, inicio: [q[0], q[1]], fuente: "perito" },
          })),
        [34, 22],
      );
      nuevo(
        marcador("R2", "marca-mapa marca-restos"),
        version.restos.fin,
        (q) =>
          cambiar((v) => ({ ...v, restos: { ...v.restos, fin: [q[0], q[1]], fuente: "perito" } })),
        [34, -22],
      );
    });
  }, [listo, version, seleccion, activa]);

  const buscar = async () => {
    setAviso(null);
    try {
      const r = await fetch(
        `${NOMINATIM}?format=jsonv2&limit=5&countrycodes=mx&q=${encodeURIComponent(busqueda)}`,
      );
      const lista = (await r.json()) as Resultado[];
      setResultados(lista);
      if (!lista.length)
        setAviso("Sin resultados; prueba con otro nombre o escribe las coordenadas.");
    } catch {
      setAviso("No se pudo buscar el lugar; escribe las coordenadas.");
    }
  };

  const irACoordenadas = () => {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(coordenadas);
    const lat = m ? Number(m[1]) : Number.NaN;
    const lon = m ? Number(m[2]) : Number.NaN;
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) {
      setAviso("Escribe latitud y longitud en grados decimales, por ejemplo 25.79, -108.99.");
      return;
    }
    void fijarImpacto([lon, lat]);
  };

  const restosM = version ? distanciaM(version.restos.inicio, version.restos.fin) : null;
  const medicionM = medicion.length === 2 ? distanciaM(medicion[0]!, medicion[1]!) : null;
  const pose = version?.vehiculos[seleccion.letra][seleccion.fase];
  const girar = (rumbo: number) =>
    setVersiones((vs) =>
      vs
        ? { ...vs, [activa]: moverPose(vs[activa], seleccion.letra, seleccion.fase, { rumbo }) }
        : vs,
    );

  return (
    <section aria-labelledby="lugar" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="lugar" className="t-titulo">
          El lugar y el croquis
        </h2>
        <p className="t-cuerpo max-w-[72ch] text-texto-2">
          {caso.lugar.descripcion} Busca el lugar o escribe sus coordenadas y toca el punto de
          impacto: Croquis importa las calles de OpenStreetMap y propone las dos versiones a escala.
          Todo se puede mover.
        </p>
      </div>

      {!versiones ? (
        <div className="flex flex-col gap-3">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void buscar();
            }}
          >
            <label className="t-nota flex flex-col gap-1 text-texto-2">
              Buscar el lugar
              <input
                className="campo w-72"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </label>
            <button type="submit" className="boton-secundario min-h-11 px-4">
              Buscar
            </button>
          </form>
          {resultados.length ? (
            <ul className="flex flex-col gap-1">
              {resultados.map((r) => (
                <li key={`${r.lat},${r.lon}`}>
                  <button
                    type="button"
                    className="t-interfaz min-h-11 text-left underline"
                    onClick={() =>
                      mapa.current?.flyTo({ center: [Number(r.lon), Number(r.lat)], zoom: 15 })
                    }
                  >
                    {r.display_name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              irACoordenadas();
            }}
          >
            <label className="t-nota flex flex-col gap-1 text-texto-2">
              O las coordenadas del punto de impacto (latitud, longitud)
              <input
                className="campo cifras w-72"
                value={coordenadas}
                onChange={(e) => setCoordenadas(e.target.value)}
                placeholder="25.79, -108.99"
                data-testid="coordenadas"
              />
            </label>
            <button type="submit" className="boton-secundario min-h-11 px-4">
              Marcar el impacto
            </button>
          </form>
          <p className="t-nota text-texto-2">
            En el mapa, acércate al lugar y toca el punto de impacto.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Versión">
            {(["evidencia", "declarada"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={activa === k}
                className={`min-h-11 px-4 ${activa === k ? "boton-principal" : "boton-secundario"}`}
                onClick={() => setActiva(k)}
                data-testid={`version-${k}`}
              >
                {versiones[k].titulo}
              </button>
            ))}
            <button
              type="button"
              className="boton-secundario min-h-11 px-4"
              onClick={() => {
                setVersiones(null);
                setVias([]);
                setMedicion([]);
              }}
            >
              Marcar otro punto
            </button>
          </div>
          <p className="t-cuerpo max-w-[72ch]">{version?.descripcion}</p>
          {viaCercana ? (
            <p className="t-nota text-texto-2">Vía más cercana en OSM: {viaCercana}.</p>
          ) : null}
        </div>
      )}

      {aviso ? (
        <p role="status" className="t-interfaz">
          {aviso}
        </p>
      ) : null}

      <div
        ref={contenedor}
        className="h-[60vh] min-h-[360px] w-full overflow-hidden rounded-panel bg-superficie"
        data-testid="mapa"
      />

      {version && pose ? (
        <div className="grid gap-6 md:grid-cols-2">
          <fieldset className="flex flex-col gap-3">
            <legend className="t-subtitulo mb-2">Herramientas del perito</legend>
            <div className="flex flex-wrap gap-3">
              <label className="t-nota flex flex-col gap-1 text-texto-2">
                Vehículo
                <select
                  className="campo w-28"
                  value={seleccion.letra}
                  onChange={(e) =>
                    setSeleccion((s) => ({ ...s, letra: e.target.value as "A" | "B" }))
                  }
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
              </label>
              <label className="t-nota flex flex-col gap-1 text-texto-2">
                Fase
                <select
                  className="campo w-44"
                  value={seleccion.fase}
                  onChange={(e) => setSeleccion((s) => ({ ...s, fase: e.target.value as Fase }))}
                >
                  {FASES.map((f) => (
                    <option key={f} value={f}>
                      {NOMBRE_FASE[f]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="t-nota flex flex-col gap-1 text-texto-2">
                Rumbo (°)
                <input
                  type="number"
                  className="campo cifras w-24"
                  value={Math.round(pose.rumbo)}
                  onChange={(e) => girar(Number(e.target.value) || 0)}
                />
              </label>
            </div>
            <p className="t-nota text-texto-2">
              Arrastra la marca {seleccion.letra} para mover el vehículo en su{" "}
              {NOMBRE_FASE[seleccion.fase]}; ✕ es el punto de impacto y R1 y R2, los extremos de la
              zona de restos.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <button
                type="button"
                aria-pressed={herramienta === "medir"}
                className="boton-secundario min-h-11 px-4"
                onClick={() => {
                  setHerramienta((h) => (h === "medir" ? "impacto" : "medir"));
                  setMedicion([]);
                }}
              >
                {herramienta === "medir" ? "Dejar de medir" : "Medir una distancia"}
              </button>
              {medicionM !== null ? (
                <p className="t-interfaz" data-testid="medicion">
                  Medida: <span className="cifras">{medicionM.toFixed(2)} m</span>
                </p>
              ) : herramienta === "medir" ? (
                <p className="t-nota text-texto-2">Toca dos puntos del mapa.</p>
              ) : null}
            </div>
            {activa === "declarada" ? (
              <label className="t-nota flex flex-col gap-1 text-texto-2">
                Reversa de A («unos metros»), en m
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="campo cifras w-24"
                  value={reversaM}
                  onChange={(e) => {
                    const r = Math.max(0, Number(e.target.value) || 0);
                    setReversaM(r);
                    setVersiones((vs) => {
                      if (!vs) return vs;
                      const a = vs.declarada.vehiculos.A.impacto;
                      const declarada = moverPose(vs.declarada, "A", "inicial", {
                        punto: avanzar(a.punto, a.rumbo, r),
                      });
                      return {
                        ...vs,
                        declarada: {
                          ...declarada,
                          supuestos: declarada.supuestos.map((s) =>
                            s.startsWith("La declaración dice")
                              ? `La declaración dice «unos metros»: la reversa se dibuja con ${r} m, que el perito ajusta.`
                              : s,
                          ),
                        },
                      };
                    });
                  }}
                />
              </label>
            ) : null}
          </fieldset>

          <div className="flex flex-col gap-3">
            <h3 className="t-subtitulo">Zona de restos</h3>
            <p className="t-interfaz" data-testid="restos-mapa">
              De R1 a R2: <span className="cifras">{restosM?.toFixed(2)} m</span> (el dictamen midió{" "}
              <span className="cifras">{distanciaDictamen} m</span>; fuente: {version.restos.fuente}
              ).
            </p>
            <button
              type="button"
              className="boton-principal self-start"
              disabled={restosM === null}
              onClick={() => restosM !== null && onDistanciaRestos(Number(restosM.toFixed(2)))}
              data-testid="usar-restos"
            >
              Usar esta distancia en el cálculo 2
            </button>
            <ul className="t-nota flex flex-col gap-1 text-texto-2">
              {version.supuestos.map((s) => (
                <li key={s}>Supuesto: {s}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {version ? (
        <details className="border-t border-linea pt-4">
          <summary className="t-interfaz min-h-11 cursor-pointer">
            Posiciones de la {version.titulo.toLowerCase()} y su fuente
          </summary>
          <table className="t-interfaz mt-3 w-full border-collapse text-left">
            <thead>
              <tr className="t-nota border-b border-linea">
                <th className="py-2 pr-4 font-normal">Vehículo</th>
                <th className="py-2 pr-4 font-normal">Fase</th>
                <th className="py-2 pr-4 font-normal">Rumbo</th>
                <th className="py-2 font-normal">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {(["A", "B"] as const).flatMap((l) =>
                FASES.map((f) => (
                  <tr key={`${l}-${f}`} className="border-b border-linea">
                    <td className="py-1 pr-4">{l}</td>
                    <td className="py-1 pr-4">{NOMBRE_FASE[f]}</td>
                    <td className="cifras py-1 pr-4">
                      {Math.round(version.vehiculos[l][f].rumbo)}°
                    </td>
                    <td className="py-1">{version.vehiculos[l][f].fuente}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <p className="t-nota mt-3 text-texto-2">
            Medidas de los vehículos: las típicas de la clase pickup ({MEDIDAS_PICKUP.largo} ×{" "}
            {MEDIDAS_PICKUP.ancho} m, fichas de fabricante de modelos actuales); el dictamen no las
            da.
          </p>
        </details>
      ) : null}
    </section>
  );
}
