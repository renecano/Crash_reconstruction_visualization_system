import { readFileSync } from "node:fs";
import { VISOR_PUENTE_VERSION } from "@croquis/scene-schema";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { sinEspacios, textoDelPdf, textoDelWord } from "./ayuda-documentos";
import { irAPaso } from "./ayuda-recorrido";
import { conUnityFalso } from "./visor-unity-ayuda";

/**
 * El dictamen se escribe con el 3D de Unity ya abierto (René, 2026-11-16): Unity Web se queda con el
 * teclado de toda la página, y en «Tu conclusión» y «Nombre del perito» no se podía escribir. Aquí
 * el Unity de mentira hace lo mismo que el real (cancela cada tecla) y se escribe con teclas de
 * verdad, se borra, se pega y se cita; el texto debe quedar completo en la vista previa, el PDF y
 * el Word.
 */
test.use({ reducedMotion: "reduce" });

const PARRAFO_1 =
  "Con base en la huella de frenado, los restos en el arroyo y las posiciones finales de los dos " +
  "vehículos, concluyo que el vehículo B circulaba detrás del A, en el mismo sentido y por el mismo " +
  "carril, y que lo alcanzó cuando el A ya había reducido su velocidad. La deformación de la parte " +
  "frontal de B y la de la parte trasera de A son compatibles entre sí en altura y en anchura.";
const PARRAFO_2 =
  "No encontré evidencia de una maniobra evasiva antes del impacto: no hay huella de derrape lateral " +
  "ni cambio de carril. Las cifras de velocidad de este dictamen son las de la reconstrucción, con " +
  "su rango, y las tomo como apoyo; la conclusión es mía.";
const PEGADO = " Párrafo pegado desde otro documento: «km 47+800», 100 % legible.";

interface Caja {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cabe: boolean;
}

/** Las cajas de los botones de abajo y si a cada uno le cabe su texto. */
const cajasDeAcciones = (page: Page) =>
  page.evaluate(() =>
    ["descargar-dictamen-word", "guardar-caso", "guardar-en-equipo"].map((id) => {
      const e = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
      const r = e.getBoundingClientRect();
      return {
        id,
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        cabe: e.scrollWidth <= e.clientWidth && r.right <= window.innerWidth && r.x >= 0,
      };
    }),
  );

const seEnciman = (a: Caja, b: Caja) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

