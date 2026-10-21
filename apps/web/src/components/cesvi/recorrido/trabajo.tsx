"use client";
/**
 * El modo Trabajar del recorrido (ADR 0057; maqueta Paso4Trabajo): las herramientas de colocación,
 * el panel del objeto elegido (posición en metros desde el impacto, rumbo y fuente, todo editable)
 * y la tabla «Qué cambia entre versiones». Los datos son los mismos que en el modo Presentar.
 */
import {
  avanzar,
  enMetros,
  type ClaveVersion,
  type Comparacion,
  type Completitud,
  type Fase,
  type LonLat,
  type VersionCroquis,
} from "@croquis/cesvi";
import { useState } from "react";
import { NOMBRE_FASE } from "../mapa-comun";
import { Insignia } from "./marco";
import type { Seleccion } from "./mapa-recorrido";

export type Herramienta = "A" | "B" | "impacto" | "restos" | "medir";
export type VistaTrabajo = "declarada" | "evidencia" | "superponer" | "lado";

const HERRAMIENTAS: { clave: Herramienta; texto: string; simbolo: string }[] = [
  { clave: "A", texto: "A · posición inicial / final", simbolo: "a" },
  { clave: "B", texto: "B · posición inicial / final", simbolo: "b" },
  { clave: "impacto", texto: "Punto de impacto", simbolo: "✕" },
  { clave: "restos", texto: "Zona de restos", simbolo: "▨" },
  { clave: "medir", texto: "Medir distancia", simbolo: "—" },
];

function Simbolo({ s }: { s: string }) {
  if (s === "a") return <span className="h-5 w-3 rounded bg-vehiculo-a" aria-hidden="true" />;
  if (s === "b") return <span className="h-5 w-3 rounded bg-vehiculo-b" aria-hidden="true" />;
  return (
    <span
      className={`w-3 text-center ${s === "✕" ? "font-bold text-senal" : ""}`}
      aria-hidden="true"
    >
      {s}
    </span>
  );
}

export function Herramientas({
  activa,
  onHerramienta,
  completitud,
  onVerHecho,
}: {
  activa: Herramienta | null;
  onHerramienta: (h: Herramienta) => void;
  completitud: Completitud;
  onVerHecho: () => void;
}) {
  const falta = completitud.faltan[0];
  return (
    <div className="flex flex-col gap-4">
      <section className="tarjeta flex flex-col gap-2 p-4" aria-label="Colocar">
        <p className="t-rotulo mb-1">Colocar</p>
        {HERRAMIENTAS.map((h) => (
          <button
            key={h.clave}
            type="button"
            aria-pressed={activa === h.clave}
            onClick={() => onHerramienta(h.clave)}
            className={`flex min-h-11 items-center gap-3 rounded-control border px-3.5 text-left text-sm font-medium ${activa === h.clave ? "border-texto-3 bg-superficie-alta" : "border-linea"}`}
            data-testid={`herramienta-${h.clave}`}
          >
            <Simbolo s={h.simbolo} />
            {h.texto}
          </button>
        ))}
      </section>
      <section className="tarjeta flex flex-col gap-2.5 p-4" aria-label="Lo que entendió">
        <div className="flex items-center justify-between">
          <p className="t-rotulo">Lo que entendió</p>
          <span className="cifras text-sm" data-testid="completitud-trabajo">
            {completitud.presentes}/{completitud.total}
          </span>
        </div>
        <div className="h-1 rounded-full bg-linea">
          <div
            className="h-1 rounded-full bg-texto"
            style={{ width: `${(completitud.presentes / completitud.total) * 100}%` }}
          />
        </div>
        <p className="t-nota">
          {falta ? `Falta: ${falta.etiqueta}.` : "Completo para reconstruir."}
        </p>
        <button type="button" className="t-nota self-start underline" onClick={onVerHecho}>
          Ver el hecho →
        </button>
      </section>
    </div>
  );
}

