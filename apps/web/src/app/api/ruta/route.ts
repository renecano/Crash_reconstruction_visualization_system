/**
 * GET /api/ruta?desde_lat=…&desde_lon=…&hasta_lat=…&hasta_lon=… — la ruta por las calles del trayecto
 * previo ilustrativo (`server/ruta.ts`, ADR 0147). No entra a ninguna cifra.
 */
import { clientKeyFrom } from "@/server/relato";
import { CACHE_DIAS_RUTA, defaultRutaDeps, RutaError, RutaIn, rutaPorCalles } from "@/server/ruta";

export const runtime = "nodejs";
export const maxDuration = 30;

let deps: ReturnType<typeof defaultRutaDeps> | null = null;

export async function GET(request: Request): Promise<Response> {
  const parsed = RutaIn.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success)
    return Response.json(
      { error: "Coordenadas inválidas.", detalle: parsed.error.issues },
      { status: 400 },
    );
  deps ??= defaultRutaDeps();
  try {
    const r = await rutaPorCalles(parsed.data, clientKeyFrom(request.headers), deps);
    return Response.json(r, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DIAS_RUTA * 86_400}, stale-while-revalidate=86400`,
      },
    });
  } catch (e) {
    if (e instanceof RutaError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
