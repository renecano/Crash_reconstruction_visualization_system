import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARPETAS_REMOTAS, huellaCarpeta, prefijoRemoto } from "../../scripts/recursos-hash.mjs";

const WEB = join(__dirname, "..", "..");
const manifiesto = JSON.parse(readFileSync(join(WEB, "recursos.json"), "utf-8")) as {
  base: string;
  carpetas: Record<string, string>;
};

describe("recursos pesados en Vercel Blob (ADR 0107)", () => {
  it("cada carpeta remota tiene en recursos.json la huella de lo que está en public/", () => {
    // Si falla, cambió un modelo o un HDRI: `node scripts/recursos.mjs subir` sube la versión nueva
    // y actualiza recursos.json. Sin eso, producción seguiría sirviendo la versión anterior.
    for (const carpeta of CARPETAS_REMOTAS) {
      expect(manifiesto.carpetas[carpeta], carpeta).toBe(
        huellaCarpeta(join(WEB, "public", carpeta)),
      );
    }
  });

  it("el almacén es público por https y la ruta lleva la huella", () => {
    expect(manifiesto.base).toMatch(/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com$/);
    expect(prefijoRemoto("hdri", "e603e19a28cef179")).toBe("recursos/hdri/e603e19a28cef179/");
  });
});
