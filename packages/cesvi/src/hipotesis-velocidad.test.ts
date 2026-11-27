import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { conPosicion, escenaDeNarracion } from "./escena-narracion";
import {
  cambiosDeVelocidad,
  especDeHipotesisVelocidad,
  resumenHipotesisVelocidad,
  tituloHipotesisVelocidad,
} from "./hipotesis-velocidad";
import { especDeExpediente } from "./reconstruccion";

const aqui = dirname(fileURLToPath(import.meta.url));
const escena = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const P = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});
/** El caso de ejemplo de «Caso nuevo» (V1 Jetta, V2 Camaro), colocado como en la e2e. */
function colocado(): Expediente {
  let e = escenaDeNarracion(escena.salida, escena.narracion).expediente;
  e = conPosicion(e, { vehiculo: "V1", fase: "impacto", punto: m(-2, 0), rumbo: 0 });
  e = conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(0, 2), rumbo: 90 });
  e = conPosicion(e, { vehiculo: "V1", fase: "final", punto: m(4, 5), rumbo: 30 });
  return conPosicion(e, { vehiculo: "V2", fase: "final", punto: m(3, 9), rumbo: 80 });
}
const nombre = (id: string) => (id === "V1" ? "A · VW Jetta" : "B · GM Camaro");

describe("«¿Y si…?» a otra velocidad (pedido de CESVI, 2026-11-26)", () => {
  const base = especDeExpediente(colocado(), "caso-nuevo");
  const reconstruidas = new Map([
    ["V1", 30],
    ["V2", 20],
  ]);

  it("la escena lleva la velocidad elegida como hipótesis, las demás reconstruidas y sin finales", () => {
    const h = especDeHipotesisVelocidad(base, reconstruidas, [{ vehiculo: "V1", kmh: 60 }]);
    const vs = (h.spec as { vehiculos: Record<string, unknown>[] }).vehiculos;
    const de = (id: string) => vs.find((v) => base.ids[String(v.id)] === id)!;
    expect(de("V1").velocidad_previa).toMatchObject({ valor: 60, fuente: "usuario" });
    expect(String((de("V1").velocidad_previa as { nota: string }).nota)).toMatch(/hipótesis/i);
    expect(de("V2").velocidad_previa).toMatchObject({ valor: 20 });
    expect(vs.every((v) => v.posicion_final === undefined)).toBe(true);
    // La escena de la reconstrucción no se toca.
    const orig = (base.spec as { vehiculos: Record<string, unknown>[] }).vehiculos;
    expect(orig.some((v) => v.posicion_final !== undefined)).toBe(true);
    // Fuera del rango de la app, se acota.
    const fuera = especDeHipotesisVelocidad(base, reconstruidas, [{ vehiculo: "V1", kmh: 500 }]);
    expect(
      (fuera.spec as { vehiculos: Record<string, unknown>[] }).vehiculos.find(
        (v) => base.ids[String(v.id)] === "V1",
      )!.velocidad_previa,
    ).toMatchObject({ valor: 200 });
  });

  it("más rápido, el choque tiene más energía y cambia dónde quedan; cada diferencia con su porcentaje", () => {
    const linea = reconstruct(especDeHipotesisVelocidad(base, reconstruidas).spec, {});
    const hip = reconstruct(
      especDeHipotesisVelocidad(base, reconstruidas, [{ vehiculo: "V1", kmh: 60 }]).spec,
      {},
    );
    const json = (r: typeof linea) => reconstructionToDict(r);
    const cambios = cambiosDeVelocidad(base.ids, json(hip), json(linea), nombre);
    const vel = cambios.find((c) => c.concepto === "Velocidad al impacto · A · VW Jetta")!;
    expect(vel.cambia).toBe(true);
    expect(vel.version).toMatch(/^60 km\/h \(\+30 km\/h \(\+100 %\)\)$/);
    expect(vel.reconstruccion).toBe("30 km/h");
    const energia = cambios.filter((c) => c.concepto.startsWith("Energía de la deformación"));
    expect(energia.length).toBe(2);
    expect(energia.every((c) => c.cambia)).toBe(true);
    expect(cambios.some((c) => c.clave === "trayectoria" && c.cambia)).toBe(true);
    expect(resumenHipotesisVelocidad(cambios)).toMatch(/puntos cambian/);
    // Sin cambiar nada, nada cambia.
    const igual = cambiosDeVelocidad(base.ids, json(linea), json(linea), nombre);
    expect(igual.every((c) => !c.cambia)).toBe(true);
    expect(resumenHipotesisVelocidad(igual)).toBe("Nada cambia más que el redondeo");
  });

  it("el título dice qué velocidad eligió el perito", () => {
    expect(
      tituloHipotesisVelocidad(
        [
          { vehiculo: "V1", kmh: 60 },
          { vehiculo: "V2", kmh: 20 },
        ],
        nombre,
      ),
    ).toBe("¿Y si…? A · VW Jetta a 60 km/h y B · GM Camaro a 20 km/h");
  });
});
