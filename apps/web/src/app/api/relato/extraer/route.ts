/**
 * POST /api/relato/extraer — del relato (ya redactado en el navegador) a una EscenaSpec con la
 * primera ronda de preguntas. Responde con NDJSON en streaming: `inicio`, `progreso` mientras
 * Claude escribe y `resultado` (o `error`). El streaming mantiene viva la conexión y deja ver el
 * avance (Vercel lo recomienda para respuestas largas sobre HTTP/1.1).
 */
import { clientKeyFrom, defaultDeps, ExtraerIn, extraerEventos } from "@/server/relato";

export const runtime = "nodejs";
// Claude tarda segundos (p95 de E1 alrededor de 15 s) y la ronda de preguntas reconstruye la
// escena decenas de veces; el plan Hobby de Vercel permite hasta 300 s con Fluid compute.
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = ExtraerIn.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Petición inválida.", detalle: parsed.error.issues },
      { status: 422 },
    );
  }
  const deps = defaultDeps();
  const key = clientKeyFrom(request.headers);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of extraerEventos(parsed.data, key, deps)) {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        }
      } catch (e) {
        console.error("Extracción del relato", e);
        const ev = { tipo: "error", mensaje: "No se pudo procesar el relato en el servidor." };
        controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
