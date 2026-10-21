/**
 * El método de cálculo de los dictámenes de CESVI (docs/cesvi/PROTOTIPO.md, ADR 0048): energía de
 * deformación de McHenry con 2, 4 o 6 medidas, velocidad equivalente de barrera (EBS), velocidad por
 * desplazamiento y la comparación entre velocidades.
 *
 * Las fórmulas de 2, 4 y 6 medidas son la integral de McHenry, ∫ (A·C + ½·B·C² + A²/2B) dL, con C
 * lineal entre medidas equiespaciadas: cada tramo de ancho L/(n−1) aporta
 * A/2·(Ci + Ci+1) + B/6·(Ci² + Ci·Ci+1 + Ci+1²) + A²/2B. Sumando los tramos sale la forma de libro:
 * los extremos cuentan una vez y las medidas interiores, dos. La de 6 medidas que imprimen los
 * dictámenes tiene erratas evidentes (2·C6 en lugar de C6, 2·C6² en lugar de C6², y C2·C3·C3·C4 en
 * lugar de C2·C3 + C3·C4); aquí va la forma de libro, y el ADR 0048 lo documenta.
 *
 * Las unidades son las que use el perito, siempre que sean consistentes: con A en kN/m, B en kN/m²
 * y C y L en m, la energía sale en kJ, y con la masa en toneladas la EBS sale en m/s (así lo hace el
 * dictamen A2010930).
 */

export interface MedicionDeformacion {
  /** Ancho de la zona deformada (m). */
  L: number;
  /** Coeficiente de rigidez A. */
  A: number;
  /** Coeficiente de rigidez B. */
  B: number;
  /** Profundidades de deformación equiespaciadas (m): 2, 4 o 6 medidas. */
  C: readonly number[];
}

export interface ResultadoMcHenry {
  medidas: number;
  /** Σ de las C con su peso: C1 + 2·C2 + … + 2·Cn−1 + Cn. */
  sumaLineal: number;
  /** Σ de los cuadrados con su peso más los productos de medidas vecinas. */
  sumaCuadratica: number;
  terminoA: number;
  terminoB: number;
  /** (n−1)·A²/2B. */
  terminoUmbral: number;
  /** Energía de deformación, en las unidades de A·L·C (kJ con A en kN/m). */
  energia: number;
}

export const MEDIDAS_PERMITIDAS = [2, 4, 6] as const;

/** Energía de deformación de McHenry con medidas equiespaciadas (forma de libro). */
export function mcHenry({ L, A, B, C }: MedicionDeformacion): ResultadoMcHenry {
  const n = C.length;
  if (!(MEDIDAS_PERMITIDAS as readonly number[]).includes(n)) {
    throw new Error(`El método usa 2, 4 o 6 medidas; llegaron ${n}`);
  }
  if (!(L > 0)) throw new Error("L debe ser positivo");
  if (!(B > 0)) throw new Error("B debe ser positivo");
  if (!(A >= 0)) throw new Error("A no puede ser negativo");
  if (C.some((c) => !(c >= 0))) throw new Error("Las profundidades C no pueden ser negativas");
  let sumaLineal = 0;
  let sumaCuadratica = 0;
  C.forEach((c, i) => {
    const peso = i === 0 || i === n - 1 ? 1 : 2;
    sumaLineal += peso * c;
    sumaCuadratica += peso * c * c;
    if (i < n - 1) sumaCuadratica += c * C[i + 1]!;
  });
  const terminoA = (A / 2) * sumaLineal;
  const terminoB = (B / 6) * sumaCuadratica;
  const terminoUmbral = ((n - 1) * A * A) / (2 * B);
  const energia = (L / (n - 1)) * (terminoA + terminoB + terminoUmbral);
  return { medidas: n, sumaLineal, sumaCuadratica, terminoA, terminoB, terminoUmbral, energia };
}

export interface Velocidad {
  ms: number;
  kmh: number;
}

const kmh = (ms: number): number => ms * 3.6;

/** EBS = √(2·E/m): la velocidad contra una barrera fija que absorbe la energía E. */
export function ebs(energia: number, masa: number): Velocidad {
  if (!(energia >= 0)) throw new Error("La energía no puede ser negativa");
  if (!(masa > 0)) throw new Error("La masa debe ser positiva");
  const ms = Math.sqrt((2 * energia) / masa);
  return { ms, kmh: kmh(ms) };
}

/** Velocidad por desplazamiento: V = √(2·a·g·D). */
export function velocidadDesplazamiento(a: number, g: number, D: number): Velocidad {
  if (!(a > 0) || !(g > 0)) throw new Error("La adherencia y la gravedad deben ser positivas");
  if (!(D >= 0)) throw new Error("La distancia no puede ser negativa");
  const ms = Math.sqrt(2 * a * g * D);
  return { ms, kmh: kmh(ms) };
}

export interface ComparacionVelocidades {
  diferenciaKmh: number;
  /** |v1 − v2| respecto a la mayor de las dos, en %. */
  diferenciaPct: number;
  umbralPct: number;
  significativa: boolean;
}

/**
 * ¿Las dos velocidades difieren de forma significativa? El dictamen no fija el criterio: el umbral
 * lo decide el perito (`UMBRAL_INICIAL_PCT` es solo el valor con que abre la página).
 */
export function compararVelocidades(
  v1Kmh: number,
  v2Kmh: number,
  umbralPct: number,
): ComparacionVelocidades {
  if (!(umbralPct >= 0)) throw new Error("El umbral no puede ser negativo");
  const diferenciaKmh = Math.abs(v1Kmh - v2Kmh);
  const mayor = Math.max(Math.abs(v1Kmh), Math.abs(v2Kmh));
  const diferenciaPct = mayor === 0 ? 0 : (100 * diferenciaKmh) / mayor;
  return { diferenciaKmh, diferenciaPct, umbralPct, significativa: diferenciaPct > umbralPct };
}

/** Valor con que abre la página; no es un criterio de CESVI y el perito lo cambia. */
export const UMBRAL_INICIAL_PCT = 10;
