import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { irAPaso } from "./ayuda-recorrido";
import { casoConPoste, recibidosDelPuente } from "./visor-unity-ayuda";

/**
 * U6, a mano (no lleva @flujo: necesita GPU y el build de Unity): el flujo completo de `/cesvi` con
 * el **Unity real** del build local (`apps/visor-unity/Build/web`), en un Chromium con ventana y
 * la GPU del equipo. Arrastra de verdad el poste en el 3D (en la vista cenital, con el ratón), espera
 * que el caso se recalcule y vuelva a Unity, toma las fotos del dictamen de Unity y abre Presentar.
 *
 *   powershell -ExecutionPolicy Bypass -File tools/unity/build-web.ps1
 *   pnpm --filter @croquis/web exec playwright test e2e/visor-unity-real.spec.ts --project=chromium --headed
 *
 * Deja capturas en `docs/cesvi/u6/real/` y lo que midió en `eval/results/u6_flujo_unity_real.json`.
 * Contra el sitio publicado (con el Unity de Blob): `playwright.produccion.config.ts`, que escribe en
 * `docs/cesvi/u6/produccion/` y `eval/results/u6_flujo_unity_produccion.json`.
 */
const RAIZ = resolve(__dirname, "../../..");
const BUILD = join(RAIZ, "apps/visor-unity/Build/web/Build");
const CAPTURAS = join(
  RAIZ,
  process.env.CROQUIS_URL ? "docs/cesvi/u6/produccion" : "docs/cesvi/u6/real",
);
const TIPOS: Record<string, string> = {
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
};

test.use({
  reducedMotion: "reduce",
  viewport: { width: 1600, height: 900 },
  launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] },
});

/** El build local en lugar del de Blob: el manifiesto apunta a una ruta que se sirve de disco. */
async function conUnityLocal(page: Page) {
  const archivos = readdirSync(BUILD);
  const de = (sufijo: string) => archivos.find((f) => f.endsWith(sufijo))!;
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });
  await page.route("**/visor-unity/manifest.json", (r) =>
    r.fulfill({
      json: {
        huella: "local",
        base: "http://localhost:3000/",
        prefijo: "unity-local/",
        loader: de(".loader.js"),
        data: de(".data"),
        framework: de(".framework.js"),
        code: de(".wasm"),
      },
    }),
  );
  await page.route("**/unity-local/Build/**", (r) => {
    const nombre = decodeURIComponent(new URL(r.request().url()).pathname.split("/").pop()!);
    const archivo = join(BUILD, nombre);
    if (!existsSync(archivo)) return r.fulfill({ status: 404 });
    return r.fulfill({
      path: archivo,
      contentType: TIPOS[extname(nombre)] ?? "application/octet-stream",
    });
  });
}

interface PuentePruebas {
  enviar(m: string, d: object): void;
  depurar(d: object): void;
  recibidos: { tipo: string; pedido?: number }[];
}

/** Dónde se ve en pantalla un punto de la escena (x este, y norte, en metros), según Unity. */
async function enPantalla(page: Page, x: number, y: number) {
  const caja = (await page.locator("#visor-unity-lienzo").boundingBox())!;
  const r = await page.evaluate(
    async ([x, y]) => {
      const puente = (window as unknown as { __croquisPuente: PuentePruebas }).__croquisPuente;
      const pedido = Math.floor(Math.random() * 1e9);
      puente.depurar({ pantalla: { x, y }, pedido });
      for (let k = 0; k < 100; k++) {
        const m = puente.recibidos.find((q) => q.tipo === "perfil" && q.pedido === pedido);
        if (m) return m as unknown as { fx: number; fy: number; visible: boolean };
        await new Promise((ok) => setTimeout(ok, 100));
      }
      return null;
    },
    [x, y] as const,
  );
  if (!r || !r.visible) throw new Error(`El punto (${x}, ${y}) no se ve en el 3D`);
  return { x: caja.x + r.fx * caja.width, y: caja.y + r.fy * caja.height };
}

