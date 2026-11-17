#!/usr/bin/env node
/**
 * Quién gastó la transferencia de Vercel Blob del 2026-11-15 al 2026-11-17 (René: subió 3.7 GB en dos
 * días, de 5.07 a 8.8 GB). Es una estimación: número de cargas × lo que baja cada una. Vercel no da el
 * desglose por quién descarga en el plan Hobby.
 *
 * - Lo que baja cada carga sale de mediciones: la primera visita al 3D (`blob_transferencia.json`), los
 *   modelos (`apps/web/public/modelos/vehiculos`) y la copia local de hoy (lo que contó
 *   `publicar-web.mjs --bajar`).
 * - El número de cargas de cada prueba o medición sale de sus resultados en `eval/results` (su fecha y
 *   su sitio) y de cómo abre el navegador cada script (perfil nuevo = carga sin caché). Las corridas
 *   fallidas que no dejaron archivo no se pueden contar: si las hubo, el gasto real de esa fila es
 *   mayor.
 * - Lo que no se puede contar desde aquí (las visitas de personas y lo que se volvió a bajar por cada
 *   build nuevo publicado) es la diferencia con lo que vio René en el panel.
 *
 *   node eval/blob_gasto.mjs   → eval/results/blob_gasto_estimado.json
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const leer = (p) => JSON.parse(readFileSync(join(RAIZ, p), "utf8"));
const MB = (b) => Math.round(b * 10) / 10;

// Lo que baja cada tipo de carga (MB).
const primeraVisita3d = leer("eval/results/blob_transferencia.json").blob_primera_mb;
const modelos = leer("apps/web/public/modelos/vehiculos/vehiculos.json");
const tamano = (clase) =>
  statSync(
    join(RAIZ, "apps/web/public/modelos/vehiculos", modelos.clases[clase].archivos.alta.archivo),
  ).size / 1e6;
// Un caso típico tiene dos vehículos: el promedio de los modelos «alta» por dos.
const clases = Object.keys(modelos.clases);
const modelosPorCaso = (2 * clases.map(tamano).reduce((a, b) => a + b, 0)) / clases.length;
const hdri = readdirSync(join(RAIZ, "apps/web/public/hdri"))
  .filter((f) => f.endsWith(".hdr"))
  .map((f) => statSync(join(RAIZ, "apps/web/public/hdri", f)).size / 1e6);
const unHdri = Math.max(...hdri);
const copiaLocal = 76.3; // 72.8 MiB, lo que contó `publicar-web.mjs --bajar` el 2026-11-17

const fecha = (p) => leer(p).fecha ?? leer(p).generated_at ?? null;

/** Cada fila: qué fue, cuántas cargas sin caché, de qué tamaño y de dónde sale el conteo. */
const filas = [
  {
    que: "Copia local del build de producción para no volver a usar Blob (una sola vez)",
    cargas: 1,
    mb_por_carga: copiaLocal,
    evidencia: "publicar-web.mjs --bajar 64b29e877ba9c856, 2026-11-17",
  },
  {
    que: "Flujo con el Unity real contra producción (visor-unity-real.spec.ts)",
    cargas: 3,
    mb_por_carga: primeraVisita3d,
    evidencia: `u6_flujo_unity_produccion.json (${fecha("eval/results/u6_flujo_unity_produccion.json")}): una corrida buena y dos mal invocadas ese día (memoria del proyecto), cada una con perfil nuevo`,
  },
  {
    que: "Medición de la transferencia de una visita al 3D (blob-transferencia.spec.ts)",
    cargas: 1,
    mb_por_carga: primeraVisita3d,
    evidencia: `blob_transferencia.json (${fecha("eval/results/blob_transferencia.json")}): primera visita; la segunda salió de la caché (0 MB)`,
  },
  {
    que: "Ensayos de la demo en producción (ensayo-demo.spec.ts)",
    cargas: 2,
    mb_por_carga: primeraVisita3d,
    evidencia: `ensayo_demo.json (${fecha("eval/results/ensayo_demo.json")}) y ensayo_demo_nota.json (${fecha("eval/results/ensayo_demo_nota.json")}), perfil nuevo cada uno`,
  },
  {
    que: "Medición del hilo principal al cambiar de paso con Unity (medir-pasos.spec.ts)",
    cargas: 4,
    mb_por_carga: primeraVisita3d,
    evidencia:
      "pasos_hilo_antes, pasos_hilo_despues, pasos_hilo_despues_produccion y pasos_hilo_ronda2_a1: contexto nuevo cada uno; aun con el sitio local, el build de Unity salía de Blob",
  },
  {
    que: "Arranque del 3D por partes (medir-unity-arranque.spec.ts)",
    cargas: 1,
    mb_por_carga: primeraVisita3d + modelosPorCaso,
    evidencia: `unity_arranque.json (${fecha("eval/results/unity_arranque.json")}): primera visita sin caché y un caso nuevo; la segunda visita, de la caché`,
  },
  {
    que: "Recorrido de los cinco ejemplos en producción, sin Unity (ejemplos-ronda2.spec.ts)",
    cargas: 5,
    mb_por_carga: modelosPorCaso + unHdri,
    evidencia: `ronda2_ejemplos.json (${fecha("eval/results/ronda2_ejemplos.json")}): el visor ligero baja de Blob los modelos y el cielo de cada caso`,
  },
  {
    que: "Perfil de carga de Unity con el build local (perfil-carga.mjs, rama de Opus)",
    cargas: 3,
    mb_por_carga: modelosPorCaso,
    evidencia:
      "el build era local, pero Unity pide los modelos de los vehículos a Blob: tres corridas",
  },
];

