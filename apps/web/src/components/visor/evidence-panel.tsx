import type { Resultado } from "@croquis/scene-schema";

type Inversion = NonNullable<Resultado["inversion"]>;
type Parametro = Inversion["parametros"][number];

const fmt = (v: number, d = 0) =>
  v.toLocaleString("es-MX", { maximumFractionDigits: d, minimumFractionDigits: d });

/** Evidencia de la inversión en palabras llanas. */
const EVIDENCIA: Record<string, string> = {
  reposo: "dónde quedó",
  rumbo_final: "hacia dónde quedó orientado",
  marcas_frenado: "marcas de frenado",
  proyeccion: "distancia a la que quedó la persona",
  dano: "daño descrito",
};

export function evidenceLabel(label: string, roles: Map<string, string>): string {
  const [kind = "", id = ""] = label.split(":");
  const who = roles.has(id) ? `vehículo ${roles.get(id)}` : "persona";
  return `${EVIDENCIA[kind] ?? kind} (${who})`;
}

function Estimate({ p }: { p: Parametro }) {
  const unit = p.unidad === "deg" ? "°" : " km/h";
  if (!p.identificable || !p.estimacion) {
    return <span>La evidencia no basta para estimarlo.</span>;
  }
  const e = p.estimacion;
  if (p.en_limite) {
    return (
      <span>
        La evidencia lleva este dato hasta el límite del modelo ({fmt(e.mejor)}
        {unit}), así que no cabe bien con lo demás. Conviene revisar los datos.
      </span>
    );
  }
  return (
    <span>
      {fmt(e.p10)}–{fmt(e.p90)}
      {unit}
      <span className="block text-xs text-neutral-600 dark:text-neutral-400">
        mejor ajuste {fmt(e.mejor)}
        {unit}
      </span>
    </span>
  );
}

/**
 * Inversión y consistencia (PLAN §6.1.10 y §6.1.12): qué velocidades y ángulos fija la evidencia
 * física declarada y qué datos no cuadran con ninguna solución física. Nunca asigna culpa.
 */
export function EvidencePanel({ resultado }: { resultado: Resultado }) {
  const inv = resultado.inversion;
  const flags = resultado.consistencia ?? [];
  const roles = new Map(resultado.vehiculos.map((v) => [v.id, v.rol]));
  if (!inv && flags.length === 0) return null;
  return (
    <section
      aria-label="Lo que dice la evidencia física"
      data-testid="evidencia"
      className="flex flex-col gap-3 text-sm"
    >
      <h3 className="font-semibold">Lo que dice la evidencia física</h3>
      {inv && inv.evidencia.length > 0 ? (
        <>
          <p>
            Evidencia declarada: {inv.evidencia.map((l) => evidenceLabel(l, roles)).join(", ")}.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-neutral-300 dark:border-neutral-700">
                  <th className="py-1 pr-3">Vehículo</th>
                  <th className="py-1 pr-3">Dato</th>
                  <th className="py-1 pr-3">Valor de partida</th>
                  <th className="py-1">Según la evidencia (80 %)</th>
                </tr>
              </thead>
              <tbody>
                {inv.parametros.map((p) => (
                  <tr
                    key={`${p.parametro}-${p.vehiculo}`}
                    className="border-b border-neutral-200 dark:border-neutral-800"
                  >
                    <td className="py-1 pr-3">{roles.get(p.vehiculo) ?? p.vehiculo}</td>
                    <td className="py-1 pr-3">
                      {p.parametro === "velocidad_previa"
                        ? "Velocidad previa (antes de frenar, si frenó)"
                        : "Dirección de llegada"}
                    </td>
                    <td className="py-1 pr-3">
                      {fmt(p.inicial)}
                      {p.unidad === "deg" ? "°" : " km/h"}{" "}
                      <span className="text-xs text-neutral-600 dark:text-neutral-400">
                        ({p.inicial_declarado ? "dicho" : "supuesto"})
                      </span>
                    </td>
                    <td className="py-1">
                      <Estimate p={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Velocidades y direcciones con las que el solver reproduce la evidencia (mínimos
            cuadrados robustos), repetidas {inv.muestras} veces con la fricción, las masas y la
            evidencia dentro de su incertidumbre (semilla {inv.semilla}). Las direcciones solo se
            ajustan si nadie las dijo, hasta 20° del supuesto.
          </p>
        </>
      ) : (
        <p>
          La escena no declara posiciones finales, marcas de frenado, distancia de proyección ni
          daño medible: las velocidades salen de lo dicho y de los supuestos.
        </p>
      )}
      {flags.length > 0 ? (
        <div>
          <h4 className="font-semibold">Datos que no cuadran</h4>
          <ul className="list-disc pl-5" data-testid="consistencia">
            {flags.map((f) => (
              <li key={`${f.codigo}-${f.datos.vehiculo}`}>{f.mensaje}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
