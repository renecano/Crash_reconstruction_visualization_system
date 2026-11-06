"use client";
import { useSearchParams } from "next/navigation";
import {
  modelVariantFor,
  prefetchVehicleModels,
  qualityForGpu,
  readGpuRenderer,
} from "@croquis/viewer";
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
  type ContraMetodosCesvi,
  type Expediente,
  type Reconstruccion,
  type VerificacionVehiculo,
  encabezadoHipotesis,
  supuestosEnUnaLinea,
  type SupuestoDeclarado,
} from "@croquis/cesvi";
import { LEGEND_TEXT_CESVI, type EscenaSpec } from "@croquis/scene-schema";
import type { ViewerExportApi } from "@croquis/viewer";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hipotesis } from "@/components/visor/hypothesis-panel";
import {
  CONTROLES_INICIALES,
  type ControlesVisor,
  VisorEscena,
} from "@/components/visor/visor-app";
import type { OverpassResponse } from "@croquis/croquis-2d";
import { conCallesDelMapa, conObjetosDelMapa } from "@/lib/calles-del-mapa";
import { reconstruirCompletoEnNavegador } from "@/lib/reconstruct-client";
import { DEFINICION, METODO } from "@/lib/textos-caso";

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
export function PanelReconstruccion({ rec }: { rec: EstadoReconstruccion }) {
  const { r } = rec;
  return (
    <div className="flex flex-col gap-4" data-testid="reconstruccion">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="t-subtitulo">Reconstrucción física</h2>
        <button
          type="button"
          className={r ? "boton-secundario" : "boton-principal"}
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
                  <span className="cifras">{i.t === 0 ? "0.00 s" : `+${i.t.toFixed(2)} s`}</span> ·{" "}
                  {i.vehiculos.join(" con ")}
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
        </>
      ) : null}
    </div>
  );
}

