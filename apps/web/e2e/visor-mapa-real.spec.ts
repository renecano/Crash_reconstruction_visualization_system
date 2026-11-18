import { VISOR_PUENTE_VERSION } from "@croquis/scene-schema";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { conUnityFalso, recibidosDelPuente } from "./visor-unity-ayuda";

test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

/**
 * El modo «mapa real» del 3D (ronda 4, punto 9; ADR 0124), con el Unity falso (puente 1.3.0): el
 * piso es el mapa; la foto satelital, sin red o sin llave, se apaga sola y lo dice; el perito la puede
 * correr; y «Entorno procedural» vuelve a lo de siempre. No sale a internet: las teselas del mapa
 * responden vacías y las de Esri fallan.
 */
test("@flujo /cesvi: el mapa real como piso del 3D, la foto satelital que se apaga sola y su ajuste", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await conUnityFalso(page, VISOR_PUENTE_VERSION);
  await page.route("https://tiles.openfreemap.org/**", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: "fondo", type: "background", paint: { "background-color": "#eee" } }],
      }),
    }),
  );
  await page.route("https://ibasemaps-api.arcgis.com/**", (r) => r.abort());
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 90_000,
  });

  // El modo nuevo, aparte del entorno de siempre.
  const boton = page.getByTestId("mapa-real");
  await expect(boton).toHaveText("Mapa real");
  await boton.click();
  await expect(boton).toHaveAttribute("aria-pressed", "true");
  const panel = page.getByTestId("panel-mapa-real");
  await expect(panel).toBeVisible();
  // Sin la foto (sin llave en CI, o sus teselas no cargan), lo dice y el piso es el mapa.
  await expect(page.getByTestId("aviso-mapa-real")).toContainText("el piso es el mapa", {
    timeout: 60_000,
  });
  await expect(page.getByTestId("atribucion-mapa-real")).toHaveText(
    "© OpenStreetMap · OpenFreeMap · OpenMapTiles",
  );
  // Unity recibe el piso: una imagen del lugar, con su lado y su crédito.
  await expect
    .poll(async () => (await recibidosDelPuente(page)).filter((m) => m.metodo === "piso").length, {
      timeout: 60_000,
    })
    .toBeGreaterThan(0);
  const pisos = (await recibidosDelPuente(page)).filter((m) => m.metodo === "piso");
  const ultimo = pisos.at(-1)!.datos;
  expect(String(ultimo.imagen)).toMatch(/^data:image\/jpeg;base64,/);
  expect(Number(ultimo.lado_m)).toBeGreaterThanOrEqual(200);
  expect(ultimo.atribucion).toBe("© OpenStreetMap · OpenFreeMap · OpenMapTiles");

  // Apagar la foto quita el aviso; las flechas solo están con la foto.
  await page.getByTestId("foto-satelital").click();
  await expect(page.getByTestId("foto-satelital")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("ajuste-foto-norte")).toHaveCount(0);

  // De vuelta al entorno procedural: Unity recibe el piso vacío.
  await boton.click();
  await expect(boton).toHaveText("Mapa real");
  await expect
    .poll(async () => {
      const ps = (await recibidosDelPuente(page)).filter((m) => m.metodo === "piso");
      const u = ps.at(-1);
      return u ? u.datos.imagen : "sin";
    })
    .toBeNull();
});
