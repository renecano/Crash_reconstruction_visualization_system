import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso, mapaFacil, sinRed, tocarEnMetros } from "./ayuda-recorrido";

/**
 * Ronda 2, C: las cinco narraciones de ejemplo, de punta a punta, como las usaría un perito: elegir
 * el ejemplo, leerlo (su lectura guardada: no gasta API), colocar la escena como dice la narración,
 * reconstruir, ver el 2D y abrir el dictamen. Anota lo que da cada una (la cifra, su rango, si hay
 * dos hipótesis y los límites que la app declara), para decidir si luce o si deja ver un límite.
 * No corre en CI.
 *
 *   CROQUIS_URL=<sitio> pnpm exec playwright test -c playwright.produccion.config.ts \
 *     e2e/ejemplos-ronda2.spec.ts
 *     → eval/results/ronda2_ejemplos.json y docs/cesvi/ronda-2/ejemplos/
 *
 * Con `CROQUIS_UNITY=1` abre además el 3D de Unity de cada una (pesado: no en una laptop de 8 GB).
 */
const RAIZ = resolve(__dirname, "../../..");
// `CROQUIS_SALIDA` y `CROQUIS_CAPTURAS` (relativas a la raíz) para medir un después sin pisar el antes.
const SALIDA = join(
  RAIZ,
  process.env.CROQUIS_SALIDA ??
    (process.env.CROQUIS_EJEMPLO
      ? `eval/results/ronda2_ejemplo_${process.env.CROQUIS_EJEMPLO}.json`
      : "eval/results/ronda2_ejemplos.json"),
);
const CAPTURAS = join(RAIZ, process.env.CROQUIS_CAPTURAS ?? "docs/cesvi/ronda-2/ejemplos");
const CON_UNITY = process.env.CROQUIS_UNITY === "1";

interface Receta {
  clave: string;
  /** Dónde va cada choque después del primero, en metros (este, norte) desde el primero. */
  choques?: [number, number][];
  /** Por dónde venía cada vehículo (por una parte de su nombre): el texto de la flecha. */
  venia: Record<string, string>;
  /** Dónde quedó cada uno: metros (este, norte) desde el primer choque, «junto» o «nose». */
  quedo: Record<string, [number, number] | "junto" | "nose">;
  /** Un punto por donde pasó un vehículo (su id en la escena), si la narración lo da. */
  pasos?: { vehiculo: string; en: [number, number] }[];
  /** Lo que la narración dice del terreno: un tope o una zona, donde va. */
  terreno?: { tipo: "tope-circular" | "terraceria" | "ondulado"; en: [number, number] }[];
}

const RECETAS: Receta[] = [
  {
    // La narración no dice a cuántos metros quedó cada uno: «junto al choque», como en la demo.
    clave: "crucero-noche",
    venia: { Jetta: "Del sur", Camaro: "Del oeste" },
    quedo: { Jetta: "junto", Camaro: "junto" },
  },
  {
    // Alcance de Sur a Norte: A quedó en su carril, 9 m adelante del inicio de los restos; B, sobre
    // el acotamiento (a la derecha), 21 m adelante.
    clave: "alcance-deformacion",
    venia: { NP300: "Del sur", Vento: "Del sur" },
    quedo: { NP300: [0, 9], Vento: [2.6, 21] },
  },
  {
    // De Poniente a Oriente: A alcanza a B y, por el empuje, B a C (detenidos en el semáforo). A
    // quedó en el área del primer contacto; B, 5 m adelante; C, 10 m adelante.
    clave: "carambola-lluvia",
    choques: [[5.6, 0]],
    venia: { Ranger: "Del oeste" },
    quedo: { Ranger: [-0.5, 0], Corolla: [5.4, 0], Aveo: [9.8, 0] },
  },
  {
    // A sale en reversa de una cochera hacia la calle; B circula de Sur a Norte y quedó 7 m al
    // Norte. El tope está 12 m al Sur del acceso, en el camino de B.
    clave: "reversa-pendiente",
    venia: { "CR-V": "Del oeste", Versa: "Del sur" },
    quedo: { "CR-V": [-1.8, 0.4], Versa: [0.6, 7] },
    terreno: [{ tipo: "tope-circular", en: [0.6, -12] }],
  },
  {
    // A llega del Sur y B del Poniente; después del contacto, B derrapa, cruza a la terracería y
    // pega contra un poste (el segundo choque), donde queda. A quedó 8 m al Norte.
    clave: "poste-terraceria",
    choques: [[18, 3]],
    venia: { "Mazda 3": "Del sur", Sentra: "Del oeste" },
    quedo: { "Mazda 3": [0.8, 8], Sentra: [16.4, 2.7] },
    pasos: [{ vehiculo: "V2", en: [9, 1.5] }],
    terreno: [{ tipo: "terraceria", en: [15, 4] }],
  },
];