export function TablaVelocidades({ r }: { r: Reconstruccion }) {
  return (
    <table className="w-full border-collapse text-sm" data-testid="velocidades">
      <caption className="t-nota pb-2 text-left" data-testid="metodo-velocidades">
        {METODO.reconstruccion} ({METODO.reconstruccionDetalle}). {DEFINICION.previa};{" "}
        {DEFINICION.impacto}.
      </caption>
      <thead>
        <tr className="text-left text-xs text-texto-3">
          <th className="py-2 font-medium">Vehículo</th>
          <th className="py-2 text-right font-medium">Velocidad previa (km/h)</th>
          <th className="py-2 text-right font-medium">Al contacto, p10–p50–p90 (km/h)</th>
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

/** «71.56 (62.40–90.00)»: el valor con su p10–p90, si lo hay. */
export function conRango(kmh: number, rango: [number, number] | null): string {
  return rango
    ? `${kmh.toFixed(2)} (${rango[0].toFixed(2)}–${rango[1].toFixed(2)})`
    : kmh.toFixed(2);
}

const conSigno = (x: number, d: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}`;

/** Una diferencia de velocidad con su valor y su porcentaje («−19.76 km/h (−31.29 %)»). */
export function diferenciaEnTexto(f: ContraMetodosCesvi["filas"][number]): string {
  return f.diferenciaKmh === null || f.diferenciaPct === null
    ? "—"
    : `${conSigno(f.diferenciaKmh, 2)} km/h (${conSigno(f.diferenciaPct, 2)} %)`;
}

/**
 * La reconstrucción contra cada método del reporte de CESVI (ADR 0091): las dos velocidades, la
 * diferencia con su valor y su porcentaje, y por qué los métodos no miden lo mismo.
 */
export function TablaContraCesvi({ contra }: { contra: ContraMetodosCesvi }) {
  return (
    <div className="flex flex-col gap-3" data-testid="contra-metodos-cesvi">
      <h3 className="t-interfaz font-semibold">La reconstrucción contra el reporte de CESVI</h3>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs text-texto-3">
            <th className="py-2 font-medium">Método del reporte</th>
            <th className="py-2 text-right font-medium">CESVI (km/h)</th>
            <th className="py-2 text-right font-medium">Croquis (km/h)</th>
            <th className="py-2 text-right font-medium">Diferencia</th>
          </tr>
        </thead>
        <tbody className="cifras">
          {contra.filas.map((f) => (
            <tr key={f.metodo} className="border-t border-linea-suave">
              <td className="py-2 font-sans">
                {f.metodo} <span className="t-nota">{f.cesviQue}</span>
              </td>
              <td className="py-2 text-right">{f.cesviKmh.toFixed(2)}</td>
              <td className="py-2 text-right">
                {f.croquisKmh === null ? (
                  <span className="font-sans text-texto-3">la evidencia no la fija</span>
                ) : (
                  conRango(f.croquisKmh, f.croquisRango)
                )}
              </td>
              <td className="py-2 text-right">{diferenciaEnTexto(f)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {contra.filas.some((f) => f.croquisRango) ? (
        <p className="t-nota">
          Entre paréntesis, el p10–p90: la velocidad que reproduce la evidencia cuando sus entradas
          (medidas, fricción, masas y reposo supuesto) varían dentro de su incertidumbre, alrededor
          de la solución elegida. Si con eso la solución no se mueve (el costo tiene un quiebre
          ahí), es su aproximación lineal.
        </p>
      ) : null}
      {contra.filas.map((f) => (
        <p key={f.metodo} className="t-nota">
          <span className="font-semibold">{f.metodo}:</span> {f.porQue}
        </p>
      ))}
      {contra.avisos.map((a) => (
        <p key={a} className="t-nota text-senal-texto" data-testid="aviso-dano-no-alcanzado">
          {a}
        </p>
      ))}
    </div>
  );
}

/**
 * Las hipótesis (ADR 0091): un reposo supuesto que no cabe con la deformación medida, u otro
 * mínimo del multiarranque con un costo parecido al del mejor. Cada una con sus números y su
 * costo. El perito elige; Croquis no elige por él.
 */
export function ElegirHipotesis({
  r,
  elegida,
  onElegir,
}: {
  r: Reconstruccion;
  elegida: string | null;
  onElegir: (clave: string) => void;
}) {
  if (!r.hipotesis) return null;
  const hs = r.hipotesis;
  const vista = hs.find((h) => h.clave === elegida);
  return (
    <div className="flex flex-col gap-3" data-testid="hipotesis">
      <h3 className="t-interfaz font-semibold">{encabezadoHipotesis(hs)}</h3>
      <p className="t-nota">
        {vista
          ? `Elegiste «${vista.titulo}»: los números, el 3D y el dictamen la siguen.`
          : `Elige una. Mientras no elijas, se ve «${hs[0]!.titulo}» (${hs[0]!.familia === "dano" ? "lo medido pesa más que lo supuesto y es la de menor costo" : "la de menor costo"}), y el dictamen dice que falta tu elección.`}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {hs.map((h) => (
          <div
            key={h.clave}
            className="hundido flex flex-col gap-2 p-4"
            style={elegida === h.clave ? { outline: "2px solid var(--acento)" } : undefined}
            data-testid={`hipotesis-${h.clave}`}
          >
            <span className="t-interfaz font-semibold">{h.titulo}</span>
            <ul className="cifras t-cuerpo flex flex-col gap-1">
              {h.costo !== null ? (
                <li data-testid={`costo-${h.clave}`}>Costo del ajuste: {h.costo.toFixed(3)}</li>
              ) : null}
              {h.velocidades.map((v) => (
                <li key={v.vehiculo}>
                  {v.vehiculo}:{" "}
                  {v.kmh === null
                    ? "sin velocidad"
                    : v.fijada
                      ? `${conRango(v.kmh, v.rango)} km/h`
                      : `${v.kmh.toFixed(2)} km/h (mejor ajuste; la evidencia medida no la fija)`}
                </li>
              ))}
              {h.reposos.map((x) => (
                <li key={x.vehiculo}>
                  {x.vehiculo} termina a {x.m.toFixed(1)} m de su reposo supuesto
                </li>
              ))}
              <li>
                {h.alcanzaDano
                  ? "Alcanza la deformación medida"
                  : "No alcanza la deformación medida"}
              </li>
            </ul>
            <button
              type="button"
              className={
                elegida === h.clave
                  ? "boton-primario boton-compacto"
                  : "boton-secundario boton-compacto"
              }
              onClick={() => onElegir(h.clave)}
              data-testid={`elegir-${h.clave}`}
            >
              {elegida === h.clave ? "Elegida" : "Elegir esta"}
            </button>
          </div>
        ))}
      </div>
      <p className="t-nota">
        El costo mide qué tan bien reproduce cada solución la evidencia: menor es mejor. Solo se
        comparan los de la misma hipótesis, porque cada una pesa distinto el reposo supuesto. Entre
        paréntesis, el p10–p90 de cada velocidad con las entradas perturbadas (medidas, fricción,
        masas y reposo supuesto) alrededor de esa solución. Si con eso la solución no se mueve (el
        costo tiene un quiebre ahí), es su aproximación lineal.
      </p>
    </div>
  );
}

/** La verificación con los métodos de CESVI, paso por paso (fórmula, sustitución, resultado). */
export function PanelVerificacion({ verificacion }: { verificacion: VerificacionVehiculo[] }) {
  return (
    <div className="flex flex-col gap-4" data-testid="verificacion-cesvi">
      <h2 className="t-subtitulo">Verificación con el método de CESVI</h2>
      <p className="t-nota" data-testid="metodo-verificacion">
        {METODO.cesvi}: {METODO.cesviDetalle}, con las medidas del reporte. No es la misma velocidad
        que la de la {METODO.reconstruccion.toLowerCase()}.
      </p>
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
  contraCesvi = null,
  declarada,
  onExportApi,
  onPosiciones,
  calles = null,
  objetos = null,
  expandido = false,
  supuestos = [],
  activo = true,
  camaraPedida = null,
  aSangre = false,
}: {
  /** En la reconstrucción la escena va primero: las notas quedan debajo de los controles. */
  aSangre?: boolean;
  r: Reconstruccion;
  /** La cámara que piden las pestañas del acto («libre», «detras-<id>»…); `n` cambia con cada pedido. */
  camaraPedida?: { camara: string; n: number } | null;
  /** El 3D está a la vista (false: lo tapa el mapa; no dibuja ni corre el reloj). */
  activo?: boolean;
  /** Lo que el caso no trae, como supuesto declarado (ADR 0091). */
  supuestos?: readonly SupuestoDeclarado[];
  /** La velocidad de la reconstrucción contra el reporte de CESVI, para decirla sobre el 3D. */
  contraCesvi?: ContraMetodosCesvi | null;
  /** A pantalla completa: arriba flota la caja del paso y abajo «Siguiente»; el 3D les deja lugar. */
  expandido?: boolean;
  /** Las calles del lugar (R10): con ellas, el 3D dibuja la red real en lugar de la plantilla. */
  calles?: OverpassResponse | null;
  /** Los árboles, postes y bardas del lugar (R10), como objetos del entorno. */
  objetos?: OverpassResponse | null;
  declarada: Hipotesis | null;
  onExportApi: (api: ViewerExportApi | null) => void;
  onPosiciones: (ps: PosicionMovil[]) => void;
}) {
  // Los archivos de los modelos de los vehículos se bajan en cuanto hay reconstrucción (antes de
  // abrir el 3D): el visor los encuentra en la caché (René, 2026-11-04: ver algo en ≤ 5 s).
  // `?diag=1` también aquí (René, 2026-11-04): el panel de diagnóstico del visor en el caso.
  const sp = useSearchParams();
  const diag = sp.get("diag") === "1";
  // Y `?calidad=` y `?renderer=`/`?backend=`, para diagnosticar en el caso como en `/visor`.
  const calidadUrl = sp.get("calidad");
  const rendererUrl = sp.get("renderer") ?? sp.get("backend");
  const [controles, setControles] = useState<ControlesVisor>({
    ...CONTROLES_INICIALES,
    camara: "cinematica",
    auto: true,
    diag,
    ...(calidadUrl === "baja" ||
    calidadUrl === "media" ||
    calidadUrl === "alta" ||
    calidadUrl === "ultra"
      ? { calidad: calidadUrl }
      : {}),
    ...(rendererUrl === "webgl" || rendererUrl === "webgpu" ? { renderer: rendererUrl } : {}),
  });
  // Un pedido nuevo de las pestañas cambia la cámara; los botones del visor la siguen cambiando.
  const [pedidoVisto, setPedidoVisto] = useState(0);
  if (camaraPedida && camaraPedida.n !== pedidoVisto) {
    setPedidoVisto(camaraPedida.n);
    setControles((c) => ({ ...c, camara: camaraPedida.camara }));
  }
  const spec3d = useMemo(() => {
    let s = especReconstruida(r);
    if (r.origen && calles) s = conCallesDelMapa(s, r.origen, calles);
    if (r.origen && objetos) s = conObjetosDelMapa(s, r.origen, objetos);
    return s as unknown as EscenaSpec;
  }, [r, calles, objetos]);
  // Los archivos de los modelos de los vehículos se bajan en cuanto hay reconstrucción (antes de
  // abrir el 3D): el visor los encuentra en la caché (René, 2026-11-04: ver algo en ≤ 5 s).
  useEffect(() => {
    const variante = modelVariantFor(qualityForGpu(readGpuRenderer()).level);
    if (!variante) return;
    void prefetchVehicleModels(
      spec3d.vehiculos.map((v) => v.clase.valor),
      variante,
    ).catch(() => undefined);
  }, [spec3d]);
  const externas = useMemo(() => (declarada ? [declarada] : undefined), [declarada]);
  return (
    <div
      className={`flex h-full flex-col gap-2 overflow-y-auto p-3 ${expandido ? "pt-40 pb-28" : "pt-16"} ${aSangre ? "[&>p]:order-last" : ""}`}
      data-testid="visor-caso"
    >
      <p className="t-nota">
        Las velocidades del 3D son las que estimó Croquis para reproducir tu evidencia (supuesto,
        con su rango); lo que el caso no trae va como supuesto declarado. Reconstrucción de apoyo:
        el dictamen es del perito.
      </p>
      {supuestos.length ? (
        <p className="t-nota" data-testid="supuestos-3d">
          Supuestos declarados: {supuestosEnUnaLinea(supuestos)}.
        </p>
      ) : null}
      {contraCesvi?.filas
        .filter((f) => f.croquisKmh !== null)
        .map((f) => (
          <p key={f.metodo} className="t-nota" data-testid="contra-cesvi-3d">
            <span className="cifras">
              {f.vehiculo}: Croquis {conRango(f.croquisKmh!, f.croquisRango)} km/h · CESVI (
              {f.metodo}) {f.cesviKmh.toFixed(2)} km/h · {diferenciaEnTexto(f)}.
            </span>{" "}
            {f.porQue}
          </p>
        ))}
      {contraCesvi?.avisos.map((a) => (
        <p key={a} className="t-nota text-senal-texto">
          {a}
        </p>
      ))}
      <VisorEscena
        spec={spec3d}
        escena="propia"
        leyendaTexto={LEGEND_TEXT_CESVI}
        controles={controles}
        activo={activo}
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
