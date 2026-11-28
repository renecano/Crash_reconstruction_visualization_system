/**
 * La prueba visual del croquis pericial (René, 2026-11-25: «dejó de verse limpio… agrega una prueba
 * visual que compare contra las capturas aprobadas, para que no vuelva a pasar»). Con paquetes caso-3d
 * guardados, el mismo SVG que ven la pantalla y el dictamen:
 *
 * 1. la vía por la que llegan los vehículos queda horizontal (a menos de 30°);
 * 2. ninguna etiqueta (A1…, «B1·2», «Impacto») se encima con otra;
 * 3. el SVG es idéntico al de referencia (`__snapshots__/croquis/<caso>.svg`, con su PNG en
 *    `docs/cesvi/ronda-4/evidencia/2d/`). Un cambio en el dibujo hace fallar la prueba: si es a
 *    propósito, se regenera con `vitest -u` y se revisan las capturas antes de publicar.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  croquisPericial,
  direccionDeLlegada,
  viasDeEscena,
  type ViaCroquis,
} from "./croquis-pericial";
import type { ResultadoMaqueta } from "./maqueta";

const aqui = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(aqui, "../../../../packages/scene-schema/fixtures");

const CASOS = [
  { clave: "axa", ruta: "caso3d/axa_agentes.json" },
  { clave: "carambola-tollocan-semaforo", ruta: "caso3d-narraciones/rene-carambola-semaforo.json" },
  { clave: "tollocan", ruta: "caso3d-narraciones/tollocan.json" },
  // Casos nuevos (René, 2026-11-27): solo las calles que importan, las rayas cortadas en los cruces y
  // los objetos del caso.
  { clave: "curva-arbol", ruta: "caso3d-narraciones/rene-arbol-curva.json" },
  { clave: "carretera-son100", ruta: "caso3d-ciudad/son100-kino.json" },
  { clave: "glorieta", ruta: "caso3d/glorieta.json" },
  // Da vuelta hacia la calle donde atropella: la horizontal es esa calle, no por donde llegaba.
  { clave: "atropello", ruta: "caso3d-narraciones/rene-peaton-vuelta.json", daVuelta: true },
  // René, 2026-11-28: AXA con las calles reales de OSM (la orilla tenía un quiebre) y los cinco
  // ejemplos.
  // Sin SVG de referencia en el repo: de AXA, solo las revisiones (las capturas, en local).
  { clave: "axa-calles-osm", ruta: "caso3d-ciudad/axa.json", sinReferencia: true },
  { clave: "ejemplo-crucero", ruta: "caso3d/interseccion_toluca.json" },
  { clave: "ejemplo-alcance", ruta: "caso3d/alcance.json" },
  { clave: "ejemplo-carambola", ruta: "caso3d/carambola.json" },
  { clave: "ejemplo-reversa", ruta: "caso3d/reversa.json" },
  { clave: "ejemplo-poste", ruta: "caso3d/poste.json" },
];

type Q = { x: number; y: number };
const puntos = (t: string): Q[] =>
  t
    .trim()
    .split(/\s+/)
    .map((p) => {
      const [x, y] = p.split(",").map(Number);
      return { x: x!, y: y! };
    });
const polilineas = (svg: string, atributo: string) =>
  [...svg.matchAll(new RegExp(`<polyline points="([^"]+)"[^>]*${atributo}="([^"]*)"`, "g"))].map(
    (m) => ({ pts: puntos(m[1]!), id: m[2]! }),
  );
const alSegmento = (p: Q, a: Q, b: Q) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
const aLinea = (p: Q, ps: readonly Q[]) =>
  Math.min(...ps.slice(1).map((b, i) => alSegmento(p, ps[i]!, b)));
const cruzan = (a: Q, b: Q, c: Q, d: Q) => {
  const o = (p: Q, q: Q, r: Q) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(c, d, a) * o(c, d, b) < 0 && o(a, b, c) * o(a, b, d) < 0;
};
const dentro = (p: Q, poli: readonly Q[]) => {
  let r = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const a = poli[i]!;
    const b = poli[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) r = !r;
  }
  return r;
};

/** Lo que pidió René el 2026-11-28 para que el 2D se vea limpio en cualquier caso. */
function revisarLimpieza(svg: string) {
  const fallas: string[] = [];
  // 1. Las orillas: la de una calle recta (a menos de 1 m de la recta entre sus extremos) es una sola
  //    recta, sin quiebres; la de una calle que curva, una curva suave (ningún vértice gira más de 25°).
  for (const b of polilineas(svg, "data-borde")) {
    const [a, z] = [b.pts[0]!, b.pts[b.pts.length - 1]!];
    if (Math.max(...b.pts.map((p) => alSegmento(p, a, z))) <= 1 && b.pts.length > 2)
      fallas.push(`la orilla ${b.id} de una calle recta tiene quiebres (${b.pts.length} puntos)`);
    for (let i = 1; i + 1 < b.pts.length; i++) {
      const u = Math.atan2(b.pts[i]!.y - b.pts[i - 1]!.y, b.pts[i]!.x - b.pts[i - 1]!.x);
      const v = Math.atan2(b.pts[i + 1]!.y - b.pts[i]!.y, b.pts[i + 1]!.x - b.pts[i]!.x);
      const giro = Math.abs(Math.atan2(Math.sin(v - u), Math.cos(v - u))) * (180 / Math.PI);
      if (giro > 25) fallas.push(`la orilla ${b.id} tiene un quiebre de ${giro.toFixed(0)}°`);
    }
  }
  // 2. Ninguna raya de carril debajo de un recorrido (a menos de medio metro).
  const recorridos = polilineas(svg, "data-recorrido");
  for (const c of polilineas(svg, "data-carril"))
    for (const p of c.pts)
      for (const r of recorridos)
        if (aLinea(p, r.pts) < 0.5) {
          fallas.push(`una raya de carril pasa bajo el recorrido de ${r.id}`);
          break;
        }
  // 3. Las líneas de las etiquetas: ninguna cruza otra ni pasa por un vehículo ajeno (si la etiqueta es
  //    de algo que está bajo otro vehículo, la línea puede salir de él, nada más).
  const guias = [
    ...svg.matchAll(
      /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"[^>]*data-guia="([^"]*)" data-dueno="([^"]*)"/g,
    ),
  ].map((m) => ({
    a: { x: +m[1]!, y: +m[2]! },
    b: { x: +m[3]!, y: +m[4]! },
    id: m[5]!,
    dueno: m[6]!,
  }));
  for (let i = 0; i < guias.length; i++)
    for (let j = i + 1; j < guias.length; j++)
      if (cruzan(guias[i]!.a, guias[i]!.b, guias[j]!.a, guias[j]!.b))
        fallas.push(`las líneas de ${guias[i]!.id} y ${guias[j]!.id} se cruzan`);
  const vehiculos = [
    ...svg.matchAll(/<polygon points="([^"]+)"[^>]*data-vehiculo="([^"]+)" data-posicion="(\d)"/g),
  ].map((m) => ({ pts: puntos(m[1]!), id: m[2]!, pos: m[3]! }));
  for (const g of guias) {
    if (!g.dueno) continue;
    for (const v of vehiculos) {
      if (v.id === g.dueno) continue;
      let cortes = 0;
      for (let k = 0; k < v.pts.length; k++)
        if (cruzan(g.a, g.b, v.pts[k]!, v.pts[(k + 1) % v.pts.length]!)) cortes++;
      const permitidos = dentro(g.a, v.pts) ? 1 : 0;
      if (cortes > permitidos || dentro(g.b, v.pts))
        fallas.push(`la línea de ${g.id} pasa por ${v.id}${v.pos}`);
    }
  }
  // 4. La leyenda (1, 2 y 3) y el norte, en el dibujo.
  if (!svg.includes("1 inicio · 2 impacto · 3 reposo")) fallas.push("falta la leyenda 1 · 2 · 3");
  if (!svg.includes('data-norte="si"')) fallas.push("falta el norte");
  return fallas;
}

