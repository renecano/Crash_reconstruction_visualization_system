/**
 * POST /api/cesvi/consideraciones — borrador de las consideraciones del dictamen con Claude
 * (Hito 3, ADR 0051). Recibe los hechos que ya calculó el módulo de cálculo y lo que marcó el
 * perito; devuelve el texto como borrador y los números que no venían en los datos. Es pública, como
 * /cesvi; la cuidan el tope de gasto diario y el límite de peticiones por hora.
 */
import { redactarConsideraciones } from "@croquis/cesvi/server";
import { LLMError } from "@croquis/extraction";
import { z } from "zod";
import { clientKeyFrom, defaultDeps, llmUnavailable } from "@/server/relato";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_HECHOS = 20_000;

const PedidoIn = z.object({
  hechos: z
    .object({ caso: z.string().min(1).max(40) })
    .catchall(z.unknown())
    .refine((h) => JSON.stringify(h).length <= MAX_HECHOS, "Los hechos son demasiado largos."),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = PedidoIn.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Petición inválida.", detalle: parsed.error.issues },
      { status: 422 },
    );
  }
  const deps = defaultDeps();
  const motivo = llmUnavailable(deps.settings);
  if (motivo) {
    return Response.json(
      { error: `No se puede redactar el borrador: ${motivo}.` },
      { status: 503 },
    );
  }
  if (!(await deps.limiter.allow(clientKeyFrom(request.headers)))) {
    return Response.json(
      { error: "Demasiadas peticiones en la última hora; intenta más tarde." },
      { status: 429 },
    );
  }
  try {
    const borrador = await redactarConsideraciones(parsed.data.hechos, {
      modelo: deps.settings.model,
      presupuestoUsd: deps.settings.budgetUsd,
      gasto: deps.budgetStore,
      cliente: deps.client,
    });
    return Response.json(borrador, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof LLMError) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    console.error("Borrador de consideraciones", e);
    return Response.json({ error: "No se pudo redactar el borrador." }, { status: 500 });
  }
}
