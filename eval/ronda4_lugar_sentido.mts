/**
 * Ronda 4 (René, 2026-11-18): «"iba sobre Tollocan rumbo a Ciudad de México" se busca completo en el
 * mapa y no encuentra nada». 20 frases de lugar y sentido como las de los reportes de CESVI, en
 * ciudades reales, y por cada una:
 *
 * - **vía:** si el buscador del sitio (`/api/lugar`, el mismo de La escena, con el municipio y el
 *   estado del caso) da como primera opción la vía correcta;
 * - **sentido:** si el sentido de llegada sale correcto (±45° del esperado).
 *
 * Antes: la frase completa va al buscador, y el sentido solo se lee si es cardinal. Después: solo el
 * lugar va al buscador (`separarLugarYSentido`), y un destino («rumbo a …») se busca aparte y da el
 * rumbo desde el lugar.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/ronda4_lugar_sentido.mts [sitio] [salida.json]
 *
 * Llama al buscador del sitio publicado (Nominatim y Photon detrás), una consulta por segundo. Con
 * `local` como sitio, el buscador del árbol donde corre, sin desplegar (desde `apps/web`, para que
 * resuelvan sus rutas `@/`):
 *
 *   cd apps/web && pnpm exec tsx ../../eval/ronda4_lugar_sentido.mts local [salida.json]
 *
 * Ronda 4 (René, 2026-11-21): tres frases más, de las narraciones, que caían en el centro del
 * municipio: la del puente (el cruce de las dos vías o la pregunta) y las de la bajada y la curva. En
 * esas, la frase pasa si da la vía o si pregunta; falla si da el centro del municipio.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RUMBOS_CARDINALES,
  rumboHacia,
  separarLugarYSentido,
} from "../packages/cesvi/src/lugar-narrado.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITIO = process.argv[2] ?? "https://croquis-sage.vercel.app";
const SALIDA = process.argv[3] ?? join(RAIZ, "eval/results/ronda4_lugar_sentido.json");

interface Frase {
  frase: string;
  municipio: string;
  estado: string;
  /** Parte del nombre de la vía, sin acentos y en minúsculas. */
  via: string;
  /** El rumbo de llegada esperado (grados desde el norte). */
  rumbo: number;
  /** Si no aparece la vía, preguntar es correcto (nunca el centro del municipio). */
  oPregunta?: boolean;
}

