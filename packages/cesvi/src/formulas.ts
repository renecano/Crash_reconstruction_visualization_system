/**
 * Las fórmulas del método de CESVI escritas como en el dictamen: la forma general, la forma con los
 * valores sustituidos y el resultado. Lo usan la página `/cesvi` y el PDF del dictamen; los números
 * salen de `metodo.ts`, aquí solo se escriben.
 */
import {
  cantidadMovimientoColineal,
  frenadoHuellas,
  radioCurva,
  tiroParabolico,
  trabajoFriccion,
  velocidadCriticaCurva,
} from "./calculos";
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

/** Una fórmula de energía o de velocidad, con su resultado numérico. */
export type PasoEnergia = PasoFormula & { calculo: ResultadoMcHenry };
export type PasoVelocidad = PasoFormula & { calculo: Velocidad };

/** Energía de deformación de McHenry con sus valores sustituidos. */
export function formulaMcHenry(
  m: MedicionDeformacion,
  unidadEnergia: string,
  decimales = 3,
): PasoEnergia {
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
): PasoVelocidad {
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
export function formulaDesplazamiento(a: number, g: number, D: number): PasoVelocidad {
  const v = velocidadDesplazamiento(a, g, D);
  return {
    general: "V3 = √(2 · a · g · D)",
    sustituida: `V3 = √(2 · ${dato(a)} · ${dato(g)} · ${dato(D)})`,
    intermedios: [],
    resultado: `V3 = ${cifra(v.ms, 2)} m/s = ${cifra(v.kmh, 2)} km/h`,
    calculo: v,
  };
}

/** V = √(Vf² + 2·μ·g·d) con sus valores sustituidos (sin Vf si el vehículo se detiene). */
export function formulaFrenado(mu: number, g: number, d: number, vFinalMs = 0): PasoVelocidad {
  const v = frenadoHuellas(mu, g, d, vFinalMs);
  const conVf = vFinalMs > 0;
  return {
    general: conVf ? "V = √(Vf² + 2 · μ · g · d)" : "V = √(2 · μ · g · d)",
    sustituida: `V = √(${conVf ? `${dato(vFinalMs)}² + ` : ""}2 · ${dato(mu)} · ${dato(g)} · ${dato(d)})`,
    intermedios: [],
    resultado: `V = ${cifra(v.ms, 2)} m/s = ${cifra(v.kmh, 2)} km/h`,
    calculo: v,
  };
}

/** Velocidad crítica en curva, con o sin peralte, con sus valores sustituidos. */
export function formulaCurva(mu: number, g: number, R: number, peralte = 0): PasoVelocidad {
  const v = velocidadCriticaCurva(mu, g, R, peralte);
  const conPeralte = peralte !== 0;
  return {
    general: conPeralte ? "V = √(g · R · (μ + e) / (1 − μ · e))" : "V = √(μ · g · R)",
    sustituida: conPeralte
      ? `V = √(${dato(g)} · ${dato(R)} · (${dato(mu)} + ${dato(peralte)}) / (1 − ${dato(mu)} · ${dato(peralte)}))`
      : `V = √(${dato(mu)} · ${dato(g)} · ${dato(R)})`,
    intermedios: [],
    resultado: `V = ${cifra(v.ms, 2)} m/s = ${cifra(v.kmh, 2)} km/h`,
    calculo: v,
  };
}

/** R = C²/(8·M) + M/2 con sus valores sustituidos. */
export function formulaRadio(cuerda: number, flecha: number): PasoFormula & { calculo: number } {
  const R = radioCurva(cuerda, flecha);
  return {
    general: "R = C² / (8 · M) + M / 2",
    sustituida: `R = ${dato(cuerda)}² / (8 · ${dato(flecha)}) + ${dato(flecha)} / 2`,
    intermedios: [],
    resultado: `R = ${cifra(R, 2)} m`,
    calculo: R,
  };
}

/** V = d·√(g/(2·h)) con sus valores sustituidos. */
export function formulaTiroParabolico(d: number, h: number, g: number): PasoVelocidad {
  const v = tiroParabolico(d, h, g);
  return {
    general: "V = d · √(g / (2 · h))",
    sustituida: `V = ${dato(d)} · √(${dato(g)} / (2 · ${dato(h)}))`,
    intermedios: [],
    resultado: `V = ${cifra(v.ms, 2)} m/s = ${cifra(v.kmh, 2)} km/h`,
    calculo: v,
  };
}

/** E = μ·m·g·d con sus valores sustituidos. */
export function formulaTrabajoFriccion(
  mu: number,
  m: number,
  g: number,
  d: number,
): PasoFormula & { calculo: number } {
  const E = trabajoFriccion(mu, m, g, d);
  return {
    general: "E = μ · m · g · d",
    sustituida: `E = ${dato(mu)} · ${dato(m)} · ${dato(g)} · ${dato(d)}`,
    intermedios: [],
    resultado: `E = ${cifra(E, 2)} J`,
    calculo: E,
  };
}

/** V1 = ((m1 + m2)·V' − m2·V2)/m1 con sus valores sustituidos. */
export function formulaCantidadMovimiento(
  m1: number,
  m2: number,
  v2Ms: number,
  vComunMs: number,
): PasoVelocidad {
  const v = cantidadMovimientoColineal(m1, m2, v2Ms, vComunMs);
  return {
    general: "V1 = ((m1 + m2) · V' − m2 · V2) / m1",
    sustituida: `V1 = ((${dato(m1)} + ${dato(m2)}) · ${dato(vComunMs)} − ${dato(m2)} · ${dato(v2Ms)}) / ${dato(m1)}`,
    intermedios: [],
    resultado: `V1 = ${cifra(v.ms, 2)} m/s = ${cifra(v.kmh, 2)} km/h`,
    calculo: v,
  };
}
