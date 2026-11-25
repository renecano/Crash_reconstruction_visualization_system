import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente } from "@croquis/cesvi";
import { describe, it } from "vitest";
import { expedienteAxaReconstruccion } from "@/lib/axa-reconstruccion";
import { obstaculosDelMapa } from "@/lib/obstaculos-del-mapa";
import { osmAlrededor } from "@/lib/visor-unity/osm-alrededor";
import { colocarReceta, lectura, reconstruir, RECETAS } from "./cifras-ronda4.test";

/**
 * ¿La regla de los edificios y muros del mapa (René, 2026-11-24, punto 2) toca algo publicado? AXA y
 * los cinco ejemplos, con la colocación de su receta, contra los edificios y muros de OpenStreetMap
 * alrededor de su choque (la API de OSM, guardada en data/raw/auditoria-cache/osm). Si alguno cruza
 * uno, la app diría «no cuadra» donde hoy publica una cifra: eso va a René antes de publicar.
 *
 *   CROQUIS_OBSTACULOS=<salida.json> pnpm --filter @croquis/web exec vitest run src/lib/obstaculos-publicados.test.ts
 */
const RAIZ = resolve(__dirname, "../../../..");

describe("los obstáculos del mapa contra lo publicado", () => {
  it.skipIf(!process.env.CROQUIS_OBSTACULOS)(
    "AXA y los cinco ejemplos",
    async () => {
      const casos: { clave: string; e: Expediente }[] = [
        { clave: "axa", e: expedienteAxaReconstruccion() },
      ];
      const ej = JSON.parse(
        readFileSync(resolve(RAIZ, "data/cesvi/ejemplos/narraciones.json"), "utf8"),
      ) as { ejemplos: { clave: string; grabacion?: string }[] };
      for (const receta of RECETAS) {
        const x = ej.ejemplos.find((y) => y.clave === receta.clave)!;
        const { e } = lectura(
          `data/cesvi/grabaciones/${x.grabacion ?? `ejemplos/${x.clave}.json`}`,
        );
        casos.push({ clave: receta.clave, e: colocarReceta(e, receta) });
      }
      const filas: Record<string, unknown>[] = [];
      for (const c of casos) {
        const { r } = await reconstruir(c.e, c.clave);
        if (!r.origen) {
          filas.push({ clave: c.clave, sin_origen: true });
          continue;
        }
        const [lon, lat] = r.origen;
        const ruta = resolve(
          RAIZ,
          `data/raw/auditoria-cache/osm-publicados/${lat.toFixed(5)}_${lon.toFixed(5)}.json`,
        );
        let osm;
        try {
          osm = JSON.parse(readFileSync(ruta, "utf8"));
        } catch {
          osm = await osmAlrededor(lat, lon);
          mkdirSync(dirname(ruta), { recursive: true });
          writeFileSync(ruta, JSON.stringify(osm));
        }
        const obstaculos = obstaculosDelMapa(osm);
        const con = cesvi.conObstaculos(r, obstaculos);
        filas.push({
          clave: c.clave,
          origen: { lat, lon },
          edificios: obstaculos.filter((o) => o.tipo === "edificio").length,
          muros: obstaculos.filter((o) => o.tipo === "muro").length,
          cifra_antes: r.velocidades
            .filter((v) => v.previa)
            .map((v) => [v.vehiculo, v.previa!.mejor]),
          no_cuadra:
            con === r ? null : (con.noCuadra?.motivos ?? con.limites.slice(r.limites.length)),
        });
      }
      const salida = resolve(process.env.CROQUIS_OBSTACULOS!);
      mkdirSync(dirname(salida), { recursive: true });
      writeFileSync(salida, `${JSON.stringify({ filas }, null, 1)}\n`);
    },
    1_800_000,
  );
});
