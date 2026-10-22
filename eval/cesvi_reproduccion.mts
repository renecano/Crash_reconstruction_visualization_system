/**
 * E-C1 (docs/cesvi/PLAN-CESVI.md, C1): reproducción de los cálculos que imprimen los dictámenes de
 * CESVI con el motor de Croquis (`packages/cesvi`).
 *
 * Las fichas (`data/cesvi/calculos/fichas.json`) copian de cada dictamen la fórmula, las variables
 * con su valor impreso y el resultado impreso, sin recalcular nada. Cada ficha dice con qué función
 * del motor se reproduce y qué símbolo impreso va en cada argumento, siguiendo la fórmula impresa.
 * Los únicos factores permitidos son conversiones de unidades (`FACTORES`): ningún ajuste para que
 * cuadre.
 *
 * Una ficha se reproduce si el resultado del motor está a 0.5 % o menos del impreso. Si no, el motivo
 * es «redondeo» cuando la diferencia cabe en la última cifra impresa (el dictamen redondea a menos
 * decimales), o el que anota la ficha después de revisar el texto: dato que no se imprime, errata,
 * OCR, fórmula distinta u otro.
 *
 * Las operaciones aritméticas (sumas, productos, t = d/v) se cuentan aparte de los métodos, para que
 * no inflen la proporción de los cálculos físicos.
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
const FACTORES = {
  "km/h→m/s": 1 / 3.6,
  "m/s→km/h": 3.6,
  "cm→m": 0.01,
  "mm→m": 0.001,
  "kJ→J": 1000,
  "J→kJ": 0.001,
  "t→kg": 1000,
  "kg→t": 0.001,
  "lb→kg": 0.45359237,
} as const;
/** Además, el peralte impreso en grados pasa a pendiente con tan(θ). */
type Conversion = keyof typeof FACTORES | "°→tan";

interface Variable {
  simbolo: string;
  valor: number | null;
  unidad?: string;
}

/** Un argumento: un número de la fórmula, un símbolo impreso, o la suma o el promedio de varios. */
type Argumento =
  | number
  | { simbolo: string; conversion?: Conversion }
  | { suma: string[]; conversion?: Conversion }
  | { promedio: string[] };

type Diagnostico =
  "dato_no_impreso" | "errata" | "ocr" | "formula_distinta" | "comparacion" | "redondeo" | "otro";

interface Ficha {
  id: string;
  n: number;
  tipo: string;
  variables: Variable[];
  resultado: { valor: number | null; unidad?: string; impreso?: string } | null;
  reproduccion: {
    /** Función del motor; null si la ficha no se puede recalcular. */
    funcion: Funcion | null;
    argumentos?: Argumento[];
    /** Qué parte de una velocidad se compara: m/s o km/h. */
    salida?: "ms" | "kmh";
    /** Por qué no se recalcula, o por qué no reproduce (después de revisar el texto). */
    diagnostico?: Diagnostico;
    nota?: string;
  };
}

type Num = number;
const METODOS = {
  mcHenry4: (L: Num, A: Num, B: Num, c1: Num, c2: Num, c3: Num, c4: Num) =>
    motor.mcHenry({ L, A, B, C: [c1, c2, c3, c4] }).energia,
  ebs: (E: Num, m: Num) => motor.ebs(E, m),
  desplazamiento: (a: Num, g: Num, D: Num) => motor.velocidadDesplazamiento(a, g, D),
  frenado: (mu: Num, g: Num, d: Num) => motor.frenadoHuellas(mu, g, d),
  frenadoFriccionEquivalente: (mu: Num, sumaSenos: Num, n: Num, g: Num, d: Num) =>
    motor.frenadoHuellas(motor.friccionEquivalente(mu, sumaSenos, n), g, d),
  frenadoConArrastre: (mu: Num, g: Num, d: Num, mFrena: Num, mTotal: Num) =>
    motor.frenadoConArrastre(mu, g, d, mFrena, mTotal),
  curvaCesvi: (mu: Num, g: Num, R: Num, e: Num) => motor.velocidadCriticaCurvaCesvi(mu, g, R, e),
  radio: (C: Num, M: Num) => motor.radioCurva(C, M),
  tiroParabolico: (d: Num, h: Num, g: Num) => motor.tiroParabolico(d, h, g),
  tiempoCaida: (H: Num, g: Num) => motor.tiempoCaida(H, g),
  trabajoFriccion: (mu: Num, m: Num, g: Num, d: Num) => motor.trabajoFriccion(mu, m, g, d),
  velocidadPorEnergia: (E: Num, m: Num) => motor.velocidadPorEnergia(E, m),
  velocidadPorDosEnergias: (E1: Num, E2: Num, m: Num) => motor.velocidadPorEnergias([E1, E2], m),
  velocidadPorDosArrastres: (mu: Num, mA: Num, g: Num, lA: Num, mB: Num, lB: Num) =>
    motor.velocidadPorEnergias(
      [motor.trabajoFriccion(mu, mA, g, lA), motor.trabajoFriccion(mu, mB, g, lB)],
      mA,
    ),
  energiaCinetica: (m: Num, v: Num) => motor.energiaCinetica(m, v),
  /** ½·(P/g)·V² con P en kg de peso: la energía en kgf·m. */
  energiaCineticaKgf: (P: Num, v: Num, g: Num) => motor.energiaCinetica(P, v) / g,
  volcadura: (g: Num, d: Num, R: Num, h: Num) => motor.velocidadVolcadura(g, d, R, h),
  fuerzaCentripeta: (m: Num, v: Num, R: Num) => motor.fuerzaCentripeta(m, v, R),
  cantidadMovimiento: (m1: Num, m2: Num, v2: Num, vc: Num) =>
    motor.cantidadMovimientoColineal(m1, m2, v2, vc),
  distanciaReaccion: (v: Num, tr: Num, ta: Num) => motor.distanciaReaccion(v, tr, ta),
  distanciaTrasImpacto: (m1: Num, v1: Num, m2: Num, a: Num, g: Num) =>
    motor.distanciaDeFrenado(motor.velocidadComun(m1, v1, m2, 0).ms, a, g),
  distanciaTrasImpactoPerpendicular: (m1: Num, v1: Num, m2: Num, v2: Num, a: Num, g: Num) =>
    motor.distanciaDeFrenado(motor.velocidadComun(m1, v1, m2, v2, true).ms, a, g),
  distanciaPorEnergiaCinetica: (m1: Num, v: Num, mu: Num, m2: Num, g: Num) =>
    motor.distanciaPorEnergia(motor.energiaCinetica(m1, v), mu, m2, g),
};
const ARITMETICA = {
  suma: (...xs: Num[]) => xs.reduce((s, x) => s + x, 0),
  restaDe: (a: Num, ...xs: Num[]) => xs.reduce((s, x) => s - x, a),
  producto: (a: Num, b: Num) => a * b,
  cociente: (a: Num, b: Num) => a / b,
  /** d/t en m/s, que el dictamen escribe en km/h. */
  velocidadMedia: (d: Num, t: Num): motor.Velocidad => ({ ms: d / t, kmh: (3.6 * d) / t }),
};
const FUNCIONES = { ...METODOS, ...ARITMETICA } satisfies Record<
  string,
  (...a: number[]) => number | motor.Velocidad
