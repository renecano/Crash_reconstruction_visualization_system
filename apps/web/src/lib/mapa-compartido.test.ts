import { beforeEach, describe, expect, it, vi } from "vitest";

/** Un MapLibre falso: cuenta cuántos mapas se crean y recuerda lo que se le pide. */
const creados: MapaFalso[] = [];
class MapaFalso {
  escuchas = new Map<string, Set<(e: unknown) => void>>();
  estilos: unknown[] = [];
  quitado = false;
  dragRotate = { enable: vi.fn(), disable: vi.fn() };
  touchZoomRotate = { enableRotation: vi.fn(), disableRotation: vi.fn() };
  keyboard = { enableRotation: vi.fn(), disableRotation: vi.fn() };
  constructor(public opciones: { container: HTMLElement; style: unknown }) {
    creados.push(this);
    this.estilos.push(opciones.style);
  }
  on(t: string, f: (e: unknown) => void) {
    if (!this.escuchas.has(t)) this.escuchas.set(t, new Set());
    this.escuchas.get(t)!.add(f);
    return this;
  }
  once(t: string, f: (e: unknown) => void) {
    const una = (e: unknown) => {
      this.off(t, una);
      f(e);
    };
    return this.on(t, una);
  }
  off(t: string, f: (e: unknown) => void) {
    this.escuchas.get(t)?.delete(f);
    return this;
  }
  emitir(t: string) {
    for (const f of [...(this.escuchas.get(t) ?? [])]) f({});
  }
  setStyle(s: unknown) {
    this.estilos.push(s);
  }
  resize = vi.fn();
  setMaxZoom = vi.fn();
  jumpTo = vi.fn();
  /** Como positron: trae los nombres de las calles locales. */
  getLayer = vi.fn((id: string) => (id === "highway-name-minor" ? { id } : undefined));
  setLayerZoomRange = vi.fn();
  remove() {
    this.quitado = true;
  }
}
vi.mock("maplibre-gl", () => ({
  Map: MapaFalso,
  getVersion: () => "0",
  setWorkerUrl: () => undefined,
}));

import { olvidarMapaCompartido, tomarMapa, type MapaPrestado } from "./mapa-compartido";

const OPC = { style: "a", center: [0, 0] as [number, number], zoom: 11, girar: true };

beforeEach(() => {
  creados.length = 0;
  olvidarMapaCompartido();
});

describe("un solo mapa por caso", () => {
  it("el segundo que lo pide recibe el mismo mapa, con su estilo, sin crear otro", async () => {
    const casaA = document.createElement("div");
    const casaB = document.createElement("div");
    let a: MapaPrestado | null = null;
    await tomarMapa(
      casaA,
      OPC,
      (m) => (a = m),
      () => true,
    );
    creados[0]!.emitir("load");
    expect(a).not.toBeNull();
    const clic = vi.fn();
    a!.oir("click", clic);
    a!.soltar();
    // Devuelto: ya no escucha y salió de su casa, pero sigue vivo.
    creados[0]!.emitir("click");
    expect(clic).not.toHaveBeenCalled();
    expect(casaA.children).toHaveLength(0);
    expect(creados[0]!.quitado).toBe(false);

    let b: MapaPrestado | null = null;
    await tomarMapa(
      casaB,
      { ...OPC, style: "b", girar: false },
      (m) => (b = m),
      () => true,
    );
    expect(creados).toHaveLength(1);
    expect(b).toBeNull();
    creados[0]!.emitir("style.load");
    expect(b!.mapa).toBe(a!.mapa);
    expect(creados[0]!.estilos).toEqual(["a", "b"]);
    expect(casaB.children).toHaveLength(1);
    expect(creados[0]!.dragRotate.disable).toHaveBeenCalled();
  });

  it("si está ocupado, quien lo pide recibe uno propio que se destruye al soltarlo", async () => {
    const casaA = document.createElement("div");
    const casaB = document.createElement("div");
    await tomarMapa(
      casaA,
      OPC,
      () => undefined,
      () => true,
    );
    let b: MapaPrestado | null = null;
    await tomarMapa(
      casaB,
      OPC,
      (m) => (b = m),
      () => true,
    );
    expect(creados).toHaveLength(2);
    creados[1]!.emitir("load");
    b!.soltar();
    expect(creados[1]!.quitado).toBe(true);
    expect(creados[0]!.quitado).toBe(false);
  });

  it("si quien lo pidió ya no está, no se crea nada", async () => {
    await tomarMapa(
      document.createElement("div"),
      OPC,
      () => undefined,
      () => false,
    );
    expect(creados).toHaveLength(0);
  });
});

describe("los nombres de las calles al alejar (B6)", () => {
  it("en cada estilo que carga, las calles locales de positron se nombran desde el zoom 14", async () => {
    await tomarMapa(
      document.createElement("div"),
      OPC,
      () => undefined,
      () => true,
    );
    const mapa = creados[0]!;
    mapa.emitir("style.load");
    expect(mapa.setLayerZoomRange).toHaveBeenCalledWith("highway-name-minor", 14, 24);
    // Las capas que el estilo no trae no se tocan.
    expect(mapa.setLayerZoomRange).toHaveBeenCalledTimes(1);
  });
});
