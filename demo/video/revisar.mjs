/**
 * Revisa el video demo antes de darlo por terminado:
 *
 * 1. **Cuadros:** saca tres cuadros de cada segmento del MP4 (al 20 %, 55 % y 90 % de su duración) y
 *    un mosaico por segmento en salida/revision/, para mirarlos.
 * 2. **Texto en pantalla** (salida/textos.json, lo que anotó `grabar.mjs` al final de las acciones y
 *    del segmento) y la voz:
 *    - ningún identificador interno: las fuentes del contrato que no son palabras
 *      (`dictamen_importado`…) ni nada con forma de identificador (`palabra_con_guion_bajo`);
 *    - «dictamen» solo para lo que produce Croquis: se marca cuando va junto a CESVI, AXA o un reporte
 *      («dictamen de CESVI», «el dictamen del reporte»…), y se listan todas las apariciones con su
 *      contexto.
 *
 * Escribe salida/revision/revision.json y termina con error si encuentra algo.
 *
 * Uso: node demo/video/revisar.mjs   (después de `montar.mjs`)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FFMPEG, FFPROBE, RAIZ, SALIDA, VIDEO_FINAL } from "./comun.mjs";

const linea = JSON.parse(readFileSync(join(SALIDA, "linea-de-tiempo.json"), "utf8"));
const textos = JSON.parse(readFileSync(join(SALIDA, "textos.json"), "utf8"));
const esquema = JSON.parse(
  readFileSync(join(RAIZ, "packages/scene-schema/escena.schema.json"), "utf8"),
);
const dir = join(SALIDA, "revision");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

// 1. Cuadros por segmento (el último cuadro no pasa del final del MP4).
const duracionMp4 = Number(
  execFileSync(FFPROBE, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    VIDEO_FINAL,
  ])
    .toString()
    .trim(),
);
for (const s of linea.segmentos) {
  const fin = linea.segmentos[linea.segmentos.indexOf(s) + 1]?.inicio_s ?? linea.duracion_s;
  const largo = fin - s.inicio_s;
  [0.2, 0.55, 0.9].forEach((f, k) => {
    execFileSync(FFMPEG, [
      "-v",
      "error",
      "-y",
      "-ss",
      Math.min(s.inicio_s + largo * f, duracionMp4 - 0.3).toFixed(2),
      "-i",
      VIDEO_FINAL,
      "-frames:v",
      "1",
      "-vf",
      "scale=960:-2",
      join(dir, `${s.id}-${k + 1}.png`),
    ]);
  });
  execFileSync(FFMPEG, [
    "-v",
    "error",
    "-y",
    ...[1, 2, 3].flatMap((k) => ["-i", join(dir, `${s.id}-${k}.png`)]),
    "-filter_complex",
    "hstack=inputs=3",
    join(dir, `mosaico-${s.id}.png`),
  ]);
}

// 2. El texto en pantalla y la voz.
const fuentes = [...esquema.$defs.Fuente.enum, ...esquema.$defs.FuenteExpediente.enum];
const prohibidos = fuentes.filter((f) => f.includes("_"));
const identificador = /\b[a-z]+(?:_[a-z0-9]+)+\b/g;
// «dictamen» junto a lo que no es de Croquis: CESVI, AXA, el reporte, un número de reporte, o lo
// que solo tiene el reporte de CESVI (su PDF original, su hoja de cálculo, sus datos impresos).
const ajeno = new RegExp(
  [
    String.raw`dict[aá]men(?:es)?\s+(?:de|del)\s+(?:CESVI|AXA|reporte|los reportes|A\d{5,})`,
    String.raw`(?:CESVI|reporte)\S*\s+(?:\S+\s+){0,2}dict[aá]men`,
    String.raw`(?:PDF original|hoja de c[aá]lculo|impres\w*)[^.]{0,40}\bdel dict[aá]men`,
  ].join("|"),
  "i",
);

const hallazgos = [];
const dictamen = [];
for (const s of linea.segmentos) {
  const pantalla = (textos[s.id] ?? []).join("\n");
  for (const [donde, texto] of [
    ["pantalla", pantalla],
    ["voz", s.texto],
  ]) {
    for (const p of prohibidos)
      if (texto.includes(p))
        hallazgos.push({ segmento: s.id, donde, tipo: "fuente interna", texto: p });
    for (const m of texto.matchAll(identificador))
      hallazgos.push({ segmento: s.id, donde, tipo: "identificador", texto: m[0] });
    for (const m of texto.matchAll(/[^\n.]*dict[aá]men[^\n.]*/gi)) {
      const frase = m[0].trim();
      dictamen.push({ segmento: s.id, donde, frase });
      if (ajeno.test(frase))
        hallazgos.push({ segmento: s.id, donde, tipo: "dictamen ajeno a Croquis", texto: frase });
    }
  }
}
const unicos = [
  ...new Map(dictamen.map((d) => [`${d.segmento}|${d.donde}|${d.frase}`, d])).values(),
];
writeFileSync(
  join(dir, "revision.json"),
  `${JSON.stringify({ segmentos: linea.segmentos.length, hallazgos, dictamen: unicos }, null, 2)}\n`,
);
console.log(`Cuadros: ${linea.segmentos.length * 3} en ${dir}`);
console.log(`«dictamen»: ${unicos.length} apariciones distintas (revision.json)`);
for (const h of hallazgos) console.log(`✗ ${h.segmento} (${h.donde}) ${h.tipo}: ${h.texto}`);
if (hallazgos.length) process.exit(1);
console.log("Sin identificadores internos ni «dictamen» fuera de lo que produce Croquis.");
