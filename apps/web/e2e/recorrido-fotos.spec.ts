import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { cerrarLaEscena, contestarPreguntas, irAPaso } from "./ayuda-recorrido";
import { colocar, RECETAS } from "./recetas-ejemplos";

/**
 * Las fotos del recorrido de la app (René, 2026-11-21: «las necesito ya»), para las piezas
 * promocionales: pantalla por pantalla, en la demo local de la tanda (la versión que se publica), con el
 * Unity real en calidad alta, a 2560×1440 con deviceScaleFactor 2 (`playwright.recorrido.config.ts`).
 *
 * Dos juegos, en carpetas separadas:
 * - `publico`: los cinco ejemplos y las narraciones inventadas de la ronda 4 (lecturas grabadas, sin
 *   llamar a Claude); sin AXA ni datos reales.
 * - `solo-cesvi`: el recorrido con AXA.
 *
 * Cada foto se toma solo si la pantalla está bien: sin el visor de respaldo, con el 3D en «listo» si
 * es del 3D, sin un error a la vista y sin errores de la página desde la foto anterior. Si no, se
 * repite (hasta 3 veces); si no se arregla, se anota en `resumen.json` y no se guarda. Cada juego
 * tiene un tope de tamaño para que la rama de resultados lo acepte.
 */
const RAIZ = resolve(__dirname, "../../..");
const SALIDA = resolve(RAIZ, process.env.CROQUIS_RECORRIDO ?? "recorrido");
/** Bytes por juego: lo que GitHub acepta sin problema en un push de la tanda. */
const TOPE_POR_JUEGO = 700 * 1024 * 1024;
const INTENTOS = 3;

type Juego = "publico" | "solo-cesvi";
interface Foto {
  archivo: string;
  ok: boolean;
  bytes?: number;
  motivo?: string;
  nota?: string;
}
interface Resumen {
  juego: Juego;
  fotos: Foto[];
  cifras: Record<string, string>;
  bien: number;
  mal: number;
}

function resumenDe(juego: Juego): Resumen {
  const ruta = join(SALIDA, juego, "resumen.json");
  if (existsSync(ruta)) return JSON.parse(readFileSync(ruta, "utf8")) as Resumen;
  return { juego, fotos: [], cifras: {}, bien: 0, mal: 0 };
}

function guardarResumen(r: Resumen) {
  r.bien = r.fotos.filter((f) => f.ok).length;
  r.mal = r.fotos.filter((f) => !f.ok).length;
  mkdirSync(join(SALIDA, r.juego), { recursive: true });
  writeFileSync(join(SALIDA, r.juego, "resumen.json"), JSON.stringify(r, null, 2) + "\n");
}

/** Cierra los mensajes que tienen su «Cerrar» (como el de las calles que no llegaron). */
async function sinAvisos(page: Page) {
  for (let k = 0; k < 4; k++) {
    const cerrar = page.locator('button[aria-label="Cerrar el mensaje"]:visible');
    if (!(await cerrar.count())) return;
    await cerrar.first().click();
    await page.waitForTimeout(400);
  }
}

/** Que la página termine de entrar y de calcular. */
async function quieta(page: Page, extra = 2500) {
  await page.waitForTimeout(extra);
  await expect(page.getByTestId("maqueta-calculando")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId("presentar-calculando")).toHaveCount(0, { timeout: 120_000 });
}

/** El 3D de Unity en «listo» (nunca el respaldo). */
async function unityListo(page: Page) {
  await page.getByTestId("vista-3d").first().click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 300_000,
  });
  await page.waitForTimeout(5000);
}

/** Lo que tiene mal la pantalla, o null si está bien para la foto. */
async function problema(page: Page, errores: string[], tresD: boolean): Promise<string | null> {
  if (
    await page
      .getByTestId("visor-unity-respaldo")
      .isVisible()
      .catch(() => false)
  )
    return "el visor de respaldo";
  if (tresD) {
    const fase = await page
      .getByTestId("visor-unity")
      .getAttribute("data-fase")
      .catch(() => null);
    if (fase !== "listo") return `el 3D en «${fase ?? "sin visor"}»`;
  }
  const alerta = page.locator('[role="alert"]:visible');
  if (await alerta.count()) {
    const t = ((await alerta.first().textContent()) ?? "").replace(/\s+/g, " ").trim();
    if (/error|no se pudo|falló/i.test(t)) return `un error a la vista: «${t.slice(0, 160)}»`;
  }
  if (errores.length) return `error de la página: ${errores.join(" | ").slice(0, 300)}`;
  return null;
}

