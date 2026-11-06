"use client";
/**
 * Los pasos del recorrido para un caso de expediente (ADR 0079): nuevo, importado, de la
 * reproducción o guardado. Son los mismos pasos del recorrido de AXA, llenos con lo que hacía
 * «Caso nuevo» (N vehículos, carambolas, 3D, declaración y dictamen).
 */
import {
  conMasa,
  type ComparacionDictamen,
  type ContraMetodosCesvi,
  type EscenaNarrada,
  type Expediente,
  type PreguntaEscena,
  type Reconstruccion,
  type VerificacionVehiculo,
} from "@croquis/cesvi";
import { useState, type ReactNode } from "react";
import type { ReporteCesvi } from "@/lib/caso-guardado";
import { colorDeVehiculo } from "@/lib/vehiculos-cesvi";
import { CARA, Fuente, Pregunta } from "./piezas";
import { ProbarConductores } from "./conductores";
import { PanelVerificacion, TablaContraCesvi, TablaVelocidades } from "./reconstruccion";
import { ConclusionesCesvi } from "../importar-dictamen";
import {
  detectarEnNarracion,
  MAX_NARRACION,
  MIN_NARRACION,
  piezasDetectadas,
  textoConteo,
} from "@/lib/narracion-local";
import { pareceReporteCompleto } from "@/lib/lectura-reporte";

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
      {/* El detalle técnico, a un clic (V2): en pantalla, solo lo que el perito usa. */}
      <details className="t-nota" open={escena.problemas.length > 0}>
        <summary className="cursor-pointer">Ver detalle</summary>
        <p className="mt-2" data-testid="validez">
          {escena.problemas.length
            ? `La escena tiene ${escena.problemas.length} problema${escena.problemas.length === 1 ? "" : "s"}: ${escena.problemas.join("; ")}`
            : "La escena es válida contra el contrato."}
        </p>
      </details>
    </div>
  );
}

/** Cómo se dice cada clase de vehículo en pantalla. */
const NOMBRE_CLASE: Record<string, string> = {
  sedan_compacto: "sedán compacto",
  sedan_mediano: "sedán",
  hatchback: "hatchback",
  suv_compacta: "SUV compacta",
  suv_grande: "SUV",
  pickup: "pickup",
  van: "van",
  microbus_combi: "microbús",
  autobus: "autobús",
  camion_unitario: "camión",
  tractocamion: "tractocamión",
  motocicleta: "motocicleta",
  bicicleta: "bicicleta",
  scooter: "scooter",
};

/** La silueta de un vehículo visto desde arriba, en su color (V2). */
export function Silueta({ color, etiqueta }: { color: string; etiqueta: string }) {
  return (
    <svg viewBox="0 0 60 120" width="56" height="112" role="img" aria-label={etiqueta}>
      <rect x="8" y="4" width="44" height="112" rx="14" fill={color} />
      <rect x="13" y="26" width="34" height="20" rx="5" fill="#0B0C0F" opacity="0.55" />
      <rect x="13" y="50" width="34" height="34" rx="4" fill="#0B0C0F" opacity="0.18" />
      <rect x="13" y="88" width="34" height="14" rx="4" fill="#0B0C0F" opacity="0.45" />
    </svg>
  );
}

/** La tarjeta de un vehículo: su silueta, quién es y lo que falta como acción («+ Agregar masa»). */
function TarjetaVehiculo({
  v,
  editable,
  onMasa,
}: {
  v: Expediente["vehiculos"][number];
  editable: boolean;
  onMasa: (kg: number) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [kg, setKg] = useState("");
  const color = colorDeVehiculo(v.id);
  const nombre = [v.marca?.valor, v.modelo?.valor].filter(Boolean).join(" ") || "Sin marca";
  const detalle = [v.anio, v.clase ? (NOMBRE_CLASE[v.clase] ?? v.clase) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <article
      className="tarjeta flex items-center gap-4 p-5"
      style={{
        background: `linear-gradient(160deg, color-mix(in srgb, ${color} 10%, transparent), transparent 60%), var(--superficie)`,
      }}
      data-testid={`tarjeta-${v.id}`}
    >
      <Silueta color={color} etiqueta={`${v.id} visto desde arriba`} />
      <div className="flex min-w-0 flex-col gap-2">
        <span
          className="self-start rounded-full px-2.5 text-[0.75rem] leading-6 font-semibold text-[#0B0C0F]"
          style={{ background: color }}
        >
          {v.id}
        </span>
        <span className="t-subtitulo">{nombre}</span>
        {detalle ? <span className="t-nota">{detalle}</span> : null}
        {v.masa ? (
          <span className="t-nota cifras">
            {v.masa.valor.toLocaleString("es-MX")} {v.masa.unidad} <Fuente f={v.masa.fuente} />
          </span>
        ) : !editable ? null : abierta ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(kg.replace(",", "."));
              if (n > 0) onMasa(n);
            }}
          >
            <input
              className="campo h-9 w-24"
              inputMode="decimal"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              aria-label={`Masa de ${v.id} en kilogramos`}
              data-testid={`masa-${v.id}`}
            />
            <span className="t-nota">kg</span>
            <button type="submit" className="boton-secundario boton-compacto">
              Usar
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="solo-trabajar self-start rounded-control border border-dashed border-linea px-3 py-1.5 text-[0.8125rem] font-medium"
            onClick={() => setAbierta(true)}
            data-testid={`agregar-masa-${v.id}`}
          >
            + Agregar masa
          </button>
        )}
      </div>
    </article>
  );
}

