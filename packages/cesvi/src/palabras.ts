/**
 * Un valor del contrato dicho en palabras, para los textos que lee el perito: los enumerados van
 * sin acentos y con guion bajo («de_atras_hacia_adelante», «camion_unitario»); en el dictamen se
 * escriben «de atrás hacia adelante» y «camión unitario» (auditoría del 2026-11-15, I2).
 */
const CON_ACENTO: Record<string, string> = {
  atras: "atrás",
  autobus: "autobús",
  camion: "camión",
  deformacion: "deformación",
  direccion: "dirección",
  guarnicion: "guarnición",
  impregnacion: "impregnación",
  incorporacion: "incorporación",
  interseccion: "intersección",
  linea: "línea",
  microbus: "microbús",
  peaton: "peatón",
  posicion: "posición",
  proyeccion: "proyección",
  semaforo: "semáforo",
  tractocamion: "tractocamión",
  vehiculo: "vehículo",
};

export function enPalabras(valor: string): string {
  return valor
    .split("_")
    .map((p) => CON_ACENTO[p] ?? p)
    .join(" ");
}