/** Un fotógrafo por juego: toma, revisa, repite y anota. */
function fotografo(page: Page, juego: Juego) {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  const resumen = resumenDe(juego);
  mkdirSync(join(SALIDA, juego), { recursive: true });
  const usado = () => resumen.fotos.reduce((a, f) => a + (f.ok ? (f.bytes ?? 0) : 0), 0);
  const anotar = (f: Foto) => {
    resumen.fotos = [...resumen.fotos.filter((x) => x.archivo !== f.archivo), f];
    guardarResumen(resumen);
  };
  return {
    resumen,
    /** Una foto; `rehacer` vuelve a poner la pantalla si salió mal (por ejemplo, reabrir el 3D). */
    async foto(
      nombre: string,
      o: { tresD?: boolean; rehacer?: () => Promise<void>; nota?: string } = {},
    ) {
      const archivo = `${nombre}.png`;
      const ruta = join(SALIDA, juego, archivo);
      let motivo: string | null = "sin intentar";
      for (let k = 0; k < INTENTOS; k++) {
        try {
          await sinAvisos(page);
          motivo = await problema(page, errores, Boolean(o.tresD));
          if (!motivo) {
            const png = await page.screenshot({ type: "png" });
            if (usado() + png.length > TOPE_POR_JUEGO) {
              motivo = "el juego llegó a su tope de tamaño";
              break;
            }
            writeFileSync(ruta, png);
            anotar({ archivo, ok: true, bytes: png.length, ...(o.nota ? { nota: o.nota } : {}) });
            return true;
          }
        } catch (e) {
          motivo = `no se pudo tomar: ${(e as Error).message.split("\n")[0]}`;
        }
        // Se repite: limpia lo que ya se anotó y vuelve a poner la pantalla.
        errores.length = 0;
        try {
          if (o.rehacer) await o.rehacer();
          else await page.waitForTimeout(4000);
        } catch {
          // Si no se puede rehacer, el siguiente intento lo dice.
        }
      }
      if (existsSync(ruta)) unlinkSync(ruta);
      anotar({ archivo, ok: false, motivo: motivo ?? "desconocido" });
      return false;
    },
    /** Una pantalla que no aplica a este caso: se anota, sin foto. */
    omitir(nombre: string, motivo: string) {
      anotar({ archivo: `${nombre}.png`, ok: false, motivo: `no aplica: ${motivo}` });
    },
    cifra(clave: string, texto: string) {
      resumen.cifras[clave] = texto.replace(/\s+/g, " ").trim();
      guardarResumen(resumen);
    },
  };
}

/** El tema claro, el Unity real y la escena nueva (la lista). */
async function preparar(page: Page) {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
    try {
      localStorage.setItem("croquis.cesvi.tema.trabajar", "claro");
      localStorage.setItem("croquis.cesvi.tema.presentar", "claro");
      localStorage.setItem("croquis.escena", "nueva");
    } catch {
      // Sin almacenamiento: el tema del sistema (emulado arriba).
    }
  });
}

/** Las seis narraciones inventadas de la ronda 4 y su lectura grabada (sin llamar a Claude). */
function narracion(clave: string): { texto: string; salida: unknown } {
  const claves = ["arbol", "poste", "puente", "subida", "bajada", "curva"];
  const md = readFileSync(join(RAIZ, "docs/cesvi/ronda-4/narraciones-fisica.md"), "utf8");
  const texto = [...md.matchAll(/^> (.+)$/gm)].map((m) => m[1]!.trim())[claves.indexOf(clave)]!;
  const g = JSON.parse(
    readFileSync(join(RAIZ, `data/cesvi/grabaciones/ronda4/ronda4-${clave}.json`), "utf8"),
  ) as { salida: unknown };
  return { texto, salida: g.salida };
}

/** Una narración hasta la reconstrucción, por la escena nueva. */
async function narracionHastaReconstruir(page: Page, clave: string) {
  const n = narracion(clave);
  await page.route("**/api/cesvi/escena", (r) =>
    r.fulfill({ json: { metodo: "claude", salida: n.salida } }),
  );
  await page.goto("/cesvi?calidad=alta");
  await page.getByTestId("ir-caso-nuevo").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible();
  await irAPaso(page, 2);
  await page.getByTestId("narracion").fill(n.texto);
  return n;
}

/** Los cuatro primeros cuadros de «Presentar». */
async function presentar(page: Page, f: ReturnType<typeof fotografo>, prefijo: string) {
  await page.getByTestId("modo-presentar").click();
  await expect(page.getByTestId("presentar-caso")).toBeVisible({ timeout: 60_000 });
  await quieta(page, 7000);
  await f.foto(`${prefijo}-1`);
  for (let k = 2; k <= 4; k++) {
    await page.keyboard.press("ArrowRight");
    await quieta(page, 6000);
    await f.foto(`${prefijo}-${k}`);
  }
}

