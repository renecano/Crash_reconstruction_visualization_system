import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { acercar, irAPaso } from "./ayuda-recorrido";

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

test("@flujo /cesvi: un caso nuevo desde la lista, de la narración al dictamen", async ({
  page,
}) => {
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
  // Desde la lista de casos (ADR 0079): «Caso nuevo» abre el recorrido en el paso 1.
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await expect(page.getByTestId("recorrido-caso")).toHaveAttribute("data-origen", "nuevo");
  await irAPaso(page, 2);

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
  // Una pregunta = un dato, con su control además de «No sé»: primero el tipo de vehículo (opciones)
  // y luego la masa, que ya ofrece el valor típico de su clase (E2).
  await expect(page.getByTestId("usar-tipico-masa-V1")).toHaveCount(0);
  await page.getByTestId("opcion-clase-V1-sedan_compacto").click();
  await expect(page.getByTestId("pregunta-clase-V1")).toHaveCount(0);
  await expect(page.getByTestId("usar-tipico-masa-V1")).toBeVisible();
  await page.getByTestId("no-se-masa-V1").click();
  await expect(page.getByTestId("pregunta-masa-V1")).toHaveCount(0);
  await page.getByTestId("valor-masa-V2").fill("1450");
  await page
    .getByTestId("pregunta-masa-V2")
    .getByRole("button", { name: "Usar", exact: true })
    .click();
  await expect(page.getByTestId("vehiculos")).toContainText("1450 kg");

  await irAPaso(page, 3);
  // 3. El lugar (V2): la lista guiada. Sin lo obligatorio, «Siguiente» no avanza y dice qué falta.
  const mapa = page.getByTestId("mapa-escena");
  const siguiente = page.getByTestId("siguiente");
  await expect(siguiente).toBeDisabled();
  await expect(page.getByTestId("falta-para-seguir")).toContainText("el punto de impacto");
  await expect(page.getByTestId("falta-para-seguir")).toContainText("V1 y V2, dónde quedaron");
  await expect(page.getByTestId("paso-4")).toBeDisabled();
  await acercar(page);
  await expect(mapa).toHaveAttribute("data-herramienta", "colocar");

  // El punto de impacto: Croquis propone dónde estaba cada uno por sus zonas de contacto.
  await expect(page.getByTestId("item-activo")).toHaveAttribute("data-item", "impacto:1");
  await mapa.click({ position: { x: 300, y: 205 } });
  await expect(mapa.locator('[data-posicion="V1:impacto"]')).toHaveCount(1);
  await expect(mapa.locator('[data-posicion="V2:impacto"]')).toHaveCount(1);
  // Lo que propone Croquis se ve como fantasma, con «Aceptar» por vehículo.
  await expect(page.getByTestId("fantasma-V1")).toHaveCount(1);
  await expect(page.getByTestId("fantasma-V2")).toHaveCount(1);
  await page.getByTestId("aceptar-V1").click();
  await expect(page.getByTestId("fantasma-V1")).toHaveCount(0);
  await expect(page.getByTestId("fantasma-V2")).toHaveCount(1);
  await page.getByTestId("listo-elemento").click();

  // En «Colocar» el mapa no se arrastra: lo colocado se queda donde estaba en la pantalla.
  const antes = (await mapa.locator('[data-posicion="V1:impacto"]').boundingBox())!;
  const caja = (await mapa.boundingBox())!;
  await page.mouse.move(caja.x + 120, caja.y + 320);
  await page.mouse.down();
  await page.mouse.move(caja.x + 260, caja.y + 360, { steps: 8 });
  await page.mouse.up();
  const despues = (await mapa.locator('[data-posicion="V1:impacto"]').boundingBox())!;
  expect(Math.abs(despues.x - antes.x)).toBeLessThan(2);
  expect(Math.abs(despues.y - antes.y)).toBeLessThan(2);

  // Dónde quedó cada uno: se toca el mapa y el rumbo se escribe (o se gira la flecha).
  const colocar = async (vehiculo: string, rumbo: string, x: number, y: number) => {
    await expect(page.getByTestId("item-activo")).toHaveAttribute("data-item", `final:${vehiculo}`);
    await mapa.click({ position: { x, y } });
    await page.getByTestId("rumbo-activo").fill(rumbo);
    await page.getByTestId("listo-elemento").click();
  };
  await colocar("V1", "315", 330, 170);
  await expect(siguiente).toBeDisabled();
  await expect(page.getByTestId("falta-para-seguir")).toHaveText(
    "Para seguir falta: V2, dónde quedó.",
  );
  // V2, con el mouse (punto 3 de René): se arrastra su chip de la bandeja al mapa, que dice en vivo a
  // cuánto queda del impacto, y se gira con el anillo (el asa hacia el este da 90°, con imán).
  await expect(page.getByTestId("item-activo")).toHaveAttribute("data-item", "final:V2");
  const chip = (await page.getByTestId("chip-final:V2").boundingBox())!;
  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x + 345, caja.y + 185, { steps: 12 });
  await expect(page.getByTestId("distancia-arrastre")).toContainText("m del impacto");
  await page.mouse.up();
  await expect(mapa.locator('[data-posicion="V2:final"]')).toHaveCount(1);
  const anillo = (await page.getByTestId("anillo-giro").locator("svg").boundingBox())!;
  const cx = anillo.x + anillo.width / 2;
  const cy = anillo.y + anillo.height / 2;
  const radio = anillo.width / 2 - 12;
  await page.mouse.move(cx, cy - radio);
  await page.mouse.down();
  await page.mouse.move(cx + radio * 0.7, cy - radio * 0.7, { steps: 6 });
  await page.mouse.move(cx + radio, cy, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("rumbo-activo")).toHaveValue("90");
  await expect(page.getByTestId("rotulo-giro")).toContainText("90°");
  await page.getByTestId("listo-elemento").click();
  await expect(mapa.locator("[data-posicion]")).toHaveCount(4);
  await expect(page.getByTestId("falta-para-seguir")).toHaveCount(0);
  await expect(siguiente).toBeEnabled();
  // Cada posición se ve en el mapa, donde el perito la puso (no fuera de él).
  const cajaMapa = (await mapa.boundingBox())!;
  const punto = (await page.locator('[data-posicion="V1:final"]').boundingBox())!;
  expect(Math.abs(punto.x + punto.width / 2 - (cajaMapa.x + 330))).toBeLessThan(4);
  expect(Math.abs(punto.y + punto.height / 2 - (cajaMapa.y + 170))).toBeLessThan(4);

  // Expandir el mapa a pantalla completa, con lo que falta, y contraerlo con Esc.
  await page.getByTestId("expandir-mapa").click();
  await expect(page.getByTestId("escenario")).toHaveAttribute("data-expandido", "si");
  await expect(page.getByTestId("panel-expandido")).toContainText("Listo: puedes seguir.");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("escenario")).toHaveAttribute("data-expandido", "no");

  // 4. La reconstrucción física: las posiciones del perito fijan las velocidades, con percentiles.
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("velocidades")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("velocidad-V1")).toContainText(/\d+\.\d \(/);
  await expect(page.getByTestId("evidencia-usada")).toContainText("posición final de V1");
  // La bitácora de la pizarra (R12b): el Lector leyó la narración y el Físico reconstruyó.
  const bitacora = page.getByTestId("bitacora-agentes");
  await expect(bitacora.locator('[data-de="lector"]').first()).toContainText("Lectura:");
  await expect(bitacora.locator('[data-de="fisico"]').first()).toContainText("Reconstrucción");

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

  // Los daños que calcula la reconstrucción y, en los números, la verificación CESVI dice qué falta.
  await irAPaso(page, 5);
  await expect(page.getByTestId("dano-calculado-V1")).toContainText("C1–C6");
  await irAPaso(page, 6);
  await expect(page.getByTestId("verificacion-cesvi")).toContainText("Falta:");

  // R8: el dictamen de la reconstrucción, validado por el perito, en PDF y en Word. Sin reporte de
  // CESVI no hay paso «Croquis contra el reporte»: de los números se pasa al dictamen.
  await page.getByTestId("siguiente").click();
  await expect(page.getByTestId("panel-paso")).toHaveAttribute("data-paso", "8");
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
  // Lo que colocó o aceptó el perito es suyo; la pose de impacto de V2 que propuso Croquis y nadie
  // aceptó sigue como supuesto (punto 3 de René).
  const fuenteDe = (v: string, fase: string) =>
    posiciones.find((p) => p.vehiculo === v && p.fase === fase)!.fuente;
  expect(fuenteDe("V1", "impacto")).toBe("perito");
  expect(fuenteDe("V2", "impacto")).toBe("supuesto");
  expect(fuenteDe("V1", "final")).toBe("perito");
  expect(fuenteDe("V2", "final")).toBe("perito");
  expect(posiciones.find((p) => p.vehiculo === "V1" && p.fase === "final")!.rumbo).toBe(315);
  expect(posiciones.find((p) => p.vehiculo === "V2" && p.fase === "final")!.rumbo).toBe(90);
  expect(d.expediente.resultado.validado_por).toBe("Perito de prueba");
  expect(d.conclusion_perito).toBe("Conclusión de prueba del perito.");

  // Guardado en este equipo: aparece en la lista de casos, validado, y se abre en el recorrido.
  await page.getByTestId("guardar-en-equipo").click();
  await expect(page.getByTestId("aviso-guardado")).toContainText("Guardado en este equipo");
  await page.goto("/cesvi");
  const guardado = page.getByTestId("casos-guardados").getByRole("link").first();
  await expect(guardado).toContainText("validado");
  await guardado.click();
  await expect(page.getByTestId("recorrido-caso")).toHaveAttribute("data-origen", "guardado");
  await irAPaso(page, 3);
  await expect(page.getByTestId("mapa-escena").locator("[data-posicion]")).toHaveCount(4);

  // El archivo del caso, abierto en otra visita: regresan la narración, las posiciones y la
  // validación.
  await page.goto("/cesvi/casos/nuevo");
  await page.getByTestId("abrir-caso").setInputFiles(rutaCaso);
  await expect(page.getByTestId("caso-abierto")).toContainText("Validó Perito de prueba");
  await irAPaso(page, 2);
  await expect(page.getByTestId("narracion")).not.toHaveValue("");
  await irAPaso(page, 3);
  await expect(page.getByTestId("mapa-escena").locator("[data-posicion]")).toHaveCount(4);
  expect(errores).toEqual([]);
});