export function PestanasVista({
  vista,
  onVista,
}: {
  vista: VistaTrabajo;
  onVista: (v: VistaTrabajo) => void;
}) {
  const nombres: Record<VistaTrabajo, string> = {
    declarada: "Declarada",
    evidencia: "Evidencia",
    superponer: "Superponer",
    lado: "Lado a lado",
  };
  return (
    <div className="segmentado w-fit" role="tablist" aria-label="Vista del croquis">
      {(Object.keys(nombres) as VistaTrabajo[]).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={vista === v}
          className="px-4"
          onClick={() => onVista(v)}
          data-testid={`vista-${v}`}
        >
          {nombres[v]}
        </button>
      ))}
    </div>
  );
}

/** Un punto en metros desde el impacto: «adelante» en el rumbo de A y «derecha» a 90°. */
export function aEjes(p: LonLat, origen: LonLat, rumbo: number): { x: number; y: number } {
  const { este, norte } = enMetros(p, origen);
  const r = (rumbo * Math.PI) / 180;
  return {
    x: este * Math.cos(r) - norte * Math.sin(r),
    y: este * Math.sin(r) + norte * Math.cos(r),
  };
}
export function deEjes(x: number, y: number, origen: LonLat, rumbo: number): [number, number] {
  return avanzar(avanzar(origen, rumbo, y), rumbo + 90, x);
}

/** Un número editable: se escribe libre y se aplica al salir o con Enter. */
function CampoNumero({
  etiqueta,
  valor,
  unidad,
  onCambio,
  testid,
}: {
  etiqueta: string;
  valor: number;
  unidad: string;
  onCambio: (v: number) => void;
  testid: string;
}) {
  // Se reinicia desde fuera con `key` cuando cambia el valor (no con un efecto).
  const [texto, setTexto] = useState(valor.toFixed(2));
  const aplicar = () => {
    const n = Number(texto.replace(",", "."));
    if (Number.isFinite(n)) onCambio(n);
    else setTexto(valor.toFixed(2));
  };
  return (
    <label className="flex flex-col gap-1 text-xs text-texto-3">
      {etiqueta}
      <span className="flex h-11 items-center gap-1 rounded-control border border-linea bg-fondo px-3">
        <input
          className="cifras w-full border-0 bg-transparent text-sm text-texto outline-none"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={aplicar}
          onKeyDown={(e) => e.key === "Enter" && aplicar()}
          inputMode="decimal"
          data-testid={testid}
        />
        <span className="text-texto-3">{unidad}</span>
      </span>
    </label>
  );
}

const FUENTE_POSE: Record<string, string> = {
  perito: "perito",
  dictamen: "dictamen",
  croquis: "supuesto",
};

