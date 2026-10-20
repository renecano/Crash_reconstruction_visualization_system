import { loadFixture, longitudM, type EscenaSpec } from "@croquis/scene-schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CROQUIS_LEGEND, Croquis } from "./Croquis";
import { sceneLayout } from "./layout";
import {
  crossingAt,
  OSM_ATTRIBUTION,
  redVialFrom,
  templateFromCrossing,
  type OverpassResponse,
} from "./osm";
import { makeViewport, worldToSvg } from "./viewport";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function mockRect(svg: Element, width: number, height: number) {
  Object.defineProperty(svg, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
}

describe("<Croquis />", () => {
  it("dibuja la vía, los vehículos, la leyenda y la flecha de norte", () => {
    const spec = loadFixture("alcance");
    render(<Croquis spec={spec} />);
    expect(screen.getByTestId("road")).toBeTruthy();
    expect(screen.getByTestId("vehicle-veh-a-inicial")).toBeTruthy();
    expect(screen.getByTestId("vehicle-veh-b-inicial")).toBeTruthy();
    expect(screen.getByTestId("vehicle-veh-a-final")).toBeTruthy();
    expect(screen.getByTestId("north")).toBeTruthy();
    expect(screen.getByTestId("croquis").textContent).toContain(CROQUIS_LEGEND);
    expect(screen.getByTestId("croquis").textContent).toContain("semilla 101");
  });

  it("oculta las posiciones finales y las asas de giro en modo solo lectura", () => {
    const spec = loadFixture("alcance");
    render(<Croquis spec={spec} readOnly showFinal={false} />);
    expect(screen.queryByTestId("vehicle-veh-a-final")).toBeNull();
    expect(screen.queryByTestId("vehicle-veh-a-inicial-rotate")).toBeNull();
  });

  it("arrastrar un vehículo emite una escena nueva con la posición movida y procedencia de usuario", () => {
    const spec = loadFixture("alcance");
    const onChange = vi.fn<(s: EscenaSpec) => void>();
    const scale = 10;
    render(<Croquis spec={spec} onChange={onChange} scale={scale} />);
    const svg = screen.getByTestId("croquis");
    const vp = makeViewport(sceneLayout(spec).bounds, scale);
    mockRect(svg, vp.viewBox.width, vp.viewBox.height); // 1 px de pantalla = 1 unidad de SVG
    const start = worldToSvg(vp, spec.vehiculos[0]!.posicion_inicial);
    const body = screen.getByTestId("vehicle-veh-a-inicial").querySelector("rect")!;
    fireEvent.pointerDown(body, { clientX: start.x, clientY: start.y, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: start.x + 25, clientY: start.y - 10, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: start.x + 25, clientY: start.y - 10, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0];
    const moved = next.vehiculos[0]!.posicion_inicial;
    expect(moved.x).toBeCloseTo(-30 + 2.5, 5);
    expect(moved.y).toBeCloseTo(-6 + 1.0, 5);
    expect(moved.procedencia.fuente).toBe("usuario");
    expect(next.vehiculos[1]).toEqual(spec.vehiculos[1]); // B intacto
  });

  it("el asa de giro cambia el rumbo hacia el puntero", () => {
    const spec = loadFixture("alcance");
    const onChange = vi.fn<(s: EscenaSpec) => void>();
    render(<Croquis spec={spec} onChange={onChange} scale={10} />);
    const svg = screen.getByTestId("croquis");
    const vp = makeViewport(sceneLayout(spec).bounds, 10);
    mockRect(svg, vp.viewBox.width, vp.viewBox.height);
    const center = worldToSvg(vp, spec.vehiculos[0]!.posicion_inicial);
    const handle = screen.getByTestId("vehicle-veh-a-inicial-rotate");
    fireEvent.pointerDown(handle, { clientX: center.x + 20, clientY: center.y, pointerId: 2 });
    // Puntero hacia el norte (arriba en pantalla) ⇒ rumbo 90°.
    fireEvent.pointerUp(svg, { clientX: center.x, clientY: center.y - 30, pointerId: 2 });
    expect(onChange.mock.calls[0]![0].vehiculos[0]!.posicion_inicial.rumbo_deg).toBe(90);
  });

  it("en modo solo lectura no emite cambios", () => {
    const spec = loadFixture("alcance");
    const onChange = vi.fn();
    render(<Croquis spec={spec} onChange={onChange} readOnly />);
    const svg = screen.getByTestId("croquis");
    const body = screen.getByTestId("vehicle-veh-a-inicial").querySelector("rect")!;
    fireEvent.pointerDown(body, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("<Croquis /> con la red vial del mapa (ADR 0023)", () => {
  it("dibuja las calles de OSM en vez de la plantilla y muestra la atribución", () => {
    const resp = JSON.parse(
      readFileSync(
        join(process.cwd(), "../../data/osm/toluca_carranza_juarez.overpass.json"),
        "utf-8",
      ),
    ) as OverpassResponse;
    const t = templateFromCrossing(crossingAt(resp, 305269145));
    const red = redVialFrom(resp, {
      lat: 19.278975,
      lon: -99.6539869,
      radioM: 150,
      rotacionDeg: t.rotacion_deg,
      nodoCruce: 305269145,
    });
    const spec = structuredClone<EscenaSpec>(loadFixture("lateral_interseccion"));
    spec.lugar.red_vial = red;
    render(<Croquis spec={spec} />);
    const road = screen.getByTestId("road");
    expect(road.getAttribute("data-fuente")).toBe("mapa");
    expect(road.querySelectorAll("polyline")).toHaveLength(red.vias.length);
    // Juárez, de 4 carriles: sin `width` en OSM, 4 × el ancho de carril de la escena.
    const lay = sceneLayout(spec);
    const juarez = lay.mapa!.vias.find((v) => v.id === 614145444)!;
    expect(juarez.ancho).toBeCloseTo(4 * longitudM(spec.lugar.ancho_carril), 9);
    expect(screen.getByTestId("atribucion-osm").textContent).toBe(OSM_ATTRIBUTION);
    // Rayas (ADR 0041): las calles con `lanes` en OSM las llevan; las que no, ninguna.
    const conCarriles = lay.mapa!.vias.filter((v) => v.carriles !== undefined);
    expect(conCarriles.length).toBeGreaterThan(0);
    const rayas = conCarriles.flatMap((v) => screen.queryAllByTestId(`raya-${v.id}`));
    expect(rayas.length).toBeGreaterThan(0);
    for (const v of lay.mapa!.vias.filter((x) => x.carriles === undefined)) {
      expect(screen.queryAllByTestId(`raya-${v.id}`)).toHaveLength(0);
    }
  });

  it("rayas de alto en los accesos con semáforo (ADR 0044); en una recta, ninguna", () => {
    const { unmount } = render(<Croquis spec={loadFixture("lateral_interseccion")} />);
    expect(screen.getAllByTestId("raya-alto")).toHaveLength(2);
    unmount();
    render(<Croquis spec={loadFixture("alcance")} />);
    expect(screen.queryAllByTestId("raya-alto")).toHaveLength(0);
  });

  it("sin red vial no hay atribución", () => {
    render(<Croquis spec={loadFixture("alcance")} />);
    expect(screen.queryByTestId("atribucion-osm")).toBeNull();
  });
});
