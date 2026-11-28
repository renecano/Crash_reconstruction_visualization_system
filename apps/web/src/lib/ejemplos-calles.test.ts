/**
 * Las calles fijas de los cinco ejemplos y de AXA (René, 2026-11-25 y 2026-11-27: «en la demo con
 * CESVI no puede salir otra cifra porque OpenStreetMap tardó»; la carambola daba 25 o 23 según la
 * red). Cada una va centrada en el punto del choque que arma La escena, con un radio que cubre todas
 * sus posiciones y su lugar guardado más 60 m, y marcada `fija`: en un ejemplo publicado nunca se reemplaza por las que
 * lleguen de la red. © colaboradores de OpenStreetMap (ODbL), de Overpass, con la consulta de la app.
 *
 * Se generan saliendo a la red (Overpass, como `/api/osm`), una vez:
 *
 *   CROQUIS_GUARDAR_CALLES=1 pnpm --filter @croquis/web exec vitest run src/lib/ejemplos-calles.test.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { expedienteAxaReconstruccion } from "./axa-reconstruccion";
import { callesParaGuardar, conCallesGuardadas, guardadasCerca } from "./calles-guardadas";
import { escenaComoPerito } from "./ejemplo-como-perito";
import { callesDe, type Punto } from "./escena-facil";
import { conLugarDelEjemplo, EJEMPLOS } from "./ejemplos-narracion";
import { RECETAS_PERITO } from "./recetas-perito";
import { callesCerca, defaultOsmDeps } from "@/server/osm";

const RAIZ = resolve(__dirname, "../../../..");
const SALIDA = join(RAIZ, "data/cesvi/ejemplos/calles");
const AXA = join(RAIZ, "data/cesvi/casos/axa-calles.json");
const MARGEN_M = 60;
const RADIO_MIN_M = 150;

type Guardadas = NonNullable<NonNullable<Expediente["caso"]["lugar"]>["calles_del_mapa"]>;

const metros = (a: Punto, b: Punto) =>
  Math.hypot(
    (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180),
    (a.lat - b.lat) * 111320,
  );

/** El punto del primer choque y todas las posiciones de la escena. */
function choqueYPosiciones(e: Expediente): { choque: Punto; posiciones: Punto[] } {
  const posiciones = (e.versiones ?? []).flatMap((v) =>
    (v.posiciones ?? []).map((p) => p.punto as Punto),
  );
  const primero = [...(e.impactos ?? [])].sort((a, b) => (a.orden ?? 1) - (b.orden ?? 1))[0];
  const deImpacto = (e.versiones?.[0]?.posiciones ?? [])
    .filter((p) => p.fase === "impacto")
    .map((p) => p.punto as Punto);
  const choque = (primero?.punto as Punto | undefined) ?? {
    lat: deImpacto.reduce((a, p) => a + p.lat, 0) / Math.max(1, deImpacto.length),
    lon: deImpacto.reduce((a, p) => a + p.lon, 0) / Math.max(1, deImpacto.length),
  };
  return { choque, posiciones };
}

/** El radio que cubre todas las posiciones desde el choque, con margen, redondeado a 10 m. */
function radioPara(choque: Punto, posiciones: readonly Punto[]): number {
  const lejos = Math.max(0, ...posiciones.map((p) => metros(choque, p)));
  return Math.max(RADIO_MIN_M, Math.ceil((lejos + MARGEN_M) / 10) * 10);
}

/** El ejemplo armado como el perito, con estas calles. */
function armado(clave: string, calles: Guardadas | null): Expediente {
  const receta = RECETAS_PERITO.find((r) => r.clave === clave)!;
  const g = JSON.parse(
    readFileSync(resolve(RAIZ, `data/cesvi/grabaciones/ejemplos/${clave}.json`), "utf8"),
  ) as { narracion: string; salida: SalidaCorpus };
  const leida = cesvi.escenaDeNarracion(g.salida, g.narracion);
  const e0 = conLugarDelEjemplo(g.narracion, leida.expediente as never) as unknown as Expediente;
  const con = calles
    ? ({
        ...e0,
        caso: { ...e0.caso, lugar: { ...e0.caso.lugar, calles_del_mapa: calles } },
      } as Expediente)
    : e0;
  return escenaComoPerito(con, g.narracion, leida.posiciones, receta).expediente;
}

/**
 * Con la misma consulta que usa la app al abrir un caso (`/api/osm`, Overpass): las calles fijas son
 * las mismas que vería un perito en ese lugar.
 */
async function fijas(centro: Punto, radio: number): Promise<Guardadas> {
  const deps = defaultOsmDeps({
    CROQUIS_OSM_RATE_PER_HOUR: "1000",
  } as unknown as NodeJS.ProcessEnv);
  // Overpass saturado: se espera y se reintenta (30 s, 60 s, 90 s…), como pide su política.
  let resp: Awaited<ReturnType<typeof callesCerca>>["respuesta"] | null = null;
  for (let intento = 1; !resp; intento++) {
    try {
      resp = (await callesCerca({ lat: centro.lat, lon: centro.lon, radio }, "ejemplos", deps))
        .respuesta;
    } catch (e) {
      if (intento >= 8) throw e;
      await new Promise((r) => setTimeout(r, 30_000 * intento));
    }
  }
  const g = callesParaGuardar(resp, centro, radio, "overpass", new Date().toISOString());
  return { ...g, fija: true } as Guardadas;
}

