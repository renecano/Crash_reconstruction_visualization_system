"use client";
/**
 * Los daños del acto de Análisis (rediseño «Laboratorio», prompt §8): por vehículo, el perfil de
 * deformación dibujado sobre la cara dañada con las C reales, la energía y el Δv con su método, la
 * correspondencia del método de CESVI y, a un lado, los supuestos con su rango. Lo que el reporte no
 * trae dice «sin dato» con su motivo; nunca un cero.
 */
import {
  especReconstruida,
  type ClaveCriterio,
  type CriterioMarcado,
  type Expediente,
  type Reconstruccion,
  type SupuestoDeclarado,
} from "@croquis/cesvi";
import type { EscenaSpec } from "@croquis/scene-schema";
import { useEffect, useState } from "react";
import {
  barraDeRango,
  contadorCriterios,
  perfilDeformacion,
  supuestosParaTarjetas,
} from "@/lib/analisis-lab";
import { filasDano, type FilaDano } from "@/lib/danos-caso";
import { reconstruirEnNavegador } from "@/lib/reconstruct-client";
import { METODO } from "@/lib/textos-caso";
import { Criterios } from "../correspondencia";
import { Crece, Cuenta, Traza } from "../movimiento";
import { CARA } from "./piezas";

const CARA_TITULO: Record<string, string> = {
  frontal: "cara frontal",
  posterior: "cara posterior",
  lateral_izquierdo: "costado izquierdo",
  lateral_derecho: "costado derecho",
};

/** El perfil sobre la cara dañada. Es una gráfica de las C, no un dibujo a escala. */
function PerfilSobreLaCara({ cCm, cara }: { cCm: readonly number[]; cara: string }) {
  const CARA_X = { x0: 70, ancho: 580, base: 176, alto: 136 };
  const { d, puntos } = perfilDeformacion(cCm, CARA_X);
  return (
    <svg
      viewBox="0 0 720 250"
      className="w-full"
      role="img"
      aria-label={`Perfil de deformación medido: ${puntos.map((p) => `${p.nombre} ${p.cm} centímetros`).join(", ")}`}
      data-testid="perfil-deformacion"
    >
      <rect
        x={70}
        y={14}
        width={580}
        height={162}
        rx={26}
        fill="var(--fondo)"
        stroke="var(--linea-suave)"
      />
      <rect
        x={120}
        y={36}
        width={200}
        height={70}
        rx={12}
        fill="var(--superficie)"
        stroke="var(--linea)"
      />
      <rect x={370} y={36} width={230} height={70} rx={12} fill="var(--superficie-alta)" />
      <Traza>
        <path d={d} fill="var(--senal)" />
      </Traza>
      <line x1={70} y1={176} x2={650} y2={176} stroke="var(--texto-3)" strokeDasharray="4 4" />
      {puntos.map((p) => (
        <g key={p.nombre} tabIndex={0} data-tip={`${p.nombre}: ${p.cm} cm, ${cara}`}>
          <line x1={p.x} y1={176} x2={p.x} y2={206} stroke="var(--texto-2)" />
          <text
            x={p.x}
            y={222}
            textAnchor="middle"
            fontSize={12}
            fill="var(--texto-2)"
            fontFamily="var(--fuente-mono)"
          >
            {p.nombre}
          </text>
          <text
            x={p.x}
            y={238}
            textAnchor="middle"
            fontSize={12}
            fill="var(--texto)"
            fontFamily="var(--fuente-mono)"
          >
            {p.cm} cm
          </text>
        </g>
      ))}
    </svg>
  );
}

function Cifra({ valor, unidad, etiqueta }: { valor: number; unidad: string; etiqueta: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-baseline gap-2">
        <Cuenta
          valor={valor}
          decimales={1}
          className="cifra-protagonista font-[family-name:var(--fuente-titulo)] text-[3rem] leading-none"
        />
        <span className="text-texto-2">{unidad}</span>
      </span>
      <span className="t-nota">{etiqueta}</span>
    </div>
  );
}

