import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config from "../../next.config";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "../..");
const leer = (ruta: string) => readFileSync(join(WEB, ruta), "utf8");

/** Decisión de René del 2026-11-15 (auditoría I7): las páginas del producto anterior ya no se sirven. */
describe("las páginas del producto anterior", () => {
  it("llevan a la portada, en los dos idiomas, sin borrar su código", async () => {
    const redirecciones = await config.redirects!();
    for (const p of ["demo", "relato", "visor", "croquis", "publico", "historia"]) {
      expect(redirecciones).toContainEqual({ source: `/${p}`, destination: "/", permanent: false });
      expect(redirecciones).toContainEqual({
        source: `/en/${p}`,
        destination: "/en",
        permanent: false,
      });
    }
    // /recorrido se queda, con su aviso de versión anterior.
    expect(redirecciones.some((r) => r.source.includes("recorrido"))).toBe(false);
    expect(leer("src/paginas/recorrido.tsx")).toContain('data-testid="aviso-version-anterior"');
  });

  it("el manifiesto y la imagen para redes ya no dicen «a partir de un relato»", () => {
    const manifiesto = JSON.parse(leer("public/manifest.webmanifest")) as { description: string };
    expect(manifiesto.description).toMatch(/peritos/);
    expect(manifiesto.description).not.toMatch(/relato|con tus palabras/);
    expect(leer("scripts/portada.mjs")).not.toContain("a partir de un relato");
  });

  it("robots.txt deja fuera la aplicación y apunta al mapa del sitio, que lista la portada", () => {
    const robots = leer("public/robots.txt");
    expect(robots).toMatch(/^Disallow: \/cesvi$/m);
    expect(robots).toMatch(/^Disallow: \/api\/$/m);
    expect(robots).toMatch(/^Sitemap: https:\/\/croquis-sage\.vercel\.app\/sitemap\.xml$/m);
    const mapa = leer("public/sitemap.xml");
    expect(mapa).toContain("<loc>https://croquis-sage.vercel.app/</loc>");
    expect(mapa).toContain("<loc>https://croquis-sage.vercel.app/en</loc>");
    expect(mapa).not.toMatch(/cesvi|recorrido/);
  });
});

/** Auditoría del 2026-11-15, I6: producción manda encabezados de seguridad. */
describe("los encabezados de seguridad", () => {
  it("van en todas las rutas; la política de contenido, por ahora, solo reporta", async () => {
    const reglas = await config.headers!();
    const todas = reglas.find((r) => r.source === "/:path*")!;
    const de = (k: string) => todas.headers.find((h) => h.key === k)?.value;
    expect(de("X-Content-Type-Options")).toBe("nosniff");
    expect(de("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    const csp = de("Content-Security-Policy-Report-Only")!;
    for (const d of [
      "default-src 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
    ])
      expect(csp).toContain(d);
    // El visor de Unity necesita WebAssembly y su código de Vercel Blob.
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain("https://*.public.blob.vercel-storage.com");
    // Todavía no bloquea: la obligatoria no se manda.
    expect(de("Content-Security-Policy")).toBeUndefined();
  });
});
