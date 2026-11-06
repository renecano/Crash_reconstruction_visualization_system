"use client";
/**
 * El hecho (rediseño «Laboratorio», prompt §8): el título generado del relato y su meta, el relato
 * con lo que Croquis leyó marcado por estilo, y la hoja «Lo que Croquis leyó» con cada vehículo (su
 * vista superior con el daño pintado y su masa con su origen) y la vía. Pasar el puntero por una
 * mención de un vehículo ilumina su tarjeta, y al revés. Sin mapa en este acto.
 */
import {
  supuestosDeclarados,
  type EscenaNarrada,
  type Expediente,
  type PreguntaEscena,
} from "@croquis/cesvi";
import { useMemo, useState } from "react";
import { siluetaClase } from "@/lib/colocar";
import { marcarRelato, metaDelHecho, textoDano, tituloDelHecho } from "@/lib/hecho-laboratorio";
import { ResumenEscena } from "./pasos";
import { Pregunta } from "./piezas";

const ETIQUETA_FUENTE: Record<string, string> = {
  supuesto: "supuesto",
  dictamen_importado: "del reporte",
  expediente: "del reporte",
  perito: "del perito",
};

const CAMPO_LUGAR: Record<string, string> = {
  modalidad: "modalidad",
  fecha_hora: "fecha y hora",
  lugar: "lugar",
  municipio: "municipio",
  via: "la vía",
  sentido: "sentido",
  carril: "carril",
  restos: "restos",
  huella: "huella",
  posicion_final: "posición final",
};

const letra = (k: number) => String.fromCharCode(65 + k);

