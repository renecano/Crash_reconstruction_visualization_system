"use client";
/**
 * R7 (ADR 0070): comparar la declaración de un conductor con la reconstrucción, como complemento
 * opcional. El perito pega la declaración y elige qué vehículo conducía el declarante; Croquis la
 * lee, simula esa versión con el mismo solver y muestra «Qué cambia entre versiones». La versión
 * declarada entra al 3D como hipótesis (fantasmas o lado a lado). La sugerencia sale solo si el
 * perito la pide, y él la confirma o la descarta. Sin culpas.
 */
import {
  compararDeclarada,
  descripcionVehiculo,
  especDeclarada,
  especDeExpediente,
  REGLA_SUGERENCIA_DECLARADA,
  sugerirDeclarada,
  versionDeclarada,
  type Expediente,
  type FilaDeclarada,
  type Reconstruccion,
  type SalidaCorpus,
  type VersionDeclarada,
} from "@croquis/cesvi";
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { useEffect, useState } from "react";
import type { Hipotesis } from "@/components/visor/hypothesis-panel";
import type { DatosDictamenCaso } from "@/lib/dictamen-caso";
import { reconstruirCompletoEnNavegador } from "@/lib/reconstruct-client";

type Id = Expediente["vehiculos"][number]["id"];

const ESTADO: Record<FilaDeclarada["estado"], string> = {
  coincide: "Coincide",
  no_coincide: "No coincide",
  sin_dato: "Sin dato",
};

const descripcion = descripcionVehiculo;

