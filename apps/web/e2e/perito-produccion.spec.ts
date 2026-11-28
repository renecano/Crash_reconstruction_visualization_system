import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { contestarPreguntas, irAPaso, mapaFacil, tocarEnMetros } from "./ayuda-recorrido";

/**
 * Prueba como perito en producción (René, 2026-11-27): diez choques NUEVOS en lugares reales, de La
 * escena al dictamen, con la lectura con IA de producción (una llamada por narración; tope de 15). No
 * corre en CI ni lleva @flujo.
 *
 *   CROQUIS_PERITO_SALIDA=/ruta pnpm exec playwright test -c playwright.produccion.config.ts \
 *     e2e/perito-produccion.spec.ts --headed [-g <clave>]
 *
 * Por cada caso deja, en `CROQUIS_PERITO_SALIDA/<clave>/`, las capturas (escena, cifra, 2D, cámaras,
 * «¿Y si…?», diálogo del video, dictamen) y `notas.json` con los textos que se revisan a mano.
 */
const SALIDA = resolve(process.env.CROQUIS_PERITO_SALIDA ?? "test-results/perito-produccion");

/** El lugar real del choque, de OSM, cuando la narración lo da preciso (un cruce o un lugar conocido). */
type Objetivo = { lat: number; lon: number; que: string };
export const CASOS: { clave: string; texto: string; objetivo?: Objetivo }[] = [
  {
    clave: "moto-cruce",
    objetivo: { lat: 19.29299, lon: -99.65772, que: "cruce Lerdo de Tejada y Nicolás Bravo (OSM)" },
    texto:
      "El hecho ocurrió en el cruce de la avenida Lerdo de Tejada con la calle Nicolás Bravo, en el centro de Toluca, Estado de México, aproximadamente a las 13:20 horas, con cielo despejado. El vehículo A, una motocicleta Italika FT150 modelo 2022, circulaba por Lerdo de Tejada de oriente a poniente a unos 40 km/h. El vehículo B, un Nissan Tsuru modelo 2015, circulaba por Nicolás Bravo de sur a norte y entró al cruce sin respetar el alto. La motocicleta impactó con su parte frontal el costado izquierdo del vehículo B. La motocicleta quedó tendida a 6 metros al noroeste del punto de impacto y el vehículo B se detuvo 3 metros adelante sobre Nicolás Bravo. El motociclista resultó lesionado.",
  },
  {
    clave: "peaton-camellon",
    objetivo: { lat: 19.3699, lon: -99.14158, que: "estación Portales (OSM)" },
    texto:
      "El hecho ocurrió sobre la Calzada de Tlalpan, a la altura de la estación Portales del Metro, en la alcaldía Benito Juárez, Ciudad de México, aproximadamente a las 20:15 horas. Un peatón cruzaba la calzada de poniente a oriente, fuera del paso peatonal, después de bajar del camellón central. El vehículo A, un Volkswagen Jetta modelo 2018, circulaba por el carril izquierdo de los carriles centrales con dirección de norte a sur a unos 60 km/h. El vehículo A atropelló al peatón con su parte frontal derecha. El peatón quedó a 14 metros al sur del punto de impacto y el vehículo se detuvo 22 metros adelante. Se observaron huellas de frenado de 12 metros.",
  },
  {
    clave: "alcance-periferico",
    texto:
      "El hecho ocurrió en los carriles centrales del Anillo Periférico Sur, a la altura de la salida a San Jerónimo, en la alcaldía Álvaro Obregón, Ciudad de México, debajo del segundo piso del Periférico, aproximadamente a las 08:05 horas. El vehículo A, una camioneta Toyota Hilux modelo 2020, circulaba de norte a sur a unos 70 km/h. El vehículo B, un Kia Rio modelo 2021, circulaba adelante por el mismo carril y frenó por el tránsito. El vehículo A impactó con su parte frontal la parte posterior del vehículo B. El vehículo B fue proyectado 9 metros hacia adelante y el vehículo A se detuvo 3 metros después del punto de impacto, en el mismo carril.",
  },
  {
    clave: "noche-lluvia",
    texto:
      "El hecho ocurrió sobre el boulevard Aeropuerto Miguel Alemán, a la altura de San Pedro Totoltepec, en Toluca, Estado de México, aproximadamente a las 22:40 horas, con lluvia intensa y el pavimento mojado. El vehículo A, un Chevrolet Aveo modelo 2017, circulaba de poniente a oriente a unos 80 km/h según su conductor. Al tomar una curva suave perdió el control, cruzó al carril contrario y chocó de frente con el vehículo B, un Nissan Versa modelo 2020, que circulaba de oriente a poniente a unos 50 km/h. Los dos vehículos quedaron sobre la calzada a 4 metros uno del otro.",
  },
  {
    clave: "glorieta",
    objetivo: { lat: 19.42513, lon: -99.17163, que: "Diana Cazadora (Nominatim)" },
    texto:
      "El hecho ocurrió en la glorieta de la Diana Cazadora, sobre Paseo de la Reforma, en la alcaldía Cuauhtémoc, Ciudad de México, aproximadamente a las 16:30 horas. El vehículo A, un Mazda 3 modelo 2019, circulaba dentro de la glorieta en sentido contrario a las manecillas del reloj a unos 35 km/h. El vehículo B, un Honda City modelo 2022, entró a la glorieta desde Paseo de la Reforma con dirección de oriente a poniente sin ceder el paso. El vehículo B impactó con su parte frontal el costado derecho del vehículo A. Ambos vehículos quedaron dentro de la glorieta, a unos 5 metros del punto de impacto.",
  },
  {
    clave: "rebase-carretera",
    texto:
      "El hecho ocurrió en la carretera federal 15, tramo Toluca–Zitácuaro, kilómetro 30, cerca de Villa Victoria, Estado de México, carretera de dos carriles, uno por sentido, aproximadamente a las 11:00 horas. El vehículo A, un Volkswagen Vento modelo 2016, circulaba de oriente a poniente e invadió el carril contrario para rebasar a un camión. El vehículo B, una camioneta Ford Ranger modelo 2018, circulaba de poniente a oriente a unos 90 km/h. Los vehículos chocaron de frente, con su parte frontal izquierda. El vehículo A quedó sobre el acotamiento sur y el vehículo B sobre su carril, a 7 metros del punto de impacto.",
  },
  {
    clave: "volcadura",
    texto:
      "El hecho ocurrió en la autopista Toluca–Atlacomulco, kilómetro 35, en el municipio de Jiquipilco, Estado de México, aproximadamente a las 05:50 horas, con niebla ligera. El vehículo A, una camioneta Nissan NP300 modelo 2019 con carga, circulaba de sur a norte a unos 110 km/h. El conductor se quedó dormido, el vehículo salió del camino por el lado derecho, volcó y dio dos vueltas sobre su costado. Quedó con las llantas hacia arriba a 25 metros del borde de la carretera.",
  },
  {
    clave: "barda",
    texto:
      "El hecho ocurrió en la calle Juan Aldama, en San Mateo Atenco, Estado de México, aproximadamente a las 02:30 horas. El vehículo A, un Dodge Attitude modelo 2016, circulaba de norte a sur a unos 70 km/h. Al llegar a una curva hacia la izquierda el conductor no giró, el vehículo se subió a la banqueta y se impactó con su parte frontal contra la barda de block de una casa. La barda se derrumbó en un tramo de 3 metros y el vehículo quedó detenido contra ella.",
  },
  {
    clave: "vuelta-prohibida",
    objetivo: { lat: 19.29206, lon: -99.65442, que: "cruce Independencia y Juárez (OSM)" },
    texto:
      "El hecho ocurrió en el cruce de la avenida Independencia con la avenida Juárez, frente a los Portales, en el centro de Toluca, Estado de México, aproximadamente a las 12:10 horas. El vehículo A, un Renault Kwid modelo 2021, circulaba por Independencia de poniente a oriente y dio vuelta a la izquierda hacia Juárez donde está prohibido. El vehículo B, un Chevrolet Spark modelo 2018, circulaba por Independencia de oriente a poniente a unos 30 km/h con el semáforo en verde. El vehículo B impactó con su parte frontal el costado derecho del vehículo A. Los dos vehículos quedaron en el cruce, a 3 metros uno del otro.",
  },
  {
    clave: "desierto-chihuahua",
    texto:
      "El hecho ocurrió en la carretera federal 45, tramo Chihuahua–Ciudad Juárez, kilómetro 120, cerca de Villa Ahumada, Chihuahua, en zona desértica, aproximadamente a las 15:00 horas, con viento fuerte y polvo. El vehículo A, un tractocamión Kenworth T680 modelo 2020 con un semirremolque, circulaba de sur a norte a unos 90 km/h. El vehículo B, un Nissan Sentra modelo 2014, circulaba adelante a unos 60 km/h por la poca visibilidad. El vehículo A impactó con su parte frontal la parte posterior del vehículo B. El vehículo B salió del camino por el lado derecho y quedó a 35 metros del punto de impacto; el tractocamión se detuvo 60 metros adelante sobre el acotamiento.",
  },
];

