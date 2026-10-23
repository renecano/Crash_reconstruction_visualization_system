import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * La lectura grabada de Claude de la narración de ejemplo (E-R1; CI no llama a la API). Es la misma
 * que trae la página como ejemplo.
 */
const GRABACION = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { salida: unknown };

/** La lectura grabada de la declaración del conductor de V2 en ese mismo caso (R7, ADR 0070). */
const DECLARACION = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/declaracion/declaracion-e2e.json"),
    "utf8",
  ),
) as { declaracion: string; salida: unknown };

test("@flujo /cesvi/caso: de la narración del perito al mapa y a la escena", async ({ page }) => {
  // Reconstruye, simula la versión declarada del conductor (R7) y arma el dictamen (R8).
  test.setTimeout(150_000);
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
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ metodo: "claude", salida: GRABACION.salida }),
    }),
  );
  await page.route("**/api/cesvi/declaracion", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ metodo: "claude", salida: DECLARACION.salida }),
    }),
  );
  await page.goto("/cesvi/caso");

  // 1. La narración: la de ejemplo, leída a escena.
  await page.getByTestId("ejemplo-narracion").click();
  await expect(page.getByTestId("narracion")).toHaveValue(/vehículo A, marca VW, tipo Jetta/);
  await page.getByTestId("leer-narracion").click();
  const escena = page.getByTestId("escena");
  await expect(escena).toContainText("2 vehículos · 1 impacto");
  await expect(page.getByTestId("vehiculos")).toContainText("V1 · VW Jetta 2002");
  await expect(page.getByTestId("impactos")).toContainText("supuesto");
  await expect(page.getByTestId("validez")).toHaveText("La escena es válida contra el contrato.");

  // 2. Lo que más cambia la reconstrucción: el impacto supuesto se confirma; una masa con «No sé».
  await page.getByTestId("confirmar-impacto").click();
  await expect(page.getByTestId("impactos")).not.toContainText("supuesto");
  await expect(page.getByTestId("impactos")).toContainText("perito");
  await page.getByTestId("no-se-masa-V1").click();
  await expect(page.getByTestId("pregunta-masa-V1")).toHaveCount(0);
  await page.getByTestId("valor-masa-V2").fill("1450");
  await page.getByTestId("pregunta-masa-V2").getByRole("button", { name: "Usar" }).click();
  await expect(page.getByTestId("vehiculos")).toContainText("1450 kg");

  // 3. El mapa: primero se acerca (doble clic; sin rumbo, un clic no coloca nada) para que las
  // posiciones queden a metros. Luego V1 y V2 en el impacto y en su posición final, con su rumbo.
  const mapa = page.getByTestId("mapa-escena");
  await expect(mapa.locator("canvas")).toBeVisible({ timeout: 20_000 });
  for (let k = 0; k < 7; k++) {
    await mapa.dblclick({ position: { x: 300, y: 200 } });
    await page.waitForTimeout(400);
  }
  await expect(page.getByTestId("colocados")).toHaveText("0 posiciones colocadas por el perito.");
  const colocar = async (herramienta: string, rumbo: string, x: number, y: number) => {
    await page.getByTestId("herramienta-escena").selectOption(herramienta);
    await page.getByTestId("rumbo-escena").fill(rumbo);
    await mapa.click({ position: { x, y } });
  };
  await colocar("V1:final", "315", 330, 170);
  await expect(page.getByTestId("colocados")).toHaveText("1 posición colocada por el perito.");
  await expect(page.getByTestId("pregunta-final-V1")).toHaveCount(0);
  await colocar("V1:impacto", "0", 300, 205);
  await colocar("V2:impacto", "90", 305, 200);
  await colocar("V2:final", "80", 345, 185);
  await expect(page.getByTestId("colocados")).toHaveText("4 posiciones colocadas por el perito.");
  // Cada posición se ve en el mapa, donde el perito la puso (no fuera de él).
  const cajaMapa = (await mapa.boundingBox())!;
  const punto = (await page.locator('[data-posicion="V1:final"]').boundingBox())!;
  expect(Math.abs(punto.x + punto.width / 2 - (cajaMapa.x + 330))).toBeLessThan(4);
  expect(Math.abs(punto.y + punto.height / 2 - (cajaMapa.y + 170))).toBeLessThan(4);
  await expect(page.getByTestId("validez")).toHaveText("La escena es válida contra el contrato.");

  // 4. La reconstrucción física: las posiciones del perito fijan las velocidades, con percentiles,
  // y al lado la verificación CESVI dice qué le falta.
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("velocidades")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("velocidad-V1")).toContainText(/\d+\.\d \(/);
  await expect(page.getByTestId("evidencia-usada")).toContainText("posición final de V1");
  await expect(page.getByTestId("verificacion-cesvi")).toContainText("Falta:");

  // El 3D de la reconstrucción (R3): el visor dibuja la escena con las velocidades estimadas.
  await page.getByTestId("ver-3d").click();
  const visor = page.getByTestId("visor-caso");
  await expect(visor).toContainText("supuesto, con su rango");
  await expect(visor.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  // El croquis 2D sigue al reloj del 3D: los vehículos de la reconstrucción se mueven en el mapa.
  await expect(mapa.locator('[data-movil="V1"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(mapa.locator('[data-movil="V2"]')).toHaveCount(1);

  // R7: la declaración del conductor de V2, leída y simulada, contra la reconstrucción y en el 3D.
  await page.getByTestId("abrir-declaracion").click();
  await page.getByTestId("texto-declaracion").fill(DECLARACION.declaracion);
  await page.getByTestId("declarante").selectOption("V2");
  await page.getByTestId("leer-declaracion").click();
  await expect(page.getByTestId("lo-que-declara")).toContainText("40 km/h");
  const queCambia = page.getByTestId("que-cambia");
  await expect(queCambia).toBeVisible({ timeout: 60_000 });
  await expect(queCambia.locator('[data-fila="velocidad-V2"]')).toContainText("40 km/h");
  await expect(queCambia.locator('[data-fila="posicion_final-V2"]')).toContainText(
    "m de la reconstruida",
  );
  // En el 3D, la versión declarada va como fantasmas sobre la reconstrucción, o lado a lado.
  await expect
    .poll(
      () => page.evaluate(() => (window as { __croquisGhosts?: number }).__croquisGhosts ?? 0),
      {
        timeout: 30_000,
      },
    )
    .toBeGreaterThan(0);
  await page.getByTestId("comparar-lado-a-lado").click();
  await expect(page.getByTestId("visor-hipotesis")).toContainText("versión declarada (V2)");
  await page.getByTestId("comparar-lado-a-lado").click();
  // La sugerencia sale solo si el perito la pide, y él la confirma o la descarta.
  await expect(page.getByTestId("sugerencia-declarada")).toHaveCount(0);
  await page.getByTestId("pedir-sugerencia").check();
  await expect(page.getByTestId("sugerencia-declarada")).toContainText("versión declarada");
  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByTestId("decision-sugerencia")).toHaveText(
    "El perito descartó la sugerencia.",
  );

  // R8: el dictamen de la reconstrucción, validado por el perito, en PDF y en Word.
  const dictamen = page.getByTestId("dictamen-caso");
  await expect(page.getByTestId("estado-validacion")).toHaveText(
    "Sin validar: el dictamen sale como borrador.",
  );
  await page.getByTestId("conclusion-perito").fill("Conclusión de prueba del perito.");
  await page.getByTestId("nombre-perito").fill("Perito de prueba");
  await page.getByTestId("validar-dictamen").click();
  await expect(page.getByTestId("estado-validacion")).toContainText("Validó Perito de prueba");
  await page.getByTestId("estructura-cesvi").check();
  const pdf = page.waitForEvent("download");
  await dictamen.getByTestId("descargar-dictamen-pdf").click();
  const archivoPdf = await pdf;
  expect(archivoPdf.suggestedFilename()).toBe("dictamen-reconstruccion.pdf");
  const bytesPdf = readFileSync(await archivoPdf.path());
  expect(bytesPdf.subarray(0, 5).toString()).toBe("%PDF-");
  // El croquis a escala y los tres cuadros del 3D (el visor está abierto) van como imágenes.
  const imagenes = bytesPdf.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? [];
  expect(imagenes.length).toBeGreaterThanOrEqual(4);
  // El croquis del dictamen va sobre las calles del mapa donde el perito colocó a los vehículos.
  await expect(dictamen).toHaveAttribute("data-croquis", "mapa");
  const word = page.waitForEvent("download");
  await dictamen.getByTestId("descargar-dictamen-word").click();
  const archivoWord = await word;
  expect(archivoWord.suggestedFilename()).toBe("dictamen-reconstruccion.docx");
  expect(
    readFileSync(await archivoWord.path())
      .subarray(0, 2)
      .toString(),
  ).toBe("PK");

  // 5. El caso guardado: contrato 2.0.0 con lo que marcó el perito y su validación (ADR 0075).
  const descarga = page.waitForEvent("download");
  await page.getByTestId("guardar-caso").click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe("caso-croquis.json");
  const rutaCaso = await archivo.path();
  const d = JSON.parse(readFileSync(rutaCaso, "utf8")) as {
    conclusion_perito: string;
    expediente: {
      resultado: { validado_por: string; huella_entradas: string };
      impactos: { fuente: string }[];
      versiones: {
        tipo: string;
        posiciones: { vehiculo: string; fase: string; fuente: string; rumbo: number }[];
      }[];
    };
  };
  expect(d.expediente.impactos[0]!.fuente).toBe("perito");
  const posiciones = d.expediente.versiones[0]!.posiciones;
  expect(posiciones).toHaveLength(4);
  expect(posiciones.every((p) => p.fuente === "perito")).toBe(true);
  expect(posiciones.find((p) => p.vehiculo === "V1" && p.fase === "final")!.rumbo).toBe(315);
  expect(d.expediente.resultado.validado_por).toBe("Perito de prueba");
  expect(d.conclusion_perito).toBe("Conclusión de prueba del perito.");

  // Al volver a abrirlo en otra visita, regresan la narración, las posiciones y la validación.
  await page.goto("/cesvi/caso");
  await page.getByTestId("abrir-caso").setInputFiles(rutaCaso);
  await expect(page.getByTestId("caso-abierto")).toContainText("Validó Perito de prueba");
  await expect(page.getByTestId("narracion")).not.toHaveValue("");
  await expect(page.getByTestId("colocados")).toHaveText("4 posiciones colocadas por el perito.");
  expect(errores).toEqual([]);
});

/** La lectura grabada de una carambola narrada con su secuencia de impactos (E-R6). */
const CARAMBOLA = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/carambola/carambola-e2e.json"),
    "utf8",
  ),
) as { narracion: string; salida: unknown };

