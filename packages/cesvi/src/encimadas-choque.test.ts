import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { conPosicion, escenaDeNarracion } from "./escena-narracion";
import { reconstruirExpediente } from "./reconstruccion";
import { esquinas, impactosEncimados, PROFUNDO_EN_CHOQUE_M, traslape } from "./encimadas";
import { enMetros } from "./geo";
import { medidasDe } from "./poses-impacto";

const P = { lat: 19.29, lon: -99.6 };
const m = (n: number, e: number) => ({
  lat: P.lat + n / 111320,
  lon: P.lon + e / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});
const base = {
  caso: { modalidades: [] },
  vehiculos: [
    { id: "V1", clase: "sedan_mediano" },
    { id: "V2", clase: "sedan_mediano" },
  ],
  impactos: [{ orden: 1, vehiculos: ["V1", "V2"], fuente: "perito" }],
  versiones: [{ tipo: "evidencia", posiciones: [] }],
} as unknown as Expediente;

function choque(dNorte: number, rumbo2: number): Expediente {
  let e = conPosicion(base, { vehiculo: "V1", fase: "impacto", punto: m(0, 0), rumbo: 90 });
  e = conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(dNorte, 0), rumbo: rumbo2 });
  return e;
}

describe("encimados en el choque (René, 2026-11-18)", () => {
  it("tocándose no es encimado; uno sobre otro, sí", () => {
    expect(impactosEncimados(choque(1.85, 90))).toEqual([]); // lado a lado, se tocan
    const enc = impactosEncimados(choque(0.5, 90));
    expect(enc).toHaveLength(1);
    expect(enc[0]!.traslape_m).toBeGreaterThan(PROFUNDO_EN_CHOQUE_M);
  });

  it("«Separarlos» los deja tocándose por la cara de contacto, sin traslape", () => {
    const [enc] = impactosEncimados(choque(0.2, 0));
    let e = choque(0.2, 0);
    for (const p of enc!.propuesta) e = conPosicion(e, { ...p, fase: "impacto" });
    expect(impactosEncimados(e)).toEqual([]);
    const poses = e.versiones![0]!.posiciones!.filter((p) => p.fase === "impacto");
    const origen = [poses[0]!.punto.lon, poses[0]!.punto.lat] as const;
    const caja = (i: number) => {
      const p = poses[i]!;
      const c = enMetros([p.punto.lon, p.punto.lat], origen);
      const { largo, ancho } = medidasDe(e.vehiculos[i]!);
      return esquinas([c.este, c.norte], p.rumbo, largo, ancho);
    };
    const t = traslape(caja(0), caja(1));
    // Se tocan: el traslape que queda es el redondeo, nada más.
    expect(t === null || t.prof < 0.02).toBe(true);
  });
});

describe("un choque que no transfiere energía se dice (René, 2026-11-18)", () => {
  // El crucero de E-R1 con lectura grabada, colocado a mano.
  const g = JSON.parse(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
      ),
      "utf8",
    ),
  ) as { narracion: string; salida: SalidaCorpus };
  const crucero = escenaDeNarracion(g.salida, g.narracion).expediente;
  const colocar = (dNorte: number, dEste: number, rumbo2: number) => {
    let e = conPosicion(crucero, { vehiculo: "V1", fase: "impacto", punto: m(0, 0), rumbo: 90 });
    e = conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(dNorte, dEste), rumbo: rumbo2 });
    return reconstruirExpediente(e, "fantasma", { samples: 8, mcSamples: 8 });
  };

  it(
    "uno detrás del otro, igual de rápidos: el choque no deja daño y la reconstrucción lo dice",
    { timeout: 240_000 },
    () => {
      const r = colocar(0, 1, 90);
      expect(r.impactos[0]!.sinTransferencia).toBe(true);
      expect(r.limites.join(" ")).toMatch(/casi no transfiere energía/);
    },
  );

  it("en ángulo, el choque es completo y no hay aviso", { timeout: 240_000 }, () => {
    const r = colocar(0, 0, 0);
    expect(r.impactos[0]!.sinTransferencia).toBeUndefined();
    expect(r.limites.join(" ")).not.toMatch(/casi no transfiere energía/);
  });
});