/** Las tomas del 3D: el impacto, desde atrás y en cámara lenta. */
async function tomas3d(page: Page, f: ReturnType<typeof fotografo>, prefijo: string) {
  const reabrir = async () => {
    await page.getByTestId("vista-maqueta").first().click();
    await page.waitForTimeout(1500);
    await unityListo(page);
    await page.getByTestId("ir-al-impacto-unity").click();
    await page.waitForTimeout(2500);
  };
  await unityListo(page).catch(() => undefined);
  await page
    .getByTestId("ir-al-impacto-unity")
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(2500);
  await f.foto(`${prefijo}-3d-impacto`, { tresD: true, rehacer: reabrir });
  const detras = page.getByTestId("vista-detras");
  if (await detras.count()) {
    await detras.click();
    await page.waitForTimeout(5000);
    await f.foto(`${prefijo}-3d-detras`, { tresD: true });
  }
  // La cámara lenta: a 0.25×, desde el principio, a la mitad del camino al impacto.
  const lenta = page.getByTestId("velocidad-unity-0.25");
  if (await lenta.count()) {
    await lenta.click();
    await page.getByTestId("repetir-unity").click();
    await page.waitForTimeout(3500);
    await f.foto(`${prefijo}-3d-camara-lenta`, { tresD: true, nota: "reproduciendo a 0.25×" });
    await page
      .getByTestId("velocidad-unity-1")
      .click()
      .catch(() => undefined);
  }
}

test.describe.configure({ mode: "serial" });

test("publico · el recorrido completo con la narración del árbol", async ({ page }) => {
  await preparar(page);
  const f = fotografo(page, "publico");
  // «Casos» trae la tarjeta del caso de AXA (real): en este juego se oculta, y así se anota.
  await page.goto("/cesvi?calidad=alta");
  await page.addStyleTag({ content: '[data-testid="ir-axa"]{display:none !important}' });
  await quieta(page);
  await f.foto("01-casos", {
    nota: "sin la tarjeta del caso de AXA (oculta para el juego público)",
  });

  await narracionHastaReconstruir(page, "arbol");
  await quieta(page);
  await f.foto("02-el-hecho-narracion");
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("vehículo", { timeout: 180_000 });
  await contestarPreguntas(page);
  await quieta(page, 3000);
  await f.foto("03-el-hecho-lectura");

  await irAPaso(page, 3);
  await cerrarLaEscena(page);
  await quieta(page, 3000);
  await f.foto("04-la-escena-lista");
  // Rotar al colocar: el vehículo seleccionado y su giro.
  const elegir = page.locator('[data-testid^="elegir-coche-"]').first();
  if (await elegir.isVisible().catch(() => false)) {
    await elegir.click();
    const girar = page.getByTestId("sel-girar-der");
    if (await girar.isVisible({ timeout: 5000 }).catch(() => false)) {
      await girar.click();
      await page.waitForTimeout(1200);
      await f.foto("05-la-escena-rotar");
      await page.getByTestId("sel-girar-izq").click();
    } else f.omitir("05-la-escena-rotar", "el vehículo seleccionado no ofrece girar");
    await page.keyboard.press("Escape");
  } else f.omitir("05-la-escena-rotar", "no apareció la selección del vehículo");

  await page.getByTestId("lista-ver-reconstruccion").click();
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
  await quieta(page, 4000);
  f.cifra("arbol", await page.getByTestId("cifra-reconstruccion").innerText());
  await f.foto("06-reconstruccion");
  await page.getByTestId("vista-maqueta").first().click();
  await quieta(page, 4000);
  await f.foto("07-reconstruccion-2d-croquis-pericial");
  await tomas3d(page, f, "08-reconstruccion-arbol");

  await irAPaso(page, 5);
  await quieta(page);
  await f.foto("09-versiones");
  await irAPaso(page, 6);
  await quieta(page);
  await f.foto("10-analisis-danos");
  await irAPaso(page, 7);
  await quieta(page);
  await f.foto("11-analisis-numeros");
  f.omitir(
    "12-contra-cesvi",
    "un caso nuevo no tiene reporte de CESVI (está en el juego SOLO-CESVI)",
  );
  await irAPaso(page, 9);
  await quieta(page, 8000);
  await f.foto("13-dictamen");
  await presentar(page, f, "14-presentar");
});

