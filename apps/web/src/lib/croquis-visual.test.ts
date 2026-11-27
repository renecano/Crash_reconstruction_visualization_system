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
];

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
      // 3. Idéntico a la referencia.
      await expect(svg).toMatchFileSnapshot(`__snapshots__/croquis/${c.clave}.svg`);
    });
  }
});
