/**
 * GET /api/version — el commit que sirve este despliegue (René, 2026-11-05). El flujo
 * «Producción = main» lo compara con el último commit de main después de cada merge.
 * Es estático: el valor se fija en el build y cada despliegue tiene el suyo.
 */
export const dynamic = "force-static";

export function GET(): Response {
  return Response.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    entorno: process.env.VERCEL_ENV ?? "local",
  });
}
