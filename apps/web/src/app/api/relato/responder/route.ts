/**
 * POST /api/relato/responder — aplica las respuestas de la persona (como dato suyo) y propone la
 * siguiente ronda de preguntas, con el solver TS.
 */
import { InvalidSpecError, ResponderIn, responderRelato } from "@/server/relato";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = ResponderIn.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Petición inválida.", detalle: parsed.error.issues },
      { status: 422 },
    );
  }
  try {
    return Response.json(responderRelato(parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof InvalidSpecError) {
      return Response.json({ error: e.message, esquema: e.errors }, { status: 422 });
    }
    throw e;
  }
}
