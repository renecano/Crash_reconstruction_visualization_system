import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formato as F } from "@croquis/cesvi";
import { datosPortadaCesvi } from "@/lib/portada-cesvi";
import { DETALLES, PASOS, textosPortadaV3 } from "./textos";

const APP = join(dirname(fileURLToPath(import.meta.url)), "../../../public/portada/app");
const d = datosPortadaCesvi();

describe.each(["es", "en"] as const)("portada (%s)", (lang) => {
  const t = textosPortadaV3(lang, d);
  const todo = JSON.stringify(t);

  it("el nombre de la app no se escribe (va el logo) y no hay datos de AXA ni de un caso", () => {
    expect(todo).not.toMatch(/croquis(?! 2D)/i);
    expect(todo).not.toMatch(/AXA|A2010930/);
  });

  it("las cifras del índice, cada una con su límite; ninguna más escrita a mano", () => {
    expect(t.cifras.map((c) => c.tasa)).toEqual([d.cobertura, d.modalidad, d.carambolas]);
    for (const c of t.cifras) expect(c.limite.length).toBeGreaterThan(20);
    expect(t.cifras[1]!.limite).toContain(F.tasa(d.regla, lang === "es" ? "de" : "of"));
    // Fuera de las del índice (y «2D», «3D» y la versión de la licencia) no hay dígitos en los textos.
    const resto = JSON.stringify({ ...t, cifras: [], h1: t.h1.join("") });
    expect(resto.replace(/\b[23]D\b|OFL 1\.1|"h1":/g, "")).not.toMatch(/\d/);
  });

  it("un texto por paso y por detalle", () => {
    expect(t.pasos).toHaveLength(PASOS.length);
    expect(t.distinto).toHaveLength(DETALLES.length);
  });
});

it("cada captura existe, de día y de noche", () => {
  for (const tema of ["claro", "oscuro"]) {
    for (const p of PASOS)
      for (const w of [800, 1600])
        expect(existsSync(join(APP, `${p}-${tema}-${w}.avif`)), `${p}-${tema}-${w}`).toBe(true);
    for (const x of DETALLES)
      expect(existsSync(join(APP, `detalle-${x}-${tema}.avif`)), `${x}-${tema}`).toBe(true);
  }
});
