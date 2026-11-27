/**
 * ¿Cuántos de los 205 reportes nombran una calle que coincide con dos o más calles del mapa de nombres
 * distintos (René, 2026-11-25: «Paseo de la Reforma» y «Paseo Bosque de la Reforma» en aud-33)? Con las
 * calles guardadas de la revisión, sin red. Escribe la lista en `eval/results/auditoria_cadena/`.
 *
 *   CROQUIS_NOMBRES=1 pnpm --filter @croquis/web exec vitest run src/lib/auditoria/nombres-confusos.test.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { callesDe } from "@/lib/escena-facil";
import { callesDelCaso, esLaCalleNarrada, palabrasDeMas } from "@/lib/lugar-claro";

const RAIZ = resolve(__dirname, "../../../../..");

describe("calles narradas que coinciden con varias del mapa", () => {
  it.skipIf(!process.env.CROQUIS_NOMBRES)("en los 205 reportes y las 42 narraciones", () => {
    const filas: Record<string, unknown>[] = [];
    const textos = new Map(
      readFileSync(join(RAIZ, "data/cesvi/corpus/narraciones.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { id: string; descripcion: string })
        .map((x) => [x.id, x.descripcion]),
    );
    const nuevas = new Map(
      (
        JSON.parse(
          readFileSync(join(RAIZ, "data/cesvi/narraciones-auditoria/narraciones.json"), "utf8"),
        ) as { narraciones: { id: string; texto: string }[] }
      ).narraciones.map((n) => [n.id, n.texto]),
    );
    for (const fuente of ["prueba", "nuevas"]) {
      const ultimas = new Map<
        string,
        { id: string; datos: { lugar?: { lat: number; lon: number } } }
      >();
      for (const l of readFileSync(
        join(RAIZ, `eval/results/auditoria_cadena/${fuente}.jsonl`),
        "utf8",
      )
        .split("\n")
        .filter(Boolean)) {
        const r = JSON.parse(l) as { id: string; datos: { lugar?: { lat: number; lon: number } } };
        ultimas.set(r.id, r);
      }
      for (const r of ultimas.values()) {
        const lugar = r.datos.lugar;
        const texto = (fuente === "prueba" ? textos : nuevas).get(r.id);
        if (!lugar || !texto) continue;
        const clave = { lat: lugar.lat.toFixed(5), lon: lugar.lon.toFixed(5) };
        const h = createHash("sha256").update(JSON.stringify(clave)).digest("hex").slice(0, 24);
        const ruta = ["osm", "calles"]
          .map((t) => join(RAIZ, "data/raw/auditoria-cache", t, `${h}.json`))
          .find((x) => existsSync(x));
        if (!ruta) continue;
        const nombres = [
          ...new Set(
            callesDe(JSON.parse(readFileSync(ruta, "utf8")))
              .map((c) => c.nombre)
              .filter((x): x is string => !!x),
          ),
        ];
        for (const narrada of callesDelCaso(texto, null)) {
          const coinciden = nombres.filter((n) => esLaCalleNarrada(narrada, n));
          if (coinciden.length < 2) continue;
          const deMas = coinciden.map((n) => ({ nombre: n, de_mas: palabrasDeMas(narrada, n) }));
          // Solo si difieren: entonces la de menos palabras de más es la que se elige ahora.
          if (new Set(deMas.map((x) => x.de_mas)).size < 2) continue;
          filas.push({ fuente, id: r.id, narrada, coinciden: deMas });
        }
      }
    }
    writeFileSync(
      join(RAIZ, "eval/results/auditoria_cadena/nombres_confusos.json"),
      `${JSON.stringify({ descripcion: "Calles narradas que coinciden con dos o más calles del mapa de nombres distintos; ahora gana la de menos palabras de más (René, 2026-11-25).", casos: filas }, null, 1)}\n`,
    );
    expect(filas.length).toBeGreaterThanOrEqual(0);
  });
});
