/**
 * ¿Cuántas cifras de la narración borraba el redactor como si fueran placas? (auditoría del
 * 2026-11-15, C1).
 *
 * El patrón de placa escrita con espacios («ABC 1234», «123 ABC») también coincide con una palabra
 * común junto a una cifra («con 1450 kg», «250 mts», «del 2010»). Con la opción `conservarCifras`
 * (la que usa el flujo de CESVI) esas ya no se borran. Aquí se mide, sobre los textos reales:
 *
 * - **Los reportes crudos de CESVI** (`data/raw/cesvi/`, fuera de git): cuántas marcas `[PLACA]`
 *   salen sin la opción y con ella. Las que se dejan de borrar se agrupan por la palabra que las
 *   delata; el archivo de resultados no guarda ningún texto de los reportes, solo conteos.
 * - **Relatos-MX** (`data/relatos-mx/build/`): las placas anotadas a mano se siguen borrando todas
 *   con la opción (la privacidad no retrocede), y cuántas marcas de más desaparecen.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/redactor_cifras.mts
 *     → eval/results/redactor_cifras.json
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dividirLote } from "../packages/cesvi/src/corpus.ts";
import { piiVersion, redact } from "../packages/extraction/src/pii.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CRUDOS = join(RAIZ, "data/raw/cesvi");
const RELATOS = join(RAIZ, "data/relatos-mx/build");
const SALIDA = join(RAIZ, "eval/results/redactor_cifras.json");

const plegar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface Conteo {
  textos: number;
  textos_con_cambio: number;
  placas_sin_opcion: number;
  placas_con_opcion: number;
  cifras_conservadas: number;
  por_palabra: Record<string, number>;
}

/** Marcas de placa sin la opción y con ella; lo que se deja de borrar, por su palabra. */
function medir(textos: string[]): Conteo {
  const c: Conteo = {
    textos: textos.length,
    textos_con_cambio: 0,
    placas_sin_opcion: 0,
    placas_con_opcion: 0,
    cifras_conservadas: 0,
    por_palabra: {},
  };
  for (const t of textos) {
    const antes = redact(t).spans.filter((s) => s.kind === "PLACA");
    const despues = redact(t, { conservarCifras: true }).spans.filter((s) => s.kind === "PLACA");
    c.placas_sin_opcion += antes.length;
    c.placas_con_opcion += despues.length;
    const quedan = new Set(despues.map((s) => `${s.start}-${s.end}`));
    const conservadas = antes.filter((s) => !quedan.has(`${s.start}-${s.end}`));
    if (conservadas.length) c.textos_con_cambio++;
    c.cifras_conservadas += conservadas.length;
    for (const s of conservadas) {
      // Solo la palabra (sin la cifra): «del», «con», «mts»…
      const palabra =
        plegar(s.original)
          .split(/\s/)
          .find((p) => /^[a-z]+$/.test(p)) ?? "?";
      c.por_palabra[palabra] = (c.por_palabra[palabra] ?? 0) + 1;
    }
  }
  c.por_palabra = Object.fromEntries(
    Object.entries(c.por_palabra).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
  );
  return c;
}

const resultado: Record<string, unknown> = {
  descripcion:
    "Marcas [PLACA] del redactor sin la opción «conservar cifras» y con ella (auditoría del 2026-11-15, C1). Solo conteos: ningún texto de los reportes.",
  version_pii: piiVersion(),
  script: "eval/redactor_cifras.mts",
};

if (existsSync(CRUDOS)) {
  const docs = readdirSync(CRUDOS)
    .filter((f) => /^crash_reports_batch_\d+\.md$/.test(f))
    .sort()
    .flatMap((f) => dividirLote(readFileSync(join(CRUDOS, f), "utf8")));
  resultado.reportes_cesvi = medir(docs.map((d) => d.texto));
} else {
  resultado.reportes_cesvi = null;
  resultado.nota = "Sin data/raw/cesvi en esta máquina: solo se midió Relatos-MX.";
}

// Relatos-MX: las placas anotadas a mano se siguen borrando.
interface Relato {
  texto: string;
  pii?: { inicio: number; fin: number; tipo: string }[];
}
const relatos: Relato[] = readdirSync(RELATOS)
  .filter((f) => f.endsWith(".jsonl"))
  .sort()
  .flatMap((f) =>
    readFileSync(join(RELATOS, f), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Relato),
  );
let placasAnotadas = 0;
let cubiertasSin = 0;
let cubiertasCon = 0;
for (const r of relatos) {
  const cubre = (spans: { start: number; end: number }[], a: number, b: number) =>
    spans.some((s) => s.start < b && s.end > a);
  const sin = redact(r.texto).spans;
  const con = redact(r.texto, { conservarCifras: true }).spans;
  for (const p of r.pii ?? []) {
    if (p.tipo !== "PLACA") continue;
    placasAnotadas++;
    if (cubre(sin, p.inicio, p.fin)) cubiertasSin++;
    if (cubre(con, p.inicio, p.fin)) cubiertasCon++;
  }
}
resultado.relatos_mx = {
  ...medir(relatos.map((r) => r.texto)),
  placas_anotadas: placasAnotadas,
  placas_anotadas_borradas_sin_opcion: cubiertasSin,
  placas_anotadas_borradas_con_opcion: cubiertasCon,
};

writeFileSync(SALIDA, `${JSON.stringify(resultado, null, 2)}\n`);
console.log(JSON.stringify(resultado, null, 1));
