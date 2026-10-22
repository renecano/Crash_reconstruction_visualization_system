/**
 * Los demás cálculos que aparecen en los reportes de CESVI (docs/cesvi/PLAN-CESVI.md, C1; ADR
 * 0059), además de McHenry, EBS y desplazamiento (`metodo.ts`). Cada función es la fórmula de libro
 * que imprimen los dictámenes; no hay factores de ajuste. Las unidades son SI (m, kg, s, J) salvo
 * que el nombre diga otra cosa, y las velocidades salen en m/s y km/h.
 */
import type { Velocidad } from "./metodo";

const enKmh = (ms: number): Velocidad => ({ ms, kmh: ms * 3.6 });
const positivo = (x: number, nombre: string) => {
  if (!(x > 0)) throw new Error(`${nombre} debe ser positivo`);
};
const noNegativo = (x: number, nombre: string) => {
  if (!(x >= 0)) throw new Error(`${nombre} no puede ser negativo`);
};

/**
 * Velocidad al inicio de una huella de frenado: V = √(Vf² + 2·μ·g·d). Con Vf = 0 (el vehículo se
 * detiene al final de la huella) es √(2·μ·g·d).
 */
export function frenadoHuellas(mu: number, g: number, d: number, vFinalMs = 0): Velocidad {
  positivo(mu, "El coeficiente de fricción");
  positivo(g, "La gravedad");
  noNegativo(d, "La longitud de la huella");
  noNegativo(vFinalMs, "La velocidad final");
  return enKmh(Math.sqrt(vFinalMs * vFinalMs + 2 * mu * g * d));
}

/**
 * Velocidad crítica en una curva: la mayor con la que el vehículo la recorre sin derrapar.
 * Sin peralte, V = √(μ·g·R); con peralte e = tan θ, V = √(g·R·(μ + e)/(1 − μ·e)).
 */
export function velocidadCriticaCurva(mu: number, g: number, R: number, peralte = 0): Velocidad {
  positivo(mu, "El coeficiente de fricción");
  positivo(g, "La gravedad");
  positivo(R, "El radio");
  const den = 1 - mu * peralte;
  if (!(den > 0)) throw new Error("Con ese peralte y esa fricción no hay velocidad crítica");
  return enKmh(Math.sqrt((g * R * (mu + peralte)) / den));
}

/** Radio de una curva por la cuerda C y la flecha M medidas en el lugar: R = C²/(8·M) + M/2. */
export function radioCurva(cuerda: number, flecha: number): number {
  positivo(cuerda, "La cuerda");
  positivo(flecha, "La flecha");
  return (cuerda * cuerda) / (8 * flecha) + flecha / 2;
}

/**
 * Tiro parabólico desde un desnivel: el vehículo sale horizontal, cae una altura h y recorre una
 * distancia horizontal d. V = d·√(g/(2·h)).
 */
export function tiroParabolico(d: number, h: number, g: number): Velocidad {
  noNegativo(d, "La distancia");
  positivo(h, "La altura de caída");
  positivo(g, "La gravedad");
  return enKmh(d * Math.sqrt(g / (2 * h)));
}

/** Trabajo de la fricción al arrastrarse una distancia d: E = μ·m·g·d (J con m en kg). */
export function trabajoFriccion(mu: number, m: number, g: number, d: number): number {
  positivo(mu, "El coeficiente de fricción");
  positivo(m, "La masa");
  positivo(g, "La gravedad");
  noNegativo(d, "La distancia");
  return mu * m * g * d;
}

/** Velocidad que corresponde a una energía cinética: V = √(2·E/m). */
export function velocidadPorEnergia(E: number, m: number): Velocidad {
  noNegativo(E, "La energía");
  positivo(m, "La masa");
  return enKmh(Math.sqrt((2 * E) / m));
}

/** Suma de energías en cuadratura: la velocidad de un vehículo que disipa varias energías. */
export function velocidadPorEnergias(energias: readonly number[], m: number): Velocidad {
  return velocidadPorEnergia(
    energias.reduce((s, e) => {
      noNegativo(e, "Cada energía");
      return s + e;
    }, 0),
    m,
  );
}

