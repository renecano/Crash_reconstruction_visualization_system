import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import {
  conPosicion,
  escenaDeNarracion,
  especDeExpediente,
  impactosEncimados,
  expedienteConTipicas,
  interpretarResultado,
  puntoDeRelieve,
  relieveEnEscena,
  separarLugarYSentido,
  usaRelieve,
} from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import { caso3dErrors } from "@croquis/scene-schema";
import { fullResult, reconstruct, reconstructionToDict, withRelief } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { especDel3d } from "@/components/cesvi/caso/reconstruccion";
import {
  callesDe,
  elegirDireccion,
  finalDeLaNarracion,
  marcarFinal,
  poseDe,
} from "@/lib/escena-facil";
import { proponerEscena } from "@/lib/escena-propuesta";
import { impactosAColocar } from "@/lib/pasos-caso";
import { paqueteDelCaso } from "@/lib/visor-unity/paquete";
import { buscarLugar, defaultLugarDeps } from "@/server/lugar";
import { armarRelieve, defaultRelieveDeps, RelieveIn } from "@/server/relieve";
import { resumenDelPaquete } from "./bateria-ciudad";

const RAIZ = resolve(__dirname, "../../../../..");
const DIR = resolve(RAIZ, "packages/scene-schema/fixtures/caso3d-narraciones");
type Json = Record<string, unknown>;
const MUESTRAS = { samples: 8, mcSamples: 8 };

/**
 * «Dicho en la narración → se ve en el 3D» (René, 2026-11-21): las seis narraciones de la ronda 4 y
 * Tollocan como paquete caso-3d, armados por el camino del navegador: la lectura guardada, el lugar
 * buscado (`buscarLugar`), las calles y los objetos de OpenStreetMap de ahí, la escena que propone La
 * escena (`proponerEscena`), el relieve real si la narración lo pide (`armarRelieve`) y la
 * reconstrucción con él. Usa la red: solo a mano, `CROQUIS_NARRACIONES=1`. Los paquetes quedan en
 * `packages/scene-schema/fixtures/caso3d-narraciones/` para la prueba de Unity
 * (`NarracionEnUnityTests`), que no la usa.
 */
