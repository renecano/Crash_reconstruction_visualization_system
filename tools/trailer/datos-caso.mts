/**
 * Los datos del tráiler (René, 2026-11-16): todo lo que se ve sobre la hoja sale de una escena
 * inventada de referencia y de su Resultado, los dos versionados en el repo. Nada de AXA ni de casos
 * reales, y ningún número a mano.
 *
 * - La calle, los vehículos, la evidencia y las citas del relato: de la escena
 *   (`packages/scene-schema/fixtures/<caso>.json`).
 * - Las trayectorias y los eventos: de su Resultado (`fixtures/resultados/<caso>.json`).
 * - Las simulaciones: el Monte Carlo del solver (`monteCarlo`), con la semilla del Resultado, mirando
 *   la trayectoria de cada muestra con `alMuestra`. Son simulaciones de verdad: el número que se
 *   escribe en el archivo es el de las que resultaron válidas.
 *
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/trailer/datos-caso.mts [caso] [muestras]
 *
 * Escribe `apps/trailer/src/datos/caso.json`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sceneLayout } from "../../packages/croquis-2d/src/layout";
import type { EscenaSpec } from "../../packages/scene-schema/src/generated/escena.zod";
import type { Resultado } from "../../packages/scene-schema/src/generated/resultado.zod";
import { monteCarlo } from "../../packages/solver-ts/src/montecarlo";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CASO = process.argv[2] ?? "nocturno_lluvia";
const MUESTRAS = Number(process.argv[3] ?? 256);
const leer = <T,>(p: string) => JSON.parse(readFileSync(join(RAIZ, p), "utf8")) as T;
type Json = Record<string, unknown>;

const escena = leer<EscenaSpec>(`packages/scene-schema/fixtures/${CASO}.json`);
const resultado = leer<Resultado>(`packages/scene-schema/fixtures/resultados/${CASO}.json`);
const meta = escena.meta as unknown as {
  id: string;
  titulo: string;
  relato: string;
  sintetico?: boolean;
};
if (!meta.sintetico)
  throw new Error(`«${CASO}» no es una escena inventada: el tráiler no usa casos reales.`);
if (resultado.escena_id !== meta.id) throw new Error("El Resultado no es de esa escena.");

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

// --- La calle, la evidencia y los dispositivos, en metros (lo mismo que dibuja el croquis 2D).
const dibujo = sceneLayout(escena);

// --- Los vehículos con su trayectoria: [t, x, y, rumbo] cada 0.02 s; t = 0 es el impacto.
const vehiculos = resultado.vehiculos.map((v) => {
  const tr = v.trayectoria;
  const de = escena.vehiculos.find((x) => x.id === v.id);
  return {
    id: v.id,
    letra: v.rol,
    clase: v.clase,
    largo: v.dimensiones.largo_m,
    ancho: v.dimensiones.ancho_m,
    color: (de as unknown as { color?: { valor?: string } } | undefined)?.color?.valor ?? null,
    v_impacto_kmh: v.v_impacto_kmh,
    final: v.pose_final,
    trayectoria: tr.t.map((t, i) => [r3(t), r3(tr.x[i]!), r3(tr.y[i]!), r3(tr.rumbo[i]!)]),
  };
});

// --- Las citas: cada dato leído del relato señala de dónde salió (inicio y fin en el texto).
const citas: { inicio: number; fin: number; texto: string; campo: string }[] = [];
(function recorre(nodo: unknown, ruta: string) {
  if (Array.isArray(nodo)) nodo.forEach((x, i) => recorre(x, `${ruta}.${i}`));
  else if (nodo && typeof nodo === "object") {
    const o = nodo as Json;
    if (Array.isArray(o.evidencia))
      for (const c of o.evidencia as { inicio: number; fin: number; texto: string }[])
        if (meta.relato.slice(c.inicio, c.fin) === c.texto)
          citas.push({
            inicio: c.inicio,
            fin: c.fin,
            texto: c.texto,
            campo: ruta.replace(/^\./, ""),
          });
    for (const [k, v] of Object.entries(o)) if (k !== "evidencia") recorre(v, `${ruta}.${k}`);
  }
})(escena, "");
citas.sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);
// Una sola cita por tramo de texto, sin traslapes.
const sinTraslape = citas.filter(
  (c, i) => !citas.slice(0, i).some((d) => c.inicio < d.fin && d.inicio < c.fin),
);

// --- Las simulaciones: el Monte Carlo del solver, muestra por muestra.
const inc = resultado.incertidumbre as unknown as { semilla: number; campos: unknown[] };
const simulaciones: { v0_kmh: number[]; v_impacto_kmh: number[]; caminos: number[][][] }[] = [];
const mc = monteCarlo(escena as unknown as Json, {
  samples: MUESTRAS,
  seed: inc.semilla,
  alMuestra: (_i, rec) => {
    simulaciones.push({
      // La velocidad con la que arranca cada vehículo en esa muestra.
      v0_kmh: rec.vehiculos.map((v) =>
        r2(Math.hypot(v.trajectory.vx[0]!, v.trajectory.vy[0]!) * 3.6),
      ),
      // Con qué velocidad llega cada uno al impacto.
      v_impacto_kmh: rec.vehiculos.map((v) => r2(v.vImpactKmh)),
      // Su camino en la hoja: x, y cada 0.2 s.
      caminos: rec.vehiculos.map((v) =>
        v.trajectory.x
          .map((x, i) => [r2(x), r2(v.trajectory.y[i]!)])
          .filter((_p, i, a) => i % 2 === 0 || i === a.length - 1),
      ),
    });
  },
}).toDict() as { validas: number; muestras: number };

// --- La marca: el símbolo sale de marca.json; la palabra, del SVG maestro, separada por letras para
// armarla en pantalla (los trazos de una misma letra se traslapan en x; los de letras distintas, no).
const marca = leer<Json>("assets/brand/marca.json");
const logotipo = readFileSync(join(RAIZ, "assets/brand/logotipo-sobre-claro.svg"), "utf8");
const caja = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(logotipo)!;
const grupos = [...logotipo.matchAll(/<g transform="translate\(([\d.]+) ([\d.]+)\)">/g)];
const dPalabra = /<path d="([^"]+)" fill="[^"]+"\/><\/g><\/svg>/.exec(logotipo)![1]!;
const trazos = dPalabra
  .split(/(?=M)/)
  .map((d) => d.trim())
  .filter(Boolean)
  .map((d) => {
    // De dónde a dónde va el trazo en x. Los comandos van en mayúsculas (absolutos): H trae solo x;
    // V, solo y; los demás, pares.
    const xs: number[] = [];
    for (const [, comando, resto] of d.matchAll(/([MLQHVZ])([^MLQHVZ]*)/g)) {
      const n = (resto!.match(/-?\d*\.?\d+/g) ?? []).map(Number);
      if (comando === "H") xs.push(...n);
      else if (comando !== "V") xs.push(...n.filter((_v, i) => i % 2 === 0));
    }
    return { d, x0: Math.min(...xs), x1: Math.max(...xs) };
  })
  .sort((a, b) => a.x0 - b.x0);
const letras: { d: string; x0: number; x1: number }[] = [];
for (const t of trazos) {
  const ultima = letras[letras.length - 1];
  if (ultima && t.x0 < ultima.x1) {
    ultima.d += ` ${t.d}`;
    ultima.x1 = Math.max(ultima.x1, t.x1);
  } else letras.push({ ...t });
}
const texto = (marca.palabra as { texto: string }).texto;
if (letras.length !== texto.length)
  throw new Error(
    `La palabra tiene ${letras.length} letras separadas y deberían ser ${texto.length}.`,
  );
writeFileSync(
  join(RAIZ, "apps/trailer/src/datos/marca.json"),
  `${JSON.stringify({
    descripcion:
      "El logotipo para armarlo en el tráiler: el símbolo de assets/brand/marca.json y la palabra de logotipo-sobre-claro.svg, letra por letra. Lo genera tools/trailer/datos-caso.mts; no se edita a mano.",
    ancho: Number(caja[1]),
    alto: Number(caja[2]),
    simbolo: {
      en: [Number(grupos[0]![1]), Number(grupos[0]![2])],
      arco: marca.arco,
      ...(marca.simbolo as Json),
    },
    palabra: {
      en: [Number(grupos[1]![1]), Number(grupos[1]![2])],
      letras: letras.map((l, i) => ({ letra: texto[i], d: l.d, x0: l.x0, x1: l.x1 })),
    },
  })}
`,
);

const salida = {
  descripcion:
    "Los datos del tráiler: una escena inventada de referencia, su Resultado y las simulaciones del Monte Carlo del solver. Lo genera tools/trailer/datos-caso.mts; no se edita a mano.",
  script: "tools/trailer/datos-caso.mts",
  caso: CASO,
  escena_id: meta.id,
  titulo: meta.titulo,
  relato: meta.relato,
  citas: sinTraslape,
  version_resultado: resultado.version_resultado,
  t_inicio: resultado.t_inicio,
  t_fin: resultado.t_fin,
  impacto: resultado.punto_impacto,
  calle: {
    tipo: dibujo.road.tipo,
    tiras: dibujo.road.strips,
    anillos: dibujo.road.rings,
    caja: dibujo.bounds,
  },
  dispositivos: dibujo.devices,
  evidencia: dibujo.evidence,
  eventos: resultado.eventos.map((e) => ({ id: e.id, tipo: e.tipo, t: e.t, actores: e.actores })),
  vehiculos,
  simulaciones: {
    semilla: inc.semilla,
    pedidas: MUESTRAS,
    validas: mc.validas,
    orden_vehiculos: resultado.vehiculos.map((v) => v.id),
    muestras: simulaciones,
  },
};
const destino = join(RAIZ, "apps/trailer/src/datos/caso.json");
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, `${JSON.stringify(salida)}\n`);
console.log(
  `${CASO}: ${vehiculos.length} vehículos, ${sinTraslape.length} citas, ${dibujo.evidence.length} evidencias, ` +
    `${simulaciones.length} simulaciones (${mc.validas} válidas de ${MUESTRAS}) → ${destino}`,
);
console.log(
  `marca: ${letras.map((l, i) => `${texto[i]} ${l.x0.toFixed(0)}–${l.x1.toFixed(0)}`).join(" · ")}`,
);
