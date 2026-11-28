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
import { CASOS, type Objetivo } from "./casos-perito";

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