const contado = filas.reduce((t, f) => t + f.cargas * f.mb_por_carga, 0);
const panel = {
  antes_gb: 5.07,
  despues_gb: 8.8,
  fechas: "2026-11-15 → 2026-11-17 (capturas de René)",
};
const subida = (panel.despues_gb - panel.antes_gb) * 1000;

const r = {
  descripcion:
    "Estimación de la transferencia de Vercel Blob por actividad (número de cargas × MB de cada una) del 2026-11-15 al 2026-11-17, contra lo que subió en el panel.",
  script: "eval/blob_gasto.mjs",
  generated_at: new Date().toISOString(),
  mb_por_tipo_de_carga: {
    primera_visita_al_3d: primeraVisita3d,
    modelos_de_un_caso_de_dos_vehiculos: MB(modelosPorCaso),
    un_cielo_hdri: MB(unHdri),
    copia_local_del_build: copiaLocal,
  },
  filas: filas.map((f) => ({
    ...f,
    mb_por_carga: MB(f.mb_por_carga),
    mb: MB(f.cargas * f.mb_por_carga),
  })),
  contado_mb: MB(contado),
  panel,
  subida_en_el_panel_mb: MB(subida),
  sin_explicar_mb: MB(subida - contado),
  primeras_visitas_al_3d_equivalentes_sin_explicar: Math.round(
    (subida - contado) / primeraVisita3d,
  ),
  lo_que_explica_el_resto: [
    "La página baja de fondo el build de Unity completo en cuanto alguien abre cualquier caso, aunque no abra el 3D (precarga.ts). Cada navegador nuevo que abre un caso gasta casi una visita al 3D.",
    "Se publicaron tres builds de Unity en esos dos días (e06bdd73, d18f1f3a y 64b29e87): cada uno hace que todos los navegadores lo vuelvan a bajar una vez.",
    "Las pruebas con personas de la ronda 2 y las visitas de René en varios navegadores y dispositivos.",
  ],
};
writeFileSync(
  join(RAIZ, "eval/results/blob_gasto_estimado.json"),
  `${JSON.stringify(r, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    contado_mb: r.contado_mb,
    subida: r.subida_en_el_panel_mb,
    sin_explicar: r.sin_explicar_mb,
    visitas: r.primeras_visitas_al_3d_equivalentes_sin_explicar,
  }),
);
for (const f of r.filas)
  console.log(`${f.mb.toFixed(1).padStart(7)} MB  ${f.cargas} × ${f.mb_por_carga}  ${f.que}`);
