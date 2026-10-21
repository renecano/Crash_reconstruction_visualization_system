/**
 * Prototipo CESVI (ADR 0048): ¿por qué la energía de la Tacoma del dictamen A2010930 no sale de sus
 * propios datos? Con la fórmula de 4 medidas que imprime el reporte y sus datos (L, A, B y C1–C4)
 * la energía es 225.454 kJ; el reporte imprime 220.1900228. Este script prueba las causas posibles
 * sin ajustar nada:
 *
 * 1. Redondeo de las C impresas (cada una ±0.005 m): el intervalo de energías posible.
 * 2. Un dígito mal leído por el OCR en L, A o B: todas las sustituciones de un dígito.
 * 3. Una o dos C distintas, con la precisión impresa (0.01 m).
 * 4. Variantes de la fórmula: pesos 1 o 2 de cada término lineal y cuadrático, productos vecinos
 *    0, 1 o 2 veces, el término A²/2B 0 a 4 veces y L/3 o L/4.
 * 5. El paso de energía a velocidad del reporte, √(2·E/m), con su propia energía.
 *
 * Una explicación cuenta como exacta solo si reproduce los 7 decimales impresos (|ΔE| < 5e-7).
 * Uso: `node eval/cesvi_discrepancia.mjs` (no lee datos crudos: los valores son los del caso
 * versionado en `data/cesvi/casos/A2010930.json`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "eval", "results", "cesvi_discrepancia.json");
const caso = JSON.parse(readFileSync(join(ROOT, "data/cesvi/casos/A2010930.json"), "utf8"));
const d = caso.calculos.deformacion_B;
const L = d.L_m.valor;
const A = d.A.valor;
const B = d.B.valor;
const C = d.C_m.map((x) => x.valor);
const OBJETIVO = d.reporte.energia.valor;
const MASA_T = caso.vehiculos.B.masa_kg.valor / 1000;
const EXACTO = 5e-7;

/** Forma de libro de 4 medidas, con pesos y factores configurables para las variantes. */
function energia(
  { L: l = L, A: a = A, B: b = B, C: c = C } = {},
  { wl = [1, 2, 2, 1], wq = [1, 2, 2, 1], vecinos = 1, umbral = 3, k = 3 } = {},
) {
  const lineal = c.reduce((s, x, i) => s + wl[i] * x, 0);
  let cuad = c.reduce((s, x, i) => s + wq[i] * x * x, 0);
  for (let i = 0; i < c.length - 1; i++) cuad += vecinos * c[i] * c[i + 1];
  return (l / k) * ((a / 2) * lineal + (b / 6) * cuad + (umbral * a * a) / (2 * b));
}

const r = (x, n = 7) => Math.round(x * 10 ** n) / 10 ** n;
const base = energia();

// 1. Redondeo de las C: la energía crece con cada C, así que los extremos son ±0.005 en todas.
const redondeo = {
  minimo: r(energia({ C: C.map((x) => x - 0.005) })),
  maximo: r(energia({ C: C.map((x) => x + 0.005) })),
};
redondeo.contiene_al_reporte = redondeo.minimo <= OBJETIVO && OBJETIVO <= redondeo.maximo;

// 2. Un dígito distinto en L, A o B.
const impresos = { L: "1.689", A: "55.405", B: "385.336" };
const digitos = [];
for (const [nombre, texto] of Object.entries(impresos)) {
  for (let i = 0; i < texto.length; i++) {
    if (!/\d/.test(texto[i])) continue;
    for (const nuevo of "0123456789") {
      if (nuevo === texto[i]) continue;
      const v = texto.slice(0, i) + nuevo + texto.slice(i + 1);
      const e = energia({ [nombre]: Number(v) });
      digitos.push({
        parametro: nombre,
        impreso: texto,
        leido: v,
        energia: r(e),
        diferencia: r(e - OBJETIVO),
      });
    }
  }
}
digitos.sort((x, y) => Math.abs(x.diferencia) - Math.abs(y.diferencia));

