import {
  agregarObjeto,
  desdeMetros,
  enMetros,
  objetosDe,
  type Expediente,
  type LonLat,
} from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { aplicarObjetoEditado, aplicarPuntoMarcado, rumboDelMapa } from "./edicion";

/** Un origen cualquiera (entrada de prueba, no un dato de un caso). */
const ORIGEN: LonLat = [-99.0625, 19.3576];
const vacio = { vehiculos: [] } as unknown as Expediente;
const en = (x: number, y: number) => {
  const [lon, lat] = desdeMetros(x, y, ORIGEN);
  return { lat, lon };
};
const metros = (p: { lat: number; lon: number }) => enMetros([p.lon, p.lat], ORIGEN);

describe("edición en el 3D de Unity, llevada al expediente", () => {
  it("el rumbo de la escena (antihorario desde el este) es el del mapa (horario desde el norte)", () => {
    expect(rumboDelMapa(0)).toBe(90);
    expect(rumboDelMapa(90)).toBe(0);
    expect(rumboDelMapa(-90)).toBe(180);
    expect(rumboDelMapa(180)).toBe(270);
  });

  it("mueve, gira y alarga un muro que colocó el perito", () => {
    const { expediente: e, id } = agregarObjeto(vacio, "muro", en(10, 5), 0);
    const r = aplicarObjetoEditado(e, ORIGEN, {
      id,
      x: 12,
      y: 6,
      rumbo_deg: 0,
      largo: 6.3,
      ancho: 0.2,
    });
    expect(r.cambio).toBe(true);
    const [muro] = objetosDe(r.expediente);
    expect(metros(muro!.punto).este).toBeCloseTo(12, 6);
    expect(metros(muro!.punto).norte).toBeCloseTo(6, 6);
    expect(muro!.rumbo).toBe(90);
    expect(muro!.largo).toBeCloseTo(6.3, 6);
  });

  it("un poste no cambia de grosor aunque llegue otro largo, y uno del mapa no se toca", () => {
    const { expediente: e, id } = agregarObjeto(vacio, "poste", en(0, 0));
    const r = aplicarObjetoEditado(e, ORIGEN, { id, x: 1, y: 1, rumbo_deg: 90, largo: 2, ancho: 0.3 });
    expect(objetosDe(r.expediente)[0]!.largo).toBe(0.3);
    const ajeno = aplicarObjetoEditado(e, ORIGEN, {
      id: "osm-123",
      x: 1,
      y: 1,
      rumbo_deg: 0,
      largo: 1,
      ancho: 1,
    });
    expect(ajeno.cambio).toBe(false);
    expect(ajeno.expediente).toBe(e);
  });

  it("marca el primer golpe y un punto de paso en el mapa", () => {
    const golpe = aplicarPuntoMarcado(vacio, ORIGEN, { tipo: "punto_inicial", x: 3, y: -2 });
    expect(golpe.cambio).toBe(true);
    const punto = golpe.expediente.impactos![0]!.punto!;
    expect(metros(punto).este).toBeCloseTo(3, 6);
    expect(metros(punto).norte).toBeCloseTo(-2, 6);

    const paso = aplicarPuntoMarcado(vacio, ORIGEN, {
      tipo: "punto_paso",
      vehiculo_id: "V1",
      x: -20,
      y: 0,
    });
    expect(paso.cambio).toBe(true);
    const sinVehiculo = aplicarPuntoMarcado(vacio, ORIGEN, { tipo: "punto_paso", x: 0, y: 0 });
    expect(sinVehiculo.cambio).toBe(false);
  });

  it("un choque intermedio necesita el objeto tocado, y se nombra como en la escena fácil", () => {
    const { expediente: e, id } = agregarObjeto(vacio, "arbol", en(8, 8));
    const sin = aplicarPuntoMarcado(e, ORIGEN, {
      tipo: "choque_intermedio",
      vehiculo_id: "V1",
      x: 8,
      y: 8,
    });
    expect(sin.cambio).toBe(false);
    const con = aplicarPuntoMarcado(e, ORIGEN, {
      tipo: "choque_intermedio",
      vehiculo_id: "V1",
      objeto_id: id,
      x: 8,
      y: 8,
    });
    expect(con.cambio).toBe(true);
    expect(con.expediente.impactos!.at(-1)).toMatchObject({ objeto_fijo: "árbol", fuente: "perito" });
  });

  it("sin origen (vehículos sin colocar) no se puede medir nada", () => {
    expect(aplicarPuntoMarcado(vacio, null, { tipo: "punto_inicial", x: 0, y: 0 }).cambio).toBe(false);
  });
});
