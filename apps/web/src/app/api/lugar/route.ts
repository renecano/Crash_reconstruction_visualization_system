/**
 * GET /api/lugar?q=…&municipio=…&estado=… — busca el lugar del hecho en OpenStreetMap (A1).
 * Nominatim desde el servidor con el User-Agent de Croquis, caché y límite por cliente; Photon si
 * Nominatim no responde. La CDN de Vercel guarda la respuesta un día.
 */
import { clientKeyFrom } from "@/server/relato";
import { buscarLugar, defaultLugarDeps, LugarError, LugarIn } from "@/server/lugar";

export const runtime = "nodejs";
export const maxDuration = 30;

let deps: ReturnType<typeof defaultLugarDeps> | null = null;

export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = LugarIn.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: "Escribe el lugar (al menos 2 caracteres)." }, { status: 400 });
  }
  deps ??= defaultLugarDeps();
  try {
    const out = await buscarLugar(parsed.data, clientKeyFrom(request.headers), deps);
    return Response.json(out, {
      headers: out.resultados.length
        ? { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" }
        : { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof LugarError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
