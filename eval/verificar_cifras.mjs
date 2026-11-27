/**
 * Verificador de cifras (auditoría del 2026-11-15, §3.3; ADR 0138). Solo lee; tarda milisegundos.
 *
 *   node eval/verificar_cifras.mjs
 *
 * Falla si:
 * 1. `eval/results/cifras.json` no está al día con sus fuentes (`eval/cifras.mjs --check`).
 * 2. Una cifra marcada en un documento no es la del índice. Una cifra se marca así:
 *      <!--cifra:er4.modalidad_titulo-->91 de 156 (58.3 %)<!--/cifra-->
 *    y debe ser el `texto` de esa cifra; con `<!--cifra:axa.v2:texto_completo-->` se pide otro campo.
 * 3. Un documento vigente trae una cifra retirada (el 71.56 de AXA antes de W8, los 68,557 números
 *    de la paridad vieja…) sin decir «antes» o una fecha en la misma línea.
 *
 * Documentos vigentes: los que describen el estado de hoy. Las bitácoras y los ADR cuentan lo que
 * pasó y pueden citar cifras de su fecha.
 *
 * 4. Una cifra retirada aparece en cualquier otro archivo del repo que describa el presente (René,
 *    2026-11-16: «que no encuentre nada viejo en todo el repo»): el código, las herramientas, los
 *    documentos que no son historia y los resultados que miden el estado de hoy. Quedan fuera las
 *    bitácoras, los ADR, la auditoría, los planes archivados, los resultados de una fecha (cada
 *    `eval/results` es la medición de su día) y los números que solo coinciden (fixtures y pruebas).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const errores = [];

// 1. El índice, al día.
const indice = spawnSync(process.execPath, [join(RAIZ, "eval/cifras.mjs"), "--check"], {
  encoding: "utf8",
});
if (indice.status !== 0) errores.push((indice.stderr || indice.stdout).trim());

const { cifras, retiradas } = JSON.parse(
  readFileSync(join(RAIZ, "eval/results/cifras.json"), "utf8"),
);

/** Un documento vigente: todo el archivo, o solo una sección («## Estado actual»). */
const VIGENTES = [
  { ruta: "README.md" },
  { ruta: "docs/ESTADO.md" },
  { ruta: "docs/physics.md" },
  { ruta: "docs/data.md" },
  // Solo el bloque «Ahora»: desde «Antes: …» la sección es la bitácora de las fases anteriores.
  { ruta: "docs/PROGRESS.md", seccion: "## Estado actual", hasta: /^- \*\*Antes/ },
  { ruta: "docs/cesvi/PLAN-CESVI.md" },
  // El guion de la demo (René, 2026-11-26: sus cifras de los ejemplos se habían quedado atrás).
  { ruta: "docs/cesvi/demo/guion.md" },
];

/** Las líneas del documento (o de su sección), con su número. */
// 4. Todo el repo. Lo que es historia o solo coincide en el número no cuenta.
const HISTORIA =
  /^(docs\/(adr|progress|historial|auditoria|cesvi\/entrante)\/|docs\/PROGRESS\.md$|eval\/results\/|eval\/(cifras|verificar_cifras)\.mjs$)|\.test\.|\/fixtures\/|\.Tests\/Datos\/|\.(png|jpe?g|webp|gif|glb|gltf|pdf|docx|wasm|data|zip|ico|woff2?|ttf|lock|yaml)$/;
// Los resultados que describen el estado de hoy (se regeneran con la app vigente).
const RESULTADOS_VIGENTES = ["eval/results/laboratorio_axa.json"];
const VISTOS = new Set();

