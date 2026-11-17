/**
 * Los modelos de los vehículos desde el propio sitio, sin Vercel Blob (René, 2026-11-17).
 *
 * El build de Unity trae escrita la dirección de Blob de los modelos (`recursos_visor.json`, dentro
 * del `.data`, que va comprimido: no se puede cambiar sin recompilar). Cuando el manifiesto del visor
 * dice `modelos` (la demo local y el plan B, que sirven el build desde el sitio), la página cambia esas
 * direcciones por las del sitio antes de que Unity las pida: envuelve `fetch` y `XMLHttpRequest`, que
 * son lo que usa Unity en el navegador. Lo demás pasa sin tocar.
 */
import recursos from "../../../recursos.json";

/** La carpeta de los modelos en Blob, tal como la trae escrita el build de Unity. */
export const MODELOS_EN_BLOB = `${recursos.base}/recursos/modelos/vehiculos/${recursos.carpetas["modelos/vehiculos"]}/`;

/** Cambia una dirección de los modelos en Blob por la del sitio; cualquier otra queda igual. */
export function aModelosLocales(url: string, destino: string, origen = MODELOS_EN_BLOB): string {
  return url.startsWith(origen) ? destino + url.slice(origen.length) : url;
}

let instalado: string | null = null;

/**
 * Desde ahora, toda petición de la página a los modelos en Blob va a `destino` (por ejemplo,
 * `/modelos/vehiculos/`). Se instala una sola vez; si se pide otro destino, gana el último.
 */
export function redirigirModelosA(destino: string, origen = MODELOS_EN_BLOB): void {
  if (typeof window === "undefined") return;
  const yaEstaba = instalado !== null;
  instalado = destino;
  if (yaEstaba) return;
  const cambia = (u: string) => aModelosLocales(u, instalado ?? destino, origen);

  const fetchOriginal = window.fetch.bind(window);
  window.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
    if (typeof entrada === "string") return fetchOriginal(cambia(entrada), init);
    if (entrada instanceof URL) return fetchOriginal(cambia(entrada.href), init);
    const nueva = cambia(entrada.url);
    return fetchOriginal(nueva === entrada.url ? entrada : new Request(nueva, entrada), init);
  }) as typeof window.fetch;

  const abrir = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    metodo: string,
    url: string | URL,
    ...resto: unknown[]
  ) {
    const u = typeof url === "string" ? cambia(url) : new URL(cambia(url.href));
    return (abrir as (...a: unknown[]) => void).call(this, metodo, u, ...resto);
  } as typeof XMLHttpRequest.prototype.open;
}
