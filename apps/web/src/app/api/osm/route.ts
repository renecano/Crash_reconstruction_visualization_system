/**
 * GET /api/osm?lat=…&lon=…&radio=… — calles de OpenStreetMap alrededor de un punto (ADR 0040).
 * La respuesta es la de Overpass; la CDN de Vercel la guarda (el mismo punto no vuelve a Overpass).
 */
import { clientKeyFrom } from "@/server/relato";
import { CACHE_DAYS, callesCerca, defaultOsmDeps, OsmError, OsmIn } from "@/server/osm";

export const runtime = "nodejs";
export const maxDuration = 60;

let deps: ReturnType<typeof defaultOsmDeps> | null = null;

export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = OsmIn.safeParse(params);
  if (!parsed.success) {
    return Response.json(
      { error: "Coordenadas inválidas.", detalle: parsed.error.issues },
      { status: 400 },
    );
  }
  deps ??= defaultOsmDeps();
  try {
    const r = await callesCerca(parsed.data, clientKeyFrom(request.headers), deps);
    return Response.json(r.respuesta, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DAYS * 86_400}, stale-while-revalidate=86400`,
        "X-Croquis-Cache": r.cache,
      },
    });
  } catch (e) {
    if (e instanceof OsmError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
