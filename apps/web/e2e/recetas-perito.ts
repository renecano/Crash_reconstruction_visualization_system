import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect } from "./base";
import { mapaFacil, tocarEnMetros } from "./ayuda-recorrido";

/**
 * La receta de los cinco ejemplos con La escena nueva, la que usa el perito (René, 2026-11-26): acepta
 * lo que propone La escena y corrige lo que la narración contradice, con los mismos toques que hizo
 * la tabla del índice (`ejemplo-como-perito.ts`), guardados en
 * `eval/results/ejemplos_como_perito/<clave>.json`. Así la app y la tabla arman la misma escena.
 * La usan `ejemplos-como-perito.spec.ts` (CI) y `ejemplos-ronda2.spec.ts` (la tanda).
 */
const RAIZ = resolve(__dirname, "../../..");
export const EJEMPLOS_PERITO = [
  "crucero-noche",
  "alcance-deformacion",
  "carambola-lluvia",
  "reversa-pendiente",
  "poste-terraceria",
] as const;

type Toque =
  | { accion: "direccion"; vehiculo: string; como: "confirmar" }
  | { accion: "direccion"; vehiculo: string; como: "flecha"; rumbo: number }
  | { accion: "direccion"; vehiculo: string; como: "mapa"; en: [number, number] }
  | { accion: "choque"; orden: number; en: [number, number] }
  | { accion: "final"; vehiculo: string; como: "junto" | "narracion" }
  | { accion: "final"; vehiculo: string; como: "marcar"; en: [number, number] }
  | { accion: "paso"; vehiculo: string; en: [number, number] }
  | { accion: "terreno"; boton: string; en: [number, number] };

export interface EscenaDeLaTabla {
  clave: string;
  propuesta: { puntos: Record<string, { lat: number; lon: number }>; versiones?: unknown };
  puntos: Record<string, { lat: number; lon: number }>;
  toques: Toque[];
  versiones?: unknown;
}

export function escenaDeLaTabla(clave: string): EscenaDeLaTabla {
  return JSON.parse(
    readFileSync(join(RAIZ, "eval/results/ejemplos_como_perito", `${clave}.json`), "utf8"),
  ) as EscenaDeLaTabla;
}

/** Antes de abrir la página: La escena nueva y la escena a la vista de la prueba. */
export async function conLaEscenaNueva(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisDiagnostico = true;
    try {
      localStorage.setItem("croquis.escena", "nueva");
    } catch {
      // Sin almacenamiento: La escena nueva es la de omisión.
    }
  });
}

/** El botón del renglón `clave` de la lista que haya: Confirmar, Corregir, Marcar o Cambiar. */
async function abrir(page: Page, clave: string) {
  const lista = page.getByTestId("lista-escena");
  await expect(lista).toBeVisible({ timeout: 30_000 });
  for (const b of ["corregir", "marcar", "cambiar"]) {
    const boton = page.getByTestId(`${b}-${clave}`);
    if (await boton.count()) {
      await boton.click();
      return;
    }
  }
  throw new Error(`La lista no tiene el renglón «${clave}»: ${await lista.innerText()}`);
}

/** Contesta una alerta de La escena con «Así está» si aparece («¿Seguro?», «lejos de la calle»). */
async function siPregunta(page: Page, ids: string[]) {
  for (const id of ids) {
    const b = page.getByTestId(id);
    if (await b.isVisible().catch(() => false)) await b.click();
  }
}

/** De vuelta en la lista (la pregunta se cierra al terminar). */
async function enLaLista(page: Page) {
  await expect(page.getByTestId("lista-escena")).toBeVisible({ timeout: 30_000 });
}

/**
 * Arma la escena del ejemplo como la tabla: confirma el choque propuesto, hace los toques en orden y
 * confirma lo que siga propuesto. Devuelve si la lista dejó seguir.
 */
export async function colocarComoPerito(page: Page, clave: string, notas: string[]) {
  const tabla = escenaDeLaTabla(clave);
  await mapaFacil(page);
  await enLaLista(page);
  const guia = page.getByTestId("cerrar-guia");
  if (await guia.isVisible().catch(() => false)) await guia.click();
  const confirmar = page.getByTestId("confirmar-choque-1");
  if (await confirmar.count()) await confirmar.click();
  for (let k = 0; k < tabla.toques.length; k++) {
    const t = tabla.toques[k]!;
    // Los puntos de paso (o el terreno) seguidos van en la misma pregunta: se abre una vez.
    const sigueIgual = tabla.toques[k + 1]?.accion === t.accion;
    const vieneIgual = tabla.toques[k - 1]?.accion === t.accion;
    if (t.accion === "direccion") {
      if (t.como === "confirmar") {
        const b = page.getByTestId(`confirmar-direccion-${t.vehiculo}`);
        if (await b.count()) await b.click();
        else notas.push(`Por dónde venía ${t.vehiculo}: ya estaba confirmado.`);
      } else {
        await abrir(page, `direccion-${t.vehiculo}`);
        if (t.como === "flecha") {
          const opciones = page.locator('[data-testid^="opcion-flecha-"]');
          await expect(opciones.first()).toBeVisible();
          let mejor = { i: -1, giro: Infinity };
          for (let i = 0; i < (await opciones.count()); i++) {
            const r = Number(await opciones.nth(i).getAttribute("data-rumbo"));
            const giro = Math.abs(((r - t.rumbo + 540) % 360) - 180);
            if (giro < mejor.giro) mejor = { i, giro };
          }
          if (mejor.giro > 2)
            notas.push(
              `${t.vehiculo}: la flecha más cercana se aparta ${Math.round(mejor.giro)}°.`,
            );
          await opciones.nth(mejor.i).click();
        } else await tocarEnMetros(page, "choque-1", t.en[0], t.en[1]);
        await siPregunta(page, ["direccion-asi"]);
      }
    } else if (t.accion === "choque") {
      await abrir(page, `choque-${t.orden}`);
      await tocarEnMetros(page, "choque-1", t.en[0], t.en[1]);
      await siPregunta(page, ["choque-asi"]);
    } else if (t.accion === "final") {
      await abrir(page, `final-${t.vehiculo}`);
      await page.getByTestId(`final-${t.como}`).click();
      if (t.como === "marcar") await tocarEnMetros(page, "choque-1", t.en[0], t.en[1]);
      await page.getByTestId("listo-final").click();
    } else if (t.accion === "paso") {
      if (!vieneIgual) await abrir(page, "c1-paso");
      await page.getByTestId(`paso-vehiculo-${t.vehiculo}`).click();
      await tocarEnMetros(page, "choque-1", t.en[0], t.en[1]);
      if (!sigueIgual) await page.getByTestId("paso-listo").click();
    } else {
      if (!vieneIgual) await abrir(page, "c1-terreno");
      await page.getByTestId(t.boton).click();
      await tocarEnMetros(page, "choque-1", t.en[0], t.en[1]);
      if (!sigueIgual) await page.getByTestId("terreno-listo").click();
    }
    if (!sigueIgual || (t.accion !== "paso" && t.accion !== "terreno")) await enLaLista(page);
  }
  // Lo que siga propuesto (un choque posterior que propuso La escena), confirmado como lo deja la tabla.
  for (let k = 0; k < 8; k++) {
    const b = page.locator('[data-testid^="confirmar-choque-"]').first();
    if (!(await b.count())) break;
    await b.click();
  }
  return page.getByTestId("lista-ver-reconstruccion").isEnabled();
}
