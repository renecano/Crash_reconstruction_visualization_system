import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VISOR_PUENTE_VERSION } from "@croquis/scene-schema";
import { expect, test, type Page } from "@playwright/test";
import { irAPaso } from "./ayuda-recorrido";
import { casoConPoste } from "./visor-unity-ayuda";

/**
 * U6: el visor Unity en `/cesvi`, con un Unity de mentira (`unity-falso.js`) que habla el puente:
 * CI no baja el build de 70 MB ni tiene GPU. Lo que se prueba es la web: arrancar, mandar el caso,
 * mover un objeto en el 3D y que el caso se recalcule y vuelva a Unity, las fotos del dictamen
 * desde Unity y el respaldo three.js cuando Unity no sirve. El Unity real se revisa a mano en
 * producción (`docs/progress/U.md`, U6).
 */
test.use({ reducedMotion: "reduce" });

const FALSO = readFileSync(join(__dirname, "unity-falso.js"), "utf8");

interface Recibido {
  metodo: string;
  datos: Record<string, unknown>;
}

async function conUnityFalso(page: Page, version: string) {
  await page.addInitScript(
    ([v]) => {
      (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
      (window as unknown as Record<string, unknown>).__unityFalsoVersion = v;
    },
    [version],
  );
  await page.route("**/visor-unity/manifest.json", (r) =>
    r.fulfill({
      json: {
        huella: "e2e",
        base: "http://localhost:3000/",
        prefijo: "unity-falso/",
        loader: "cargador.js",
        data: "x.data",
        framework: "x.framework.js",
        code: "x.wasm",
      },
    }),
  );
  await page.route("**/unity-falso/Build/cargador.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: FALSO }),
  );
}

const recibidos = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __unityFalso: { recibidos: Recibido[] } }).__unityFalso.recibidos,
  );

test("@flujo /cesvi: el 3D en Unity — mover el poste recalcula y las fotos del dictamen salen de Unity (U6)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await conUnityFalso(page, VISOR_PUENTE_VERSION);
  await casoConPoste(page);
  const cifra = page.getByTestId("cifra-reconstruccion");
  const antes = await cifra.innerText();

  // El 3D: Unity arranca, recibe el paquete caso-3d y queda listo.
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 90_000,
  });
  const cargas = (await recibidos(page)).filter((m) => m.metodo === "cargarCaso");
  expect(cargas.length).toBeGreaterThanOrEqual(1);
  const paquete = JSON.parse(String(cargas.at(-1)!.datos.json)) as {
    resultado: {
      objetos: {
        id: string;
        tipo: string;
        x: number;
        y: number;
        largo_m: number;
        ancho_m: number;
      }[];
    };
  };
  const poste = paquete.resultado.objetos.find((o) => o.id.startsWith("obj-choque-"))!;
  expect(poste).toBeTruthy();

  // Editar en 3D: el modo edición llega a Unity.
  await page.getByTestId("editar-3d").click();
  await expect
    .poll(async () =>
      (await recibidos(page)).some((m) => m.metodo === "modoEdicion" && m.datos.on === true),
    )
    .toBe(true);

  // Unity avisa que el perito soltó el poste 10 m al este: el caso se recalcula y vuelve a Unity.
  await page.evaluate(
    (p) =>
      (window as unknown as { __unityFalso: { decir: (m: unknown) => void } }).__unityFalso.decir({
        tipo: "objetoEditado",
        id: p.id,
        x: p.x + 10,
        y: p.y,
        rumbo_deg: 0,
        largo: p.largo_m,
        ancho: p.ancho_m,
      }),
    poste,
  );
  await expect(page.getByTestId("aviso-edicion-3d")).toContainText("Moviste");
  await expect
    .poll(
      async () => {
        const ultima = (await recibidos(page)).filter((m) => m.metodo === "cargarCaso").at(-1)!;
        const p = (JSON.parse(String(ultima.datos.json)) as typeof paquete).resultado.objetos.find(
          (o) => o.id === poste.id,
        );
        return p ? Math.round((p.x - poste.x) * 10) / 10 : null;
      },
      { timeout: 90_000 },
    )
    .toBe(10);
  await page.getByTestId("editar-3d").click();
  await expect(cifra).not.toHaveText(antes, { timeout: 90_000 });

  // El dictamen toma sus tres fotos de Unity: antes, en el impacto y en reposo.
  // Sin reporte de CESVI, después de los números (paso 6) viene el dictamen (paso 8).
  await irAPaso(page, 6);
  await page.getByTestId("siguiente").click();
  await expect(page.getByTestId("panel-paso")).toHaveAttribute("data-paso", "8");
  await expect(page.getByTestId("dictamen-caso")).toBeVisible();
  await expect
    .poll(
      async () =>
        (await recibidos(page)).filter((m) => m.metodo === "capturar").map((m) => m.datos.vista),
      { timeout: 60_000 },
    )
    .toEqual(["antes", "impacto", "reposo"]);
  expect(errores).toEqual([]);
});

test("@flujo /cesvi: si el Unity publicado es de otra versión del puente, el 3D abre el visor ligero (U6)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await conUnityFalso(page, "0.0.0");
  await casoConPoste(page);
  await page.getByTestId("vista-3d").click();
  const respaldo = page.getByTestId("visor-unity-respaldo");
  await expect(respaldo).toHaveAttribute("data-motivo", "version_puente", { timeout: 90_000 });
  await expect(respaldo.locator("canvas").first()).toBeVisible({ timeout: 90_000 });
});
