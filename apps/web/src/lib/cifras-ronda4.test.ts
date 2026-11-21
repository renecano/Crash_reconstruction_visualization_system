import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import { fullResult } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { expedienteAxaReconstruccion } from "@/lib/axa-reconstruccion";
import * as facil from "@/lib/escena-facil";
import { impactosAColocar } from "@/lib/pasos-caso";
import { armarRelieve, defaultRelieveDeps, RelieveIn } from "@/server/relieve";

/**
 * La tabla de cifras de la ronda 4 que aprueba René (2026-11-21): AXA, los cinco ejemplos y las siete
 * narraciones, con el solver y sin navegador, en el árbol donde corre (producción o el #284). Los
 * ejemplos van con la colocación de su receta (`e2e/recetas-ejemplos.ts`) hecha con las mismas
 * funciones de La escena; las narraciones, con la colocación que propone La escena del #284
 * (`fixtures/caso3d-narraciones/colocaciones.json`), la misma en los dos árboles. Lo que cambia entre
 * los dos es solo el código: la lectura, la masa, la velocidad declarada y la física.
 *
 *   CROQUIS_CIFRAS=<salida.json> pnpm --filter @croquis/web exec vitest run src/lib/cifras-ronda4.test.ts
 */
const RAIZ = resolve(__dirname, "../../../..");
type Json = Record<string, unknown>;
const MUESTRAS = { samples: 32, mcSamples: 128 };
const P = { lat: 19.3576, lon: -99.0625 };
const m = (este: number, norte: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});
const RUMBO: Record<string, number> = {
  "Del sur": 0,
  "Del oeste": 90,
  "Del norte": 180,
  "Del este": 270,
};

/** Las recetas de los ejemplos, como en e2e/recetas-ejemplos.ts. */
const RECETAS: {
  clave: string;
  choques?: [number, number][];
  venia: Record<string, string>;
  quedo: Record<string, [number, number] | "junto">;
  pasos?: { vehiculo: string; en: [number, number] }[];
  terreno?: { tipo: "tope-circular" | "terraceria"; en: [number, number] }[];
  cifra: string;
}[] = [
  {
    clave: "crucero-noche",
    venia: { Jetta: "Del sur", Camaro: "Del oeste" },
    quedo: { Jetta: "junto", Camaro: "junto" },
    cifra: "V1",
  },
  {
    clave: "alcance-deformacion",
    venia: { NP300: "Del sur", Vento: "Del sur" },
    quedo: { NP300: [0, 9], Vento: [2.6, 21] },
    cifra: "V1",
  },
  {
    clave: "carambola-lluvia",
    choques: [[5.6, 0]],
    venia: { Ranger: "Del oeste" },
    quedo: { Ranger: [-0.5, 0], Corolla: [5.4, 0], Aveo: [9.8, 0] },
    cifra: "V1",
  },
  {
    clave: "reversa-pendiente",
    venia: { "CR-V": "Del oeste", Versa: "Del sur" },
    quedo: { "CR-V": [-1.8, 0.4], Versa: [0.6, 7] },
    terreno: [{ tipo: "tope-circular", en: [0.6, -12] }],
    cifra: "V2",
  },
  {
    clave: "poste-terraceria",
    choques: [[18, 3]],
    venia: { "el 3": "Del sur", Sentra: "Del oeste" },
    quedo: { "el 3": [0.8, 8], Sentra: [16.4, 2.7] },
    pasos: [{ vehiculo: "V2", en: [9, 1.5] }],
    terreno: [{ tipo: "terraceria", en: [15, 4] }],
    cifra: "V2",
  },
];

const de = <T>(mapa: Record<string, T>, texto: string) =>
  Object.entries(mapa).find(([k]) => texto.includes(k))?.[1];

function lectura(ruta: string): { e: Expediente; narracion: string } {
  const g = JSON.parse(readFileSync(resolve(RAIZ, ruta), "utf8")) as {
    narracion: string;
    salida: SalidaCorpus;
  };
  return { e: cesvi.escenaDeNarracion(g.salida, g.narracion).expediente, narracion: g.narracion };
}

function colocarReceta(e0: Expediente, r: (typeof RECETAS)[number]): Expediente {
  const impactos = impactosAColocar(e0);
  const nombres = Object.fromEntries(
    e0.vehiculos.map((v) => [v.id, facil.nombreVehiculo(v, e0.vehiculos)]),
  );
  const rumboDe = (vid: string) => RUMBO[de(r.venia, nombres[vid]!) ?? "Del sur"] ?? 0;
  const primero = impactos[0]!.vehiculos[0]!;
  let e = facil.marcarChoque(e0, impactos, 1, P, rumboDe(primero));
  const puntos: Record<number, { lat: number; lon: number }> = { 1: P };
  (r.choques ?? []).forEach(([x, y], i) => {
    puntos[i + 2] = m(x, y);
    e = facil.marcarChoque(e, impactos, i + 2, m(x, y), rumboDe(primero));
  });
  for (const v of e.vehiculos) {
    const venia = de(r.venia, nombres[v.id]!);
    if (venia)
      e = facil.elegirDireccion(e, impactos, v.id, RUMBO[venia]!, (o) => puntos[o] ?? null);
    const q = de(r.quedo, nombres[v.id]!) ?? "junto";
    if (q === "junto") e = facil.quedoJuntoAlChoque(e, v.id);
    else
      e = facil.marcarFinal(e, v.id, m(q[0], q[1]), facil.poseDe(e, v.id, "impacto")?.rumbo ?? 0);
  }
  for (const p of r.pasos ?? []) e = facil.agregarPuntoDePaso(e, p.vehiculo, m(p.en[0], p.en[1]));
  for (const t of r.terreno ?? []) {
    e =
      t.tipo === "tope-circular"
        ? cesvi.agregarTope(e, m(t.en[0], t.en[1]), 0).expediente
        : cesvi.agregarZona(e, "terraceria", m(t.en[0], t.en[1]), 0).expediente;
  }
  return e;
}

