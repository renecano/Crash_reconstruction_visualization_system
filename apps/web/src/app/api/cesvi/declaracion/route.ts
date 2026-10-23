/**
 * POST /api/cesvi/declaracion — la declaración de un conductor leída con los vehículos del caso
 * (R7, ADR 0070): las filas que devuelve Claude, tal cual; el navegador revisa cada cita contra el
 * texto (`versionDeclarada`). Es un complemento opcional: sin llave, sin tope de gasto o si Claude
 * falla, lo dice. La cuidan el tope de gasto diario y el límite por hora.
 */
import { leerDeclaracion } from "@croquis/cesvi/server";
import { LLMError } from "@croquis/extraction";
import { z } from "zod";
import { clientKeyFrom, defaultDeps, llmUnavailable } from "@/server/relato";

export const runtime = "nodejs";
export const maxDuration = 120;

const Id = z.enum(["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"]);
const PedidoIn = z.object({
  texto: z.string().trim().min(20).max(12000),
  vehiculos: z
    .array(z.object({ id: Id, descripcion: z.string().trim().min(1).max(200) }))
    .min(1)
    .max(8),
  declarante: Id,
});

const sinLectura = (motivo: string) =>
  Response.json({ metodo: "no_disponible", motivo }, { headers: { "Cache-Control": "no-store" } });

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
  const { texto, vehiculos, declarante } = parsed.data;
  if (!vehiculos.some((v) => v.id === declarante)) {
    return Response.json({ error: "El declarante no es un vehículo del caso." }, { status: 422 });
  }
  const deps = defaultDeps();
  const motivo = llmUnavailable(deps.settings);
  if (motivo) return sinLectura(motivo);
  if (!(await deps.limiter.allow(clientKeyFrom(request.headers)))) {
    return sinLectura("demasiadas peticiones en la última hora");
  }
  try {
    const r = await leerDeclaracion(texto, vehiculos, declarante, {
      modelo: deps.settings.model,
      presupuestoUsd: deps.settings.budgetUsd,
      gasto: deps.budgetStore,
      cliente: deps.client,
    });
    return Response.json({ metodo: "claude", ...r }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof LLMError) return sinLectura(e.message);
    console.error("Lectura de la declaración", e);
    return sinLectura("Claude no respondió");
  }
}