test("/cesvi con el Unity real: mover el poste en 3D, fotos del dictamen y Presentar (U6)", async ({
  page,
}) => {
  test.setTimeout(600_000);
  // Con CROQUIS_URL (`playwright.produccion.config.ts`): el sitio publicado y su Unity de Blob.
  const publicado = Boolean(process.env.CROQUIS_URL);
  if (!publicado && !existsSync(BUILD))
    test.skip(true, "Falta el build local de Unity (tools/unity/build-web.ps1)");
  mkdirSync(CAPTURAS, { recursive: true });
  const medido: Record<string, unknown> = { fecha: new Date().toISOString() };
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  if (publicado) {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
    });
  } else await conUnityLocal(page);
  await casoConPoste(page);
  const cifra = page.getByTestId("cifra-reconstruccion");
  const antes = await cifra.innerText();
  medido.cifra_antes = antes;

  // El 3D: Unity real arranca, recibe el caso y queda listo.
  const t0 = Date.now();
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 240_000,
  });
  medido.unity_listo_s = (Date.now() - t0) / 1000;
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(CAPTURAS, "1-reconstruccion-unity.png") });

  // El poste, del paquete que la web le mandó a Unity.
  const cargas = (await recibidosDelPuente(page)).filter((m) => m.metodo === "cargarCaso");
  const paquete = JSON.parse(String(cargas.at(-1)!.datos.json)) as {
    resultado: { objetos: { id: string; x: number; y: number }[] };
  };
  const poste = paquete.resultado.objetos.find((o) => o.id.startsWith("obj-choque-"))!;
  medido.poste_antes = { x: poste.x, y: poste.y };

  // Editar en 3D desde la cenital: se arrastra el poste 8 m al este con el ratón.
  await page.getByTestId("editar-3d").click();
  await page.evaluate(() =>
    (window as unknown as { __croquisPuente: PuentePruebas }).__croquisPuente.enviar("camara", {
      modo: "cenital",
    }),
  );
  await page.waitForTimeout(2000);
  const desde = await enPantalla(page, poste.x, poste.y);
  const hasta = await enPantalla(page, poste.x + 8, poste.y);
  await page.mouse.move(desde.x, desde.y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++)
    await page.mouse.move(
      desde.x + ((hasta.x - desde.x) * k) / 12,
      desde.y + ((hasta.y - desde.y) * k) / 12,
    );
  await page.screenshot({ path: join(CAPTURAS, "2-arrastrando-poste.png") });
  await page.mouse.up();
  await expect(page.getByTestId("aviso-edicion-3d")).toContainText("Moviste", { timeout: 30_000 });
  await expect
    .poll(
      async () => {
        const ultima = (await recibidosDelPuente(page))
          .filter((m) => m.metodo === "cargarCaso")
          .at(-1)!;
        const p = (JSON.parse(String(ultima.datos.json)) as typeof paquete).resultado.objetos.find(
          (o) => o.id === poste.id,
        );
        return p ? Math.round(p.x - poste.x) : 0;
      },
      { timeout: 180_000 },
    )
    .toBeGreaterThan(5);
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 180_000,
  });
  await page.getByTestId("editar-3d").click();
  await expect(cifra).not.toHaveText(antes, { timeout: 180_000 });
  medido.cifra_despues = await cifra.innerText();
  await page.screenshot({ path: join(CAPTURAS, "3-poste-movido.png") });

  // Las fotos del dictamen salen de Unity: tres PNG distintos.
  await irAPaso(page, 6);
  await page.getByTestId("siguiente").click();
  await expect(page.getByTestId("panel-paso")).toHaveAttribute("data-paso", "8");
  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () =>
            (window as unknown as { __croquisCuadrosDictamen?: { imagen: string }[] })
              .__croquisCuadrosDictamen?.length ?? 0,
        )) as number,
      { timeout: 120_000 },
    )
    .toBe(3);
  const imagenes = await page.evaluate(
    () =>
      (window as unknown as { __croquisCuadrosDictamen: { etiqueta: string; imagen: string }[] })
        .__croquisCuadrosDictamen,
  );
  expect(new Set(imagenes.map((i) => i.imagen)).size).toBe(3);
  imagenes.forEach((i, k) =>
    writeFileSync(
      join(CAPTURAS, `4-foto-dictamen-${k + 1}.png`),
      Buffer.from(i.imagen.split(",")[1]!, "base64"),
    ),
  );
  medido.fotos = imagenes.map((i) => ({ etiqueta: i.etiqueta, bytes: i.imagen.length }));

  // Presentar con Unity detrás.
  await page.getByTestId("modo-presentar").click();
  await expect(page.getByTestId("presentar-caso")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-testid="visor-caso"][data-presentar="si"]')).toHaveCount(1);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(CAPTURAS, "5-presentar-unity.png") });
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(CAPTURAS, "6-presentar-impacto.png") });
  medido.errores = errores;
  writeFileSync(
    join(
      RAIZ,
      process.env.CROQUIS_URL
        ? "eval/results/u6_flujo_unity_produccion.json"
        : "eval/results/u6_flujo_unity_real.json",
    ),
    `${JSON.stringify(medido, null, 2)}\n`,
  );
  expect(errores).toEqual([]);
});