const FRASES: Frase[] = [
  {
    frase: "iba sobre Tollocan rumbo a Ciudad de México",
    municipio: "Toluca",
    estado: "México",
    via: "tollocan",
    rumbo: 90,
  },
  {
    frase: "Calzada Ignacio Zaragoza con dirección a Puebla",
    municipio: "Iztapalapa",
    estado: "Ciudad de México",
    via: "zaragoza",
    rumbo: 90,
  },
  {
    frase: "Av. Insurgentes Sur en dirección a Cuernavaca",
    municipio: "Tlalpan",
    estado: "Ciudad de México",
    via: "insurgentes",
    rumbo: 180,
  },
  {
    frase: "Viaducto Miguel Alemán de poniente a oriente",
    municipio: "Benito Juárez",
    estado: "Ciudad de México",
    via: "viaducto",
    rumbo: 90,
  },
  {
    frase: "circulaba por la Calzada de Tlalpan con dirección al sur",
    municipio: "Coyoacán",
    estado: "Ciudad de México",
    via: "tlalpan",
    rumbo: 180,
  },
  {
    frase: "Av. Las Torres, de oriente a poniente",
    municipio: "Metepec",
    estado: "México",
    via: "torres",
    rumbo: 270,
  },
  {
    frase: "Boulevard Miguel Alemán rumbo a Toluca",
    municipio: "Lerma",
    estado: "México",
    via: "miguel aleman",
    rumbo: 270,
  },
  {
    frase: "Av. Constituyentes hacia el poniente",
    municipio: "Miguel Hidalgo",
    estado: "Ciudad de México",
    via: "constituyentes",
    rumbo: 270,
  },
  {
    frase: "Eje 6 Sur con dirección a Iztapalapa",
    municipio: "Benito Juárez",
    estado: "Ciudad de México",
    via: "eje 6",
    rumbo: 90,
  },
  {
    frase: "Av. Gustavo Baz, en sentido norte-sur",
    municipio: "Tlalnepantla de Baz",
    estado: "México",
    via: "gustavo baz",
    rumbo: 180,
  },
  {
    frase: "Vía José López Portillo rumbo a Coacalco",
    municipio: "Tultitlán",
    estado: "México",
    via: "lopez portillo",
    rumbo: 90,
  },
  {
    frase: "Av. Solidaridad Las Torres con dirección a Lerma",
    municipio: "Toluca",
    estado: "México",
    via: "solidaridad las torres",
    rumbo: 90,
  },
  {
    frase: "Av. Universidad hacia el norte",
    municipio: "Coyoacán",
    estado: "Ciudad de México",
    via: "universidad",
    rumbo: 0,
  },
  {
    frase: "Calzada Ermita Iztapalapa de oriente a poniente",
    municipio: "Iztapalapa",
    estado: "Ciudad de México",
    via: "ermita",
    rumbo: 270,
  },
  {
    frase: "Av. Revolución con dirección al sur",
    municipio: "Álvaro Obregón",
    estado: "Ciudad de México",
    via: "revolucion",
    rumbo: 180,
  },
  {
    frase: "Paseo de la Reforma rumbo a Santa Fe",
    municipio: "Miguel Hidalgo",
    estado: "Ciudad de México",
    via: "reforma",
    rumbo: 250,
  },
  {
    frase: "Av. López Mateos Sur con dirección a Guadalajara",
    municipio: "Zapopan",
    estado: "Jalisco",
    via: "lopez mateos",
    rumbo: 0,
  },
  {
    frase: "Av. Gonzalitos de sur a norte",
    municipio: "Monterrey",
    estado: "Nuevo León",
    via: "gonzalitos",
    rumbo: 0,
  },
  {
    frase: "iba por Periférico Sur hacia Xochimilco",
    municipio: "Tlalpan",
    estado: "Ciudad de México",
    via: "periferico",
    rumbo: 110,
  },
  {
    frase: "paso a desnivel de Solidaridad Las Torres sobre Paseo Tollocan",
    municipio: "Toluca",
    estado: "México",
    via: "torres y paseo tollocan",
    rumbo: 0,
    oPregunta: true,
  },
  {
    frase: "carretera Toluca–Valle de Bravo, a la altura de Amanalco, en bajada",
    municipio: "Amanalco",
    estado: "México",
    via: "valle de bravo",
    rumbo: 270,
    oPregunta: true,
  },
  {
    frase: "curva del Circuito Exterior Mexiquense a la altura de Ecatepec",
    municipio: "Ecatepec de Morelos",
    estado: "México",
    via: "circuito exterior",
    rumbo: 0,
    oPregunta: true,
  },
  {
    frase: "Calzada Vallejo con dirección al norte",
    municipio: "Azcapotzalco",
    estado: "Ciudad de México",
    via: "vallejo",
    rumbo: 0,
  },
];

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const difAng = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

type Opcion = { nombre: string; lat: number; lon: number };
type Busqueda = { primera: Opcion | null; aviso: string | null };
const local =
  SITIO === "local"
    ? await import("../apps/web/src/server/lugar.ts").then((m) => ({
        buscar: m.buscarLugar,
        deps: m.defaultLugarDeps({} as NodeJS.ProcessEnv),
      }))
    : null;
async function buscarConAviso(q: string, municipio?: string, estado?: string): Promise<Busqueda> {
  await espera(1100);
  if (local) {
    try {
      const r = await local.buscar(
        { q, ...(municipio ? { municipio } : {}), ...(estado ? { estado } : {}) },
        "eval",
        local.deps,
      );
      return { primera: r.resultados[0] ?? null, aviso: r.aviso };
    } catch {
      return { primera: null, aviso: null };
    }
  }
  const p = new URLSearchParams({ q });
  if (municipio) p.set("municipio", municipio);
  if (estado) p.set("estado", estado);
  try {
    const r = await fetch(`${SITIO}/api/lugar?${p.toString()}`);
    const d = (await r.json().catch(() => null)) as {
      resultados?: Opcion[];
      aviso?: string | null;
    } | null;
    return { primera: r.ok ? (d?.resultados?.[0] ?? null) : null, aviso: d?.aviso ?? null };
  } catch {
    return { primera: null, aviso: null };
  }
}
async function buscar(q: string, municipio?: string, estado?: string): Promise<Opcion | null> {
  if (local) return (await buscarConAviso(q, municipio, estado)).primera;
  const p = new URLSearchParams({ q });
  if (municipio) p.set("municipio", municipio);
  if (estado) p.set("estado", estado);
  await espera(1100);
  try {
    const r = await fetch(`${SITIO}/api/lugar?${p.toString()}`);
    const d = (await r.json().catch(() => null)) as { resultados?: Opcion[] } | null;
    return r.ok ? (d?.resultados?.[0] ?? null) : null;
  } catch {
    return null;
  }
}

