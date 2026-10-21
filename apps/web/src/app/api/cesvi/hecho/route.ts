/**
 * POST /api/cesvi/hecho — la lectura de un texto del expediente (ADR 0055): la descripción técnica
 * del perito o la versión declarada de un conductor. Con Claude si hay llave y tope de gasto; si
 * no, o si Claude falla, con las reglas del glosario de CESVI, y lo dice. Devuelve la lectura tal
 * cual: el navegador la valida contra el texto (`validarLectura`). Es pública, como /cesvi; la
 * cuidan el tope de gasto diario y el límite de peticiones por hora.
 */
import { leerConReglas } from "@croquis/cesvi";
import { leerHecho } from "@croquis/cesvi/server";
import { LLMError } from "@croquis/extraction";
import { z } from "zod";
import { clientKeyFrom, defaultDeps, llmUnavailable } from "@/server/relato";

export const runtime = "nodejs";
export const maxDuration = 120;

const PedidoIn = z.object({
  tipo: z.enum(["descripcion", "declaracion"]),
  texto: z.string().trim().min(10).max(6000),
  vehiculos: z.object({ A: z.string().min(1).max(120), B: z.string().min(1).max(120) }),
  declarante: z.enum(["A", "B"]).optional(),
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
  const p = parsed.data;
  const conReglas = (motivo: string) =>
    Response.json(
      {
        metodo: "reglas",
        motivo,
        lectura: leerConReglas(p.texto, p.tipo, p.vehiculos, p.declarante),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  const deps = defaultDeps();
  const motivo = llmUnavailable(deps.settings);
  if (motivo) return conReglas(motivo);
  if (!(await deps.limiter.allow(clientKeyFrom(request.headers)))) {
    return conReglas("demasiadas peticiones en la última hora");
  }
  try {
    const r = await leerHecho(p, {
      modelo: deps.settings.model,
      presupuestoUsd: deps.settings.budgetUsd,
      gasto: deps.budgetStore,
      cliente: deps.client,
    });
    return Response.json({ metodo: "claude", ...r }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof LLMError) return conReglas(e.message);
    console.error("Lectura del hecho", e);
    return conReglas("Claude no respondió");
  }
}
