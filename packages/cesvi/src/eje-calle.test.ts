/**
 * Ronda 4 (René, 2026-11-19): la trayectoria sigue la geometría real de la calle guardada con el caso;
 * sin calles, en recta, y la curva narrada se dice como supuesto.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { proyectar } from "./eje-calle";
import { conPosicion, escenaDeNarracion } from "./escena-narracion";
import { especDeExpediente, reconstruirExpediente } from "./reconstruccion";

type Json = Record<string, unknown>;
const g = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
    ),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const P = { lat: 19.29, lon: -99.6 };
const ll = (n: number, e: number): [number, number] => [
  P.lon + e / (111320 * Math.cos((P.lat * Math.PI) / 180)),
  P.lat + n / 111320,
];
const m = (n: number, e: number) => {
  const [lon, lat] = ll(n, e);
  return { lat, lon };
};

/** Una calle que viene del sur, dobla 90° al oriente con radio de 25 m, justo donde fue el choque. */
const curva: [number, number][] = [];
for (let n = -120; n < 0; n += 10) curva.push(ll(n, -25));
for (let k = 0; k <= 12; k++) {
  const a = Math.PI - (k * Math.PI) / 24; // de 180° a 90°: del lado poniente hacia arriba
  curva.push(ll(25 * Math.sin(a), 25 * Math.cos(a)));
}
for (let e = 10; e <= 120; e += 10) curva.push(ll(25, e));
const recta: [number, number][] = [ll(-120, -25), ll(120, -25)];

function caso(puntos: [number, number][] | null, conCurvaNarrada = false): Expediente {
  const narracion = conCurvaNarrada
    ? `${g.narracion} El vehículo A perdió el control en la curva.`
    : g.narracion;
  const base = escenaDeNarracion(g.salida, narracion).expediente;
  let e: Expediente = {
    ...base,
    vehiculos: base.vehiculos.filter((v) => v.id === "V1"),
    danos: [],
    // Una barrera, que puede estar sobre la vía: esta prueba es del trazo de la curva. Un poste o un
    // árbol en el eje pasa a la orilla (René, 2026-11-26; `orilla.test.ts`).
    impactos: [{ orden: 1, vehiculos: ["V1"], objeto_fijo: "barrera", fuente: "perito" }],
    versiones: [],
    caso: {
      ...base.caso,
      lugar: {
        ...base.caso.lugar,
        ...(puntos
          ? {
              calles_del_mapa: {
                fuente: "overpass" as const,
                consultado: "2026-11-19T00:00:00Z",
                centro: P,
                radio_m: 300,
                vias: [{ id: 1, tipo: "primary", nombre: "Calle de prueba", puntos }],
              },
            }
          : {}),
      },
    },
  };
  // El choque sobre la curva, a 45° (rumbo 45° desde el norte: al noreste), en el eje.
  const a = Math.PI - (6 * Math.PI) / 24;
  e = conPosicion(e, {
    vehiculo: "V1",
    fase: "impacto",
    punto: m(25 * Math.sin(a), 25 * Math.cos(a)),
    rumbo: 45,
  });
  return e;
}

describe("la curva de la calle real (René, 2026-11-19)", () => {
  it("con la calle curva, el eje entra a la escena y el vehículo arranca sobre la curva", () => {
    const base = especDeExpediente(caso(curva));
    const lugar = base.spec.lugar as Json;
    const eje = (lugar.eje_via as { puntos: { x: number; y: number }[] }).puntos;
    expect(eje.length).toBeGreaterThan(5);
    const ini = (base.spec.vehiculos as Json[])[0]!.posicion_inicial as { x: number; y: number };
    // Sobre el eje (el choque está en el eje), no 12 m en línea recta hacia atrás.
    expect(proyectar(eje, ini).d).toBeLessThan(0.3);
    expect(base.limites.join(" ")).toMatch(/sigue el trazo real de Calle de prueba/);
  });

  it("los 12 m que recorre hasta el choque van sobre la calle", { timeout: 240_000 }, () => {
    const r = reconstruirExpediente(caso(curva), "curva", { samples: 8, mcSamples: 8 });
    const lugar = especDeExpediente(caso(curva)).spec.lugar as Json;
    const eje = (lugar.eje_via as { puntos: { x: number; y: number }[] }).puntos;
    const v = (r.resultado.vehiculos as Json[])[0]!;
    const tr = v.trayectoria as { t: number[]; x: number[]; y: number[] };
    const ti = Number(
      (r.resultado.eventos as Json[]).find((x) => String(x.tipo).startsWith("impacto"))?.t ?? 0,
    );
    // Del choque hacia atrás, a lo largo de lo recorrido (antes del arranque el solver solo prolonga
    // la trayectoria para tener tiempo previo; eso no es la vía).
    let k = tr.t.findIndex((t) => t >= ti);
    if (k < 0) k = tr.t.length - 1;
    let recorrido = 0;
    let revisados = 0;
    for (let i = k; i > 0 && recorrido < 11.5; i--) {
      expect(proyectar(eje, { x: tr.x[i]!, y: tr.y[i]! }).d).toBeLessThan(1.0);
      recorrido += Math.hypot(tr.x[i]! - tr.x[i - 1]!, tr.y[i]! - tr.y[i - 1]!);
      revisados++;
    }
    expect(revisados).toBeGreaterThan(3);
  });

  it("con una calle recta, nada cambia; sin calles, en recta y la curva narrada se dice como supuesto", () => {
    expect((especDeExpediente(caso(recta)).spec.lugar as Json).eje_via).toBeUndefined();
    const sin = especDeExpediente(caso(null, true));
    expect((sin.spec.lugar as Json).eje_via).toBeUndefined();
    expect(sin.limites.join(" ")).toMatch(/se reconstruye en recta \(supuesto\)/);
  });
});