// 3. Una o dos C distintas, a 0.01 m (entre 0 y 1.49 m).
const cs = [];
for (let i = 0; i < 4; i++) {
  for (let v = 0; v < 150; v++) {
    const c = [...C];
    c[i] = v / 100;
    const e = energia({ C: c });
    cs.push({ cambio: { [`C${i + 1}`]: v / 100 }, energia: r(e), diferencia: r(e - OBJETIVO) });
    for (let j = i + 1; j < 4; j++) {
      for (let w = 0; w < 150; w++) {
        const c2 = [...c];
        c2[j] = w / 100;
        const e2 = energia({ C: c2 });
        if (Math.abs(e2 - OBJETIVO) < 0.01) {
          cs.push({
            cambio: { [`C${i + 1}`]: v / 100, [`C${j + 1}`]: w / 100 },
            energia: r(e2),
            diferencia: r(e2 - OBJETIVO),
          });
        }
      }
    }
  }
}
cs.sort((x, y) => Math.abs(x.diferencia) - Math.abs(y.diferencia));

// 4. Variantes de la fórmula.
const pesos = [1, 2];
const variantes = [];
for (const l0 of pesos)
  for (const l1 of pesos)
    for (const l2 of pesos)
      for (const l3 of pesos) {
        for (const q0 of pesos)
          for (const q1 of pesos)
            for (const q2 of pesos)
              for (const q3 of pesos) {
                for (const vecinos of [0, 1, 2]) {
                  for (const umbral of [0, 1, 2, 3, 4]) {
                    for (const k of [3, 4]) {
                      const v = { wl: [l0, l1, l2, l3], wq: [q0, q1, q2, q3], vecinos, umbral, k };
                      const e = energia({}, v);
                      variantes.push({ ...v, energia: r(e), diferencia: r(e - OBJETIVO) });
                    }
                  }
                }
              }
      }
variantes.sort((x, y) => Math.abs(x.diferencia) - Math.abs(y.diferencia));

// 5. Energía → velocidad con la energía del reporte.
const ebsReporte = Math.sqrt((2 * OBJETIVO) / MASA_T);
const ebsDatos = Math.sqrt((2 * base) / MASA_T);

const exactas = [
  ...digitos.filter((x) => Math.abs(x.diferencia) < EXACTO),
  ...cs.filter((x) => Math.abs(x.diferencia) < EXACTO),
  ...variantes.filter((x) => Math.abs(x.diferencia) < EXACTO),
];

const resultado = {
  evaluacion: "Prototipo CESVI: discrepancia de la energía de deformación del dictamen A2010930",
  generado_por: "node eval/cesvi_discrepancia.mjs",
  momento: new Date().toISOString(),
  datos: { L, A, B, C, masa_t: MASA_T },
  energia_reporte: OBJETIVO,
  energia_datos_impresos: r(base),
  diferencia: r(base - OBJETIVO),
  diferencia_pct: r((100 * (base - OBJETIVO)) / OBJETIVO, 4),
  ebs_kmh: {
    desde_energia_del_reporte: r(ebsReporte * 3.6, 4),
    desde_datos_impresos: r(ebsDatos * 3.6, 4),
    diferencia_pct: r((100 * (ebsDatos * 3.6 - 63.15)) / 63.15, 4),
  },
  hipotesis: {
    redondeo_de_C: redondeo,
    un_digito_en_L_A_o_B: { probadas: digitos.length, mas_cercanas: digitos.slice(0, 5) },
    una_o_dos_C_a_0_01: { mas_cercanas: cs.slice(0, 5) },
    variantes_de_formula: { probadas: variantes.length, mas_cercanas: variantes.slice(0, 5) },
  },
  explicaciones_exactas: exactas,
  lectura:
    exactas.length === 0
      ? "Ninguna hipótesis reproduce los 7 decimales impresos: la energía del reporte no sale de sus datos impresos con la fórmula impresa ni con un error de lectura o de redondeo. Lo probable es que se calculara con datos que el reporte no imprime (medidas sin redondear u hoja de cálculo); hay que pedir a CESVI el PDF original o su hoja."
      : "Hay al menos una explicación exacta; ver explicaciones_exactas.",
};
writeFileSync(OUT, `${JSON.stringify(resultado, null, 2)}\n`);
console.log(OUT);
console.log(
  `E con datos impresos ${resultado.energia_datos_impresos} vs reporte ${OBJETIVO} (${resultado.diferencia_pct} %); explicaciones exactas: ${exactas.length}`,
);
console.log(
  `Redondeo de C: ${redondeo.minimo}–${redondeo.maximo}; un dígito más cercano: ${digitos[0].parametro}=${digitos[0].leido} → ${digitos[0].energia}; variante más cercana a ${variantes[0].diferencia}`,
);
