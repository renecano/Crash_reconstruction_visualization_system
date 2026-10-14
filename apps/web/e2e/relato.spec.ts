import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Playwright corre desde apps/web.
const spec = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "../../packages/scene-schema/fixtures/glorieta.json"),
    "utf-8",
  ),
) as { meta: { id: string } };

test("relato: redacta en el navegador, pregunta y abre la escena en el croquis", async ({
  page,
}) => {
  const enviados: string[] = [];
  // La API se simula: CI no llama servicios externos y esta prueba mira la web.
  await page.route("**/relato/extraer", async (route) => {
    const body = route.request().postDataJSON() as { texto: string };
    enviados.push(body.texto);
    await route.fulfill({
      json: {
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
      },
    });
  });
  await page.route("**/relato/responder", async (route) => {
    await route.fulfill({ json: { spec, aplicadas: ["estado_superficie"], preguntas: [] } });
  });

  await page.goto("/");
  await page.getByRole("link", { name: "Contar qué pasó" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tu relato");

  await page
    .getByTestId("relato")
    .fill("Me llamo Ana López, tel 722 123 4567. Se me cerró una camioneta y le pegué por detrás.");
  await expect(page.getByTestId("texto-redactado")).toHaveText(
    "Me llamo [NOMBRE], tel [TELEFONO]. Se me cerró una camioneta y le pegué por detrás.",
  );
  await page.getByTestId("entender").click();
  await expect(page.getByTestId("hechos")).toBeVisible();
  expect(enviados[0]).not.toContain("Ana");
  expect(enviados[0]).not.toContain("722 123 4567");

  await page.getByRole("radio", { name: "mojado" }).click();
  await page.getByTestId("responder").click();
  await expect(page.getByTestId("sin-preguntas")).toBeVisible();
  await expect(page.getByRole("note")).toContainText("No es un peritaje");

  await page.getByTestId("abrir-croquis").click();
  await expect(page).toHaveURL(/\/croquis\?fuente=relato/);
  await expect(page.getByTestId("escena-relato")).toBeVisible();
  const json = JSON.parse(await page.getByTestId("json").inputValue()) as { meta: { id: string } };
  expect(json.meta.id).toBe(spec.meta.id);
});
