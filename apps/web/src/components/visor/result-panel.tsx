import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { AIRBAG_SOURCE, airbagForVehicle, PROFILES } from "@croquis/viewer";

const CLASE: Record<string, string> = {
  sedan_compacto: "sedán compacto",
  sedan_mediano: "sedán mediano",
  hatchback: "hatchback",
  suv_compacta: "SUV compacta",
  suv_grande: "SUV grande",
  pickup: "pickup",
  van: "van",
  microbus_combi: "microbús o combi",
  autobus: "autobús",
  camion_unitario: "camión unitario",
  tractocamion: "tractocamión",
  motocicleta: "motocicleta",
  bicicleta: "bicicleta",
  scooter: "scooter",
};

const PARAM: Record<string, string> = {
  friccion_llanta: "Fricción llanta–pavimento",
  restitucion_vehiculo_vehiculo: "Restitución entre vehículos",
  relacion_impulso_tangencial: "Fricción en el contacto",
  arrastre_post_impacto: "Arrastre después del impacto (fracción de μ)",
  factor_abs: "Factor de frenado con ABS",
  aproximacion_previa_s: "Tiempo de aproximación mostrado (s)",
  velocidad_peaton: "Velocidad al caminar (m/s)",
  friccion_cuerpo_suelo: "Fricción cuerpo–suelo",
  factor_proyeccion_jinete: "Factor de proyección del jinete",
  altura_cg_volcadura: "Altura del centro de masa (fracción del alto)",
  altura_ojo: "Altura del ojo del conductor (m)",
  alcance_deteccion_nocturna: "Alcance de detección con luces bajas (m)",
};

const TIPO: Record<string, string> = {
  primaria: "fuente primaria",
  secundaria: "fuente secundaria",
  supuesto: "supuesto",
  relato: "del relato",
  medido: "medido",
};

/** Dirección de la fuerza en horas de reloj, como se dice en reconstrucción ("a las 3"). */
export function clockHour(hours: number): string {
  const h = Math.round(hours) % 12;
  return `a las ${h === 0 ? 12 : h}`;
}

const fmt = (v: number, d = 0) =>
  v.toLocaleString("es-MX", { maximumFractionDigits: d, minimumFractionDigits: d });

interface Pct {
  p10: number;
  p90: number;
}

/** Intervalo p10–p90 de Monte Carlo (80 % de las muestras), si el resultado lo trae. */
function Range({ pct, unit }: { pct: Pct | undefined; unit: string }) {
  if (!pct) return null;
  return (
    <span className="block text-xs text-neutral-600 dark:text-neutral-400">
      80 %: {fmt(pct.p10)}–{fmt(pct.p90)} {unit}
    </span>
  );
}

