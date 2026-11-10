/**
 * C3 (W5): el terreno que declara el perito. La edición sobre el expediente (zonas, ondulaciones,
 * topes y relieve) y cómo llega a `lugar.terreno` de la `EscenaSpec`, con sus valores por omisión.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TerrenoExpediente as TerrenoZod, validateEscena } from "@croquis/scene-schema";
import { reconstruct, reconstructionToDict, terrainFromSpec } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { conPosicion, escenaDeNarracion } from "./escena-narracion";
import { enMetros } from "./geo";
import { especDeExpediente } from "./reconstruccion";
import {
  agregarOndulacion,
  agregarTope,
  agregarZona,
  ANCHO_TOPE_M,
  cambiarTerreno,
  escalarTerreno,
  girarTerreno,
  LADO_TODO_M,
  moverTerreno,
  piezasTerreno,
  quitarTerreno,
  TOPES_NORMA,
  perfilesDeElevacion,
  terrenoReconstruido,
  usarRelieve,
  usaRelieve,
} from "./terreno";

type Json = Record<string, unknown>;
type XY = { x: number; y: number };

const grabacion = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
    ),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const base = escenaDeNarracion(grabacion.salida, grabacion.narracion).expediente;

/** Un punto a `norte` y `este` metros de un origen fijo (entrada de prueba, no un dato del caso). */
const P = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});

/** Los dos vehículos en el impacto: el origen de la escena queda en (norte −1, este 1). */
function colocado(): Expediente {
  const e = conPosicion(base, { vehiculo: "V1", fase: "impacto", punto: m(-2, 0), rumbo: 0 });
  return conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(0, 2), rumbo: 90 });
}

const terrenoEscena = (e: Expediente) =>
  (especDeExpediente(e).spec.lugar as Json).terreno as
    | {
        superficies?: (Json & { poligono: XY[]; friccion: Json })[];
        ondulaciones?: (Json & { poligono: XY[] })[];
        topes?: (Json & { linea: XY[] })[];
        relieve?: Json;
      }
    | undefined;

const lados = (pts: { lat: number; lon: number }[]) =>
  pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    const d = enMetros([q.lon, q.lat], [p.lon, p.lat]);
    return Math.hypot(d.este, d.norte);
  });

