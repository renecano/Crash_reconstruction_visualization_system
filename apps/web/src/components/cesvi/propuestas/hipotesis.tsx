"use client";
/**
 * PROTOTIPO (ronda 4, punto 8; René, 2026-11-18): tres propuestas de dónde y cómo se ven las
 * versiones del caso —la declaración de un conductor y las hipótesis del perito («¿y si…?»)— para
 * que René elija antes de construir. No es parte del flujo: es una página aparte
 * (`/cesvi/propuestas/hipotesis?p=1|2|3&v=declaracion|hipotesis`) con los componentes reales y los
 * números calculados aquí mismo sobre el caso de ejemplo (el crucero), con su declaración grabada.
 * Lo que René elija se construye en el flujo y esta página se borra.
 */
import {
  compararDeclarada,
  conPosicion,
  escenaDeNarracion,
  especConConductor,
  especDeclarada,
  especDeExpediente,
  formato as F,
  interpretarResultado,
  leerPruebaConductores,
  versionDeclarada,
  type Expediente,
  type FilaDeclarada,
  type HipotesisConductor,
  type PruebaConductores,
  type Reconstruccion,
  type SalidaCorpus,
} from "@croquis/cesvi";
import type { EscenaSpec } from "@croquis/scene-schema";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MaquetaCaso } from "@/components/cesvi/escena/maqueta-caso";
import { BarraRecorrido } from "@/components/cesvi/recorrido/barra";
import { EnRanura, MarcoVista } from "@/components/visor-unity/marco-vista";
import type { ActoDelCaso } from "@/lib/actos";
import { nombreVehiculo } from "@/lib/escena-facil";
import type { ResultadoMaqueta } from "@/lib/maqueta";
import {
  probarConductoresEnNavegador,
  reconstruirCompletoEnNavegador,
} from "@/lib/reconstruct-client";
import { textoParaClaude } from "@/lib/redaccion";
import crucero from "../../../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json";
import declaracion from "../../../../../../data/cesvi/grabaciones/declaracion/declaracion-e2e.json";

type Id = Expediente["vehiculos"][number]["id"];
type Json = Record<string, unknown>;

/** Un punto a `norte` y `este` metros de un origen fijo (la colocación de las pruebas del crucero). */
const P = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});

interface Datos {
  expediente: Expediente;
  r: Reconstruccion;
  /** La versión declarada, simulada con la misma física. */
  rDeclarada: Reconstruccion;
  resultadoDeclarado: ResultadoMaqueta;
  filas: FilaDeclarada[];
  hipotesis: HipotesisConductor;
  prueba: PruebaConductores | null;
}

async function calcular(): Promise<Datos> {
  const g = crucero as unknown as { salida: SalidaCorpus; narracion: string };
  let e = escenaDeNarracion(g.salida, g.narracion).expediente;
  e = conPosicion(e, { vehiculo: "V1", fase: "impacto", punto: m(-2, 0), rumbo: 0 });
  e = conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(0, 2), rumbo: 90 });
  e = conPosicion(e, { vehiculo: "V1", fase: "final", punto: m(4, 5), rumbo: 30 });
  e = conPosicion(e, { vehiculo: "V2", fase: "final", punto: m(3, 9), rumbo: 80 });
  const base = especDeExpediente(e);
  const res = await reconstruirCompletoEnNavegador(base.spec as unknown as EscenaSpec);
  const r = interpretarResultado(base, res as unknown as Json);
  const ids = e.vehiculos.map((v) => v.id);
  const d = declaracion as unknown as { declaracion: string; salida: SalidaCorpus };
  const v = versionDeclarada(d.salida, textoParaClaude(d.declaracion), "V2", ids);
  const reconstruidas = new Map(
    r.velocidades.flatMap((x) => (x.previa ? [[x.vehiculo, x.previa.mejor]] : [])) as [
      Id,
      number,
    ][],
  );
  const decl = especDeclarada(especDeExpediente(e), v, reconstruidas);
  const resD = await reconstruirCompletoEnNavegador(decl.spec as unknown as EscenaSpec);
  const filas = compararDeclarada({
    expediente: e,
    reconstruccion: r,
    declarada: v,
    resultadoDeclarado: resD as unknown as Json,
  });
  const hipotesis: HipotesisConductor = {
    vehiculo: "V1",
    decision: "frenar",
    segundosAntes: 1.5,
    tiempoReaccionS: null,
  };
  const agentes = await probarConductoresEnNavegador(especConConductor(r, hipotesis)).catch(
    () => null,
  );
  return {
    expediente: e,
    r,
    rDeclarada: interpretarResultado(decl, resD as unknown as Json),
    resultadoDeclarado: resD as unknown as ResultadoMaqueta,
    filas,
    hipotesis,
    prueba: agentes ? leerPruebaConductores(r, agentes) : null,
  };
}

