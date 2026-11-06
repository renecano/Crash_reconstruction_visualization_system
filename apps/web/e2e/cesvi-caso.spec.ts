import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { irAPaso, mapaFacil, sinRed, tocarEnMetros } from "./ayuda-recorrido";

// La transición entre actos (ADR 0108) es decorativa: estos flujos prueban la función, y en CI (render
// por software) la cortina a pantalla completa compite con el 3D. Con movimiento reducido no se monta.
test.use({ reducedMotion: "reduce" });

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

  await sinRed(page);
  await irAPaso(page, 3);
  // 3. La escena fácil (René, 2026-11-05): una pregunta a la vez. «Ver la reconstrucción» espera a
  // que todo esté listo.
  const verReconstruccion = page.getByTestId("avance-ver-reconstruccion");
  await expect(verReconstruccion).toBeDisabled();
  const pregunta = page.getByTestId("escena-pregunta");
  await expect(pregunta).toHaveText("¿Dónde fue el choque?");
  const mapaEscena = await mapaFacil(page);
  const caja = (await mapaEscena.boundingBox())!;
  // El choque, con un toque (sin calles del mapa, se queda donde se tocó).
  await mapaEscena.click({ position: { x: caja.width * 0.7, y: caja.height * 0.45 } });
  await expect(page.getByTestId("mensaje-exito")).toContainText("¡Listo! El choque quedó marcado.");
  await expect(page.getByTestId("choque-1")).toHaveCount(1);
  // Por dónde venía el Jetta (nunca «V1»): sin calles, cuatro flechas por puntos cardinales, con la
  // de Croquis resaltada.
  await expect(pregunta).toHaveText("¿Por dónde venía el Jetta?");
  await expect(page.locator('[data-testid^="opcion-flecha-"]')).toHaveCount(4);
  await expect(page.locator('[data-testid^="flecha-"]')).toHaveCount(4);
  await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]').click();
  // Dónde quedó: «Listo» espera el toque; el coche va ahí y se gira 15° con su botón.
  await expect(pregunta).toHaveText("¿Dónde quedó después del choque?");
  await expect(page.getByTestId("listo-final")).toBeDisabled();
  await tocarEnMetros(page, "choque-1", 6, 8);
  await expect(page.getByTestId("coche-V1-final")).toHaveCount(1);
  await page.getByTestId("girar-derecha").click();
  await page.getByTestId("listo-final").click();
  await expect(page.getByTestId("mensaje-exito")).toContainText("dónde quedó el Jetta");
  // El Camaro: «No sé por dónde venía» (Croquis usa la de los daños, como supuesto) y «Quedó junto
  // al choque».
  await expect(pregunta).toHaveText("¿Por dónde venía el Camaro?");
  await page.getByTestId("no-se-direccion").click();
  await page.getByTestId("final-junto").click();
  await page.getByTestId("listo-final").click();
  // ¡La escena está lista!, con el resumen y el supuesto explicado.
  await expect(page.getByTestId("escena-lista")).toBeVisible();
  const resumen = page.getByTestId("escena-resumen");
  await expect(resumen).toContainText("El Jetta venía del");
  await expect(resumen).toContainText("donde lo pusiste");
  await expect(resumen).toContainText("Quedó junto al choque.");
  await expect(resumen).toContainText("Supuesto");
  await expect(resumen).toContainText("No sabías por dónde venía");
  await expect(verReconstruccion).toBeEnabled();
  const mapa = page.getByTestId("mapa-escena");

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
  // El croquis 2D sigue al reloj del 3D: al volver al mapa (el mapa se desmonta mientras el 3D
  // está a la vista, ADR 0104), los vehículos de la reconstrucción están donde quedó el reloj.
  await page.getByTestId("vista-mapa").click();
  await expect(mapa.locator('[data-movil="V1"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(mapa.locator('[data-movil="V2"]')).toHaveCount(1);
  await page.getByTestId("vista-3d").click();
  await expect(visor.locator("canvas").first()).toBeVisible({ timeout: 60_000 });

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
  // Con las velocidades reconstruidas (§0 del rediseño): energía, Δv y el perfil estimado, sin ceros.
  const danoV1 = page.getByTestId("dano-calculado-V1");
  await expect(danoV1).toContainText("perfil estimado", { timeout: 60_000 });
  await expect(danoV1).toContainText("kJ");
  await expect(danoV1).not.toContainText(" 0.0 kJ");
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
  // «En el impacto» y «en reposo» no son la misma foto (René, 2026-11-04: salían idénticas).
  const diferencia = await page.evaluate(async () => {
    const cs =
      (window as unknown as { __croquisCuadrosDictamen?: { etiqueta: string; imagen: string }[] })
        .__croquisCuadrosDictamen ?? [];
    const impacto = cs.find((c) => c.etiqueta.startsWith("En el impacto"));
    const reposo = cs.find((c) => c.etiqueta.startsWith("En reposo"));
    if (!impacto || !reposo) return -1;
    const pixeles = async (src: string) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const a = await pixeles(impacto.imagen);
    const b = await pixeles(reposo.imagen);
    let distintos = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d =
        Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
      if (d > 48) distintos++;
    }
    return distintos / (a.length / 4);
  });
  expect(
    diferencia,
    "fracción de píxeles distintos entre «en el impacto» y «en reposo»",
  ).toBeGreaterThan(0.02);
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
  // El archivo del caso lleva su extensión (A4); los .json de antes se siguen abriendo.
  expect(archivo.suggestedFilename()).toMatch(/\.croquis$/);
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
  // Lo que eligió la persona es suyo; «No sé por dónde venía» deja la de Croquis como supuesto.
  const fuenteDe = (v: string, fase: string) =>
    posiciones.find((p) => p.vehiculo === v && p.fase === fase)!.fuente;
  expect(fuenteDe("V1", "impacto")).toBe("perito");
  expect(fuenteDe("V2", "impacto")).toBe("supuesto");
  expect(fuenteDe("V1", "final")).toBe("perito");
  expect(fuenteDe("V2", "final")).toBe("perito");
  // El Jetta quedó con su rumbo de llegada girado 15° (el botón); el Camaro, junto al choque, con el
  // suyo.
  const rumboDe = (v: string, fase: string) =>
    posiciones.find((p) => p.vehiculo === v && p.fase === fase)!.rumbo;
  expect(rumboDe("V1", "final")).toBe((rumboDe("V1", "impacto") + 15) % 360);
  expect(rumboDe("V2", "final")).toBe(rumboDe("V2", "impacto"));
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
  // El hecho, ya leído: el relato marcado (Laboratorio §8).
  await expect(page.getByTestId("relato")).toContainText("Jetta");
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

  await sinRed(page);
  await irAPaso(page, 3);
  // 2. La escena fácil, a metros: los tres en fila hacia el oriente, B y C detenidos en el semáforo;
  // la misma disposición que la escena canónica `carambola`. Un paso por choque y por vehículo.
  const pregunta = page.getByTestId("escena-pregunta");
  const mapaEscena = await mapaFacil(page);
  const caja = (await mapaEscena.boundingBox())!;
  await expect(pregunta).toHaveText("¿Dónde fue el primer choque?");
  await mapaEscena.click({ position: { x: caja.width * 0.62, y: caja.height * 0.45 } });
  await expect(pregunta).toHaveText("¿Dónde fue el segundo choque?");
  await tocarEnMetros(page, "choque-1", 5.6, 0);
  await expect(page.getByTestId("choque-2")).toHaveCount(1);
  // A venía del oeste (avanzaba al oriente); de B y C se acepta lo que propone Croquis por sus zonas
  // de contacto. Cada uno quedó a lo largo de la calle.
  for (const [nombre, este] of [
    ["V1", -0.5],
    ["V2", 5.4],
    ["V3", 9.8],
  ] as const) {
    await expect(pregunta).toHaveText(/^¿Por dónde venía el /);
    await (
      nombre === "V1"
        ? page.locator('[data-testid^="opcion-flecha-"]', { hasText: "Del oeste" })
        : page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]')
    ).click();
    await expect(pregunta).toHaveText("¿Dónde quedó después del choque?");
    await tocarEnMetros(page, "choque-1", este, 0);
    await expect(page.getByTestId(`coche-${nombre}-final`)).toHaveCount(1);
    await page.getByTestId("listo-final").click();
  }
  await expect(page.getByTestId("escena-lista")).toBeVisible();
  await expect(page.getByTestId("avance-ver-reconstruccion")).toBeEnabled();
  const mapa = page.getByTestId("mapa-escena");

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
  await page.getByTestId("vista-mapa").click();
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
  // Si sin la hipótesis el primer contacto no es el primer impacto reconstruido, se avisa (ADR 0088).
  await expect(page.getByTestId("linea-base-distinta")).toContainText(
    "la reconstrucción tiene primero V1 con V2",
  );
  expect(errores).toEqual([]);
});
