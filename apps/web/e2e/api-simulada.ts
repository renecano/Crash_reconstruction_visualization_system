import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

/**
 * Las rutas del relato, simuladas: las pruebas e2e miran la web (las Route Handlers tienen sus
 * propias pruebas) y CI nunca llama a la API de Claude. La extracción responde en NDJSON (inicio y
 * resultado), como la Route Handler, con la escena de la glorieta y una pregunta.
 */
// Playwright corre desde apps/web.
export const SPEC_GLORIETA = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "../../packages/scene-schema/fixtures/glorieta.json"),
    "utf-8",
  ),
) as { meta: { id: string } };

/** Simula `/api/relato/extraer` y `/api/relato/responder`; devuelve los textos que llegaron. */
export async function simularApi(page: Page): Promise<string[]> {
  const enviados: string[] = [];
  const spec = SPEC_GLORIETA;
  await page.route("**/api/relato/extraer", async (route) => {
    const body = route.request().postDataJSON() as { texto: string };
    enviados.push(body.texto);
    const datos = {
      spec,
      texto: body.texto,
      metodo: "reglas",
      motivo: null,
      redacciones_servidor: 0,
      verificador: { revisados: 12, corregidos: 0, degradados: 0 },
      glosario: [],
      preguntas: [
        {
          id: "estado_superficie",
          texto: "¿El piso estaba seco o mojado?",
          motivo: "sensibilidad",
          campo: "lugar.estado_superficie",
          opciones: ["seco", "mojado", "encharcado"],
        },
      ],
    };
    const eventos = [
      { tipo: "inicio", metodo: "reglas" },
      { tipo: "resultado", datos },
    ];
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: eventos.map((ev) => JSON.stringify(ev)).join(String.fromCharCode(10)),
    });
  });
  await page.route("**/api/relato/responder", async (route) => {
    await route.fulfill({ json: { spec, aplicadas: ["estado_superficie"], preguntas: [] } });
  });
  return enviados;
}