export function ComparacionDeclaracion({
  expediente,
  reconstruccion,
  onHipotesis,
  onComparacion,
}: {
  expediente: Expediente;
  reconstruccion: Reconstruccion;
  /** La versión declarada ya simulada, para el 3D (null al quitarla). */
  onHipotesis: (h: Hipotesis | null) => void;
  /** La comparación que hizo el perito, para el dictamen (R8); null si no la usó. */
  onComparacion?: (c: DatosDictamenCaso["declarada"]) => void;
}) {
  const ids = expediente.vehiculos.map((v) => v.id);
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const [declarante, setDeclarante] = useState<Id>(ids[0]!);
  const [estado, setEstado] = useState<string | null>(null);
  const [version, setVersion] = useState<VersionDeclarada | null>(null);
  const [filas, setFilas] = useState<FilaDeclarada[] | null>(null);
  const [sugerencia, setSugerencia] = useState(false);
  const [decision, setDecision] = useState<"confirmada" | "descartada" | null>(null);

  const comparar = async () => {
    setEstado("Leyendo la declaración…");
    setVersion(null);
    setFilas(null);
    setSugerencia(false);
    setDecision(null);
    onHipotesis(null);
    try {
      const res = await fetch("/api/cesvi/declaracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto,
          declarante,
          vehiculos: expediente.vehiculos.map((v) => ({ id: v.id, descripcion: descripcion(v) })),
        }),
      });
      const d = (await res.json()) as {
        metodo?: string;
        motivo?: string;
        error?: string;
        salida?: SalidaCorpus;
      };
      if (d.metodo !== "claude" || !d.salida) {
        setEstado(`No se pudo leer la declaración: ${d.motivo ?? d.error ?? "sin respuesta"}.`);
        return;
      }
      const v = versionDeclarada(d.salida, texto, declarante, ids);
      setVersion(v);
      setEstado("Simulando la versión declarada…");
      const reconstruidas = new Map(
        reconstruccion.velocidades.flatMap((x) =>
          x.previa ? [[x.vehiculo, x.previa.mejor]] : [],
        ) as [Id, number][],
      );
      const decl = especDeclarada(especDeExpediente(expediente), v, reconstruidas);
      const resultado = await reconstruirCompletoEnNavegador(decl.spec as unknown as EscenaSpec);
      setFilas(
        compararDeclarada({
          expediente,
          reconstruccion,
          declarada: v,
          resultadoDeclarado: resultado as unknown as Record<string, unknown>,
        }),
      );
      onHipotesis({
        etiqueta: `versión declarada (${declarante})`,
        resultado: resultado as Resultado,
      });
      setEstado(null);
    } catch (e) {
      setEstado(`No se pudo comparar: ${(e as Error).message}`);
    }
  };

  const s = filas ? sugerirDeclarada(filas) : null;
  useEffect(() => {
    onComparacion?.(
      version && filas
        ? {
            declarante: version.declarante,
            filas,
            sugerencia: sugerencia && s ? { texto: s.texto, decision } : null,
          }
        : null,
    );
    // `s` se deriva de `filas`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, filas, sugerencia, decision, onComparacion]);

  return (
    <section
      className="tarjeta flex flex-col gap-4 p-6 lg:col-span-2"
      data-testid="comparacion-declaracion"
    >
      <button
        type="button"
        className="t-subtitulo self-start text-left"
        aria-expanded={abierta}
        onClick={() => setAbierta((x) => !x)}
        data-testid="abrir-declaracion"
      >
        {abierta ? "▾" : "▸"} Comparar con la declaración del conductor · opcional
      </button>
      {abierta ? (
        <>
          <p className="t-nota">
            Pega lo que declaró un conductor. Croquis arma esa versión con el mismo solver y la
            muestra al lado de la reconstrucción. Es lo que dice el conductor, no evidencia; Croquis
            no dice quién tiene razón.
          </p>
          <label className="solo-trabajar flex flex-col gap-1.5">
            <span className="t-nota">Declaración</span>
            <textarea
              className="campo min-h-[120px]"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              data-testid="texto-declaracion"
            />
          </label>
          <label className="solo-trabajar flex flex-wrap items-center gap-2">
            <span className="t-nota">El declarante conducía</span>
            <select
              className="campo"
              value={declarante}
              onChange={(e) => setDeclarante(e.target.value as Id)}
              data-testid="declarante"
            >
              {expediente.vehiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id} · {descripcion(v)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="boton-principal solo-trabajar self-start"
            disabled={texto.trim().length < 20}
            onClick={() => void comparar()}
            data-testid="leer-declaracion"
          >
            Leer y comparar
          </button>
          {estado ? (
            <p role="status" className="t-interfaz">
              {estado}
            </p>
          ) : null}
          {version ? (
            <ul className="t-nota flex flex-col gap-1" data-testid="lo-que-declara">
              {version.maniobras.map((m) => (
                <li key={`m-${m.vehiculo}`}>
                  {m.vehiculo}: {m.tipo.replaceAll("_", " ")} — «{m.cita}»
                </li>
              ))}
              {version.velocidades.map((x) => (
                <li key={`v-${x.vehiculo}`}>
                  {x.vehiculo}: <span className="cifras">{x.kmh} km/h</span> — «{x.cita}»
                </li>
              ))}
              {version.contactos.map((c) => (
                <li key={`c-${c.impacto}-${c.vehiculo}`}>
                  {c.vehiculo}: contacto {c.cara.replaceAll("_", " ")} — «{c.cita}»
                </li>
              ))}
            </ul>
          ) : null}
          {filas ? (
            <>
              <table className="w-full border-collapse text-sm" data-testid="que-cambia">
                <caption className="t-interfaz mb-2 text-left font-semibold">
                  Qué cambia entre versiones
                </caption>
                <thead>
                  <tr className="text-left text-xs text-texto-3">
                    <th className="py-2 font-medium">Vehículo</th>
                    <th className="py-2 font-medium">Concepto</th>
                    <th className="py-2 font-medium">Versión declarada</th>
                    <th className="py-2 font-medium">Evidencia y reconstrucción</th>
                    <th className="py-2 text-right font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr
                      key={`${f.clave}-${f.vehiculo}`}
                      className="border-t border-linea-suave"
                      data-fila={`${f.clave}-${f.vehiculo}`}
                      title={f.fuente}
                    >
                      <td className="py-2.5 font-medium">{f.vehiculo}</td>
                      <td className="py-2.5">{f.concepto}</td>
                      <td className="cifras py-2.5">{f.declarada}</td>
                      <td className="cifras py-2.5">{f.evidencia}</td>
                      <td className="py-2.5 text-right">{ESTADO[f.estado]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="t-nota">
                En el 3D, la versión declarada se ve como fantasma sobre la reconstrucción;
                «Comparar lado a lado» las separa.
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sugerencia}
                  onChange={(e) => {
                    setSugerencia(e.target.checked);
                    setDecision(null);
                  }}
                  data-testid="pedir-sugerencia"
                />
                <span className="t-interfaz">Mostrar la sugerencia de Croquis</span>
              </label>
              {sugerencia && s ? (
                <div className="hundido flex flex-col gap-2 p-4" data-testid="sugerencia-declarada">
                  <p className="t-interfaz">{s.texto}</p>
                  <p className="t-nota">{REGLA_SUGERENCIA_DECLARADA}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="boton-secundario"
                      aria-pressed={decision === "confirmada"}
                      onClick={() => setDecision("confirmada")}
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      className="boton-secundario"
                      aria-pressed={decision === "descartada"}
                      onClick={() => setDecision("descartada")}
                    >
                      Descartar
                    </button>
                  </div>
                  {decision ? (
                    <p role="status" className="t-nota" data-testid="decision-sugerencia">
                      El perito {decision === "confirmada" ? "confirmó" : "descartó"} la sugerencia.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
