"use client";

/**
 * Paso 6 (R12a, ADR 0088): el perito prueba una hipótesis sobre un conductor y ve, con sus números,
 * el contacto que da la física contra el de los mismos conductores sin ella. Croquis no juzga a
 * nadie: dice qué pasa con esa decisión, no si alguien debió tomarla.
 */
import {
  DECISIONES_CONDUCTOR,
  DECISION_EN_PALABRAS,
  decisionEnPalabras,
  especConConductor,
  leerPruebaConductores,
  problemasHipotesis,
  type ContactoConductores,
  type DecisionConductor,
  type HipotesisConductor,
  type PruebaConductores,
  type Reconstruccion,
} from "@croquis/cesvi";
import { useState } from "react";
import { probarConductoresEnNavegador } from "@/lib/reconstruct-client";

type Json = Record<string, unknown>;
type Id = HipotesisConductor["vehiculo"];

const NOMBRE_DECISION: Record<DecisionConductor, string> = {
  frenar: "Frenar",
  volantear_izquierda: "Volantear a la izquierda",
  volantear_derecha: "Volantear a la derecha",
  seguir: "Seguir sin frenar",
};

const segundos = (t: number) => `${t < 0 ? "−" : "+"}${Math.abs(t).toFixed(2)} s`;
const conSigno = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;

function Contacto({ c }: { c: ContactoConductores }) {
  if (!c.contacto)
    return (
      <>
        Sin contacto: quedan a{" "}
        <span className="cifras">{(c.distanciaMinimaM ?? 0).toFixed(2)} m</span> como mínimo
      </>
    );
  return (
    <>
      {c.vehiculos.join(" con ")} en <span className="cifras">{segundos(c.t!)}</span> a{" "}
      <span className="cifras">{c.relativaKmh!.toFixed(2)} km/h</span> de velocidad relativa (
      {c.velocidades.map((v) => `${v.vehiculo} a ${v.kmh.toFixed(2)} km/h`).join(", ")})
    </>
  );
}

