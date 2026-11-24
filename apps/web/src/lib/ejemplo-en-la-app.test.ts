import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { separarLugarYSentido, type Expediente } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import * as facil from "@/lib/escena-facil";
import { proponerEscena } from "@/lib/escena-propuesta";
import { impactosAColocar } from "@/lib/pasos-caso";
import { buscarLugar, defaultLugarDeps } from "@/server/lugar";
import { lectura, reconstruir } from "./cifras-ronda4.test";
import { osmAlrededor } from "./visor-unity/bateria-narraciones.test";

/**
 * Lo que ve un perito que abre un ejemplo en la app (René, 2026-11-23: «la cifra publicada es esa»):
 * el lugar narrado buscado como lo hace La escena, las calles de OpenStreetMap de ahí, la escena que
 * propone La escena aceptada tal cual y cada vehículo «junto al choque» (la narración no dice dónde
 * quedó). Sin navegador; usa la red (Nominatim y OpenStreetMap), así que solo a mano:
 *
 *   CROQUIS_EJEMPLO_APP=../../eval/results/ronda4_cifras/crucero_en_la_app.json \
 *     pnpm --filter @croquis/web exec vitest run src/lib/ejemplo-en-la-app.test.ts
 */
describe("un ejemplo como lo ve el perito en la app", () => {
  it.skipIf(!process.env.CROQUIS_EJEMPLO_APP)(
    "el crucero de noche",
    async () => {
      const { e, narracion } = lectura("data/cesvi/grabaciones/escenas/cesvi-e814f085db.json");
      const q = separarLugarYSentido(e.caso.lugar?.descripcion?.valor).lugar!;
      const z = e.caso.lugar as { municipio?: { valor?: string }; estado?: { valor?: string } };
      const l = await buscarLugar(
        {
          q,
          ...(z.municipio?.valor ? { municipio: z.municipio.valor } : {}),
          ...(z.estado?.valor ? { estado: z.estado.valor } : {}),
        },
        "ejemplo",
        defaultLugarDeps({} as NodeJS.ProcessEnv),
      );
      const pt = l.resultados[0]!;
      const calles = facil.callesDe(await osmAlrededor(pt.lat, pt.lon));
      const imp = impactosAColocar(e);
      const prop = proponerEscena({
        expediente: e,
        impactos: imp,
        calles,
        narracion,
        lugar: { lat: pt.lat, lon: pt.lon },
        nombreDe: (x) => x,
      });
      if (!prop) throw new Error("La escena no propuso nada para el crucero.");
      const final = prop.expediente.vehiculos.reduce(
        (a: Expediente, v) => facil.quedoJuntoAlChoque(a, v.id),
        prop.expediente,
      );
      const { r } = await reconstruir(final, "ejemplo-crucero-noche");
      const v = r.velocidades.find((y) => y.vehiculo === "V1")!.previa!;
      const salida = resolve(process.env.CROQUIS_EJEMPLO_APP!);
      mkdirSync(dirname(salida), { recursive: true });
      writeFileSync(
        salida,
        JSON.stringify(
          {
            descripcion:
              "El crucero de noche como lo ve el perito en la app: la escena que propone La escena sobre las calles reales, aceptada, y los dos vehículos junto al choque (apps/web/src/lib/ejemplo-en-la-app.test.ts).",
            fecha: new Date().toISOString(),
            lugar: { buscado: q, encontrado: pt.nombre, lat: pt.lat, lon: pt.lon },
            rumbos_al_choque: final.vehiculos.map((x) => ({
              id: x.id,
              rumbo: Math.round(facil.poseDe(final, x.id, "impacto")?.rumbo ?? NaN),
            })),
            cifra_de: "V1",
            velocidad: {
              mejor: Math.round(v.mejor),
              p10: Math.round(v.p10!),
              p90: Math.round(v.p90!),
            },
          },
          null,
          2,
        ) + "\n",
      );
      expect(v.mejor).toBeGreaterThan(0);
    },
    900_000,
  );
});
