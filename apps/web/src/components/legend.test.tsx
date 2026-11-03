import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LEGEND_TEXT, Legend } from "./legend";

describe("Legend", () => {
  it("muestra la leyenda ilustrativa completa", () => {
    render(<Legend />);
    expect(screen.getByRole("note").textContent).toContain(LEGEND_TEXT);
  });

  it("agrega semilla y hash recortado cuando existen", () => {
    render(<Legend seed={42} inputHash="abcdef0123456789" />);
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("semilla 42");
    expect(note.textContent).toContain("hash abcdef012345");
    expect(note.textContent).not.toContain("6789");
  });

  it("con datos del mapa muestra su atribución; sin ellos, no", () => {
    const { unmount } = render(
      <Legend atribucion="Contiene información de OpenStreetMap (ODbL)" />,
    );
    expect(screen.getByTestId("atribucion-mapa").textContent).toContain("OpenStreetMap");
    unmount();
    render(<Legend />);
    expect(screen.queryByTestId("atribucion-mapa")).toBeNull();
  });

  it("no menciona culpa ni responsables", () => {
    expect(LEGEND_TEXT).toMatch(/No es un peritaje/);
    expect(LEGEND_TEXT.toLowerCase()).not.toMatch(/culpa|responsable/);
  });
});

describe("leyenda limpia al presentar (T1.5)", () => {
  it("sin semilla, hash ni conteo procedural; el texto y las atribuciones se quedan", () => {
    render(
      <Legend
        seed={42}
        inputHash="abcdef0123456789"
        limpia
        procedural={{ edificios: 3, arboles: 4, luminarias: 0, cerros: true }}
        modelos={[{ modelo: "Kiri '10", autor: "D. Z.", licencia: "CC-BY 4.0", url: "" }]}
      />,
    );
    const note = screen.getByRole("note");
    expect(note.textContent).not.toContain("semilla");
    expect(note.textContent).not.toContain("hash");
    expect(screen.queryByTestId("entorno-procedural")).toBeNull();
    expect(note.textContent).toContain("Kiri '10");
  });
});
