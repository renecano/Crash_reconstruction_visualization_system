/**
 * La cámara del tráiler sobre la hoja: una sola para todas las escenas de papel, de la vista cenital
 * del croquis al vuelo a ras de la hoja. El mundo va en metros, con la hoja en z = 0, el este en +x y
 * el norte en +y (como el `Resultado`). La pantalla, en píxeles, con el origen arriba a la izquierda.
 */

export interface Camara {
  /** El punto de la hoja que queda en el centro de la pantalla (m). */
  x: number;
  y: number;
  /** A qué distancia está la cámara de ese punto (m). */
  dist: number;
  /** Cuánto mira hacia abajo, en radianes: π/2 es cenital; cerca de 0, a ras de la hoja. */
  inclinacion: number;
  /** Hacia dónde mira sobre la hoja, en radianes desde el este, en sentido antihorario (π/2 = norte). */
  giro: number;
  /** La distancia focal, en veces el lado menor de la pantalla. */
  focal: number;
}

export interface Pantalla {
  ancho: number;
  alto: number;
}

export interface PuntoEnPantalla {
  x: number;
  y: number;
  /** La distancia a la cámara a lo largo de su eje (m): para atenuar con la lejanía. */
  prof: number;
}

/** Lo más cerca de la cámara que se dibuja (m). */
const CERCA = 0.05;

export interface Proyector {
  /** Un punto del mundo en la pantalla, o `null` si queda detrás de la cámara. */
  punto(x: number, y: number, z?: number): PuntoEnPantalla | null;
  /** Un segmento del mundo, recortado contra el plano cercano; `null` si no se ve nada. */
  segmento(
    a: readonly [number, number, number?],
    b: readonly [number, number, number?],
  ): [PuntoEnPantalla, PuntoEnPantalla] | null;
  /** Cuántos píxeles mide un metro de la hoja a esa profundidad. */
  pxPorMetro(prof: number): number;
  /** La altura en pantalla del horizonte, o `null` en una vista casi cenital. */
  horizonte: number | null;
  /** Dónde está la cámara (m). */
  ojo: readonly [number, number, number];
}

/** El proyector de una cámara en una pantalla. */
export function proyector(c: Camara, p: Pantalla): Proyector {
  const gx = Math.cos(c.giro);
  const gy = Math.sin(c.giro);
  const cp = Math.cos(c.inclinacion);
  const sp = Math.sin(c.inclinacion);
  // Hacia adelante, a la derecha y hacia arriba de la cámara.
  const f = [gx * cp, gy * cp, -sp] as const;
  const r = [gy, -gx, 0] as const;
  const u = [gx * sp, gy * sp, cp] as const;
  const ojo = [c.x - f[0] * c.dist, c.y - f[1] * c.dist, -f[2] * c.dist] as const;
  const F = c.focal * Math.min(p.ancho, p.alto);

  const enCamara = (x: number, y: number, z: number) => {
    const dx = x - ojo[0];
    const dy = y - ojo[1];
    const dz = z - ojo[2];
    return [
      dx * r[0] + dy * r[1] + dz * r[2],
      dx * u[0] + dy * u[1] + dz * u[2],
      dx * f[0] + dy * f[1] + dz * f[2],
    ] as const;
  };
  const aPantalla = (q: readonly [number, number, number]): PuntoEnPantalla => ({
    x: p.ancho / 2 + (q[0] / q[2]) * F,
    y: p.alto / 2 - (q[1] / q[2]) * F,
    prof: q[2],
  });

  return {
    punto(x, y, z = 0) {
      const q = enCamara(x, y, z);
      return q[2] < CERCA ? null : aPantalla(q);
    },
    segmento(a, b) {
      let qa = enCamara(a[0], a[1], a[2] ?? 0);
      let qb = enCamara(b[0], b[1], b[2] ?? 0);
      if (qa[2] < CERCA && qb[2] < CERCA) return null;
      const corta = (
        dentro: readonly [number, number, number],
        fuera: readonly [number, number, number],
      ) => {
        const t = (CERCA - fuera[2]) / (dentro[2] - fuera[2]);
        return [
          fuera[0] + (dentro[0] - fuera[0]) * t,
          fuera[1] + (dentro[1] - fuera[1]) * t,
          CERCA,
        ] as const;
      };
      if (qa[2] < CERCA) qa = corta(qb, qa);
      else if (qb[2] < CERCA) qb = corta(qa, qb);
      return [aPantalla(qa), aPantalla(qb)];
    },
    pxPorMetro: (prof) => F / Math.max(CERCA, prof),
    horizonte: cp < 0.02 ? null : p.alto / 2 - (sp / cp) * F,
    ojo,
  };
}

/** Mezcla dos cámaras (el giro, por el camino corto). */
export function mezclaCamaras(a: Camara, b: Camara, t: number): Camara {
  const m = (x: number, y: number) => x + (y - x) * t;
  let dg = (b.giro - a.giro) % (Math.PI * 2);
  if (dg > Math.PI) dg -= Math.PI * 2;
  if (dg < -Math.PI) dg += Math.PI * 2;
  return {
    x: m(a.x, b.x),
    y: m(a.y, b.y),
    // La distancia se mezcla en logaritmo: un acercamiento se siente parejo.
    dist: Math.exp(m(Math.log(a.dist), Math.log(b.dist))),
    inclinacion: m(a.inclinacion, b.inclinacion),
    giro: a.giro + dg * t,
    focal: m(a.focal, b.focal),
  };
}