describe("C3: declarar el terreno", () => {
  it("una zona va a lo largo de la calle, con id propio y como dato del perito", () => {
    const a = agregarZona(colocado(), "terraceria", m(20, 0), 90);
    const b = agregarZona(a.expediente, "pasto", m(-20, 0), 0);
    expect([a.id, b.id]).toEqual(["zona-1", "zona-2"]);
    const [z] = piezasTerreno(a.expediente);
    expect(z).toMatchObject({ clase: "zona", tipo: "terraceria", nombre: "Terracería" });
    expect(z!.porOmision).toBe(true);
    // 30 m a lo largo (rumbo 90: este–oeste) por 12 m a lo ancho.
    const l = lados(z!.puntos);
    expect(l[0]).toBeCloseTo(30, 1);
    expect(l[1]).toBeCloseTo(12, 1);
    const d = enMetros(
      [z!.puntos[1]!.lon, z!.puntos[1]!.lat],
      [z!.puntos[0]!.lon, z!.puntos[0]!.lat],
    );
    expect(Math.abs(d.este)).toBeCloseTo(30, 1);
    expect(TerrenoZod.safeParse(b.expediente.terreno).success).toBe(true);
  });

  it("«todo el lugar» es un cuadro grande alrededor del punto", () => {
    const { expediente } = agregarZona(colocado(), "terraceria", m(0, 0), 37, true);
    const l = lados(piezasTerreno(expediente)[0]!.puntos);
    for (const x of l) expect(x).toBeCloseTo(LADO_TODO_M, 0);
  });

  it("un tope cruza la calle con las medidas de la norma, y el perito las puede medir", () => {
    const a = agregarTope(colocado(), m(-12, 0), 0);
    const [t] = piezasTerreno(a.expediente);
    expect(t).toMatchObject({ clase: "tope", alto_m: 0.1, largo_m: 1.4, porOmision: true });
    // La calle va al norte: el tope queda de este a oeste, de 8 m.
    const d = enMetros(
      [t!.puntos[1]!.lon, t!.puntos[1]!.lat],
      [t!.puntos[0]!.lon, t!.puntos[0]!.lat],
    );
    expect(Math.abs(d.este)).toBeCloseTo(ANCHO_TOPE_M, 1);
    expect(Math.abs(d.norte)).toBeLessThan(0.02);
    const medido = cambiarTerreno(a.expediente, a.id, { alto_m: 0.08 });
    expect(piezasTerreno(medido)[0]).toMatchObject({
      alto_m: 0.08,
      largo_m: 1.4,
      porOmision: false,
    });
    const sinusoidal = agregarTope(colocado(), m(-12, 0), 0, "sinusoidal");
    expect(piezasTerreno(sinusoidal.expediente)[0]).toMatchObject({ alto_m: 0.12, largo_m: 3.4 });
    expect(TOPES_NORMA.map((n) => n.id)).toEqual(["circular", "sinusoidal", "trapecial"]);
  });

  it("mover, girar, agrandar y quitar conservan la forma", () => {
    const a = agregarZona(colocado(), "grava", m(20, 0), 90);
    const antes = lados(piezasTerreno(a.expediente)[0]!.puntos);
    const movida = moverTerreno(a.expediente, a.id, m(-30, 15));
    const c = piezasTerreno(movida)[0]!.centro;
    const dc = enMetros([c.lon, c.lat], [m(-30, 15).lon, m(-30, 15).lat]);
    expect(Math.hypot(dc.este, dc.norte)).toBeLessThan(0.05);
    const girada = girarTerreno(movida, a.id, 90);
    const g = piezasTerreno(girada)[0]!;
    lados(g.puntos).forEach((x, i) => expect(x).toBeCloseTo(antes[i]!, 1));
    // Con el giro de 90°, el lado largo queda de norte a sur.
    const d = enMetros([g.puntos[1]!.lon, g.puntos[1]!.lat], [g.puntos[0]!.lon, g.puntos[0]!.lat]);
    expect(Math.abs(d.norte)).toBeCloseTo(30, 1);
    const grande = escalarTerreno(girada, a.id, 1.5);
    expect(lados(piezasTerreno(grande)[0]!.puntos)[0]).toBeCloseTo(45, 1);
    const sin = quitarTerreno(grande, a.id);
    expect(sin.terreno).toBeUndefined();
    expect(piezasTerreno(sin)).toEqual([]);
  });

  it("la ondulación gira con sus crestas y deja de ser supuesto cuando se mide", () => {
    const a = agregarOndulacion(colocado(), m(-25, 0), 0);
    expect(piezasTerreno(a.expediente)[0]).toMatchObject({
      amplitud_m: 0.1,
      longitud_onda_m: 6,
      rumbo_deg: 0,
      porOmision: true,
    });
    const girada = girarTerreno(a.expediente, a.id, 45);
    expect(piezasTerreno(girada)[0]!.rumbo_deg).toBe(45);
    const medida = cambiarTerreno(girada, a.id, { amplitud_m: 0.05, longitud_onda_m: 0.8 });
    expect(piezasTerreno(medida)[0]).toMatchObject({
      amplitud_m: 0.05,
      longitud_onda_m: 0.8,
      porOmision: false,
    });
  });

  it("el relieve real se enciende y se apaga sin tocar lo demás", () => {
    const a = agregarTope(colocado(), m(-12, 0), 0);
    const con = usarRelieve(a.expediente, true);
    expect(usaRelieve(con)).toBe(true);
    expect(piezasTerreno(con)).toHaveLength(1);
    const sin = usarRelieve(con, false);
    expect(usaRelieve(sin)).toBe(false);
    expect(sin.terreno).toEqual(a.expediente.terreno);
    expect(usarRelieve(colocado(), false).terreno).toBeUndefined();
  });
});

