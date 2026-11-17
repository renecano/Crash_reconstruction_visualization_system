#!/usr/bin/env node
/**
 * Deja activos los ganchos de git del repositorio (`.githooks/`) en esta copia. Lo corre
 * `pnpm install` (el script `prepare` de la raíz), así que nadie tiene que acordarse.
 *
 * Nunca hace fallar la instalación: donde no hay git o no hay repositorio (un despliegue, un zip), no
 * hace nada.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
try {
  if (existsSync(join(RAIZ, ".git")) && existsSync(join(RAIZ, ".githooks"))) {
    const actual = (() => {
      try {
        return execFileSync("git", ["config", "--local", "--get", "core.hooksPath"], {
          cwd: RAIZ,
          encoding: "utf8",
        }).trim();
      } catch {
        return "";
      }
    })();
    if (actual !== ".githooks")
      execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], { cwd: RAIZ });
  }
} catch {
  // Sin git no hay ganchos que instalar.
}
process.exit(0);
