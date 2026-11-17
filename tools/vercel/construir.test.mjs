import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { decidir, vaAlSitio } from "./construir.mjs";

const RAIZ = resolve(import.meta.dirname, "../..");

describe("qué cambios despliegan el sitio", () => {
  it("despliega lo del sitio", () => {
    for (const r of [
      "apps/web/src/components/cesvi/dictamen-caso.tsx",
      "apps/web/public/visor-unity/manifest.json",
      "apps/web/next.config.ts",
      "apps/web/package.json",
      "packages/cesvi/src/reconstruccion.ts",
      "packages/scene-schema/fixtures/caso3d/carambola.json",
      "data/cesvi/ejemplos/narraciones.json",
      "eval/results/cifras.json",
      "eval/results/cesvi_r4c_titulo_prueba.json",
      "eval/results/osm_instancias_1.json",
      "assets/brand/marca.json",
      "tools/blender/croquis_render.py",
      "tools/unity/visor-local.mjs",
      "tools/vercel/construir.mjs",
      "pnpm-lock.yaml",
      "package.json",
      "pnpm-workspace.yaml",
      "vercel.json",
      "tsconfig.base.json",
      // Lo desconocido también despliega: ante la duda, se construye.
      "una-carpeta-nueva/algo.ts",
    ])
      expect(vaAlSitio(r), r).toBe(true);
  });

  it("no despliega documentos, evaluaciones, pruebas, herramientas, Unity, Python ni el tráiler", () => {
    for (const r of [
      "docs/PROGRESS.md",
      "docs/adr/0120-uso-de-vercel.md",
      "README.md",
      "CLAUDE.md",
      "apps/web/README.md",
      "eval/cifras.mjs",
      "eval/results/trailer_render_trailer4k.json",
      "eval/results/blob_inventario.json",
      // Solo citado como fuente en un JSON de datos: el sitio no lo lee.
      "eval/results/e2_barrier.json",
      "eval/results/rtx-t4/fps_web.json",
      "eval/w8_comparar.mjs",
      "apps/web/e2e/cesvi.spec.ts",
      "apps/web/e2e/unity-falso.js",
      "apps/web/playwright.produccion.config.ts",
      "apps/web/src/lib/dictamen-lab.test.ts",
      "packages/cesvi/src/reconstruccion.test.ts",
      "apps/visor-unity/Assets/Croquis/Visor/Fotos.cs",
      "apps/trailer/src/escenas/Papel.tsx",
      "tools/unity/publicar-web.mjs",
      "tools/colaborador/tandas.json",
      "tools/trailer/musica.mjs",
      "solver/croquis_solver/reconstruct.py",
      "extraction/croquis_extraction/cliente.py",
      ".github/workflows/ci.yml",
      ".githooks/pre-commit",
      "pyproject.toml",
      "uv.lock",
      ".gitignore",
      "CORRER-TANDA-EN-RTX.bat",
    ])
      expect(vaAlSitio(r), r).toBe(false);
  });

  it("decide por el conjunto: basta un archivo del sitio", () => {
    expect(decidir(["docs/a.md", "eval/x.mjs"]).construir).toBe(false);
    expect(decidir(["docs/a.md", "apps/web/src/x.tsx"])).toEqual({
      construir: true,
      alSitio: ["apps/web/src/x.tsx"],
    });
    expect(decidir([]).construir).toBe(false);
  });

  it("nada de lo que el sitio lee fuera de apps/web y packages está en la lista de lo que no despliega", () => {
    // Las rutas relativas que importa el código de la web y que salen de apps/web.
    const fuentes = [];
    const recorre = (d) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (n === "node_modules" || n.startsWith(".")) continue;
        if (statSync(p).isDirectory()) recorre(p);
        else if (/\.(tsx?|mjs)$/.test(n) && !/\.test\./.test(n)) fuentes.push(p);
      }
    };
    for (const d of ["apps/web/src", "apps/web/scripts"]) recorre(join(RAIZ, d));
    fuentes.push(join(RAIZ, "apps/web/next.config.ts"));
    const leidas = new Set();
    for (const f of fuentes) {
      const texto = readFileSync(f, "utf8");
      for (const m of texto.matchAll(/["'`]((?:\.\.\/)+[A-Za-z_][^"'`*]*)["'`]/g)) {
        const destino = relative(RAIZ, resolve(join(f, ".."), m[1])).replaceAll("\\", "/");
        if (!destino.startsWith("..") && !destino.startsWith("apps/web/")) leidas.add(destino);
      }
    }
    expect(leidas.size).toBeGreaterThan(5);
    const malas = [...leidas].filter((r) => !vaAlSitio(r) && !/\.test\./.test(r));
    expect(malas).toEqual([]);
  });

  it("con dos commits del repositorio, dice qué haría", () => {
    const salida = (desde) => {
      try {
        return execFileSync(
          process.execPath,
          [join(RAIZ, "tools/vercel/construir.mjs"), "--desde", desde, "--hasta", "HEAD"],
          { cwd: RAIZ, encoding: "utf8" },
        );
      } catch (e) {
        return `codigo ${e.status}: ${e.stdout}`;
      }
    };
    // Contra el mismo commit no cambió nada: no se construye (sale con 0).
    expect(salida("HEAD")).toMatch(/^No se construye/);
    // Un commit que no existe: ante la duda, se construye (sale con 1).
    expect(salida("0000000000000000000000000000000000000000")).toMatch(/^codigo 1: Se construye/);
  });
});
