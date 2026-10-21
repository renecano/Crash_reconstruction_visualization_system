/**
 * Las fórmulas del método de CESVI escritas como en el dictamen: la forma general, la forma con los
 * valores sustituidos y el resultado. Lo usan la página `/cesvi` y el PDF del dictamen; los números
 * salen de `metodo.ts`, aquí solo se escriben.
 */
import {
  ebs,
  mcHenry,
  velocidadDesplazamiento,
  type MedicionDeformacion,
  type ResultadoMcHenry,
  type Velocidad,
} from "./metodo";

/** Cifra con `d` decimales, punto decimal y sin separador de miles (como en los dictámenes). */
export function cifra(x: number, d: number): string {
  return x.toFixed(d);
}

/** Un dato tal como se capturó: sin perder ni agregar decimales. */
function dato(x: number): string {
  return String(x);
}

export interface PasoFormula {
  /** La fórmula con símbolos. */
  general: string;
  /** La fórmula con los valores sustituidos. */
  sustituida: string;
  /** Pasos intermedios (sumas parciales), si los hay. */
  intermedios: string[];
  /** El resultado, con su unidad. */
  resultado: string;
}

function pesos(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 1 : 2));
}

function sumaSimbolica(n: number, cuadrado: boolean): string {
  const terminos = pesos(n).map((p, i) => `${p === 2 ? "2" : ""}C${i + 1}${cuadrado ? "²" : ""}`);
  if (cuadrado) {
    for (let i = 1; i < n; i++) terminos.push(`C${i}·C${i + 1}`);
  }
  return terminos.join(" + ");
}

function sumaSustituida(C: readonly number[], cuadrado: boolean): string {
  const n = C.length;
  const terminos = pesos(n).map((p, i) => {
    const c = dato(C[i]!);
    if (!cuadrado) return p === 2 ? `2·${c}` : c;
    return p === 2 ? `2·${c}²` : `${c}²`;
  });
  if (cuadrado) {
    for (let i = 0; i < n - 1; i++) terminos.push(`${dato(C[i]!)}·${dato(C[i + 1]!)}`);
  }
  return terminos.join(" + ");
}

/** Energía de deformación de McHenry con sus valores sustituidos. */
export function formulaMcHenry(
  m: MedicionDeformacion,
  unidadEnergia: string,
  decimales = 3,
): PasoFormula & { calculo: ResultadoMcHenry } {
  const r = mcHenry(m);
  const n = r.medidas;
  const k = n - 1;
  const prefijo = k === 1 ? "L" : `L/${k}`;
  const umbral = k === 1 ? "A²/2B" : `${k}A²/2B`;
  const general = `E = ${prefijo} · [ A/2 · (${sumaSimbolica(n, false)}) + B/6 · (${sumaSimbolica(n, true)}) + ${umbral} ]`;
  const L = dato(m.L);
  const A = dato(m.A);
  const B = dato(m.B);
  const sustituida = `E = ${k === 1 ? L : `${L}/${k}`} · [ ${A}/2 · (${sumaSustituida(m.C, false)}) + ${B}/6 · (${sumaSustituida(m.C, true)}) + ${k === 1 ? "" : `${k}·`}${A}²/(2·${B}) ]`;
  const intermedios = [
    `E = ${cifra(m.L / k, 4)} · [ ${A}/2 · ${cifra(r.sumaLineal, 4)} + ${B}/6 · ${cifra(r.sumaCuadratica, 4)} + ${cifra(r.terminoUmbral, decimales)} ]`,
    `E = ${cifra(m.L / k, 4)} · [ ${cifra(r.terminoA, decimales)} + ${cifra(r.terminoB, decimales)} + ${cifra(r.terminoUmbral, decimales)} ]`,
  ];
  return {
    general,
    sustituida,
    intermedios,
    resultado: `E = ${cifra(r.energia, decimales)} ${unidadEnergia}`,
    calculo: r,
  };
}

/** EBS = √(2·E/m) con sus valores sustituidos. */
export function formulaEbs(
  energia: number,
  masa: number,
  textoEnergia = dato(energia),
  textoMasa = dato(masa),
): PasoFormula & { calculo: Velocidad } {
  const v = ebs(energia, masa);
  return {
    general: "EBS = √(2 · E / m)",
    sustituida: `EBS = √(2 · ${textoEnergia} / ${textoMasa})`,
    intermedios: [],
    resultado: `EBS = ${cifra(v.ms, 4)} m/s = ${cifra(v.kmh, 2)} km/h`,
    calculo: v,
  };
}

/** V = √(2·a·g·D) con sus valores sustituidos. */
export function formulaDesplazamiento(
  a: number,
  g: number,
  D: number,
): PasoFormula & { calculo: Velocidad } {
  const v = velocidadDesplazamiento(a, g, D);
  return {
    general: "V3 = √(2 · a · g · D)",
    sustituida: `V3 = √(2 · ${dato(a)} · ${dato(g)} · ${dato(D)})`,
    intermedios: [],
    resultado: `V3 = ${cifra(v.ms, 2)} m/s = ${cifra(v.kmh, 2)} km/h`,
    calculo: v,
  };
}