function dibujo(ruta: string) {
  const d = JSON.parse(readFileSync(resolve(FIX, ruta), "utf8")) as {
    escena: { vehiculos: { id: string; rol?: string }[] };
    resultado: ResultadoMaqueta;
  };
  const vias: ViaCroquis[] = viasDeEscena(d.escena as never);
  const nombres = Object.fromEntries(
    d.escena.vehiculos.map((v) => [v.id, String(v.rol ?? v.id.slice(-1)).toUpperCase()]),
  );
  return { ...croquisPericial(d.resultado, vias, nombres, { proporcion: 1.6 }), res: d.resultado };
}

/** Las etiquetas del SVG: su centro y su medio ancho y medio alto. */
function etiquetas(svg: string) {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (const m of svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)" fill="#fff"/g))
    out.push({ x: +m[1]!, y: +m[2]!, w: +m[3]!, h: +m[3]! });
  for (const m of svg.matchAll(
    /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" rx=/g,
  ))
    out.push({ x: +m[1]! + +m[3]! / 2, y: +m[2]! + +m[4]! / 2, w: +m[3]! / 2, h: +m[4]! / 2 });
  return out;
}

describe("el croquis pericial, contra sus capturas aprobadas", () => {
  for (const c of CASOS) {
    it(c.clave, async () => {
      const { svg, giro, res } = dibujo(c.ruta);
      // 1. La vía de llegada, horizontal.
      const llegada = "daVuelta" in c ? null : direccionDeLlegada(res);
      if (llegada !== null) {
        const d = Math.abs((((llegada - giro) % 180) + 180) % 180);
        expect(Math.min(d, 180 - d)).toBeLessThan(30);
      }
      // 2. Ninguna etiqueta encima de otra.
      const es = etiquetas(svg);
      for (let i = 0; i < es.length; i++)
        for (let j = i + 1; j < es.length; j++) {
          const a = es[i]!;
          const b = es[j]!;
          const encima = Math.abs(a.x - b.x) < a.w + b.w && Math.abs(a.y - b.y) < a.h + b.h;
          expect(encima, `etiquetas ${i} y ${j} encimadas`).toBe(false);
        }
      // 3. Limpio (René, 2026-11-28): sin quiebres, sin rayas bajo los recorridos, sin líneas cruzadas.
      expect(revisarLimpieza(svg)).toEqual([]);
      // 4. Idéntico a la referencia.
      if (!("sinReferencia" in c))
        await expect(svg).toMatchFileSnapshot(`__snapshots__/croquis/${c.clave}.svg`);
    });
  }
});