// Una acción que no encuentra su control falla pronto, con el nombre de lo que faltó.
test.use({ actionTimeout: 20_000, viewport: { width: 1440, height: 900 }, locale: "es-MX" });

const de = <T>(mapa: Record<string, T>, texto: string): T | undefined =>
  Object.entries(mapa).find(([nombre]) => texto.includes(nombre))?.[1];

/** Contesta «La escena» con la receta; lo que la receta no cubre, con lo que no agrega evidencia. */
async function colocar(page: Page, r: Receta, notas: string[]) {
  await sinRed(page);
  const mapa = await mapaFacil(page);
  const lista = page.getByTestId("escena-lista");
  const pregunta = page.getByTestId("escena-pregunta");
  let choques = 0;
  // «¿Dónde quedó después del choque?» no nombra al vehículo: es el de la pregunta anterior.
  let vehiculo = "";
  for (let k = 0; k < 30; k++) {
    if (await lista.isVisible()) break;
    const texto = (await pregunta.textContent()) ?? "";
    // «¿Dónde fue el primer golpe?» no es un choque: la narración no lo da, así que «No sé».
    if (/primer golpe/.test(texto)) await page.getByTestId("golpe-nose").click();
    else if (/^¿Dónde fue/.test(texto)) {
      if (choques === 0) {
        const caja = (await mapa.boundingBox())!;
        await mapa.click({ position: { x: caja.width * 0.62, y: caja.height * 0.5 } });
      } else {
        const [e, n] = r.choques?.[choques - 1] ?? [5 * choques, 0];
        await tocarEnMetros(page, "choque-1", e, n);
      }
      choques++;
    } else if (texto.startsWith("¿Por dónde")) {
      vehiculo = texto;
      const flecha = de(r.venia, texto);
      const opcion = flecha
        ? page.locator('[data-testid^="opcion-flecha-"]', { hasText: flecha })
        : page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]');
      if (await opcion.count()) await opcion.first().click();
      else {
        notas.push(
          `«${texto}»: no había la flecha «${flecha ?? "propuesta"}»; se tomó la primera.`,
        );
        await page.getByTestId("opcion-flecha-0").click();
      }
    } else if (/quedó/i.test(texto)) {
      const q = de(r.quedo, vehiculo);
      if (q === undefined) {
        notas.push(`Sin receta para dónde quedó («${vehiculo}»): junto al choque.`);
      }
      if (q === undefined || q === "junto" || q === "nose")
        await page.getByTestId(`final-${q ?? "junto"}`).click();
      else await tocarEnMetros(page, "choque-1", q[0], q[1]);
      await page.getByTestId("listo-final").click();
    } else if (/algo más/.test(texto)) await page.getByTestId("otros-no").click();
    else if (/por dónde pasó/.test(texto)) {
      for (const p of r.pasos ?? []) {
        await page.getByTestId(`paso-vehiculo-${p.vehiculo}`).click();
        await tocarEnMetros(page, "choque-1", p.en[0], p.en[1]);
      }
      await page.getByTestId("paso-listo").click();
    } else if (/Cómo es el terreno/.test(texto)) {
      if (!r.terreno?.length) await page.getByTestId("terreno-liso").click();
      else {
        for (const t of r.terreno) {
          await page.getByTestId(`terreno-${t.tipo}`).click();
          await tocarEnMetros(page, "choque-1", t.en[0], t.en[1]);
        }
        await page.getByTestId("terreno-listo").click();
      }
    } else {
      notas.push(`Pregunta sin receta: «${texto}».`);
      break;
    }
    await expect
      .poll(async () => (await lista.isVisible()) || (await pregunta.textContent()) !== texto, {
        timeout: 15_000,
      })
      .toBe(true);
  }
  return lista.isVisible();
}

const textoDe = async (page: Page, testid: string) => {
  const l = page.getByTestId(testid);
  return (await l.count())
    ? ((await l.first().textContent()) ?? "").replace(/\s+/g, " ").trim()
    : null;
};

