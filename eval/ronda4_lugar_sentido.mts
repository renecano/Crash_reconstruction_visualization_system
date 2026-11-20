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
 * Llama al buscador del sitio publicado (Nominatim y Photon detrás), una consulta por segundo.
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
async function buscar(q: string, municipio?: string, estado?: string): Promise<Opcion | null> {
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
  const despues = ls.lugar ? await buscar(ls.lugar, f.municipio, f.estado) : null;
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
      rumbo: rAntes,
      sentido_correcto: rAntes !== null && difAng(rAntes, f.rumbo) <= 45,
    },
    despues: {
      consulta: ls.lugar,
      destino: ls.sentido?.destino ?? null,
      encontrado: despues?.nombre ?? null,
      via_correcta: Boolean(despues && plano(despues.nombre).includes(f.via)),
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
        "Ronda 4: 20 frases de lugar y sentido; la vía correcta en la primera opción del buscador del sitio y el sentido de llegada (±45°), antes (la frase completa) y después (lugar y sentido separados).",
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
