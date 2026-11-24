import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  danoEnTexto,
  especDeExpediente,
  formato as F,
  interpretarResultado,
  lecturasDeDano,
  limiteDeCobertura,
  lineaContraCesvi,
  reconstruccionContraCesvi,
  verificacionCesvi,
} from "@croquis/cesvi";
import { fullResult, PRODUCTION_SAMPLES } from "../../../../packages/solver-ts/src/full-result";
import { describe, expect, it } from "vitest";
import { casoAxa, expedienteAxaReconstruccion } from "./axa-reconstruccion";
import { lecturaFisica } from "./contraste-lab";
import { dictamenCasoContenido } from "./dictamen-caso";
import { citaVelocidad, filasDeLaHoja } from "./dictamen-lab";
import { protagonista, rangoDeVelocidad } from "./reconstruccion-lab";

/**
 * AXA ya viene con su escena colocada, así que su lectura física siempre da lo mismo: la que mide
 * `eval/axa_rango_estable.mts`. La cifra se lee del resultado de la evaluación, nunca a mano; las
 * pantallas y el PDF los revisa la e2e de AXA contra el mismo archivo.
 */
const medida = (
  JSON.parse(
    readFileSync(join(__dirname, "../../../../eval/results/axa_rango_estable.json"), "utf8"),
  ) as {
    filas: {
      es_la_de_la_app: boolean;
      hipotesis: number;
      V2: { mejor: number; p10: number; p90: number };
    }[];
  }
).filas.find((f) => f.es_la_de_la_app)!;

describe("la lectura física de AXA", () => {
  it(
    "el caso de ejemplo abre con la misma escena que mide la evaluación",
    { timeout: 60_000 },
    () => {
      const e = casoAxa().escena!.expediente;
      expect(e.versiones).toEqual(expedienteAxaReconstruccion().versiones);
      const posiciones = e.versiones!.find((v) => v.tipo === "evidencia")!.posiciones!;
      expect(posiciones.filter((p) => p.fase === "impacto")).toHaveLength(2);
      expect(posiciones.filter((p) => p.fase === "final")).toHaveLength(2);
    },
  );

  it("da exactamente la cifra de V2 y su rango de eval/results", { timeout: 120_000 }, () => {
    const e = casoAxa().escena!.expediente;
    const base = especDeExpediente(e);
    // Como la app: el resultado completo con las muestras de producción (el worker).
    const r = interpretarResultado(base, fullResult(base.spec, PRODUCTION_SAMPLES));
    const f = lecturaFisica(reconstruccionContraCesvi(e, r), "V2")!;
    expect(f.croquis).toBe(medida.V2.mejor);
    expect(f.rango).toEqual([medida.V2.p10, medida.V2.p90]);
    expect(r.hipotesis?.length ?? 1).toBe(medida.hipotesis);
    // 57 contra 15 km/h sí transfiere energía: el aviso de «casi no transfiere» medía la corrida de
    // arranque (40 y 40 km/h en el mismo rumbo), no el mejor ajuste.
    expect(r.impactos[0]?.sinTransferencia).toBeUndefined();
    expect(r.limites.join(" ")).not.toMatch(/casi no transfiere energía/);
    // Un número por cantidad: la cifra grande, la hoja del dictamen y las citas son el mismo.
    const v = protagonista(r)!;
    expect(v.vehiculo).toBe("V2");
    expect(v.previa!.mejor.toFixed(2)).toBe(medida.V2.mejor.toFixed(2));
    expect(rangoDeVelocidad(v)).toMatchObject({ p10: medida.V2.p10, p90: medida.V2.p90 });
    // En pantalla la conclusión va en enteros; el número completo es el de eval/results.
    const texto = F.kmhConUnidad(medida.V2.mejor, "reconstruccion");
    expect(
      filasDeLaHoja(r, (id) => id, null).find((x) => x.etiqueta.startsWith("V2"))!.valor,
    ).toContain(texto);
    expect(citaVelocidad(r, "V2", "B")).toContain(texto);
  });

  it(
    "la nota del 3D, Presentar y el dictamen dicen de qué vehículo y qué velocidad es (René, 2026-11-15)",
    { timeout: 120_000 },
    () => {
      const e = casoAxa().escena!.expediente;
      const base = especDeExpediente(e);
      const r = interpretarResultado(base, fullResult(base.spec, PRODUCTION_SAMPLES));
      const k = reconstruccionContraCesvi(e, r);
      const restos = k.filas.find((f) => f.metodo.startsWith("Restos"))!;
      expect(lineaContraCesvi(restos, "A · Silverado 2500")).toMatch(
        /^A · Silverado 2500 \(V1\) al salir del impacto: Croquis \d+ km\/h · CESVI 60\.27 km\/h por los restos/,
      );
      const ebs = k.filas.find((f) => f.metodo.startsWith("Deformación"))!;
      expect(lineaContraCesvi(ebs, "B · Tacoma")).toContain(
        "B · Tacoma (V2) antes del impacto: Croquis 57 km/h (55–78)",
      );
      // El dictamen: la misma forma de nombrar.
      const texto = JSON.stringify(
        dictamenCasoContenido({
          expediente: e,
          narracion: null,
          reconstruccion: r,
          verificacion: verificacionCesvi(e),
          croquis: null,
          cuadros3d: [],
          validacion: null,
          estructuraCesvi: false,
          trazabilidad: { metodo: "prueba", huella: "abc" },
        }),
      );
      expect(texto).toMatch(/A · [^"]+ \(V1\) al salir del impacto · CESVI por los restos/);
      expect(texto).toMatch(/B · [^"]+ \(V2\) antes del impacto · CESVI de barrera equivalente/);
    },
  );

  it("dice cuánto de la deformación medida de B explica la reconstrucción visible (auditoría, C5)", () => {
    const base = especDeExpediente(casoAxa().escena!.expediente);
    const r = interpretarResultado(base, fullResult(base.spec, PRODUCTION_SAMPLES));
    const [b] = lecturasDeDano(r);
    // Solo B trae deformación medida: su banda es un mínimo, y la reconstrucción queda en su borde.
    expect(b).toMatchObject({ vehiculo: "V2", minimo: true, estado: "borde_bajo" });
    expect(b!.reconstruccionKmh).toBeGreaterThanOrEqual(b!.banda.p10 - 0.5);
    expect(b!.reconstruccionKmh).toBeLessThan(b!.banda.p50);
    expect(b!.energiaPct).toBeGreaterThan(20);
    expect(b!.energiaPct).toBeLessThan(50);
    expect(danoEnTexto(b!, "B")).toMatch(/^Queda en el borde bajo de la deformación medida de B/);
    // La otra hipótesis (el reposo supuesto como dato) no la alcanza.
    const otra = r.hipotesis!.find((h) => h.familia === "reposo")!;
    expect(lecturasDeDano(r, otra.clave)[0]!.estado).toBe("debajo");
    // Por eso la visible se llama «La más cercana al daño medido»: lo es, sin alcanzar su mediana.
    expect(r.hipotesis![0]).toMatchObject({
      familia: "dano",
      titulo: "La más cercana al daño medido",
    });
    expect(b!.reconstruccionKmh).toBeGreaterThan(
      lecturasDeDano(r, otra.clave)[0]!.reconstruccionKmh,
    );
    // Y el límite de cobertura del rango va con los límites que ve el perito.
    expect(r.limites).toContain(limiteDeCobertura());
  }, 120_000);
});
