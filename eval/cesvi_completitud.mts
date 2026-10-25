/**
 * ¿Qué reportes de CESVI traen lo necesario para reconstruir sin supuestos? (pedido de René,
 * 2026-10-24). Ranking de los 671 reportes de C0 con la extracción que ya existe, sin llamar a la
 * API:
 *
 * - `data/cesvi/corpus/expedientes.jsonl`: el expediente de C0 de cada reporte (masas, rigidez,
 *   medidas C y L, cálculos con sus entradas, restos);
 * - `data/cesvi/r4/lecturas-v2.jsonl`: la lectura v2 de la narración sin conclusiones (masas,
 *   posiciones descritas, medidas, longitudes de restos y huellas);
 * - `data/cesvi/calculos/fichas.json`: los cálculos impresos, con sus variables (E-C1);
 * - `data/cesvi/corpus/narraciones.jsonl`: lo que concluyó CESVI (velocidades);
 * - el texto crudo (`data/raw/cesvi/`, fuera de git; otra carpeta con `CESVI_CRUDOS`), solo para
 *   las tres menciones que la extracción no estructura: el punto de impacto, el ángulo o PDOF y la
 *   fricción con su valor. Es una búsqueda por patrón, como `eval/cesvi_corpus.mjs`: dice que el
 *   reporte lo escribe, no que lo mida bien. Sin el texto crudo, esas menciones cuentan como
 *   desconocidas.
 *
 * **Puntaje (0 a 8).** Un punto por criterio:
 * 1. masa de cada vehículo (fracción de los vehículos con masa);
 * 2. reposo de cada vehículo: una posición final descrita con una medida en metros o una distancia
 *    de restos o de desplazamiento (fracción de los vehículos; las distancias del reporte que no
 *    dicen de qué vehículo son cubren a uno);
 * 3. punto de impacto;
 * 4. ángulo de impacto o PDOF con su valor;
 * 5. perfil de deformación: C1–Cn (n ≥ 2) y L de al menos un vehículo;
 * 6. rigidez A y B;
 * 7. fricción con su valor;
 * 8. velocidades que calcula CESVI.
 *
 * **Completo para reconstruir sin supuestos:** 1 y 2 en todos los vehículos, y 3, 4, 5 y 7. La
 * rigidez y las velocidades no hacen falta (la rigidez tiene la de NHTSA marcada como tal; las
 * velocidades son contra qué comparar).
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/cesvi_completitud.mts
 *     → eval/results/cesvi_completitud.json
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Los reportes de un lote con el mismo id que `dividirLote` de packages/cesvi/src/corpus.ts. */
const dividirLote = (md: string) =>
  md
    .split(/^# Document: /m)
    .slice(1)
    .map((bloque) => {
      const salto = bloque.indexOf("\n");
      const archivo = bloque.slice(0, salto).trim();
      const id = `cesvi-${createHash("sha256").update(archivo, "utf8").digest("hex").slice(0, 10)}`;
      return { id, texto: bloque.slice(salto + 1) };
    });

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = process.argv[2] ?? join(RAIZ, "eval/results/cesvi_completitud.json");
const CRUDOS = process.env.CESVI_CRUDOS ?? join(RAIZ, "data/raw/cesvi");
const jsonl = (ruta: string) =>
  readFileSync(join(RAIZ, ruta), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Json);
const plano = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// --- Las fuentes -----------------------------------------------------------------------------------
const expedientes = new Map(
  jsonl("data/cesvi/corpus/expedientes.jsonl").map((f) => [String(f.id), f.expediente as Json]),
);
const lecturas = new Map(
  jsonl("data/cesvi/r4/lecturas-v2.jsonl").map((f) => [
    String(f.id),
    (((f.salida as Json | undefined)?.datos ?? []) as Json[]).map((d) => ({
      seccion: String(d.seccion),
      vehiculo: String(d.vehiculo),
      campo: String(d.campo),
      valor: String(d.valor ?? ""),
    })),
  ]),
);
const conclusiones = new Map(
  jsonl("data/cesvi/corpus/narraciones.jsonl").map((f) => [
    String(f.id),
    (f.conclusiones ?? {}) as Json,
  ]),
);
interface Variable {
  simbolo: string;
  significado?: string;
  valor?: number;
  unidad?: string;
}
interface Ficha {
  id: string;
  tipo: string;
  variables: Variable[];
  resultado?: { unidad?: string };
}
const fichas = (
  JSON.parse(readFileSync(join(RAIZ, "data/cesvi/calculos/fichas.json"), "utf8")) as {
    fichas: Ficha[];
  }
).fichas;
const textos = new Map<string, string>();
if (existsSync(CRUDOS))
  for (const f of readdirSync(CRUDOS)
    .filter((x) => /^crash_reports_batch_\d+\.md$/.test(x))
    .sort())
    for (const d of dividirLote(readFileSync(join(CRUDOS, f), "utf8")))
      textos.set(d.id, plano(d.texto));

// --- Reglas ----------------------------------------------------------------------------------------
const METROS = /\d+(?:[.,]\d+)?\s*(?:m\b|mts?\b|metros?\b)/;
const PATRON = {
  punto_impacto: /(punto|zona|area|lugar|sitio) de (impacto|colision|contacto|choque)/,
  angulo:
    /angulo[^.]{0,60}\d+(?:[.,]\d+)?\s*(°|º|grados)|\d+(?:[.,]\d+)?\s*(°|º|grados)[^.]{0,60}(impacto|colision|choque)|\bpdof\b/,
  friccion:
    /coeficiente de (friccion|adherencia|rozamiento|arrastre)[^.]{0,60}\d|(friccion|adherencia)[^.]{0,20}(=|de)\s*0[.,]\d/,
};
const esFriccion = (v: Variable) =>
  /fricc|adherencia|rozamiento|arrastre/.test(plano(v.significado ?? "")) ||
  (/^(μ|µ|mu|a|f)$/i.test(v.simbolo) &&
    (!v.unidad || v.unidad === "-" || v.unidad === "") &&
    v.valor !== undefined &&
    v.valor > 0 &&
    v.valor <= 1.5);
const esAngulo = (v: Variable) => v.unidad === "°" || /angulo/.test(plano(v.significado ?? ""));
const esMasa = (v: Variable) => v.unidad === "kg" && (v.valor ?? 0) > 50;
const esC = (s: string) => /^C\s*\d$/i.test(s);

interface Fila {
  id: string;
  vehiculos: number;
  puntaje: number;
  completo: boolean;
  tiene: string[];
  falta: string[];
}

function evaluar(id: string): Fila {
  const e = expedientes.get(id) ?? {};
  const lec = lecturas.get(id) ?? [];
  const fs = fichas.filter((f) => f.id === id);
  const vars = fs.flatMap((f) => f.variables);
  const calculos = ((e.calculos ?? []) as Json[]).map((c) => ({
    metodo: String(c.metodo),
    entradas: ((c.entradas ?? []) as Json[]).map((x): Variable => ({
      simbolo: String(x.nombre),
      valor: Number((x.valor as Json).valor),
      unidad: String((x.valor as Json).unidad ?? ""),
    })),
    resultado: c.resultado as Json | undefined,
  }));
  const entradas = calculos.flatMap((c) => c.entradas);
  const texto = textos.get(id);
  const ids = ((e.vehiculos ?? []) as Json[]).map((v) => String(v.id));
  const n = Math.max(ids.length, 1);

  // 1. Masa por vehículo; las de los cálculos que no dicen de qué vehículo cubren por número.
  const conMasa = new Set(
    ((e.vehiculos ?? []) as Json[]).filter((v) => v.masa).map((v) => String(v.id)),
  );
  for (const d of lec) if (d.seccion === "vehiculo" && d.campo === "masa") conMasa.add(d.vehiculo);
  const masasSueltas = new Set([...vars, ...entradas].filter(esMasa).map((v) => v.valor)).size;
  const masas = Math.min(n, Math.max(conMasa.size, masasSueltas));

  // 2. Reposo con medida por vehículo; las distancias sin vehículo cubren a uno.
  const conReposo = new Set(
    lec
      .filter(
        (d) =>
          d.seccion === "posicion" &&
          d.campo === "descripcion" &&
          METROS.test(plano(d.valor)) &&
          lec.some(
            (x) =>
              x.seccion === "posicion" &&
              x.vehiculo === d.vehiculo &&
              x.campo === "fase" &&
              x.valor === "final",
          ),
      )
      .map((d) => d.vehiculo),
  );
  const distancia =
    !!(e.evidencias as Json | undefined)?.restos ||
    lec.some(
      (d) => d.seccion === "restos" && d.campo === "longitud" && METROS.test(plano(d.valor)),
    ) ||
    fs.some((f) => f.tipo === "desplazamiento") ||
    calculos.some((c) => c.metodo === "desplazamiento");
  const reposos = Math.min(n, conReposo.size + (distancia ? 1 : 0));

  // 3, 4 y 7: menciones del texto, o variables de los cálculos.
  const mencion = (k: keyof typeof PATRON) => (texto === undefined ? null : PATRON[k].test(texto));
  const punto = mencion("punto_impacto");
  const angulo = vars.some(esAngulo) || entradas.some(esAngulo) || mencion("angulo");
  const friccion = vars.some(esFriccion) || entradas.some(esFriccion) || mencion("friccion");

  // 5. Perfil C1–Cn y L.
  const perfilExp = ((e.danos ?? []) as Json[]).some((d) => {
    const m = (d.magnitud ?? {}) as { c_m?: number[]; l_m?: number };
    return (m.c_m?.length ?? 0) >= 2 && m.l_m !== undefined;
  });
  const medidas = lec.filter((d) => d.campo === "medidas").map((d) => d.valor);
  const perfilLec =
    medidas.some((t) => /c\s*1/i.test(t) && /c\s*2/i.test(t)) &&
    medidas.some((t) => /\bL\b/.test(t));
  const simbolos = [...vars, ...entradas].map((v) => v.simbolo);
  const perfilFicha = simbolos.filter(esC).length >= 2 && simbolos.some((s) => /^L$/i.test(s));
  const perfil = perfilExp || perfilLec || perfilFicha;

  // 6. Rigidez A y B.
  const rigidez =
    ((e.vehiculos ?? []) as Json[]).some((v) => v.rigidez) ||
    (simbolos.includes("A") && simbolos.includes("B"));

  // 8. Velocidades que calcula CESVI.
  const velocidades =
    fs.some((f) => /km\/h|m\/s/.test(f.resultado?.unidad ?? "")) ||
    calculos.some((c) => /km\/h/.test(String(c.resultado?.unidad ?? ""))) ||
    ((conclusiones.get(id)?.velocidades ?? []) as Json[]).some((v) => v.vehiculo);

  const criterios: [string, number | null, string][] = [
    ["masa", masas / n, `masa de ${masas} de ${n} vehículos`],
    ["reposo", reposos / n, `reposo medido de ${reposos} de ${n} vehículos`],
    ["punto_impacto", punto === null ? null : Number(punto), "punto de impacto"],
    ["angulo", Number(angulo), "ángulo de impacto o PDOF"],
    ["perfil", Number(perfil), "perfil de deformación C1–Cn con L"],
    ["rigidez", Number(rigidez), "rigidez A y B"],
    ["friccion", Number(friccion), "fricción con su valor"],
    ["velocidades", Number(velocidades), "velocidades calculadas por CESVI"],
  ];
  const puntaje = criterios.reduce((s, [, x]) => s + (x ?? 0), 0);
  const v = Object.fromEntries(criterios.map(([k, x]) => [k, x]));
  const completo =
    v.masa === 1 &&
    v.reposo === 1 &&
    v.punto_impacto === 1 &&
    v.angulo === 1 &&
    v.perfil === 1 &&
    v.friccion === 1;
  return {
    id,
    vehiculos: ids.length,
    puntaje: Math.round(puntaje * 100) / 100,
    completo,
    tiene: criterios.filter(([, x]) => (x ?? 0) > 0).map(([, , t]) => t),
    falta: criterios
      .filter(([, x]) => x === null || x < 1)
      .map(([k, x, t]) =>
        x === null
          ? `${t} (desconocido: sin el texto crudo)`
          : x > 0 && (k === "masa" || k === "reposo")
            ? `${t} (incompleto)`
            : t,
      ),
  };
}

// --- Ranking ---------------------------------------------------------------------------------------
const filas = [...expedientes.keys()].map(evaluar);
filas.sort((a, b) => b.puntaje - a.puntaje || a.id.localeCompare(b.id));
const distribucion: Record<string, number> = {};
for (const f of filas) {
  const k = String(Math.floor(f.puntaje));
  distribucion[k] = (distribucion[k] ?? 0) + 1;
}
const cuenta = (pred: (f: Fila) => boolean) => filas.filter(pred).length;
const doc = {
  name: "cesvi_completitud",
  generated_at: new Date().toISOString().slice(0, 19) + "Z",
  git_commit: execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim(),
  descripcion:
    "Qué tan completos vienen los 671 reportes de C0 para una reconstrucción física, con la extracción que ya existe (sin API). Criterios y puntaje en el encabezado de eval/cesvi_completitud.mts.",
  fuentes: {
    expedientes_c0: expedientes.size,
    lecturas_r4_v2: lecturas.size,
    reportes_con_fichas_de_calculo: new Set(fichas.map((f) => f.id)).size,
    textos_crudos: textos.size,
  },
  definicion_completo:
    "Masa y reposo medido de todos los vehículos, punto de impacto, ángulo o PDOF con su valor, perfil C1–Cn con L de al menos un vehículo y fricción con su valor.",
  reportes: filas.length,
  completos: cuenta((f) => f.completo),
  por_criterio: {
    masa_de_todos: cuenta((f) => !f.falta.some((x) => x.startsWith("masa"))),
    reposo_de_todos: cuenta((f) => !f.falta.some((x) => x.startsWith("reposo"))),
    punto_impacto: cuenta((f) => f.tiene.includes("punto de impacto")),
    angulo: cuenta((f) => f.tiene.includes("ángulo de impacto o PDOF")),
    perfil: cuenta((f) => f.tiene.includes("perfil de deformación C1–Cn con L")),
    rigidez: cuenta((f) => f.tiene.includes("rigidez A y B")),
    friccion: cuenta((f) => f.tiene.includes("fricción con su valor")),
    velocidades: cuenta((f) => f.tiene.includes("velocidades calculadas por CESVI")),
  },
  distribucion_puntaje: distribucion,
  top10: filas.slice(0, 10),
};
writeFileSync(SALIDA, `${JSON.stringify(doc, null, 2)}\n`);
console.log(
  "escrito",
  SALIDA,
  "| reportes:",
  doc.reportes,
  "| completos:",
  doc.completos,
  "| textos:",
  textos.size,
);
for (const f of doc.top10) console.log(f.id, f.puntaje, f.completo, "falta:", f.falta.join("; "));
