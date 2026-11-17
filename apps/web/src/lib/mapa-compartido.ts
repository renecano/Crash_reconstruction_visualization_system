/**
 * Un solo mapa de MapLibre para todo el caso (René, 2026-11-16; ronda 2, A1).
 *
 * La primera vez que un mapa se dibuja, MapLibre compila sus programas de WebGL en el hilo principal
 * (unos 230–280 ms en la laptop). Antes cada paso con mapa creaba el suyo y lo pagaba otra vez. Aquí
 * el mapa vive en su propio nodo y se le presta a quien lo muestra (la escena fácil, el mapa del
 * caso): al cambiar de dueño solo cambia de estilo, sin volver a compilar nada.
 *
 * Si alguien lo pide mientras otro lo tiene, recibe un mapa propio, como antes: nunca se comparte a
 * la vez.
 */
import type { Map as MapaMl, MapEventType } from "maplibre-gl";

export interface OpcionesMapa {
  style: string | object;
  center: [number, number];
  zoom: number;
  maxZoom?: number;
  /** Si el perito puede girar el mapa (en la escena fácil el norte siempre va arriba). */
  girar: boolean;
}

export interface MapaPrestado {
  mapa: MapaMl;
  /** Escucha un evento del mapa; se quita solo al soltarlo. */
  oir<T extends keyof MapEventType>(tipo: T, f: (e: MapEventType[T]) => void): void;
  /** Devuelve el mapa: quita lo que se escuchó y lo guarda para el siguiente. */
  soltar(): void;
}

interface Compartido {
  mapa: MapaMl;
  nodo: HTMLDivElement;
  enUso: boolean;
}

let compartido: Compartido | null = null;
let creando = false;

function nodoNuevo(): HTMLDivElement {
  const nodo = document.createElement("div");
  nodo.style.position = "absolute";
  nodo.style.inset = "0";
  return nodo;
}

function conGiro(mapa: MapaMl, girar: boolean) {
  if (girar) {
    mapa.dragRotate.enable();
    mapa.touchZoomRotate.enableRotation();
    mapa.keyboard.enableRotation();
  } else {
    mapa.dragRotate.disable();
    mapa.touchZoomRotate.disableRotation();
    mapa.keyboard.disableRotation();
  }
}

/** Para las pruebas: olvida el mapa compartido. */
export function olvidarMapaCompartido(): void {
  compartido = null;
  creando = false;
}

/**
 * Pone el mapa en `anfitrion` con esas opciones y avisa en `alListo` cuando su estilo ya cargó.
 * `sigue` dice si quien lo pidió sigue montado (la importación de MapLibre es asíncrona).
 */
export async function tomarMapa(
  anfitrion: HTMLElement,
  o: OpcionesMapa,
  alListo: (m: MapaPrestado) => void,
  sigue: () => boolean,
): Promise<void> {
  const { Map, getVersion, setWorkerUrl } = await import("maplibre-gl");
  if (!sigue()) return;
  setWorkerUrl(`/maplibre/worker-${getVersion()}.mjs`);
  const opcionesDeMapa = {
    style: o.style as string,
    center: o.center,
    zoom: o.zoom,
    ...(o.maxZoom ? { maxZoom: o.maxZoom } : {}),
    attributionControl: false as const,
  };
  const quitar: (() => void)[] = [];
  const prestar = (mapa: MapaMl, soltar: () => void): MapaPrestado => ({
    mapa,
    oir(tipo, f) {
      mapa.on(tipo, f);
      quitar.push(() => mapa.off(tipo, f));
    },
    soltar() {
      for (const q of quitar) q();
      quitar.length = 0;
      soltar();
    },
  });

  // Ocupado (o creándose para otro): un mapa propio, que se destruye al soltarlo.
  if (creando || compartido?.enUso) {
    const mapa = new Map({ container: anfitrion, ...opcionesDeMapa });
    conGiro(mapa, o.girar);
    const prestado = prestar(mapa, () => mapa.remove());
    mapa.once("load", () => alListo(prestado));
    return;
  }

  if (!compartido) {
    creando = true;
    const nodo = nodoNuevo();
    anfitrion.appendChild(nodo);
    const mapa = new Map({ container: nodo, ...opcionesDeMapa });
    conGiro(mapa, o.girar);
    compartido = { mapa, nodo, enUso: true };
    creando = false;
    const c = compartido;
    const prestado = prestar(mapa, () => guardar(c));
    mapa.once("load", () => alListo(prestado));
    return;
  }

  // Ya existe y está libre: cambia de casa, de vista y de estilo. Sus programas ya están compilados.
  const c = compartido;
  c.enUso = true;
  anfitrion.appendChild(c.nodo);
  c.mapa.resize();
  c.mapa.setMaxZoom(o.maxZoom ?? 22);
  conGiro(c.mapa, o.girar);
  c.mapa.jumpTo({ center: o.center, zoom: o.zoom, bearing: 0, pitch: 0 });
  const prestado = prestar(c.mapa, () => guardar(c));
  c.mapa.once("style.load", () => alListo(prestado));
  c.mapa.setStyle(o.style as string, { diff: false });
}

/** Guarda el mapa fuera de la vista hasta que alguien lo pida. */
function guardar(c: Compartido) {
  c.enUso = false;
  c.nodo.remove();
}
