/**
 * POST /api/cesvi/importar — un dictamen subido por el perito, leído con Claude (R5, ADR 0068): la
 * lectura de C0 (el expediente con la cita de cada dato) y la de R0 (la narración sin conclusiones y
 * lo que concluyó CESVI), tal cual. El navegador arma el expediente y revisa cada cita contra el
 * texto (`importarDictamen`). Sin llave, sin tope de gasto o si Claude falla, lo dice. El texto no se
 * guarda. Es pública, como /cesvi; la cuidan el tope de gasto diario y el límite por hora.
 */
import { leerDictamenImportado } from "@croquis/cesvi/server";
import { LLMError } from "@croquis/extraction";
import { z } from "zod";
import { clientKeyFrom, defaultDeps, llmUnavailable } from "@/server/relato";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Un dictamen largo de CESVI cabe holgado: el más largo del corpus tiene 76,701 caracteres. */
const PedidoIn = z.object({ texto: z.string().trim().min(200).max(200_000) });

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
    const r = await leerDictamenImportado(parsed.data.texto, {
      modelo: deps.settings.model,
      presupuestoUsd: deps.settings.budgetUsd,
      gasto: deps.budgetStore,
      cliente: deps.client,
    });
    return Response.json({ metodo: "claude", ...r }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof LLMError) return sinLectura(e.message);
    console.error("Importación del dictamen", e);
    return sinLectura("Claude no respondió");
  }
}
