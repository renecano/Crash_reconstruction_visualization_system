/**
 * E-C1 (docs/cesvi/PLAN-CESVI.md, C1): reproducción de los cálculos que imprimen los dictámenes de
 * CESVI con el motor de Croquis (`packages/cesvi`).
 *
 * Las fichas (`data/cesvi/calculos/fichas.json`) copian de cada dictamen la fórmula, las variables
 * con su valor impreso y el resultado impreso, sin recalcular nada. Cada ficha dice con qué función
 * del motor se reproduce y qué símbolo impreso va en cada argumento. Los únicos factores permitidos
 * son conversiones de unidades (`FACTORES`): ningún ajuste para que cuadre.
 *
 * Una ficha se reproduce si el resultado del motor está a 0.5 % o menos del impreso. Si no, el
 * motivo es el que anota la ficha después de revisar el texto (`diagnostico`): dato que no se
 * imprime, errata, OCR o fórmula distinta.
 *
 * Uso (desde packages/cesvi): pnpm exec tsx ../../eval/cesvi_reproduccion.mts
 *   → eval/results/cesvi_reproduccion.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as motor from "../packages/cesvi/src/index";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOLERANCIA_PCT = 0.5;

/** Conversiones de unidades permitidas en un argumento (valor impreso × factor). */
const FACTORES: Record<string, number> = {
  "km/h→m/s": 1 / 3.6,
  "m/s→km/h": 3.6,
  "cm→m": 0.01,
  "mm→m": 0.001,
  "kJ→J": 1000,
  "J→kJ": 0.001,
  "t→kg": 1000,
  "kg→t": 0.001,
  "kN→N": 1000,
  "N→kN": 0.001,
};
/** Además, el peralte impreso en grados pasa a pendiente con tan(θ). */
type Conversion = keyof typeof FACTORES | "°→tan";

interface Variable {
  simbolo: string;
  valor: number | null;
  unidad?: string;
}

interface Argumento {
  simbolo: string;
  conversion?: Conversion;
}

interface Ficha {
  id: string;
  n: number;
  tipo: string;
  variables: Variable[];
  resultado: { simbolo?: string; valor: number | null; unidad?: string } | null;
  reproduccion: {
    /** Función del motor; null si la ficha no se puede recalcular. */
    funcion: keyof typeof FUNCIONES | null;
    /** Argumentos en el orden de la función. */
    argumentos?: (Argumento | number)[];
    /** Qué parte del resultado del motor se compara: ms, kmh o el número. */
    salida?: "ms" | "kmh" | "valor";
    /** Por qué no se puede recalcular, o por qué no reproduce (después de revisar el texto). */
    diagnostico?: "dato_no_impreso" | "errata" | "ocr" | "formula_distinta" | "redondeo" | "otro";
    nota?: string;
  };
}

type Num = number;
const FUNCIONES = {
  mcHenry2: (L: Num, A: Num, B: Num, c1: Num, c2: Num) =>
    motor.mcHenry({ L, A, B, C: [c1, c2] }).energia,
  mcHenry4: (L: Num, A: Num, B: Num, c1: Num, c2: Num, c3: Num, c4: Num) =>
    motor.mcHenry({ L, A, B, C: [c1, c2, c3, c4] }).energia,
  mcHenry6: (L: Num, A: Num, B: Num, c1: Num, c2: Num, c3: Num, c4: Num, c5: Num, c6: Num) =>
    motor.mcHenry({ L, A, B, C: [c1, c2, c3, c4, c5, c6] }).energia,
  ebs: (E: Num, m: Num) => motor.ebs(E, m),
  desplazamiento: (a: Num, g: Num, D: Num) => motor.velocidadDesplazamiento(a, g, D),
  frenado: (mu: Num, g: Num, d: Num) => motor.frenadoHuellas(mu, g, d),
  frenadoConFinal: (mu: Num, g: Num, d: Num, vf: Num) => motor.frenadoHuellas(mu, g, d, vf),
  curva: (mu: Num, g: Num, R: Num) => motor.velocidadCriticaCurva(mu, g, R),
  curvaPeralte: (mu: Num, g: Num, R: Num, e: Num) => motor.velocidadCriticaCurva(mu, g, R, e),
  radio: (C: Num, M: Num) => motor.radioCurva(C, M),
  tiroParabolico: (d: Num, h: Num, g: Num) => motor.tiroParabolico(d, h, g),
  trabajoFriccion: (mu: Num, m: Num, g: Num, d: Num) => motor.trabajoFriccion(mu, m, g, d),
  velocidadPorEnergia: (E: Num, m: Num) => motor.velocidadPorEnergia(E, m),
  cantidadMovimiento: (m1: Num, m2: Num, v2: Num, vc: Num) =>
    motor.cantidadMovimientoColineal(m1, m2, v2, vc),
} satisfies Record<string, (...a: number[]) => number | motor.Velocidad>;

