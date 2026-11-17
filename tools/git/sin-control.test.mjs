import { describe, expect, it } from "vitest";
import { controlesEn, seRevisa } from "./sin-control.mjs";

const b = (s) => Buffer.from(s, "utf8");

describe("el candado contra caracteres de control en los scripts", () => {
  it("encuentra el CR real que rompió la demo local, con su línea y columna", () => {
    const linea = '$rutas = Join-Path $Web ".next' + "\r" + 'outes-manifest.json"';
    expect(controlesEn(b(`$a = 1\n${linea}\n`))).toEqual([{ linea: 2, columna: 31, codigo: 13 }]);
  });

  it("acepta el tabulador y el CRLF de los .bat, también en la última línea", () => {
    expect(controlesEn(b("@echo off\r\n\tpause\r\n"))).toEqual([]);
    expect(controlesEn(b("echo.\r\npause\r"))).toEqual([]);
    expect(controlesEn(b("sin salto final"))).toEqual([]);
  });

  it("rechaza los demás caracteres de control y el DEL", () => {
    expect(controlesEn(b("a\u0008b\fc\u001bd\u007f")).map((h) => h.codigo)).toEqual([
      8, 12, 27, 127,
    ]);
  });

  it("no confunde una secuencia escrita con el carácter real", () => {
    expect(
      controlesEn(b(String.raw`printf '\033[33m%s\033[0m\n' "$1"; s.replace("\r", "")`)),
    ).toEqual([]);
  });

  it("revisa los scripts y el código, no las imágenes ni lo de terceros", () => {
    for (const r of [
      "CORRER-DEMO-LOCAL.bat",
      "CORRER-DEMO-LOCAL.command",
      "tools/demo-local/demo-local.ps1",
      "tools/demo-local/demo-local.sh",
      "tools/git/sin-medios.mjs",
      "apps/web/src/app/page.tsx",
      "solver/croquis/solver.py",
      "apps/visor-unity/Assets/Croquis/Visor/VisorCaso.cs",
      ".github/workflows/ci.yml",
    ])
      expect(seRevisa(r), r).toBe(true);
    for (const r of [
      "tools/unity/arboles/fresno_atlas_diff.webp",
      "docs/LEEME.md",
      "apps/web/node_modules/x/index.js",
      "apps/visor-unity/Library/Bee/a.cs",
    ])
      expect(seRevisa(r), r).toBe(false);
  });
});
