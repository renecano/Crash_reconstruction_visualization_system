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
import { limitadorDe, rechazoDePedido } from "@/server/pedido";
import { clientKeyFrom, defaultDeps, llmUnavailable } from "@/server/relato";
import { MAX_REPORTE, MIN_REPORTE } from "@/lib/lectura-reporte";
import { textoParaClaude } from "@/lib/redaccion";

export const runtime = "nodejs";
export const maxDuration = 300;

/** El tamaño que acepta es el mismo que dice la pantalla (`lectura-reporte.ts`). */
const PedidoIn = z.object({ texto: z.string().trim().min(MIN_REPORTE).max(MAX_REPORTE) });

const sinLectura = (motivo: string) =>
  Response.json({ metodo: "no_disponible", motivo }, { headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const rechazo = rechazoDePedido(request);
  if (rechazo) return rechazo;
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
  if (!(await limitadorDe(deps, "importar").allow(clientKeyFrom(request.headers)))) {
    return sinLectura("demasiadas peticiones en la última hora");
  }
  try {
    // Sin datos personales hacia Claude (PLAN §10); el navegador revisa las citas contra el mismo
    // texto redactado.
    const r = await leerDictamenImportado(textoParaClaude(parsed.data.texto), {
      modelo: deps.settings.model,
      presupuestoUsd: deps.settings.budgetUsd,
      gasto: deps.budgetStore,
      cliente: deps.client,
    });
    return Response.json({ metodo: "claude", ...r }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof LLMError) return sinLectura(e.message);
    console.error("Importación del reporte", e);
    return sinLectura("Claude no respondió");
  }
}
