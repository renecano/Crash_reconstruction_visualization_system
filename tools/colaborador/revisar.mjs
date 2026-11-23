/**
 * La revisión de una tanda con varios colaboradores (René, 2026-11-22). Cada computadora sube a su
 * rama `resultados/<tanda>-<fecha>-<equipo>`; aquí se juntan todas las de esa tanda y fecha (y la de
 * antes, sin equipo, si existe) y se dice de qué equipo sale cada resultado:
 *
 * - por equipo: su tarjeta de video, la parte que corrió, el commit y cada paso con su estado;
 * - por archivo: qué equipo lo produjo; si dos equipos producen el mismo, se dice y no se juntan;
 * - el arranque del 3D: solo dentro de cada equipo, nunca mezclando cifras de equipos distintos.
 *
 *   node tools/colaborador/revisar.mjs <tanda> [fecha] [--json salida.json]
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [tanda, ...resto] = process.argv.slice(2);
  if (!tanda) {
    console.error("Uso: node tools/colaborador/revisar.mjs <tanda> [fecha] [--json salida.json]");
    process.exit(2);
  }
  const i = resto.indexOf("--json");
  const json = i >= 0 ? resto.splice(i, 2)[1] : null;
  const fecha = resto[0] ?? new Date().toISOString().slice(0, 10);
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