/** El anillo de avance: lo que ya está y lo que falta (V2). */
function AnilloAvance({ items }: { items: { nombre: string; listo: boolean }[] }) {
  const k = items.filter((i) => i.listo).length;
  const n = items.length;
  const c = 2 * Math.PI * 26;
  return (
    <section
      className="tarjeta flex flex-wrap items-center gap-6 p-5"
      aria-label="Lo que ya tenemos"
      data-testid="avance-caso"
      data-avance={`${k}/${n}`}
    >
      <svg viewBox="0 0 64 64" width="64" height="64" role="img" aria-label={`${k} de ${n} listos`}>
        <circle cx="32" cy="32" r="26" fill="none" stroke="var(--linea)" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke="var(--texto)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(c * k) / Math.max(1, n)} ${c}`}
          transform="rotate(-90 32 32)"
        />
        <text
          x="32"
          y="37"
          textAnchor="middle"
          fill="var(--texto)"
          fontSize="15"
          fontWeight="600"
          fontFamily="var(--font-geist-mono), monospace"
        >
          {k}/{n}
        </text>
      </svg>
      <ul className="grid min-w-[260px] flex-1 grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2">
        {items.map((i) => (
          <li
            key={i.nombre}
            className={`t-interfaz flex items-center gap-2.5 ${i.listo ? "" : "text-texto-2"}`}
          >
            {i.listo ? (
              <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[var(--ok)] text-[0.75rem] font-bold text-[#0B0C0F]">
                ✓
              </span>
            ) : (
              <span className="h-[22px] w-[22px] rounded-full border-[1.5px] border-dashed border-linea" />
            )}
            {i.nombre}
          </li>
        ))}
      </ul>
    </section>
  );
}

const NUMERO = ["Ningún", "Un", "Dos", "Tres", "Cuatro", "Cinco", "Seis"];
/** «Dos vehículos, un choque.» */
function enPalabras(e: Expediente): string {
  const v = e.vehiculos.length;
  const i = e.impactos?.length ?? 0;
  const nv = NUMERO[v] ?? String(v);
  const ni =
    i === 0
      ? "sin choque descrito"
      : i === 1
        ? "un choque"
        : `${(NUMERO[i] ?? String(i)).toLowerCase()} choques`;
  return `${nv} vehículo${v === 1 ? "" : "s"}, ${ni}.`;
}

/** Paso 1: el caso (V2). Quiénes participaron, lo que ya está y lo que falta. */
export function PasoCaso({
  titulo,
  etiqueta,
  detalle,
  escena,
  reporte,
  inicio,
  editable,
  onExpediente,
  avance,
  extra,
}: {
  titulo: string;
  /** Lo que es el caso, en una etiqueta («Reporte de CESVI · alcance»). */
  etiqueta: string;
  detalle: string;
  escena: EscenaNarrada | null;
  reporte: ReporteCesvi | null;
  /** Lo que se hace antes de tener escena: narrar, abrir un archivo o cargar el reporte. */
  inicio?: ReactNode;
  editable: boolean;
  onExpediente: (e: Expediente) => void;
  avance: { nombre: string; listo: boolean }[];
  /** Lo que solo trae un caso (AXA: los datos de su expediente), en «Ver detalle». */
  extra?: ReactNode;
}) {
  const e = escena?.expediente;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <span className="t-nota self-start rounded-control bg-superficie-alta px-2.5 py-1">
          {etiqueta}
        </span>
        <h2 className="t-titulo" data-testid="titulo-caso">
          {titulo}
        </h2>
        <p className="t-cuerpo max-w-[640px] text-texto-2">
          {e
            ? `${enPalabras(e)} Revisa quiénes participaron y completa lo que falta antes de reconstruir.`
            : detalle}
        </p>
      </div>
      {inicio}
      {e ? (
        <section aria-label="Vehículos" className="grid gap-4 sm:grid-cols-2">
          {e.vehiculos.map((v) => (
            <TarjetaVehiculo
              key={v.id}
              v={v}
              editable={editable}
              onMasa={(kg) => onExpediente(conMasa(e, v.id, kg))}
            />
          ))}
        </section>
      ) : null}
      <AnilloAvance items={avance} />
      {escena ? (
        <details className="t-nota">
          <summary className="cursor-pointer" data-testid="ver-detalle-caso">
            Ver detalle
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            <p>{detalle}</p>
            {reporte ? (
              <p data-testid="caso-con-reporte">
                Tiene el reporte de CESVI ({reporte.nombre}): el paso «Croquis contra el reporte de
                CESVI» compara la reconstrucción con lo que concluyó.
              </p>
            ) : null}
            <ResumenEscena escena={escena} />
            {extra}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Debajo de la narración (A2): cuántos caracteres van y lo que Croquis reconoce sin IA, para que el
 * perito sepa antes de leer si su texto trae lo que la reconstrucción necesita.
 */
function LoQueSeVe({ narracion }: { narracion: string }) {
  const n = narracion.trim().length;
  const piezas = n >= MIN_NARRACION ? piezasDetectadas(detectarEnNarracion(narracion)) : [];
  return (
    <div className="flex flex-col gap-1.5">
      <span
        id="conteo-narracion"
        className={`t-nota cifras ${n < MIN_NARRACION ? "" : "text-texto-3"}`}
        aria-live="polite"
        data-testid="conteo-narracion"
      >
        {textoConteo(n)}
      </span>
      {piezas.length ? (
        <p className="t-nota" data-testid="detectado-narracion">
          Croquis ve sin IA: {piezas.join(" · ")}.
        </p>
      ) : n >= MIN_NARRACION ? (
        <p className="t-nota text-texto-3" data-testid="detectado-narracion">
          Croquis aún no ve vehículos, lugar ni medidas en el texto.
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
  onIrAlMapa,
  onCargarReporte,
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
  onIrAlMapa?: (vehiculo: string) => void;
  /** Si lo pegado es un reporte completo de CESVI, cargarlo como reporte (A3). */
  onCargarReporte?: () => void;
}) {
  const esReporte = editable && !!onCargarReporte && pareceReporteCompleto(narracion);
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
            maxLength={MAX_NARRACION}
            onChange={(e) => onNarracion(e.target.value)}
            aria-label="Narración técnica del perito"
            aria-describedby="conteo-narracion"
            data-testid="narracion"
          />
          <LoQueSeVe narracion={narracion} />
          {esReporte ? (
            <div className="hundido flex flex-col gap-2 p-4" data-testid="parece-reporte">
              <p className="t-nota">
                Esto parece un reporte completo de CESVI, con su análisis y sus conclusiones.
                Cárgalo como reporte: Croquis separa la narración de lo que concluyó CESVI y después
                los compara.
              </p>
              <button
                type="button"
                className="boton-principal self-start"
                onClick={onCargarReporte}
                data-testid="cargar-como-reporte"
              >
                Cargarlo como reporte
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="boton-principal"
              onClick={onLeer}
              disabled={narracion.trim().length < MIN_NARRACION}
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
                  onIrAlMapa={onIrAlMapa}
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

/** Un elemento que se coloca en el mapa en el paso del lugar (V2). */
export type ItemLugar =
  { tipo: "impacto"; orden: number } | { tipo: "final" | "inicial"; vehiculo: string };

export const claveItem = (i: ItemLugar) =>
  i.tipo === "impacto" ? `impacto:${i.orden}` : `${i.tipo}:${i.vehiculo}`;

/** Paso 6: los números. Las velocidades de la reconstrucción y la verificación con el método de CESVI. */
export function PasoNumeros({
  r,
  verificacion,
  contraCesvi = null,
}: {
  r: Reconstruccion | null;
  verificacion: VerificacionVehiculo[];
  contraCesvi?: ContraMetodosCesvi | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="t-subtitulo">Los números</h2>
      {r ? (
        <TablaVelocidades r={r} />
      ) : (
        <p className="t-nota">Reconstruye para ver las velocidades con su rango.</p>
      )}
      {contraCesvi?.filas.length ? <TablaContraCesvi contra={contraCesvi} /> : null}
      {r ? <ProbarConductores r={r} /> : null}
      <PanelVerificacion verificacion={verificacion} />
    </div>
  );
}

/**
 * El detalle de «Contra CESVI»: las velocidades por deformación de CESVI y de Croquis (toda
 * diferencia con su valor y su porcentaje) y lo que concluyó el reporte, con sus citas.
 */
export function DetalleContraReporte({
  reporte,
  comparacion,
}: {
  reporte: ReporteCesvi;
  comparacion: ComparacionDictamen;
}) {
  const k = comparacion;
  return (
    <div className="flex flex-col gap-5">
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
