import type { OverpassResponse } from "@croquis/croquis-2d";

type Json = Record<string, unknown>;

/**
 * Las calles y los objetos de OpenStreetMap unos 150 m alrededor de un punto, de su API (`/map`), en el
 * formato de Overpass. La usan la batería de narraciones de Unity y la revisión de la cadena (René,
 * 2026-11-24), donde Overpass se satura; solo para pruebas a mano, no en la app.
 */
export async function osmAlrededor(lat: number, lon: number): Promise<OverpassResponse> {
  const b = [lon - 0.0016, lat - 0.0014, lon + 0.0016, lat + 0.0014]
    .map((x) => x.toFixed(5))
    .join(",");
  const r = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${b}`, {
    headers: { "User-Agent": "Croquis/0.1 (bateria del visor 3D)" },
  });
  if (!r.ok) throw new Error(`OpenStreetMap ${r.status}`);
  const xml = await r.text();
  const elementos: Json[] = [];
  const etiquetas = (cuerpo: string) =>
    Object.fromEntries(
      [...cuerpo.matchAll(/<tag k="([^"]*)" v="([^"]*)"\/>/g)].map((m) => [m[1], m[2]]),
    );
  for (const m of xml.matchAll(
    /<node id="(\d+)"[^>]*lat="([-\d.]+)" lon="([-\d.]+)"[^>]*?(\/>|>([\s\S]*?)<\/node>)/g,
  )) {
    const t = m[5] ? etiquetas(m[5]) : {};
    elementos.push({
      type: "node",
      id: Number(m[1]),
      lat: Number(m[2]),
      lon: Number(m[3]),
      ...(Object.keys(t).length ? { tags: t } : {}),
    });
  }
  for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
    const nodos = [...m[2]!.matchAll(/<nd ref="(\d+)"\/>/g)].map((n) => Number(n[1]));
    const t = etiquetas(m[2]!);
    elementos.push({
      type: "way",
      id: Number(m[1]),
      nodes: nodos,
      ...(Object.keys(t).length ? { tags: t } : {}),
    });
  }
  return { elements: elementos } as unknown as OverpassResponse;
}
