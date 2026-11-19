import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { contestarC1, irAPaso, mapaFacil } from "./ayuda-recorrido";

/**
 * El recorrido de la app para el material promocional (René, 2026-11-13; no lleva @flujo y no corre
 * en CI): en el sitio publicado, con el Unity real en calidad alta, a 2560×1440 con
 * deviceScaleFactor 2 (`playwright.promo.config.ts`), de día y de noche. Una captura PNG por paso en
 * `CROQUIS_PROMO` (fuera del repo): AXA completo y un caso nuevo desde cero con la narración de
 * ejemplo de la app (sin datos personales; la lee Claude por `/api/cesvi/escena`).
 *
 * No cambia nada del caso: no firma el dictamen ni guarda.
 */
const SALIDA = process.env.CROQUIS_PROMO ?? join(__dirname, "../../../trailer-salida/recorrido");

/**
 * Sin avisos en pantalla (René, 2026-11-18): se cierra todo mensaje que tenga su «Cerrar» (como el
 * de las calles que no llegaron) antes de cada captura.
 */
async function sinAvisos(page: Page) {
  for (let k = 0; k < 4; k++) {
    const cerrar = page.locator('button[aria-label="Cerrar el mensaje"]:visible');
    if (!(await cerrar.count())) return;
    await cerrar.first().click();
    await page.waitForTimeout(400);
  }
}

/** La pestaña 2D de Reconstrucción, asentada. */
async function vista2d(page: Page) {
  await page.getByTestId("vista-maqueta").first().click();
  await quieta(page, 4000);
}

/** Que la página termine de entrar y de calcular antes de cada captura. */
async function quieta(page: Page, extra = 2500) {
  await page.waitForTimeout(extra);
  await expect(page.getByTestId("maqueta-calculando")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId("presentar-calculando")).toHaveCount(0, { timeout: 120_000 });
}

/** El 3D con Unity, listo y asentado. */
async function unityListo(page: Page) {
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 300_000,
  });
  await page.waitForTimeout(6000);
}

/** La cámara «Detrás de …» del 3D (la que sigue al vehículo de la cifra), si el caso la tiene. */
async function masCerca(page: Page) {
  const detras = page.getByTestId("vista-detras");
  if (!(await detras.count())) return;
  await detras.click();
  await page.waitForTimeout(6000);
}

function preparar(page: Page, tema: "claro" | "oscuro") {
  return Promise.all([
    page.emulateMedia({ colorScheme: tema === "claro" ? "light" : "dark" }),
    page.addInitScript((t) => {
      const w = window as unknown as Record<string, unknown>;
      w.__croquisVisorUnity = true;
      try {
        localStorage.setItem("croquis.cesvi.tema.trabajar", t);
        localStorage.setItem("croquis.cesvi.tema.presentar", t);
      } catch {
        // Sin almacenamiento, el tema sale del sistema (emulado arriba).
      }
    }, tema),
  ]);
}