const TITULO = "font-[family-name:var(--fuente-titulo)] font-normal tracking-[-0.03em]";

// --- Piezas comunes ---------------------------------------------------------------------------------

const ESTADO: Record<FilaDeclarada["estado"], { texto: string; clase: string }> = {
  no_coincide: { texto: "No coincide", clase: "insignia insignia-senal" },
  coincide: { texto: "Coincide", clase: "insignia" },
  sin_dato: { texto: "Sin dato", clase: "insignia insignia-supuesto" },
};
const ORDEN = { no_coincide: 0, coincide: 1, sin_dato: 2 } as const;

/** Las diferencias con lo declarado, en el lenguaje del perito: por vehículo, primero lo que no coincide. */
function Diferencias({
  filas,
  nombres,
  declarante,
  compactas = 0,
  columnas = false,
}: {
  filas: FilaDeclarada[];
  nombres: Record<string, string>;
  declarante: Id;
  /** Si es > 0, solo esas filas (las que no coinciden primero). */
  compactas?: number;
  columnas?: boolean;
}) {
  const orden = [...filas].sort(
    (a, b) =>
      ORDEN[a.estado] - ORDEN[b.estado] ||
      Number(b.vehiculo === declarante) - Number(a.vehiculo === declarante),
  );
  const ver = compactas ? orden.slice(0, compactas) : orden;
  return (
    <ul
      className={columnas ? "grid gap-3 md:grid-cols-2 xl:grid-cols-4" : "flex flex-col gap-2"}
      data-testid="diferencias"
    >
      {ver.map((f) => (
        <li
          key={`${f.clave}-${f.vehiculo}`}
          className="hundido flex flex-col gap-1.5 rounded-control p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[0.8125rem] font-semibold">
              {f.concepto} · {nombres[f.vehiculo] ?? f.vehiculo}
            </span>
            <span className={ESTADO[f.estado].clase}>{ESTADO[f.estado].texto}</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[0.8125rem]">
            <dt className="text-texto-3">Declaró</dt>
            <dd className="cifras">{f.declarada}</dd>
            <dt className="text-texto-3">La evidencia</dt>
            <dd className="cifras">{f.evidencia}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function resumenDe(filas: FilaDeclarada[]) {
  const comparables = filas.filter((f) => f.estado !== "sin_dato");
  const no = comparables.filter((f) => f.estado === "no_coincide").length;
  return { comparables: comparables.length, no };
}

/** «¿Y si…?»: la hipótesis del perito sobre un conductor, con lo que da la simulación. */
function TarjetaHipotesis({
  h,
  prueba,
  nombres,
}: {
  h: HipotesisConductor;
  prueba: PruebaConductores | null;
  nombres: Record<string, string>;
}) {
  const fila = (c: PruebaConductores["conHipotesis"]) =>
    c.contacto
      ? `Hay contacto a ${F.kmhConUnidad(c.relativaKmh ?? 0, "reconstruccion")} de velocidad relativa`
      : `No hay contacto: quedan a ${F.metros(c.distanciaMinimaM ?? 0)} como mínimo`;
  return (
    <div
      className="hundido flex flex-col gap-2 rounded-control p-3"
      data-testid="tarjeta-hipotesis"
    >
      <p className="text-[0.875rem] font-semibold">
        Si el conductor de {nombres[h.vehiculo] ?? h.vehiculo} frena{" "}
        <span className="cifras">{F.fijo(h.segundosAntes, 1)} s</span> antes del impacto
      </p>
      {prueba ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.8125rem]">
          <dt className="text-texto-3">Con la hipótesis</dt>
          <dd>{fila(prueba.conHipotesis)}</dd>
          <dt className="text-texto-3">Sin ella</dt>
          <dd>{fila(prueba.sinHipotesis)}</dd>
        </dl>
      ) : (
        <p className="t-nota">La simulación de los conductores no respondió.</p>
      )}
      <p className="t-nota">
        Es una prueba ilustrativa de la física con esa decisión, no un juicio sobre ningún
        conductor.
      </p>
    </div>
  );
}

function Chip({ activo, children }: { activo: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      className={`boton-compacto ${activo ? "boton-principal" : "boton-secundario"}`}
    >
      {children}
    </button>
  );
}

/** El escenario: el 2D real en su marco, con la versión elegida punteada sobre la reconstrucción. */
function Escenario({
  d,
  nombres,
  conDeclarada,
  arriba,
}: {
  d: Datos;
  nombres: Record<string, string>;
  conDeclarada: boolean;
  arriba?: ReactNode;
}) {
  return (
    <MarcoVista conBarras className="min-h-0 flex-1" etiqueta="Escenario">
      <EnRanura ranura="vista">
        <div className="segmentado" role="tablist" aria-label="Vista">
          <button type="button" role="tab" aria-selected={false} className="px-5">
            3D
          </button>
          <button type="button" role="tab" aria-selected className="px-5">
            2D
          </button>
        </div>
      </EnRanura>
      {arriba ? <EnRanura ranura="izquierda">{arriba}</EnRanura> : null}
      <MaquetaCaso
        r={d.r}
        calles={null}
        nombres={nombres}
        // En el reposo: ahí se ve dónde habría quedado cada uno según lo declarado.
        tInicial={Number((d.r.resultado as { t_fin?: number }).t_fin ?? 0)}
        declarada={
          conDeclarada
            ? { etiqueta: "lo que declaró el conductor de B", resultado: d.resultadoDeclarado }
            : null
        }
      />
    </MarcoVista>
  );
}

// --- Las tres propuestas ----------------------------------------------------------------------------

type Version = "declaracion" | "hipotesis";

function ListaDeVersiones({
  d,
  nombres,
  version,
}: {
  d: Datos;
  nombres: Record<string, string>;
  version: Version;
}) {
  const s = resumenDe(d.filas);
  const item = (activo: boolean, titulo: string, detalle: string, tipo: string) => (
    <li
      className={`flex flex-col gap-0.5 rounded-control border p-3 ${activo ? "border-texto bg-superficie" : "border-linea-suave"}`}
      aria-current={activo}
    >
      <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-texto-3 uppercase">
        {tipo}
      </span>
      <span className="text-[0.9375rem] font-semibold">{titulo}</span>
      <span className="t-nota">{detalle}</span>
    </li>
  );
  return (
    <ul className="flex flex-col gap-2" data-testid="lista-versiones">
      {item(
        version === "declaracion",
        `Lo que declaró el conductor de ${nombres.V2}`,
        `${s.no} de ${s.comparables} puntos no coinciden con la evidencia`,
        "Declaración",
      )}
      {item(
        version === "hipotesis",
        `¿Y si el conductor de ${nombres.V1} frena 1.5 s antes?`,
        d.prueba
          ? d.prueba.conHipotesis.contacto
            ? "Con la hipótesis sigue habiendo contacto"
            : "Con la hipótesis no hay contacto"
          : "Sin resultado",
        "Hipótesis del perito",
      )}
    </ul>
  );
}

/** 1 · Un acto propio, «Versiones», entre Reconstrucción y Análisis. */
function PropuestaActo({ d, nombres, version }: Props) {
  return (
    <div className="flex min-h-0 flex-1 gap-4 p-4">
      <Escenario d={d} nombres={nombres} conDeclarada={version === "declaracion"} />
      <aside className="escena-hoja flex w-[456px] shrink-0 flex-col gap-4 overflow-y-auto p-7">
        <h2 className={`${TITULO} text-[2.25rem] leading-none`}>Versiones</h2>
        <p className="t-nota">
          Lo que dice cada quien, puesto a prueba con la misma física. Croquis no dice quién tiene
          razón.
        </p>
        <ListaDeVersiones d={d} nombres={nombres} version={version} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="boton-secundario boton-compacto">
            + Otra declaración
          </button>
          <button type="button" className="boton-secundario boton-compacto">
            + Otra hipótesis
          </button>
        </div>
        {version === "declaracion" ? (
          <>
            <h3 className="t-subtitulo">Qué cambia</h3>
            <Diferencias filas={d.filas} nombres={nombres} declarante="V2" />
          </>
        ) : (
          <TarjetaHipotesis h={d.hipotesis} prueba={d.prueba} nombres={nombres} />
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" defaultChecked />
          <span className="t-interfaz">Llevar al dictamen y a Presentar</span>
        </label>
      </aside>
    </div>
  );
}

/** 2 · Dentro de Reconstrucción: una capa sobre el visor y un bloque bajo la cifra. */
function PropuestaCapa({ d, nombres, version }: Props) {
  const v = d.r.velocidades.find((x) => x.previa) ?? null;
  const s = resumenDe(d.filas);
  return (
    <div className="flex min-h-0 flex-1 gap-4 p-4">
      <Escenario
        d={d}
        nombres={nombres}
        conDeclarada={version === "declaracion"}
        arriba={
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Comparar con">
            <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-texto-3 uppercase">
              Comparar con
            </span>
            <Chip activo={false}>Nada</Chip>
            <Chip activo={version === "declaracion"}>Lo que declaró B</Chip>
            <Chip activo={version === "hipotesis"}>¿Y si…?</Chip>
          </div>
        }
      />
      <aside className="escena-hoja flex w-[456px] shrink-0 flex-col gap-4 overflow-y-auto p-7">
        <h2 className={`${TITULO} text-[2.25rem] leading-none`}>Velocidad antes del impacto</h2>
        {v?.previa ? (
          <p className="flex items-end gap-3">
            <span className="cifra-protagonista text-[6.5rem] leading-none">
              {F.kmh(v.previa.mejor, "reconstruccion")}
            </span>
            <span className="flex flex-col pb-2">
              <span className="text-[1.4rem]">km/h</span>
              <span className="t-nota">{nombres[v.vehiculo]}</span>
            </span>
          </p>
        ) : null}
        <hr className="border-linea-suave" />
        {version === "declaracion" ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="t-subtitulo">Contra lo que declaró el conductor de {nombres.V2}</h3>
            </div>
            <p className="text-[0.9375rem]">
              <span className="cifras font-semibold">
                {s.no} de {s.comparables}
              </span>{" "}
              puntos no coinciden con la evidencia.
            </p>
            <Diferencias filas={d.filas} nombres={nombres} declarante="V2" compactas={3} />
            <button type="button" className="boton-secundario boton-compacto self-start">
              Ver los {d.filas.length} puntos
            </button>
          </section>
        ) : (
          <section className="flex flex-col gap-3">
            <h3 className="t-subtitulo">¿Y si…?</h3>
            <TarjetaHipotesis h={d.hipotesis} prueba={d.prueba} nombres={nombres} />
            <button type="button" className="boton-secundario boton-compacto self-start">
              Probar otra hipótesis
            </button>
          </section>
        )}
      </aside>
    </div>
  );
}

/** 3 · Un acto «Contraste» con todo lo que se compara, lado a lado. */
function PropuestaLadoALado({ d, nombres, version }: Props) {
  const s = resumenDe(d.filas);
  const hoja = (titulo: string, nota: string, r: Reconstruccion) => (
    <section className="escena-hoja flex min-h-0 flex-1 flex-col gap-2 p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-[0.9375rem] font-semibold">{titulo}</h3>
        <span className="t-nota">{nota}</span>
      </header>
      <div className="relative h-[300px] overflow-hidden rounded-control bg-superficie-alta">
        <MaquetaCaso r={r} calles={null} nombres={nombres} compacta />
      </div>
    </section>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={`${TITULO} text-[2.25rem] leading-none`}>Contraste</h2>
        <div className="segmentado" role="tablist" aria-label="Contra qué se compara">
          <button type="button" role="tab" aria-selected={version === "declaracion"}>
            Contra la declaración
          </button>
          <button type="button" role="tab" aria-selected={version === "hipotesis"}>
            ¿Y si…?
          </button>
          <button type="button" role="tab" aria-selected={false}>
            Contra CESVI
          </button>
        </div>
      </div>
      {version === "declaracion" ? (
        <>
          <div className="flex gap-4">
            {hoja("La evidencia", "reconstrucción física de Croquis", d.r)}
            {hoja(
              `Lo que declaró el conductor de ${nombres.V2}`,
              "simulado con la misma física",
              d.rDeclarada,
            )}
          </div>
          <p className="text-[0.9375rem]">
            <span className="cifras font-semibold">
              {s.no} de {s.comparables}
            </span>{" "}
            puntos no coinciden. Croquis no dice quién tiene razón.
          </p>
          <Diferencias filas={d.filas} nombres={nombres} declarante="V2" columnas />
        </>
      ) : (
        <div className="max-w-[640px]">
          <TarjetaHipotesis h={d.hipotesis} prueba={d.prueba} nombres={nombres} />
        </div>
      )}
    </div>
  );
}

interface Props {
  d: Datos;
  nombres: Record<string, string>;
  version: Version;
}

const acto = (clave: string, nombre: string, i: number): ActoDelCaso =>
  ({ clave, nombre, pasos: [i] }) as unknown as ActoDelCaso;
const ACTOS: Record<string, { actos: ActoDelCaso[]; paso: number }> = {
  "1": {
    actos: ["El hecho", "La escena", "Reconstrucción", "Versiones", "Análisis", "Dictamen"].map(
      (n, i) => acto(n, n, i),
    ),
    paso: 3,
  },
  "2": {
    actos: ["El hecho", "La escena", "Reconstrucción", "Análisis", "Dictamen"].map((n, i) =>
      acto(n, n, i),
    ),
    paso: 2,
  },
  "3": {
    actos: ["El hecho", "La escena", "Reconstrucción", "Análisis", "Contraste", "Dictamen"].map(
      (n, i) => acto(n, n, i),
    ),
    paso: 4,
  },
};

export function PropuestasHipotesis() {
  const q = useSearchParams();
  const p = ["1", "2", "3"].includes(q.get("p") ?? "") ? q.get("p")! : "1";
  const version: Version = q.get("v") === "hipotesis" ? "hipotesis" : "declaracion";
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    calcular()
      .then((x) => vivo && setD(x))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, []);
  const nombres = useMemo(() => {
    if (!d) return {};
    const vs = d.expediente.vehiculos;
    const porId = Object.fromEntries(
      vs.map((v, i) => [v.id, `${String.fromCharCode(65 + i)} · ${nombreVehiculo(v, vs)}`]),
    );
    // La maqueta los pide por su id del resultado; los paneles, por el del expediente.
    return {
      ...porId,
      ...Object.fromEntries(Object.entries(d.r.ids).map(([res, id]) => [res, porId[String(id)]!])),
    };
  }, [d]);
  const { actos, paso } = ACTOS[p]!;
  const Propuesta = p === "1" ? PropuestaActo : p === "2" ? PropuestaCapa : PropuestaLadoALado;
  return (
    <div
      className="fixed inset-0 flex flex-col bg-fondo text-texto"
      data-tema="claro"
      data-modo="trabajar"
      data-testid="propuesta-hipotesis"
      data-listo={d ? "si" : "no"}
    >
      <BarraRecorrido
        pasos={actos.map((a) => a.nombre)}
        actos={actos}
        paso={paso}
        irA={() => undefined}
        modo="trabajar"
        onModo={() => undefined}
        tema="claro"
        onExportar={() => undefined}
        transiciones={false}
      />
      {error ? (
        <p className="t-nota p-7">No se pudo calcular el caso de ejemplo: {error}</p>
      ) : d ? (
        <Propuesta d={d} nombres={nombres} version={version} />
      ) : (
        <p className="t-nota p-7">Calculando el caso de ejemplo…</p>
      )}
    </div>
  );
}
