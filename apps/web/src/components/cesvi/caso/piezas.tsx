"use client";
/**
 * Las piezas de los casos de expediente del recorrido (ADR 0079; antes en «Caso nuevo», R1, ADR
 * 0061): el mapa donde el perito coloca a cada vehículo, las preguntas de lo que más cambia la
 * reconstrucción y la fuente de cada dato.
 */
import {
  confirmarImpacto,
  conMasa,
  conRestos,
  type Expediente,
  type PreguntaEscena,
} from "@croquis/cesvi";
import type { Map as MapaMl, Marker } from "maplibre-gl";
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

export function Fuente({ f }: { f?: string }) {
  if (!f) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${f === "supuesto" ? "bg-[var(--falta-fondo)] text-senal-texto" : "bg-superficie-alta text-texto-2"}`}
    >
      {f}
    </span>
  );
}

/** El color de V1 y V2 en el mapa (los del sistema visual); los demás, el del punto genérico. */
function claseVehiculo(id: string): string {
  return id === "V1" ? " punto-a" : id === "V2" ? " punto-b" : "";
}

/** El mapa donde el perito coloca a cada vehículo: un clic pone lo elegido en la herramienta. */
export function MapaEscena({
  posiciones,
  moviles = [],
  impactos = [],
  onClic,
  onMapa,
  tema,
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
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaMl | null>(null);
  const estilo = tema === "claro" ? ESTILO_MAPA_CLARO : ESTILO_MAPA;
  const estiloInicial = useRef(estilo);
  const marcas = useRef<Marker[]>([]);
  const marcasMoviles = useRef<Marker[]>([]);
  const marcasImpacto = useRef<Marker[]>([]);
  const [listo, setListo] = useState(false);
  const clic = useRef(onClic);
  const avisar = useRef(onMapa);
  useEffect(() => {
    clic.current = onClic;
    avisar.current = onMapa;
  }, [onClic, onMapa]);
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
      instancia.on("click", (e) => clic.current({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
      instancia.on("load", () => {
        if (!vivo) return;
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
      <div ref={contenedor} className="h-full w-full" data-testid="mapa-escena" />
      <p className="vidrio pointer-events-none absolute right-3 bottom-3 px-2 py-1 text-[0.6875rem] text-texto-3">
        © OpenStreetMap · OpenFreeMap · OpenMapTiles
      </p>
    </div>
  );
}

export function Pregunta({
  p,
  expediente,
  onCambio,
  onNoSe,
}: {
  p: PreguntaEscena;
  expediente: Expediente;
  onCambio: (e: Expediente) => void;
  onNoSe: () => void;
}) {
  const [valor, setValor] = useState("");
  const numero = Number(valor.replace(",", "."));
  const aplicar = () => {
    if (!(numero > 0)) return;
    if (p.clave.startsWith("masa-") && p.vehiculo)
      onCambio(conMasa(expediente, p.vehiculo, numero));
    if (p.clave === "restos") onCambio(conRestos(expediente, numero));
  };
  const numerica = p.clave.startsWith("masa-") || p.clave === "restos";
  return (
    <li className="hundido flex flex-col gap-2 p-4" data-testid={`pregunta-${p.clave}`}>
      <p className="t-interfaz font-medium">{p.texto}</p>
      <p className="t-nota">{p.porQue}</p>
      <div className="flex flex-wrap items-center gap-2">
        {p.clave === "impacto-propuesto" && p.impacto ? (
          <button
            type="button"
            className="boton-principal boton-compacto"
            onClick={() => onCambio(confirmarImpacto(expediente, p.impacto!))}
            data-testid="confirmar-impacto"
          >
            Sí, confirmar
          </button>
        ) : null}
        {numerica ? (
          <>
            <input
              className="campo h-10 w-32"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              aria-label={p.clave === "restos" ? "Longitud en metros" : "Masa en kilogramos"}
              data-testid={`valor-${p.clave}`}
            />
            <span className="t-nota">{p.clave === "restos" ? "m" : "kg"}</span>
            <button type="button" className="boton-secundario boton-compacto" onClick={aplicar}>
              Usar
            </button>
          </>
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
    </li>
  );
}