test("@flujo /cesvi/caso: una carambola, con sus impactos en orden hasta el 3D", async ({
  page,
}) => {
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
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ metodo: "claude", salida: CARAMBOLA.salida }),
    }),
  );
  await page.goto("/cesvi/caso");

  // 1. La narración del perito, con la secuencia: A contra B y, por el empuje, B contra C.
  await page.getByTestId("narracion").fill(CARAMBOLA.narracion);
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("3 vehículos · 2 impactos");

  // 2. El mapa, a metros (zoom 18, unos 0.28 m por pixel): los tres en fila hacia el oriente, B y
  // C detenidos en el semáforo; la misma disposición que la escena canónica `carambola`.
  const mapa = page.getByTestId("mapa-escena");
  await expect(mapa.locator("canvas")).toBeVisible({ timeout: 20_000 });
  for (let k = 0; k < 7; k++) {
    await mapa.dblclick({ position: { x: 300, y: 200 } });
    await page.waitForTimeout(400);
  }
  const colocar = async (herramienta: string, rumbo: string, dx: number) => {
    await page.getByTestId("herramienta-escena").selectOption(herramienta);
    await page.getByTestId("rumbo-escena").fill(rumbo);
    await mapa.click({ position: { x: 300 + dx, y: 200 } });
  };
  await colocar("V1:impacto", "90", -15);
  await colocar("V2:impacto", "90", 0);
  await colocar("V3:impacto", "90", 21);
  await colocar("V1:final", "78", -9);
  await colocar("V2:final", "85", 12);
  await colocar("V3:final", "97", 28);
  await expect(page.getByTestId("colocados")).toHaveText("6 posiciones colocadas por el perito.");

  // 3. La reconstrucción: el segundo impacto ocurre después del primero, y el mapa marca los dos.
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("velocidades")).toBeVisible({ timeout: 60_000 });
  const impactos = page.getByTestId("impactos-reconstruidos");
  await expect(impactos.locator('[data-impacto="1"]')).toContainText("V1 con V2");
  await expect(impactos.locator('[data-impacto="2"]')).toContainText("V2 con V3");
  await expect(impactos.locator('[data-impacto="2"]')).toContainText(/\+\d\.\d\d s/);
  await expect(mapa.locator('[data-impacto="1"]')).toHaveText("X1");
  await expect(mapa.locator('[data-impacto="2"]')).toHaveText("X2");
  await expect(page.getByTestId("limites")).toContainText("V3: solo está en un impacto posterior");

  // 4. El 3D de la carambola, con los tres vehículos moviéndose en el mapa.
  await page.getByTestId("ver-3d").click();
  const visor = page.getByTestId("visor-caso");
  await expect(visor.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  await expect(mapa.locator('[data-movil="V3"]')).toHaveCount(1, { timeout: 30_000 });
  expect(errores).toEqual([]);
});
