/**
 * Las cifras publicadas de Croquis, en un solo índice (auditoría del 2026-11-15, §3.3; ADR 0138).
 *
 * Cada cifra que aparece en la portada, el README o los documentos de estado está aquí con su valor,
 * su denominador si es una tasa, su unidad, las simulaciones con que se calculó si es un rango, y el
 * archivo y el campo de donde sale. Nadie escribe 205, 58.3 o 56.87 a mano: se toman de este índice,
 * y `eval/verificar_cifras.mjs` (en CI) comprueba que los documentos no se aparten de él.
 *
 *   node eval/cifras.mjs           → eval/results/cifras.json
 *   node eval/cifras.mjs --check   falla si el índice no está al día con sus fuentes
 *
 * Solo lee archivos del repositorio: no corre el solver ni llama a ninguna API.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(RAIZ, "eval/results/cifras.json");
const leer = (ruta) => JSON.parse(readFileSync(join(RAIZ, ruta), "utf8").replace(/^﻿/, ""));

/** El valor de `campo` («a.b.0.c») en `doc`; falla si no existe. */
function campo(doc, ruta, archivo) {
  let x = doc;
  for (const k of ruta.split(".")) {
    if (x === null || x === undefined || !(k in Object(x)))
      throw new Error(`${archivo}: no existe el campo «${ruta}»`);
    x = x[k];
  }
  return x;
}

// Los mismos formatos de `packages/cesvi/src/formato.ts` (la prueba `cifras.test.ts` los compara).
const fijo = (x, d) => {
  const t = x.toFixed(d);
  return Number(t) === 0 ? t.replace("-", "") : t;
};
const miles = (n) => n.toLocaleString("en-US");
const tasaTexto = (t) => `${t.k} de ${t.n} (${fijo(t.pct, 1)} %)`;
const velocidadTexto = (v, d) => `${fijo(v.mejor, d)} km/h (${fijo(v.p10, d)}–${fijo(v.p90, d)})`;

