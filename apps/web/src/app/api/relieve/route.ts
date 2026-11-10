/**
 * GET /api/relieve?lat=…&lon=…&lado_m=600 — la malla de relieve alrededor del punto de impacto, con
 * la forma de `caso3d.relieve` (C3 y O4, W5). Sale del LiDAR de terreno del INEGI donde lo hay y,
 * donde no, de Copernicus GLO-30 o de SRTM; ver `@/server/relieve` para las fuentes, sus licencias
 * y lo que no alcanzan a ver. El relieve de un lugar no cambia: la CDN de Vercel guarda la respuesta
 * un año.
 */
import { armarRelieve, defaultRelieveDeps, RelieveError, RelieveIn } from "@/server/relieve";

export const runtime = "nodejs";
export const maxDuration = 30;

let deps: ReturnType<typeof defaultRelieveDeps> | null = null;

export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = RelieveIn.safeParse(params);
  if (!parsed.success) {
    return Response.json(
      { error: "Indica la latitud y la longitud del punto (lat, lon)." },
      { status: 400 },
    );
  }
  deps ??= defaultRelieveDeps();
  try {
    const relieve = await armarRelieve(parsed.data, deps);
    return Response.json(relieve, {
      headers: { "Cache-Control": "public, s-maxage=31536000, stale-while-revalidate=86400" },
    });
  } catch (e) {
    if (e instanceof RelieveError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