/** El sentido como lo leía la app antes: solo cardinal («de A a B», «hacia el norte»). */
function sentidoAntes(frase: string): number | null {
  const s = separarLugarYSentido(frase).sentido;
  return s?.tipo === "cardinal" ? (s.rumbo ?? null) : null;
}

const filas = [];
for (const f of FRASES) {
  // Antes: la frase completa al buscador.
  const antes = await buscar(f.frase, f.municipio, f.estado);
  const rAntes = sentidoAntes(f.frase);
  // Después: el lugar solo; el destino, aparte.
  const ls = separarLugarYSentido(f.frase);
  const bd = ls.lugar ? await buscarConAviso(ls.lugar, f.municipio, f.estado) : null;
  const despues = bd?.primera ?? null;
  // El centro del municipio: la opción se llama como el municipio (lo que daba «el mapa queda en…»).
  const alCentro = (o: Opcion | null) =>
    Boolean(o && plano(o.nombre.split(",")[0]!).trim() === plano(f.municipio).trim());
  const pregunta = !despues && Boolean(bd?.aviso?.includes("¿Dónde fue?"));
  let rDespues: number | null = null;
  if (ls.sentido?.tipo === "cardinal") rDespues = ls.sentido.rumbo ?? null;
  else if (ls.sentido?.tipo === "destino" && ls.sentido.destino && despues) {
    const destino = await buscar(ls.sentido.destino);
    if (destino) rDespues = Math.round(rumboHacia(despues, destino));
  }
  const fila = {
    frase: f.frase,
    esperado: { via: f.via, rumbo: f.rumbo },
    antes: {
      consulta: f.frase,
      encontrado: antes?.nombre ?? null,
      via_correcta: Boolean(antes && plano(antes.nombre).includes(f.via)),
      al_centro_del_municipio: alCentro(antes),
      rumbo: rAntes,
      sentido_correcto: rAntes !== null && difAng(rAntes, f.rumbo) <= 45,
    },
    despues: {
      consulta: ls.lugar,
      destino: ls.sentido?.destino ?? null,
      encontrado: despues?.nombre ?? null,
      aviso: bd?.aviso ?? null,
      al_centro_del_municipio: alCentro(despues),
      pregunta,
      via_correcta:
        Boolean(despues && plano(despues.nombre).includes(f.via)) || (Boolean(f.oPregunta) && pregunta),
      rumbo: rDespues,
      sentido_correcto: rDespues !== null && difAng(rDespues, f.rumbo) <= 45,
    },
  };
  filas.push(fila);
  console.log(
    `${fila.antes.via_correcta ? "✓" : "✗"}${fila.antes.sentido_correcto ? "✓" : "✗"} → ${fila.despues.via_correcta ? "✓" : "✗"}${fila.despues.sentido_correcto ? "✓" : "✗"}  ${f.frase}`,
  );
}
const cuenta = (k: "antes" | "despues", c: "via_correcta" | "sentido_correcto") =>
  filas.filter((x) => x[k][c]).length;
const resumen = {
  frases: filas.length,
  al_centro_del_municipio: {
    antes: filas.filter((x) => x.antes.al_centro_del_municipio).length,
    despues: filas.filter((x) => x.despues.al_centro_del_municipio).length,
  },
  preguntan: filas.filter((x) => x.despues.pregunta).length,
  antes: {
    via_correcta: cuenta("antes", "via_correcta"),
    sentido_correcto: cuenta("antes", "sentido_correcto"),
  },
  despues: {
    via_correcta: cuenta("despues", "via_correcta"),
    sentido_correcto: cuenta("despues", "sentido_correcto"),
  },
};
void RUMBOS_CARDINALES;
writeFileSync(
  SALIDA,
  JSON.stringify(
    {
      descripcion:
        "Ronda 4: frases de lugar y sentido; la vía correcta en la primera opción del buscador del sitio y el sentido de llegada (±45°), antes (la frase completa) y después (lugar y sentido separados). Las tres de las narraciones (puente, bajada, curva) pasan si dan la vía o si preguntan; cuenta también cuántas caen en el centro del municipio.",
      sitio: SITIO,
      fecha: new Date().toISOString(),
      resumen,
      filas,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(resumen));