describe("las calles fijas de los ejemplos y de AXA", () => {
  it.skipIf(!process.env.CROQUIS_GUARDAR_CALLES)(
    "se generan centradas en el choque, con radio para sus recorridos",
    { timeout: 3_600_000 },
    async () => {
      for (const e of EJEMPLOS) {
        // El choque depende de las calles con que se arma la escena: se repite hasta que no se mueve.
        let calles: Guardadas | null = null;
        let antes: Punto | null = null;
        for (let vuelta = 0; vuelta < 3; vuelta++) {
          const { choque, posiciones } = choqueYPosiciones(armado(e.clave, calles));
          if (antes && metros(antes, choque) < 2) break;
          // También el lugar guardado: ahí están las calles que narra el ejemplo (la carambola narra
          // «entre la Calle Encino y la Calle Nogal», a 185 m de su choque) y La escena las busca.
          calles = await fijas(choque, radioPara(choque, [...posiciones, e.lugar]));
          antes = choque;
        }
        writeFileSync(join(SALIDA, `${e.clave}.json`), `${JSON.stringify(calles, null, 2)}\n`);
        console.log("CALLES", e.clave, calles!.centro, calles!.radio_m, calles!.vias.length);
      }
      const axa = expedienteAxaReconstruccion();
      const { choque, posiciones } = choqueYPosiciones(axa);
      const g = await fijas(choque, radioPara(choque, posiciones));
      writeFileSync(AXA, `${JSON.stringify(g, null, 2)}\n`);
      console.log("CALLES axa", g.centro, g.radio_m, g.vias.length);
    },
  );

  it("cada ejemplo y AXA tienen calles fijas que cubren su choque y todas sus posiciones", () => {
    const casos: [string, Expediente][] = [
      ...EJEMPLOS.map((e): [string, Expediente] => [e.clave, armado(e.clave, null)]),
      ["axa", expedienteAxaReconstruccion()],
    ];
    expect(casos).toHaveLength(6);
    for (const [clave, e] of casos) {
      const g = e.caso.lugar?.calles_del_mapa;
      expect(g?.fija, `${clave}: sus calles no son fijas`).toBe(true);
      expect(g!.vias.length, clave).toBeGreaterThan(3);
      const { choque, posiciones } = choqueYPosiciones(e);
      // Centradas en el choque (a menos de 15 m) y cubriendo cada posición.
      expect(
        metros(g!.centro as Punto, choque),
        `${clave}: no están centradas en el choque`,
      ).toBeLessThan(15);
      for (const p of posiciones)
        expect(metros(g!.centro as Punto, p), `${clave}: una posición queda fuera`).toBeLessThan(
          g!.radio_m,
        );
      // Y su lugar guardado, donde están las calles que narra.
      const lugar = e.caso.lugar?.coordenadas as Punto | undefined;
      if (lugar)
        expect(metros(g!.centro as Punto, lugar), `${clave}: su lugar queda fuera`).toBeLessThan(
          g!.radio_m,
        );
      expect(guardadasCerca(e, choque), clave).not.toBeNull();
    }
  });

  it("la cifra de un ejemplo no depende de la red: las calles fijas nunca se reemplazan", () => {
    for (const e of EJEMPLOS) {
      const exp = armado(e.clave, null);
      const g = exp.caso.lugar!.calles_del_mapa!;
      // Llegan otras calles de la red, en otro centro: el caso queda igual.
      const otras = {
        ...g,
        fija: undefined,
        centro: { lat: g.centro.lat + 0.002, lon: g.centro.lon + 0.002 },
        vias: g.vias.slice(0, 2),
      } as Guardadas;
      expect(conCallesGuardadas(exp, otras), e.clave).toBe(exp);
    }
  });

  it("las calles guardadas se leen como las de Overpass (las mismas calles con nombre)", () => {
    const e = EJEMPLOS.find((x) => x.clave === "crucero-noche")!;
    const con = conLugarDelEjemplo(e.narracion, { caso: { lugar: {} } }) as unknown as {
      caso: {
        lugar: {
          calles_del_mapa: Parameters<typeof import("./calles-guardadas").respuestaDeGuardadas>[0];
        };
      };
    };
    return import("./calles-guardadas").then(({ respuestaDeGuardadas }) => {
      const calles = callesDe(respuestaDeGuardadas(con.caso.lugar.calles_del_mapa));
      const nombres = new Set(calles.map((c) => c.nombre));
      expect(
        nombres.has("Calle Azucena") || [...nombres].some((n) => /Azucena/.test(n ?? "")),
      ).toBe(true);
    });
  });
});