/** Resultados por vehículo, avisos y parámetros con su fuente. Nunca asigna culpa (PLAN §10). */
export function ResultPanel({
  resultado,
  supuestosEntorno,
  spec,
}: {
  resultado: Resultado;
  supuestosEntorno: string[];
  spec?: EscenaSpec;
}) {
  const inc = resultado.incertidumbre;
  const incV = new Map((inc?.vehiculos ?? []).map((v) => [v.id, v]));
  return (
    <section className="flex flex-col gap-4 text-sm" aria-label="Resultados de la reconstrucción">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="mb-1 text-left font-semibold">Vehículos</caption>
          <thead>
            <tr className="border-b border-neutral-300 dark:border-neutral-700">
              <th className="py-1 pr-3">Vehículo</th>
              <th className="py-1 pr-3">Velocidad al impacto</th>
              <th className="py-1 pr-3">Cambio de velocidad (ΔV)</th>
              <th className="py-1 pr-3">Dirección de la fuerza</th>
              <th className="py-1 pr-3">Energía de deformación</th>
              <th className="py-1 pr-3">Rigidez usada</th>
              {spec ? <th className="py-1">Bolsas de aire (ilustrativo)</th> : null}
            </tr>
          </thead>
          <tbody>
            {resultado.vehiculos.map((v) => (
              <tr key={v.id} className="border-b border-neutral-200 dark:border-neutral-800">
                <td className="py-1 pr-3">
                  {v.rol} · {CLASE[v.clase] ?? v.clase}
                  {!v.involucrado ? " (no participa en el impacto)" : ""}
                </td>
                <td className="py-1 pr-3">
                  {fmt(v.v_impacto_kmh)} km/h
                  <Range pct={incV.get(v.id)?.v_impacto_kmh} unit="km/h" />
                </td>
                <td className="py-1 pr-3">
                  {fmt(v.delta_v_kmh)} km/h
                  <Range pct={incV.get(v.id)?.delta_v_kmh} unit="km/h" />
                </td>
                <td className="py-1 pr-3">
                  {v.pdof_horas !== undefined ? clockHour(v.pdof_horas) : "—"}
                </td>
                <td className="py-1 pr-3">{fmt(v.dano.energia_j / 1000, 1)} kJ</td>
                <td className="py-1">
                  {v.dano.origen_rigidez === "nhtsa"
                    ? "medida (pruebas de NHTSA)"
                    : v.dano.origen_rigidez === "supuesto"
                      ? "supuesto"
                      : "—"}
                </td>
                {spec ? (
                  <td className="py-1 text-xs">
                    {
                      airbagForVehicle(
                        {
                          id: v.id,
                          delta_v_kmh: v.delta_v_kmh,
                          pdof_horas: v.pdof_horas,
                          dosRuedas: PROFILES[v.clase]?.kind === "two_wheel",
                        },
                        {
                          personas: spec.personas,
                          objetos: spec.entorno.objetos ?? [],
                          eventos: resultado.eventos,
                        },
                      ).motivo
                    }
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
          {inc
            ? `Valor nominal del modelo físico y, debajo, el rango donde cae el 80 % de ${inc.validas} reconstrucciones con los datos inciertos muestreados (semilla ${inc.semilla}).`
            : "Valores nominales del modelo físico."}
          {spec ? ` Bolsas de aire: regla ilustrativa con umbrales de ${AIRBAG_SOURCE}` : ""}
        </p>
      </div>
      {inc && inc.campos.length > 0 ? (
        <details data-testid="incertidumbre">
          <summary className="cursor-pointer font-semibold">Datos inciertos y sus rangos</summary>
          <ul className="mt-1 list-disc pl-5">
            {inc.campos.map((c) => (
              <li key={c.ruta}>
                <code>{c.ruta}</code>: {fmt(c.min, 2)}–{fmt(c.max, 2)} ({c.nota})
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {resultado.vehiculos.some((v) => v.volcadura) ? (
        <div>
          <h3 className="font-semibold">Volcadura (criterio de tropiezo)</h3>
          <ul className="list-disc pl-5" data-testid="volcadura">
            {resultado.vehiculos.map((v) =>
              v.volcadura ? (
                <li key={v.id}>
                  Vehículo {v.rol}: llega a la orilla con {fmt(v.volcadura.velocidad_lateral_kmh)}{" "}
                  km/h hacia ella; el tropiezo necesita {fmt(v.volcadura.velocidad_critica_kmh)}{" "}
                  km/h (factor de estabilidad {fmt(v.volcadura.ssf, 2)}).{" "}
                  {v.volcadura.inicia ? "Alcanza para volcar." : "No alcanza para volcar."} La
                  secuencia de vueltas del visor es ilustrativa.
                </li>
              ) : null,
            )}
          </ul>
        </div>
      ) : null}
      {resultado.banderas.length > 0 ? (
        <div>
          <h3 className="font-semibold">Avisos de la reconstrucción</h3>
          <ul className="list-disc pl-5" data-testid="banderas">
            {resultado.banderas.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <details>
        <summary className="cursor-pointer font-semibold">Parámetros y su fuente</summary>
        <ul className="mt-2 flex flex-col gap-1">
          {Object.entries(resultado.parametros).map(([k, p]) =>
            p ? (
              <li key={k}>
                <span className="font-medium">{PARAM[k] ?? k}</span>: {fmt(p.valor, 2)}
                {p.rango ? ` (rango ${fmt(p.rango[0], 2)}–${fmt(p.rango[1], 2)})` : ""} ·{" "}
                {TIPO[p.tipo] ?? p.tipo}
                {p.fuente ? (
                  <span className="block text-xs text-neutral-600 dark:text-neutral-400">
                    {p.fuente}
                  </span>
                ) : null}
              </li>
            ) : null,
          )}
          {supuestosEntorno.map((s) => (
            <li key={s}>
              <span className="font-medium">Entorno</span>: {s}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
