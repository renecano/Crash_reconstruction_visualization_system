"use client";
/**
 * La reconstrucción física del caso nuevo (R2, ADR 0062): el solver TS corre en el Web Worker del
 * visor sobre la escena del expediente. Muestra las velocidades con sus percentiles, la evidencia del
 * perito que las fija y lo que no cubre; al lado, la verificación con los métodos de CESVI.
 */
import {
  especDeExpediente,
  especReconstruida,
  evidenciaEnPalabras,
  interpretarResultado,
  posicionesEnTiempo,
  verificacionCesvi,
  type Expediente,
  type Reconstruccion,
} from "@croquis/cesvi";
import type { EscenaSpec } from "@croquis/scene-schema";
import { useMemo, useState } from "react";
import {
  CONTROLES_INICIALES,
  type ControlesVisor,
  VisorEscena,
} from "@/components/visor/visor-app";
import { reconstruirCompletoEnNavegador } from "@/lib/reconstruct-client";

const kmh = (x?: number) => (x === undefined ? "—" : x.toFixed(1));

export type PosicionMovil = ReturnType<typeof posicionesEnTiempo>[number];

export function ReconstruccionCaso({
  expediente,
  onPosiciones,
}: {
  expediente: Expediente;
  /** Dónde están los vehículos en el instante del 3D, para dibujarlos en el mapa (vacío sin 3D). */
  onPosiciones?: (ps: PosicionMovil[]) => void;
}) {
  const [estado, setEstado] = useState<string | null>(null);
  const [r, setR] = useState<Reconstruccion | null>(null);
  const verificacion = verificacionCesvi(expediente);
  const [ver3d, setVer3d] = useState(false);
  // Se abre con la cámara que sigue a los vehículos y reproduciendo, como el flujo guiado.
  const [controles, setControles] = useState<ControlesVisor>({
    ...CONTROLES_INICIALES,
    camara: "cinematica",
    auto: true,
  });
  const spec3d = useMemo(() => (r ? (especReconstruida(r) as unknown as EscenaSpec) : null), [r]);

  const reconstruir = async () => {
    setEstado("Reconstruyendo con el solver…");
    setR(null);
    setVer3d(false);
    onPosiciones?.([]);
    try {
      const base = especDeExpediente(expediente);
      const resultado = await reconstruirCompletoEnNavegador(base.spec as unknown as EscenaSpec);
      setR(interpretarResultado(base, resultado as unknown as Record<string, unknown>));
      setEstado(null);
    } catch (e) {
      setEstado(`El solver no pudo reconstruir la escena: ${(e as Error).message}`);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="tarjeta flex flex-col gap-4 p-6" data-testid="reconstruccion">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="t-subtitulo">Reconstrucción física</h2>
          <button
            type="button"
            className="boton-principal"
            onClick={() => void reconstruir()}
            data-testid="reconstruir"
          >
            {r ? "Volver a reconstruir" : "Reconstruir"}
          </button>
        </div>
        <p className="t-nota">
          El solver de Croquis ajusta las velocidades para que la simulación reproduzca la evidencia
          que colocaste. Lo que la evidencia no fija se dice así; ningún número se inventa.
        </p>
        {estado ? (
          <p role="status" className="t-interfaz">
            {estado}
          </p>
        ) : null}
        {r ? (
          <>
            <table className="w-full border-collapse text-sm" data-testid="velocidades">
              <thead>
                <tr className="text-left text-xs text-texto-3">
                  <th className="py-2 font-medium">Vehículo</th>
                  <th className="py-2 text-right font-medium">Velocidad previa (km/h)</th>
                  <th className="py-2 text-right font-medium">Al impacto, p10–p50–p90 (km/h)</th>
                </tr>
              </thead>
              <tbody className="cifras">
                {r.velocidades.map((v) => (
                  <tr
                    key={v.vehiculo}
                    className="border-t border-linea-suave"
                    data-testid={`velocidad-${v.vehiculo}`}
                  >
                    <td className="py-2.5 font-sans font-medium">{v.vehiculo}</td>
                    <td className="py-2.5 text-right">
                      {v.previa ? (
                        <>
                          {v.previa.mejor.toFixed(1)}{" "}
                          <span className="text-texto-3">
                            ({kmh(v.previa.p10)}–{kmh(v.previa.p90)})
                          </span>
                        </>
                      ) : (
                        <span className="font-sans text-texto-3">la evidencia no la fija</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {v.impacto
                        ? `${kmh(v.impacto.p10)}–${kmh(v.impacto.p50)}–${kmh(v.impacto.p90)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="t-nota" data-testid="evidencia-usada">
              {r.evidencia.length
                ? `Evidencia que fija el resultado: ${r.evidencia.map((x) => evidenciaEnPalabras(x, r.ids)).join(", ")}.`
                : "Sin evidencia que fije las velocidades."}
            </p>
            {r.limites.length ? (
              <ul className="flex flex-col gap-1.5" data-testid="limites">
                {r.limites.map((l) => (
                  <li
                    key={l}
                    className="rounded-control bg-[var(--falta-fondo)] px-3 py-2 text-sm text-senal-texto"
                  >
                    {l}
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              className="boton-secundario self-start"
              onClick={() => {
                if (ver3d) onPosiciones?.([]);
                setVer3d((x) => !x);
              }}
              data-testid="ver-3d"
            >
              {ver3d ? "Ocultar el 3D" : "Ver la reconstrucción en 3D"}
            </button>
          </>
        ) : null}
      </div>
      <div className="tarjeta flex flex-col gap-4 p-6" data-testid="verificacion-cesvi">
        <h2 className="t-subtitulo">Verificación con el método de CESVI</h2>
        {verificacion.map((v) => (
          <div key={v.vehiculo} className="flex flex-col gap-2">
            <span className="t-interfaz font-semibold">{v.vehiculo}</span>
            {v.pasos.map((p) => (
              <div key={p.titulo} className="hundido flex flex-col gap-1 p-3">
                <span className="t-nota">{p.titulo}</span>
                <span className="cifras text-xs text-texto-2">{p.paso.general}</span>
                <span className="cifras text-xs">{p.paso.sustituida}</span>
                <span className="cifras text-sm font-semibold">{p.paso.resultado}</span>
              </div>
            ))}
            {v.rigidez && v.pasos.length ? (
              <span className="t-nota">Rigidez: {v.rigidez.nota}</span>
            ) : null}
            {v.notas.map((n) => (
              <span key={n} className="t-nota">
                {n}
              </span>
            ))}
            {v.falta.length ? (
              <span className="t-nota text-texto-3">Falta: {v.falta.join("; ")}.</span>
            ) : null}
          </div>
        ))}
      </div>
      {ver3d && spec3d ? (
        <div className="lg:col-span-2" data-testid="visor-caso">
          <p className="t-nota mb-3">
            Las velocidades del 3D son las que estimó Croquis para reproducir tu evidencia
            (supuesto, con su rango); lo demás que no narraste va con valores por omisión.
            Reconstrucción de apoyo: el dictamen es del perito.
          </p>
          <VisorEscena
            spec={spec3d}
            escena="propia"
            controles={controles}
            onTiempo={(t, res) =>
              onPosiciones?.(posicionesEnTiempo(r!, res as unknown as Record<string, unknown>, t))
            }
            onControl={(k, v) =>
              setControles((c) => {
                if (k === "completa") return { ...c, completa: v !== null };
                if (k === "camara") return { ...c, camara: v ?? "libre" };
                if (k === "calidad")
                  return { ...c, calidad: (v ?? "auto") as ControlesVisor["calidad"] };
                return { ...c, renderer: (v ?? "auto") as ControlesVisor["renderer"] };
              })
            }
          />
        </div>
      ) : null}
    </section>
  );
}