function TarjetaDano({
  e,
  v,
  letra,
  f,
  r,
  calculando,
  oculta,
}: {
  e: Expediente;
  v: string;
  letra: string;
  f: FilaDano;
  r: Reconstruccion | null;
  calculando: boolean;
  oculta: boolean;
}) {
  const narrados = (e.danos ?? []).filter((d) => d.vehiculo === v);
  const principal = narrados.find((d) => !d.dano_previo);
  const cara = principal
    ? (CARA_TITULO[principal.zona.cara] ?? principal.zona.cara)
    : "sin cara dañada";
  const c = f.calculado;
  const medido = f.medido.tipo === "medido" ? f.medido : null;
  return (
    <section
      className="escena-hoja flex flex-col gap-4 p-7"
      hidden={oculta}
      role="tabpanel"
      aria-label={`Daños de ${letra}`}
      data-testid={`dano-${v}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[1.1rem] font-semibold">
          {letra} · {cara}
        </h3>
        <span className="t-nota">
          {medido
            ? `medidas del reporte · perfil C1–C${medido.cCm.length}`
            : "el reporte no trae medidas de la deformación"}
        </span>
      </header>
      {medido ? <PerfilSobreLaCara cCm={medido.cCm} cara={`de la ${cara}`} /> : null}
      <div className="grid gap-5 border-t border-linea-suave pt-4 md:grid-cols-2">
        <div className="flex flex-col gap-2" data-testid={`dano-calculado-${v}`}>
          {r && c.tipo === "calculado" ? (
            <>
              <div className="flex flex-wrap gap-8">
                <Cifra valor={c.energiaKj} unidad="kJ" etiqueta="energía de deformación" />
                {c.deltaVKmh !== null ? (
                  <Cifra valor={c.deltaVKmh} unidad="km/h" etiqueta="cambio de velocidad (Δv)" />
                ) : null}
              </div>
              <p className="t-nota">
                {METODO.reconstruccion}, con las velocidades reconstruidas; perfil estimado{" "}
                <span className="cifras">{c.perfilCm.join(" · ")} cm</span> ({c.rigidez})
                {medido ? "; no es la medida del reporte" : ""}.
              </p>
            </>
          ) : !r ? (
            <p className="t-nota">Reconstruye para ver el daño que calcula Croquis.</p>
          ) : calculando ? (
            <p className="t-nota text-texto-3">Calculando la energía y el Δv…</p>
          ) : (
            <p className="t-nota text-texto-3">
              Energía y Δv: sin dato ({c.tipo === "sin_dato" ? c.motivo : ""}).
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <p className="t-nota">
            {narrados.length
              ? `Narrados: ${narrados
                  .map(
                    (d) =>
                      `${CARA[d.zona.cara] ?? d.zona.cara}${d.zona.tercio ? ` (${d.zona.tercio})` : ""}${d.magnitud?.cualitativa ? `, ${d.magnitud.cualitativa}` : ""}${d.dano_previo ? ", daño previo" : ""}`,
                  )
                  .join("; ")}.`
              : "La narración no describe sus daños."}
          </p>
          <p className="t-nota" data-testid={`dano-medido-${v}`}>
            Del reporte:{" "}
            {medido ? (
              <>
                {medido.cara}; C1–C{medido.cCm.length}{" "}
                <span className="cifras">{medido.cCm.join(" · ")} cm</span>
                {medido.lM !== null ? (
                  <>
                    ; L <span className="cifras">{medido.lM.toFixed(2)} m</span>
                  </>
                ) : null}
                .
              </>
            ) : f.medido.tipo === "sin_dato" ? (
              <span className="text-texto-3">sin dato ({f.medido.motivo}).</span>
            ) : null}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Un supuesto con su rango: la trama ámbar es lo que abarca y la marca, el valor que se usó. */
function TarjetaSupuesto({ s }: { s: SupuestoDeclarado }) {
  const b = s.rango ? barraDeRango(s.rango.min, s.rango.max, s.rango.valor) : null;
  return (
    <article
      className="escena-hoja tarjeta-supuesto flex flex-col gap-2 p-5"
      data-clave={s.clave}
      data-testid={`supuesto-${s.clave}`}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h4 className="font-semibold">{s.que}</h4>
        <span className="cifras shrink-0 text-right text-[0.9375rem]">{s.corto ?? s.valor}</span>
      </header>
      {b && s.rango ? (
        <div>
          <div className="relative h-2 rounded-full bg-superficie-alta" aria-hidden="true">
            <Crece
              eje="x"
              origen={`${((b.marca - b.izq) / b.ancho) * 100}% 50%`}
              className="rango-supuesto absolute inset-y-0 rounded-full"
              style={{ left: `${b.izq}%`, width: `${b.ancho}%` }}
            />
            <span
              className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 bg-texto"
              style={{ left: `${b.marca}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[0.6875rem] text-texto-3">
            <span>{s.rango.minTexto}</span>
            <span>{s.rango.maxTexto}</span>
          </div>
        </div>
      ) : null}
      {/* W4b: a primera vista, el valor y su rango; el porqué, plegado. */}
      <details data-testid={`por-que-${s.clave}`}>
        <summary className="t-nota cursor-pointer font-medium text-texto">Por qué</summary>
        <p className="t-nota pt-1">{s.justificacion.replace(" (data/SOURCES.md)", "")}</p>
        <p className="t-nota pt-1 text-texto-3">{s.incertidumbre}</p>
      </details>
    </article>
  );
}

