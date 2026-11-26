import { createHash } from "node:crypto";
import { freemem } from "node:os";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { RADIO_CALLES_M } from "@/lib/calles-del-mapa";
import { buscarLugar, defaultLugarDeps, LugarIn } from "@/server/lugar";
import { callesCerca, defaultOsmDeps } from "@/server/osm";
import { armarRelieve, defaultRelieveDeps, RelieveIn } from "@/server/relieve";
import { osmAlrededor } from "@/lib/visor-unity/osm-alrededor";
import { auditarCaso, type Esperado, type FilaAuditoria, type Red } from "./cadena";
import { esperarMemoria } from "./memoria";

/**
 * La revisión sistemática de la cadena (René, 2026-11-24), por partes y sin navegador:
 *
 *   CROQUIS_AUDITORIA=prueba CROQUIS_DESDE=0 CROQUIS_HASTA=40 pnpm exec vitest run src/lib/auditoria
 *   CROQUIS_AUDITORIA=nuevas pnpm exec vitest run src/lib/auditoria
 *
 * - **prueba**: los 205 reportes de la partición de prueba (`data/cesvi/corpus/particion.json`), con la
 * *   narración del corpus y la lectura grabada de su reporte (`data/raw/cesvi/corpus-cache`, que no sale de esta
 *   computadora).
 * - **nuevas**: las narraciones escritas para esta revisión (`data/cesvi/narraciones-auditoria/`), con
 *   su lectura grabada y lo que cada una dice que tiene que verse.
 *
 * Lo que consulta en la red (el lugar, las calles y los objetos de OpenStreetMap, el relieve) se guarda
 * en `data/raw/auditoria-cache/`: la siguiente corrida no sale a internet. Cada caso deja una fila en
 * `eval/results/auditoria_cadena/<fuente>.jsonl` (sin el texto de la narración); un caso ya revisado
 * se salta, salvo con `CROQUIS_DE_NUEVO=1`.
 */
const RAIZ = resolve(__dirname, "../../../../..");
const CACHE = join(RAIZ, "data/raw/auditoria-cache");
const SALIDA = join(RAIZ, "eval/results/auditoria_cadena");

function enDisco<T>(tipo: string, clave: unknown, f: () => Promise<T>): Promise<T> {
  const h = createHash("sha256").update(JSON.stringify(clave)).digest("hex").slice(0, 24);
  const ruta = join(CACHE, tipo, `${h}.json`);
  if (existsSync(ruta)) return Promise.resolve(JSON.parse(readFileSync(ruta, "utf8")) as T);
  return f().then((v) => {
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, JSON.stringify(v));
    return v;
  });
}

const ENV = {
  CROQUIS_LUGAR_RATE_PER_HOUR: "100000",
  CROQUIS_OSM_RATE_PER_HOUR: "100000",
} as unknown as NodeJS.ProcessEnv;
/**
 * Cada respuesta de Nominatim y Photon se guarda por su URL (revisión de la cadena, 2026-11-24): un
 * cambio en `lugar.ts` solo sale a la red por las consultas que nunca se hicieron. Antes se guardaba
 * el resultado completo con la huella de `lugar.ts` y cada cambio repetía todas las búsquedas (2.6 min
 * por caso; Nominatim bloqueó esta computadora). Las consultas a la red se espacian 1.2 s, y las que
 * salen del disco no esperan. Solo se guardan las respuestas 200.
 */
