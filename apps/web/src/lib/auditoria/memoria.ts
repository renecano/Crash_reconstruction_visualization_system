/**
 * Cuántos casos de la revisión de la cadena corre cada proceso según la memoria libre (René,
 * 2026-11-26: en la laptop de 8 GB la revisión de los 205 + 42 se quedó sin memoria con un navegador
 * abierto). Cada tanda es un proceso nuevo (`eval/auditoria_por_tandas.mts`), así lo que acumula un
 * proceso se libera entre tandas; y antes de cada caso se mira la memoria otra vez.
 */

/** Por debajo de esto no se empieza un caso: se espera a que se libere memoria. */
export const MINIMO_LIBRE_MB = 700;

/** Los casos de una tanda: menos cuanto menos memoria libre; 0 = esperar. */
export function casosPorTanda(libreMB: number): number {
  if (!(libreMB >= MINIMO_LIBRE_MB)) return 0;
  if (libreMB < 1200) return 5;
  if (libreMB < 2000) return 15;
  return 40;
}

/** ¿Alcanza la memoria para empezar otro caso? */
export const hayMemoriaParaUnCaso = (libreMB: number) => libreMB >= MINIMO_LIBRE_MB;

/**
 * Espera a que haya memoria para un caso, mirando cada `cadaMs`, hasta `topeMs`. true si la hay; false
 * si se acabó el tiempo (el que llama se detiene y la corrida se retoma donde quedó).
 */
export async function esperarMemoria(
  libreMB: () => number,
  o: { cadaMs?: number; topeMs?: number; dormir?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  const cada = o.cadaMs ?? 15_000;
  const tope = o.topeMs ?? 120_000;
  const dormir = o.dormir ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  for (let t = 0; ; t += cada) {
    if (hayMemoriaParaUnCaso(libreMB())) return true;
    if (t >= tope) return false;
    await dormir(cada);
  }
}