test("las cinco narraciones de ejemplo, de punta a punta", async ({ page, baseURL }) => {
  test.setTimeout(1_500_000);
  mkdirSync(CAPTURAS, { recursive: true });
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  if (CON_UNITY)
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
    });
  let llamadasAClaude = 0;
  page.on("request", (q) => {
    if (q.url().includes("/api/cesvi/escena")) llamadasAClaude++;
  });
  const resultados: Record<string, unknown>[] = [];
  // CROQUIS_EJEMPLO=<clave> recorre solo uno (para ajustar su receta).
  const solo = process.env.CROQUIS_EJEMPLO;
  for (const r of RECETAS.filter((x) => !solo || x.clave === solo)) {
    const notas: string[] = [];
    const foto = (n: string) =>
      page.screenshot({ path: join(CAPTURAS, `${r.clave}-${n}.jpg`), type: "jpeg", quality: 80 });
    await page.goto("/cesvi");
    await page.getByTestId("ir-caso-nuevo").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await irAPaso(page, 2);
    // 1. El ejemplo y su lectura (guardada: no llama a Claude).
    await page.locator(`[data-ejemplo="${r.clave}"]`).click();
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
    const leido = await textoDe(page, "escena");
    const guardada = (await page.getByTestId("lectura-guardada").count()) > 0;
    await foto("1-leida");
    // 2. La escena, como dice la narración.
    await irAPaso(page, 3);
    const lista = await colocar(page, r, notas);
    await foto("2-escena");
    if (!lista) {
      resultados.push({ clave: r.clave, leido, guardada, colocada: false, notas });
      continue;
    }
    await page.getByTestId("avance-ver-reconstruccion").click();
    await expect(page.getByTestId("panel-paso")).toHaveAttribute("data-paso", "4");
    await page.waitForTimeout(600);
    await foto("3-planteamiento");
    // 3. La reconstrucción.
    const t0 = Date.now();
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
    const segundos = Math.round((Date.now() - t0) / 100) / 10;
    await page.waitForTimeout(2500);
    await foto("4-reconstruccion");
    await page.getByTestId("ver-detalle-reconstruccion").click();
    const fila = {
      clave: r.clave,
      leido,
      lectura_guardada: guardada,
      colocada: true,
      segundos_reconstruir: segundos,
      cifra: await textoDe(page, "cifra-reconstruida"),
      de_quien: await textoDe(page, "cifra-de-quien"),
      rango: await textoDe(page, "cifra-rango"),
      sin_cifra: await textoDe(page, "sin-cifra"),
      sin_dispersion: (await page.getByTestId("sin-dispersion").count()) > 0,
      hipotesis: await page.getByRole("button", { name: "Elegir esta" }).count(),
      velocidades: await textoDe(page, "velocidades"),
      evidencia: await textoDe(page, "evidencia-usada"),
      impactos: await textoDe(page, "impactos-reconstruidos"),
      limites: await page.getByTestId("limites").locator("li").allTextContents(),
      terreno: await textoDe(page, "terreno-reconstruccion"),
      // «Daños» y «Los números»: lo que dicen del método de CESVI, si hay medidas.
      analisis: [] as string[],
      unity: null as string | null,
      dictamen: false,
      notas,
    };
    // 4. El 3D de Unity, solo si se pide (pesado).
    if (CON_UNITY) {
      await page.getByTestId("vista-3d").click();
      const visor = page.getByTestId("visor-unity");
      await visor
        .waitFor({ timeout: 30_000 })
        .then(() =>
          expect(visor).toHaveAttribute("data-fase", /listo|respaldo/, { timeout: 240_000 }),
        )
        .catch(() => undefined);
      fila.unity = (await visor.count()) ? await visor.getAttribute("data-fase") : "sin visor";
      await page.waitForTimeout(3000);
      await foto("4b-3d");
      await page.getByTestId("vista-maqueta").click();
    }
    for (const n of [6, 7]) {
      await irAPaso(page, n);
      await page.waitForTimeout(1200);
      fila.analisis.push(
        ((await page.getByTestId("panel-paso").textContent()) ?? "")
          .replace(/\s+/g, " ")
          .slice(0, 700),
      );
      await foto(`5-analisis-${n}`);
    }
    // 5. El dictamen.

    await page.getByTestId("exportar-barra").click();
    fila.dictamen = await page
      .getByTestId("dictamen-caso")
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(1500);
    await foto("6-dictamen");
    resultados.push(fila);
  }
  writeFileSync(
    SALIDA,
    `${JSON.stringify(
      {
        descripcion:
          "Las cinco narraciones de ejemplo de punta a punta (ronda 2, C): la lectura guardada, la escena colocada como dice la narración (receta en el script), la reconstrucción, y el dictamen. Lo que dice la pantalla, sin interpretar. Chromium a 1440×900.",
        script: "apps/web/e2e/ejemplos-ronda2.spec.ts",
        sitio: baseURL,
        fecha: new Date().toISOString(),
        con_unity: CON_UNITY,
        llamadas_a_claude: llamadasAClaude,
        errores_de_pagina: errores,
        ejemplos: resultados,
      },
      null,
      2,
    )}\n`,
  );
  expect(resultados).toHaveLength(solo ? 1 : RECETAS.length);
});
