/**
 * Las calles guardadas con el caso (ronda 4): ida y vuelta sin perder vías, nombres, límites ni
 * cruces, y solo se reescriben si cambian de lugar o mejoran de fuente.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Expediente } from "@croquis/cesvi";
import { overpassDeTeselas, type LineaTesela } from "@croquis/croquis-2d";
import { describe, expect, it } from "vitest";
import {
  callesParaGuardar,
  conCallesGuardadas,
  guardadasCerca,
  respuestaDeGuardadas,
} from "./calles-guardadas";
import { callesDe, crucesDe } from "./escena-facil";

const aqui = dirname(fileURLToPath(import.meta.url));
// Las teselas grabadas del Periférico y Viaducto, como las lee La escena.
const t = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../../packages/croquis-2d/fixtures/teselas-periferico-viaducto.json"),
    "utf8",
  ),
) as { transportation: LineaTesela[]; transportation_name: LineaTesela[] };
const centro = { lat: 19.4085338, lon: -99.1944592 };
const resp = overpassDeTeselas(t.transportation, t.transportation_name, [centro.lon, centro.lat], 500);
const base = { caso: { lugar: {}, modalidades: [] }, vehiculos: [] } as unknown as Expediente;

describe("las calles guardadas con el caso", () => {
  const g = callesParaGuardar(resp, centro, 150, "overpass", "2026-11-18T20:00:00Z");

  it("ida y vuelta: las mismas calles, con su nombre, su tipo y sus cruces", () => {
    const antes = callesDe(resp);
    const despues = callesDe(respuestaDeGuardadas(g));
    expect(despues.map((c) => c.id)).toEqual(antes.map((c) => c.id));
    expect(despues.map((c) => c.nombre)).toEqual(antes.map((c) => c.nombre));
    expect(despues.map((c) => c.tipo)).toEqual(antes.map((c) => c.tipo));
    expect(crucesDe(despues).length).toBe(crucesDe(antes).length);
  });

  it("se guardan una vez por lugar, y las de Overpass reemplazan a las de las teselas", () => {
    const e1 = conCallesGuardadas(base, callesParaGuardar(resp, centro, 150, "teselas"));
    expect(e1.caso.lugar?.calles_del_mapa?.fuente).toBe("teselas");
    expect(conCallesGuardadas(e1, callesParaGuardar(resp, centro, 150, "teselas"))).toBe(e1);
    const e2 = conCallesGuardadas(e1, g);
    expect(e2.caso.lugar?.calles_del_mapa?.fuente).toBe("overpass");
    expect(conCallesGuardadas(e2, callesParaGuardar(resp, centro, 150, "teselas"))).toBe(e2);
    const lejos = { lat: centro.lat + 0.01, lon: centro.lon };
    expect(conCallesGuardadas(e2, callesParaGuardar(resp, lejos, 150, "teselas"))).not.toBe(e2);
  });

  it("sirven sin red alrededor del lugar, no en otro", () => {
    const e = conCallesGuardadas(base, g);
    expect(guardadasCerca(e, centro)).not.toBeNull();
    expect(guardadasCerca(e, { lat: centro.lat + 0.01, lon: centro.lon })).toBeNull();
  });
});
