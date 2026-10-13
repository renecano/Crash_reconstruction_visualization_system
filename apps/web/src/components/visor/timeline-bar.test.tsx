import { createTimeline, eventMarkers } from "@croquis/viewer";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineBar } from "./timeline-bar";

describe("<TimelineBar />", () => {
  const markers = eventMarkers(
    [
      { id: "frenado-veh-a", tipo: "inicio_frenado", t: -0.6, actores: ["veh-a"] },
      { id: "ev-1", tipo: "impacto_vehiculo_vehiculo", t: 0, actores: ["veh-a", "veh-b"] },
    ],
    -3,
    2,
    () => "A",
  );

  it("muestra el tiempo relativo al impacto y los eventos, y emite las acciones", () => {
    const onTogglePlay = vi.fn();
    const onSeek = vi.fn();
    const onStep = vi.fn();
    const onSpeed = vi.fn();
    render(
      <TimelineBar
        state={createTimeline(-3, 2, 0.02, { t: -1.5 })}
        markers={markers}
        onTogglePlay={onTogglePlay}
        onSeek={onSeek}
        onStep={onStep}
        onSpeed={onSpeed}
      />,
    );
    expect(screen.getByTestId("tiempo").textContent).toBe("−1.50 s");
    fireEvent.click(screen.getByRole("button", { name: "Reproducir" }));
    expect(onTogglePlay).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Cuadro siguiente" }));
    expect(onStep).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Impacto (0.00 s)" }));
    expect(onSeek).toHaveBeenCalledWith(0);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "0.25" } });
    expect(onSpeed).toHaveBeenCalledWith(0.25);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });
    expect(onSeek).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole("button", { name: "Inicio de frenado (A) (−0.60 s)" })).toBeDefined();
  });
});