/** El panel del objeto elegido: posición en metros desde el impacto, rumbo y fuente. */
export function PanelObjeto({
  version,
  clave,
  seleccion,
  nombres,
  onPunto,
  onRumbo,
  onRestablecer,
}: {
  version: VersionCroquis;
  clave: ClaveVersion;
  seleccion: Seleccion;
  nombres: Record<"A" | "B", string>;
  onPunto: (p: [number, number]) => void;
  onRumbo: (r: number) => void;
  onRestablecer: () => void;
}) {
  const origen = version.impacto.punto;
  const base = version.vehiculos.A.impacto.rumbo;
  const nombreVersion = clave === "declarada" ? "versión declarada" : "versión evidencia";
  let titulo: string;
  let detalle: string;
  let punto: [number, number] | null = null;
  let rumbo: number | null = null;
  let fuente: string;
  let barra = "bg-senal";
  if (seleccion.tipo === "pose") {
    const p = version.vehiculos[seleccion.letra][seleccion.fase as Fase];
    titulo = nombres[seleccion.letra];
    detalle = `${NOMBRE_FASE[seleccion.fase]} · ${nombreVersion}`;
    punto = p.punto;
    rumbo = p.rumbo;
    fuente = FUENTE_POSE[p.fuente] ?? p.fuente;
    barra = seleccion.letra === "A" ? "bg-vehiculo-a" : "bg-vehiculo-b";
  } else if (seleccion.tipo === "restos") {
    titulo = `Zona de restos · ${seleccion.extremo === "inicio" ? "R1" : "R2"}`;
    detalle = nombreVersion;
    punto = version.restos[seleccion.extremo];
    fuente = FUENTE_POSE[version.restos.fuente] ?? version.restos.fuente;
  } else {
    titulo = "Punto de impacto";
    detalle = `${version.impacto.punto[1].toFixed(5)}, ${version.impacto.punto[0].toFixed(5)}`;
    fuente = FUENTE_POSE[version.impacto.fuente] ?? version.impacto.fuente;
  }
  const ejes = punto ? aEjes(punto, origen, base) : null;
  return (
    <section
      className="tarjeta flex flex-col gap-4 p-5"
      aria-label="Objeto elegido"
      data-testid="panel-objeto"
    >
      <div className="flex items-start gap-3">
        <span className={`w-1.5 self-stretch rounded-full ${barra}`} aria-hidden="true" />
        <div className="flex flex-col">
          <span className="t-subtitulo text-lg">{titulo}</span>
          <span className="t-nota">{detalle}</span>
        </div>
      </div>
      {ejes ? (
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero
            key={`x-${ejes.x.toFixed(2)}`}
            etiqueta="x desde el impacto (derecha)"
            valor={ejes.x}
            unidad="m"
            onCambio={(x) => onPunto(deEjes(x, ejes.y, origen, base))}
            testid="objeto-x"
          />
          <CampoNumero
            key={`y-${ejes.y.toFixed(2)}`}
            etiqueta="y desde el impacto (adelante)"
            valor={ejes.y}
            unidad="m"
            onCambio={(y) => onPunto(deEjes(ejes.x, y, origen, base))}
            testid="objeto-y"
          />
        </div>
      ) : null}
      <div className="grid grid-cols-2 items-end gap-3">
        {rumbo !== null ? (
          <CampoNumero
            key={`r-${rumbo.toFixed(2)}`}
            etiqueta="Rumbo"
            valor={rumbo}
            unidad="°"
            onCambio={(r) => onRumbo(((r % 360) + 360) % 360)}
            testid="objeto-rumbo"
          />
        ) : (
          <span />
        )}
        <div className="flex flex-col gap-1 text-xs text-texto-3">
          Fuente
          <span>
            <Insignia tipo={fuente === "supuesto" ? "supuesto" : "normal"}>{fuente}</Insignia>
          </span>
        </div>
      </div>
      <button
        type="button"
        className="boton-secundario boton-compacto"
        onClick={onRestablecer}
        data-testid="restablecer-objeto"
      >
        Restablecer posición
      </button>
    </section>
  );
}

const ESTADO: Record<string, string> = {
  coincide: "text-texto-2",
  no_coincide: "text-texto font-semibold",
  sin_dato: "text-texto-3",
};

/** «Qué cambia entre versiones»: la tabla y su resumen. Cada fila sale del cálculo o del análisis. */
export function TablaCambios({ c, compacta = false }: { c: Comparacion; compacta?: boolean }) {
  return (
    <section
      className={`tarjeta flex flex-col gap-3 ${compacta ? "p-5" : "p-5"}`}
      aria-label="Qué cambia entre versiones"
      data-testid="que-cambia"
    >
      <p className="t-rotulo">Qué cambia entre versiones</p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs text-texto-3">
            <th className="py-1 font-normal" />
            <th className="py-1 font-normal">Declarada</th>
            <th className="py-1 font-normal">Evidencia</th>
          </tr>
        </thead>
        <tbody>
          {c.filas.map((f) => (
            <tr key={f.clave} className="align-top" title={f.fuente} data-fila-cambio={f.clave}>
              <td className="py-1.5 pr-2 text-texto-2">{f.concepto}</td>
              <td className="py-1.5 pr-2">{f.declarada}</td>
              <td className={`py-1.5 ${ESTADO[f.estado]}`}>{f.evidencia}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        className={`rounded-control px-3 py-2.5 text-sm font-medium ${c.noCoinciden ? "bg-[var(--falta-fondo)] text-senal-texto" : "bg-superficie-alta"}`}
        data-testid="resumen-cambios"
      >
        {c.resumen}
      </p>
    </section>
  );
}