/**
 * Cantidad de movimiento en una colisión colineal, con los vehículos que siguen juntos después del
 * impacto (choque plástico): m1·V1 + m2·V2 = (m1 + m2)·V'. Despeja V1 con V2 y V' conocidas.
 */
export function cantidadMovimientoColineal(
  m1: number,
  m2: number,
  v2Ms: number,
  vComunMs: number,
): Velocidad {
  positivo(m1, "La masa 1");
  positivo(m2, "La masa 2");
  return enKmh(((m1 + m2) * vComunMs - m2 * v2Ms) / m1);
}

export interface Vector {
  /** Rapidez (m/s). */
  v: number;
  /** Dirección (grados, en el mismo marco para todos). */
  angulo: number;
}

/**
 * Cantidad de movimiento en el plano: con las direcciones de entrada de los dos vehículos y sus
 * velocidades de salida (rapidez y dirección), despeja las dos rapideces de entrada de
 * m1·V1 + m2·V2 = m1·U1 + m2·U2, componente por componente.
 */
export function cantidadMovimientoPlano(
  m1: number,
  m2: number,
  anguloEntrada1: number,
  anguloEntrada2: number,
  salida1: Vector,
  salida2: Vector,
): [Velocidad, Velocidad] {
  positivo(m1, "La masa 1");
  positivo(m2, "La masa 2");
  const rad = (g: number) => (g * Math.PI) / 180;
  const px =
    m1 * salida1.v * Math.cos(rad(salida1.angulo)) + m2 * salida2.v * Math.cos(rad(salida2.angulo));
  const py =
    m1 * salida1.v * Math.sin(rad(salida1.angulo)) + m2 * salida2.v * Math.sin(rad(salida2.angulo));
  const [c1, s1, c2, s2] = [
    Math.cos(rad(anguloEntrada1)),
    Math.sin(rad(anguloEntrada1)),
    Math.cos(rad(anguloEntrada2)),
    Math.sin(rad(anguloEntrada2)),
  ];
  const det = c1 * s2 - s1 * c2;
  if (Math.abs(det) < 1e-9) {
    throw new Error(
      "Con direcciones de entrada paralelas, el sistema en el plano no tiene solución única",
    );
  }
  const v1 = (px * s2 - py * c2) / (m1 * det);
  const v2 = (py * c1 - px * s1) / (m2 * det);
  return [enKmh(v1), enKmh(v2)];
}

export interface ComparacionUmbral {
  valor: number;
  umbral: number;
  /** valor − umbral, en las unidades del umbral. */
  diferencia: number;
  /** (valor − umbral)/umbral, en %. */
  diferenciaPct: number;
  supera: boolean;
}

/**
 * Compara un valor calculado con un umbral o una referencia que cita el dictamen (la velocidad de
 * activación de las bolsas de aire, la de una prueba de choque). El umbral viene de la cita; aquí no
 * se fija ninguno.
 */
export function compararConUmbral(valor: number, umbral: number): ComparacionUmbral {
  positivo(umbral, "El umbral");
  const diferencia = valor - umbral;
  return {
    valor,
    umbral,
    diferencia,
    diferenciaPct: (100 * diferencia) / umbral,
    supera: valor > umbral,
  };
}

/**
 * Frenado de una combinación en la que solo frena parte de la masa (p. ej. el tractocamión que
 * arrastra un remolque sin frenos): la desaceleración es μ·g·m_frena/m_total, y
 * V = √(2·μ·g·d·m_frena/m_total).
 */
export function frenadoConArrastre(
  mu: number,
  g: number,
  d: number,
  masaQueFrena: number,
  masaTotal: number,
): Velocidad {
  positivo(masaQueFrena, "La masa que frena");
  positivo(masaTotal, "La masa total");
  return frenadoHuellas((mu * masaQueFrena) / masaTotal, g, d);
}

/** Energía cinética: E = ½·m·V² (J con m en kg y V en m/s). */
export function energiaCinetica(m: number, vMs: number): number {
  positivo(m, "La masa");
  return 0.5 * m * vMs * vMs;
}