/** La lectura grabada de una carambola narrada con su secuencia de impactos (E-R6). */
const CARAMBOLA = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/carambola/carambola-e2e.json"),
    "utf8",
  ),
) as { narracion: string; salida: unknown };

test("@flujo /cesvi: una carambola, con sus impactos en orden hasta el 3D", async ({ page }) => {
  // Acerca el mapa, coloca dos impactos y tres finales, reconstruye y abre el 3D.
  test.setTimeout(180_000);
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
  await page.goto("/cesvi/casos/nuevo");
  await irAPaso(page, 2);

  // 1. La narración del perito, con la secuencia: A contra B y, por el empuje, B contra C.
  await page.getByTestId("narracion").fill(CARAMBOLA.narracion);
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("3 vehículos · 2 impactos");

  await irAPaso(page, 3);
  // 2. El lugar, a metros (zoom 18, unos 0.28 m por pixel): los tres en fila hacia el oriente, B y
  // C detenidos en el semáforo; la misma disposición que la escena canónica `carambola`. Cada
  // impacto tiene su punto; del segundo, Croquis solo propone dónde estaba C.
  const mapa = page.getByTestId("mapa-escena");
  await acercar(page);
  const tocar = async (item: string, dx: number, rumbo: string) => {
    await expect(page.getByTestId("item-activo")).toHaveAttribute("data-item", item);
    await mapa.click({ position: { x: 300 + dx, y: 260 } });
    await page.getByTestId("rumbo-activo").fill(rumbo);
    await page.getByTestId("listo-elemento").click();
  };
  await tocar("impacto:1", -7, "90");
  await tocar("impacto:2", 13, "90");
  await tocar("final:V1", -9, "78");
  await tocar("final:V2", 12, "85");
  await tocar("final:V3", 28, "97");
  await expect(mapa.locator("[data-posicion]")).toHaveCount(6);
  await expect(page.getByTestId("siguiente")).toBeEnabled();

  // 3. La reconstrucción: el segundo impacto ocurre después del primero, y el mapa marca los dos.
  await irAPaso(page, 4);
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

  // 5. Paso 6 (R12a): una hipótesis sobre un conductor. V3 frena 2.5 s antes del impacto; el Web
  // Worker simula a los tres conductores y el resultado se compara con la reconstrucción.
  await irAPaso(page, 6);
  await page.getByTestId("conductor-vehiculo").selectOption("V3");
  await page.getByTestId("conductor-instante").fill("2.5");
  await page.getByTestId("conductor-probar").click();
  await expect(page.getByTestId("resultado-conductores")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("decisiones")).toContainText(
    "V3 frena en −2.50 s (la hipótesis del perito)",
  );
  await expect(page.getByTestId("contacto-sin")).not.toBeEmpty();
  expect(errores).toEqual([]);
});
