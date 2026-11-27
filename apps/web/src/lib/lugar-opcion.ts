/**
 * Una opción de «Buscar el lugar» (B5, René, 2026-11-18): la calle y la colonia, y aparte el
 * municipio y el estado, para que el perito elija la del caso en lugar de saltar a la primera.
 */
export interface OpcionLugar {
  nombre: string;
  lat: number;
  lon: number;
  municipio?: string;
  estado?: string;
  /** Cruce, calle o solo una zona (colonia, municipio): sobre una zona no se arma la escena sola. */
  precision?: "cruce" | "calle" | "zona";
}

/** «Mazatlán, Sinaloa»; sin municipio ni estado, null. */
export function zonaDeOpcion(o: OpcionLugar): string | null {
  const z = [o.municipio, o.estado].filter(
    (x, i, xs): x is string => Boolean(x) && xs.indexOf(x) === i,
  );
  return z.length ? z.join(", ") : null;
}

/** Lo que lee un lector de pantalla: «Avenida Carranza, Centro · San Luis Potosí, San Luis Potosí». */
export function etiquetaOpcion(o: OpcionLugar): string {
  const z = zonaDeOpcion(o);
  return z ? `${o.nombre} · ${z}` : o.nombre;
}