for (const [luz, tema] of [
  ["dia", "claro"],
  ["noche", "oscuro"],
] as const) {
  test(`AXA completo (${luz})`, async ({ page }) => {
    const dir = join(SALIDA, luz, "axa");
    mkdirSync(dir, { recursive: true });
    const foto = async (nombre: string) => {
      await sinAvisos(page);
      writeFileSync(join(dir, `${nombre}.png`), await page.screenshot());
    };
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await preparar(page, tema);

    await page.goto("/cesvi?calidad=alta");
    await quieta(page);
    await foto("01-casos");
    await page.getByTestId("ir-axa").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await page.goto(`${page.url().split("?")[0]}?calidad=alta`);
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();

    await irAPaso(page, 2);
    await quieta(page);
    await foto("02-el-hecho");

    await irAPaso(page, 3);
    await expect(page.getByTestId("escena-lista")).toBeVisible({ timeout: 60_000 });
    await quieta(page);
    await foto("03-la-escena");

    await irAPaso(page, 4);
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 180_000 });
    await expect(page.getByTestId("panel-paso").getByTestId("hipotesis")).toBeVisible({
      timeout: 180_000,
    });
    await quieta(page, 4000);
    await foto("04-reconstruccion-numeros");
    await unityListo(page);
    await foto("05-reconstruccion-unity");
    await masCerca(page);
    await foto("05-reconstruccion-unity-detras");
    await vista2d(page);
    await foto("05-reconstruccion-2d");

    await irAPaso(page, 5);
    await quieta(page);
    await foto("05-versiones");
    await irAPaso(page, 6);
    await quieta(page);
    await foto("06-los-danos");
    await irAPaso(page, 7);
    await quieta(page);
    await foto("07-los-numeros");
    await irAPaso(page, 8);
    await quieta(page);
    await foto("08-contra-cesvi");

    await irAPaso(page, 9);
    // Las fotos del 3D del dictamen salen de Unity al abrirlo: se esperan, con tope.
    await expect
      .poll(
        async () =>
          (await page.evaluate(
            () =>
              (window as unknown as { __croquisCuadrosDictamen?: unknown[] })
                .__croquisCuadrosDictamen?.length ?? 0,
          )) as number,
        { timeout: 240_000 },
      )
      .toBeGreaterThanOrEqual(3)
      .catch(() => undefined);
    await quieta(page, 5000);
    await foto("09-dictamen");
    const imagenes = await page.evaluate(
      () =>
        (window as unknown as { __croquisCuadrosDictamen?: { etiqueta: string; imagen: string }[] })
          .__croquisCuadrosDictamen ?? [],
    );
    imagenes.forEach((i, k) =>
      writeFileSync(
        join(dir, `10-dictamen-foto-${k + 1}.png`),
        Buffer.from(i.imagen.split(",")[1]!, "base64"),
      ),
    );

    await page.getByTestId("modo-presentar").click();
    await expect(page.getByTestId("presentar-caso")).toBeVisible({ timeout: 60_000 });
    await quieta(page, 7000);
    await foto("11-presentar-1");
    for (let k = 2; k <= 4; k++) {
      await page.keyboard.press("ArrowRight");
      await quieta(page, 6000);
      await foto(`11-presentar-${k}`);
    }
    expect(errores).toEqual([]);
  });

  test(`un caso nuevo desde cero (${luz})`, async ({ page }) => {
    const dir = join(SALIDA, luz, "caso-nuevo");
    mkdirSync(dir, { recursive: true });
    const foto = async (nombre: string) => {
      await sinAvisos(page);
      writeFileSync(join(dir, `${nombre}.png`), await page.screenshot());
    };
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await preparar(page, tema);

    await page.goto("/cesvi?calidad=alta");
    await page.getByTestId("ir-caso-nuevo").click();
    await expect(page.getByTestId("recorrido-caso")).toHaveAttribute("data-origen", "nuevo");
    await irAPaso(page, 2);
    // La narración de ejemplo de la app: un caso inventado, sin datos personales.
    await page.getByTestId("ejemplo-narracion").click();
    await quieta(page);
    await foto("01-narracion");
    await page.getByTestId("leer-narracion").click();
    // La lectura llega con su resumen («2 vehículos · …») y las citas del texto.
    await expect(page.getByTestId("escena")).toContainText("vehículos", { timeout: 180_000 });
    await quieta(page, 4000);
    await foto("02-lectura-con-citas");

    await irAPaso(page, 3);
    const mapa = await mapaFacil(page);
    const pregunta = page.getByTestId("escena-pregunta");
    const lista = page.getByTestId("escena-lista");
    await page.waitForTimeout(5000);
    await foto("03-escena-primera-pregunta");
    let n = 4;
    for (let k = 0; k < 20; k++) {
      if (await lista.isVisible()) break;
      const texto = (await pregunta.textContent()) ?? "";
      if (/^¿Dónde fue/.test(texto)) {
        const caja = (await mapa.boundingBox())!;
        await mapa.click({ position: { x: caja.width * 0.55 + k * 14, y: caja.height * 0.5 } });
      } else if (texto.startsWith("¿Por dónde")) {
        const propuesta = page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]');
        await (
          (await propuesta.count()) ? propuesta.first() : page.getByTestId("opcion-flecha-0")
        ).click();
      } else if (texto.startsWith("¿Dónde quedó")) {
        await page.getByTestId("final-junto").click();
        await page.getByTestId("listo-final").click();
      } else {
        await contestarC1(page);
        continue;
      }
      await expect
        .poll(async () => (await lista.isVisible()) || (await pregunta.textContent()) !== texto)
        .toBe(true);
      if (n < 7 && !(await lista.isVisible())) {
        await page.waitForTimeout(1500);
        await foto(`0${n}-escena-pregunta`);
        n++;
      }
    }
    await expect(lista).toBeVisible();
    await quieta(page);
    await foto("07-escena-lista");

    await irAPaso(page, 4);
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 180_000 });
    // La receta deja a los dos «junto al choque»: la app avisa que quedaron encimados y ofrece
    // separarlos. Para el set promo se usa esa misma acción, y se espera el nuevo cálculo.
    const separar = page.getByRole("button", { name: "Separarlos" });
    if (await separar.isVisible().catch(() => false)) {
      await separar.click();
      await expect(separar).toBeHidden({ timeout: 180_000 });
      await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 180_000 });
    }
    await quieta(page, 5000);
    await foto("08-resultado");
    await unityListo(page);
    await foto("09-resultado-unity");
    await masCerca(page);
    await foto("09-resultado-unity-detras");
    await vista2d(page);
    await foto("09-resultado-2d");
    await irAPaso(page, 5);
    await quieta(page);
    await foto("10-versiones");
    await irAPaso(page, 6);
    await quieta(page);
    await foto("11-los-danos");
    await irAPaso(page, 7);
    await quieta(page);
    await foto("12-los-numeros");
    // Un caso nuevo no tiene reporte de CESVI: de los números pasa al dictamen.
    await irAPaso(page, 9);
    await quieta(page, 8000);
    await foto("14-dictamen");
    expect(errores).toEqual([]);
  });
}
