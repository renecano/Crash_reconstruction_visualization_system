/**
 * La revisión de una tanda con varios colaboradores (René, 2026-11-22). Cada computadora sube a su
 * rama `resultados/<tanda>-<fecha>-<equipo>`; aquí se juntan todas las de esa tanda y fecha (y la de
 * antes, sin equipo, si existe) y se dice de qué equipo sale cada resultado:
 *
 * - por equipo: su tarjeta de video, la parte que corrió, el commit y cada paso con su estado;
 * - por archivo: qué equipo lo produjo; si dos equipos producen el mismo, se dice y no se juntan;
 * - el arranque del 3D: solo dentro de cada equipo, nunca mezclando cifras de equipos distintos.
 *
 * Los colaboradores son respaldo, no se reparten la tanda (René, 2026-11-23): sin fecha, toma la
 * corrida completa más reciente de la tanda (cualquier fecha), dice de qué equipo es y, si hay más de
 * una completa, compara las cifras de las dos más recientes, cada una con su equipo, sin juntarlas.
 *
 *   node tools/colaborador/revisar.mjs <tanda> [fecha] [--json salida.json]
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** La fecha y el equipo de una rama de resultados de la tanda (cualquier fecha), o null. */
export function deRama(rama, tanda) {
  const r = rama.replace(/^refs\/remotes\/origin\//, "").replace(/^origin\//, "");
  const esc = tanda.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^resultados/${esc}-(\\d{4}-\\d{2}-\\d{2})(?:-(.+))?$`).exec(r);
  return m ? { fecha: m[1], equipo: m[2] ?? null } : null;
}

/** Una corrida completa: corrió «todo» y trae cada paso de la tanda. */
export function completa(corrida, pasosDeLaTanda) {
  if (!corrida || (corrida.parte && corrida.parte !== "todo")) return false;
  const corridos = new Set(
    (corrida.pasos ?? []).filter((p) => p.grupo === "tanda").map((p) => p.paso),
  );
  return pasosDeLaTanda.length > 0 && pasosDeLaTanda.every((p) => corridos.has(p));
}

/** Los números de un JSON, aplanados («a.b.0.c» → valor). */
function numeros(x, pre = "", out = {}) {
  if (typeof x === "number") out[pre] = x;
  else if (Array.isArray(x)) x.forEach((v, i) => numeros(v, pre ? `${pre}.${i}` : String(i), out));
  else if (x && typeof x === "object")
    for (const [k, v] of Object.entries(x))
      if (!/^(fecha|ms|ms_|segundos|duracion)/.test(k)) numeros(v, pre ? `${pre}.${k}` : k, out);
  return out;
}

/** Las cifras de un mismo archivo en dos corridas: las que difieren, cada una con su equipo. */
export function compararCifras(a, b) {
  const na = numeros(a.datos);
  const nb = numeros(b.datos);
  return [...new Set([...Object.keys(na), ...Object.keys(nb)])]
    .filter((k) => na[k] !== nb[k])
    .map((k) => ({ campo: k, [a.equipo]: na[k] ?? null, [b.equipo]: nb[k] ?? null }));
}

/** El equipo de una rama de resultados, o null si la rama es de antes (sin equipo). */
export function equipoDeRama(rama, tanda, fecha) {
  const base = `resultados/${tanda}-${fecha}`;
  const r = rama.replace(/^refs\/remotes\/origin\//, "").replace(/^origin\//, "");
  if (r === base) return null;
  return r.startsWith(`${base}-`) ? r.slice(base.length + 1) : undefined;
}

export const esArranque = (ruta) => /arranque/i.test(ruta) && /\.json$/i.test(ruta);

/**
 * Junta lo que produjo cada equipo: `equipos` es [{ equipo, gpu, archivos }]. Devuelve de quién es
 * cada archivo, los que salen de más de un equipo (no se juntan) y el arranque por equipo.
 */
export function juntar(equipos) {
  const deQuien = {};
  for (const e of equipos)
    for (const a of e.archivos) (deQuien[a] ??= []).push(e.equipo ?? "(sin equipo)");
  const compartidos = Object.entries(deQuien)
    .filter(([a, q]) => q.length > 1 && !a.startsWith("resultados/"))
    .map(([archivo, quienes]) => ({ archivo, equipos: quienes }));
  const arranque = equipos
    .map((e) => ({
      equipo: e.equipo ?? "(sin equipo)",
      gpu: e.gpu,
      archivos: e.archivos.filter(esArranque),
    }))
    .filter((x) => x.archivos.length);
  const gpus = new Set(arranque.map((x) => x.gpu));
  return {
    deQuien,
    compartidos,
    arranque,
    aviso_arranque:
      arranque.length > 1
        ? `El arranque del 3D se compara solo dentro de cada equipo: ${arranque.length} equipos${gpus.size > 1 ? " con tarjetas distintas" : ""}, sus cifras no se juntan.`
        : null,
  };
}

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const leerJson = (ref, ruta) => {
  try {
    return JSON.parse(git("show", `${ref}:${ruta}`));
  } catch {
    return null;
  }
};

function revisar(tanda, fecha) {
  git(
    "fetch",
    "-q",
    "origin",
    `+refs/heads/resultados/${tanda}-*:refs/remotes/origin/resultados/${tanda}-*`,
  );
  const refs = git(
    "for-each-ref",
    "--format=%(refname)",
    `refs/remotes/origin/resultados/${tanda}-${fecha}*`,
  )
    .split("\n")
    .filter(Boolean)
    .filter((r) => equipoDeRama(r, tanda, fecha) !== undefined);
  const equipos = refs.map((ref) => {
    const equipo = equipoDeRama(ref, tanda, fecha);
    const carpeta = `resultados/${tanda}/${equipo ? `${fecha}-${equipo}` : fecha}`;
    const corrida = leerJson(ref, `${carpeta}/corrida.json`) ?? {};
    const desde = corrida.commit ?? git("merge-base", ref, "origin/main");
    const archivos = git("diff", "--name-only", desde, ref).split("\n").filter(Boolean);
    return {
      equipo,
      rama: ref.replace("refs/remotes/origin/", ""),
      gpu: corrida.gpu || (corrida.equipo?.tarjetas_de_video ?? []).join(" + ") || "(sin dato)",
      parte: corrida.parte ?? "todo",
      commit: corrida.commit ?? null,
      pasos: (corrida.pasos ?? []).map((p) => ({
        paso: p.paso,
        estado: p.estado,
        minutos: p.minutos,
      })),
      archivos,
    };
  });
  return { tanda, fecha, equipos, ...juntar(equipos) };
}

/** Las corridas completas de la tanda, de la más reciente a la más vieja, con sus archivos de cifras. */
function corridasCompletas(tanda) {
  git(
    "fetch",
    "-q",
    "origin",
    `+refs/heads/resultados/${tanda}-*:refs/remotes/origin/resultados/${tanda}-*`,
  );
  const def = JSON.parse(git("show", "origin/main:tools/colaborador/tandas.json")).tandas[tanda];
  const pasos = (def?.pasos ?? []).map((p) => p.nombre);
  return git("for-each-ref", "--format=%(refname)", `refs/remotes/origin/resultados/${tanda}-*`)
    .split("\n")
    .filter(Boolean)
    .map((ref) => ({ ref, ...deRama(ref, tanda) }))
    .filter((x) => x.fecha)
    .map((x) => {
      const carpeta = `resultados/${tanda}/${x.equipo ? `${x.fecha}-${x.equipo}` : x.fecha}`;
      const corrida = leerJson(x.ref, `${carpeta}/corrida.json`);
      const cuando = Number(git("log", "-1", "--format=%ct", x.ref));
      return { ...x, equipo: x.equipo ?? "(sin equipo)", corrida, cuando, carpeta };
    })
    .filter((x) => completa(x.corrida, pasos))
    .sort((a, b) => b.cuando - a.cuando);
}

function revisarCompletas(tanda) {
  const cs = corridasCompletas(tanda);
  if (!cs.length) return console.log(`No hay corridas completas de ${tanda}.`);
  const [ultima, otra] = cs;
  console.log(
    `Corrida completa más reciente de ${tanda}: ${ultima.equipo} (${ultima.fecha}), rama ${ultima.ref.replace("refs/remotes/origin/", "")}.`,
  );
  if (!otra) return;
  console.log(
    `También está completa la de ${otra.equipo} (${otra.fecha}). Sus cifras, cada una con su equipo (no se juntan):`,
  );
  const archivos = (c) =>
    git("diff", "--name-only", c.corrida.commit ?? git("merge-base", c.ref, "origin/main"), c.ref)
      .split("\n")
      .filter((f) => /^eval\/results\/.*\.json$/.test(f));
  const deOtra = new Set(archivos(otra));
  for (const f of archivos(ultima).filter((x) => deOtra.has(x))) {
    const d = compararCifras(
      { equipo: ultima.equipo, datos: leerJson(ultima.ref, f) },
      { equipo: otra.equipo, datos: leerJson(otra.ref, f) },
    );
    console.log(`  ${f}: ${d.length ? `${d.length} cifra(s) distintas` : "iguales"}`);
    for (const x of d.slice(0, 10))
      console.log(
        `    ${x.campo}: ${ultima.equipo} ${x[ultima.equipo]} · ${otra.equipo} ${x[otra.equipo]}`,
      );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [tanda, ...resto] = process.argv.slice(2);
  if (!tanda) {
    console.error("Uso: node tools/colaborador/revisar.mjs <tanda> [fecha] [--json salida.json]");
    process.exit(2);
  }
  const i = resto.indexOf("--json");
  const json = i >= 0 ? resto.splice(i, 2)[1] : null;
  if (!resto[0]) {
    revisarCompletas(tanda);
    process.exit(0);
  }
  const fecha = resto[0];
  const r = revisar(tanda, fecha);
  if (!r.equipos.length) console.log(`No hay ramas resultados/${tanda}-${fecha}*.`);
  for (const e of r.equipos) {
    console.log(
      `\n${e.equipo ?? "(sin equipo: rama de antes)"} · ${e.gpu} · parte ${e.parte} · ${e.rama}`,
    );
    for (const p of e.pasos) console.log(`  ${p.paso.padEnd(28)} ${p.estado} (${p.minutos} min)`);
  }
  for (const c of r.compartidos)
    console.log(
      `\n⚠ ${c.archivo}: lo produjeron ${c.equipos.join(" y ")}; cada uno en su rama, no se juntan.`,
    );
  for (const a of r.arranque)
    console.log(`\nArranque del 3D de ${a.equipo} (${a.gpu}): ${a.archivos.join(", ")}`);
  if (r.aviso_arranque) console.log(`\n${r.aviso_arranque}`);
  if (json) writeFileSync(json, JSON.stringify(r, null, 2) + "\n");
}
