/**
 * GET /api/version — el commit que sirve este despliegue (René, 2026-11-05). El flujo
 * «Producción = main» lo compara con el último commit de main después de cada merge.
 * Es estático: el valor se fija en el build y cada despliegue tiene el suyo.
 *
 * También dice el tope de gasto diario de Claude y el límite por hora con que quedó el despliegue
 * (René, 2026-11-15): Vercel aplica un cambio de variable en el siguiente despliegue, y así se
 * confirma sin gastar API. No dice la llave ni si está puesta.
 */
import { settingsFromEnv } from "@/server/relato";

export const dynamic = "force-static";

export function GET(): Response {
  const s = settingsFromEnv();
  return Response.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    entorno: process.env.VERCEL_ENV ?? "local",
    claude: {
      tope_diario_usd: s.budgetUsd,
      limite_por_hora: s.rateLimitPerHour,
    },
  });
}
