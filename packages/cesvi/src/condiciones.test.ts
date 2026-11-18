import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { condicionesDeTexto, condicionesParaExpediente } from "./condiciones";

const RAIZ = join(__dirname, "../../..");
const narracion = (ruta: string): string =>
  (JSON.parse(readFileSync(join(RAIZ, ruta), "utf8")) as { narracion: string }).narracion;

describe("las condiciones del lugar que narra el perito (René, 2026-11-18)", () => {
  it("«Carambola de noche con lluvia»: concreto, mojado, lluvia ligera y alumbrado", () => {
    const c = condicionesDeTexto(
      narracion("data/cesvi/grabaciones/ejemplos/carambola-lluvia.json"),
    );
    expect(c.superficie?.valor).toBe("concreto");
    expect(c.estado_superficie?.valor).toBe("mojado");
    expect(c.clima?.valor).toBe("lluvia_ligera");
    expect(c.iluminacion?.valor).toBe("noche_con_alumbrado");
    // Cada una con la frase literal de la narración.
    const texto = narracion("data/cesvi/grabaciones/ejemplos/carambola-lluvia.json");
    for (const v of Object.values(c)) expect(texto).toContain(v!.cita);
  });

  it("el acotamiento y el poste no son la superficie de la vía", () => {
    const c = condicionesDeTexto(
      narracion("data/cesvi/grabaciones/ejemplos/poste-terraceria.json"),
    );
    expect(c.superficie?.valor).not.toBe("terraceria");
    expect(c.superficie?.valor).not.toBe("concreto");
    expect(
      condicionesDeTexto("El vehículo terminó contra un poste de concreto de la línea de luz.")
        .superficie,
    ).toBeUndefined();
    expect(
      condicionesDeTexto("Hay un acotamiento de terracería de 2.40 metros junto al arroyo.")
        .superficie,
    ).toBeUndefined();
  });

  it("vocabulario de los dictámenes", () => {
    const c = condicionesDeTexto(
      "La vialidad es de corte recto, con tres carriles de circulación, carpeta asfáltica mojada y semáforo.",
    );
    expect(c.superficie).toEqual({
      valor: "asfalto",
      cita: "La vialidad es de corte recto, con tres carriles de circulación, carpeta asfáltica mojada y semáforo",
    });
    expect(c.estado_superficie?.valor).toBe("mojado");
    expect(condicionesDeTexto("La superficie se encontraba seca.").estado_superficie?.valor).toBe(
      "seco",
    );
    expect(
      condicionesDeTexto("El camino es una vía sinuosa de terracería.").superficie?.valor,
    ).toBe("terraceria");
    expect(condicionesDeTexto("Caía una lluvia intensa sobre la avenida.").clima?.valor).toBe(
      "lluvia_fuerte",
    );
    expect(condicionesDeTexto("La calle carecía de alumbrado público.").iluminacion?.valor).toBe(
      "noche_sin_alumbrado",
    );
  });

  it("no lee lo que la narración niega ni lo que no dice", () => {
    expect(condicionesDeTexto("Al momento del hecho no llovía.").clima).toBeUndefined();
    expect(condicionesDeTexto("Tarde sin lluvia.").clima).toBeUndefined();
    expect(
      condicionesDeTexto("El conductor traía la ropa mojada.").estado_superficie,
    ).toBeUndefined();
    expect(condicionesDeTexto("Dos vehículos en un crucero con semáforo.")).toEqual({});
    expect(condicionesParaExpediente("Dos vehículos en un crucero con semáforo.")).toBeUndefined();
  });

  it("para el expediente, con fuente «perito» y su cita", () => {
    expect(
      condicionesParaExpediente("Se registraba lluvia ligera y la carpeta se encontraba mojada."),
    ).toEqual({
      estado_superficie: {
        valor: "mojado",
        fuente: "perito",
        cita: { texto: "Se registraba lluvia ligera y la carpeta se encontraba mojada" },
      },
      clima: {
        valor: "lluvia_ligera",
        fuente: "perito",
        cita: { texto: "Se registraba lluvia ligera y la carpeta se encontraba mojada" },
      },
    });
  });
});

describe("lo que no es el clima ni la carpeta", () => {
  it("los faros de niebla, una mancha de aceite y un muro de concreto", () => {
    expect(condicionesDeTexto("El faro de niebla izquierdo está roto.").clima).toBeUndefined();
    expect(condicionesDeTexto("Daño en las luces de niebla de la fascia.").clima).toBeUndefined();
    expect(condicionesDeTexto("Hay neblina densa sobre la carretera.").clima?.valor).toBe("niebla");
    expect(
      condicionesDeTexto("Sobre la carpeta asfáltica hay una mancha de aceite.").estado_superficie,
    ).toBeUndefined();
    expect(
      condicionesDeTexto("Al lado del arroyo hay un muro central de concreto.").superficie,
    ).toBeUndefined();
  });
});
