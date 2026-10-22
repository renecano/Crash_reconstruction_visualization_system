/**
 * Las dos versiones del croquis sobre el mapa (Hito 2, docs/cesvi/PROTOTIPO.md): la declarada por
 * el conductor de A y la de la evidencia. Croquis las propone a partir del punto de impacto que
 * marca el perito y del rumbo de la vía de OSM; el perito mueve, gira y marca todo después, y cada
 * posición guarda su fuente.
 *
 * Solo se usa lo que dice el dictamen: el impacto es en la parte posterior de A y el frente de B;
 * en la versión de la evidencia, A termina a D (la separación de los restos) del punto de impacto;
 * en la declarada, A estaba detenido, retrocede «unos metros» y no hay desplazamiento después del
 * impacto. Lo que el dictamen no da (posiciones iniciales en la versión de la evidencia, la final
 * de B, cuántos metros son «unos metros») queda marcado como supuesto para que el perito lo fije.
 */
import { avanzar, distanciaM, rumboDeg, type LonLat } from "./geo";

export type Fase = "inicial" | "impacto" | "final";
export const FASES: readonly Fase[] = ["inicial", "impacto", "final"];
export type Fuente = "dictamen" | "croquis" | "perito";

export interface Pose {
  punto: [number, number];
  /** Rumbo del frente del vehículo, en grados desde el norte (horario). */
  rumbo: number;
  fuente: Fuente;
}

export interface Medidas {
  largo: number;
  ancho: number;
}

export type ClaveVersion = "declarada" | "evidencia";

export interface VersionCroquis {
  clave: ClaveVersion;
  titulo: string;
  descripcion: string;
  vehiculos: Record<"A" | "B", Record<Fase, Pose>>;
  impacto: { punto: [number, number]; fuente: Fuente };
  /** Zona de restos: inicio y fin. En la declarada coinciden (no hay desplazamiento). */
  restos: { inicio: [number, number]; fin: [number, number]; fuente: Fuente };
  /** Lo que se dibujó sin que el dictamen lo diga; el perito lo debe fijar. */
  supuestos: string[];
}

export interface ParametrosVersiones {
  /** Punto de impacto que marca el perito en el mapa. */
  impacto: LonLat;
  /** Rumbo de la vía en el sentido en que circulaba A según la evidencia (sur a norte en el caso). */
  rumboVia: number;
  /** El mismo rumbo según la declaración, si dice otro sentido (ADR 0055); si no, `rumboVia`. */
  rumboDeclarada?: number;
  medidas: Record<"A" | "B", Medidas>;
  /** Separación de los restos (m): de dónde termina A en la versión de la evidencia. */
  distanciaRestos: number;
  /** De dónde sale esa separación: la descripción del perito o el dictamen. */
  fuenteRestos?: Fuente;
  /** Cuántos metros retrocede A en la versión declarada («unos metros»: no lo precisa). */
  reversaM: number;
}

/** De un rumbo de la vía (en cualquiera de sus dos sentidos), el que apunta más hacia el norte. */
export function rumboHaciaElNorte(rumbo: number): number {
  const r = ((rumbo % 360) + 360) % 360;
  return r > 90 && r < 270 ? (r + 180) % 360 : r;
}

const pose = (punto: [number, number], rumbo: number, fuente: Fuente): Pose => ({
  punto,
  rumbo,
  fuente,
});