let ultimaRed = 0;
const fetchGuardado = (async (input: URL | string, init?: RequestInit) => {
  const url = String(input);
  const ruta = join(
    CACHE,
    "http",
    `${createHash("sha256").update(url).digest("hex").slice(0, 24)}.json`,
  );
  if (existsSync(ruta))
    return new Response(readFileSync(ruta, "utf8"), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const espera = ultimaRed + 1200 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaRed = Date.now();
  const r = await fetch(input, init);
  if (r.status !== 200) return r;
  const texto = await r.text();
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, texto);
  return new Response(texto, { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;
const lugarDeps = {
  ...defaultLugarDeps(ENV),
  fetcher: fetchGuardado,
  pausa: () => Promise.resolve(),
};
const osmDeps = defaultOsmDeps(ENV);
const red: Red = {
  lugar: async (q, municipio, estado) => {
    const r = await buscarLugar(
      LugarIn.parse({ q, ...(municipio ? { municipio } : {}), ...(estado ? { estado } : {}) }),
      "auditoria",
      lugarDeps,
    );
    return { resultados: r.resultados, aviso: r.aviso };
  },
  // Las calles y los objetos del lugar: de la API de OpenStreetMap (la consulta de la batería de Unity,
  // unos 150 m a la redonda), y si no responde, de Overpass como la app.
  calles: (p) =>
    enDisco("osm", { lat: p.lat.toFixed(5), lon: p.lon.toFixed(5) }, () =>
      osmAlrededor(p.lat, p.lon),
    ).catch(() =>
      enDisco("calles", { lat: p.lat.toFixed(5), lon: p.lon.toFixed(5) }, async () => {
        const r = await callesCerca(
          { lat: p.lat, lon: p.lon, radio: RADIO_CALLES_M },
          "auditoria",
          osmDeps,
        );
        return r.respuesta;
      }),
    ),
  objetos: (p) =>
    enDisco("osm", { lat: p.lat.toFixed(5), lon: p.lon.toFixed(5) }, () =>
      osmAlrededor(p.lat, p.lon),
    ).catch(() => null),
  relieve: (p) =>
    enDisco("relieve", p, () => armarRelieve(RelieveIn.parse(p), defaultRelieveDeps())),
};

interface Caso {
  id: string;
  narracion: string;
  salida: SalidaCorpus;
  esperado?: Esperado;
  lugarGuardado?: { lat: number; lon: number; nombre: string };
}

function casosDePrueba(): Caso[] {
  const particion = JSON.parse(
    readFileSync(join(RAIZ, "data/cesvi/corpus/particion.json"), "utf8"),
  ) as { prueba: string[] };
  const textos = new Map(
    readFileSync(join(RAIZ, "data/cesvi/corpus/narraciones.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { id: string; descripcion: string })
      .map((x) => [x.id, x.descripcion]),
  );
  return particion.prueba.flatMap((id) => {
    const ruta = join(RAIZ, `data/raw/cesvi/corpus-cache/${id}.json`);
    const texto = textos.get(id);
    if (!existsSync(ruta) || !texto) return [];
    const c = JSON.parse(readFileSync(ruta, "utf8")) as { salida: SalidaCorpus };
    return [{ id, narracion: texto, salida: c.salida }];
  });
}

/**
 * Los cinco ejemplos publicados (René, 2026-11-24): su narración y su lectura grabada, en el lugar que
 * narran (como en la app, no en el punto fijo de la tabla de cifras).
 */
function casosDeEjemplos(): Caso[] {
  const d = JSON.parse(
    readFileSync(join(RAIZ, "data/cesvi/ejemplos/narraciones.json"), "utf8"),
  ) as {
    ejemplos: {
      clave: string;
      grabacion?: string;
      lugar: { lat: number; lon: number; nombre: string };
    }[];
  };
  return d.ejemplos.map((x) => {
    const g = JSON.parse(
      readFileSync(
        join(RAIZ, `data/cesvi/grabaciones/${x.grabacion ?? `ejemplos/${x.clave}.json`}`),
        "utf8",
      ),
    ) as { narracion: string; salida: SalidaCorpus };
    return { id: x.clave, narracion: g.narracion, salida: g.salida, lugarGuardado: x.lugar };
  });
}

function casosNuevos(): Caso[] {
  const d = JSON.parse(
    readFileSync(join(RAIZ, "data/cesvi/narraciones-auditoria/narraciones.json"), "utf8"),
  ) as { narraciones: { id: string; texto: string; esperado: Esperado }[] };
  return d.narraciones.flatMap((n) => {
    const ruta = join(RAIZ, `data/cesvi/grabaciones/auditoria/${n.id}.json`);
    if (!existsSync(ruta)) return [];
    const g = JSON.parse(readFileSync(ruta, "utf8")) as { salida: SalidaCorpus };
    return [{ id: n.id, narracion: n.texto, salida: g.salida, esperado: n.esperado }];
  });
}

describe("la revisión sistemática de la cadena", () => {
  it.skipIf(!process.env.CROQUIS_AUDITORIA)(
    "revisa cada caso de la narración al paquete 3D",
    async () => {
      const fuente = process.env.CROQUIS_AUDITORIA!;
      const todos =
        fuente === "prueba"
          ? casosDePrueba()
          : fuente === "ejemplos"
            ? casosDeEjemplos()
            : casosNuevos();
      const desde = Number(process.env.CROQUIS_DESDE ?? 0);
      const hasta = Number(process.env.CROQUIS_HASTA ?? todos.length);
      const solo = process.env.CROQUIS_SOLO?.split(",");
      const ruta = join(SALIDA, `${fuente}.jsonl`);
      mkdirSync(SALIDA, { recursive: true });
      const hechos = new Set(
        existsSync(ruta) && !process.env.CROQUIS_DE_NUEVO
          ? readFileSync(ruta, "utf8")
              .split("\n")
              .filter(Boolean)
              .map((l) => (JSON.parse(l) as FilaAuditoria).id)
          : [],
      );
      const filas: FilaAuditoria[] = [];
      for (const c of todos.slice(desde, hasta)) {
        if (solo ? !solo.includes(c.id) : hechos.has(c.id)) continue;
        // Sin memoria para otro caso (René, 2026-11-26): se espera y, si no se libera, se detiene; lo
        // hecho ya está en el archivo y la corrida se retoma donde quedó.
        if (!(await esperarMemoria(() => freemem() / 1048576))) {
          console.warn(`Sin memoria libre: la revisión se detiene antes de ${c.id}.`);
          break;
        }
        let fila: FilaAuditoria;
        try {
          const volcado = process.env.CROQUIS_VOLCAR;
          fila = await auditarCaso({
            ...c,
            fuente,
            red,
            ...(volcado
              ? {
                  volcar: (nombre: string, dato: unknown) => {
                    mkdirSync(volcado, { recursive: true });
                    writeFileSync(join(volcado, `${c.id}.${nombre}.json`), JSON.stringify(dato));
                  },
                }
              : {}),
          });
        } catch (e) {
          fila = {
            id: c.id,
            fuente,
            fallas: [{ regla: "auditoria.error", detalle: (e as Error).message.slice(0, 300) }],
            datos: {},
          };
        }
        filas.push(fila);
        appendFileSync(ruta, JSON.stringify(fila) + "\n");
      }
      expect(filas.length + hechos.size).toBeGreaterThan(0);
    },
    3_600_000,
  );
});
