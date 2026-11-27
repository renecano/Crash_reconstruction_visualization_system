/**
 * La escena de dos versiones del código, comparada (René, 2026-11-25: «¿el giro de 31° a 43° ya estaba
 * antes del #311?»). Con la misma lectura grabada, el mismo lugar encontrado (el de la revisión de la
 * cadena) y las mismas calles guardadas, dice con qué frente coloca La escena a cada vehículo en el
 * choque, por qué calle llega y qué tan lejos queda del eje de la calle más alineada. Busca el destino
 * narrado («con dirección a…») como la revisión completa. Solo importa módulos que ya existían en
 * main, para poder copiarse a un worktree de otra versión:
 *
 *   CROQUIS_GIRO_CASOS=eval/results/auditoria_cadena/giro_casos.json  *   CROQUIS_GIRO_SALIDA=<archivo.json> pnpm exec vitest run src/lib/auditoria/comparar-escena.test.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { buscarLugar, defaultLugarDeps, LugarIn } from "@/server/lugar";
import { enMetros, escenaDeNarracion, separarLugarYSentido } from "@croquis/cesvi";
import { callesDe, nombreVehiculo, poseDe, type Calle } from "@/lib/escena-facil";
import { proponerEscena, rumboDelSentido } from "@/lib/escena-propuesta";
import { impactosAColocar } from "@/lib/pasos-caso";

/** La comprobación de los giros: solo existe desde la rama del arreglo (en main queda en null). */
const MODULO_GIRO = "@/lib/giro-sin-aviso";
/** Los datos (fuera de git: las lecturas grabadas del corpus y lo guardado de la red), del repo principal. */
const DATOS = process.env.CROQUIS_DATOS ?? join(__dirname, "../../../../..");
const CACHE = join(DATOS, "data/raw/auditoria-cache");
const CASOS = JSON.parse(
  readFileSync(
    process.env.CROQUIS_GIRO_CASOS ?? join(DATOS, "eval/results/auditoria_cadena/giro_casos.json"),
    "utf8",
  ),
) as { id: string; fuente: string; lugar: { lat: number; lon: number; nombre: string } }[];

function deCache(tipo: string, clave: unknown) {
  const h = createHash("sha256").update(JSON.stringify(clave)).digest("hex").slice(0, 24);
  const ruta = join(CACHE, tipo, `${h}.json`);
  return existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : null;
}

