"use client";
/**
 * La reconstrucción física de un caso de expediente (R2, ADR 0062; repartida en los pasos del
 * recorrido, ADR 0079): el solver TS corre en el Web Worker del visor sobre la escena del
 * expediente. `useReconstruccion` guarda el resultado para todos los pasos; los paneles muestran las
 * velocidades con sus percentiles, la evidencia que las fija, lo que no cubre y la verificación con
 * los métodos de CESVI; `Visor3dCaso` es el 3D del escenario.
 */
import {
  especDeExpediente,
  especReconstruida,
  evidenciaEnPalabras,
  impactosEnMapa,
  interpretarResultado,
  posicionesEnTiempo,
  type Expediente,
  type Reconstruccion,
  type VerificacionVehiculo,
} from "@croquis/cesvi";
import type { EscenaSpec } from "@croquis/scene-schema";
import type { ViewerExportApi } from "@croquis/viewer";
import { useCallback, useMemo, useState } from "react";
import type { Hipotesis } from "@/components/visor/hypothesis-panel";
import {
  CONTROLES_INICIALES,
  type ControlesVisor,
  VisorEscena,
} from "@/components/visor/visor-app";
import { reconstruirCompletoEnNavegador } from "@/lib/reconstruct-client";

const kmh = (x?: number) => (x === undefined ? "—" : x.toFixed(1));

export type PosicionMovil = ReturnType<typeof posicionesEnTiempo>[number];
export type MarcaImpacto = ReturnType<typeof impactosEnMapa>[number];

export interface EstadoReconstruccion {
  r: Reconstruccion | null;
  /** Si el expediente cambió después de reconstruir (hay que volver a reconstruir). */
  vieja: boolean;
  estado: string | null;
  impactos: MarcaImpacto[];
  reconstruir: () => Promise<void>;
}

export function useReconstruccion(expediente: Expediente | null): EstadoReconstruccion {
  const [r, setR] = useState<Reconstruccion | null>(null);
  const [de, setDe] = useState<Expediente | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [impactos, setImpactos] = useState<MarcaImpacto[]>([]);
  const reconstruir = useCallback(async () => {
    if (!expediente) return;
    setEstado("Reconstruyendo con el solver…");
    setR(null);
    setImpactos([]);
    try {
      const base = especDeExpediente(expediente);
      const resultado = await reconstruirCompletoEnNavegador(base.spec as unknown as EscenaSpec);
      const json = resultado as unknown as Record<string, unknown>;
      setR(interpretarResultado(base, json));
      setDe(expediente);
      setImpactos(impactosEnMapa(base, json));
      setEstado(null);
    } catch (e) {
      setEstado(`El solver no pudo reconstruir la escena: ${(e as Error).message}`);
    }
  }, [expediente]);
  return { r, vieja: r !== null && de !== expediente, estado, impactos, reconstruir };
}

/** Las velocidades con sus percentiles, la evidencia que las fija y lo que no cubre. */
export function PanelReconstruccion({
  rec,
  ver3d,
  onVer3d,
}: {
  rec: EstadoReconstruccion;
  ver3d: boolean;
  onVer3d: (v: boolean) => void;
}) {
  const { r } = rec;
  return (
    <div className="flex flex-col gap-4" data-testid="reconstruccion">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="t-subtitulo">Reconstrucción física</h2>
        <button
          type="button"
          className="boton-principal"
          onClick={() => void rec.reconstruir()}
          data-testid="reconstruir"
        >
          {r ? "Volver a reconstruir" : "Reconstruir"}
        </button>
      </div>
      <p className="t-nota">
        El solver de Croquis ajusta las velocidades para que la simulación reproduzca la evidencia
        que colocaste. Lo que la evidencia no fija se dice así; ningún número se inventa.
      </p>
      {rec.estado ? (
        <p role="status" className="t-interfaz">
          {rec.estado}
        </p>
      ) : null}
      {rec.vieja ? (
        <p role="status" className="t-nota text-senal-texto" data-testid="reconstruccion-vieja">
          Cambiaste el caso después de reconstruir: vuelve a reconstruir.
        </p>
      ) : null}
      {r ? (
        <>
          <TablaVelocidades r={r} />
          <p className="t-nota" data-testid="evidencia-usada">
            {r.evidencia.length
              ? `Evidencia que fija el resultado: ${r.evidencia.map((x) => evidenciaEnPalabras(x, r.ids)).join(", ")}.`
              : "Sin evidencia que fije las velocidades."}
          </p>
          {r.impactos.length > 1 ? (
            <ol className="t-nota flex flex-col gap-1" data-testid="impactos-reconstruidos">
              {r.impactos.map((i) => (
                <li key={i.numero} data-impacto={i.numero}>
                  <span className="font-medium text-texto">X{i.numero}</span> ·{" "}
                  <span className="cifras">{i.t === 0 ? "0.00 s" : `+${i.t.toFixed(2)} s`}</span>{" "}
                  · {i.vehiculos.join(" con ")}
                </li>
              ))}
            </ol>
          ) : null}
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
            onClick={() => onVer3d(!ver3d)}
            data-testid="ver-3d"
          >
            {ver3d ? "Ver el mapa" : "Ver la reconstrucción en 3D"}
          </button>
        </>
      ) : null}
    </div>
  );
}

export function TablaVelocidades({ r }: { r: Reconstruccion }) {
  return (
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
  );
}

/** La verificación con los métodos de CESVI, paso por paso (fórmula, sustitución, resultado). */
export function PanelVerificacion({ verificacion }: { verificacion: VerificacionVehiculo[] }) {
  return (
    <div className="flex flex-col gap-4" data-testid="verificacion-cesvi">
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
  );
}

/**
 * El 3D del escenario: la reconstrucción con la cámara cinemática, la versión declarada como
 * fantasma (R7) y la API de exportación para los cuadros del dictamen (R8).
 */
export function Visor3dCaso({
  r,
  declarada,
  onExportApi,
  onPosiciones,
}: {
  r: Reconstruccion;
  declarada: Hipotesis | null;
  onExportApi: (api: ViewerExportApi | null) => void;
  onPosiciones: (ps: PosicionMovil[]) => void;
}) {
  const [controles, setControles] = useState<ControlesVisor>({
    ...CONTROLES_INICIALES,
    camara: "cinematica",
    auto: true,
  });
  const spec3d = useMemo(() => especReconstruida(r) as unknown as EscenaSpec, [r]);
  const externas = useMemo(() => (declarada ? [declarada] : undefined), [declarada]);
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3" data-testid="visor-caso">
      <p className="t-nota">
        Las velocidades del 3D son las que estimó Croquis para reproducir tu evidencia (supuesto,
        con su rango); lo demás que no narraste va con valores por omisión. Reconstrucción de apoyo:
        el dictamen es del perito.
      </p>
      <VisorEscena
        spec={spec3d}
        escena="propia"
        controles={controles}
        hipotesisExternas={externas}
        onExportApi={onExportApi}
        onTiempo={(t, res) =>
          onPosiciones(posicionesEnTiempo(r, res as unknown as Record<string, unknown>, t))
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
  );
}
