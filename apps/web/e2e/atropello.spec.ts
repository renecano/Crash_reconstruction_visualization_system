import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";
import { contestarC1, irAPaso, mapaFacil, sinRed, tocarEnMetros } from "./ayuda-recorrido";

// La transición entre actos (ADR 0108) es decorativa; con movimiento reducido no se monta.
test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

/**
 * Una narración inventada para la prueba (no es un caso de CESVI) y su lectura, como la devolvería
 * Claude: un solo vehículo y un impacto contra un peatón. Cada cita es un fragmento literal.
 */
const NARRACION =
  "El hecho se ubica en la avenida Hidalgo, municipio de Toluca, Estado de México, aproximadamente a las 10:15 horas. " +
  "Se examina el vehículo A, marca Nissan, tipo Versa, modelo 2019, que circulaba de Poniente a Oriente. " +
  "El vehículo A presenta daños en su parte frontal, tercio medio, con dirección de adelante hacia atrás, por el contacto con un peatón que cruzaba la avenida. " +
  "El peatón quedó sobre la carpeta asfáltica, adelante del punto de contacto.";
const fila = (seccion: string, campo: string, valor: string, cita: string, vehiculo = "V1") => ({
  seccion,
  n: 1,
  vehiculo,
  campo,
  valor,
  cita,
});
const SALIDA = {
  datos: [
    fila("caso", "lugar", "avenida Hidalgo", "El hecho se ubica en la avenida Hidalgo", "ninguno"),
    fila("caso", "municipio", "Toluca", "", "ninguno"),
    fila("caso", "entidad", "Estado de México", "", "ninguno"),
    fila("caso", "fecha_hora", "10:15 horas", "", "ninguno"),
    fila("vehiculo", "marca", "Nissan", "Se examina el vehículo A, marca Nissan, tipo Versa"),
    fila("vehiculo", "modelo", "Versa", ""),
    fila("vehiculo", "anio", "2019", ""),
    fila("dano", "cara", "frontal", "El vehículo A presenta daños en su parte frontal"),
    fila("dano", "direccion", "de_adelante_hacia_atras", ""),
    fila(
      "impacto",
      "participante",
      "V1",
      "por el contacto con un peatón que cruzaba la avenida",
      "ninguno",
    ),
    fila("impacto", "objeto_fijo", "peatón", "", "ninguno"),
  ],
};
const CON_UNITY = process.env.CROQUIS_UNITY === "1";
const CAPTURAS = resolve(__dirname, "../../../docs/cesvi/ronda-4/evidencia/personas");

/**
 * Un atropello de punta a punta (René, 2026-11-18, A3): la lectura dice que el impacto fue contra un
 * peatón; La escena pide colocarlo; se marca dónde quedó (la distancia de proyección) y la
 * reconstrucción da la velocidad del vehículo, con el peatón dibujado en el 2D.
 */
test("@flujo /cesvi: un atropello — el peatón en La escena, su proyección y la reconstrucción", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
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
  await page.route("**/api/cesvi/escena", (r) =>
    r.fulfill({ json: { metodo: "claude", salida: SALIDA } }),
  );
  // Con CROQUIS_UNITY=1 (a mano, en la demo local con el Unity de la máquina) abre además el 3D real.
  if (CON_UNITY)
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
    });
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await irAPaso(page, 2);
  await page.getByTestId("narracion").fill(NARRACION);
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("1 vehículo", { timeout: 30_000 });
  await sinRed(page);
  await irAPaso(page, 3);

  // La escena: el choque, por dónde venía el Versa y dónde quedó.
  const mapa = await mapaFacil(page);
  const caja = (await mapa.boundingBox())!;
  await mapa.click({ position: { x: caja.width * 0.55, y: caja.height * 0.5 } });
  await expect(page.getByTestId("escena-pregunta")).toHaveText("¿Por dónde venía el Nissan Versa?");
  // La narración dice «de Poniente a Oriente»: Croquis propone esa flecha.
  await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]').click();
  await tocarEnMetros(page, "choque-1", 9, 0);
  await page.getByTestId("listo-final").click();
  await contestarC1(page);
  await expect(page.getByTestId("escena-lista")).toBeVisible();

  // La lectura dice «peatón» y no hay nadie: La escena pide colocarlo.
  await expect(page.getByTestId("falta-persona")).toContainText("fue contra un peatón");
  await page.getByTestId("colocar-persona-faltante").click();
  await tocarEnMetros(page, "choque-1", 1.5, 0);
  await expect(page.getByTestId("persona-per-1")).toHaveCount(1);
  await expect(page.getByTestId("falta-persona")).toHaveCount(0);
  // Dónde quedó: 12 m adelante.
  await page.getByTestId("marcar-final-persona").click();
  await tocarEnMetros(page, "choque-1", 13.5, 0);
  await expect(page.getByTestId("proyeccion-persona")).toContainText(/Proyección 1[12]\.\d m/);
  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, "atropello-1-la-escena.jpg"), quality: 82 });
  await page.getByTestId("sel-listo").click();

  // La reconstrucción: la velocidad del vehículo, y el peatón en el 2D con su proyección.
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("cifra-reconstruida")).toHaveText(/^\d+$/);
  await page.getByTestId("vista-maqueta").click();
  const peaton = page.getByTestId("maqueta-persona-per-1");
  await expect(peaton).toHaveCount(1, { timeout: 30_000 });
  await expect(peaton).toContainText("Peatón · proyección reconstruida");
  // Donde quedó según lo marcó el perito, aparte del reposo reconstruido.
  await expect(page.getByTestId("maqueta-persona-marcado-per-1")).toHaveCount(1);
  await expect(page.getByTestId("maqueta-persona-reposo-per-1")).toHaveCount(1);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(CAPTURAS, "atropello-2-reconstruccion-2d.jpg"), quality: 82 });
  if (CON_UNITY) {
    // El 3D de Unity: el peatón de pie antes del impacto, lanzado y en su reposo.
    await page.getByTestId("vista-3d").click();
    const visor = page.getByTestId("visor-unity");
    await expect(visor).toHaveAttribute("data-fase", "listo", { timeout: 300_000 });
    await page.waitForTimeout(8000);
    await expect(visor).toHaveAttribute("data-fase", "listo", { timeout: 300_000 });
    const tiempo = page.getByTestId("tiempo-unity");
    for (const [nombre, t] of [
      ["antes", "-0.6"],
      ["impacto", "0.15"],
      ["reposo", "99"],
    ] as const) {
      // Un control de rango no se llena con `fill`: se pone su valor y se avisa, como al arrastrarlo.
      await tiempo.evaluate((el, v) => {
        const poner = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        poner.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, t);
      await page.waitForTimeout(2500);
      await page.screenshot({
        path: join(CAPTURAS, `atropello-3-unity-${nombre}.jpg`),
        quality: 84,
      });
    }
  }
  expect(errores).toEqual([]);
});