export function proponerVersiones(p: ParametrosVersiones): Record<ClaveVersion, VersionCroquis> {
  const r = p.rumboVia;
  const x: [number, number] = [p.impacto[0], p.impacto[1]];
  // En el impacto, la parte posterior de A y el frente de B están en el punto de impacto.
  const aImpacto = avanzar(x, r, p.medidas.A.largo / 2);
  const bImpacto = avanzar(x, r, -p.medidas.B.largo / 2);
  const finRestos = avanzar(x, r, p.distanciaRestos);
  // De dónde viene B: el dictamen no lo da; se dibuja dos largos atrás para que se vea llegar.
  const bInicial = avanzar(bImpacto, r, -2 * p.medidas.B.largo);
  const fr = p.fuenteRestos ?? "dictamen";
  const rd = p.rumboDeclarada ?? r;
  const aImpactoD = avanzar(x, rd, p.medidas.A.largo / 2);
  const bImpactoD = avanzar(x, rd, -p.medidas.B.largo / 2);
  const bInicialD = avanzar(bImpactoD, rd, -2 * p.medidas.B.largo);

  const evidencia: VersionCroquis = {
    clave: "evidencia",
    titulo: "Reconstrucción de Croquis",
    descripcion:
      "Alcance de B a A: los restos se extienden desde el punto de impacto hasta la posición final de A.",
    impacto: { punto: x, fuente: "perito" },
    vehiculos: {
      A: {
        inicial: pose(aImpacto, r, "croquis"),
        impacto: pose(aImpacto, r, "croquis"),
        final: pose(avanzar(aImpacto, r, p.distanciaRestos), r, fr),
      },
      B: {
        inicial: pose(bInicial, r, "croquis"),
        impacto: pose(bImpacto, r, "croquis"),
        final: pose(bImpacto, r, "croquis"),
      },
    },
    restos: { inicio: x, fin: finRestos, fuente: fr },
    supuestos: [
      "El dictamen no da las posiciones iniciales: A se dibuja en el impacto y B dos largos atrás, para que el perito las marque.",
      "El dictamen no da la posición final de B: se dibuja en el impacto.",
    ],
  };

  const declarada: VersionCroquis = {
    clave: "declarada",
    titulo: "Versión declarada",
    descripcion:
      "A se detiene, retrocede unos metros y B lo impacta; sin desplazamiento después del impacto, los restos quedarían donde terminan los vehículos.",
    impacto: { punto: x, fuente: "perito" },
    vehiculos: {
      A: {
        inicial: pose(avanzar(aImpactoD, rd, p.reversaM), rd, "croquis"),
        impacto: pose(aImpactoD, rd, "croquis"),
        final: pose(aImpactoD, rd, "croquis"),
      },
      B: {
        inicial: pose(bInicialD, rd, "croquis"),
        impacto: pose(bImpactoD, rd, "croquis"),
        final: pose(bImpactoD, rd, "croquis"),
      },
    },
    restos: { inicio: x, fin: x, fuente: "croquis" },
    supuestos: [
      `La declaración dice «unos metros»: la reversa se dibuja con ${p.reversaM} m, que el perito ajusta.`,
      "La declaración no dice dónde estaba B antes del impacto: se dibuja dos largos atrás.",
    ],
  };

  return { declarada, evidencia };
}

/** Cambia una pose (la mueve o la gira el perito): su fuente pasa a «perito». */
export function moverPose(
  v: VersionCroquis,
  vehiculo: "A" | "B",
  fase: Fase,
  cambio: Partial<Pick<Pose, "punto" | "rumbo">>,
): VersionCroquis {
  const actual = v.vehiculos[vehiculo][fase];
  return {
    ...v,
    vehiculos: {
      ...v.vehiculos,
      [vehiculo]: {
        ...v.vehiculos[vehiculo],
        [fase]: { ...actual, ...cambio, fuente: "perito" },
      },
    },
  };
}

/**
 * Mueve el punto de impacto y, con él, todo lo demás (ADR 0055): cada posición, la zona de restos
 * y el impacto se trasladan al punto nuevo y giran `giro` grados alrededor de él (para seguir el
 * rumbo de la vía nueva). Las distancias y los ángulos entre posiciones no cambian.
 */
