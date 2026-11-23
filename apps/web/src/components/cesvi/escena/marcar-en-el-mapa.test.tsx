/**
 * «Márcalo tú» con un toque en el mapa (René, 2026-11-22): sin calles del mapa, la escena dice
 * «Marcar en el mapa» para por dónde venía un vehículo, y el toque no hacía nada (solo contaban las
 * flechas). Aquí el mapa es un botón que toca a tantos metros del choque; se prueba cada pregunta que
 * se contesta tocando el mapa: el choque, por dónde venía, dónde quedó y por dónde pasó.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escenaDeNarracion, type SalidaCorpus } from "@croquis/cesvi";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { marcarChoque, poseDe, puntosDePaso, type Punto } from "@/lib/escena-facil";
import { impactosAColocar } from "@/lib/pasos-caso";
import { EscenaFacil, type EstadoEscena } from "./escena-facil";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
/** El mapa: un botón por toque, con el punto en `data-*` (norte y este en metros del choque). */
vi.mock("./mapa-facil", async (original) => ({
  ...(await original<typeof import("./mapa-facil")>()),
  MapaFacil: (p: { onToque?: (q: Punto) => void }) => (
    <button
      type="button"
      data-testid="tocar-mapa"
      onClick={(ev) => {
        const b = ev.currentTarget.dataset;
        p.onToque?.(m(Number(b.norte), Number(b.este)));
      }}
    />
  ),
}));

const aqui = dirname(fileURLToPath(import.meta.url));
const grabada = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const e0 = escenaDeNarracion(grabada.salida, grabada.narracion).expediente;
const impactos = impactosAColocar(e0);
const C = { lat: 19.3576, lon: -99.0625 };
function m(norte: number, este: number): Punto {
  return {
    lat: C.lat + norte / 111320,
    lon: C.lon + este / (111320 * Math.cos((C.lat * Math.PI) / 180)),
  };
}

function Escena({ inicial, salida }: { inicial: EstadoEscena; salida: (e: EstadoEscena) => void }) {
  const [estado, setEstado] = useState(inicial);
  return (
    <EscenaFacil
      tema="claro"
      estado={estado}
      onEstado={(x) => {
        salida(x);
        setEstado(x);
      }}
      impactos={impactos}
      narracion={null}
      posicionesNarradas={[]}
      calles={null}
      callesFallaron
      lugar={C}
      zona={{}}
      onBuscarCalles={() => {}}
      onVerReconstruccion={() => {}}
      onNota={() => {}}
    />
  );
}

const vacio = (expediente = e0, puntos: Record<number, Punto> = {}): EstadoEscena => ({
  expediente,
  desconocidos: [],
  direccionesNoSe: [],
  juntoAlChoque: [],
  puntos,
});

function tocar(norte: number, este: number) {
  const b = screen.getByTestId("tocar-mapa");
  b.dataset.norte = String(norte);
  b.dataset.este = String(este);
  act(() => fireEvent.click(b));
}

describe("márcalo tú: un toque en el mapa contesta la pregunta, sin calles del mapa", () => {
  // La escena de una pregunta a la vez; la lista (la escena nueva) va en su propia prueba, abajo.
  beforeEach(() => localStorage.setItem("croquis.escena", "anterior"));
  it("el choque", () => {
    let ultimo: EstadoEscena | null = null;
    render(<Escena inicial={vacio()} salida={(x) => (ultimo = x)} />);
    expect(screen.getByTestId("escena-pregunta").textContent).toBe("¿Dónde fue el choque?");
    tocar(0, 0);
    expect(ultimo!.puntos[1]).toBeTruthy();
    expect(screen.getByTestId("escena-pregunta").textContent).toMatch(/Por dónde venía/);
  });

  it("por dónde venía: del punto tocado hacia el choque", () => {
    let ultimo: EstadoEscena | null = null;
    const conChoque = marcarChoque(e0, impactos, 1, C, 0);
    render(<Escena inicial={vacio(conChoque, { 1: C })} salida={(x) => (ultimo = x)} />);
    const pregunta = screen.getByTestId("escena-pregunta").textContent;
    expect(pregunta).toMatch(/Por dónde venía el/);
    tocar(-30, 0); // venía del sur: avanzaba hacia el norte
    expect(ultimo).not.toBeNull();
    const v = impactos[0]!.vehiculos[0]!;
    const rumbo = poseDe(ultimo!.expediente, v, "impacto")!.rumbo;
    expect(Math.min(Math.abs(rumbo), Math.abs(rumbo - 360))).toBeLessThan(1);
    expect(screen.getByTestId("escena-pregunta").textContent).not.toBe(pregunta);
  });

  it("dónde quedó", () => {
    let ultimo: EstadoEscena | null = null;
    const conChoque = marcarChoque(e0, impactos, 1, C, 0);
    render(<Escena inicial={vacio(conChoque, { 1: C })} salida={(x) => (ultimo = x)} />);
    tocar(-30, 0);
    expect(screen.getByTestId("escena-pregunta").textContent).toMatch(/Dónde quedó/);
    tocar(12, 8);
    const v = impactos[0]!.vehiculos[0]!;
    expect(poseDe(ultimo!.expediente, v, "final")).toBeTruthy();
  });

  it("por dónde pasó", () => {
    let ultimo: EstadoEscena | null = null;
    const conChoque = marcarChoque(e0, impactos, 1, C, 0);
    render(
      <Escena
        inicial={{
          ...vacio(conChoque, { 1: C }),
          c1: { golpeNoSe: true, choquesListos: true },
        }}
        salida={(x) => (ultimo = x)}
      />,
    );
    // Los dos vehículos: por dónde venía y «Quedó junto al choque».
    for (const norte of [-30, 30]) {
      tocar(norte, 0);
      fireEvent.click(screen.getByText("Quedó junto al choque"));
      const listo = screen.queryByRole("button", { name: /Listo/ });
      if (listo) fireEvent.click(listo);
    }
    expect(screen.getByTestId("escena-pregunta").textContent).toMatch(/por dónde pasó/);
    fireEvent.click(screen.getByTestId(`paso-vehiculo-${impactos[0]!.vehiculos[0]}`));
    tocar(-15, 0);
    expect(puntosDePaso(ultimo!.expediente).length).toBe(1);
  });
});

describe("márcalo tú en la escena nueva (la lista)", () => {
  beforeEach(() => localStorage.setItem("croquis.escena", "nueva"));

  it("«Corregir» por dónde venía: un toque en el mapa lo contesta y la lista vuelve", () => {
    let ultimo: EstadoEscena | null = null;
    const conChoque = marcarChoque(e0, impactos, 1, C, 0);
    render(<Escena inicial={vacio(conChoque, { 1: C })} salida={(x) => (ultimo = x)} />);
    const v = impactos[0]!.vehiculos[0]!;
    fireEvent.click(screen.getByTestId(`corregir-direccion-${v}`));
    expect(screen.getByTestId("escena-pregunta").textContent).toMatch(/Por dónde venía/);
    tocar(-30, 0);
    const rumbo = poseDe(ultimo!.expediente, v, "impacto")!.rumbo;
    expect(Math.min(Math.abs(rumbo), Math.abs(rumbo - 360))).toBeLessThan(1);
    expect(screen.getByTestId(`cambiar-direccion-${v}`)).toBeTruthy();
  });
});
