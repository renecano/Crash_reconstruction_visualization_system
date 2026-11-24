import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import { candadoFisico } from "./candado";
import { impactosEncimados } from "./encimadas";
import { enMetros } from "./geo";
import { medidasDe } from "./poses-impacto";
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import { especDeExpediente, especReconstruida, reconstruirExpediente } from "./reconstruccion";

/**
 * Las tres narraciones que René probó en producción (2026-11-24): el árbol al salir de una curva, el
 * camión que da vuelta y atropella a un peatón, y la carambola en el semáforo de Tollocan. Sus casos
 * guardados están en `data/cesvi/casos/rene-*.croquis`.
 */
const caso = (nombre: string) =>
  (
    JSON.parse(
      readFileSync(
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          `../../../data/cesvi/casos/${nombre}.croquis`,
        ),
        "utf8",
      ),
    ) as { expediente: Expediente }
  ).expediente;

describe("el árbol al salir de una curva: el derrape de antes del choque", () => {
  const e = caso("rene-arbol-curva");

  it("el derrape que la narración pone antes de salir del camino es de antes del impacto", () => {
    const { spec } = especDeExpediente(e, "arbol");
    const derrape = (spec.evidencias as { tipo: string; fase?: string }[]).find(
      (x) => x.tipo === "marcas_derrape",
    );
    expect(derrape?.fase).toBe("antes_impacto");
    // Y el vehículo empieza detrás de sus 18 m de huella, no a 12 m del impacto.
    const v = (spec.vehiculos as { posicion_inicial: { procedencia: { nota: string } } }[])[0]!;
    expect(v.posicion_inicial.procedencia.nota).toMatch(/^23 m antes .*detrás de sus huellas/);
  });

  it(
    "llega al árbol frenado por el derrape: menos velocidad al impacto que antes",
    { timeout: 240_000 },
    () => {
      const r = reconstruirExpediente(e, "arbol", { samples: 8, mcSamples: 8 });
      const v = r.velocidades[0]!;
      expect(r.resultado.inversion).toBeTruthy();
      expect((r.resultado.inversion as { evidencia: string[] }).evidencia).toContain(
        "marcas_frenado:veh-a",
      );
      // 18 m con la fricción del pavimento seco: de ~80 km/h a ~57 al impacto.
      expect(v.impacto!.p50!).toBeLessThan(v.previa!.mejor - 15);
    },
  );
});

describe("la carambola en el semáforo: el Aveo y la Rio colocados encimados", () => {
  const e = caso("rene-carambola-semaforo");

  it("«Separarlos» los deja uno detrás del otro, por su rumbo, no en otro carril", () => {
    const enc = impactosEncimados(e).find((x) => x.orden === 2);
    expect(enc).toBeTruthy();
    const [p2, p3] = ["V2", "V3"].map((v) => enc!.propuesta.find((p) => p.vehiculo === v)!);
    const d = enMetros([p3!.punto.lon, p3!.punto.lat], [p2!.punto.lon, p2!.punto.lat]);
    const r = (p2!.rumbo * Math.PI) / 180;
    const largo = (id: string) => medidasDe(e.vehiculos.find((v) => v.id === id)!).largo;
    const alo = d.este * Math.sin(r) + d.norte * Math.cos(r);
    const deLado = Math.abs(d.este * Math.cos(r) - d.norte * Math.sin(r));
    // Defensa con defensa: la distancia entre centros es la suma de sus medios largos.
    expect(alo).toBeCloseTo((largo("V2") + largo("V3")) / 2, 1);
    // Y no se mueven de lado (de carril): lo de lado es lo que ya tenían.
    expect(deLado).toBeLessThan(0.5);
  });
});

describe("el candado físico (René, 2026-11-24)", () => {
  it(
    "la carambola con el Aveo y la Rio encimados no presenta cifra: dice qué no cuadra y qué revisar",
    { timeout: 240_000 },
    () => {
      const r = reconstruirExpediente(caso("rene-carambola-semaforo"), "carambola", {
        samples: 8,
        mcSamples: 8,
      });
      expect(r.noCuadra).toBeTruthy();
      expect(r.noCuadra!.motivos.join(" ")).toMatch(/quedan encimados .* m al chocar/);
      expect(r.noCuadra!.revisar.join(" ")).toMatch(/Separarlos/);
      // Sin cifra presentada: ninguna velocidad, y la de referencia va aparte.
      expect(r.velocidades.every((v) => v.previa === null && v.impacto === null)).toBe(true);
      expect(r.noCuadra!.cifras.length).toBeGreaterThan(0);
      expect(r.limites.some((l) => l.startsWith("Croquis no presenta una velocidad"))).toBe(true);
    },
  );

  it("el árbol cuadra: la cifra se presenta", { timeout: 240_000 }, () => {
    const r = reconstruirExpediente(caso("rene-arbol-curva"), "arbol", {
      samples: 8,
      mcSamples: 8,
    });
    expect(r.noCuadra).toBeUndefined();
    expect(r.velocidades[0]!.previa).toBeTruthy();
  });

  it("frenar más de 1 g con las huellas de antes del choque no cuadra", () => {
    const { noCuadra } = candadoFisico({
      especAnimada: {
        evidencias: [
          {
            tipo: "marcas_frenado",
            vehiculo_id: "veh-a",
            longitud: { valor: 9, unidad: "m" },
          },
        ],
      },
      ids: { "veh-a": "V1" },
      // 163 km/h con 9 m de frenado y 60 al impacto: (45.3² − 16.7²) / 18 = 98 m/s², 10 g.
      velocidades: [{ vehiculo: "V1", previa: { mejor: 163 }, impacto: { p50: 60 } }],
    });
    expect(noCuadra!.motivos[0]).toMatch(/exige frenar a 10\.0 g/);
  });
});

describe("lo que no cuadra no se anima", () => {
  it(
    "el 3D de la carambola encimada deja a cada vehículo quieto donde quedó, sin choque",
    { timeout: 240_000 },
    () => {
      const r = reconstruirExpediente(caso("rene-carambola-semaforo"), "carambola", {
        samples: 8,
        mcSamples: 8,
      });
      const s = especReconstruida(r) as {
        eventos: unknown[];
        vehiculos: { velocidad_previa: { valor: number } }[];
      };
      expect(s.eventos).toEqual([]);
      expect(s.vehiculos.every((v) => v.velocidad_previa.valor === 0)).toBe(true);
      const d = reconstructionToDict(reconstruct(s)) as {
        vehiculos: { trayectoria: { x: number[]; y: number[] } }[];
      };
      for (const v of d.vehiculos) {
        const { x, y } = v.trayectoria;
        expect(Math.hypot(x.at(-1)! - x[0]!, y.at(-1)! - y[0]!)).toBeLessThan(0.05);
      }
    },
  );
});
