/**
 * Todo lo aleatorio de las texturas lleva semilla explícita (CLAUDE.md): el mismo cuadro sale igual
 * en cada render. mulberry32, 32 bits.
 */
export function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Una semilla de feTurbulence (entero) que cambia cada `cada` cuadros: el grano «vive». */
export function semillaDelCuadro(semilla: number, cuadro: number, cada = 1): number {
  return (Math.floor(cuadro / cada) * 7919 + semilla) % 10000;
}

/** De 0 a 1 entre `desde` y `hasta` cuadros, con salida suave (ease-out cúbica). */
export function avance(cuadro: number, desde: number, hasta: number): number {
  const x = Math.min(1, Math.max(0, (cuadro - desde) / Math.max(1, hasta - desde)));
  return 1 - (1 - x) ** 3;
}
