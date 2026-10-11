import { expect, test, type Page } from "@playwright/test";

interface Pose {
  x: number;
  y: number;
  rumbo_deg: number;
  procedencia: { fuente: string; confianza: number };
}
interface SpecLite {
  meta: { id: string };
  vehiculos: { id: string; posicion_inicial: Pose; masa?: { valor: number } }[];
}

async function readSpec(page: Page): Promise<SpecLite> {
  const text = await page.getByTestId("json").inputValue();
  return JSON.parse(text) as SpecLite;
}

test("editar en el croquis actualiza el JSON sin perder datos y sigue siendo coherente", async ({ page }) => {
  await page.goto("/croquis");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Croquis 2D");
  await expect(page.getByTestId("sin-problemas")).toBeVisible();

  const before = await readSpec(page);
  expect(before.meta.id).toBe("fx-alcance-tollocan");

  const body = page.getByTestId("vehicle-veh-a-inicial").locator("rect").first();
  const box = await body.boundingBox();
  if (!box) throw new Error("No se encontró el vehículo A");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy + 15, { steps: 8 });
  await page.mouse.up();

  const after = await readSpec(page);
  const a0 = before.vehiculos[0]!;
  const a1 = after.vehiculos[0]!;
  expect(a1.posicion_inicial.x).toBeGreaterThan(a0.posicion_inicial.x);
  expect(a1.posicion_inicial.y).toBeLessThan(a0.posicion_inicial.y);
  expect(a1.posicion_inicial.procedencia).toEqual({ fuente: "usuario", confianza: 1, nota: a0.posicion_inicial.procedencia["nota" as keyof typeof a0.posicion_inicial.procedencia] });
  expect(a1.masa).toEqual(a0.masa);
  expect(after.vehiculos[1]).toEqual(before.vehiculos[1]);
  await expect(page.getByTestId("sin-problemas")).toBeVisible();
});

test("el JSON editado a mano vuelve al croquis y los errores del contrato se muestran", async ({ page }) => {
  await page.goto("/croquis");
  await page.getByTestId("scene-select").selectOption("peaton_cruce");
  await expect(page.getByTestId("vehicle-veh-a-inicial")).toBeVisible();
  await expect(page.getByTestId("person-per-peaton-inicial")).toBeVisible();

  const spec = JSON.parse(await page.getByTestId("json").inputValue()) as { vehiculos: { posicion_inicial: Pose }[] };
  spec.vehiculos[0]!.posicion_inicial.x = -40;
  await page.getByTestId("json").fill(JSON.stringify(spec, null, 2));
  await page.getByTestId("apply-json").click();
  const moved = JSON.parse(await page.getByTestId("json").inputValue()) as { vehiculos: { posicion_inicial: Pose }[] };
  expect(moved.vehiculos[0]!.posicion_inicial.x).toBe(-40);

  await page.getByTestId("json").fill(JSON.stringify({ ...spec, meta: undefined }));
  await page.getByTestId("apply-json").click();
  await expect(page.getByTestId("json-errors")).toContainText("meta");
});
