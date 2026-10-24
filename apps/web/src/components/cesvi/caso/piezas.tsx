"use client";
/**
 * Las piezas de los casos de expediente del recorrido (ADR 0079; antes en «Caso nuevo», R1, ADR
 * 0061): el mapa donde el perito coloca a cada vehículo, las preguntas de lo que más cambia la
 * reconstrucción y la fuente de cada dato.
 */
import { FUENTE, palabra } from "@/i18n/vocabulario";
import {
  avanzar,
  confirmarImpacto,
  conClase,
  conMasa,
  conMasaTipica,
  conPrimerImpacto,
  conRestos,
  conZonaImpacto,
  masaTipica,
  sinImpactoSupuesto,
  distanciaM,
  rectanguloVehiculo,
  rumboDeg,
  type Expediente,
  type PreguntaEscena,
} from "@croquis/cesvi";
import type { GeoJSONSource, Map as MapaMl, Marker } from "maplibre-gl";
// Sin la hoja de MapLibre los marcadores no quedan en su lugar (no se ven sobre el mapa).
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { ESTILO_MAPA, ESTILO_MAPA_CLARO, marcador } from "../mapa-comun";
import type { MarcaImpacto, PosicionMovil } from "./reconstruccion";

export type Id = Expediente["vehiculos"][number]["id"];
export type Fase = "impacto" | "final";

export const NOMBRE_FASE: Record<Fase, string> = {
  impacto: "en el impacto",
  final: "posición final",
};
export const CARA: Record<string, string> = {
  frontal: "frontal",
  posterior: "posterior",
  lateral_izquierdo: "lateral izquierdo",
  lateral_derecho: "lateral derecho",
  techo: "techo",
  inferior: "inferior",
};

