/**
 * F9 (ADR 0030): qué precarga el service worker de la demo sin red y cuánto pesa.
 *
 * Lee el service worker que generó `next build` (`apps/web/.next/server/app/serwist/sw.js.body`),
 * extrae su lista de precarga y ubica cada entrada en disco (`.next/static` o `public/`). Comprueba
 * que estén todos los trozos de JavaScript y todos los archivos de `public/` que la demo usa, y que
 * ninguno se haya quedado fuera por tamaño.
 *
 * Requisito previo: `pnpm --filter @croquis/web build`. Uso: `node eval/f9_precarga.mjs
 * [--out ruta.json]`. Salida: eval/results/f9_precarga.json.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const i = process.argv.indexOf("--out");
const OUT = resolve(
  ROOT,
  i >= 0 ? process.argv[i + 1] : join("eval", "results", "f9_precarga.json"),
);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
}

const sw = readFileSync(join(WEB, ".next", "server", "app", "serwist", "sw.js.body"), "utf8");
// Entradas `{url:"…",revision:…}` en cualquier orden de campos.
const urls = [...sw.matchAll(/\{([^{}]*)\}/g)]
  .filter((m) => /(?:^|,)revision:/.test(m[1]))
  .map((m) => /(?:^|,)url:"([^"]+)"/.exec(m[1])?.[1])
  .filter((u) => u !== undefined);
if (urls.length === 0) throw new Error("No se encontró la lista de precarga en sw.js");

const PAGINAS = new Set(["/", "/visor", "/croquis", "/relato"]);
const entradas = urls.map((url) => {
  if (PAGINAS.has(url)) return { url, tipo: "pagina", bytes: null };
  const file = url.startsWith("/_next/static/")
    ? join(WEB, ".next", "static", url.slice("/_next/static/".length))
    : join(WEB, "public", url.slice(1));
  if (!existsSync(file)) throw new Error(`Entrada sin archivo: ${url}`);
  const tipo = url.startsWith("/_next/") ? "next" : "public";
  return { url, tipo, bytes: statSync(file).size };
});

const precargadas = new Set(urls);
const toUrl = (base, prefix) => (f) => prefix + relative(base, f).split("\\").join("/");
const chunks = walk(join(WEB, ".next", "static", "chunks"))
  .filter((f) => f.endsWith(".js"))
  .map(toUrl(join(WEB, ".next", "static"), "/_next/static/"));
const publicos = walk(join(WEB, "public")).map(toUrl(join(WEB, "public"), "/"));
const faltan = [...chunks, ...publicos].filter((u) => !precargadas.has(u));
const paginasFaltan = [...PAGINAS].filter((p) => !precargadas.has(p));

const suma = (xs) => xs.reduce((n, e) => n + (e.bytes ?? 0), 0);
const doc = {
  name: "f9_precarga",
  generated_at: new Date().toISOString(),
  git_commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
    .toString()
    .trim(),
  entradas: entradas.length,
  paginas: entradas.filter((e) => e.tipo === "pagina").length,
  archivos_next: entradas.filter((e) => e.tipo === "next").length,
  archivos_public: entradas.filter((e) => e.tipo === "public").length,
  bytes_archivos: suma(entradas),
  mb_archivos: Math.round((suma(entradas) / 1048576) * 100) / 100,
  mayor: entradas.reduce((a, e) => ((e.bytes ?? 0) > (a.bytes ?? 0) ? e : a)),
  trozos_js_sin_precargar: faltan.filter((u) => u.startsWith("/_next/")),
  archivos_public_sin_precargar: faltan.filter((u) => !u.startsWith("/_next/")),
  paginas_sin_precargar: paginasFaltan,
  cumple: faltan.length === 0 && paginasFaltan.length === 0,
  lista: entradas,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(OUT);
console.log(
  JSON.stringify({
    cumple: doc.cumple,
    entradas: doc.entradas,
    mb_archivos: doc.mb_archivos,
    faltan: faltan.length + paginasFaltan.length,
  }),
);
if (!doc.cumple) process.exitCode = 1;
