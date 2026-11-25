import { type Page } from "@playwright/test";
import { expect } from "./base";
import { mapaFacil, sinRed, tocarEnMetros } from "./ayuda-recorrido";

/**
 * Las recetas de las cinco narraciones de ejemplo (ronda 2, C): cómo se coloca «La escena» como dice
 * cada narración. Las usan `ejemplos-ronda2.spec.ts` y el humo de las tandas (`humo-3d.spec.ts`).
 */
export interface Receta {
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

export const RECETAS: Receta[] = [
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
    // De Sur a Norte por la Avenida Valle Alto: A alcanza a B y, por el empuje, B a C (detenidos en
    // el semáforo). A quedó en el área del primer contacto; B, 5 m adelante; C, 10 m adelante.
    clave: "carambola-lluvia",
    choques: [[0, 5.6]],
    venia: { Ranger: "Del sur" },
    quedo: { Ranger: [0, -0.5], Corolla: [0, 5.4], Aveo: [0, 9.8] },
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

/** Hacia dónde avanza quien llega de cada lado (grados desde el norte). */
const RUMBO_DE: Record<string, number> = {
  "Del sur": 0,
  "Del oeste": 90,
  "Del norte": 180,
  "Del este": 270,
};

const de = <T>(mapa: Record<string, T>, texto: string): T | undefined =>
  Object.entries(mapa).find(([nombre]) => texto.includes(nombre))?.[1];

/** Contesta «La escena» con la receta; lo que la receta no cubre, con lo que no agrega evidencia. */
export async function colocar(page: Page, r: Receta, notas: string[]) {
  await sinRed(page);
  const mapa = await mapaFacil(page);
  const lista = page.getByTestId("escena-lista");
  const pregunta = page.getByTestId("escena-pregunta");
  // La tarjeta entera: «¿Dónde quedó después del choque?» se repite igual para cada vehículo (el caso
  // encimado trae los rumbos, así que van seguidas), y solo cambia el nombre de arriba (t6).
  const tarjeta = page.getByRole("region", { name: "La pregunta" });
  let choques = 0;
  // «¿Dónde quedó después del choque?» no nombra al vehículo: es el de la pregunta anterior.
  let vehiculo = "";
  for (let k = 0; k < 30; k++) {
    if (await lista.isVisible()) break;
    const texto = (await pregunta.textContent()) ?? "";
    const antes = (await tarjeta.textContent().catch(() => null)) ?? texto;
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
      // La flecha cuyo rumbo es el más cercano al que dice la receta (René, 2026-11-23): con las calles
      // del mapa las flechas van por las calles («Del sureste, por Calle Azucena»), así que el texto
      // «Del sur» no siempre existe y como subcadena también coincidía con «Del sureste».
      const objetivo = flecha ? RUMBO_DE[flecha] : undefined;
      const opciones = page.locator('[data-testid^="opcion-flecha-"]');
      let elegida = page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]');
      if (objetivo !== undefined) {
        let mejor = { i: -1, giro: Infinity };
        for (let i = 0; i < (await opciones.count()); i++) {
          const rumbo = Number(await opciones.nth(i).getAttribute("data-rumbo"));
          const giro = Math.abs(((rumbo - objetivo + 540) % 360) - 180);
          if (giro < mejor.giro) mejor = { i, giro };
        }
        if (mejor.i >= 0) {
          elegida = opciones.nth(mejor.i);
          if (mejor.giro > 30)
            notas.push(
              `«${texto}»: la flecha más cercana a «${flecha}» se aparta ${Math.round(mejor.giro)}°.`,
            );
        }
      }
      if (await elegida.count()) await elegida.first().click();
      else {
        notas.push(`«${texto}»: no había flechas; se tomó la primera opción.`);
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
      .poll(
        async () =>
          (await lista.isVisible()) ||
          ((await tarjeta.textContent().catch(() => null)) ?? "") !== antes,
        {
          timeout: 15_000,
        },
      )
      .toBe(true);
  }
  return lista.isVisible();
}
