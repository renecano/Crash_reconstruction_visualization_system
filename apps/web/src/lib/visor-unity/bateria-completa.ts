/**
 * La batería completa del visor 3D (René, 2026-11-20, después de Tollocan): todo lo que tenemos, como
 * paquete caso-3d armado por el mismo camino que el navegador, para que Unity lo cargue en una prueba
 * sin navegador (`CiudadEnUnityTests` con `CROQUIS_BATERIA_DIR`). Por grupos, para correrla por partes:
 *
 * - `axa-ejemplos`: AXA y los cinco ejemplos («Usar un ejemplo», con su lectura guardada);
 * - `r4-1`, `r4-2`, `r4-3`: los 205 reportes de la prueba ciega, reconstruidos solo con su narración;
 * - `repo`: los 24 casos caso-3d del repo, con su escenario;
 * - `sinteticos`: los caminos poco probados (ciclista, tracto, moto, cada objeto fijo, de noche, con
 *   lluvia, con relieve, con puente, sin calles).
 *
 * La de ciudad vive aparte, en el repo (`bateria-ciudad.ts`). Estos no: son unos 230 paquetes.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Expediente, MallaRelieve, SalidaCorpus } from "@croquis/cesvi";
import {
  escenaDeNarracion,
  especDeExpediente,
  reconstruirExpediente,
  usarRelieve,
} from "@croquis/cesvi";
import { armarCaso3d, type Caso3D } from "@croquis/scene-schema";
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import { especDel3d } from "@/components/cesvi/caso/reconstruccion";
import { escenarioDe } from "@/components/visor-unity/escenario";
import { expedienteAxaReconstruccion } from "@/lib/axa-reconstruccion";
import { paqueteDelCaso } from "@/lib/visor-unity/paquete";

type Json = Record<string, unknown>;
const MUESTRAS = { samples: 8, mcSamples: 8 };

export interface CasoCompleto {
  grupo: string;
  clave: string;
  que: string;
  paquete: (raiz: string) => Json;
}

/** Un expediente, reconstruido y en paquete, sin calles ni objetos del mapa (sin red). */
function paqueteDe(
  e: Expediente,
  id: string,
  ajustar?: (escena: Json) => void,
  relieve?: MallaRelieve | null,
): Json {
  const r = reconstruirExpediente(e, id, MUESTRAS);
  const escena = especDel3d(r, null, null) as unknown as Json;
  ajustar?.(escena);
  const resultado = reconstructionToDict(reconstruct(escena as never));
  return paqueteDelCaso(
    escena as never,
    resultado as never,
    (relieve ?? r.relieve ?? null) as never,
  ) as unknown as Json;
}

const leer = (raiz: string, ruta: string) =>
  JSON.parse(readFileSync(resolve(raiz, ruta), "utf8")) as Json;

/** La lectura guardada de una narración, como la usa «Usar un ejemplo». */
function deGrabacion(raiz: string, ruta: string): Expediente {
  const g = leer(raiz, ruta) as { narracion: string; salida: SalidaCorpus };
  return escenaDeNarracion(g.salida, g.narracion).expediente;
}

const tollocan = (raiz: string) =>
  (leer(raiz, "data/cesvi/casos/tollocan-rene.croquis") as { expediente: Expediente }).expediente;

/** Tollocan con otro vehículo (la clase) o contra otro objeto. */
function conClase(e: Expediente, clase: string): Expediente {
  return {
    ...e,
    vehiculos: e.vehiculos.map((v, i) => (i === 0 ? { ...v, clase, masa: undefined } : v)),
  } as Expediente;
}
function conObjeto(e: Expediente, objeto: string): Expediente {
  return {
    ...e,
    impactos: (e.impactos ?? []).map((i) => (i.objeto_fijo ? { ...i, objeto_fijo: objeto } : i)),
    evidencias: { ...e.evidencias, objetos_fijos_danados: [objeto] },
  };
}
const condicion = (campo: "iluminacion" | "clima", valor: string) => (escena: Json) => {
  const entorno = (escena.entorno ?? {}) as Json;
  entorno[campo] = { valor, fuente: "usuario", confianza: 1 };
  escena.entorno = entorno;
};

/** Una pendiente del 4 % de sur a norte, 200 m por lado (malla sintética, para el camino del relieve). */
function rampa(): MallaRelieve {
  const ancho = 41;
  const alto = 41;
  const res = 5;
  const alturas: number[] = [];
  for (let j = 0; j < alto; j++)
    for (let i = 0; i < ancho; i++) alturas.push(Math.round((j * res - 100) * 0.04 * 100) / 100);
  return {
    id: "rampa-sintetica",
    origen: { lat: 19.298, lon: -99.5899, x: -100, y: -100 },
    resolucion_m: res,
    ancho,
    alto,
    alturas_m: alturas,
    fuente: "sintética (batería del visor 3D)",
    licencia: "no aplica",
    resolucion_nativa_m: res,
  };
}