export function ActoDanos({
  expediente,
  r,
  supuestos,
  criterios,
  onCriterio,
  letraDe,
  nombreDe,
}: {
  expediente: Expediente;
  r: Reconstruccion | null;
  supuestos: readonly SupuestoDeclarado[];
  /** La correspondencia del método de CESVI, por letra; null si el caso no la lleva. */
  criterios: Record<"A" | "B", Record<ClaveCriterio, CriterioMarcado>> | null;
  onCriterio: (letra: "A" | "B", clave: ClaveCriterio, v: CriterioMarcado) => void;
  letraDe: (id: string) => string;
  /** «A · Silverado 2500». */
  nombreDe: (id: string) => string;
}) {
  const [activo, setActivo] = useState(expediente.vehiculos[0]?.id ?? "");
  // El resultado del solver con las velocidades reconstruidas (el del 3D), calculado en el worker:
  // el de partida va con las velocidades supuestas de la narración y en AXA no tenía choque, así
  // que el daño salía en 0 (René, 2026-11-04, prompt del rediseño §0.1).
  const [ajustado, setAjustado] = useState<{
    r: Reconstruccion;
    res: Record<string, unknown>;
  } | null>(null);
  useEffect(() => {
    if (!r || ajustado?.r === r) return undefined;
    let vivo = true;
    void reconstruirEnNavegador(especReconstruida(r) as unknown as EscenaSpec, r.relieve)
      .then((res) => {
        if (vivo) setAjustado({ r, res: res as unknown as Record<string, unknown> });
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [r, ajustado]);
  const filas = r
    ? filasDano(expediente, ajustado?.r === r ? ajustado.res : null, r.ids)
    : filasDano(expediente, null, {});
  const letraActiva = letraDe(activo);
  const marcas =
    criterios && (letraActiva === "A" || letraActiva === "B") ? criterios[letraActiva] : null;
  const tarjetas = supuestosParaTarjetas(supuestos, letraDe);
  return (
    <div
      className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(320px,430px)]"
      data-testid="danos-caso"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-[family-name:var(--fuente-titulo)] text-[3.75rem] leading-none font-normal tracking-[-0.03em]">
            Daños
          </h2>
          <div className="segmentado segmentado-tinta" role="tablist" aria-label="Vehículo">
            {expediente.vehiculos.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={activo === v.id}
                className="px-4 whitespace-nowrap"
                onClick={() => setActivo(v.id)}
                data-testid={`pestana-dano-${v.id}`}
              >
                {nombreDe(v.id)}
              </button>
            ))}
          </div>
        </header>
        {expediente.vehiculos.map((v) => (
          <TarjetaDano
            key={v.id}
            e={expediente}
            v={v.id}
            letra={letraDe(v.id)}
            f={filas.find((x) => x.vehiculo === v.id)!}
            r={r}
            calculando={ajustado?.r !== r}
            oculta={activo !== v.id}
          />
        ))}
        {marcas ? (
          <section className="escena-hoja flex flex-col gap-3 p-7" data-testid="criterios-axa">
            <header className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-[1.1rem] font-semibold">Correspondencia · método de CESVI</h3>
              <span className="t-nota" data-testid="contador-criterios">
                {contadorCriterios(marcas)}
              </span>
            </header>
            <Criterios
              key={letraActiva}
              letra={letraActiva as "A" | "B"}
              valores={marcas}
              onCambio={(clave, c) => onCriterio(letraActiva as "A" | "B", clave, c)}
            />
          </section>
        ) : null}
      </div>
      {tarjetas.length ? (
        <aside className="flex min-w-0 flex-col gap-3" data-testid="supuestos">
          <header className="flex items-baseline justify-between gap-3">
            <h2 className="font-[family-name:var(--fuente-titulo)] text-[2.5rem] leading-none font-normal tracking-[-0.03em]">
              Supuestos
            </h2>
            <span className="t-nota">ya dentro del rango</span>
          </header>
          {tarjetas.map((s) => (
            <TarjetaSupuesto key={s.clave} s={s} />
          ))}
        </aside>
      ) : null}
    </div>
  );
}