/** De dónde sale un dato, con su etiqueta legible («del reporte», «perito»…), nunca el identificador. */
export function Fuente({ f }: { f?: string }) {
  if (!f) return null;
  return (
    <span
      data-fuente={f}
      className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${f === "supuesto" ? "bg-[var(--falta-fondo)] text-senal-texto" : "bg-superficie-alta text-texto-2"}`}
    >
      {palabra(FUENTE, f, "es")}
    </span>
  );
}

/** El color de V1 y V2 en el mapa (los del sistema visual); los demás, el del punto genérico. */
function claseVehiculo(id: string): string {
  return id === "V1" ? " punto-a" : id === "V2" ? " punto-b" : "";
}

/** La herramienta del mapa en el paso del lugar (V2). */
export type HerramientaMapa = "colocar" | "mover" | "medir";

/** La huella de un vehículo colocado: su contorno visto desde arriba, en su color. */
export interface HuellaMapa {
  vehiculo: string;
  fase: string;
  punto: { lat: number; lon: number };
  rumbo: number;
  largo: number;
  ancho: number;
  color: string;
}

/** Largo de la flecha del rumbo sobre el mapa (m): se arrastra su punta para girar. */
const FLECHA_M = 9;

/** La flecha del rumbo del elemento activo. */
export interface FlechaMapa {
  punto: { lat: number; lon: number };
  rumbo: number;
  color: string;
}

/** Dibuja huellas, la línea de la flecha y la medición en la fuente GeoJSON del croquis. */
function dibujarCroquis(
  m: MapaMl | null,
  hs: readonly HuellaMapa[],
  f: FlechaMapa | null,
  medicion: readonly [number, number][],
): void {
  if (!m || !m.isStyleLoaded()) return;
  const features: GeoJSON.Feature[] = hs.map((h) => ({
    type: "Feature",
    properties: { color: h.color, tipo: h.fase === "final" ? "final" : "otra" },
    geometry: {
      type: "Polygon",
      coordinates: [rectanguloVehiculo([h.punto.lon, h.punto.lat], h.rumbo, h.largo, h.ancho)],
    },
  }));
  if (f)
    features.push({
      type: "Feature",
      properties: { color: f.color, tipo: "flecha" },
      geometry: {
        type: "LineString",
        coordinates: [
          [f.punto.lon, f.punto.lat],
          avanzar([f.punto.lon, f.punto.lat], f.rumbo, FLECHA_M),
        ],
      },
    });
  if (medicion.length)
    features.push({
      type: "Feature",
      properties: { color: "#FF5B2E", tipo: "medida" },
      geometry: { type: "LineString", coordinates: [...medicion] },
    });
  const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  const src = m.getSource("croquis-dibujo") as GeoJSONSource | undefined;
  if (src) {
    src.setData(fc);
    return;
  }
  m.addSource("croquis-dibujo", { type: "geojson", data: fc });
  m.addLayer({
    id: "croquis-huellas",
    type: "fill",
    source: "croquis-dibujo",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": ["case", ["==", ["get", "tipo"], "final"], 0.75, 0.35],
    },
  });
  m.addLayer({
    id: "croquis-lineas",
    type: "line",
    source: "croquis-dibujo",
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["case", ["==", ["get", "tipo"], "flecha"], 3, 2],
      "line-dasharray": [
        "case",
        ["==", ["get", "tipo"], "medida"],
        ["literal", [2, 1]],
        ["literal", [1, 0]],
      ],
    },
  });
}

/**
 * El mapa donde el perito coloca a cada vehículo. En «Colocar» un clic pone lo elegido y el mapa
 * no se arrastra (Espacio sostenido lo mueve); en «Mover mapa» se arrastra; en «Medir» dos clics
 * dan una distancia. La flecha del elemento activo se gira arrastrando su punta.
 */
export function MapaEscena({
  posiciones,
  moviles = [],
  impactos = [],
  onClic,
  onMapa,
  tema,
  inicio = null,
  lugarTexto = "",
  herramienta = "mover",
  pedirLugar = true,
  huellas = [],
  flecha = null,
  onFlecha,
  onMedida,
  onDeshacer,
}: {
  posiciones: { vehiculo: Id; fase: string; punto: { lat: number; lon: number } }[];
  /** Los vehículos en el instante del 3D (el croquis sigue al reloj de la reconstrucción). */
  moviles?: PosicionMovil[];
  /** Los impactos de la reconstrucción, en orden: X1, X2… (R6). */
  impactos?: MarcaImpacto[];
  onClic: (p: { lat: number; lon: number }) => void;
  /** El mapa ya cargado, para el croquis del dictamen sobre las calles (R8b). */
  onMapa?: (m: MapaMl | null) => void;
  tema: "claro" | "oscuro";
  /** Dónde abre el mapa si aún no hay posiciones: las coordenadas del caso (V2). */
  inicio?: { lat: number; lon: number } | null;
  /** El lugar en palabras, para buscarlo si el caso no trae coordenadas. */
  lugarTexto?: string;
  herramienta?: HerramientaMapa;
  /** Si el mapa pide buscar el lugar cuando el caso no trae coordenadas (en el paso del lugar). */
  pedirLugar?: boolean;
  /** Los contornos de lo colocado, en el color de cada vehículo. */
  huellas?: HuellaMapa[];
  /** La flecha del rumbo del elemento activo; su punta se arrastra para girarla. */
  flecha?: FlechaMapa | null;
  onFlecha?: (rumbo: number) => void;
  /** Una distancia medida en «Medir» (m). */
  onMedida?: (m: number) => void;
  /** Deshacer lo último colocado (botón del mapa). */
  onDeshacer?: () => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaMl | null>(null);
  const estilo = tema === "claro" ? ESTILO_MAPA_CLARO : ESTILO_MAPA;
  const estiloInicial = useRef(estilo);
  const marcas = useRef<Marker[]>([]);
  const marcasMoviles = useRef<Marker[]>([]);
  const marcasImpacto = useRef<Marker[]>([]);
  const [listo, setListo] = useState(false);
  // Sin posiciones ni coordenadas del caso, el mapa pide buscar el lugar (V2).
  const [buscar, setBuscar] = useState(false);
  const arranque = useRef({ posiciones, inicio });
  const clic = useRef(onClic);
  const avisar = useRef(onMapa);
  const giro = useRef(onFlecha);
  const medida = useRef(onMedida);
  const modo = useRef(herramienta);
  const espacio = useRef(false);
  const medicion = useRef<[number, number][]>([]);
  // Lo último que se dibuja, para el clic de «Medir» y el cambio de estilo.
  const datos = useRef({ huellas, flecha });
  const punta = useRef<Marker | null>(null);
  const [medidaM, setMedidaM] = useState<number | null>(null);
  useEffect(() => {
    clic.current = onClic;
    avisar.current = onMapa;
    giro.current = onFlecha;
    medida.current = onMedida;
    modo.current = herramienta;
    datos.current = { huellas, flecha };
  }, [onClic, onMapa, onFlecha, onMedida, herramienta, huellas, flecha]);
  useEffect(() => {
    let vivo = true;
    let instancia: MapaMl | null = null;
    void import("maplibre-gl").then(({ Map, getVersion, setWorkerUrl }) => {
      if (!vivo || !contenedor.current) return;
      setWorkerUrl(`/maplibre/worker-${getVersion()}.mjs`);
      instancia = new Map({
        container: contenedor.current,
        style: estiloInicial.current,
        center: [-99.13, 19.43],
        zoom: 11,
        attributionControl: false,
      });
      instancia.on("click", (e) => {
        // Con Espacio sostenido el clic solo termina de mover el mapa.
        if (espacio.current) return;
        if (modo.current === "colocar") clic.current({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        else if (modo.current === "medir") {
          const ps = medicion.current.length >= 2 ? [] : medicion.current;
          medicion.current = [...ps, [e.lngLat.lng, e.lngLat.lat]];
          if (medicion.current.length === 2) {
            const d = distanciaM(medicion.current[0]!, medicion.current[1]!);
            setMedidaM(d);
            medida.current?.(d);
          } else setMedidaM(null);
          dibujarCroquis(
            mapa.current,
            datos.current.huellas,
            datos.current.flecha,
            medicion.current,
          );
        }
      });
      instancia.on("load", () => {
        if (!vivo || !instancia) return;
        // Abre en el caso: sus posiciones, o sus coordenadas; si no hay ninguna, se busca.
        const { posiciones: ps, inicio: i0 } = arranque.current;
        if (ps.length) {
          const lons = ps.map((p) => p.punto.lon);
          const lats = ps.map((p) => p.punto.lat);
          instancia.fitBounds(
            [
              [Math.min(...lons), Math.min(...lats)],
              [Math.max(...lons), Math.max(...lats)],
            ],
            { padding: 80, maxZoom: 19, animate: false },
          );
        } else if (i0) instancia.jumpTo({ center: [i0.lon, i0.lat], zoom: 17 });
        else setBuscar(true);
        mapa.current = instancia;
        avisar.current?.(instancia);
        setListo(true);
      });
    });
    return () => {
      vivo = false;
      avisar.current?.(null);
      instancia?.remove();
      mapa.current = null;
    };
  }, []);
  // Huellas de los vehículos, la línea de la flecha y la medición: una fuente GeoJSON que se vuelve
  // a agregar si cambia el estilo (el tema).
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    dibujarCroquis(mapa.current, datos.current.huellas, datos.current.flecha, medicion.current);
    const alCambiarEstilo = () =>
      dibujarCroquis(mapa.current, datos.current.huellas, datos.current.flecha, medicion.current);
    m.on("style.load", alCambiarEstilo);
    return () => {
      m.off("style.load", alCambiarEstilo);
    };
  }, [listo, huellas, flecha]);
  // La punta de la flecha: se arrastra para girar el rumbo del elemento activo.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    let vivo = true;
    void import("maplibre-gl").then(({ Marker }) => {
      if (!vivo) return;
      punta.current?.remove();
      punta.current = null;
      if (!flecha) return;
      const el = document.createElement("div");
      el.className = "punta-flecha";
      el.style.cssText = `width:18px;height:18px;border-radius:9px;background:#0B0C0F;border:2px solid ${flecha.color};cursor:grab`;
      el.title = "Arrastra para girar el frente";
      el.dataset.testid = "punta-flecha";
      el.setAttribute("data-testid", "punta-flecha");
      const [lon, lat] = avanzar([flecha.punto.lon, flecha.punto.lat], flecha.rumbo, FLECHA_M);
      const mk = new Marker({ element: el, draggable: true }).setLngLat([lon, lat]).addTo(m);
      mk.on("drag", () => {
        const q = mk.getLngLat();
        giro.current?.(Math.round(rumboDeg([flecha.punto.lon, flecha.punto.lat], [q.lng, q.lat])));
      });
      punta.current = mk;
    });
    return () => {
      vivo = false;
    };
  }, [flecha, listo]);
  // «Colocar»: el mapa no se arrastra; Espacio sostenido lo mueve. «Mover mapa»: se arrastra.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    if (herramienta === "colocar") m.dragPan.disable();
    else m.dragPan.enable();
    if (herramienta !== "medir") {
      medicion.current = [];
      dibujarCroquis(mapa.current, datos.current.huellas, datos.current.flecha, medicion.current);
    }
    if (herramienta !== "colocar") return;
    const escribiendo = (t: EventTarget | null) =>
      t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    const abajo = (e: KeyboardEvent) => {
      if (e.code !== "Space" || escribiendo(e.target) || espacio.current) return;
      e.preventDefault();
      espacio.current = true;
      m.dragPan.enable();
      m.getCanvas().style.cursor = "grab";
    };
    const arriba = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      espacio.current = false;
      m.dragPan.disable();
      m.getCanvas().style.cursor = "crosshair";
    };
    m.getCanvas().style.cursor = "crosshair";
    window.addEventListener("keydown", abajo);
    window.addEventListener("keyup", arriba);
    return () => {
      window.removeEventListener("keydown", abajo);
      window.removeEventListener("keyup", arriba);
      m.getCanvas().style.cursor = "";
    };
  }, [herramienta, listo]);
  // La tarjeta del mapa cambia de tamaño entre pasos y al expandirla: el mapa se ajusta.
  useEffect(() => {
    const el = contenedor.current;
    if (!el || !listo) return;
    const ro = new ResizeObserver(() => mapa.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [listo]);
  // El mapa sigue al tema del marco (R9), como el del recorrido.
  useEffect(() => {
    if (listo && estilo !== estiloInicial.current) {
      mapa.current?.setStyle(estilo);
      estiloInicial.current = estilo;
    }
  }, [estilo, listo]);
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    void import("maplibre-gl").then(({ Marker }) => {
      for (const x of marcas.current) x.remove();
      marcas.current = posiciones.map((p) => {
        // El número del vehículo en el punto, con su color; el impacto, con borde punteado.
        const el = marcador(p.vehiculo.slice(1), `punto-mapa${claseVehiculo(p.vehiculo)}`);
        const fase = p.fase === "final" ? "posición final" : "impacto";
        el.title = `${p.vehiculo} · ${fase}`;
        el.dataset.posicion = `${p.vehiculo}:${p.fase}`;
        if (p.fase !== "final") el.style.borderStyle = "dashed";
        // No se arrastran: el clic pasa al mapa, para colocar otra posición junto a esta.
        el.style.pointerEvents = "none";
        return new Marker({ element: el }).setLngLat([p.punto.lon, p.punto.lat]).addTo(m);
      });
    });
  }, [posiciones, listo]);
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    void import("maplibre-gl").then(({ Marker }) => {
      for (const x of marcasMoviles.current) x.remove();
      marcasMoviles.current = moviles.map((p) => {
        // MapLibre posiciona el marcador con `transform`: el rumbo va en un elemento interior.
        // El color es el del vehículo, como en las posiciones colocadas.
        const el = marcador("", `punto-mapa${claseVehiculo(p.vehiculo)}`);
        el.title = `${p.vehiculo} en la reconstrucción`;
        el.dataset.movil = p.vehiculo;
        el.style.pointerEvents = "none";
        const flecha = document.createElement("span");
        flecha.textContent = "▲";
        flecha.style.display = "inline-block";
        flecha.style.transform = `rotate(${p.rumbo}deg)`;
        el.appendChild(flecha);
        return new Marker({ element: el }).setLngLat([p.punto.lon, p.punto.lat]).addTo(m);
      });
    });
  }, [moviles, listo]);
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    void import("maplibre-gl").then(({ Marker }) => {
      for (const x of marcasImpacto.current) x.remove();
      marcasImpacto.current = impactos.map((i) => {
        const el = marcador(`X${i.numero}`, "punto-mapa punto-impacto");
        el.title = `Impacto ${i.numero}`;
        el.dataset.impacto = String(i.numero);
        el.style.pointerEvents = "none";
        return new Marker({ element: el }).setLngLat([i.punto.lon, i.punto.lat]).addTo(m);
      });
    });
  }, [impactos, listo]);
  return (
    <div className="relative h-full min-h-[320px] overflow-hidden">
      <div
        ref={contenedor}
        className="h-full w-full"
        data-testid="mapa-escena"
        data-herramienta={herramienta}
      />
      {herramienta === "medir" && medidaM !== null ? (
        <p
          className="vidrio absolute top-16 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 text-[0.8125rem] font-semibold"
          data-testid="medida-mapa"
        >
          <span className="cifras">{medidaM.toFixed(2)} m</span>
        </p>
      ) : null}
      {listo && onDeshacer ? (
        <div className="absolute right-3 bottom-12 z-10 flex flex-col gap-1.5">
          <button
            type="button"
            aria-label="Acercar"
            className="vidrio grid h-10 w-10 place-items-center rounded-control"
            onClick={() => mapa.current?.zoomIn()}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Alejar"
            className="vidrio grid h-10 w-10 place-items-center rounded-control"
            onClick={() => mapa.current?.zoomOut()}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Deshacer"
            className="vidrio grid h-10 w-10 place-items-center rounded-control"
            onClick={onDeshacer}
            data-testid="deshacer-mapa"
          >
            ↶
          </button>
        </div>
      ) : null}
      {buscar && pedirLugar ? (
        <BuscarLugar
          inicial={lugarTexto}
          onLugar={(p) => {
            mapa.current?.jumpTo({ center: [p.lon, p.lat], zoom: 17 });
            setBuscar(false);
          }}
          onCerrar={() => setBuscar(false)}
        />
      ) : listo ? (
        <button
          type="button"
          className="vidrio absolute bottom-3 left-3 rounded-full px-3 py-1.5 text-[0.75rem] font-medium"
          onClick={() => setBuscar(true)}
          data-testid="buscar-lugar"
        >
          Buscar el lugar
        </button>
      ) : null}
      <p className="vidrio pointer-events-none absolute right-3 bottom-3 px-2 py-1 text-[0.6875rem] text-texto-3">
        © OpenStreetMap · OpenFreeMap · OpenMapTiles
      </p>
    </div>
  );
}

