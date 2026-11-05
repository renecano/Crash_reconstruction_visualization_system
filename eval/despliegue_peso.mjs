/**
 * Cuánto pesa lo que guarda Vercel de cada despliegue de Croquis y qué lo hace pesar (ADR 0107).
 * Se mide sobre el `next build` local del mismo commit: `public/` por carpeta, los estáticos de
 * Next (`.next/static`) y los archivos que trazan las funciones (`.nft.json`, sin repetir). Las
 * carpetas que salen a Vercel Blob (`apps/web/scripts/recursos-hash.mjs`) se cuentan aparte: en
 * Vercel, `scripts/recursos.mjs preparar` las quita antes del build.
 *
 *   pnpm --filter @croquis/web build && node eval/despliegue_peso.mjs
 *
 * Es una estimación del lado de lo que se sube: Vercel no publica el desglose por despliegue en el
 * plan Hobby, y su almacenamiento puede comprimir o deduplicar.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CARPETAS_REMOTAS } from "../apps/web/scripts/recursos-hash.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const WEB = join(ROOT, "apps/web");
const SALIDA = join(ROOT, "eval/results/despliegue_peso.json");
const MB = (b) => Math.round((b / 1e6) * 10) / 10;

function peso(dir) {
  if (!existsSync(dir)) return 0;
  let t = 0;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const s = statSync(p);
    t += s.isDirectory() ? peso(p) : s.size;
  }
  return t;
}

function nfts(dir, fuera = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) nfts(p, fuera);
    else if (n.endsWith(".nft.json")) fuera.push(p);
  }
  return fuera;
}

if (!existsSync(join(WEB, ".next/BUILD_ID"))) {
  console.error("Falta el build: pnpm --filter @croquis/web build");
  process.exit(1);
}

// public/ por carpeta de primer nivel; las remotas, por su ruta completa.
const publico = {};
for (const n of readdirSync(join(WEB, "public"))) {
  const p = join(WEB, "public", n);
  publico[n] = statSync(p).isDirectory() ? peso(p) : statSync(p).size;
}
const remotas = Object.fromEntries(CARPETAS_REMOTAS.map((c) => [c, peso(join(WEB, "public", c))]));

// Funciones: cada archivo trazado una vez (Vercel agrupa las rutas en una sola función).
const trazados = new Set();
for (const nft of nfts(join(WEB, ".next/server"))) {
  const base = dirname(nft);
  for (const f of JSON.parse(readFileSync(nft, "utf-8")).files ?? [])
    trazados.add(resolve(base, f));
  trazados.add(nft.slice(0, -".nft.json".length));
}
let funciones = 0;
const porOrigen = {};
for (const f of trazados) {
  if (!existsSync(f) || statSync(f).isDirectory()) continue;
  const s = statSync(f).size;
  funciones += s;
  const rel = f.slice(WEB.length + 1).replaceAll("\\", "/");
  const k = rel.includes("node_modules/") ? "node_modules" : rel.split("/").slice(0, 3).join("/");
  porOrigen[k] = (porOrigen[k] ?? 0) + s;
}

const estaticos = peso(join(WEB, ".next/static"));
const publicoTotal = Object.values(publico).reduce((a, b) => a + b, 0);
const remotoTotal = Object.values(remotas).reduce((a, b) => a + b, 0);
const antes = publicoTotal + estaticos + funciones;
const despues = antes - remotoTotal;

const r = {
  name: "despliegue_peso",
  descripcion:
    "Peso estimado de un despliegue de Croquis (MB): public/ por carpeta, estáticos de Next y archivos de las funciones, antes y después de servir las carpetas remotas desde Vercel Blob.",
  generated_at: new Date().toISOString(),
  public_mb: Object.fromEntries(
    Object.entries(publico)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, MB(v)]),
  ),
  carpetas_remotas_mb: Object.fromEntries(Object.entries(remotas).map(([k, v]) => [k, MB(v)])),
  next_static_mb: MB(estaticos),
  funciones_mb: MB(funciones),
  funciones_por_origen_mb: Object.fromEntries(
    Object.entries(porOrigen)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => [k, MB(v)]),
  ),
  despliegue_antes_mb: MB(antes),
  despliegue_despues_mb: MB(despues),
  ahorro_por_despliegue_pct: Math.round((remotoTotal / antes) * 1000) / 10,
};
writeFileSync(SALIDA, `${JSON.stringify(r, null, 1)}\n`);
console.log(JSON.stringify(r, null, 1));