function valorDe(f: Ficha, a: Argumento | number): number {
  if (typeof a === "number") return a;
  const v = f.variables.find((x) => x.simbolo === a.simbolo);
  if (!v || v.valor === null) throw new Error(`${f.id}#${f.n}: falta ${a.simbolo}`);
  if (a.conversion === "°→tan") return Math.tan((v.valor * Math.PI) / 180);
  return v.valor * (a.conversion ? FACTORES[a.conversion]! : 1);
}

const fichas = (
  JSON.parse(readFileSync(join(RAIZ, "data/cesvi/calculos/fichas.json"), "utf8")) as {
    fichas: Ficha[];
  }
).fichas;
const prueba = new Set(
  (
    JSON.parse(readFileSync(join(RAIZ, "data/cesvi/corpus/particion.json"), "utf8")) as {
      prueba: string[];
    }
  ).prueba,
);

const filas = fichas.map((f) => {
  const r = f.reproduccion;
  const base = {
    id: f.id,
    n: f.n,
    tipo: f.tipo,
    particion: prueba.has(f.id) ? "prueba" : "desarrollo",
  };
  if (!r.funcion || f.resultado?.valor == null) {
    return {
      ...base,
      estado: "sin_recalculo",
      diagnostico: r.diagnostico ?? "dato_no_impreso",
      nota: r.nota,
    };
  }
  const fn = FUNCIONES[r.funcion] as (...a: number[]) => number | motor.Velocidad;
  const salida = fn(...(r.argumentos ?? []).map((a) => valorDe(f, a)));
  const calculado =
    typeof salida === "number" ? salida : r.salida === "ms" ? salida.ms : salida.kmh;
  const impreso = f.resultado.valor;
  const difPct =
    impreso === 0 ? (calculado === 0 ? 0 : Infinity) : (100 * (calculado - impreso)) / impreso;
  const reproduce = Math.abs(difPct) <= TOLERANCIA_PCT;
  return {
    ...base,
    estado: reproduce ? "reproduce" : "no_reproduce",
    funcion: r.funcion,
    impreso,
    calculado: Number(calculado.toFixed(6)),
    diferencia_pct: Number(difPct.toFixed(4)),
    ...(reproduce ? {} : { diagnostico: r.diagnostico ?? "otro", nota: r.nota }),
  };
});

const resumen = (xs: typeof filas) => {
  const cuenta = (e: string) => xs.filter((x) => x.estado === e).length;
  const recalculadas = cuenta("reproduce") + cuenta("no_reproduce");
  const motivos: Record<string, number> = {};
  for (const x of xs.filter((x) => x.estado !== "reproduce")) {
    const m = `${x.estado}:${"diagnostico" in x ? x.diagnostico : "otro"}`;
    motivos[m] = (motivos[m] ?? 0) + 1;
  }
  return {
    fichas: xs.length,
    dictamenes: new Set(xs.map((x) => x.id)).size,
    recalculadas,
    reproduce: cuenta("reproduce"),
    no_reproduce: cuenta("no_reproduce"),
    sin_recalculo: cuenta("sin_recalculo"),
    proporcion_reproduce: recalculadas
      ? Number((cuenta("reproduce") / recalculadas).toFixed(4))
      : null,
    motivos,
  };
};

const resultado = {
  fecha: new Date().toISOString(),
  descripcion:
    "E-C1: cálculos impresos en los dictámenes de CESVI recalculados con el motor de Croquis. Reproduce = a 0.5 % o menos del valor impreso. Sin ajustes.",
  tolerancia_pct: TOLERANCIA_PCT,
  total: resumen(filas),
  desarrollo: resumen(filas.filter((x) => x.particion === "desarrollo")),
  prueba: resumen(filas.filter((x) => x.particion === "prueba")),
  por_tipo: Object.fromEntries(
    [...new Set(filas.map((x) => x.tipo))]
      .sort()
      .map((t) => [t, resumen(filas.filter((x) => x.tipo === t))]),
  ),
  fichas: filas,
};
writeFileSync(
  join(RAIZ, "eval/results/cesvi_reproduccion.json"),
  `${JSON.stringify(resultado, null, 2)}\n`,
);
const t = resultado.total;
console.log(
  `${t.reproduce}/${t.recalculadas} reproducen (≤ ${TOLERANCIA_PCT} %); ${t.no_reproduce} no; ${t.sin_recalculo} sin recálculo; ${t.dictamenes} dictámenes`,
);