export function casosCompletos(raiz: string): CasoCompleto[] {
  const out: CasoCompleto[] = [];
  // AXA y los cinco ejemplos.
  out.push({
    grupo: "axa-ejemplos",
    clave: "axa",
    que: "AXA A2010930",
    paquete: () => paqueteDe(expedienteAxaReconstruccion(), "axa"),
  });
  const ejemplos = (
    leer(raiz, "data/cesvi/ejemplos/narraciones.json") as {
      ejemplos: { clave: string; titulo: string; grabacion?: string }[];
    }
  ).ejemplos;
  for (const x of ejemplos)
    out.push({
      grupo: "axa-ejemplos",
      clave: `ejemplo-${x.clave}`,
      que: x.titulo,
      paquete: (r) =>
        paqueteDe(
          deGrabacion(r, `data/cesvi/grabaciones/${x.grabacion ?? `ejemplos/${x.clave}.json`}`),
          x.clave,
        ),
    });
  // Los 205 reportes de la prueba ciega, en tres grupos.
  const pagina = leer(raiz, "data/cesvi/r4/pagina.json") as {
    casos: { id: string; expediente: Expediente }[];
  };
  pagina.casos.forEach((c, i) =>
    out.push({
      grupo: `r4-${1 + Math.floor((i * 3) / pagina.casos.length)}`,
      clave: `r4-${c.id}`,
      que: `Reporte ${c.id}`,
      paquete: () => paqueteDe(c.expediente, c.id),
    }),
  );
  // Los casos caso-3d del repo, con su escenario.
  const dir = resolve(raiz, "packages/scene-schema/fixtures/caso3d");
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith(".json"))
    .sort())
    out.push({
      grupo: "repo",
      clave: `repo-${f.replace(".json", "")}`,
      que: `Caso del repo ${f}`,
      paquete: () => {
        const c = JSON.parse(readFileSync(resolve(dir, f), "utf8")) as Caso3D;
        return armarCaso3d(
          c.escena,
          c.resultado,
          null,
          escenarioDe(c.escena, c.resultado),
        ) as unknown as Json;
      },
    });
  // Los caminos poco probados.
  const s = (clave: string, que: string, paquete: (r: string) => Json) =>
    out.push({ grupo: "sinteticos", clave, que, paquete });
  s("ciclista", "Un ciclista contra un árbol", (r) =>
    paqueteDe(conClase(tollocan(r), "bicicleta"), "ciclista"),
  );
  s("moto", "Una moto contra un árbol", (r) =>
    paqueteDe(conClase(tollocan(r), "motocicleta"), "moto"),
  );
  s("tracto", "Un tractocamión contra un árbol", (r) =>
    paqueteDe(conClase(tollocan(r), "tractocamion"), "tracto"),
  );
  s("camion", "Un camión unitario contra un árbol", (r) =>
    paqueteDe(conClase(tollocan(r), "camion_unitario"), "camion"),
  );
  s("autobus", "Un autobús contra un árbol", (r) =>
    paqueteDe(conClase(tollocan(r), "autobus"), "autobus"),
  );
  for (const [clave, objeto] of [
    ["poste", "poste"],
    ["arbol", "árbol"],
    ["pared", "pared"],
    ["barrera", "barrera de contención"],
    ["senal", "señal de tránsito"],
    ["estacionado", "un vehículo estacionado"],
    ["guarnicion", "guarnición"],
  ] as const)
    s(`objeto-${clave}`, `Un vehículo contra ${objeto}`, (r) =>
      paqueteDe(conObjeto(tollocan(r), objeto), `objeto-${clave}`),
    );
  s(
    "sin-marca-ni-modelo",
    "Un vehículo sin marca ni modelo (Tollocan tal cual, sin el mapa)",
    (r) => paqueteDe(tollocan(r), "sin-modelo"),
  );
  s("noche-con-alumbrado", "De noche, con alumbrado", (r) =>
    paqueteDe(tollocan(r), "noche", condicion("iluminacion", "noche_con_alumbrado")),
  );
  s("noche-sin-alumbrado", "De noche, sin alumbrado", (r) =>
    paqueteDe(tollocan(r), "noche-oscura", condicion("iluminacion", "noche_sin_alumbrado")),
  );
  s("lluvia-fuerte", "Con lluvia fuerte", (r) =>
    paqueteDe(tollocan(r), "lluvia", condicion("clima", "lluvia_fuerte")),
  );
  s("granizo", "Con granizo", (r) =>
    paqueteDe(tollocan(r), "granizo", condicion("clima", "granizo")),
  );
  s("niebla", "Con niebla", (r) => paqueteDe(tollocan(r), "niebla", condicion("clima", "niebla")));
  s("relieve", "Con relieve real (una rampa del 4 %)", (r) =>
    paqueteDe(usarRelieve(tollocan(r), true), "relieve", undefined, rampa()),
  );
  for (const n of ["arbol", "poste", "puente", "subida", "bajada", "curva"])
    s(`narracion-${n}`, `La narración de la ronda 4 «${n}»`, (r) =>
      paqueteDe(deGrabacion(r, `data/cesvi/grabaciones/ronda4/ronda4-${n}.json`), `ronda4-${n}`),
    );
  return out;
}

export { especDeExpediente };
