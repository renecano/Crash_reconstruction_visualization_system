"use client";
/**
 * Los pasos del recorrido para un caso de expediente (ADR 0079): nuevo, importado, de la
 * reproducción o guardado. Son los mismos pasos del recorrido de AXA, llenos con lo que hacía
 * «Caso nuevo» (N vehículos, carambolas, 3D, declaración y dictamen).
 */
import {
  type ComparacionDictamen,
  type EscenaNarrada,
  type Expediente,
  type PreguntaEscena,
  type Reconstruccion,
  type VerificacionVehiculo,
} from "@croquis/cesvi";
import type { ReactNode } from "react";
import type { ReporteCesvi } from "@/lib/caso-guardado";
import { MODALIDAD } from "@/lib/nombres-cesvi";
import { CARA, Fuente, NOMBRE_FASE, Pregunta, type Fase, type Id } from "./piezas";
import { PanelVerificacion, TablaVelocidades } from "./reconstruccion";
import { ConclusionesCesvi } from "../importar-dictamen";

const nombreModalidad = (m: string | null) => (m ? (MODALIDAD[m] ?? m.replaceAll("_", " ")) : "—");

/** Vehículos, impactos y validez de la escena: lo que Croquis leyó del caso. */
export function ResumenEscena({ escena }: { escena: EscenaNarrada }) {
  const e = escena.expediente;
  const n = e.impactos?.length ?? 0;
  return (
    <div className="flex flex-col gap-3" data-testid="escena">
      <h3 className="t-interfaz font-semibold">
        {e.vehiculos.length} vehículo{e.vehiculos.length === 1 ? "" : "s"} · {n} impacto
        {n === 1 ? "" : "s"}
      </h3>
      <ul className="flex flex-col gap-2" data-testid="vehiculos">
        {e.vehiculos.map((v) => (
          <li key={v.id} className="flex flex-col gap-0.5">
            <span className="t-interfaz font-medium">
              {v.id} ·{" "}
              {[v.marca?.valor, v.modelo?.valor, v.anio].filter(Boolean).join(" ") || "sin datos"}
            </span>
            <span className="t-nota">
              Masa:{" "}
              {v.masa ? (
                <>
                  {v.masa.valor} {v.masa.unidad} <Fuente f={v.masa.fuente} />
                </>
              ) : (
                "falta"
              )}
            </span>
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-1.5" data-testid="impactos">
        {(e.impactos ?? []).map((i) => (
          <li key={i.orden} className="t-interfaz flex flex-wrap items-center gap-2">
            Impacto {i.orden}: {(i.vehiculos ?? []).join(" y ")}
            {i.objeto_fijo ? ` contra ${i.objeto_fijo}` : ""}
            {i.zonas?.length
              ? ` (${i.zonas.map((z) => `${z.vehiculo} ${CARA[z.zona.cara] ?? z.zona.cara}`).join(", ")})`
              : ""}
            <Fuente f={i.fuente} />
          </li>
        ))}
      </ul>
      <p className="t-nota" data-testid="validez">
        {escena.problemas.length
          ? `La escena tiene ${escena.problemas.length} problema${escena.problemas.length === 1 ? "" : "s"}: ${escena.problemas.join("; ")}`
          : "La escena es válida contra el contrato."}
      </p>
    </div>
  );
}

/** Paso 1: el caso. Un caso nuevo o importado empieza aquí (narrar o cargar el reporte). */
export function PasoCaso({
  titulo,
  detalle,
  escena,
  reporte,
  inicio,
}: {
  titulo: string;
  detalle: string;
  escena: EscenaNarrada | null;
  reporte: ReporteCesvi | null;
  /** Lo que se hace antes de tener escena: narrar, abrir un archivo o cargar el reporte. */
  inicio?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="t-rotulo">El caso</p>
        <h2 className="t-titulo" data-testid="titulo-caso">
          {titulo}
        </h2>
        <p className="t-cuerpo text-texto-2">{detalle}</p>
      </div>
      {inicio}
      {escena ? <ResumenEscena escena={escena} /> : null}
      {reporte ? (
        <p className="t-nota" data-testid="caso-con-reporte">
          Tiene el reporte de CESVI ({reporte.nombre}): el paso «Croquis contra el reporte de CESVI»
          compara la reconstrucción con lo que concluyó.
        </p>
      ) : null}
    </div>
  );
}

/** Paso 2: el hecho. La narración técnica, su lectura a escena y lo que más cambia el resultado. */
export function PasoHecho({
  narracion,
  editable,
  onNarracion,
  onLeer,
  onEjemplo,
  estado,
  escena,
  preguntas,
  onExpediente,
  onNoSe,
}: {
  narracion: string;
  /** Un reporte importado o de la reproducción ya viene leído: su texto no se edita. */
  editable: boolean;
  onNarracion: (t: string) => void;
  onLeer: () => void;
  onEjemplo: () => void;
  estado: string | null;
  escena: EscenaNarrada | null;
  preguntas: PreguntaEscena[];
  onExpediente: (e: Expediente) => void;
  onNoSe: (clave: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="t-subtitulo">El hecho</h2>
      {editable ? (
        <div className="solo-trabajar flex flex-col gap-3">
          <p className="t-nota">
            Escribe la narración técnica como en un reporte de CESVI: lugar, vehículos, daños,
            restos, huellas y posiciones. La IA no produce números: los que no están en tu texto se
            descartan.
          </p>
          <textarea
            className="campo min-h-48"
            value={narracion}
            onChange={(e) => onNarracion(e.target.value)}
            aria-label="Narración técnica del perito"
            data-testid="narracion"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="boton-principal"
              onClick={onLeer}
              disabled={narracion.trim().length < 20}
              data-testid="leer-narracion"
            >
              Leer la narración
            </button>
            <button
              type="button"
              className="boton-secundario"
              onClick={onEjemplo}
              data-testid="ejemplo-narracion"
            >
              Usar una narración de ejemplo
            </button>
            {estado ? (
              <span role="status" className="t-nota">
                {estado}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {narracion.trim() ? (
        <section className={`flex flex-col gap-2 ${editable ? "solo-presentar" : ""}`}>
          <h3 className="t-interfaz font-semibold">
            {editable ? "Narración del perito" : "La narración del reporte"}
          </h3>
          <p
            className="t-cuerpo max-h-[50vh] overflow-y-auto whitespace-pre-line text-texto-2"
            data-testid="narracion-texto"
          >
            {narracion}
          </p>
        </section>
      ) : null}
      {escena ? <ResumenEscena escena={escena} /> : null}
      {escena ? (
        <div className="solo-trabajar flex flex-col gap-3">
          <h3 className="t-interfaz font-semibold">Lo que más cambia la reconstrucción</h3>
          {preguntas.length ? (
            <ol className="flex flex-col gap-3">
              {preguntas.map((p) => (
                <Pregunta
                  key={p.clave}
                  p={p}
                  expediente={escena.expediente}
                  onCambio={onExpediente}
                  onNoSe={() => onNoSe(p.clave)}
                />
              ))}
            </ol>
          ) : (
            <p className="t-nota" data-testid="sin-preguntas">
              No falta nada que pregunte Croquis.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Paso 3: el lugar. Con qué se coloca (vehículo, fase y rumbo) y lo que describe la narración. */
export function PasoLugar({
  expediente,
  escena,
  herramienta,
  onHerramienta,
  rumbo,
  onRumbo,
  colocados,
}: {
  expediente: Expediente;
  escena: EscenaNarrada;
  herramienta: { vehiculo: Id; fase: Fase } | null;
  onHerramienta: (h: { vehiculo: Id; fase: Fase }) => void;
  rumbo: string;
  onRumbo: (r: string) => void;
  colocados: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="t-subtitulo">El lugar</h2>
      <p className="t-nota solo-trabajar">
        Elige el vehículo y la fase, escribe el rumbo del frente y toca el mapa para colocarlo.
      </p>
      <div className="solo-trabajar flex flex-wrap items-end gap-3">
        <label className="t-nota flex flex-col gap-1">
          Vehículo y fase
          <select
            className="campo h-10"
            value={herramienta ? `${herramienta.vehiculo}:${herramienta.fase}` : ""}
            onChange={(e) => {
              const [vehiculo, fase] = e.target.value.split(":") as [Id, Fase];
              onHerramienta({ vehiculo, fase });
            }}
            data-testid="herramienta-escena"
          >
            {expediente.vehiculos.flatMap((v) =>
              (["impacto", "final"] as const).map((f) => (
                <option key={`${v.id}:${f}`} value={`${v.id}:${f}`}>
                  {v.id} · {NOMBRE_FASE[f]}
                </option>
              )),
            )}
          </select>
        </label>
        <label className="t-nota flex flex-col gap-1">
          Rumbo del frente (°)
          <input
            className="campo h-10 w-28"
            inputMode="decimal"
            value={rumbo}
            onChange={(e) => onRumbo(e.target.value)}
            data-testid="rumbo-escena"
          />
        </label>
      </div>
      <p className="t-nota" data-testid="colocados">
        {colocados === 1
          ? "1 posición colocada por el perito."
          : `${colocados} posiciones colocadas por el perito.`}
      </p>
      {escena.posiciones.length ? (
        <div className="flex flex-col gap-1">
          <h3 className="t-interfaz font-semibold">Lo que dice la narración</h3>
          <ul className="t-nota flex flex-col gap-1">
            {escena.posiciones.map((p, k) => (
              <li key={k}>
                {p.vehiculo}, {p.fase}: {p.descripcion}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const LADO: Record<string, string> = {
  F: "frontal",
  B: "posterior",
  L: "lateral izquierdo",
  R: "lateral derecho",
  T: "techo",
  U: "inferior",
};

/** Paso 5: los daños. Los narrados por vehículo y los que calcula la reconstrucción (CDC, C1–C6). */
export function PasoDanos({ expediente, r }: { expediente: Expediente; r: Reconstruccion | null }) {
  const calculados = (r?.resultado.vehiculos ?? []) as {
    id: string;
    delta_v_kmh?: number;
    dano?: { perfil_m: number[]; energia_j: number; cdc?: { lado: string } };
  }[];
  return (
    <div className="flex flex-col gap-4" data-testid="danos-caso">
      <h2 className="t-subtitulo">Los daños</h2>
      {expediente.vehiculos.map((v) => {
        const narrados = (expediente.danos ?? []).filter((d) => d.vehiculo === v.id);
        const c = calculados.find((x) => r?.ids[x.id] === v.id);
        return (
          <section key={v.id} className="hundido flex flex-col gap-2 p-4">
            <span className="t-interfaz font-semibold">{v.id}</span>
            {narrados.length ? (
              <ul className="t-nota flex flex-col gap-1">
                {narrados.map((d, k) => (
                  <li key={k}>
                    {CARA[d.zona.cara] ?? d.zona.cara}
                    {d.zona.tercio ? ` (${d.zona.tercio})` : ""}
                    {d.magnitud?.cualitativa ? ` · ${d.magnitud.cualitativa}` : ""}
                    {d.dano_previo ? " · daño previo" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-nota">La narración no describe sus daños.</p>
            )}
            {c?.dano ? (
              <p className="t-nota" data-testid={`dano-calculado-${v.id}`}>
                Reconstrucción: cara {LADO[c.dano.cdc?.lado ?? ""] ?? "—"}; C1–C6{" "}
                <span className="cifras">
                  {c.dano.perfil_m.map((x) => (x * 100).toFixed(0)).join(" · ")} cm
                </span>
                ; energía <span className="cifras">{(c.dano.energia_j / 1000).toFixed(1)} kJ</span>
                {c.delta_v_kmh !== undefined ? (
                  <>
                    ; Δv <span className="cifras">{c.delta_v_kmh.toFixed(1)} km/h</span>
                  </>
                ) : null}
                .
              </p>
            ) : null}
          </section>
        );
      })}
      {!r ? <p className="t-nota">Reconstruye para ver el daño que calcula Croquis.</p> : null}
    </div>
  );
}

/** Paso 6: los números. Las velocidades de la reconstrucción y la verificación con el método de CESVI. */
export function PasoNumeros({
  r,
  verificacion,
}: {
  r: Reconstruccion | null;
  verificacion: VerificacionVehiculo[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="t-subtitulo">Los números</h2>
      {r ? (
        <TablaVelocidades r={r} />
      ) : (
        <p className="t-nota">Reconstruye para ver las velocidades con su rango.</p>
      )}
      <PanelVerificacion verificacion={verificacion} />
    </div>
  );
}

function Coincide({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-texto-3">no se puede comparar</span>;
  return ok ? (
    <span className="font-semibold">coincide</span>
  ) : (
    <span className="text-senal-texto">no coincide</span>
  );
}

/**
 * Paso 7 (solo con reporte): Croquis contra lo que concluyó CESVI, eje por eje (E-R4). Toda
 * diferencia de velocidad va con su valor y su porcentaje.
 */
export function PasoContraReporte({
  reporte,
  comparacion,
}: {
  reporte: ReporteCesvi;
  comparacion: ComparacionDictamen;
}) {
  const k = comparacion;
  return (
    <div className="flex flex-col gap-5" data-testid="contra-reporte">
      <h2 className="t-subtitulo">Croquis contra el reporte de CESVI</h2>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="hundido flex flex-col gap-1 p-4" data-testid="eje-modalidad">
          <dt className="t-nota">Modalidad</dt>
          <dd className="t-interfaz">
            CESVI: {nombreModalidad(k.modalidad.cesvi)} · Croquis:{" "}
            {nombreModalidad(k.modalidad.croquis)} · <Coincide ok={k.modalidad.coincide} />
          </dd>
          <dd className="t-nota">{k.modalidad.motivo}</dd>
        </div>
        <div className="hundido flex flex-col gap-1 p-4">
          <dt className="t-nota">Zonas de contacto</dt>
          <dd className="t-interfaz cifras">
            {k.zonas.coinciden} de {k.zonas.cesvi} coinciden
            {k.zonas.tercios_comparables
              ? ` · tercios ${k.zonas.tercios_coinciden} de ${k.zonas.tercios_comparables}`
              : ""}
          </dd>
        </div>
        <div className="hundido flex flex-col gap-1 p-4">
          <dt className="t-nota">Primer impacto</dt>
          <dd className="t-interfaz">
            <Coincide ok={k.secuencia.primero_coincide} />
            {k.secuencia.cesvi > 1 ? (
              <>
                {" "}
                · secuencia completa: <Coincide ok={k.secuencia.completa_coincide} />
              </>
            ) : null}
          </dd>
        </div>
        <div className="hundido flex flex-col gap-1 p-4">
          <dt className="t-nota">Posiciones finales</dt>
          <dd className="t-interfaz cifras">
            Croquis tiene {k.posiciones.croquis_las_tiene} de {k.posiciones.cesvi}
          </dd>
        </div>
      </dl>
      {k.velocidades.length ? (
        <table className="w-full border-collapse text-sm" data-testid="velocidades-contra">
          <thead>
            <tr className="text-left text-xs text-texto-3">
              <th className="py-2 font-medium">Vehículo</th>
              <th className="py-2 text-right font-medium">CESVI (km/h)</th>
              <th className="py-2 text-right font-medium">Croquis (km/h)</th>
              <th className="py-2 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody className="cifras">
            {k.velocidades.map((v, i) => (
              <tr key={i} className="border-t border-linea-suave">
                <td className="py-2 font-sans">
                  {v.vehiculo} <span className="t-nota">{v.que}</span>
                </td>
                <td className="py-2 text-right">{v.cesvi_kmh.toFixed(2)}</td>
                <td className="py-2 text-right">
                  {v.croquis_kmh === null ? (
                    <span className="font-sans text-texto-3">sin las medidas</span>
                  ) : (
                    v.croquis_kmh.toFixed(2)
                  )}
                </td>
                <td className="py-2 text-right">
                  {v.error_kmh === null
                    ? "—"
                    : `${v.error_kmh.toFixed(2)} km/h (${(v.error_pct ?? 0).toFixed(1)} %)`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <ConclusionesCesvi conclusiones={reporte.conclusiones} />
    </div>
  );
}
