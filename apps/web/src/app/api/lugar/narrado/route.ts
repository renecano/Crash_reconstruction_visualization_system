/**
 * POST /api/lugar/narrado — el lugar que narra el perito, con los buscadores en orden: cruce → km →
 * referencia → calle (René, 2026-11-27; #388). Devuelve qué encontró, cómo y qué tan seguro, o «No
 * encontré el lugar narrado: márcalo tú» con lo que intentó cada buscador. Nunca un punto por omisión.
 * Sin caché de la CDN: la respuesta depende de la narración completa.
 */
import { z } from "zod";
import { clientKeyFrom } from "@/server/relato";
import { defaultLugarDeps, LugarError } from "@/server/lugar";
import { buscarLugarNarrado } from "@/server/lugar-narrado";

export const runtime = "nodejs";
export const maxDuration = 60;

const Entrada = z.object({
  narracion: z.string().trim().min(10).max(20_000),
  lugar: z.string().trim().max(500).nullish(),
  municipio: z.string().trim().max(120).optional(),
  estado: z.string().trim().max(120).optional(),
});

let deps: ReturnType<typeof defaultLugarDeps> | null = null;

export async function POST(request: Request): Promise<Response> {
  const cuerpo = (await request.json().catch(() => null)) as unknown;
  const parsed = Entrada.safeParse(cuerpo);
  if (!parsed.success)
    return Response.json({ error: "Falta la narración del hecho." }, { status: 400 });
  deps ??= defaultLugarDeps();
  try {
    const out = await buscarLugarNarrado(parsed.data, clientKeyFrom(request.headers), deps);
    return Response.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof LugarError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