function lineasDe({ ruta, seccion, hasta }) {
  const todas = readFileSync(join(RAIZ, ruta), "utf8").split("\n");
  if (!seccion) return todas.map((texto, i) => ({ n: i + 1, texto }));
  const ini = todas.findIndex((l) => l.trim() === seccion);
  if (ini < 0) {
    errores.push(`${ruta}: no encuentro la sección «${seccion}»`);
    return [];
  }
  const nivel = seccion.match(/^#+/)[0];
  let fin = todas.findIndex((l, i) => i > ini && new RegExp(`^#{1,${nivel.length}} `).test(l));
  if (fin < 0) fin = todas.length;
  if (hasta) {
    const corte = todas.findIndex((l, i) => i > ini && i < fin && hasta.test(l));
    if (corte >= 0) fin = corte;
  }
  return todas.slice(ini, fin).map((texto, i) => ({ n: ini + i + 1, texto }));
}

// «antes», «anterior», «hasta», «histórico», o una fecha: la línea dice que la cifra es de otro momento.
const DE_OTRO_MOMENTO =
  /\bantes\b|\banterior(es)?\b|\bhasta\b|\bhist[oó]ric|\bera(n)?\b|\bdaba\b|\bpas[oó] de\b|\b20\d\d-\d\d-\d\d\b|\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;
const MARCA = /<!--cifra:([a-z0-9_.]+)(?::([a-z0-9_]+))?-->([\s\S]*?)<!--\/cifra-->/g;

let marcadas = 0;
for (const doc of VIGENTES) {
  if (!existsSync(join(RAIZ, doc.ruta))) continue;
  for (const { n, texto } of lineasDe(doc)) {
    // 2. Cifras marcadas.
    for (const m of texto.matchAll(MARCA)) {
      marcadas++;
      const [, clave, campo = "texto", escrito] = m;
      const c = cifras[clave];
      if (!c) errores.push(`${doc.ruta}:${n}: no existe la cifra «${clave}»`);
      else if (!(campo in c)) errores.push(`${doc.ruta}:${n}: «${clave}» no tiene «${campo}»`);
      else if (String(c[campo]) !== escrito.trim())
        errores.push(
          `${doc.ruta}:${n}: «${clave}» dice «${escrito.trim()}» y el índice dice «${c[campo]}» (${c.fuente})`,
        );
    }
    // 3. Cifras retiradas.
    for (const r of retiradas) {
      // El número entero, no un pedazo de otro («171.56» no es «71.56»).
      const i = texto.indexOf(r.texto);
      if (i < 0) continue;
      const antes = texto[i - 1] ?? " ";
      const despues = texto[i + r.texto.length] ?? " ";
      if (/[0-9.,]/.test(antes) && /[0-9]/.test(texto[i - 2] ?? "")) continue;
      if (/[0-9]/.test(despues)) continue;
      if (!DE_OTRO_MOMENTO.test(texto))
        errores.push(
          `${doc.ruta}:${n}: trae «${r.texto}» (${r.que}) sin decir que es de antes: pon la cifra vigente, o «antes» o la fecha en la misma línea`,
        );
    }
  }
}

for (const v of VIGENTES) VISTOS.add(v.ruta);
const archivos = spawnSync("git", ["ls-files"], { cwd: RAIZ, encoding: "utf8" })
  .stdout.split("\n")
  .filter(Boolean)
  .filter((f) => !VISTOS.has(f) && (!HISTORIA.test(f) || RESULTADOS_VIGENTES.includes(f)));
let revisados = 0;
for (const ruta of archivos) {
  let texto;
  try {
    texto = readFileSync(join(RAIZ, ruta), "utf8");
  } catch {
    continue;
  }
  if (texto.includes("\u0000")) continue;
  revisados++;
  texto.split("\n").forEach((linea, i) => {
    for (const r of retiradas) {
      const k = linea.indexOf(r.texto);
      if (k < 0) continue;
      if (/[0-9]/.test(linea[k + r.texto.length] ?? "")) continue;
      if (
        /[0-9]/.test(linea[k - 1] ?? "") ||
        (/[.,]/.test(linea[k - 1] ?? "") && /[0-9]/.test(linea[k - 2] ?? ""))
      )
        continue;
      if (!DE_OTRO_MOMENTO.test(linea))
        errores.push(`${ruta}:${i + 1}: trae «${r.texto}» (${r.que}), una cifra retirada`);
    }
  });
}

if (errores.length) {
  console.error(`Cifras: ${errores.length} problema(s).\n- ${errores.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `Cifras verificadas: ${Object.keys(cifras).length} en el índice, ${marcadas} marcadas en los documentos, ninguna retirada sin su fecha; ${revisados} archivos más del repo, sin cifras retiradas.`,
);
