import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { colocarComoPerito, conLaEscenaNueva } from "./recetas-perito";

/**
 * Ensayo automático de la demo (René, 2026-11-26): a mano, nunca en CI (no lleva @flujo). Recorre
 * contra una URL (producción por omisión) el camino de la demo con AXA:
 *
 *   Casos → AXA → La escena → Reconstrucción (cifra) → 3D (cámara lenta, daños medidos) → «¿Y si…?»
 *   con otra velocidad → Versiones → Análisis → Contra CESVI → Dictamen → Presentar
 *
 * y los ejemplos crucero, alcance, carambola y reversa hasta su cifra. En cada pantalla: captura,
 * tiempo de carga y, donde hay cifra, contra el índice (`eval/results/cifras.json`), con la
 * diferencia en km/h y en %. Si una pantalla falla, se anota y sigue. Al final, la tabla de bien/mal.
 *
 * Las capturas llevan AXA: se quedan en esta computadora, fuera del repo (`~/croquis-ensayo/<fecha>`
 * o `CROQUIS_ENSAYO`), con la tabla (`ensayo.md`) y lo medido (`ensayo.json`).
 *
 *   CROQUIS_URL=https://croquis-sage.vercel.app pnpm exec playwright test \
 *     -c playwright.produccion.config.ts e2e/ensayo-automatico.spec.ts --headed
 */
const RAIZ = resolve(__dirname, "../../..");
const SALIDA = resolve(
  process.env.CROQUIS_ENSAYO ??
    join(homedir(), "croquis-ensayo", new Date().toISOString().slice(0, 16).replace(/:/g, "")),
);
const INDICE = JSON.parse(readFileSync(join(RAIZ, "eval/results/cifras.json"), "utf8"))
  .cifras as Record<string, { mejor: number; p10: number; p90: number; texto: string }>;
/** Los ejemplos de la demo y su cifra en el índice. */
const EJEMPLOS = [
  ["crucero-noche", "ejemplos.crucero"],
  ["alcance-deformacion", "ejemplos.alcance"],
  ["carambola-lluvia", "ejemplos.carambola"],
  ["reversa-pendiente", "ejemplos.reversa"],
] as const;

interface Fila {
  caso: string;
  pantalla: string;
  segundos: number;
  ok: boolean;
  nota: string;
  cifra?: string;
  indice?: string;
  captura?: string;
}

test.use({
  viewport: { width: 1920, height: 1080 },
  locale: "es-MX",
  ...(process.env.CROQUIS_CANAL ? { channel: process.env.CROQUIS_CANAL } : {}),
});

const textoDe = async (page: Page, id: string) => {
  const l = page.getByTestId(id);
  return (await l.count()) ? (await l.first().innerText()).replace(/\s+/g, " ").trim() : null;
};