describe("C3: el terreno en la escena del solver", () => {
  it("sin terreno declarado, la escena no lleva el bloque", () => {
    expect(terrenoEscena(colocado())).toBeUndefined();
  });

  it("la zona sin fricción lleva la de la tabla con su rango; fijada, la del perito", () => {
    const a = agregarZona(colocado(), "pasto", m(19, 1), 90);
    const t = terrenoEscena(a.expediente)!;
    const z = t.superficies![0]!;
    // El origen de la escena es (norte −1, este 1): el centro de la zona queda en (0, 20).
    const cx = z.poligono.reduce((s, p) => s + p.x, 0) / 4;
    const cy = z.poligono.reduce((s, p) => s + p.y, 0) / 4;
    expect(cx).toBeCloseTo(0, 1);
    expect(cy).toBeCloseTo(20, 1);
    // Pasto seco: Cenek, Jamieson y McLarin (friction.json).
    expect(z.friccion).toMatchObject({ valor: 0.36, rango: [0.21, 0.38], fuente: "default" });
    expect(z.procedencia).toMatchObject({ fuente: "usuario" });
    const fijada = cambiarTerreno(a.expediente, a.id, { friccion: 0.3 });
    expect(terrenoEscena(fijada)!.superficies![0]!.friccion).toEqual({
      valor: 0.3,
      fuente: "usuario",
      confianza: 0.9,
    });
    const deVuelta = cambiarTerreno(fijada, a.id, { friccion: null });
    expect(terrenoEscena(deVuelta)!.superficies![0]!.friccion).toMatchObject({ valor: 0.36 });
  });

  it("topes y ondulaciones van en metros de la escena, con lo supuesto dicho en los límites", () => {
    let e = agregarTope(colocado(), m(-13, 1), 0).expediente;
    e = agregarOndulacion(e, m(-31, 1), 0).expediente;
    const base = especDeExpediente(e);
    const t = terrenoEscena(e)!;
    const tope = t.topes![0]!;
    expect(tope).toMatchObject({ id: "tope-1", alto_m: 0.1, largo_m: 1.4 });
    // 12 m al sur del origen, de x = −4 a x = 4.
    expect(tope.linea.map((p) => p.y)).toEqual([expect.closeTo(-12, 1), expect.closeTo(-12, 1)]);
    expect(tope.linea.map((p) => p.x).sort((a, b) => a - b)).toEqual([
      expect.closeTo(-4, 1),
      expect.closeTo(4, 1),
    ]);
    // Rumbo al norte en el mapa: +Y en la escena, 90°.
    expect(t.ondulaciones![0]).toMatchObject({ rumbo_deg: 90, amplitud_m: 0.1 });
    expect((t.ondulaciones![0]!.procedencia as Json).fuente).toBe("supuesto");
    expect(base.limites.join(" ")).toMatch(/zona ondulada lleva medidas supuestas/);
    expect(base.limites.join(" ")).toMatch(/NOM-034-SCT2\/SEDATU-2022, tabla 38/);
    const medido = cambiarTerreno(cambiarTerreno(e, "tope-1", { alto_m: 0.09 }), "onda-1", {
      amplitud_m: 0.04,
    });
    expect(especDeExpediente(medido).limites.join(" ")).not.toMatch(/supuestas|sin medir/);
    expect(validateEscena(base.spec).ok).toBe(true);
  });

  it("el relieve real se cita sin malla: la malla viaja aparte", () => {
    const t = terrenoEscena(usarRelieve(colocado(), true))!;
    expect(t.relieve).toMatchObject({ fuente: "dem" });
    expect(t.relieve!.malla_id).toBeUndefined();
    expect(validateEscena(especDeExpediente(usarRelieve(colocado(), true)).spec).ok).toBe(true);
  });

  it("el solver lo toma: un tope en el camino queda registrado como cruce", () => {
    // V1 llega del sur hacia el norte: un tope 12 m antes del impacto está en su camino.
    const e = agregarTope(colocado(), m(-14, 0), 0).expediente;
    const spec = especDeExpediente(e).spec;
    expect(terrainFromSpec(spec.lugar as Json)).not.toBeNull();
    const r = reconstructionToDict(reconstruct(spec));
    const t = terrenoReconstruido(especDeExpediente(e).ids, r)!;
    expect(t.cruces.length).toBeGreaterThanOrEqual(1);
    expect(t.cruces[0]).toMatchObject({ tope: "tope-1" });
    expect(t.cruces[0]!.kmh).toBeGreaterThan(0);
    expect(t.supuestos.map((x) => x.clave)).toEqual([
      "perdida_energia_tope",
      "perdida_contacto_tope",
    ]);
  });
});