/** Las simulaciones de producción, del código (el resultado de la medición no las guarda). */
function muestrasDeProduccion() {
  const fuente = readFileSync(join(RAIZ, "packages/solver-ts/src/full-result.ts"), "utf8");
  const m = /PRODUCTION_SAMPLES[^=]*=\s*\{\s*samples:\s*(\d+),\s*mcSamples:\s*(\d+)/.exec(fuente);
  if (!m)
    throw new Error("No encuentro PRODUCTION_SAMPLES en packages/solver-ts/src/full-result.ts");
  return { inversion: Number(m[1]), monte_carlo: Number(m[2]) };
}

function construir() {
  const cifras = {};
  const pon = (clave, datos) => {
    if (clave in cifras) throw new Error(`Cifra repetida: ${clave}`);
    cifras[clave] = datos;
  };
  const entero = (clave, que, archivo, ruta) => {
    const valor = campo(leer(archivo), ruta, archivo);
    pon(clave, { que, valor, texto: miles(valor), fuente: archivo, campo: ruta });
  };
  const tasa = (clave, que, archivo, ruta) => {
    const t = campo(leer(archivo), ruta, archivo);
    if (!(t.n > 0) || Math.abs(t.pct - (100 * t.k) / t.n) > 0.05)
      throw new Error(
        `${archivo}: la tasa «${ruta}» no cuadra (${t.k} de ${t.n} no es ${t.pct} %)`,
      );
    pon(clave, {
      que,
      k: t.k,
      n: t.n,
      pct: t.pct,
      texto: tasaTexto(t),
      fuente: archivo,
      campo: ruta,
    });
  };

  // --- El corpus y la prueba a ciegas ---
  entero(
    "corpus.reportes",
    "Reportes de CESVI estudiados",
    "eval/results/cesvi_corpus_extraccion.json",
    "dictamenes",
  );
  entero(
    "corpus.validos",
    "Reportes leídos con un expediente válido",
    "eval/results/cesvi_corpus_extraccion.json",
    "validos",
  );
  entero(
    "er4.prueba",
    "Reportes de la prueba, reconstruidos a ciegas",
    "data/cesvi/r4/pagina.json",
    "dictamenes",
  );
  tasa(
    "er4.modalidad_titulo",
    "Modalidad acertada contra el título del reporte (prueba; solo los reportes que la dicen en su título)",
    "eval/results/cesvi_r4c_titulo_prueba.json",
    "v4.titulo_del_reporte.croquis",
  );
  tasa(
    "er4.regla_simple",
    "La regla simple (decir siempre la modalidad más frecuente), sobre los mismos reportes",
    "eval/results/cesvi_r4c_titulo_prueba.json",
    "v4.titulo_del_reporte.linea_base",
  );

  // --- AXA, como la reconstruye la app ---
  {
    const archivo = "eval/results/axa_rango_estable.json";
    const doc = leer(archivo);
    const i = doc.filas.findIndex((f) => f.es_la_de_la_app);
    if (i < 0) throw new Error(`${archivo}: no hay fila con la semilla de la app`);
    const muestras = muestrasDeProduccion();
    for (const [id, letra] of [
      ["V2", "B"],
      ["V1", "A"],
    ]) {
      const v = doc.filas[i][id];
      pon(`axa.${id.toLowerCase()}`, {
        que: `AXA A2010930: velocidad de ${id} (${letra}) antes del impacto, reconstrucción física de la app`,
        mejor: v.mejor,
        p10: v.p10,
        p90: v.p90,
        unidad: "km/h",
        muestras: muestras.inversion,
        juego_de_muestras: "producción",
        // En pantalla y en el dictamen la conclusión va en enteros (ADR 0138).
        texto: velocidadTexto(v, 0),
        texto_completo: velocidadTexto(v, 2),
        fuente: archivo,
        campo: `filas.${i}.${id}`,
      });
    }
    pon("axa.hipotesis", {
      que: "AXA A2010930: hipótesis que muestra la reconstrucción",
      valor: doc.filas[i].hipotesis,
      texto: String(doc.filas[i].hipotesis),
      fuente: archivo,
      campo: `filas.${i}.hipotesis`,
    });
  }

  // --- La hipótesis que se ve en AXA sin elegir: su nombre, del código que lo escribe ---
  {
    const archivo = "packages/cesvi/src/reconstruccion.ts";
    const m = /TITULOS_DE_HIPOTESIS[^=]*=\s*\{\s*dano:\s*"([^"]+)"/.exec(
      readFileSync(join(RAIZ, archivo), "utf8"),
    );
    if (!m) throw new Error(`${archivo}: no encuentro el nombre de la hipótesis del daño`);
    pon("axa.hipotesis_visible", {
      que: "AXA A2010930: cómo se llama la hipótesis que se ve sin elegir (la deformación como restricción)",
      texto: m[1],
      fuente: archivo,
      campo: "TITULOS_DE_HIPOTESIS.dano",
    });
  }

  // --- La cobertura del rango: casos fabricados con velocidad verdadera conocida ---
  {
    // La corrida completa (200 casos por escena, de la computadora del colaborador) si ya llegó; si
    // no, la reducida de la laptop.
    const completa = "eval/results/t3_cobertura.json";
    const reducida = "eval/results/t3/cobertura_40.json";
    const archivo = existsSync(join(RAIZ, completa)) ? completa : reducida;
    const doc = leer(archivo);
    const t = doc.total.supuestos_sorteados;
    const c = {
      k: t.dentro,
      n: t.velocidades,
      pct: Math.round((1000 * t.dentro) / t.velocidades) / 10,
    };
    pon("cobertura.rango", {
      que: "Cobertura sintética del p10–p90 de la inversión: de las velocidades verdaderas conocidas, cuántas cayeron dentro del rango",
      ...c,
      esperado_pct: doc.esperado_pct,
      ic95_pct: t.ic95_pct,
      casos_por_escena: doc.casos_por_escena,
      texto: tasaTexto(c),
      fuente: archivo,
      campo: "total.supuestos_sorteados",
    });
  }

  // --- La paridad del solver ---
  entero(
    "paridad.numeros",
    "Números comparados entre el solver TS y la referencia Python (E7)",
    "eval/results/e7_parity.json",
    "numeros_comparados",
  );
  {
    const archivo = "eval/results/e7_parity.json";
    const doc = leer(archivo);
    pon("paridad.escenas", {
      que: "Escenas canónicas de la paridad (E7)",
      valor: doc.escenas.length,
      texto: String(doc.escenas.length),
      fuente: archivo,
      campo: "escenas.length",
    });
    pon("paridad.max_abs", {
      que: "Mayor diferencia absoluta de la paridad (E7)",
      valor: doc.max_abs,
      texto: String(doc.max_abs),
      fuente: archivo,
      campo: "max_abs",
    });
  }

  // --- Las carambolas: impactos posteriores que ocurren en la reconstrucción (E-R6 v2) ---
  for (const p of ["prueba", "desarrollo"]) {
    const archivo = `eval/results/cesvi_r4b_carambolas_${p}.json`;
    const doc = leer(archivo);
    const k = doc.impactos_posteriores_ocurridos;
    const n = doc.impactos_posteriores_en_escena;
    if (!(n > 0) || !(k >= 0)) throw new Error(`${archivo}: sin impactos posteriores`);
    pon(`carambolas.${p}`, {
      que: `Carambolas (${p}): impactos posteriores entre vehículos que ocurren en la reconstrucción, de los que pasan a la escena`,
      k,
      n,
      pct: Math.round((1000 * k) / n) / 10,
      texto: `${k} de ${n}`,
      fuente: archivo,
      campo: "impactos_posteriores_ocurridos / impactos_posteriores_en_escena",
      motivo: `Se corrigió el choque fantasma de la reconstrucción previa (#323); recupera cesvi-e9aed4ab5b y agrega 3 impactos; René lo aprobó el 2026-11-26. Antes, ${p === "prueba" ? "21 de 31" : "44 de 55"}.`,
    });
  }

  // --- Los cinco ejemplos, como los arma el perito en La escena (René, 2026-11-26) ---
  // Una cifra por ejemplo y vehículo: la que ve el perito. La escena que propone La escena en el lugar
  // guardado de cada ejemplo, con sus calles, corregida según la narración con las mismas funciones
  // que usa la app (`apps/web/src/lib/ejemplo-como-perito.ts`, recetas en `recetas-perito.ts`).
  {
    const archivo = "eval/results/ejemplos_en_su_lugar/cifras.json";
    const doc = leer(archivo);
    const APROBADO =
      "Escena armada con el mismo código de La escena, direcciones por las calles reales (#331); René lo aprobó el 2026-11-26.";
    const CRUCERO =
      "Escena armada con el mismo código de La escena, direcciones por las calles reales y confirmadas como con el botón «Confirmar» de la app (#331); René lo aprobó el 2026-11-26.";
    const POSTE =
      "Escena armada con el mismo código de La escena (#331), con el golpe contra el poste calculado y el derrape de 18.40 m como evidencia. Desde el 2026-11-26 (fix/w-poste-mazda), el Mazda quedó «1 metro al Oriente» (decía «8 metros al Norte», que la física no alcanza) y la revisión de «reposo inalcanzable» ya no se queda en un mínimo local: pendiente del visto bueno de René.";
    const REVERSA =
      "Escena armada con el mismo código de La escena (#331). La velocidad en reversa del CR-V pesa como supuesto con su rango (NHTSA, 3.06–9.07 km/h), porque la narración no da evidencia de más; el rango del Versa cambia por eso. René lo aprobó el 2026-11-26.";
    for (const [clave, ejemplo, vehiculo, que, antes, motivo] of [
      [
        "ejemplos.crucero",
        "crucero-noche",
        "V1",
        "«crucero de noche»: velocidad del Jetta (A) antes del impacto",
        "20 (4–27) publicada y 20 (10–28) en la tabla",
        CRUCERO,
      ],
      [
        "ejemplos.crucero_camaro",
        "crucero-noche",
        "V2",
        "«crucero de noche»: velocidad del Camaro (B) antes del impacto",
        "12 (3–19)",
        CRUCERO,
      ],
      [
        "ejemplos.alcance",
        "alcance-deformacion",
        "V1",
        "«alcance en carretera»: velocidad de la NP300 (A), la que alcanza, antes del impacto",
        "53 (49–55)",
        APROBADO,
      ],
      [
        "ejemplos.alcance_corolla",
        "alcance-deformacion",
        "V2",
        "«alcance en carretera»: velocidad del Vento (B), el alcanzado, antes del impacto",
        "0 (0–8)",
        APROBADO,
      ],
      [
        "ejemplos.carambola",
        "carambola-lluvia",
        "V1",
        "«carambola con lluvia»: velocidad de la Ranger (A) antes del primer impacto",
        "24 (19–32)",
        APROBADO,
      ],
      [
        "ejemplos.reversa",
        "reversa-pendiente",
        "V2",
        "«reversa en pendiente»: velocidad del Versa (B) antes del impacto",
        "20 (18–25)",
        REVERSA,
      ],
      [
        "ejemplos.reversa_crv",
        "reversa-pendiente",
        "V1",
        "«reversa en pendiente»: velocidad del CR-V (A) en reversa antes del impacto",
        "9 (1–18)",
        REVERSA,
      ],
      [
        "ejemplos.poste",
        "poste-terraceria",
        "V2",
        "«poste y terracería»: velocidad del Sentra (B) antes del impacto",
        "59 (49–64), aprobada el 2026-11-26",
        POSTE,
      ],
    ]) {
      const i = doc.filas.findIndex((f) => f.clave === ejemplo);
      if (i < 0) throw new Error(`${archivo}: no está el ejemplo ${ejemplo}`);
      const j = doc.filas[i].velocidades.findIndex((v) => v.vehiculo === vehiculo);
      const v = doc.filas[i].velocidades[j];
      pon(clave, {
        que: `Ejemplo ${que}, como lo arma el perito en La escena`,
        mejor: v.mejor,
        p10: v.p10,
        p90: v.p90,
        unidad: "km/h",
        muestras: doc.muestras.samples,
        juego_de_muestras: "producción",
        texto: `${v.mejor} km/h (${v.p10}–${v.p90})`,
        fuente: archivo,
        campo: `filas.${i}.velocidades.${j}`,
        motivo: `${motivo} Antes, ${antes}.`,
      });
    }
  }

  // --- La reversa (supuesto con fuente) ---
  {
    const archivo = "packages/cesvi/src/data/reversa-nhtsa.json";
    const doc = leer(archivo);
    // Los mismos cuantiles que usa la app (`packages/cesvi/src/reversa.ts`): mph a km/h, a centésimas.
    const kmh = (mph) => Math.round(mph * 1.609344 * 100) / 100;
    const q = doc.velocidad_maxima_mph;
    const v = { mejor: kmh(q.p50), p10: kmh(q.p10), p90: kmh(q.p90) };
    pon("reversa.velocidad", {
      que: "Velocidad supuesta de un vehículo en reversa: mediana y p10–p90 de la velocidad máxima de maniobras reales",
      ...v,
      unidad: "km/h",
      // Es un supuesto con fuente, no una conclusión de la reconstrucción: lleva los decimales de su fuente.
      texto: velocidadTexto(v, 2),
      fuente: archivo,
      campo: "velocidad_maxima_mph.{p10,p50,p90}",
      cita: doc.fuente,
    });
  }

  return {
    descripcion:
      "Las cifras publicadas de Croquis, cada una con el archivo y el campo de donde sale. Generado por eval/cifras.mjs; no se edita a mano.",
    // Cifras que ya no valen: si un documento vigente las trae, debe decir «antes» o una fecha en la
    // misma línea (eval/verificar_cifras.mjs).
    retiradas: [
      { texto: "71.56", que: "AXA antes de W8 (T3.2, 2026-11-12)" },
      { texto: "68.02", que: "AXA antes de W8: p10" },
      { texto: "92.81", que: "AXA antes de W8: p90" },
      { texto: "63.17", que: "AXA con la inversión de octubre" },
      { texto: "113.09", que: "AXA con la inversión de octubre: p90" },
      { texto: "68,557", que: "Paridad antes de las 14 escenas" },
      { texto: "68 557", que: "Paridad antes de las 14 escenas" },
      { texto: "68557", que: "Paridad antes de las 14 escenas" },
      { texto: "43 de 55", que: "Carambolas de desarrollo medidas el 2026-10-23, antes del #119" },
      {
        texto: "20 de 31",
        que: "Carambolas de prueba antes de la ronda 4 (2026-11-23): la velocidad típica de la vía según su clase en el texto del lugar del reporte (LGMSV; carreteras 80–110, calles 30) donde la evidencia no fija la velocidad gana un impacto posterior en una carretera y en una calle y lo pierde en otra calle (#284, 4d7812cd). «21 de 31» también se midió el 2026-10-23, antes del #119, con otros casos",
      },
      {
        texto: "40 de 55",
        que: "Carambolas de desarrollo antes de la ronda 4 (2026-11-23): la velocidad típica de la vía en lugar de los 40 km/h del ajuste (c4d4beb3), su clase según el texto del lugar (4d7812cd) y la masa de la ficha del fabricante de diez modelos más (4f9c6b08)",
      },
      {
        texto: "36 km/h (29–38)",
        que: "Ejemplo «poste y terracería» con el código de producción anterior a la ronda 4 (3257fa9f); con la masa de la ficha de cada modelo da 36 km/h (31–38) (2026-11-23)",
      },
      {
        texto: "27 km/h (23–35)",
        que: "Ejemplo «poste y terracería» medido en la t5 y la t5c: la receta de la e2e buscaba «el 3» y la pantalla dice «Mazda 3», así que dejaba el Mazda junto al choque y no 8 m al norte como dice la narración (René, 2026-11-21)",
      },
    ],
    cifras,
  };
}

const nuevo = `${JSON.stringify(construir(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  let actual = "";
  try {
    actual = readFileSync(SALIDA, "utf8");
  } catch {
    /* no existe todavía */
  }
  if (actual !== nuevo) {
    console.error("eval/results/cifras.json no está al día: corre `node eval/cifras.mjs`.");
    process.exit(1);
  }
  console.log(`Cifras al día: ${Object.keys(JSON.parse(nuevo).cifras).length} cifras publicadas.`);
} else {
  writeFileSync(SALIDA, nuevo);
  console.log(SALIDA);
}
