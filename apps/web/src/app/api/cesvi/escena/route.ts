/**
 * POST /api/cesvi/escena — la narración técnica del perito leída a escena (R1, ADR 0061): las filas
 * que devuelve Claude, tal cual; el navegador arma la escena y revisa cada cita contra el texto
 * (`escenaDeNarracion`). Sin llave, sin tope de gasto o si Claude falla, lo dice y el perito llena la
 * escena a mano. Es pública, como /cesvi; la cuidan el tope de gasto diario y el límite por hora.
 */
import { leerEscena } from "@croquis/cesvi/server";
import { LLMError } from "@croquis/extraction";
import { z } from "zod";
import { clientKeyFrom, defaultDeps, llmUnavailable } from "@/server/relato";

export const runtime = "nodejs";
export const maxDuration = 120;

const PedidoIn = z.object({
  texto: z.string().trim().min(20).max(12000),
  /** Relectura (R12b, ADR 0093): las citas que el Verificador de citas no encontró. */
  rechazadas: z.array(z.string().max(600)).max(40).optional(),
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
  const deps = defaultDeps();
  const motivo = llmUnavailable(deps.settings);
  if (motivo) return sinLectura(motivo);
  if (!(await deps.limiter.allow(clientKeyFrom(request.headers)))) {
    return sinLectura("demasiadas peticiones en la última hora");
  }
  try {
    const r = await leerEscena(parsed.data.texto, {
      modelo: deps.settings.model,
      presupuestoUsd: deps.settings.budgetUsd,
      gasto: deps.budgetStore,
      cliente: deps.client,
      rechazadas: parsed.data.rechazadas,
    });
    return Response.json({ metodo: "claude", ...r }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof LLMError) return sinLectura(e.message);
    console.error("Lectura de la escena", e);
    return sinLectura("Claude no respondió");
  }
}