/**
 * Buscar el lugar del hecho en OpenStreetMap (Nominatim, en México y en español). Se busca solo al
 * pedirlo, sin teclear en vivo, como pide la política de uso de Nominatim.
 */
function BuscarLugar({
  inicial,
  onLugar,
  onCerrar,
}: {
  inicial: string;
  onLugar: (p: { lat: number; lon: number }) => void;
  onCerrar: () => void;
}) {
  const [q, setQ] = useState(inicial);
  const [estado, setEstado] = useState<string | null>(null);
  const [resultados, setResultados] = useState<{ nombre: string; lat: number; lon: number }[]>([]);
  const buscarYa = async () => {
    if (!q.trim()) return;
    setEstado("Buscando…");
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=mx&accept-language=es&q=${encodeURIComponent(q.trim())}`;
      const r = (await (await fetch(url)).json()) as {
        display_name: string;
        lat: string;
        lon: string;
      }[];
      setResultados(
        r.map((x) => ({ nombre: x.display_name, lat: Number(x.lat), lon: Number(x.lon) })),
      );
      setEstado(r.length ? null : "No se encontró. Prueba con la calle y el municipio.");
    } catch {
      setEstado("No se pudo buscar. Mueve el mapa a mano hasta el lugar.");
    }
  };
  return (
    <div
      className="vidrio absolute top-1/2 left-1/2 flex w-[min(420px,90%)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-panel p-5"
      role="dialog"
      aria-label="Buscar el lugar del hecho"
      data-testid="dialogo-buscar-lugar"
    >
      <span className="t-interfaz font-semibold">¿Dónde fue el hecho?</span>
      <span className="t-nota">El caso no trae coordenadas: busca la calle y el municipio.</span>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void buscarYa();
        }}
      >
        <input
          className="campo h-10 flex-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Lugar del hecho"
          data-testid="texto-buscar-lugar"
        />
        <button type="submit" className="boton-principal boton-compacto">
          Buscar
        </button>
      </form>
      {estado ? <span className="t-nota">{estado}</span> : null}
      {resultados.length ? (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {resultados.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                className="t-nota w-full rounded-control px-2 py-1.5 text-left hover:bg-superficie-alta"
                onClick={() => onLugar(r)}
              >
                {r.nombre}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="t-nota self-end underline" onClick={onCerrar}>
        Lo busco moviendo el mapa
      </button>
      <span className="t-nota text-texto-3">Búsqueda: Nominatim · © OpenStreetMap</span>
    </div>
  );
}

export function Pregunta({
  p,
  expediente,
  onCambio,
  onNoSe,
  onIrAlMapa,
}: {
  p: PreguntaEscena;
  expediente: Expediente;
  onCambio: (e: Expediente) => void;
  onNoSe: () => void;
  /** Para «¿Dónde quedó…?»: lleva al paso del lugar con ese vehículo listo para colocarlo. */
  onIrAlMapa?: (vehiculo: string) => void;
}) {
  const [valor, setValor] = useState("");
  const numero = Number(valor.replace(",", "."));
  const c = p.control;
  const aplicar = () => {
    if (!(numero > 0)) return;
    if (p.clave.startsWith("masa-") && p.vehiculo)
      onCambio(conMasa(expediente, p.vehiculo, numero));
    if (p.clave === "restos") onCambio(conRestos(expediente, numero));
  };
  const elegir = (v: string) => {
    if (p.clave === "impactos") onCambio(conPrimerImpacto(expediente, v));
    else if (p.clave.startsWith("zona-") && p.vehiculo && p.impacto)
      onCambio(conZonaImpacto(expediente, p.impacto, p.vehiculo, v));
    else if (p.clave.startsWith("clase-") && p.vehiculo)
      // «Otro» no cambia la clase: la pregunta se da por contestada y la masa se pide sin típica.
      if (v === "otro") onNoSe();
      else onCambio(conClase(expediente, p.vehiculo, v));
  };
  // La masa típica se calcula con la clase de ahora (el perito pudo contestarla después de leer).
  const tipico =
    p.clave.startsWith("masa-") && p.vehiculo
      ? masaTipica(expediente.vehiculos.find((v) => v.id === p.vehiculo)?.clase)
      : c.tipo === "numero"
        ? (c.tipico ?? null)
        : null;
  return (
    <li className="hundido flex flex-col gap-2 p-4" data-testid={`pregunta-${p.clave}`}>
      <p className="t-interfaz font-medium">{p.texto}</p>
      <p className="t-nota">{p.porQue}</p>
      <div className="flex flex-wrap items-center gap-2">
        {c.tipo === "sino" && p.impacto ? (
          <>
            <button
              type="button"
              className="boton-principal boton-compacto"
              onClick={() => onCambio(confirmarImpacto(expediente, p.impacto!))}
              data-testid="confirmar-impacto"
            >
              Sí, confirmar
            </button>
            <button
              type="button"
              className="boton-secundario boton-compacto"
              onClick={() => onCambio(sinImpactoSupuesto(expediente))}
              data-testid="rechazar-impacto"
            >
              No, fue otro
            </button>
          </>
        ) : null}
        {c.tipo === "opciones" ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label={p.texto}>
            {c.opciones.map((o) => (
              <button
                key={o.valor}
                type="button"
                className="boton-secundario boton-compacto"
                onClick={() => elegir(o.valor)}
                data-testid={`opcion-${p.clave}-${o.valor.replace(/[|:]/g, "-")}`}
              >
                {o.etiqueta}
              </button>
            ))}
          </div>
        ) : null}
        {c.tipo === "numero" ? (
          <>
            <input
              className="campo h-10 w-32"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              aria-label={c.unidad === "m" ? "Longitud en metros" : "Masa en kilogramos"}
              data-testid={`valor-${p.clave}`}
            />
            <span className="t-nota">{c.unidad}</span>
            <button type="button" className="boton-secundario boton-compacto" onClick={aplicar}>
              Usar
            </button>
            {tipico && p.vehiculo ? (
              <button
                type="button"
                className="boton-secundario boton-compacto"
                title={`Supuesto: ${tipico.fuente}`}
                onClick={() => {
                  const e = conMasaTipica(expediente, p.vehiculo!);
                  if (e) onCambio(e);
                }}
                data-testid={`usar-tipico-${p.clave}`}
              >
                Usar valor típico ({Math.round(tipico.valor).toLocaleString("es-MX")} kg)
              </button>
            ) : null}
          </>
        ) : null}
        {c.tipo === "mapa" && p.vehiculo && onIrAlMapa ? (
          <button
            type="button"
            className="boton-secundario boton-compacto"
            onClick={() => onIrAlMapa(p.vehiculo!)}
            data-testid={`colocar-${p.clave}`}
          >
            Colocarlo en el mapa
          </button>
        ) : null}
        <button
          type="button"
          className="boton-secundario boton-compacto text-texto-2"
          onClick={onNoSe}
          data-testid={`no-se-${p.clave}`}
        >
          No sé
        </button>
      </div>
      {tipico ? (
        <p className="t-nota text-texto-3">El valor típico es un supuesto: {tipico.fuente}.</p>
      ) : null}
    </li>
  );
}
