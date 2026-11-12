/**
 * Un canal sin React para avisar el instante de «Presentar» al visor Unity (U6): Presentar avanza su
 * reloj en cada cuadro y, si cada aviso pasara por el estado de la página, todo `/cesvi` se volvería
 * a dibujar 60 veces por segundo.
 */
export class CanalTiempo {
  private oyentes = new Set<(t: number) => void>();
  private ultimo: number | null = null;

  avisar(t: number): void {
    if (t === this.ultimo) return;
    this.ultimo = t;
    for (const o of [...this.oyentes]) o(t);
  }

  /** Oye los avisos; recibe de inmediato el último, si hubo. Devuelve cómo dejar de oír. */
  oir(o: (t: number) => void): () => void {
    this.oyentes.add(o);
    if (this.ultimo !== null) o(this.ultimo);
    return () => this.oyentes.delete(o);
  }
}