test("publico · el puente y las otras narraciones en el 3D", async ({ page }) => {
  test.setTimeout(3_600_000);
  await preparar(page);
  const f = fotografo(page, "publico");
  for (const clave of ["puente", "poste", "subida", "bajada", "curva"]) {
    try {
      await narracionHastaReconstruir(page, clave);
      await page.getByTestId("leer-narracion").click();
      await expect(page.getByTestId("escena")).toContainText("vehículo", { timeout: 180_000 });
      await contestarPreguntas(page);
      await irAPaso(page, 3);
      await cerrarLaEscena(page);
      await page.getByTestId("lista-ver-reconstruccion").click();
      await page.getByTestId("reconstruir").click();
      await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
      await quieta(page, 4000);
      f.cifra(clave, await page.getByTestId("cifra-reconstruccion").innerText());
      await f.foto(`20-${clave}-reconstruccion`);
      await tomas3d(page, f, `20-${clave}`);
    } catch (e) {
      f.omitir(`20-${clave}`, `no llegó al 3D: ${(e as Error).message.split("\n")[0]}`);
    }
    await page.unroute("**/api/cesvi/escena");
  }
});

test("publico · los cinco ejemplos", async ({ page }) => {
  test.setTimeout(3_600_000);
  await preparar(page);
  // Los ejemplos se colocan con su receta en la escena de siempre (la de las e2e de los ejemplos).
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("croquis.escena");
    } catch {
      // nada
    }
  });
  const f = fotografo(page, "publico");
  for (const r of RECETAS) {
    try {
      await page.goto("/cesvi?calidad=alta");
      await page.getByTestId("ir-caso-nuevo").click();
      await expect(page.getByTestId("recorrido-caso")).toBeVisible();
      await irAPaso(page, 2);
      await page.locator(`[data-ejemplo="${r.clave}"]`).click();
      await page.getByTestId("leer-narracion").click();
      await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
      await irAPaso(page, 3);
      if (!(await colocar(page, r, []))) throw new Error("la receta no terminó la escena");
      await quieta(page);
      await f.foto(`30-${r.clave}-la-escena`);
      await page.getByTestId("avance-ver-reconstruccion").click();
      await page.getByTestId("reconstruir").click();
      await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
      await quieta(page, 4000);
      f.cifra(r.clave, await page.getByTestId("cifra-reconstruccion").innerText());
      await f.foto(`30-${r.clave}-reconstruccion`);
      await tomas3d(page, f, `30-${r.clave}`);
    } catch (e) {
      f.omitir(`30-${r.clave}`, `no llegó al 3D: ${(e as Error).message.split("\n")[0]}`);
    }
  }
});

test("SOLO-CESVI · el recorrido con AXA", async ({ page }) => {
  await preparar(page);
  const f = fotografo(page, "solo-cesvi");
  await page.goto("/cesvi?calidad=alta");
  await quieta(page);
  await f.foto("01-casos");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible();
  await page.goto(`${page.url().split("?")[0]}?calidad=alta`);
  await expect(page.getByTestId("recorrido-caso")).toBeVisible();
  await irAPaso(page, 2);
  await quieta(page);
  await f.foto("02-el-hecho");
  await irAPaso(page, 3);
  await quieta(page, 6000);
  await f.foto("03-la-escena");
  await irAPaso(page, 4);
  const rec = page.getByTestId("reconstruir");
  if (await rec.isVisible().catch(() => false)) await rec.click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
  await quieta(page, 4000);
  f.cifra("axa", await page.getByTestId("cifra-reconstruccion").innerText());
  await f.foto("04-reconstruccion");
  await page.getByTestId("vista-maqueta").first().click();
  await quieta(page, 4000);
  await f.foto("05-reconstruccion-2d-croquis-pericial");
  await tomas3d(page, f, "06-reconstruccion");
  await irAPaso(page, 5);
  await quieta(page);
  await f.foto("07-versiones");
  await irAPaso(page, 6);
  await quieta(page);
  await f.foto("08-analisis-danos");
  await irAPaso(page, 7);
  await quieta(page);
  await f.foto("09-analisis-numeros");
  await irAPaso(page, 8);
  await quieta(page);
  await f.foto("10-contra-cesvi");
  await irAPaso(page, 9);
  await quieta(page, 8000);
  await f.foto("11-dictamen");
  await presentar(page, f, "12-presentar");
});

test.afterAll(() => {
  // Cuántas salieron bien, para la consola de la tanda.
  for (const juego of ["publico", "solo-cesvi"] as const) {
    const ruta = join(SALIDA, juego, "resumen.json");
    if (!existsSync(ruta)) continue;
    const r = JSON.parse(readFileSync(ruta, "utf8")) as Resumen;
    const mb =
      r.fotos.reduce(
        (a, x) =>
          a +
          (x.ok && existsSync(join(SALIDA, juego, x.archivo))
            ? statSync(join(SALIDA, juego, x.archivo)).size
            : 0),
        0,
      ) / 1048576;
    console.log(
      `Fotos del recorrido «${juego}»: ${r.bien} bien de ${r.fotos.length} (${Math.round(mb)} MB).`,
    );
    for (const x of r.fotos.filter((y) => !y.ok)) console.log(`  ✗ ${x.archivo}: ${x.motivo}`);
  }
});