>;
type Funcion = keyof typeof FUNCIONES;

function valorDe(f: Ficha, a: Argumento): number {
  if (typeof a === "number") return a;
  const uno = (s: string) => {
    const v = f.variables.find((x) => x.simbolo === s);
    if (!v || v.valor === null) throw new Error(`${f.id}#${f.n}: falta ${s}`);
    return v.valor;
  };
  if ("promedio" in a) return a.promedio.reduce((s, x) => s + uno(x), 0) / a.promedio.length;
  const x = "suma" in a ? a.suma.reduce((s, y) => s + uno(y), 0) : uno(a.simbolo);
  if (a.conversion === "°→tan") return Math.tan((x * Math.PI) / 180);
  return x * (a.conversion ? FACTORES[a.conversion] : 1);
}

/** Decimales del número impreso («82» → 0, «58.28 km/h» → 2). */
function decimalesImpresos(impreso: string | undefined, valor: number): number {
  const m = /-?\d[\d,\s]*(?:\.(\d+))?/.exec(impreso ?? String(valor));
  return m?.[1]?.length ?? 0;
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
  const clase = r.funcion && r.funcion in ARITMETICA ? "aritmetica" : "metodo";
  const base = {
    id: f.id,
    n: f.n,
    tipo: f.tipo,
    clase,
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
  const mediaCifra = 0.5 * 10 ** -decimalesImpresos(f.resultado.impreso, impreso);
  const diagnostico = reproduce
    ? undefined
    : Math.abs(calculado - impreso) <= mediaCifra + 1e-9
      ? "redondeo"
      : (r.diagnostico ?? "otro");
  return {
    ...base,
    estado: reproduce ? "reproduce" : "no_reproduce",
    funcion: r.funcion,
    impreso,
    calculado: Number(calculado.toFixed(6)),
    diferencia_pct: Number(difPct.toFixed(4)),
    ...(reproduce ? {} : { diagnostico, nota: r.nota }),
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

const metodos = filas.filter((x) => x.clase === "metodo");
const resultado = {
  fecha: new Date().toISOString(),
  descripcion:
    "E-C1: cálculos impresos en los dictámenes de CESVI recalculados con el motor de Croquis. Reproduce = a 0.5 % o menos del valor impreso. Sin ajustes. Las operaciones aritméticas se cuentan aparte.",
  tolerancia_pct: TOLERANCIA_PCT,
  metodos: resumen(metodos),
  metodos_desarrollo: resumen(metodos.filter((x) => x.particion === "desarrollo")),
  metodos_prueba: resumen(metodos.filter((x) => x.particion === "prueba")),
  aritmetica: resumen(filas.filter((x) => x.clase === "aritmetica")),
  total: resumen(filas),
  por_funcion: Object.fromEntries(
    [...new Set(filas.map((x) => ("funcion" in x ? x.funcion : "sin_recalculo")))]
      .sort()
      .map((t) => [
        t,
        resumen(filas.filter((x) => ("funcion" in x ? x.funcion : "sin_recalculo") === t)),
      ]),
  ),
  fichas: filas,
};
writeFileSync(
  join(RAIZ, "eval/results/cesvi_reproduccion.json"),
  `${JSON.stringify(resultado, null, 2)}\n`,
);
const m = resultado.metodos;
console.log(
  `Métodos: ${m.reproduce}/${m.recalculadas} reproducen (≤ ${TOLERANCIA_PCT} %), ${m.no_reproduce} no, ${m.sin_recalculo} sin recálculo; aritmética ${resultado.aritmetica.reproduce}/${resultado.aritmetica.recalculadas}; ${resultado.total.dictamenes} dictámenes`,
);
