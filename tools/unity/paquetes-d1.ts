/**
 * Arma el paquete caso-3d, con su escenario (ADR 0112), de las escenas de referencia de D1, cada una
 * de día y de noche, para revisarlas y capturarlas en el visor Unity. Los deja en
 * `apps/visor-unity/Build/casos/`, fuera de git, y dice cuánto pesa cada uno.
 *
 * La reconstrucción es la misma en las dos variantes: solo cambia con qué luz se dibuja.
 *
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-d1.ts
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escenarioDe } from "../../apps/web/src/components/visor-unity/escenario";
import { armarCaso3d, caso3dErrors, type Caso3D } from "../../packages/scene-schema/src/caso3d";
import type { EscenaSpec } from "../../packages/scene-schema/src/generated/escena.zod";
import type { Resultado } from "../../packages/scene-schema/src/generated/resultado.zod";
import { fullResult, PRODUCTION_SAMPLES } from "../../packages/solver-ts/src/full-result";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SALIDA = join(RAIZ, "apps/visor-unity/Build/casos");
const leer = <T>(p: string) => JSON.parse(readFileSync(join(RAIZ, p), "utf8")) as T;

/** Las escenas de D1 (plan v4 §1). La de terreno llega con C3. */
const ESCENAS: { nombre: string; escena: () => EscenaSpec; resultado?: () => Resultado }[] = [
  { nombre: "axa", escena: () => leer<EscenaSpec>("demo/escenas-r11/axa.json") },
  ...["lateral_interseccion", "nocturno_lluvia", "carambola"].map((n) => ({
    nombre: n,
    escena: () => leer<Caso3D>(`packages/scene-schema/fixtures/caso3d/${n}.json`).escena,
    resultado: () => leer<Caso3D>(`packages/scene-schema/fixtures/caso3d/${n}.json`).resultado,
  })),
  {
    nombre: "terraceria",
    escena: () => {
      const c = leer<Caso3D>("packages/scene-schema/fixtures/caso3d/alcance.json");
      return conTerreno(c.escena, c.resultado);
    },
    resultado: () => leer<Caso3D>("packages/scene-schema/fixtures/caso3d/alcance.json").resultado,
  },
];

/**
 * La quinta escena de D1, provisional hasta que W5 deje la suya en `fixtures/`: el alcance canónico
 * con una zona de terracería ondulada y un tope antes del impacto. El solver todavía no usa el
 * terreno (W5), así que la reconstrucción es la del alcance en plano: sirve para ver cómo se dibuja.
 */
function conTerreno(escena: EscenaSpec, resultado: Resultado): EscenaSpec {
  const v = resultado.vehiculos[0]!.trayectoria;
  const k0 = 0;
  const k1 = v.t.findIndex((x) => x >= 0);
  const x0 = v.x[k0]!;
  const y0 = v.y[k0]!;
  const dx = Math.cos(v.rumbo[k1]!);
  const dy = Math.sin(v.rumbo[k1]!);
  const en = (a: number, l: number) => ({ x: x0 + dx * a - dy * l, y: y0 + dy * a + dx * l });
  const largo = Math.hypot(v.x[k1]! - x0, v.y[k1]! - y0);
  const fuente = { fuente: "usuario" as const, confianza: 0.8 };
  return {
    ...escena,
    lugar: {
      ...escena.lugar,
      terreno: {
        superficies: [
          {
            id: "terraceria",
            tipo: "terraceria",
            poligono: [en(-10, -7), en(largo + 30, -7), en(largo + 30, 7), en(-10, 7)],
            friccion: { valor: 0.55, fuente: "default", confianza: 0.5 },
            procedencia: fuente,
          },
        ],
        ondulaciones: [
          {
            id: "ondulado",
            poligono: [en(2, -7), en(largo * 0.55, -7), en(largo * 0.55, 7), en(2, 7)],
            amplitud_m: 0.12,
            longitud_onda_m: 7,
            rumbo_deg: (Math.atan2(dy, dx) * 180) / Math.PI,
            procedencia: fuente,
          },
        ],
        topes: [
          {
            id: "tope",
            linea: [en(largo * 0.75, -3.5), en(largo * 0.75, 3.5)],
            alto_m: 0.08,
            largo_m: 1.5,
            procedencia: fuente,
          },
        ],
      },
    },
  };
}

/** La misma escena con otra luz: sin hora declarada, el cielo sale de la iluminación. */
function conLuz(escena: EscenaSpec, luz: "dia" | "noche"): EscenaSpec {
  const { fecha_hora: _hora, ...entorno } = escena.entorno;
  void _hora;
  const fuente = { fuente: "default" as const, confianza: 0.5 };
  return {
    ...escena,
    entorno: {
      ...entorno,
      iluminacion: { valor: luz === "dia" ? "dia" : "noche_con_alumbrado", ...fuente },
      alumbrado_publico: { valor: luz === "noche", ...fuente },
    },
  };
}

mkdirSync(SALIDA, { recursive: true });
for (const f of readdirSync(SALIDA)) rmSync(join(SALIDA, f));
for (const e of ESCENAS) {
  const escena = e.escena();
  const resultado = e.resultado
    ? e.resultado()
    : (fullResult(escena, PRODUCTION_SAMPLES) as unknown as Resultado);
  for (const luz of ["dia", "noche"] as const) {
    const p = armarCaso3d(escena, resultado, null, escenarioDe(conLuz(escena, luz), resultado));
    const errores = caso3dErrors(p);
    if (errores.length) throw new Error(`${e.nombre}:\n${errores.slice(0, 5).join("\n")}`);
    const texto = JSON.stringify(p);
    writeFileSync(join(SALIDA, `${e.nombre}-${luz}.json`), texto);
    const kb = Math.round(texto.length / 1024);
    const kbEsc = Math.round(JSON.stringify(p.escenario).length / 1024);
    console.log(`${e.nombre}-${luz}: ${kb} KB, de los que el escenario son ${kbEsc} KB`);
  }
}
