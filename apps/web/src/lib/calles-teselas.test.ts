/**
 * Ronda 4 (René, 2026-11-18), caso cesvi-cf708e9fed: en el Periférico a la altura de Viaducto, las
 * flechas de «¿Por dónde venía…?» salían por los puntos cardinales («Sin las calles del mapa…»)
 * porque Overpass no respondía o tardaba unos 35 s. Ahora salen de las teselas del mapa, grabadas
 * aquí (`packages/croquis-2d/scripts/grabar-teselas.mjs`; OpenFreeMap, datos © OpenStreetMap, ODbL).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  overpassDeTeselas,
  type LineaTesela,
  type OsmNode,
  type OsmWay,
} from "@croquis/croquis-2d";
import { describe, expect, it } from "vitest";
import { RADIO_CALLES_M } from "./calles-del-mapa";
import { callesDe, flechasDeLlegada } from "./escena-facil";

const aqui = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../../packages/croquis-2d/fixtures/teselas-periferico-viaducto.json"),
    "utf8",
  ),
) as { transportation: LineaTesela[]; transportation_name: LineaTesela[] };

/** Un punto sobre el Periférico: el vértice de su tramo más cercano al centro de la colonia. */
function puntoEnElPeriferico(): { lat: number; lon: number } {
  const r = overpassDeTeselas(
    t.transportation,
    t.transportation_name,
    [-99.1944592, 19.4085338],
    500,
  );
  const nodos = new Map(
    (r.elements.filter((e) => e.type === "node") as OsmNode[]).map((n) => [n.id, n]),
  );
  const via = (r.elements.filter((e) => e.type === "way") as OsmWay[]).find((w) =>
    /Periférico|López Mateos/.test(w.tags?.name ?? ""),
  )!;
  const n = nodos.get(via.nodes[Math.floor(via.nodes.length / 2)]!)!;
  return { lat: n.lat, lon: n.lon };
}

describe("las flechas siguen las calles reales con las teselas del mapa (cesvi-cf708e9fed)", () => {
  it("el Periférico sale de las teselas, con su nombre", () => {
    const p = puntoEnElPeriferico();
    const r = overpassDeTeselas(
      t.transportation,
      t.transportation_name,
      [p.lon, p.lat],
      RADIO_CALLES_M,
    );
    const nombres = new Set(callesDe(r).map((c) => c.nombre));
    expect([...nombres].some((n) => /Periférico|López Mateos/.test(n ?? ""))).toBe(true);
  });

  it("en el choque sobre el Periférico, las flechas van por la calle, no por los puntos cardinales", () => {
    const p = puntoEnElPeriferico();
    const r = overpassDeTeselas(
      t.transportation,
      t.transportation_name,
      [p.lon, p.lat],
      RADIO_CALLES_M,
    );
    const flechas = flechasDeLlegada(callesDe(r), p);
    expect(flechas.some((f) => /Periférico|López Mateos/.test(f.calle ?? ""))).toBe(true);
    // Sin calles serían exactamente 0°, 90°, 180° y 270° sin nombre.
    expect(flechas.every((f) => f.calle === null && f.rumbo % 90 === 0)).toBe(false);
    // René (2026-11-18): las flechas con su calle, no solo «Del norte»: los dos sentidos del
    // Periférico traen su nombre.
    expect(
      flechas.filter((f) => /Periférico|López Mateos/.test(f.calle ?? "")).length,
    ).toBeGreaterThanOrEqual(2);
  });
});