test.use({ viewport: { width: 1600, height: 900 } });

const metros = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const k = (Math.PI / 180) * 6_371_000;
  return {
    este: (b.lon - a.lon) * k * Math.cos((a.lat * Math.PI) / 180),
    norte: (b.lat - a.lat) * k,
  };
};
const choqueMarcado = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __croquisEscena?: { puntos: Record<number, { lat: number; lon: number }> };
        }
      ).__croquisEscena?.puntos?.[1] ?? null,
  );

/**
 * «Dónde quedó»: la posición que dice la narración (si la ofrece) o junto al choque. En producción,
 * «Listo» con la narración no cerraba la pregunta (#390): «Lo marco en el mapa» + «Listo», con la
 * posición ya puesta, la cierra sin moverla.
 */
async function contestarFinal(page: Page, pasos: string[]) {
  const narr = page.getByTestId("final-narracion");
  const usaNarracion = await narr.isVisible().catch(() => false);
  pasos.push(`final: ${usaNarracion ? "narración" : "junto al choque"}`);
  await (usaNarracion ? narr : page.getByTestId("final-junto")).click();
  await page.getByTestId("listo-final").click();
  await page.waitForTimeout(800);
  if (
    usaNarracion &&
    (await page
      .getByTestId("final-marcar")
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByTestId("final-marcar").click();
    await page.getByTestId("listo-final").click();
  }
}

/**
 * Cierra La escena como un perito: acepta lo que Croquis propone salvo el choque, que marca en el lugar
 * real si se conoce (y anota a cuántos metros quedó la propuesta); la posición final, la que dice la
 * narración si la ofrece; lo opcional, «No sé»/«No».
 */
async function cerrarComoPerito(
  page: Page,
  objetivo: Objetivo | undefined,
  notas: Record<string, unknown>,
) {
  const lista = page.getByTestId("lista-escena");
  await expect(lista).toBeVisible({ timeout: 90_000 });
  const guia = page.getByTestId("cerrar-guia");
  if (await guia.isVisible().catch(() => false)) await guia.click();
  await page.waitForTimeout(12_000);
  const pasos: string[] = [];
  let choqueRevisado = false;
  for (let k = 0; k < 40; k++) {
    if (!choqueRevisado && objetivo) {
      const p = await choqueMarcado(page);
      if (p) {
        choqueRevisado = true;
        const d = metros(p, objetivo);
        notas.propuesta_choque_m = Math.round(Math.hypot(d.este, d.norte));
        if (Math.hypot(d.este, d.norte) > 20) {
          try {
            const corregir = page.getByTestId("corregir-choque-1");
            await (
              (await corregir.isVisible().catch(() => false))
                ? corregir
                : page.getByTestId("cambiar-choque-1")
            ).click({ timeout: 15_000 });
            // Como el perito: «No, lo marco yo», pega las coordenadas del cruce y toca ahí.
            const yo = page.getByTestId("marco-yo");
            if (await yo.isVisible().catch(() => false)) await yo.click();
            const buscar = page.getByTestId("escena-buscar");
            await buscar.fill(`${objetivo.lat}, ${objetivo.lon}`);
            await buscar.press("Enter");
            await page
              .getByRole("button", { name: "Buscar", exact: true })
              .click({ timeout: 5_000 })
              .catch(() => undefined);
            await page.waitForTimeout(5000);
            const mapa = await mapaFacil(page);
            const caja = (await mapa.boundingBox())!;
            await mapa.click({ position: { x: caja.width * 0.5, y: caja.height * 0.5 } });
            await page.waitForTimeout(1500);
          } catch (e) {
            notas.choque_no_se_pudo_corregir = String(e).slice(0, 300);
          }
          // Ajuste fino: ya con el lugar a la vista, a la distancia exacta desde el choque.
          for (let intento = 0; intento < 2; intento++) {
            const q0 = await choqueMarcado(page);
            const r0 = q0 ? metros(q0, objetivo) : null;
            if (!r0 || Math.hypot(r0.este, r0.norte) <= 8) break;
            try {
              const cambiar = page.getByTestId("cambiar-choque-1");
              // Solo desde la lista: tocar el mapa a media pregunta contestaría otra cosa.
              if (!(await cambiar.isVisible().catch(() => false))) break;
              await cambiar.click({ timeout: 10_000 });
              await expect(page.getByTestId("choque-1")).toBeVisible({ timeout: 10_000 });
              await tocarEnMetros(page, "choque-1", r0.este, r0.norte);
              await page.waitForTimeout(1500);
            } catch (e) {
              notas.ajuste_fino = String(e).slice(0, 200);
              break;
            }
          }
          const q = await choqueMarcado(page);
          const r = q ? metros(q, objetivo) : null;
          notas.choque_corregido_m = r ? Math.round(Math.hypot(r.este, r.norte)) : null;
          pasos.push("choque movido al lugar real");
          continue;
        }
      }
    }
    // Las preguntas de una en una (después de corregir el choque, Croquis vuelve a preguntar).
    if (!(await lista.isVisible().catch(() => false))) {
      const titulo = (
        await page
          .getByTestId("escena-pregunta")
          .first()
          .innerText()
          .catch(() => "")
      ).trim();
      if (!titulo) {
        await page.waitForTimeout(1500);
        continue;
      }
      pasos.push(`pregunta: ${titulo}`);
      if (titulo.startsWith("¿Por dónde venía")) {
        const propuesta = page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]');
        const hay = await propuesta.count();
        if (!hay) pasos.push("direccion SIN propuesta: la primera");
        await (hay ? propuesta.first() : page.getByTestId("opcion-flecha-0")).click();
      } else if (titulo.startsWith("¿Dónde quedó")) {
        await contestarFinal(page, pasos);
      } else {
        let hecho = false;
        for (const b of ["golpe-nose", "otros-no", "paso-listo", "terreno-liso"]) {
          const x = page.getByTestId(b);
          if (await x.isVisible().catch(() => false)) {
            await x.click();
            hecho = true;
            break;
          }
        }
        if (!hecho) {
          notas.pregunta_sin_respuesta = titulo;
          break;
        }
      }
      await page.waitForTimeout(1500);
      continue;
    }
    const ver = page.getByTestId("lista-ver-reconstruccion");
    if (await ver.isEnabled().catch(() => false)) break;
    const confirmar = page.locator('[data-testid^="confirmar-"]').first();
    if (await confirmar.isVisible().catch(() => false)) {
      pasos.push(String(await confirmar.getAttribute("data-testid")));
      await confirmar.click();
      continue;
    }
    const marcar = page.locator('[data-testid^="marcar-"]').first();
    if (!(await marcar.isVisible().catch(() => false))) break;
    const id = (await marcar.getAttribute("data-testid")) ?? "";
    pasos.push(id);
    await marcar.click();
    if (id.startsWith("marcar-choque")) {
      const mapa = await mapaFacil(page);
      const caja = (await mapa.boundingBox())!;
      await mapa.click({ position: { x: caja.width * 0.5, y: caja.height * 0.5 } });
    } else if (id.startsWith("marcar-direccion")) {
      const propuesta = page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]');
      const hay = await propuesta.count();
      pasos.push(hay ? "direccion propuesta" : "direccion SIN propuesta: la primera");
      await (hay ? propuesta.first() : page.getByTestId("opcion-flecha-0")).click();
    } else if (id.startsWith("marcar-final")) {
      await contestarFinal(page, pasos);
    } else {
      for (const b of ["golpe-nose", "otros-no", "paso-listo", "terreno-liso"]) {
        const x = page.getByTestId(b);
        if (await x.isVisible().catch(() => false)) {
          await x.click();
          break;
        }
      }
    }
    await page.waitForTimeout(1500);
  }
  notas.pasos_escena = pasos;
  notas.escena_diagnostico = await page.evaluate(() =>
    JSON.stringify(
      (window as unknown as { __croquisEscena?: unknown }).__croquisEscena ?? null,
    ).slice(0, 20000),
  );
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __croquisVisorUnity?: boolean }).__croquisVisorUnity = true;
    localStorage.setItem("croquis.escena", "nueva");
    (window as unknown as { __croquisDiagnostico?: boolean }).__croquisDiagnostico = true;
  });
});

