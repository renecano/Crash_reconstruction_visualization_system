// Verifica en el sitio (producción por omisión) la prueba de una hipótesis sobre un conductor en el
// paso 6 de AXA (R12a, ADR 0088) y la bitácora de la pizarra en el paso 4 (R12b, ADR 0093), y deja
// las capturas en `docs/cesvi/r12a/` y `docs/cesvi/r12b/`.
//
// El caso se abre ya colocado como en la app (`caso-axa-colocado.mts`): se guarda en el navegador
// de la prueba antes de cargar la página, como si el perito lo hubiera guardado. Luego reconstruye
// (paso 4), va al paso 6 y prueba «V2 frena 1.5 s antes del impacto».
//
//   pnpm --filter @croquis/cesvi exec tsx ../../tools/demo/caso-axa-colocado.mts <caso.json>
//   cd apps/web && node ../../tools/demo/verificar-r12a.mjs <caso.json> [https://croquis-sage.vercel.app]
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "../..");
const { chromium } = createRequire(join(raiz, "apps/web/package.json"))("@playwright/test");
const caso = readFileSync(process.argv[2], "utf8");
const base = process.argv[3] ?? "https://croquis-sage.vercel.app";
const salida = join(raiz, "docs/cesvi/r12a");
mkdirSync(salida, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const ID = "axa-colocado";

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
const errores = [];
pagina.on("pageerror", (e) => errores.push(e.message));
await pagina.addInitScript(
  ([id, archivo]) => {
    const a = JSON.parse(archivo);
    localStorage.setItem(`croquis:caso:${id}`, archivo);
    localStorage.setItem(
      "croquis:casos:v1",
      JSON.stringify([
        {
          id,
          titulo: a.titulo,
          guardado: a.guardado,
          vehiculos: 2,
          validado: false,
          conReporte: true,
        },
      ]),
    );
  },
  [ID, caso],
);
pagina.setDefaultTimeout(120_000);
await pagina.goto(`${base}/cesvi/casos/guardado/${ID}`);
const panel = pagina.getByTestId("panel-paso");
const irAPaso = async (n) => {
  for (let k = 0; k < 10; k++) {
    const actual = Number(await panel.getAttribute("data-paso"));
    if (actual === n) return;
    await pagina.getByTestId(actual < n ? "siguiente" : "anterior").click();
  }
};
await panel.waitFor();
log("caso abierto", await pagina.getByTestId("titulo-caso").textContent());

await irAPaso(4);
await pagina.getByTestId("reconstruir").click();
await pagina.getByTestId("velocidades").waitFor({ timeout: 180_000 });
log("velocidades", (await pagina.getByTestId("velocidades").textContent()).replace(/\s+/g, " "));
// R12b: la bitácora de los agentes, abierta, con la reconstrucción del Físico.
const bitacora = pagina.getByTestId("bitacora-agentes");
await bitacora.locator('[data-de="fisico"]').first().waitFor({ state: "attached" });
for (const li of await bitacora.locator("li").all()) log("bitácora", await li.textContent());
await bitacora.locator("summary").click();
mkdirSync(join(raiz, "docs/cesvi/r12b"), { recursive: true });
await bitacora.screenshot({ path: join(raiz, "docs/cesvi/r12b/paso4-bitacora.png") });

await irAPaso(6);
const seccion = pagina.getByTestId("probar-conductores");
await seccion.scrollIntoViewIfNeeded();
await pagina.getByTestId("conductor-vehiculo").selectOption("V2");
await pagina.getByTestId("conductor-instante").fill("1.5");
await pagina.getByTestId("conductor-probar").click();
await pagina.getByTestId("resultado-conductores").waitFor({ timeout: 120_000 });
for (const id of [
  "hipotesis-probada",
  "contacto-con",
  "contacto-sin",
  "diferencia-conductores",
  "decisiones",
])
  if (await pagina.getByTestId(id).count())
    log(id, (await pagina.getByTestId(id).textContent()).replace(/\s+/g, " "));
await seccion.screenshot({ path: join(salida, "paso6-probar-conductor.png") });
await pagina.getByTestId("velocidades").screenshot({ path: join(salida, "paso6-velocidades.png") });
log("errores de la página", errores.length ? errores : "ninguno");
await navegador.close();
