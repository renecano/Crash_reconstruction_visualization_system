/**
 * Ronda 4, A1 (René, 2026-11-18): qué cambia al leer de la narración la superficie, su estado, el
 * clima y la luz (`packages/cesvi/src/condiciones.ts`).
 *
 * - **Los cinco ejemplos:** la cifra antes (`eval/results/ronda2_ejemplos.json`, producción del
 *   2026-11-17) y después (`eval/results/ronda4_ejemplos_condiciones_despues.json`, la misma e2e
 *   `apps/web/e2e/ejemplos-ronda2.spec.ts` contra el build local de la rama).
 * - **La fricción** de la tabla del solver para cada superficie y estado que cambió.
 * - **El corpus de CESVI** (`data/cesvi/corpus/narraciones.jsonl`): cuántas narraciones leen una
 *   superficie o un estado distinto del que se suponía (asfalto seco). Solo lee texto: no reconstruye.
 *
 * Uso (desde packages/cesvi): node --import tsx ../../eval/ronda4_condiciones.mts
 *   → eval/results/ronda4_condiciones.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { condicionesDeTexto } from "../packages/cesvi/src/condiciones";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = <T,>(r: string): T => JSON.parse(readFileSync(join(RAIZ, r), "utf8")) as T;

interface Ejemplo {
  clave: string;
  cifra: string;
  de_quien: string;
  rango: string;
}
const antes = leer<{ ejemplos: Ejemplo[]; fecha: string; sitio: string }>(
  "eval/results/ronda2_ejemplos.json",
);
const despues = leer<{ ejemplos: Ejemplo[]; fecha: string; sitio: string }>(
  "eval/results/ronda4_ejemplos_condiciones_despues.json",
);
const NARRACION: Record<string, string> = {
  "crucero-noche": "data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
  "alcance-deformacion": "data/cesvi/grabaciones/ejemplos/alcance-deformacion.json",
  "carambola-lluvia": "data/cesvi/grabaciones/ejemplos/carambola-lluvia.json",
  "reversa-pendiente": "data/cesvi/grabaciones/ejemplos/reversa-pendiente.json",
  "poste-terraceria": "data/cesvi/grabaciones/ejemplos/poste-terraceria.json",
};
const friccion = leer<{
  llanta: Record<string, Record<string, { nominal: number; rango: [number, number] }>>;
}>("packages/solver-ts/src/data/friction.json").llanta;

const efectiva = (c: ReturnType<typeof condicionesDeTexto>) => ({
  superficie: c.superficie?.valor ?? "asfalto",
  estado:
    c.estado_superficie?.valor ??
    (c.clima && /^lluvia|granizo/.test(c.clima.valor) ? "mojado" : "seco"),
});

const ejemplos = antes.ejemplos.map((a) => {
  const d = despues.ejemplos.find((x) => x.clave === a.clave)!;
  const c = condicionesDeTexto(leer<{ narracion: string }>(NARRACION[a.clave]!).narracion);
  const { superficie, estado } = efectiva(c);
  const ca = Number(a.cifra);
  const cd = Number(d.cifra);
  return {
    clave: a.clave,
    condiciones: Object.fromEntries(
      Object.entries(c).map(([k, v]) => [k, { valor: v!.valor, cita: v!.cita }]),
    ),
    friccion: { superficie, estado, ...friccion[superficie]![estado]! },
    antes: { cifra_kmh: ca, de: a.de_quien, rango: a.rango },
    despues: { cifra_kmh: cd, de: d.de_quien, rango: d.rango },
    diferencia_kmh: cd - ca,
    diferencia_pct: Math.round(((cd - ca) / ca) * 1000) / 10,
  };
});

const filas = readFileSync(join(RAIZ, "data/cesvi/corpus/narraciones.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as { id: string; descripcion: string });
const porCambio: Record<string, number> = {};
for (const f of filas) {
  const { superficie, estado } = efectiva(condicionesDeTexto(f.descripcion));
  if (superficie === "asfalto" && estado === "seco") continue;
  const k = `${superficie} ${estado}`;
  porCambio[k] = (porCambio[k] ?? 0) + 1;
}

const out = {
  descripcion:
    "Ronda 4, A1: la superficie, su estado, el clima y la luz leídos de la narración. Antes y después de los cinco ejemplos, la fricción de la tabla del solver y cuántas narraciones del corpus de CESVI cambian lo que entra a la fricción.",
  script: "eval/ronda4_condiciones.mts",
  fecha: new Date().toISOString(),
  antes: { archivo: "eval/results/ronda2_ejemplos.json", sitio: antes.sitio, fecha: antes.fecha },
  despues: {
    archivo: "eval/results/ronda4_ejemplos_condiciones_despues.json",
    sitio: despues.sitio,
    fecha: despues.fecha,
  },
  supuesto_anterior: { superficie: "asfalto", estado: "seco", ...friccion.asfalto!.seco! },
  ejemplos,
  corpus: {
    narraciones: filas.length,
    cambian_la_friccion: Object.values(porCambio).reduce((s, n) => s + n, 0),
    por_superficie_y_estado: porCambio,
  },
};
writeFileSync(
  join(RAIZ, "eval/results/ronda4_condiciones.json"),
  JSON.stringify(out, null, 2) + "\n",
);
for (const e of ejemplos)
  process.stdout.write(
    `${e.clave}: ${e.antes.cifra_kmh} → ${e.despues.cifra_kmh} km/h (${e.diferencia_pct} %), ${e.friccion.superficie} ${e.friccion.estado} μ ${e.friccion.nominal}\n`,
  );
process.stdout.write(
  `corpus: ${out.corpus.cambian_la_friccion} de ${filas.length} cambian lo que entra a la fricción\n`,
);
