/**
 * Un canal sin React: quien publica avisa y quien oye recibe, sin pasar por el estado de la página
 * (un reloj que avanza en cada cuadro la volvería a dibujar entera 60 veces por segundo). Quien
 * empieza a oír recibe de inmediato lo último que se avisó.
 */
export class Canal<T> {
  private oyentes = new Set<(x: T) => void>();
  private ultimo: { x: T } | null = null;

  avisar(x: T): void {
    this.ultimo = { x };
    for (const o of [...this.oyentes]) o(x);
  }

  oir(o: (x: T) => void): () => void {
    this.oyentes.add(o);
    if (this.ultimo) o(this.ultimo.x);
    return () => this.oyentes.delete(o);
  }
}