export function HechoLaboratorio({
  escena,
  narracion,
  editable,
  preguntas,
  onExpediente,
  onNoSe,
  onIrAlMapa,
  onEditar,
}: {
  escena: EscenaNarrada;
  narracion: string;
  editable: boolean;
  preguntas: PreguntaEscena[];
  onExpediente: (e: Expediente) => void;
  onNoSe: (clave: string) => void;
  onIrAlMapa?: (vehiculo: string) => void;
  onEditar: () => void;
}) {
  const e = escena.expediente;
  const [activo, setActivo] = useState<string | null>(null);
  const relato = useMemo(
    () =>
      marcarRelato(
        narracion,
        escena.lectura ?? [],
        e.vehiculos.map((v) => ({ id: v.id, nombres: [v.modelo?.valor ?? ""] })),
      ),
    [narracion, escena.lectura, e.vehiculos],
  );
  const supuestos = useMemo(() => supuestosDeclarados(e), [e]);
  // Lo leído del lugar y la vía, sin repetir y sin valores vacíos («restos» como valor de «restos»).
  const lugar = (escena.lectura ?? [])
    .filter((d) => d.tipo === "lugar" && d.valor.trim() && d.valor !== d.campo)
    .filter((d, k, xs) => xs.findIndex((x) => x.valor === d.valor) === k)
    .slice(0, 4);
  const titulo = tituloDelHecho(e, narracion);
  const meta = metaDelHecho(e, narracion);
  const marca = (v: string | null) => ({
    onMouseEnter: () => setActivo(v),
    onMouseLeave: () => setActivo(null),
    onFocus: () => setActivo(v),
    onBlur: () => setActivo(null),
  });

  return (
    <div
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]"
      data-testid="hecho-laboratorio"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <h2
          className="font-[family-name:var(--fuente-titulo)] text-[clamp(2.2rem,4.2vw,4rem)] leading-[1.02] font-normal tracking-[-0.035em]"
          data-testid="titulo-hecho"
        >
          {titulo}
        </h2>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[0.95rem] text-texto-2">
          {meta.map((m, k) => (
            <span key={k} className="flex gap-3">
              {k > 0 ? <span aria-hidden="true">·</span> : null}
              {m}
            </span>
          ))}
        </p>
        <p
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.8125rem]"
          data-testid="leyenda-relato"
        >
          <b className="text-texto" data-testid="datos-leidos">
            {relato.datos} {relato.datos === 1 ? "dato leído" : "datos leídos"}
          </b>
          <span className="flex items-center gap-1.5 text-texto-2">
            <span className="relato-insignia" aria-hidden="true">
              A
            </span>
            vehículos
          </span>
          <span className="relato-dano text-texto-2">daños</span>
          <span className="relato-lugar text-texto-2">lugar y vía</span>
          <span className="relato-medida text-texto-2">medidas</span>
        </p>
        <p className="relato text-[1.2rem] leading-[1.85] text-texto-2" data-testid="relato">
          {relato.tramos.map((t, k) => {
            if (!t.tipo) return <span key={k}>{t.texto}</span>;
            const indice = t.vehiculo ? e.vehiculos.findIndex((v) => v.id === t.vehiculo) : -1;
            const siguiente = relato.tramos[k + 1];
            const insignia =
              t.tipo === "vehiculo" && indice >= 0 && siguiente?.vehiculo !== t.vehiculo;
            return (
              <span
                key={k}
                className={`relato-${t.tipo}`}
                data-activo={t.vehiculo && activo === t.vehiculo ? "si" : undefined}
                {...(t.vehiculo ? { ...marca(t.vehiculo), tabIndex: 0 } : {})}
                data-vehiculo={t.vehiculo ?? undefined}
              >
                {t.texto}
                {insignia ? (
                  <span className="relato-insignia ml-1" aria-hidden="true">
                    {letra(indice)}
                  </span>
                ) : null}
              </span>
            );
          })}
        </p>
        <details className="t-nota" data-testid="detalle-leido">
          <summary className="min-h-11 cursor-pointer content-center">
            Ver lo leído en detalle
          </summary>
          <div className="mt-3">
            <ResumenEscena escena={escena} />
          </div>
        </details>
        {editable ? (
          <div className="solo-trabajar mt-auto flex flex-wrap gap-3 pt-4">
            <button
              type="button"
              className="boton-secundario"
              onClick={onEditar}
              data-testid="editar-relato"
            >
              Editar el relato
            </button>
          </div>
        ) : null}
      </div>

      <aside
        className="escena-hoja flex flex-col gap-1 self-start p-6"
        aria-label="Lo que Croquis leyó"
      >
        <span className="t-nota mb-2">Lo que Croquis leyó</span>
        {e.vehiculos.map((v, k) => {
          const s = supuestos.find((x) => x.clave === `masa-${v.id}`);
          const nombre = [v.marca?.valor, v.modelo?.valor].filter(Boolean).join(" ");
          const fuente = v.masa?.fuente ?? "";
          return (
            <section
              key={v.id}
              className="flex gap-4 rounded-2xl p-3 transition-colors data-[activo=si]:bg-superficie-alta"
              data-activo={activo === v.id ? "si" : "no"}
              data-testid={`tarjeta-${v.id}`}
              {...marca(v.id)}
              tabIndex={0}
            >
              <VistaSuperior e={e} vehiculo={v.id} clase={v.clase} />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-2 text-[0.8125rem] text-texto-3">
                  <span className="relato-insignia" aria-hidden="true">
                    {letra(k)}
                  </span>
                  Vehículo {letra(k)}
                </span>
                <span className="text-[1.15rem] font-semibold">
                  {nombre || `Vehículo ${letra(k)}`}
                  {v.anio ? ` · ${v.anio}` : ""}
                </span>
                {v.masa ? (
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="cifra-protagonista font-[family-name:var(--fuente-titulo)] text-[2.4rem] leading-none">
                      {v.masa.valor.toLocaleString("es-MX", { maximumFractionDigits: 3 })}
                    </span>
                    <span className="text-texto-3">{v.masa.unidad}</span>
                    <span
                      className={
                        fuente === "supuesto"
                          ? "escena-supuesto"
                          : "rounded-full bg-superficie-alta px-2 py-0.5 text-[0.75rem] font-semibold"
                      }
                      data-fuente={fuente}
                    >
                      {ETIQUETA_FUENTE[fuente] ?? fuente}
                    </span>
                  </span>
                ) : (
                  <span className="t-nota">Masa: sin dato</span>
                )}
                {s ? <span className="t-nota">{s.justificacion.split(/[:;]/)[0]}</span> : null}
                {textoDano(e, v.id) ? (
                  <span className="text-[0.9rem]">{textoDano(e, v.id)}</span>
                ) : null}
              </div>
            </section>
          );
        })}
        {lugar.length ? (
          <dl
            className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-linea-suave pt-4"
            data-testid="lugar-leido"
          >
            {lugar.map((d, k) => (
              <div key={k} className="flex flex-col">
                <dd className="text-[0.95rem]">{d.valor}</dd>
                <dt className="text-[0.75rem] text-texto-3">
                  {CAMPO_LUGAR[d.campo] ?? d.campo.replaceAll("_", " ")}
                </dt>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="solo-trabajar mt-4 flex flex-col gap-3 border-t border-linea-suave pt-4">
          {preguntas.length ? (
            <>
              <span className="t-interfaz font-semibold">Lo que más cambia la reconstrucción</span>
              <ol className="flex flex-col gap-3">
                {preguntas.map((p) => (
                  <Pregunta
                    key={p.clave}
                    p={p}
                    expediente={e}
                    onCambio={onExpediente}
                    onNoSe={() => onNoSe(p.clave)}
                    onIrAlMapa={onIrAlMapa}
                  />
                ))}
              </ol>
            </>
          ) : (
            <p className="t-nota" data-testid="sin-preguntas">
              Sin preguntas pendientes
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

/** El vehículo visto desde arriba (frente arriba), con la zona de su daño principal pintada. */
function VistaSuperior({
  e,
  vehiculo,
  clase,
}: {
  e: Expediente;
  vehiculo: string;
  clase?: string;
}) {
  const d = (e.danos ?? []).find((x) => x.vehiculo === vehiculo && !x.dano_previo);
  const cara = d?.zona.cara;
  const v = d?.zona.vertice ?? "";
  const izq = /izquierd/.test(v);
  const der = /derech/.test(v);
  // La zona en la caja de 1 × 1 (frente arriba): la franja de su cara, o la esquina de su vértice.
  const zona =
    cara === "frontal"
      ? { x: izq ? -0.5 : der ? 0 : -0.5, y: -0.5, w: izq || der ? 0.5 : 1, h: 0.2 }
      : cara === "posterior"
        ? { x: izq ? -0.5 : der ? 0 : -0.5, y: 0.3, w: izq || der ? 0.5 : 1, h: 0.2 }
        : cara === "lateral_izquierdo"
          ? { x: -0.5, y: -0.3, w: 0.22, h: 0.6 }
          : cara === "lateral_derecho"
            ? { x: 0.28, y: -0.3, w: 0.22, h: 0.6 }
            : null;
  return (
    <svg
      viewBox="-0.6 -0.6 1.2 1.2"
      width={52}
      height={92}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d={siluetaClase(clase ?? "sedan_mediano")}
        fill="var(--escena-vehiculo)"
        stroke="var(--texto-3)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x="-0.36"
        y="-0.27"
        width="0.72"
        height="0.13"
        rx="0.05"
        fill="var(--escena-vehiculo-detalle)"
      />
      {zona ? (
        <rect
          {...{ x: zona.x, y: zona.y, width: zona.w, height: zona.h }}
          fill="var(--senal)"
          fillOpacity={0.55}
        />
      ) : null}
    </svg>
  );
}