test("@flujo /cesvi: el dictamen se escribe con el 3D de Unity abierto y sale completo en PDF y Word", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await conUnityFalso(page, VISOR_PUENTE_VERSION);
  // En modo oscuro, como lo encontró René.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("croquis.cesvi.tema.trabajar", "oscuro");
    } catch {
      /* sin almacenamiento */
    }
  });
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

  // El caso de AXA, reconstruido y con el 3D de Unity abierto.
  await page.goto("/cesvi/casos/a2010930");
  await expect(page.getByTestId("recorrido-caso")).toHaveAttribute("data-tema", "oscuro");
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 90_000,
  });
  const teclasDeUnity = () =>
    page.evaluate(
      () => (window as unknown as { __unityFalso: { teclas: string[] } }).__unityFalso.teclas,
    );
  // Fuera de un campo, Unity sigue recibiendo sus teclas (la cámara libre).
  await page.locator("body").press("ArrowUp");
  expect(await teclasDeUnity()).toContain("keydown:ArrowUp");

  await irAPaso(page, 9);
  const campo = page.getByTestId("conclusion-perito");
  const validar = page.getByTestId("validar-dictamen");
  // «Validar y firmar» dice junto al botón qué falta.
  await expect(validar).toBeDisabled();
  await expect(page.getByTestId("falta-para-firmar")).toHaveText(
    "Escribe tu conclusión y tu nombre para firmar.",
  );

  // Escribir, con teclas de verdad, dos párrafos largos.
  await campo.click();
  await campo.pressSequentially(PARRAFO_1);
  await page.keyboard.press("Enter");
  await campo.pressSequentially(PARRAFO_2);
  await expect(campo).toBeFocused();
  let esperado = `${PARRAFO_1}\n${PARRAFO_2}`;
  await expect(campo).toHaveValue(esperado);
  // Borrar y volver a escribir.
  for (let k = 0; k < 9; k++) await page.keyboard.press("Backspace");
  await expect(campo).toHaveValue(esperado.slice(0, -9));
  await campo.pressSequentially(esperado.slice(-9));
  await expect(campo).toHaveValue(esperado);
  // Pegar.
  await page.evaluate((t) => navigator.clipboard.writeText(t), PEGADO);
  await page.keyboard.press("Control+V");
  esperado += PEGADO;
  await expect(campo).toHaveValue(esperado);
  // Nada de lo escrito llegó a Unity.
  expect((await teclasDeUnity()).filter((t) => /^key\w+:(.|Enter|Backspace)$/.test(t))).toEqual([]);

  // Citar no borra lo escrito y deja el cursor al final de la cita, para seguir escribiendo.
  await page.getByTestId("citar-velocidad").click();
  await expect(page.getByTestId("aviso-cita")).toHaveText("Cita agregada a tu conclusión.");
  await expect(campo).toBeFocused();
  await campo.pressSequentially(" Sigo escribiendo.");
  await page.getByTestId("citar-supuestos").click();
  await expect(campo).toBeFocused();
  await campo.pressSequentially(" Fin.");
  const conclusion = await campo.inputValue();
  expect(conclusion.startsWith(esperado)).toBe(true);
  expect(conclusion).toContain("antes del impacto:");
  expect(conclusion).toContain(" Sigo escribiendo.");
  expect(conclusion).toContain("Supuestos declarados:");
  expect(conclusion.endsWith(" Fin.")).toBe(true);

  // La vista previa lleva el texto completo.
  expect(await page.getByTestId("conclusion-hoja").textContent()).toBe(conclusion);

  // Con solo la conclusión, falta el nombre; al escribirlo, el botón se activa.
  await expect(page.getByTestId("falta-para-firmar")).toHaveText("Escribe tu nombre para firmar.");
  const nombre = page.getByTestId("nombre-perito");
  await nombre.click();
  await nombre.pressSequentially("Perita de prueba");
  await expect(nombre).toHaveValue("Perita de prueba");
  await expect(page.getByTestId("falta-para-firmar")).toHaveCount(0);
  await expect(validar).toBeEnabled();

  // Los botones de abajo no se enciman ni se cortan, en ventana grande y chica; la ayuda tampoco.
  for (const [ancho, alto] of [
    [1440, 900],
    [1024, 700],
    [390, 800],
  ] as const) {
    await page.setViewportSize({ width: ancho, height: alto });
    const cajas = await cajasDeAcciones(page);
    for (const c of cajas) expect(c.cabe, `${c.id} a ${ancho} px`).toBe(true);
    for (let i = 0; i < cajas.length; i++)
      for (let j = i + 1; j < cajas.length; j++)
        expect(seEnciman(cajas[i]!, cajas[j]!), `${cajas[i]!.id} y ${cajas[j]!.id}`).toBe(false);
    await page.getByTestId("guardar-en-equipo").focus();
    const ayuda = await page.getByTestId("tooltip").boundingBox();
    expect(ayuda).not.toBeNull();
    expect(ayuda!.x).toBeGreaterThanOrEqual(0);
    expect(ayuda!.x + ayuda!.width).toBeLessThanOrEqual(ancho);
    expect(ayuda!.y).toBeGreaterThanOrEqual(0);
    await page.getByTestId("guardar-en-equipo").blur();
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  // Firmado: el PDF y el Word llevan la conclusión completa.
  await validar.click();
  await expect(page.getByTestId("estado-validacion")).toContainText("Validó Perita de prueba");
  const bajaPdf = page.waitForEvent("download");
  await page.getByTestId("descargar-dictamen-pdf").click();
  const pdf = await bajaPdf;
  expect(pdf.suggestedFilename()).toBe("dictamen-reconstruccion.pdf");
  const textoPdf = await textoDelPdf(readFileSync(await pdf.path()));
  expect(sinEspacios(textoPdf)).toContain(sinEspacios(conclusion));
  await expect(page.getByTestId("estado-descarga")).toContainText("se descargó");
  const bajaWord = page.waitForEvent("download");
  await page.getByTestId("descargar-dictamen-word").click();
  const textoWord = textoDelWord(readFileSync(await (await bajaWord).path()));
  expect(sinEspacios(textoWord)).toContain(sinEspacios(conclusion));
  expect(errores).toEqual([]);
});
