/**
 * El acto de Análisis en el rediseño «Laboratorio» (prompt §8): el perfil de deformación dibujado
 * con las C reales, la barra de rango de cada supuesto y el contador de criterios marcados.
 */
import type { CriterioMarcado, SupuestoDeclarado } from "@croquis/cesvi";

export interface PerfilDibujado {
  /** El contorno lleno del hundimiento, del borde izquierdo de la cara al derecho. */
  d: string;
  /** Cada medida: dónde cae sobre la cara y qué tan adentro llega. */
  puntos: { x: number; y: number; cm: number; nombre: string }[];
}

/**
 * El perfil de deformación sobre la cara dañada: la cara es la línea `y = base` de `x0` a
 * `x0 + ancho`, y el hundimiento sube hacia el vehículo. Es una gráfica, no un dibujo a escala: la
 * profundidad va proporcional a C (`alto` es lo que mide el mayor valor, con un mínimo de 30 cm en
 * el eje, para que una abolladura chica se vea chica).
 */
export function perfilDeformacion(
  cCm: readonly number[],
  { x0, ancho, base, alto }: { x0: number; ancho: number; base: number; alto: number },
): PerfilDibujado {
  const n = cCm.length;
  if (!n) return { d: "", puntos: [] };
  const tope = Math.max(30, ...cCm);
  const puntos = cCm.map((cm, i) => ({
    x: n === 1 ? x0 + ancho / 2 : x0 + (ancho * i) / (n - 1),
    y: base - (cm / tope) * alto,
    cm,
    nombre: `C${i + 1}`,
  }));
  const f = (v: number) => Number(v.toFixed(2));
  // La curva pasa por cada medida (Catmull-Rom a Bézier, sin rebasar la base).
  const curva = puntos.slice(1).map((p, k) => {
    const p1 = puntos[k]!;
    const p0 = puntos[k - 1] ?? p1;
    const p3 = puntos[k + 2] ?? p;
    const c1y = Math.min(base, p1.y + (p.y - p0.y) / 6);
    const c2y = Math.min(base, p.y - (p3.y - p1.y) / 6);
    const c1x = p1.x + (p.x - p0.x) / 6;
    const c2x = p.x - (p3.x - p1.x) / 6;
    return `C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p.x)} ${f(p.y)}`;
  });
  const ini = puntos[0]!;
  const fin = puntos.at(-1)!;
  const d =
    n === 1
      ? `M ${f(x0)} ${f(base)} L ${f(ini.x)} ${f(ini.y)} L ${f(x0 + ancho)} ${f(base)} Z`
      : `M ${f(ini.x)} ${f(base)} L ${f(ini.x)} ${f(ini.y)} ${curva.join(" ")} L ${f(fin.x)} ${f(base)} Z`;
  return { d, puntos };
}

export interface BarraDeRango {
  /** Dónde empieza el rango y cuánto mide, en % de la pista. */
  izq: number;
  ancho: number;
  /** Dónde cae el valor, en % de la pista. */
  marca: number;
}

/** La barra de un supuesto: el rango ocupa el centro de la pista, con un quinto de holgura a cada lado. */
export function barraDeRango(min: number, max: number, valor: number): BarraDeRango | null {
  if (!(max > min)) return null;
  const holgura = (max - min) / 5;
  const ini = min - holgura;
  const total = max + holgura - ini;
  const pct = (x: number) => Number((((x - ini) / total) * 100).toFixed(2));
  return { izq: pct(min), ancho: Number((pct(max) - pct(min)).toFixed(2)), marca: pct(valor) };
}

/** «1 de 2 criterios marcados». */
export function contadorCriterios(valores: Record<string, CriterioMarcado>): string {
  const todos = Object.values(valores);
  const hechos = todos.filter((c) => c.marca !== null).length;
  return `${hechos} de ${todos.length} ${todos.length === 1 ? "criterio marcado" : "criterios marcados"}`;
}

/**
 * Los supuestos para sus tarjetas: cada vehículo con su letra («Masa de A») y las posiciones
 * iniciales iguales en una sola («Posición inicial de A y B · 12 m antes»).
 */
export function supuestosParaTarjetas(
  supuestos: readonly SupuestoDeclarado[],
  letraDe: (id: string) => string,
): SupuestoDeclarado[] {
  const conLetra = supuestos.map((s) =>
    s.vehiculo ? { ...s, que: s.que.replace(String(s.vehiculo), letraDe(String(s.vehiculo))) } : s,
  );
  const inicios = conLetra.filter((s) => s.clave.startsWith("inicio-"));
  if (inicios.length < 2) return conLetra;
  const corta = (v: string) => v.match(/^\d+(\.\d+)?\s*m antes/)?.[0] ?? v;
  const valores = new Set(inicios.map((s) => corta(s.valor)));
  if (valores.size > 1) return conLetra;
  const letras = inicios.map((s) => letraDe(String(s.vehiculo))).sort();
  const unida: SupuestoDeclarado = {
    ...inicios[0]!,
    clave: "inicio",
    que: `Posición inicial de ${letras.slice(0, -1).join(", ")} y ${letras.at(-1)}`,
    valor: corta(inicios[0]!.valor),
    vehiculo: undefined,
  };
  const pos = conLetra.indexOf(inicios[0]!);
  const resto = conLetra.filter((s) => !s.clave.startsWith("inicio-"));
  resto.splice(pos, 0, unida);
  return resto;
}