const texto = async (page: Page, testid: string) =>
  (
    await page
      .getByTestId(testid)
      .first()
      .innerText()
      .catch(() => "")
  ).replace(/\s+/g, " ");

for (const c of CASOS) {
  test(`perito en producción: ${c.clave}`, async ({ page }) => {
    test.setTimeout(2_400_000);
    const dir = join(SALIDA, c.clave);
    mkdirSync(dir, { recursive: true });
    const foto = (n: string) =>
      page.screenshot({ path: join(dir, `${n}.jpg`), quality: 80, type: "jpeg" });
    const notas: Record<string, unknown> = { clave: c.clave, inicio: new Date().toISOString() };
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    const guardar = () =>
      writeFileSync(join(dir, "notas.json"), JSON.stringify({ ...notas, errores }, null, 2) + "\n");
    // Solo lecturas grabadas (René, 2026-11-28: ya van 14 de 15 lecturas con IA). Sin la grabada, la
    // prueba falla en vez de llamar a la IA; `CROQUIS_PERITO_LEER_CON_IA=1` permite grabar una nueva.
    const grabada = join(SALIDA, "lecturas", `${c.clave}.json`);
    const puedeLeer = process.env.CROQUIS_PERITO_LEER_CON_IA === "1";
    expect(
      existsSync(grabada) || puedeLeer,
      `Sin la lectura grabada de ${c.clave} (${grabada}): no se llama a la IA.`,
    ).toBe(true);
    await page.route("**/api/cesvi/escena", async (r) => {
      if (existsSync(grabada)) {
        notas.lectura = "grabada";
        return r.fulfill({ json: JSON.parse(readFileSync(grabada, "utf8")) });
      }
      if (!puedeLeer) return r.abort();
      const resp = await r.fetch();
      const cuerpo = await resp.text();
      if (resp.ok()) {
        mkdirSync(join(SALIDA, "lecturas"), { recursive: true });
        writeFileSync(grabada, cuerpo);
      }
      notas.lectura = `producción (${resp.status()})`;
      return r.fulfill({ response: resp, body: cuerpo });
    });
    try {
      await page.goto("/cesvi");
      await page.getByTestId("ir-caso-nuevo").click();
      await irAPaso(page, 2);
      await page.getByTestId("narracion").fill(c.texto);
      await page.getByTestId("leer-narracion").click();
      await expect(page.getByTestId("escena")).toContainText("vehículo", { timeout: 240_000 });
      await contestarPreguntas(page);
      await irAPaso(page, 3);
      await cerrarComoPerito(page, c.objetivo, notas);
      await page.waitForTimeout(3000);
      await foto("1-escena");
      notas.escena = (await texto(page, "lista-escena")).slice(0, 2500);
      await page.getByTestId("lista-ver-reconstruccion").click({ timeout: 60_000 });
      await page.getByTestId("reconstruir").click({ timeout: 60_000 });
      await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 300_000 });
      await page.waitForTimeout(4000);
      notas.cifra = await texto(page, "cifra-reconstruccion");
      notas.rango = await texto(page, "cifra-rango");
      notas.panel = (await texto(page, "panel-paso")).slice(0, 3000);
      await foto("2-cifra");
      // El 2D.
      const boton2d = page.getByRole("button", { name: "2D", exact: true }).first();
      if (await boton2d.isVisible().catch(() => false)) await boton2d.click();
      await page.waitForTimeout(1500);
      await foto("3-2d-pantalla");
      const croquis = page.getByTestId("croquis-pericial").first();
      if (await croquis.isVisible().catch(() => false)) {
        await croquis.scrollIntoViewIfNeeded();
        await croquis.screenshot({ path: join(dir, "3-2d.jpg"), quality: 85, type: "jpeg" });
      } else notas.sin_2d = true;
      // El 3D con sus cámaras.
      await page.getByTestId("vista-3d").click();
      await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
        timeout: 300_000,
      });
      await page
        .getByRole("button", { name: "Ir al impacto" })
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(3000);
      notas.camaras = await page
        .locator('[data-testid^="camara-"]')
        .evaluateAll((xs) => xs.map((x) => x.getAttribute("data-testid")));
      for (const modo of ["automatica", "cinematica", "cenital", "acera"]) {
        const b = page.getByTestId(`camara-${modo}`).first();
        if (!(await b.isVisible().catch(() => false))) continue;
        await b.click();
        await page.waitForTimeout(3500);
        await foto(`4-3d-${modo}`);
      }
      // El video (René, 2026-11-28: revisarlo en cada caso). Antes del «¿Y si…?»: con una hipótesis a
      // la vista la app no ofrece el video. Se graba el que ofrece por omisión y se mide el MP4.
      const grabar = page.getByTestId("descargar-video");
      if (await grabar.isVisible().catch(() => false)) {
        await grabar.click();
        await page.waitForTimeout(1200);
        notas.video = (
          await page
            .getByRole("dialog")
            .first()
            .innerText()
            .catch(() => "")
        ).replace(/\s+/g, " ");
        await foto("6-video");
        if (process.env.CROQUIS_PERITO_VIDEO) {
          const t0 = Date.now();
          // Si la app avisa que tardará («Tarda ~13 min en esta computadora. ¿Seguir grabando?»), sí.
          const seguir = page.getByTestId("video-seguir");
          const [descarga] = await Promise.all([
            page.waitForEvent("download", { timeout: 1_500_000 }),
            page
              .getByTestId("video-grabar")
              .click()
              .then(() => seguir.click({ timeout: 60_000 }).catch(() => undefined)),
          ]);
          const destino = join(dir, `video-${c.clave}.mp4`);
          copyFileSync(await descarga.path(), destino);
          const bytes = readFileSync(destino);
          const entrada = new Input({
            formats: ALL_FORMATS,
            source: new BufferSource(
              bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
            ),
          });
          const pista = (await entrada.getPrimaryVideoTrack())!;
          notas.video_mp4 = {
            segundos_grabando: Math.round((Date.now() - t0) / 1000),
            mb: Math.round((bytes.length / 1e6) * 10) / 10,
            codec: await pista.getCodec(),
            ancho: pista.displayWidth,
            alto: pista.displayHeight,
            duracion_s: Math.round((await entrada.computeDuration()) * 100) / 100,
          };
        } else await page.keyboard.press("Escape");
      } else notas.sin_video = true;
      // «¿Y si…?»: 20 km/h más que lo calculado para el primer vehículo.
      const ysi = page.getByTestId("abrir-ysi").first();
      if (await ysi.isVisible().catch(() => false)) {
        await ysi.click();
        const campo = page.locator('[data-testid^="ysi-kmh-"]').first();
        const v = Number((await campo.inputValue().catch(() => "")) || "50");
        await campo.fill(String(Math.round(v + 20)));
        await page.getByTestId("ysi-simular").click();
        await expect(page.getByTestId("ysi-resultado")).toBeVisible({ timeout: 180_000 });
        notas.ysi = await texto(page, "ysi-resultado");
        const ver = page.getByTestId("ysi-ver");
        if (await ver.isVisible().catch(() => false)) {
          await ver.click();
          await page.waitForTimeout(4000);
          await foto("5-ysi");
        }
      } else notas.sin_ysi = true;
      // El dictamen.
      await irAPaso(page, 9);
      await page.waitForTimeout(15_000);
      notas.dictamen = (await texto(page, "panel-paso")).slice(0, 3000);
      await foto("7-dictamen");
    } finally {
      notas.fin = new Date().toISOString();
      guardar();
    }
  });
}