export async function osmAlrededor(lat: number, lon: number): Promise<OverpassResponse> {
  const b = [lon - 0.0016, lat - 0.0014, lon + 0.0016, lat + 0.0014]
    .map((x) => x.toFixed(5))
    .join(",");
  const r = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${b}`, {
    headers: { "User-Agent": "Croquis/0.1 (bateria del visor 3D)" },
  });
  if (!r.ok) throw new Error(`OpenStreetMap ${r.status}`);
  const xml = await r.text();
  const elementos: Json[] = [];
  const etiquetas = (cuerpo: string) =>
    Object.fromEntries(
      [...cuerpo.matchAll(/<tag k="([^"]*)" v="([^"]*)"\/>/g)].map((m) => [m[1], m[2]]),
    );
  for (const m of xml.matchAll(
    /<node id="(\d+)"[^>]*lat="([-\d.]+)" lon="([-\d.]+)"[^>]*?(\/>|>([\s\S]*?)<\/node>)/g,
  )) {
    const t = m[5] ? etiquetas(m[5]) : {};
    elementos.push({
      type: "node",
      id: Number(m[1]),
      lat: Number(m[2]),
      lon: Number(m[3]),
      ...(Object.keys(t).length ? { tags: t } : {}),
    });
  }
  for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
    const nodos = [...m[2]!.matchAll(/<nd ref="(\d+)"\/>/g)].map((n) => Number(n[1]));
    const t = etiquetas(m[2]!);
    elementos.push({
      type: "way",
      id: Number(m[1]),
      nodes: nodos,
      ...(Object.keys(t).length ? { tags: t } : {}),
    });
  }
  return { elements: elementos } as unknown as OverpassResponse;
}

/** Reconstruye como `useReconstruccion` (con el relieve y la típica de la vía) y arma el paquete. */
async function paqueteComoElNavegador(e0: Expediente, osm: OverpassResponse | null, id: string) {
  let e = e0;
  let base = especDeExpediente(e, id);
  const malla =
    usaRelieve(e) && base.origen
      ? relieveEnEscena(
          (await armarRelieve(
            RelieveIn.parse(puntoDeRelieve(base.origen)),
            defaultRelieveDeps(),
          )) as never,
          base.origen,
        )
      : null;
  let r = interpretarResultado(
    base,
    fullResult(base.spec, { ...MUESTRAS, relieve: malla as never }),
  );
  const e2 = expedienteConTipicas(e, r);
  if (e2) {
    e = e2;
    base = especDeExpediente(e, id);
    r = interpretarResultado(base, fullResult(base.spec, { ...MUESTRAS, relieve: malla as never }));
  }
  const escena = especDel3d({ ...r, relieve: malla }, osm, osm) as unknown as Json;
  const parcial = reconstructionToDict(reconstruct(withRelief(escena, malla as never) as never));
  return {
    paquete: paqueteDelCaso(escena as never, parcial as never, malla as never) as unknown as Json,
    e,
  };
}

describe("las narraciones como paquete 3D, por el camino del navegador", () => {
  it.skipIf(!process.env.CROQUIS_NARRACIONES)(
    "arma los paquetes",
    async () => {
      mkdirSync(DIR, { recursive: true });
      const indice: Json[] = [];
      const colocaciones: Record<string, unknown> = {};
      const deps = defaultLugarDeps({} as NodeJS.ProcessEnv);
      for (const clave of ["arbol", "poste", "puente", "subida", "bajada", "curva"]) {
        const g = JSON.parse(
          readFileSync(resolve(RAIZ, `data/cesvi/grabaciones/ronda4/ronda4-${clave}.json`), "utf8"),
        ) as { narracion: string; salida: SalidaCorpus };
        const leida = escenaDeNarracion(g.salida, g.narracion).expediente;
        const q = separarLugarYSentido(leida.caso.lugar?.descripcion?.valor).lugar;
        const zona = leida.caso.lugar as
          { municipio?: { valor?: string }; estado?: { valor?: string } } | undefined;
        const lugar = q
          ? await buscarLugar(
              {
                q,
                ...(zona?.municipio?.valor ? { municipio: zona.municipio.valor } : {}),
                ...(zona?.estado?.valor ? { estado: zona.estado.valor } : {}),
              },
              "bateria",
              deps,
            ).catch(() => null)
          : null;
        const punto =
          (lugar as { resultados?: { lat: number; lon: number }[] } | null)?.resultados?.[0] ??
          null;
        const osm = punto ? await osmAlrededor(punto.lat, punto.lon) : null;
        const p = punto
          ? proponerEscena({
              expediente: leida,
              impactos: impactosAColocar(leida),
              calles: callesDe(osm),
              narracion: g.narracion,
              lugar: { lat: punto.lat, lon: punto.lon },
              nombreDe: (x) => x,
            })
          : null;
        const { paquete } = await paqueteComoElNavegador(
          p?.expediente ?? leida,
          osm,
          `narracion-${clave}`,
        );
        expect(caso3dErrors(paquete as never), clave).toEqual([]);
        // La colocación que propuso La escena, para medir las cifras con la misma en otro árbol.
        colocaciones[clave] = { versiones: (p?.expediente ?? leida).versiones ?? [] };
        writeFileSync(resolve(DIR, `${clave}.json`), JSON.stringify(paquete) + "\n");
        indice.push({
          clave,
          lugar_buscado: q,
          punto,
          propuesta: Boolean(p),
          con_relieve: Boolean(paquete.relieve),
          ...resumenDelPaquete(paquete),
        });
      }
      // Tollocan: el caso de René, con sus posiciones, y lo de OpenStreetMap de data/osm/.
      const t = JSON.parse(
        readFileSync(resolve(RAIZ, "data/cesvi/casos/tollocan-rene.croquis"), "utf8"),
      ) as { expediente: Expediente };
      const osmT = JSON.parse(
        readFileSync(resolve(RAIZ, "data/osm/tollocan_rene.overpass.json"), "utf8"),
      ) as OverpassResponse;
      const { paquete } = await paqueteComoElNavegador(t.expediente, osmT, "narracion-tollocan");
      writeFileSync(resolve(DIR, "tollocan.json"), JSON.stringify(paquete) + "\n");
      indice.push({
        clave: "tollocan",
        propuesta: false,
        con_relieve: Boolean(paquete.relieve),
        ...resumenDelPaquete(paquete),
      });
      writeFileSync(
        resolve(DIR, "colocaciones.json"),
        JSON.stringify(colocaciones, null, 2) + "\n",
      );
      writeFileSync(
        resolve(DIR, "indice.json"),
        JSON.stringify(
          {
            descripcion:
              "Las narraciones como paquete 3D, por el camino del navegador (bateria-narraciones.test.ts).",
            casos: indice,
          },
          null,
          2,
        ) + "\n",
      );
      expect(indice).toHaveLength(7);
    },
    900_000,
  );
});

/**
 * Las tres narraciones que René probó en producción (2026-11-24), como paquete caso-3d para la
 * batería de Unity. Parten de su caso guardado (`data/cesvi/casos/rene-*.croquis`: sus choques donde
 * él los marcó) y rehacen La escena con las funciones corregidas, como la haría el perito hoy: «Por
 * dónde venía» con la vuelta dada (el camión) y el peatón en el punto de contacto, «Separarlos» si
 * quedaron encimados, y «Como dice la narración» para dónde quedó cada uno. Usa la red (OpenStreetMap):
 * solo a mano, `CROQUIS_TRES=1`. No toca los otros siete paquetes ni `colocaciones.json`.
 */
export function rehacerLaEscena(
  guardado: Expediente,
  narradas: readonly { vehiculo: string; fase: string; descripcion: string }[],
): Expediente {
  let e: Expediente = {
    ...guardado,
    versiones: (guardado.versiones ?? []).map((v) => ({
      ...v,
      posiciones: (v.posiciones ?? []).filter((p) => p.fase !== "final"),
    })),
  };
  const impactos = impactosAColocar(e);
  const punto = (orden: number) => {
    const vs = impactos.find((i) => i.orden === orden)?.vehiculos ?? [];
    const ps = vs.flatMap((v) => poseDe(guardado, v, "impacto") ?? []);
    return ps.length
      ? {
          lat: ps.reduce((a, p) => a + p.punto.lat, 0) / ps.length,
          lon: ps.reduce((a, p) => a + p.punto.lon, 0) / ps.length,
        }
      : null;
  };
  // Su dirección de llegada, como la marcó (antes la pose guardaba la llegada tal cual).
  for (const i of impactos) {
    const v = i.vehiculos[0]!;
    const pose = poseDe(guardado, v, "impacto");
    if (pose) e = elegirDireccion(e, impactos, v, pose.rumbo, punto);
  }
  for (const enc of impactosEncimados(e))
    for (const pose of enc.propuesta) e = conPosicion(e, { ...pose, fase: "impacto" });
  const finales = narradas.filter((p) => p.fase === "final");
  for (const n of finales) {
    const f = finalDeLaNarracion(e, n.vehiculo, n.descripcion, finales);
    const suyo = poseDe(guardado, n.vehiculo, "final");
    if (f) e = marcarFinal(e, n.vehiculo, f.punto, f.rumbo);
    else if (suyo) e = marcarFinal(e, n.vehiculo, suyo.punto, suyo.rumbo);
  }
  return e;
}

describe("las tres narraciones de René como paquete 3D", () => {
  it.skipIf(!process.env.CROQUIS_TRES)(
    "arma los paquetes",
    async () => {
      const ruta = resolve(DIR, "indice.json");
      const indice = JSON.parse(readFileSync(ruta, "utf8")) as { casos: Json[] };
      for (const clave of ["rene-arbol-curva", "rene-peaton-vuelta", "rene-carambola-semaforo"]) {
        const c = JSON.parse(
          readFileSync(resolve(RAIZ, `data/cesvi/casos/${clave}.croquis`), "utf8"),
        ) as {
          expediente: Expediente;
          escena: { posiciones: { vehiculo: string; fase: string; descripcion: string }[] };
        };
        const e = rehacerLaEscena(c.expediente, c.escena.posiciones);
        const p = poseDe(e, "V1", "impacto")!.punto;
        const osm = await osmAlrededor(p.lat, p.lon);
        const { paquete } = await paqueteComoElNavegador(e, osm, `narracion-${clave}`);
        expect(caso3dErrors(paquete as never), clave).toEqual([]);
        writeFileSync(resolve(DIR, `${clave}.json`), JSON.stringify(paquete) + "\n");
        indice.casos = [
          ...indice.casos.filter((x) => x.clave !== clave),
          {
            clave,
            propuesta: false,
            con_relieve: Boolean(paquete.relieve),
            ...resumenDelPaquete(paquete),
          },
        ];
      }
      writeFileSync(ruta, JSON.stringify(indice, null, 2) + "\n");
      expect(indice.casos.length).toBe(10);
    },
    900_000,
  );
});