/** Como la web: el relieve real si se pide y la velocidad típica donde exista (en el #284). */
async function reconstruir(e0: Expediente, id: string) {
  let e = e0;
  let base = cesvi.especDeExpediente(e, id);
  const usa = (cesvi as Json).usaRelieve as ((x: Expediente) => boolean) | undefined;
  const malla =
    usa?.(e) && base.origen
      ? cesvi.relieveEnEscena(
          (await armarRelieve(
            RelieveIn.parse(cesvi.puntoDeRelieve(base.origen)),
            defaultRelieveDeps(),
          )) as never,
          base.origen,
        )
      : null;
  let r = cesvi.interpretarResultado(
    base,
    fullResult(base.spec, { ...MUESTRAS, relieve: malla as never }),
  );
  const tipicas = (cesvi as Json).expedienteConTipicas as
    ((x: Expediente, y: unknown) => Expediente | null) | undefined;
  const e2 = tipicas?.(e, r) ?? null;
  if (e2) {
    e = e2;
    base = cesvi.especDeExpediente(e, id);
    r = cesvi.interpretarResultado(
      base,
      fullResult(base.spec, { ...MUESTRAS, relieve: malla as never }),
    );
  }
  return { r, e, malla };
}

function fila(
  grupo: string,
  clave: string,
  cifra: string | null,
  e: Expediente,
  r: ReturnType<typeof cesvi.interpretarResultado>,
  malla: unknown,
) {
  return {
    grupo,
    clave,
    cifra_de: cifra,
    vehiculos: e.vehiculos.map((v) => ({
      id: v.id,
      nombre: facil.nombreVehiculo(v, e.vehiculos),
      clase: v.clase ?? null,
      masa_kg: v.masa?.valor ?? null,
      masa_fuente: v.masa?.fuente ?? null,
      declarada: (v as Json).velocidad_narrada ?? null,
    })),
    velocidades: r.velocidades.map((v) => ({
      vehiculo: v.vehiculo,
      mejor: v.previa ? Math.round(v.previa.mejor) : null,
      p10: v.previa?.p10 == null ? null : Math.round(v.previa.p10),
      p90: v.previa?.p90 == null ? null : Math.round(v.previa.p90),
    })),
    relieve: Boolean(malla),
    topes: e.terreno?.topes?.length ?? 0,
    limites: r.limites,
  };
}

describe("la tabla de cifras de la ronda 4", () => {
  it.skipIf(!process.env.CROQUIS_CIFRAS)(
    "mide AXA, los cinco ejemplos y las siete narraciones",
    async () => {
      const filas: Json[] = [];
      const axa = expedienteAxaReconstruccion();
      const ra = await reconstruir(axa, "axa-a2010930");
      filas.push(fila("axa", "axa", "V2", ra.e, ra.r, ra.malla));
      const ej = JSON.parse(
        readFileSync(resolve(RAIZ, "data/cesvi/ejemplos/narraciones.json"), "utf8"),
      ) as {
        ejemplos: { clave: string; grabacion?: string }[];
      };
      for (const receta of RECETAS) {
        const x = ej.ejemplos.find((y) => y.clave === receta.clave)!;
        const { e } = lectura(
          `data/cesvi/grabaciones/${x.grabacion ?? `ejemplos/${x.clave}.json`}`,
        );
        const colocado = colocarReceta(e, receta);
        const { r, e: final, malla } = await reconstruir(colocado, `ejemplo-${receta.clave}`);
        filas.push(fila("ejemplo", receta.clave, receta.cifra, final, r, malla));
      }
      const colocaciones = resolve(
        RAIZ,
        "packages/scene-schema/fixtures/caso3d-narraciones/colocaciones.json",
      );
      if (existsSync(colocaciones)) {
        const c = JSON.parse(readFileSync(colocaciones, "utf8")) as Record<
          string,
          { versiones: unknown }
        >;
        for (const clave of ["arbol", "poste", "puente", "subida", "bajada", "curva"]) {
          const { e } = lectura(`data/cesvi/grabaciones/ronda4/ronda4-${clave}.json`);
          // La misma colocación en los dos árboles (la que propuso La escena del #284).
          const colocado = { ...e, versiones: c[clave]!.versiones } as Expediente;
          const { r, e: final, malla } = await reconstruir(colocado, `narracion-${clave}`);
          filas.push(fila("narracion", clave, null, final, r, malla));
        }
        const t = JSON.parse(
          readFileSync(resolve(RAIZ, "data/cesvi/casos/tollocan-rene.croquis"), "utf8"),
        ) as { expediente: Expediente };
        const rt = await reconstruir(t.expediente, "narracion-tollocan");
        filas.push(fila("narracion", "tollocan", "V1", rt.e, rt.r, rt.malla));
      }
      mkdirSync(dirname(resolve(process.env.CROQUIS_CIFRAS!)), { recursive: true });
      writeFileSync(
        resolve(process.env.CROQUIS_CIFRAS!),
        JSON.stringify({ fecha: new Date().toISOString(), muestras: MUESTRAS, filas }, null, 2) +
          "\n",
      );
      expect(filas.length).toBeGreaterThan(5);
    },
    1_800_000,
  );
});
