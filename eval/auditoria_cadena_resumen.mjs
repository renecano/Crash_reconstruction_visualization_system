// El resumen de la revisión de la cadena (René, 2026-11-24 y 25): cada fuente de
// eval/results/auditoria_cadena/<fuente>.jsonl se queda con la última fila de cada caso (la
// corrida vigente; las anteriores pasan a <fuente>_historial.jsonl, que no se versiona) y se cuentan
// las reglas por fuente en resumen.json, con los casos de cada una.
//
//   node eval/auditoria_cadena_resumen.mjs
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "results/auditoria_cadena");
const resumen = { fecha: new Date().toISOString(), fuentes: {} };
for (const fuente of ["prueba", "nuevas", "ejemplos"]) {
  const ruta = join(DIR, `${fuente}.jsonl`);
  if (!existsSync(ruta)) continue;
  const filas = readFileSync(ruta, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const ultima = new Map();
  for (const f of filas) ultima.set(f.id, f);
  if (ultima.size < filas.length) {
    const vigentes = new Set(ultima.values());
    const viejas = filas.filter((f) => !vigentes.has(f));
    appendFileSync(
      join(DIR, `${fuente}_historial.jsonl`),
      viejas.map((f) => JSON.stringify(f)).join("\n") + "\n",
    );
    writeFileSync(ruta, [...ultima.values()].map((f) => JSON.stringify(f)).join("\n") + "\n");
  }
  const reglas = {};
  for (const f of ultima.values())
    for (const x of f.fallas) {
      reglas[x.regla] ??= { casos: 0, ids: [] };
      if (!reglas[x.regla].ids.includes(f.id)) {
        reglas[x.regla].casos += 1;
        reglas[x.regla].ids.push(f.id);
      }
    }
  resumen.fuentes[fuente] = {
    casos: ultima.size,
    lugar_encontrado: [...ultima.values()].filter((f) => f.datos?.lugar).length,
    reglas: Object.fromEntries(Object.entries(reglas).sort(([a], [b]) => a.localeCompare(b))),
  };
}
writeFileSync(join(DIR, "resumen.json"), `${JSON.stringify(resumen, null, 1)}\n`);
for (const [f, r] of Object.entries(resumen.fuentes))
  console.log(
    f,
    r.casos,
    Object.fromEntries(Object.entries(r.reglas).map(([k, v]) => [k, v.casos])),
  );
