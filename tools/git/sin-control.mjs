#!/usr/bin/env node
/**
 * Ningún script con caracteres de control dentro de una línea (René, 2026-11-17). Un retorno de carro
 * real había quedado en `tools/demo-local/demo-local.ps1` (".next" + CR + "outes-manifest.json", en
 * lugar de ".next\routes-manifest.json"). El script se veía bien en el editor y PowerShell lo leía sin
 * error de sintaxis, pero en la computadora del colaborador falló al correr: «Test-Path: Caracteres no
 * válidos en la ruta de acceso».
 *
 * Revisa los archivos de código y scripts versionados. Se permiten el tabulador y el CR de un final de
 * línea CRLF (los .bat lo usan); cualquier otro byte de 0x00 a 0x1F, o 0x7F, hace fallar.
 *
 *   node tools/git/sin-control.mjs              todo lo versionado (CI)
 *   node tools/git/sin-control.mjs --por-subir  solo lo que va en el commit (gancho de pre-commit)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Los archivos que se revisan: scripts y código de texto. */
export const EXTENSIONES = [
  "ps1",
  "psm1",
  "bat",
  "cmd",
  "command",
  "sh",
  "mjs",
  "cjs",
  "js",
  "mts",
  "cts",
  "ts",
  "tsx",
  "jsx",
  "py",
  "cs",
  "yml",
  "yaml",
];
const PATRON = new RegExp(`\\.(${EXTENSIONES.join("|")})$`, "i");
/** Código de terceros o generado que no es nuestro. */
const FUERA = [/(^|\/)node_modules\//, /^apps\/visor-unity\/(Library|Packages|ProjectSettings)\//];

export const seRevisa = (ruta) => PATRON.test(ruta) && !FUERA.some((r) => r.test(ruta));

/**
 * Los caracteres de control de un texto, con su línea y columna (1 en adelante). El CR que va justo
 * antes de un salto de línea (CRLF) y el tabulador no cuentan.
 */
export function controlesEn(bytes) {
  const hallados = [];
  let linea = 1;
  let columna = 0;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0x0a) {
      linea++;
      columna = 0;
      continue;
    }
    columna++;
    if (c === 0x09) continue;
    if (c === 0x0d && (bytes[i + 1] === 0x0a || i + 1 === bytes.length)) continue;
    if (c < 0x20 || c === 0x7f) hallados.push({ linea, columna, codigo: c });
  }
  return hallados;
}

const nombre = (c) =>
  ({ 0x0d: "CR (retorno de carro)", 0x08: "BS", 0x0c: "FF", 0x1b: "ESC", 0x00: "NUL" })[c] ??
  `0x${c.toString(16).padStart(2, "0").toUpperCase()}`;

function archivos(porSubir) {
  const args = porSubir
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
    : ["ls-files", "-z"];
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
}

function principal() {
  const porSubir = process.argv.includes("--por-subir");
  const malos = [];
  for (const ruta of archivos(porSubir).filter(seRevisa)) {
    if (!existsSync(ruta)) continue;
    const bytes = porSubir
      ? execFileSync("git", ["show", `:${ruta}`], { maxBuffer: 64 * 1024 * 1024 })
      : readFileSync(resolve(ruta));
    for (const h of controlesEn(bytes)) malos.push({ ruta, ...h });
  }
  if (malos.length) {
    process.stderr.write(
      "Hay caracteres de control dentro de una línea (un «\\r» o «\\n» que quedó escrito como el carácter real):\n",
    );
    for (const m of malos.slice(0, 50))
      process.stderr.write(`  ${m.ruta}:${m.linea}:${m.columna}  ${nombre(m.codigo)}\n`);
    if (malos.length > 50) process.stderr.write(`  … y ${malos.length - 50} más\n`);
    process.exit(1);
  }
  process.stdout.write("Sin caracteres de control dentro de las líneas de los scripts.\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