/** Tiempo de caída libre desde una altura H: t = √(2·H/g). */
export function tiempoCaida(H: number, g: number): number {
  noNegativo(H, "La altura");
  positivo(g, "La gravedad");
  return Math.sqrt((2 * H) / g);
}

/** Fuerza centrípeta en una curva de radio R: F = m·V²/R. */
export function fuerzaCentripeta(m: number, vMs: number, R: number): number {
  positivo(m, "La masa");
  positivo(R, "El radio");
  return (m * vMs * vMs) / R;
}

/**
 * Velocidad a la que un vehículo vuelca en una curva de radio R: el momento de la fuerza centrípeta
 * en la altura del centro de masa h iguala el del peso en la media vía d (m·V²/R·h = m·g·d), de
 * donde V = √(g·d·R/h).
 */
export function velocidadVolcadura(g: number, d: number, R: number, h: number): Velocidad {
  positivo(g, "La gravedad");
  positivo(d, "La media vía");
  positivo(R, "El radio");
  positivo(h, "La altura del centro de masa");
  return enKmh(Math.sqrt((g * d * R) / h));
}

/**
 * Fricción equivalente de un derrape lateral: el coeficiente μ por el promedio de los senos de los
 * ángulos que forma el vehículo con su trayectoria en n puntos de la huella, μ' = μ·Σ sen θi / n.
 */
export function friccionEquivalente(mu: number, sumaSenos: number, n: number): number {
  positivo(mu, "El coeficiente de fricción");
  positivo(n, "El número de puntos");
  noNegativo(sumaSenos, "La suma de senos");
  return (mu * sumaSenos) / n;
}

/**
 * Velocidad crítica en curva como la escriben los reportes de CESVI:
 * V = 11.27·√(R·(tan α + μ)) en km/h, que es √(g·R·(μ + e)) con g = 9.8 m/s² (11.27 = 3.6·√9.8).
 * Es la forma de peralte pequeño: omite el denominador 1 − μ·e de `velocidadCriticaCurva`.
 */
export function velocidadCriticaCurvaCesvi(
  mu: number,
  g: number,
  R: number,
  peralte = 0,
): Velocidad {
  positivo(mu, "El coeficiente de fricción");
  positivo(g, "La gravedad");
  positivo(R, "El radio");
  const k = mu + peralte;
  if (!(k > 0)) throw new Error("Con ese peralte y esa fricción no hay velocidad crítica");
  return enKmh(Math.sqrt(g * R * k));
}

/** Distancia recorrida durante la percepción y la reacción: D = V·(t_reacción + t_acción). */
export function distanciaReaccion(vMs: number, tReaccion: number, tAccion: number): number {
  noNegativo(vMs, "La velocidad");
  noNegativo(tReaccion, "El tiempo de reacción");
  noNegativo(tAccion, "El tiempo de acción");
  return vMs * (tReaccion + tAccion);
}

/** Distancia para detenerse desde V con desaceleración a·g: D = V²/(2·a·g). */
export function distanciaDeFrenado(vMs: number, a: number, g: number): number {
  positivo(a, "La adherencia");
  positivo(g, "La gravedad");
  return (vMs * vMs) / (2 * a * g);
}

/** Distancia que se arrastra un cuerpo de masa m al disipar la energía E por fricción: E/(μ·m·g). */
export function distanciaPorEnergia(E: number, mu: number, m: number, g: number): number {
  noNegativo(E, "La energía");
  positivo(mu, "El coeficiente de fricción");
  positivo(m, "La masa");
  positivo(g, "La gravedad");
  return E / (mu * m * g);
}

/**
 * Velocidad común después de un choque plástico. Colineal: (m1·V1 + m2·V2)/(m1 + m2).
 * Perpendicular: √((m1·V1)² + (m2·V2)²)/(m1 + m2).
 */
export function velocidadComun(
  m1: number,
  v1Ms: number,
  m2: number,
  v2Ms: number,
  perpendicular = false,
): Velocidad {
  positivo(m1, "La masa 1");
  positivo(m2, "La masa 2");
  const p = perpendicular ? Math.hypot(m1 * v1Ms, m2 * v2Ms) : m1 * v1Ms + m2 * v2Ms;
  return enKmh(p / (m1 + m2));
}