/** Lo que ya está guardado de la red (las mismas respuestas de la revisión completa); si falta, a la red. */
const fetchGuardado = (async (input: URL | string, init?: RequestInit) => {
  const ruta = join(
    CACHE,
    "http",
    `${createHash("sha256").update(String(input)).digest("hex").slice(0, 24)}.json`,
  );
  if (existsSync(ruta))
    return new Response(readFileSync(ruta, "utf8"), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  return fetch(input, init);
}) as typeof fetch;
const lugarDeps = {
  ...defaultLugarDeps({
    CROQUIS_LUGAR_RATE_PER_HOUR: "100000",
  } as unknown as NodeJS.ProcessEnv),
  fetcher: fetchGuardado,
  pausa: () => Promise.resolve(),
};

function aLaCalle(p: { lat: number; lon: number }, c: Calle) {
  let mejor = { m: Infinity, rumbo: 0 };
  for (let i = 1; i < c.puntos.length; i++) {
    const a = enMetros(c.puntos[i - 1]!, [p.lon, p.lat]);
    const b = enMetros(c.puntos[i]!, [p.lon, p.lat]);
    const dx = b.este - a.este;
    const dy = b.norte - a.norte;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(a.este * dx + a.norte * dy) / l2)) : 0;
    const m = Math.hypot(a.este + t * dx, a.norte + t * dy);
    if (m < mejor.m)
      mejor = { m, rumbo: ((((Math.atan2(dx, dy) * 180) / Math.PI) % 180) + 180) % 180 };
  }
  return mejor;
}
const difEje = (a: number, b: number) => {
  const d = Math.abs(((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
};

function entrada(id: string, fuente: string) {
  if (fuente === "prueba") {
    const texto = readFileSync(join(DATOS, "data/cesvi/corpus/narraciones.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { id: string; descripcion: string })
      .find((x) => x.id === id)!.descripcion;
    const c = JSON.parse(
      readFileSync(join(DATOS, `data/raw/cesvi/corpus-cache/${id}.json`), "utf8"),
    );
    return { narracion: texto, salida: c.salida };
  }
  const d = JSON.parse(
    readFileSync(join(DATOS, "data/cesvi/narraciones-auditoria/narraciones.json"), "utf8"),
  ) as { narraciones: { id: string; texto: string }[] };
  const g = JSON.parse(
    readFileSync(join(DATOS, `data/cesvi/grabaciones/auditoria/${id}.json`), "utf8"),
  );
  return { narracion: d.narraciones.find((n) => n.id === id)!.texto, salida: g.salida };
}

describe("giro en el choque", () => {
  it.skipIf(!process.env.CROQUIS_GIRO_SALIDA)(
    "frente de cada vehículo contra el eje de la calle",
    async () => {
      const filas = [];
      for (const { id, fuente, lugar } of CASOS) {
        const { narracion, salida } = entrada(id, fuente);
        const e0 = escenaDeNarracion(salida, narracion).expediente;
        const clave = { lat: lugar.lat.toFixed(5), lon: lugar.lon.toFixed(5) };
        const osm = deCache("osm", clave) ?? deCache("calles", clave);
        const calles = callesDe(osm);
        const lugarTexto = e0.caso.lugar?.descripcion?.valor ?? null;
        const sentido =
          separarLugarYSentido(lugarTexto).sentido ?? separarLugarYSentido(narracion).sentido;
        // El destino narrado («con dirección a…»), como La escena y la revisión completa.
        let destino: { lat: number; lon: number } | null = null;
        if (sentido?.tipo === "destino" && sentido.destino) {
          // Como la revisión completa: una consulta que no pasa la validación cuenta como sin destino.
          const r = await Promise.resolve()
            .then(() => buscarLugar(LugarIn.parse({ q: sentido.destino }), "auditoria", lugarDeps))
            .catch(() => null);
          destino = r?.resultados[0] ?? null;
        }
        const vs = e0.vehiculos;
        const prop = proponerEscena({
          expediente: e0,
          impactos: impactosAColocar(e0),
          calles,
          narracion,
          lugar,
          nombreDe: (v) =>
            nombreVehiculo(
              vs.find((x) => x.id === v)!,
              vs,
            ),
          rumboNarrado: rumboDelSentido(sentido, destino, lugar),
        });
        const poses = vs.map((v) => {
          const p = prop ? poseDe(prop.expediente, v.id, "impacto") : null;
          if (!p) return { v: v.id };
          const cerca = calles
            .map((c) => ({ c, r: aLaCalle(p.punto, c) }))
            .filter((x) => x.r.m <= x.c.ancho / 2 + 4)
            .map((x) => ({
              calle: x.c.nombre ?? "sin nombre",
              m: +x.r.m.toFixed(1),
              dif: Math.round(difEje(x.r.rumbo, p.rumbo)),
            }))
            .sort((a, b) => a.dif - b.dif);
          return { v: v.id, frente: Math.round(p.rumbo), mejor: cerca[0] ?? null };
        });
        // La comprobación de la rama nueva; en una versión que no la tiene, queda en null.
        const giros = await import(/* @vite-ignore */ MODULO_GIRO)
          .then((m: typeof import("@/lib/giro-sin-aviso")) =>
            prop
              ? m.girosSinAviso({
                  expediente: prop.expediente,
                  calles,
                  propuestos: prop.propuestos.map((x) => x.texto),
                  narracion,
                  nombreDe: (v) =>
                    nombreVehiculo(
                      vs.find((x) => x.id === v)!,
                      vs,
                    ),
                })
              : [],
          )
          .catch(() => null);
        filas.push({
          id,
          calles: calles.length,
          destino,
          propuestos: prop?.propuestos.map((x) => x.texto) ?? null,
          poses,
          giros_sin_aviso: giros,
        });
      }
      writeFileSync(process.env.CROQUIS_GIRO_SALIDA!, JSON.stringify(filas, null, 1));
    },
    600_000,
  );
});