/** La comparación sin la hipótesis y las decisiones, en el orden en que ocurren. */
export function ResultadoConductores({ p }: { p: PruebaConductores }) {
  const d = p.diferenciaRelativa;
  return (
    <div className="flex flex-col gap-3" data-testid="resultado-conductores">
      <table className="w-full border-collapse text-sm">
        <tbody>
          <tr className="border-t border-linea-suave">
            <th className="py-2 pr-3 text-left font-medium">Con la hipótesis</th>
            <td className="py-2" data-testid="contacto-con">
              <Contacto c={p.conHipotesis} />
            </td>
          </tr>
          <tr className="border-t border-linea-suave">
            <th className="py-2 pr-3 text-left font-medium">Sin la hipótesis</th>
            <td className="py-2" data-testid="contacto-sin">
              <Contacto c={p.sinHipotesis} />
            </td>
          </tr>
          {d ? (
            <tr className="border-t border-linea-suave">
              <th className="py-2 pr-3 text-left font-medium">Diferencia</th>
              <td className="py-2" data-testid="diferencia-conductores">
                <span className="cifras">
                  {conSigno(d.kmh)} km/h{d.pct === null ? "" : ` (${conSigno(d.pct)} %)`}
                </span>{" "}
                de velocidad relativa al contacto
              </td>
            </tr>
          ) : null}
          {p.cambiaElPar ? (
            <tr className="border-t border-linea-suave">
              <th className="py-2 pr-3 text-left font-medium">Diferencia</th>
              <td className="py-2" data-testid="diferencia-conductores">
                El primer contacto es entre otros vehículos: sus velocidades no se comparan.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {p.lineaBaseDistinta ? (
        <p className="t-nota text-senal-texto" data-testid="linea-base-distinta">
          Sin la hipótesis, los conductores dan primero {p.lineaBaseDistinta.sinHipotesis}; la
          reconstrucción tiene primero {p.lineaBaseDistinta.reconstruccion}. La simulación de los
          conductores no impone el orden de impactos de la reconstrucción: compara la hipótesis con
          la fila «Sin la hipótesis», no con el paso 4.
        </p>
      ) : null}
      {p.decisiones.length ? (
        <ol className="t-nota flex list-decimal flex-col gap-1 pl-5" data-testid="decisiones">
          {p.decisiones.map((x) => (
            <li key={`${x.vehiculo}-${x.t}`}>{decisionEnPalabras(x)}</li>
          ))}
        </ol>
      ) : null}
      {p.sensibilidad ? (
        <p className="t-nota" data-testid="sensibilidad-conductores">
          Con el tiempo de reacción de los que reaccionan sorteado en su rango (
          {p.sensibilidad.muestras} muestras), la velocidad relativa va de{" "}
          <span className="cifras">{p.sensibilidad.p10.toFixed(2)}</span> a{" "}
          <span className="cifras">{p.sensibilidad.p90.toFixed(2)} km/h</span> (p10–p90)
          {p.sensibilidad.sinContacto ? `; en ${p.sensibilidad.sinContacto} no hay contacto` : ""}.
        </p>
      ) : null}
      <p className="t-nota">
        Tiempo de reacción:{" "}
        {p.tiemposReaccion
          .map((t) => `${t.vehiculo} ${t.s.toFixed(2)} s (${t.rango[0]}–${t.rango[1]} s)`)
          .join("; ")}
        . El típico es un supuesto con su fuente; los demás conductores hacen lo que reconstruyó la
        evidencia o reaccionan al de adelante cuando lo ven frenar. Es una prueba ilustrativa de la
        física con esa decisión, no un juicio sobre ningún conductor.
      </p>
    </div>
  );
}

/** El formulario del paso 6: conductor, decisión, instante y, si se quiere, tiempo de reacción. */
export function ProbarConductores({
  r,
  probar = probarConductoresEnNavegador,
}: {
  r: Reconstruccion;
  probar?: (spec: Json) => Promise<Json | null>;
}) {
  const ids = Object.values(r.ids) as Id[];
  const [vehiculo, setVehiculo] = useState<Id>(ids[0]!);
  const [decision, setDecision] = useState<DecisionConductor>("frenar");
  const [antes, setAntes] = useState("1.0");
  const [reaccion, setReaccion] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const [prueba, setPrueba] = useState<{ h: HipotesisConductor; p: PruebaConductores } | null>(
    null,
  );
  const numero = (s: string) => Number(s.replace(",", "."));
  const h: HipotesisConductor = {
    vehiculo,
    decision,
    segundosAntes: numero(antes),
    tiempoReaccionS: reaccion.trim() === "" ? null : numero(reaccion),
  };
  const problemas = problemasHipotesis(r, h);

  const correr = async () => {
    setEstado("Simulando a los conductores…");
    setPrueba(null);
    try {
      const agentes = await probar(especConConductor(r, h));
      if (!agentes) throw new Error("el solver no devolvió a los conductores");
      setPrueba({ h, p: leerPruebaConductores(r, agentes) });
      setEstado(null);
    } catch (e) {
      setEstado(`No se pudo simular: ${(e as Error).message}`);
    }
  };

  return (
    <section className="flex flex-col gap-3" data-testid="probar-conductores">
      <h3 className="t-subtitulo">Probar una hipótesis sobre un conductor</h3>
      <p className="t-nota">
        Elige un conductor, qué hace y cuándo; Croquis simula a todos los conductores con esa
        decisión y compara el contacto con el que dan los mismos conductores sin ella.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Conductor de
          <select
            className="campo"
            value={vehiculo}
            onChange={(e) => setVehiculo(e.target.value as Id)}
            data-testid="conductor-vehiculo"
          >
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Decide
          <select
            className="campo"
            value={decision}
            onChange={(e) => setDecision(e.target.value as DecisionConductor)}
            data-testid="conductor-decision"
          >
            {DECISIONES_CONDUCTOR.map((d) => (
              <option key={d} value={d}>
                {NOMBRE_DECISION[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Segundos antes del impacto
          <input
            className="campo cifras h-9 w-24"
            inputMode="decimal"
            value={antes}
            onChange={(e) => setAntes(e.target.value)}
            data-testid="conductor-instante"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tiempo de reacción (s)
          <input
            className="campo cifras h-9 w-24"
            inputMode="decimal"
            placeholder="típico"
            value={reaccion}
            onChange={(e) => setReaccion(e.target.value)}
            data-testid="conductor-reaccion"
          />
        </label>
        <button
          type="button"
          className="boton-principal"
          disabled={problemas.length > 0 || estado === "Simulando a los conductores…"}
          onClick={() => void correr()}
          data-testid="conductor-probar"
        >
          Probar
        </button>
      </div>
      {problemas.length ? (
        <ul className="t-nota text-senal-texto">
          {problemas.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      {estado ? (
        <p role="status" className="t-interfaz">
          {estado}
        </p>
      ) : null}
      {prueba ? (
        <>
          <p className="t-interfaz font-medium" data-testid="hipotesis-probada">
            Si el conductor de {prueba.h.vehiculo} {DECISION_EN_PALABRAS[prueba.h.decision]}{" "}
            {prueba.h.segundosAntes.toFixed(2)} s antes del impacto:
          </p>
          <ResultadoConductores p={prueba.p} />
        </>
      ) : null}
    </section>
  );
}