export function trasladarVersion(v: VersionCroquis, nuevo: LonLat, giro = 0): VersionCroquis {
  const origen = v.impacto.punto;
  const lleva = (q: [number, number]): [number, number] => {
    const d = distanciaM(origen, q);
    return d < 1e-6 ? [nuevo[0], nuevo[1]] : avanzar(nuevo, rumboDeg(origen, q) + giro, d);
  };
  const gira = (r: number) => (((r + giro) % 360) + 360) % 360;
  const vehiculo = (poses: Record<Fase, Pose>): Record<Fase, Pose> =>
    Object.fromEntries(
      FASES.map((f) => [
        f,
        { ...poses[f], punto: lleva(poses[f].punto), rumbo: gira(poses[f].rumbo) },
      ]),
    ) as Record<Fase, Pose>;
  return {
    ...v,
    impacto: { punto: [nuevo[0], nuevo[1]], fuente: "perito" },
    vehiculos: { A: vehiculo(v.vehiculos.A), B: vehiculo(v.vehiculos.B) },
    restos: { ...v.restos, inicio: lleva(v.restos.inicio), fin: lleva(v.restos.fin) },
  };
}

/**
 * Cuánto girar al pasar de una vía con rumbo `antes` a una con rumbo `despues`: el giro más chico,
 * sin voltear el sentido de circulación (una vía se puede leer en sus dos sentidos).
 */
export function giroEntreVias(antes: number, despues: number): number {
  let g = (((despues - antes) % 180) + 180) % 180;
  if (g > 90) g -= 180;
  return g;
}

/**
 * Cuándo queda en reposo cada vehículo en la animación, de 0 (inicio) a 1 (fin), con el impacto en
 * 0.5 (ADR 0057). Sin velocidades en el croquis, se supone la misma desaceleración para los dos: el
 * tiempo de frenado va con la raíz de lo que se desplaza después del impacto (d = a·t²/2). El que
 * más se desplaza termina en 1. Es un tiempo relativo, no segundos del hecho.
 */
export function tiemposDeReposo(v: VersionCroquis): Record<"A" | "B", number> {
  const d = (l: "A" | "B") => distanciaM(v.vehiculos[l].impacto.punto, v.vehiculos[l].final.punto);
  const max = Math.max(d("A"), d("B"));
  const t = (l: "A" | "B") => (max < 0.05 ? 0.5 : 0.5 + 0.5 * Math.sqrt(d(l) / max));
  return { A: t("A"), B: t("B") };
}

export interface EventoLinea {
  t: number;
  etiqueta: string;
}

/** Los eventos de la línea de tiempo: aproximación, impacto y el reposo de cada vehículo. */
export function eventosDeLinea(v: VersionCroquis): EventoLinea[] {
  const r = tiemposDeReposo(v);
  const reposos: EventoLinea[] =
    Math.abs(r.A - r.B) < 0.02
      ? [{ t: Math.max(r.A, r.B), etiqueta: "Reposo de A y B" }]
      : (["A", "B"] as const)
          .map((l) => ({ t: r[l], etiqueta: `Reposo de ${l}` }))
          .sort((a, b) => a.t - b.t);
  return [{ t: 0, etiqueta: "Aproximación" }, { t: 0.5, etiqueta: "Impacto" }, ...reposos];
}

/**
 * La pose de un vehículo en el instante t∈[0,1]: de la inicial al impacto (hasta 0.5) y del
 * impacto a la final, desacelerando, hasta su reposo (`tiemposDeReposo`).
 */
export function poseEnInstante(v: VersionCroquis, letra: "A" | "B", t: number): Pose {
  const p = v.vehiculos[letra];
  const fin = tiemposDeReposo(v)[letra];
  const tramo = (a: Pose, b: Pose, f: number): Pose => {
    const d = distanciaM(a.punto, b.punto);
    const punto: [number, number] =
      d > 0 ? avanzar(a.punto, rumboDeg(a.punto, b.punto), d * f) : [a.punto[0], a.punto[1]];
    return { punto, rumbo: a.rumbo + (b.rumbo - a.rumbo) * f, fuente: a.fuente };
  };
  if (t <= 0.5) {
    const x = t / 0.5;
    return tramo(p.inicial, p.impacto, x * x * (3 - 2 * x));
  }
  if (t >= fin || fin <= 0.5) return p.final;
  const x = (t - 0.5) / (fin - 0.5);
  return tramo(p.impacto, p.final, 1 - (1 - x) * (1 - x));
}