describe("C3: lo que la reconstrucción dice del terreno", () => {
  const resultado = JSON.parse(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../scene-schema/fixtures/resultados/terraceria_topes.json",
      ),
      "utf8",
    ),
  ) as Json;
  const ids = { "veh-a": "V1", "veh-b": "V2" };

  it("los cruces de tope salen en orden, con su velocidad y los dos supuestos con rango", () => {
    const t = terrenoReconstruido(ids, resultado)!;
    expect(t.cruces.map((c) => [c.tope, c.vehiculo])).toEqual([
      ["tope-antes", "V1"],
      ["tope-despues", "V2"],
    ]);
    const eventos = (resultado.eventos as { id: string; detalle?: Json }[]).filter((e) =>
      e.id.startsWith("tope-"),
    );
    expect(t.cruces.map((c) => c.kmh)).toEqual(eventos.map((e) => e.detalle!.velocidad_cruce_kmh));
    expect(t.cruces[0]!.t).toBeLessThan(0);
    expect(t.supuestos).toHaveLength(2);
    expect(t.supuestos[0]).toMatchObject({ valor: 1, rango: [0.5, 1.5] });
    expect(t.supuestos[1]!.texto).toMatch(/supuesto/);
    expect(t.relieveFalta).toBe(false);
  });

  it("sin terreno no hay nada que decir; sin la malla pedida, se dice", () => {
    expect(terrenoReconstruido(ids, { eventos: [], banderas: [] })).toBeNull();
    const falta = terrenoReconstruido(ids, {
      eventos: [],
      banderas: [
        "La escena cita el relieve real del lugar, pero su malla no llegó al solver: se reconstruye sin relieve.",
      ],
    });
    expect(falta).toMatchObject({ relieveFalta: true, cruces: [] });
  });

  it("el perfil de elevación sigue el camino de cada vehículo y marca el impacto y los topes", () => {
    const perfiles = perfilesDeElevacion(ids, resultado);
    expect(perfiles.map((p) => p.vehiculo)).toEqual(["V1", "V2"]);
    const a = perfiles[0]!;
    expect(a.s).toHaveLength(a.z.length);
    expect(a.s[0]).toBe(0);
    for (let i = 1; i < a.s.length; i++) expect(a.s[i]!).toBeGreaterThanOrEqual(a.s[i - 1]!);
    // La ondulación de la escena mide 0.10 m de valle a cresta y el tope, 0.10 m.
    expect(Math.max(...a.z)).toBeGreaterThan(0.05);
    expect(Math.max(...a.z)).toBeLessThanOrEqual(0.21);
    expect(a.sImpacto).toBeGreaterThan(0);
    expect(a.sImpacto).toBeLessThan(a.s[a.s.length - 1]!);
    // V1 cruza el tope antes del impacto.
    expect(a.cruces).toHaveLength(1);
    expect(a.cruces[0]!.s).toBeLessThan(a.sImpacto);
    // Un resultado plano no lleva altura: no hay perfil.
    const plano = { vehiculos: [{ id: "veh-a", trayectoria: { t: [0], x: [0], y: [0] } }] };
    expect(perfilesDeElevacion(ids, plano)).toEqual([]);
  });
});
