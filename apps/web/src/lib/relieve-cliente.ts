/**
 * El relieve real del lugar en el navegador (C3 y O4, W5): pide la malla a `/api/relieve` alrededor
 * del punto de impacto y la lleva al marco de la escena. Una malla por lugar: se guarda en memoria
 * mientras dure la página (la CDN guarda la respuesta de la ruta).
 */
import { puntoDeRelieve, relieveEnEscena, type LonLat, type MallaRelieve } from "@croquis/cesvi";

const pedidas = new Map<string, Promise<MallaRelieve | null>>();

/**
 * La malla de relieve de la escena cuyo origen es `origen` (lon, lat), en metros de la escena y con
 * altura 0 en el punto de impacto. null si no se pudo obtener (sin red, o un lugar sin modelo de
 * elevación): la reconstrucción va entonces en plano y lo dice.
 */
export async function relieveDelLugar(
  origen: LonLat,
  pedir: typeof fetch = fetch,
): Promise<MallaRelieve | null> {
  const p = puntoDeRelieve(origen);
  const llave = `${p.lat},${p.lon}`;
  let promesa = pedidas.get(llave);
  if (!promesa) {
    promesa = (async () => {
      try {
        const r = await pedir(`/api/relieve?lat=${p.lat}&lon=${p.lon}`);
        return r.ok ? ((await r.json()) as MallaRelieve) : null;
      } catch {
        return null;
      }
    })();
    pedidas.set(llave, promesa);
    // Un fallo no se queda guardado: la siguiente reconstrucción lo intenta otra vez.
    void promesa.then((m) => {
      if (!m) pedidas.delete(llave);
    });
  }
  const malla = await promesa;
  return malla ? relieveEnEscena(malla, origen) : null;
}