/** La cifra cuando termina de contar («57 (55–78)»), contra su renglón del índice. */
async function cifraContraIndice(page: Page, clave: string) {
  const cifra = page.getByTestId("cifra-reconstruida");
  await expect(cifra).toBeVisible({ timeout: 240_000 });
  await expect
    .poll(
      async () => {
        const a = await cifra.innerText();
        await page.waitForTimeout(700);
        return a === (await cifra.innerText());
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  if (!(await page.getByTestId("cifra-rango").count())) {
    const detalle = page.getByTestId("ver-detalle-reconstruccion");
    if (await detalle.count()) await detalle.click();
  }
  const valor = Number(/\d+/.exec((await textoDe(page, "cifra-reconstruida")) ?? "")?.[0] ?? NaN);
  const r = /(\d+)\s*–\s*(\d+)/.exec((await textoDe(page, "cifra-rango")) ?? "");
  const e = INDICE[clave]!;
  const ref = [Math.round(e.mejor), Math.round(e.p10), Math.round(e.p90)];
  const visto = [valor, r ? Number(r[1]) : NaN, r ? Number(r[2]) : NaN];
  // Toda diferencia con su valor y su porcentaje.
  const diferencias = ["cifra", "p10", "p90"].flatMap((n, i) => {
    const d = visto[i]! - ref[i]!;
    if (d === 0) return [];
    if (!Number.isFinite(d)) return [`${n}: no se leyó`];
    const pct = ref[i] ? ` (${d > 0 ? "+" : ""}${((d / ref[i]!) * 100).toFixed(1)} %)` : "";
    return [`${n} ${d > 0 ? "+" : ""}${d} km/h${pct}`];
  });
  return {
    ok: diferencias.length === 0,
    cifra: `${visto[0]} (${visto[1]}–${visto[2]})`,
    indice: `${ref[0]} (${ref[1]}–${ref[2]})`,
    nota: diferencias.length ? diferencias.join("; ") : "coincide con el índice",
  };
}

test("ensayo automático de la demo: AXA de punta a punta y los ejemplos hasta su cifra", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(2_400_000);
  const dentro = relative(RAIZ, SALIDA);
  expect(
    dentro.startsWith("..") || resolve(dentro) === dentro,
    `Las capturas con AXA no van en el repo: ${SALIDA}`,
  ).toBe(true);
  mkdirSync(SALIDA, { recursive: true });
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });
  await conLaEscenaNueva(page);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  const filas: Fila[] = [];
  let n = 0;
  const foto = async (caso: string, pantalla: string) => {
    const archivo = `${String(++n).padStart(2, "0")}-${caso}-${pantalla}.jpg`;
    await page.screenshot({ path: join(SALIDA, archivo), type: "jpeg", quality: 80 });
    return archivo;
  };
  /** Una pantalla: `f` la abre y la comprueba; el tiempo es el de `f`. */
  const pantalla = async (caso: string, nombre: string, f: () => Promise<Partial<Fila> | void>) => {
    const t0 = Date.now();
    let fila: Fila;
    try {
      const r = (await f()) ?? {};
      fila = { caso, pantalla: nombre, segundos: 0, ok: true, nota: "", ...r };
    } catch (e) {
      fila = {
        caso,
        pantalla: nombre,
        segundos: 0,
        ok: false,
        nota: (e as Error).message.split("\n")[0]!.slice(0, 200),
      };
    }
    fila.segundos = Math.round((Date.now() - t0) / 100) / 10;
    fila.captura = await foto(caso, nombre).catch(() => undefined);
    filas.push(fila);
  };

  try {
    // AXA, de punta a punta.
    await pantalla("axa", "casos", async () => {
      await page.goto("/cesvi");
      await expect(page.getByTestId("ir-axa")).toBeVisible({ timeout: 60_000 });
    });
    await pantalla("axa", "caso", async () => {
      await page.getByTestId("ir-axa").click();
      await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 60_000 });
    });
    await pantalla("axa", "la-escena", async () => {
      await irAPaso(page, 3);
    });
    await pantalla("axa", "reconstruccion", async () => {
      await irAPaso(page, 4);
      const rec = page.getByTestId("reconstruir");
      if (await rec.isVisible().catch(() => false)) await rec.click();
      return cifraContraIndice(page, "axa.v2");
    });
    await pantalla("axa", "3d", async () => {
      await page.getByTestId("vista-3d").click();
      await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
        timeout: 240_000,
      });
      const medidos = await textoDe(page, "visor-unity-deformacion-medida");
      expect(medidos, "El 3D no dice que dibuja la deformación medida").toBeTruthy();
      return { nota: medidos! };
    });
    await pantalla("axa", "3d-camara-lenta", async () => {
      await page.getByTestId("ir-al-impacto-unity").click();
      const lenta = page.getByTestId("velocidad-unity-0.25");
      await lenta.click();
      await expect(lenta).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("reproducir-unity").click();
      await page.waitForTimeout(2500);
      return { nota: "×0.25 elegida y reproduciendo" };
    });
    await pantalla("axa", "ysi-otra-velocidad", async () => {
      await page.getByTestId("abrir-ysi").click();
      const campo = page.locator('[data-testid^="ysi-kmh-"]').first();
      const kmh = Number(await campo.inputValue()) + 20;
      await campo.fill(String(kmh));
      await page.getByTestId("ysi-simular").click();
      await expect(page.getByTestId("ysi-aviso")).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(3000);
      return { nota: `${kmh} km/h: ${(await textoDe(page, "ysi-aviso"))?.slice(0, 160)}` };
    });
    await pantalla("axa", "versiones", async () => {
      await irAPaso(page, 5);
      await expect(page.getByTestId("lista-versiones")).toBeVisible({ timeout: 30_000 });
      const hipotesis = await page.locator('[data-tipo="hipotesis"]').count();
      return { nota: `${hipotesis} hipótesis «¿Y si…?» en la lista` };
    });
    await pantalla("axa", "analisis-danos", async () => {
      await irAPaso(page, 6);
    });
    await pantalla("axa", "analisis-numeros", async () => {
      await irAPaso(page, 7);
    });
    await pantalla("axa", "contra-cesvi", async () => {
      await irAPaso(page, 8);
      return { nota: ((await textoDe(page, "panel-paso")) ?? "").slice(0, 160) };
    });
    await pantalla("axa", "dictamen", async () => {
      await irAPaso(page, 9);
      await expect(page.getByTestId("panel-paso")).toContainText(/Dictamen|dictamen/, {
        timeout: 60_000,
      });
    });
    await pantalla("axa", "presentar", async () => {
      await page.getByTestId("modo-presentar").click();
      await expect(page.getByTestId("capitulo-titulo")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Salir · Esc")).toBeVisible();
      await page.waitForTimeout(3000);
      return { nota: (await textoDe(page, "capitulo-titulo")) ?? "" };
    });
    await page.keyboard.press("Escape").catch(() => undefined);

    // Los ejemplos, hasta su cifra.
    for (const [ejemplo, clave] of EJEMPLOS) {
      await pantalla(ejemplo, "lectura", async () => {
        await page.goto("/cesvi");
        await page.getByTestId("ir-caso-nuevo").click();
        await irAPaso(page, 2);
        await page.locator(`[data-ejemplo="${ejemplo}"]`).click();
        await page.getByTestId("leer-narracion").click();
        await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
      });
      await pantalla(ejemplo, "la-escena", async () => {
        await irAPaso(page, 3);
        const notas: string[] = [];
        expect(await colocarComoPerito(page, ejemplo, notas), notas.join(" ")).toBe(true);
      });
      await pantalla(ejemplo, "reconstruccion", async () => {
        await irAPaso(page, 4);
        await page.getByTestId("reconstruir").click();
        return cifraContraIndice(page, clave);
      });
    }
  } finally {
    const bien = filas.filter((f) => f.ok).length;
    const tabla = [
      `# Ensayo automático de la demo`,
      "",
      `${baseURL} · ${new Date().toISOString()} · ${bien} de ${filas.length} bien`,
      "",
      "| Caso | Pantalla | ¿Bien? | Tiempo (s) | Cifra | Índice | Nota | Captura |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...filas.map(
        (f) =>
          `| ${f.caso} | ${f.pantalla} | ${f.ok ? "bien" : "**mal**"} | ${f.segundos} | ${f.cifra ?? ""} | ${f.indice ?? ""} | ${f.nota.replace(/\|/g, "/")} | ${f.captura ?? ""} |`,
      ),
      "",
      errores.length ? `Errores de la página: ${errores.length}` : "Sin errores de la página.",
      "",
    ].join("\n");
    writeFileSync(join(SALIDA, "ensayo.md"), tabla);
    writeFileSync(
      join(SALIDA, "ensayo.json"),
      `${JSON.stringify({ sitio: baseURL, fecha: new Date().toISOString(), filas, errores }, null, 2)}\n`,
    );
    console.log(`\n${tabla}\nCapturas y tabla en ${SALIDA}`);
  }
  expect(filas.filter((f) => !f.ok).map((f) => `${f.caso} · ${f.pantalla}: ${f.nota}`)).toEqual([]);
});
