"use client";
/**
 * Las pantallas del recorrido del perito (docs/cesvi/PROTOTIPO.md, «Recorrido del perito»; ADR
 * 0052) con el sistema del rediseño (ADR 0054; maquetas en docs/cesvi/rediseno/): los pasos 2, 6 y
 * 7 siguen sus maquetas, el 3 y el 4 son paneles de vidrio sobre el mapa, y el 1, el 5 y el 8 usan
 * el mismo sistema. Cada pantalla muestra una frase y lo demás va al panel de detalle; el estado
 * vive en `recorrido.tsx`.
 */
import {
  NOMBRE_ZONA,
  type CasoCesvi,
  type ClaveVersion,
  type Comparacion,
  type ContraDictamen,
  type FilaContraDictamen,
  type ComparacionVelocidades,
  type Completitud,
  type DatoHecho,
  type EventoLinea,
  type FilaReproduccion,
  type FuenteHecho,
  type InterpretacionHecho,
  type LeidoPor,
  type PreguntaHecho,
  type Sugerencia,
  type TipoTexto,
  type Validacion,
  type Zona,
} from "@croquis/cesvi";
import { useId, useState, type ReactNode } from "react";
import {
  BotonDetalle,
  EtiquetaVehiculo,
  FONDO_VEHICULO,
  Frase,
  Insignia,
  Navegacion,
  Pagina,
  PanelMapa,
  Rotulo,
  TEXTO_VEHICULO,
  useRecorrido,
} from "./marco";
import { NumeroAnimado, Silueta } from "./piezas";
import { InterruptorComparar, TablaCambios } from "./trabajo";

export { TEXTO_VEHICULO };

type Letra = "A" | "B";
type Nombres = Record<Letra, string>;

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );

/* ------------------------------------------------------------------------------------------ */
/* Paso 1: el caso                                                                            */
/* ------------------------------------------------------------------------------------------ */

export function PasoCaso({
  caso,
  nombres,
  frase,
}: {
  caso: CasoCesvi;
  nombres: Nombres;
  frase: string;
}) {
  return (
    <Pagina>
      <header className="flex max-w-[820px] flex-col gap-3">
        <Rotulo />
        <h1 className="t-titulo">Siniestro {caso.id}</h1>
        <p className="t-nota cifras">
          {caso.aseguradora} · {fecha(caso.fecha_hora.valor)},{" "}
          {caso.fecha_hora.aproximada ? "aprox. " : ""}
          {caso.fecha_hora.valor.slice(11)} h · {caso.lugar.municipio}, {caso.lugar.estado}
        </p>
        <Frase>{frase}</Frase>
      </header>
      <div className="grid gap-5 md:grid-cols-2">
        {(["A", "B"] as const).map((l) => (
          <article key={l} className="tarjeta flex items-center gap-6 p-6">
            <div className="h-36 shrink-0">
              <Silueta zonas={[]} etiqueta={nombres[l]} letra={l} />
            </div>
            <div className="flex min-w-0 flex-col items-start gap-3">
              <EtiquetaVehiculo letra={l} nombre={nombres[l]} testid={`caso-${l}`} />
              <p className="t-subtitulo">
                {caso.vehiculos[l].marca} {caso.vehiculos[l].tipo}
              </p>
              <p className="t-nota cifras">
                {caso.vehiculos[l].modelo} · {caso.vehiculos[l].color} ·{" "}
                {l === caso.declaracion.conductor ? "su conductor declara" : "sin declaración"}
              </p>
            </div>
          </article>
        ))}
      </div>
      <article className="tarjeta flex flex-col gap-4 p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="t-interfaz text-texto-2">
            Declaración del conductor de {nombres[caso.declaracion.conductor as Letra] ?? "A"} ·
            literal
          </span>
          <span className="t-rotulo normal-case tracking-normal">Fuente: reporte de CESVI</span>
        </div>
        <blockquote
          className="text-[clamp(1.25rem,2.2vw,1.625rem)] leading-[1.6] tracking-[-0.01em] text-texto"
          lang="es-MX"
          data-testid="declaracion"
        >
          “{caso.declaracion.texto}”
        </blockquote>
      </article>
      <div className="flex flex-wrap items-center gap-3">
        <Navegacion siguiente="Leer la declaración" />
        <BotonDetalle />
      </div>
    </Pagina>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Paso 2: el hecho (ADR 0055)                                                                */
/* ------------------------------------------------------------------------------------------ */

const FUENTE: Record<FuenteHecho, string> = {
  perito: "perito",
  conductor: "conductor",
  expediente: "expediente",
  supuesto: "supuesto",
};
const LEIDO: Record<LeidoPor, string> = { ia: "IA", reglas: "reglas", perito: "perito" };
const BARRA_DATO = { A: "bg-vehiculo-a", B: "bg-vehiculo-b", hecho: "bg-texto-2" };
const FRASE_DATO = { A: "frase-a", B: "frase-b", hecho: "frase-hecho" };

/** Un texto leído, con cada frase que respalda un dato resaltada en el color de su vehículo. */
function TextoResaltado({
  texto,
  datos,
  testid,
}: {
  texto: string;
  datos: DatoHecho[];
  testid: string;
}) {
  const frases = datos.filter((d) => d.tramo).sort((a, b) => a.tramo!.inicio - b.tramo!.inicio);
  const partes: ReactNode[] = [];
  let desde = 0;
  for (const d of frases) {
    const t = d.tramo!;
    if (t.inicio < desde) continue;
    partes.push(texto.slice(desde, t.inicio));
    partes.push(
      <mark key={d.clave} className={FRASE_DATO[d.vehiculo ?? "hecho"]} data-dato={d.clave}>
        {texto.slice(t.inicio, t.fin)}
      </mark>,
    );
    desde = t.fin;
  }
  partes.push(texto.slice(desde));
  return (
    <p
      className="leading-[1.7] whitespace-pre-wrap text-[var(--texto-cita)]"
      lang="es-MX"
      data-testid={testid}
    >
      {partes}
    </p>
  );
}

function TarjetaDato({ d }: { d: DatoHecho }) {
  return (
    <li className="tarjeta flex items-center gap-4 rounded-[14px] px-4 py-3">
      <span
        className={`w-1 self-stretch rounded-full ${BARRA_DATO[d.vehiculo ?? "hecho"]}`}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-nota text-texto-3">{d.etiqueta}</span>
        <span className="t-interfaz text-[0.9375rem]">{d.valor}</span>
        {d.tramo ? (
          <span className="t-nota mt-0.5 text-texto-2" data-testid={`frase-${d.clave}`}>
            «{d.tramo.texto}»
          </span>
        ) : null}
      </span>
      <Insignia tipo={d.fuente === "supuesto" ? "supuesto" : "normal"}>
        {FUENTE[d.fuente]} · {LEIDO[d.leidoPor]}
      </Insignia>
    </li>
  );
}

/** Una tarjeta de texto del expediente: se escribe, se lee y se muestra con sus frases resaltadas. */
function TarjetaTexto({
  tipo,
  titulo,
  fuente,
  principal,
  texto,
  onTexto,
  leido,
  datos,
  estado,
  onLeer,
  ejemplo,
}: {
  tipo: TipoTexto;
  titulo: string;
  fuente: string;
  principal: boolean;
  texto: string;
  onTexto: (t: string) => void;
  /** El texto tal como se leyó (si cambia, hay que volver a leer). */
  leido: string | null;
  datos: DatoHecho[];
  estado: string | null;
  onLeer: () => void;
  ejemplo?: () => void;
}) {
  const id = useId();
  const [editando, setEditando] = useState(false);
  const vigente = leido !== null && leido === texto;
  const mostrarLeido = vigente && !editando;
  return (
    <article
      className={`tarjeta flex flex-col gap-4 ${principal ? "p-7" : "border-dashed bg-[var(--hundido)] px-7 py-6"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={`${id}-texto`}
          className={principal ? "t-subtitulo" : "t-interfaz text-texto-2"}
        >
          {titulo}
        </label>
        <span className="t-rotulo normal-case tracking-normal">{fuente}</span>
      </div>
      {mostrarLeido ? (
        <div className={principal ? "text-[1.1875rem]" : "text-[1.0625rem]"}>
          <TextoResaltado texto={texto} datos={datos} testid={`texto-${tipo}`} />
        </div>
      ) : (
        <textarea
          id={`${id}-texto`}
          rows={principal ? 8 : 3}
          className="campo resize-y text-[1.0625rem] leading-relaxed"
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          placeholder={
            principal
              ? "Modalidad, sentido y carril de cada vehículo, zona de contacto con su acentuación y vértice, dirección de la fuerza, maniobras, restos y huellas, posiciones finales y condiciones de la vía."
              : "La cita literal de lo que declara cada conductor."
          }
          data-testid={`entrada-${tipo}`}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        {mostrarLeido ? (
          <button
            type="button"
            className="boton-secundario boton-compacto"
            onClick={() => setEditando(true)}
          >
            Editar
          </button>
        ) : (
          <button
            type="button"
            className={
              principal ? "boton-principal boton-compacto" : "boton-secundario boton-compacto"
            }
            onClick={() => {
              setEditando(false);
              onLeer();
            }}
            disabled={texto.trim().length < 10}
            data-testid={`leer-${tipo}`}
          >
            {tipo === "descripcion" ? "Leer la descripción" : "Leer la declaración"}
          </button>
        )}
        {ejemplo && !texto.trim() ? (
          <button
            type="button"
            className="boton-secundario boton-compacto"
            onClick={ejemplo}
            data-testid="ejemplo-descripcion"
          >
            Usar el ejemplo del caso
          </button>
        ) : null}
        {estado ? (
          <p role="status" className="t-nota" data-testid={`estado-${tipo}`}>
            {estado}
          </p>
        ) : null}
      </div>
    </article>
  );
}

/** Una pregunta técnica: opciones, un número o un texto. Las contestadas se pueden cambiar. */
function TarjetaPregunta({
  p,
  i,
  n,
  onResponder,
}: {
  p: PreguntaHecho;
  /** Su lugar entre las preguntas (para «¿Qué falta? · 1 de 2»). */
  i: number;
  n: number;
  onResponder: (clave: string, v: string | number | null) => void;
}) {
  const id = useId();
  const [texto, setTexto] = useState(String(p.respuesta ?? ""));
  const pendiente = p.respuesta === null;
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4 ${pendiente ? "border-senal/45 bg-[var(--falta-fondo)]" : "border-linea-suave bg-superficie"}`}
      data-testid={`pregunta-${p.clave.replace(/[^a-z_]/gi, "-")}`}
    >
      <p className={`t-rotulo ${pendiente ? "text-senal-texto" : ""}`}>
        ¿Qué falta? · {i + 1} de {n}
      </p>
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={`${id}-r`} className="t-interfaz text-base font-semibold">
          {p.texto}
        </label>
        <Insignia tipo={pendiente ? "senal" : "normal"}>
          {pendiente ? "falta un dato" : "perito"}
        </Insignia>
      </div>
      <p
        className="t-nota -mt-1 text-texto-2"
        data-testid={`por-que-${p.clave.replace(/[^a-z_]/gi, "-")}`}
      >
        Por qué importa:{" "}
        {p.porQue ||
          `va en la versión ${p.version === "evidencia" ? "de la evidencia" : "declarada"}.`}
      </p>
      {p.tipo === "opciones" ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={p.texto}>
          {p.opciones!.map((o) => (
            <button
              key={o.valor}
              type="button"
              className="boton-secundario boton-compacto rounded-control"
              aria-pressed={p.respuesta === o.valor}
              onClick={() => onResponder(p.clave, o.valor)}
            >
              {o.etiqueta}
            </button>
          ))}
          <NoSe p={p} onResponder={onResponder} />
        </div>
      ) : p.tipo === "numero" ? (
        <div className="flex flex-wrap gap-2">
          <span className="flex h-11 items-center gap-1.5 rounded-control border border-linea bg-fondo px-3.5">
            <input
              id={`${id}-r`}
              type="number"
              min={0}
              step={0.5}
              className="cifras w-16 border-0 bg-transparent text-[1.0625rem] font-semibold text-texto outline-none"
              value={typeof p.respuesta === "number" ? p.respuesta : ""}
              onChange={(e) =>
                onResponder(
                  p.clave,
                  e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                )
              }
              data-testid={`respuesta-${p.clave}`}
            />
            <span className="t-nota text-texto-3">m</span>
          </span>
          <NoSe p={p} onResponder={onResponder} />
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onResponder(p.clave, texto.trim() || null);
          }}
        >
          <input
            id={`${id}-r`}
            className="campo"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="submit" className="boton-secundario boton-compacto">
            Guardar
          </button>
          <NoSe p={p} onResponder={onResponder} />
        </form>
      )}
    </div>
  );
}

/** «No sé»: siempre está; el dato queda como supuesto. */
function NoSe({
  p,
  onResponder,
}: {
  p: PreguntaHecho;
  onResponder: (clave: string, v: string | number | null) => void;
}) {
  return (
    <button
      type="button"
      className="boton-secundario boton-compacto h-11 rounded-control text-texto-2"
      aria-pressed={p.respuesta === "no_se"}
      onClick={() => onResponder(p.clave, "no_se")}
      data-testid={`no-se-${p.clave.replace(/[^a-z_]/gi, "-")}`}
    >
      No sé
    </button>
  );
}

export function PasoHecho({
  textos,
  onTexto,
  leidos,
  interpretacion,
  estados,
  onLeer,
  onEjemplo,
  onResponder,
  declarante,
  frase,
  completitud,
}: {
  completitud: Completitud;
  textos: Record<TipoTexto, string>;
  onTexto: (tipo: TipoTexto, t: string) => void;
  /** El texto tal como se leyó por última vez (null si no se ha leído). */
  leidos: Record<TipoTexto, string | null>;
  interpretacion: InterpretacionHecho;
  estados: Record<TipoTexto, string | null>;
  onLeer: (tipo: TipoTexto) => void;
  onEjemplo: (() => void) | null;
  onResponder: (clave: string, v: string | number | null) => void;
  declarante: string;
  frase: string;
}) {
  const i = interpretacion;
  const pendientes = i.preguntas.filter((p) => p.respuesta === null).length;
  const grupo = (
    titulo: string,
    nota: string,
    datos: DatoHecho[],
    testid: string,
    vacio: string,
  ) => (
    <section className="flex flex-col gap-2.5" aria-label={titulo}>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="t-interfaz font-semibold">{titulo}</h2>
        <span className="t-nota text-texto-3">{nota}</span>
      </div>
      {datos.length ? (
        <ol className="flex flex-col gap-2" data-testid={testid}>
          {datos.map((d) => (
            <TarjetaDato key={d.clave} d={d} />
          ))}
        </ol>
      ) : (
        <p
          className="t-nota rounded-[14px] border border-dashed border-linea px-4 py-3"
          data-testid={testid}
        >
          {vacio}
        </p>
      )}
    </section>
  );
  return (
    <Pagina ancho="max-w-[1320px]">
      <div className="flex flex-wrap items-start gap-8">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <header className="flex flex-col gap-3">
            <Rotulo />
            <h1 className="t-titulo">El hecho</h1>
            <Frase>{frase}</Frase>
          </header>
          <TarjetaTexto
            tipo="descripcion"
            titulo="Descripción técnica del hecho"
            fuente="Perito"
            principal
            texto={textos.descripcion}
            onTexto={(t) => onTexto("descripcion", t)}
            leido={leidos.descripcion}
            datos={i.evidencia}
            estado={estados.descripcion}
            onLeer={() => onLeer("descripcion")}
            ejemplo={onEjemplo ?? undefined}
          />
          <TarjetaTexto
            tipo="declaracion"
            titulo="Declaración del conductor · opcional"
            fuente={`Conductor de ${declarante} · literal`}
            principal={false}
            texto={textos.declaracion}
            onTexto={(t) => onTexto("declaracion", t)}
            leido={leidos.declaracion}
            datos={i.declarada}
            estado={estados.declaracion}
            onLeer={() => onLeer("declaracion")}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Navegacion siguiente="Ver en el mapa" />
            <BotonDetalle />
          </div>
        </div>

        <aside
          aria-label="Lo que entendió Croquis"
          className="flex min-w-0 flex-[1_1_400px] flex-col gap-5"
        >
          <div className="flex flex-col gap-2 px-1">
            <div className="flex items-center justify-between">
              <span className="t-subtitulo">Lo que entendió</span>
              <span className="cifras text-sm" data-testid="completitud">
                {completitud.presentes}/{completitud.total}
              </span>
            </div>
            <div className="h-1 rounded-full bg-linea" aria-hidden="true">
              <div
                className="h-1 rounded-full bg-texto transition-[width]"
                style={{ width: `${(completitud.presentes / completitud.total) * 100}%` }}
              />
            </div>
            <span className="t-nota text-texto-3">
              {i.evidencia.length + i.declarada.length} datos · {pendientes}{" "}
              {pendientes === 1 ? "pregunta" : "preguntas"}
            </span>
          </div>
          {completitud.faltan.length ? (
            <ul className="flex flex-col gap-2" aria-label="Lo que falta">
              {completitud.faltan.map((f) => (
                <li
                  key={f.clave}
                  className="flex items-center justify-between rounded-[14px] border border-dashed border-linea px-4 py-3 text-sm text-texto-2"
                  data-testid={`falta-${f.clave}`}
                >
                  {f.etiqueta}
                  <span className="text-texto-3">{f.noSe ? "El perito no lo sabe" : "Falta"}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {i.preguntas.length ? (
            <div className="flex flex-col gap-3" aria-label="Preguntas técnicas">
              {i.preguntas.map((p, k) => (
                <TarjetaPregunta
                  key={p.clave}
                  p={p}
                  i={k}
                  n={i.preguntas.length}
                  onResponder={onResponder}
                />
              ))}
            </div>
          ) : null}
          {grupo(
            "Para la reconstrucción",
            "de la descripción del perito",
            i.evidencia,
            "datos-evidencia",
            "Escribe o pega la descripción técnica y léela: con ella Croquis arma la reconstrucción.",
          )}
          {grupo(
            "Declaración del conductor · opcional",
            "para comparar",
            i.declarada,
            "datos-declarada",
            "Si la pegas y la lees, Croquis arma esa versión para compararla con la reconstrucción.",
          )}
          {grupo("Expediente", "", i.expediente, "datos-expediente", "")}
          <p className="t-nota px-1 text-texto-3">
            La IA solo ordena lo que dice cada texto, con el vocabulario de los reportes de CESVI.
            Los números salen del texto o del perito; la conclusión, del cálculo y del perito.
          </p>
        </aside>
      </div>
    </Pagina>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Paso 3: el lugar (panel sobre el mapa)                                                     */
/* ------------------------------------------------------------------------------------------ */

/** Deshacer, rehacer y restablecer las posiciones (pasos 3 y 4; también Ctrl+Z y Ctrl+Shift+Z). */
export interface EdicionPasos {
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  onDeshacer: () => void;
  onRehacer: () => void;
  onRestablecer: () => void;
}

export function BarraEdicion({ e, restablecer }: { e: EdicionPasos; restablecer: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Edición">
      <button
        type="button"
        className="boton-secundario boton-compacto"
        onClick={e.onDeshacer}
        disabled={!e.puedeDeshacer}
        title="Deshacer (Ctrl+Z)"
        data-testid="deshacer"
      >
        ↶ Deshacer
      </button>
      <button
        type="button"
        className="boton-secundario boton-compacto"
        onClick={e.onRehacer}
        disabled={!e.puedeRehacer}
        title="Rehacer (Ctrl+Shift+Z)"
        data-testid="rehacer"
      >
        ↷ Rehacer
      </button>
      {restablecer ? (
        <button
          type="button"
          className="boton-secundario boton-compacto"
          onClick={e.onRestablecer}
          data-testid="restablecer"
        >
          Restablecer posiciones
        </button>
      ) : null}
    </div>
  );
}

/** Coordenadas escritas a mano: «25.97385, -109.03543». */
function FormaCoordenadas({
  boton,
  onCoordenadas,
  testid,
  nota = "Toca el punto sobre la carretera o escribe sus coordenadas.",
}: {
  /** La instrucción sobre el campo (null: sin instrucción, porque ya la hay arriba). */
  nota?: string | null;
  boton: string;
  onCoordenadas: (lat: number, lon: number) => void;
  testid: string;
}) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(texto);
        const lat = m ? Number(m[1]) : Number.NaN;
        const lon = m ? Number(m[2]) : Number.NaN;
        if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) {
          setError("Latitud y longitud en grados decimales, por ejemplo 25.97, -109.03.");
          return;
        }
        setError(null);
        onCoordenadas(lat, lon);
      }}
    >
      <label htmlFor={id} className={nota ? "t-nota" : "sr-only"}>
        {nota ?? "Coordenadas del punto nuevo (latitud, longitud)"}
      </label>
      <input
        id={id}
        className="campo cifras"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="25.97385, -109.03543"
        data-testid={testid}
      />
      <button type="submit" className="boton-principal">
        {boton}
      </button>
      {error ? <p className="t-nota text-senal-texto">{error}</p> : null}
    </form>
  );
}

export function PasoLugar({
  kilometro,
  frase,
  punto,
  reubicando,
  onReubicar,
  onQuitar,
  aviso,
  msCalles,
  via,
  onCoordenadas,
  edicion,
  ilustrativa,
  puntoIlustrativo,
}: {
  /** La ubicación ilustrativa del lugar (ADR 0056): el dictamen no da coordenadas. */
  ilustrativa: { lat: number; lon: number; via: string } | null;
  /** Si el punto marcado es esa ubicación ilustrativa. */
  puntoIlustrativo: boolean;
  kilometro: string;
  frase: string;
  /** El punto de impacto marcado (null si aún no hay). */
  punto: [number, number] | null;
  /** «Cambiar ubicación»: el siguiente clic en el mapa (o las coordenadas) mueve el punto. */
  reubicando: boolean;
  onReubicar: (v: boolean) => void;
  onQuitar: () => void;
  aviso: string | null;
  /** Del clic a ver las calles, en milisegundos (meta: menos de 1 s). */
  msCalles: number | null;
  /** La vía más cercana, en palabras. */
  via: string | null;
  /** Marca el punto, o lo mueve si ya hay uno. */
  onCoordenadas: (lat: number, lon: number) => void;
  edicion: EdicionPasos;
}) {
  return (
    <PanelMapa>
      <Rotulo />
      <h1 className="t-panel">El lugar: km {kilometro}</h1>
      <Frase className="text-[0.9375rem]">{frase}</Frase>
      {punto ? (
        <>
          <div className="hundido flex flex-col gap-1 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p
                className="t-interfaz"
                data-testid="impacto-marcado"
                data-ms={msCalles === null ? undefined : msCalles.toFixed(0)}
              >
                Punto de impacto
              </p>
              <Insignia tipo={puntoIlustrativo ? "supuesto" : "normal"}>
                {puntoIlustrativo ? "ilustrativa" : "perito"}
              </Insignia>
            </div>
            <p className="cifras t-nota text-texto" data-testid="coordenadas-impacto">
              {punto[1].toFixed(5)}, {punto[0].toFixed(5)}
            </p>
            {via ? <p className="t-nota">{via}</p> : null}
            {puntoIlustrativo ? (
              <p className="t-nota text-texto-3" data-testid="aviso-ilustrativa">
                Ubicación ilustrativa: el reporte de CESVI no da coordenadas del km {kilometro}.
              </p>
            ) : null}
          </div>
          {reubicando ? (
            <div className="flex flex-col gap-3">
              <p className="t-nota text-texto">
                Arrastra la ✕, toca el punto nuevo en el mapa o escribe sus coordenadas. Los
                vehículos se mueven con él.
              </p>
              <FormaCoordenadas
                boton="Mover el punto"
                nota={null}
                onCoordenadas={onCoordenadas}
                testid="coordenadas-nuevas"
              />
              <button
                type="button"
                className="boton-secundario boton-compacto"
                onClick={() => onReubicar(false)}
              >
                Listo
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="boton-secundario boton-compacto"
                onClick={() => onReubicar(true)}
                data-testid="cambiar-ubicacion"
              >
                Cambiar ubicación
              </button>
              <button
                type="button"
                className="boton-secundario boton-compacto"
                onClick={onQuitar}
                data-testid="quitar-punto"
              >
                Quitar punto
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {ilustrativa ? (
            <div className="hundido flex flex-col gap-2 p-3.5" data-testid="ubicacion-ilustrativa">
              <div className="flex items-center justify-between gap-2">
                <p className="t-interfaz">Km {kilometro}, ubicación ilustrativa</p>
                <Insignia tipo="supuesto">supuesto</Insignia>
              </div>
              <p className="cifras t-nota text-texto">
                {ilustrativa.lat.toFixed(5)}, {ilustrativa.lon.toFixed(5)}
              </p>
              <p className="t-nota">
                El reporte de CESVI no da coordenadas: es un punto de la {ilustrativa.via} para
                mostrar el recorrido. No es el lugar real.
              </p>
              <button
                type="button"
                className="boton-principal boton-compacto"
                onClick={() => onCoordenadas(ilustrativa.lat, ilustrativa.lon)}
                data-testid="usar-ilustrativa"
              >
                Usar esta ubicación
              </button>
            </div>
          ) : null}
          <FormaCoordenadas
            boton="Marcar el impacto"
            onCoordenadas={onCoordenadas}
            testid="coordenadas"
            nota={
              ilustrativa
                ? "O toca el punto sobre la carretera, o escribe sus coordenadas."
                : undefined
            }
          />
        </>
      )}
      <BarraEdicion e={edicion} restablecer={punto !== null} />
      {aviso ? (
        <p role="status" className="t-nota">
          {aviso}
        </p>
      ) : null}
      <BotonDetalle />
      <Navegacion ancho />
    </PanelMapa>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Paso 4: las dos versiones (maqueta Paso4)                                                  */
/* ------------------------------------------------------------------------------------------ */

const NOMBRE_VERSION: Record<ClaveVersion, string> = {
  declarada: "Declarada",
  evidencia: "Reconstrucción",
};

export function PasoVersiones({
  activa,
  onActiva,
  restos,
  restosDictamen,
  superponer,
  onSuperponer,
  seleccion,
  frase,
  onUsarRestos,
  edicion,
  comparar,
  onComparar,
}: {
  edicion: EdicionPasos;
  /** ¿Se compara con la declaración del conductor? Apagado, solo se ve la reconstrucción. */
  comparar: boolean;
  onComparar: (v: boolean) => void;
  activa: ClaveVersion;
  onActiva: (k: ClaveVersion) => void;
  /** La zona de restos de cada versión, en metros (null si aún no hay versiones). */
  restos: Record<ClaveVersion, number> | null;
  restosDictamen: number;
  superponer: boolean;
  onSuperponer: (v: boolean) => void;
  /** Lo elegido en el mapa, en palabras. */
  seleccion: { titulo: string; detalle: string; letra: Letra | null } | null;
  frase: string;
  onUsarRestos: () => void;
}) {
  return (
    <PanelMapa>
      <Rotulo />
      <h1 className="t-panel">La reconstrucción de Croquis</h1>
      <Frase className="text-[0.9375rem]">{frase}</Frase>
      {comparar ? (
        <div className="segmentado" role="tablist" aria-label="Versión">
          {(["evidencia", "declarada"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={activa === k}
              onClick={() => onActiva(k)}
              data-testid={`version-${k}`}
            >
              {NOMBRE_VERSION[k]}
            </button>
          ))}
        </div>
      ) : null}
      {restos ? (
        <div className={`grid gap-3 ${comparar ? "grid-cols-2" : "grid-cols-1"}`}>
          {(comparar ? (["evidencia", "declarada"] as const) : (["evidencia"] as const)).map(
            (k) => (
              <div
                key={k}
                className={`hundido flex flex-col gap-1.5 p-3.5 ${activa === k ? "border-linea" : ""}`}
                data-testid={activa === k ? "restos-mapa" : undefined}
              >
                <span className="t-nota text-texto-3">
                  Restos · {NOMBRE_VERSION[k].toLowerCase()}
                </span>
                <span
                  className={`cifras text-[1.625rem] font-semibold leading-none ${activa === k ? "text-texto" : "text-texto-2"}`}
                >
                  <NumeroAnimado
                    key={`${k}-${restos[k].toFixed(2)}`}
                    valor={restos[k]}
                    decimales={2}
                  />{" "}
                  m
                </span>
              </div>
            ),
          )}
        </div>
      ) : null}
      <p className="t-nota -mt-2">
        El reporte de CESVI midió <span className="cifras">{restosDictamen} m</span>.{" "}
        <button
          type="button"
          className="underline underline-offset-2 hover:text-texto"
          onClick={onUsarRestos}
          data-testid="usar-restos"
        >
          Usar la medida del mapa en el cálculo
        </button>
      </p>
      {seleccion ? (
        <div
          className="flex flex-col gap-0.5 rounded-control border border-linea bg-[var(--flotante)] px-4 py-3"
          aria-live="polite"
          data-testid="seleccion-mapa"
        >
          <span
            className={`t-interfaz font-semibold ${seleccion.letra ? TEXTO_VEHICULO[seleccion.letra] : "text-senal"}`}
          >
            {seleccion.titulo}
          </span>
          <span className="t-nota">{seleccion.detalle}</span>
        </div>
      ) : null}
      <BarraEdicion e={edicion} restablecer />
      <InterruptorComparar comparar={comparar} onComparar={onComparar} />
      {comparar ? (
        <label className="t-interfaz flex items-center justify-between gap-3 text-texto-2">
          Superponer la {activa === "evidencia" ? "versión declarada" : "reconstrucción"}
          <input
            type="checkbox"
            checked={superponer}
            onChange={(e) => onSuperponer(e.target.checked)}
            className="h-[18px] w-[18px] accent-[var(--texto)]"
            data-testid="superponer"
          />
        </label>
      ) : null}
      <BotonDetalle />
      <Navegacion ancho />
    </PanelMapa>
  );
}

/** La leyenda del mapa (arriba a la derecha). */
export function Leyenda({ nombres }: { nombres: Nombres }) {
  const fila = (simbolo: ReactNode, texto: ReactNode) => (
    <div className="flex items-center gap-2.5">
      <span className="flex w-3 justify-center" aria-hidden="true">
        {simbolo}
      </span>
      {texto}
    </div>
  );
  return (
    <aside
      className="vidrio pointer-events-auto hidden w-[232px] flex-col gap-3 p-[18px] text-[0.8125rem] text-texto-2 lg:flex"
      aria-label="Leyenda del mapa"
      data-testid="leyenda"
    >
      <p className="t-rotulo">Leyenda</p>
      {(["A", "B"] as const).map((l) => (
        <div key={l}>
          {fila(
            <span className={`block h-[26px] w-3 rounded ${FONDO_VEHICULO[l]}`} />,
            <span className="text-texto">{nombres[l]}</span>,
          )}
        </div>
      ))}
      {fila(
        <span className="block h-[26px] w-3 rounded border-[1.5px] border-dashed border-texto-3" />,
        "Posición inicial",
      )}
      {fila(<span className="font-bold text-senal">✕</span>, "Punto de impacto")}
      {fila(
        <span className="block h-3 w-3 rounded-[3px] bg-[repeating-linear-gradient(45deg,var(--texto-2)_0_2px,transparent_2px_5px)]" />,
        "Zona de restos",
      )}
      {fila(
        <span className="block w-3 border-t-2 border-dashed border-texto-3" />,
        "Versión superpuesta",
      )}
    </aside>
  );
}

export const VELOCIDADES = [0.1, 0.25, 1] as const;
export type Velocidad = (typeof VELOCIDADES)[number];

/**
 * El reproductor de la versión (ADR 0057): reproducir o pausar, una línea de tiempo con sus eventos
 * (aproximación, impacto, reposo de cada vehículo) y la velocidad (0.1×, 0.25×, 1×). Los eventos que
 * caen en el mismo momento van juntos.
 */
export function Reproductor({
  t,
  reproduciendo,
  eventos,
  velocidad,
  onVelocidad,
  onReproducir,
  onPausar,
  onT,
  ancho = "w-[640px]",
}: {
  /** Progreso de 0 a 1. */
  t: number;
  reproduciendo: boolean;
  eventos: EventoLinea[];
  velocidad: Velocidad;
  onVelocidad: (v: Velocidad) => void;
  onReproducir: () => void;
  onPausar: () => void;
  onT: (t: number) => void;
  ancho?: string;
}) {
  const grupos: EventoLinea[] = [];
  for (const e of eventos) {
    const g = grupos.find((x) => Math.abs(x.t - e.t) < 0.04);
    if (g) g.etiqueta = `${g.etiqueta} · ${e.etiqueta.toLowerCase()}`;
    else grupos.push({ ...e });
  }
  return (
    <div
      className={`vidrio pointer-events-auto flex ${ancho} max-w-full items-center gap-4 rounded-[32px] py-3 pr-3 pl-3`}
      data-testid="reproductor"
    >
      <button
        type="button"
        className="grid h-11 w-11 flex-none place-items-center rounded-full bg-accion text-sm text-accion-texto"
        onClick={reproduciendo ? onPausar : onReproducir}
        aria-label={reproduciendo ? "Pausar" : "Reproducir"}
        data-testid="reproducir"
      >
        {reproduciendo ? "❚❚" : "▶"}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="relative h-4">
          <div className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-linea" />
          <div
            className="absolute top-1.5 left-0 h-1 rounded-full bg-texto"
            style={{ width: `${t * 100}%` }}
          />
          {grupos.slice(1).map((e) => (
            <span
              key={e.etiqueta}
              className={`absolute top-0.5 -ml-1.5 h-3 w-3 rounded-full ${/^Impacto/.test(e.etiqueta) ? "bg-senal" : "border-2 border-texto-2 bg-fondo"}`}
              style={{ left: `${e.t * 100}%` }}
              aria-hidden="true"
            />
          ))}
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(t * 1000)}
            onChange={(e) => onT(Number(e.target.value) / 1000)}
            aria-label="Momento del choque"
            className="linea-tiempo absolute inset-0 w-full"
          />
        </div>
        <ol className="relative h-4 text-xs text-texto-3" data-testid="eventos">
          {grupos.map((e, i) => (
            <li
              key={e.etiqueta}
              className={`absolute whitespace-nowrap ${i === 0 ? "" : e.t > 0.9 ? "-translate-x-full" : "-translate-x-1/2"} ${Math.abs(t - e.t) < 0.04 ? "text-texto" : ""}`}
              style={{ left: `${e.t * 100}%` }}
            >
              {e.etiqueta}
            </li>
          ))}
        </ol>
      </div>
      <div className="flex gap-1" role="group" aria-label="Velocidad">
        {VELOCIDADES.map((v) => (
          <button
            key={v}
            type="button"
            className={`cifras h-9 rounded-control border px-2 text-xs ${velocidad === v ? "border-linea bg-superficie-alta text-texto" : "border-linea-suave text-texto-2"}`}
            aria-pressed={velocidad === v}
            onClick={() => onVelocidad(v)}
            data-testid={`velocidad-${v}`}
          >
            {v}×
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Paso 5: los daños                                                                          */
/* ------------------------------------------------------------------------------------------ */

export function PasoDanos({
  nombres,
  zonas,
  onZonas,
  frase,
  esperadas,
}: {
  /** Los daños que dejaría la maniobra declarada (`zonasEsperadasDeclarada`). */
  esperadas: Record<Letra, Zona[]>;
  nombres: Nombres;
  zonas: Record<Letra, Zona[]>;
  onZonas: (l: Letra, z: Zona[]) => void;
  frase: string;
}) {
  return (
    <Pagina>
      <header className="flex max-w-[820px] flex-col gap-3">
        <Rotulo />
        <h1 className="t-titulo">Dónde están los daños</h1>
        <Frase>{frase}</Frase>
      </header>
      <div className="grid gap-5 md:grid-cols-2">
        {(
          [
            [
              "Dónde están",
              "Según la observación del reporte de CESVI. Toca una zona para corregirla.",
              zonas,
              true,
            ],
            [
              "Con la maniobra declarada, para comparar",
              "Una reversa deja los daños al centro. Es información para el perito.",
              esperadas,
              false,
            ],
          ] as const
        ).map(([titulo, nota, z, editable]) => (
          <section key={titulo} className="tarjeta flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-1">
              <h2 className="t-subtitulo">{titulo}</h2>
              <p className="t-nota">{nota}</p>
            </div>
            <div className="hundido flex items-end justify-center gap-10 p-6">
              {(["A", "B"] as const).map((l) => (
                <figure key={l} className="flex flex-col items-center gap-3">
                  <div className="h-[34vh] max-h-72 min-h-40">
                    <Silueta
                      zonas={z[l]}
                      etiqueta={`${nombres[l]}, ${titulo.toLowerCase()}`}
                      letra={l}
                      onCambio={editable ? (nuevas) => onZonas(l, nuevas) : undefined}
                      testid={`silueta-${editable ? "real" : "declarada"}-${l}`}
                    />
                  </div>
                  <figcaption className="flex flex-col items-center gap-1.5 text-center">
                    <EtiquetaVehiculo letra={l} nombre={nombres[l]} />
                    <span className="t-nota">
                      {z[l].length
                        ? z[l].map((q) => NOMBRE_ZONA[q]).join(", ")
                        : "sin daño marcado"}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Navegacion />
        <BotonDetalle />
      </div>
    </Pagina>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Paso 6: los números (maqueta Paso6)                                                        */
/* ------------------------------------------------------------------------------------------ */

/** Decimales para el número de Croquis en la tabla: los del reporte. */
const signo = (x: number, d: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}`;

function TablaReproduccion({
  filas,
  onFormulas,
  onCerrar,
}: {
  filas: FilaReproduccion[];
  onFormulas: () => void;
  onCerrar: () => void;
}) {
  return (
    <section aria-label="Reproducción del reporte" className="tarjeta overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between gap-4 border-b border-linea-suave px-6 py-4">
        <h2 className="t-interfaz font-semibold">Reproducción del reporte</h2>
        <div className="flex gap-2">
          <button type="button" className="boton-secundario boton-compacto" onClick={onFormulas}>
            Ver fórmulas
          </button>
          <button
            type="button"
            className="boton-secundario boton-compacto w-10 px-0 text-texto-2"
            onClick={onCerrar}
            aria-label="Ocultar la tabla"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-texto-3">
              <th className="px-6 py-3 font-medium">Valor</th>
              <th className="px-6 py-3 text-right font-medium">Reporte</th>
              <th className="px-6 py-3 text-right font-medium">Croquis</th>
              <th className="px-6 py-3 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody className="cifras">
            {filas.map((f) => {
              const difiere = Math.abs(f.diferenciaPct) >= 0.005;
              return (
                <tr key={f.clave} className="border-t border-linea-suave" data-fila={f.clave}>
                  <td className="px-6 py-3.5 font-sans">
                    {f.concepto} <span className="text-texto-3">· {f.partida}</span>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    {f.reporte.toFixed(f.decimalesReporte)} {f.unidad}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    {f.croquis.toFixed(Math.min(f.decimalesReporte + 2, 4))} {f.unidad}
                  </td>
                  <td
                    className={`px-6 py-3.5 text-right ${difiere ? "text-senal-texto" : "text-texto-2"}`}
                  >
                    {signo(f.diferenciaPct, Math.abs(f.diferenciaPct) < 0.01 && difiere ? 4 : 2)} %
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PasoNumeros({
  impactoKmh,
  desplazamientoKmh,
  distanciaM,
  coeficiente,
  nombres,
  comparacion,
  filas,
  frase,
}: {
  impactoKmh: number | null;
  desplazamientoKmh: number | null;
  distanciaM: number | null;
  coeficiente: number;
  nombres: Nombres;
  comparacion: ComparacionVelocidades | null;
  filas: FilaReproduccion[];
  frase: string;
}) {
  const { abrirDetalle } = useRecorrido();
  const [tabla, setTabla] = useState(true);
  const valores = [impactoKmh, desplazamientoKmh].filter((v): v is number => v !== null);
  const escala = Math.max(100, Math.ceil((Math.max(0, ...valores) * 1.2) / 10) * 10);
  const pos = (v: number) => `${(v / escala) * 100}%`;
  const titulo = comparacion?.significativa
    ? "Los dos cálculos no llegan al mismo número"
    : "Dos cálculos independientes llegan casi al mismo número";
  return (
    <Pagina ancho="max-w-[1200px]">
      <header className="flex flex-col items-center gap-3 text-center">
        <Rotulo />
        <h1 className="t-titulo max-w-[30ch]">{titulo}</h1>
        <Frase className="max-w-[60ch]">{frase}</Frase>
      </header>
      <div className="grid gap-6 md:grid-cols-2">
        {(
          [
            [
              <>
                Por la deformación del frente de <EtiquetaVehiculo letra="B" nombre={nombres.B} />
              </>,
              impactoKmh,
              "numero-impacto",
              "Método McHenry · 4 medidas · C1–C4",
            ],
            [
              <>
                Por los <span className="cifras">{distanciaM ?? "—"} m</span> de restos de{" "}
                <EtiquetaVehiculo letra="A" nombre={nombres.A} />
              </>,
              desplazamientoKmh,
              "numero-desplazamiento",
              `v = √(2 · a · g · D) · a = ${coeficiente}`,
            ],
          ] as const
        ).map(([etiqueta, valor, testid, metodo]) => (
          <div key={testid} className="tarjeta flex flex-col gap-3 rounded-3xl p-8">
            <span className="t-interfaz flex flex-wrap items-center gap-2 text-texto-2">
              {etiqueta}
            </span>
            <span className="flex items-baseline gap-3">
              <span className="t-numero">
                {valor === null ? (
                  "—"
                ) : (
                  <NumeroAnimado valor={valor} decimales={2} testid={testid} />
                )}
              </span>
              <span className="text-[1.375rem] font-medium text-texto-2">km/h</span>
            </span>
            <span className="cifras text-[0.8125rem] text-texto-3">{metodo}</span>
          </div>
        ))}
      </div>
      {impactoKmh !== null && desplazamientoKmh !== null ? (
        <div className="relative h-14" aria-hidden="true">
          <div className="absolute inset-x-0 top-[26px] h-1 rounded-full bg-linea-suave" />
          <div
            className="absolute top-[18px] h-5 rounded-md border border-texto/40 bg-texto/15"
            style={{
              left: pos(Math.min(impactoKmh, desplazamientoKmh)),
              width: `max(4px, ${(Math.abs(impactoKmh - desplazamientoKmh) / escala) * 100}%)`,
            }}
          />
          <span
            className="cifras absolute top-0 -translate-x-full pr-2 text-xs text-texto-2"
            style={{ left: pos(Math.min(impactoKmh, desplazamientoKmh)) }}
          >
            {Math.min(impactoKmh, desplazamientoKmh).toFixed(2)}
          </span>
          <span
            className="cifras absolute top-0 pl-2 text-xs text-texto"
            style={{ left: pos(Math.max(impactoKmh, desplazamientoKmh)) }}
          >
            {Math.max(impactoKmh, desplazamientoKmh).toFixed(2)}
          </span>
          <span className="cifras absolute top-10 left-0 text-xs text-texto-3">0</span>
          <span className="cifras absolute top-10 right-0 text-xs text-texto-3">{escala} km/h</span>
        </div>
      ) : null}
      {comparacion && impactoKmh !== null && desplazamientoKmh !== null ? (
        <div className="flex flex-wrap items-center justify-center gap-4">
          <span
            className={`inline-flex h-10 items-center rounded-full px-[18px] text-[0.9375rem] font-semibold ${comparacion.significativa ? "bg-senal text-fondo" : "bg-accion text-accion-texto"}`}
            data-testid="conclusion-numeros"
          >
            {comparacion.significativa
              ? "Diferencia significativa"
              : "Sin diferencia significativa"}
          </span>
          <span className="cifras text-[0.9375rem] text-texto-2">
            Δ {Math.abs(impactoKmh - desplazamientoKmh).toFixed(2)} km/h ·{" "}
            {comparacion.diferenciaPct.toFixed(2)} %
          </span>
          <button
            type="button"
            className="boton-secundario boton-compacto text-texto-2"
            onClick={abrirDetalle}
          >
            Umbral del perito: {comparacion.umbralPct} %
          </button>
        </div>
      ) : null}
      {tabla ? (
        <TablaReproduccion
          filas={filas}
          onFormulas={abrirDetalle}
          onCerrar={() => setTabla(false)}
        />
      ) : (
        <button
          type="button"
          className="boton-secundario boton-compacto self-center"
          onClick={() => setTabla(true)}
        >
          Ver la reproducción del reporte
        </button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Navegacion />
        <BotonDetalle />
      </div>
    </Pagina>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Paso 7: Croquis contra el reporte de CESVI (maqueta Paso7)                                         */
/* ------------------------------------------------------------------------------------------ */

/** La primera oración de un texto (con su punto). */
const primeraFrase = (t: string) => /^.*?\.(?=\s|$)/.exec(t)?.[0] ?? t;

/** Qué indica cada razón respecto a la declaración, sin juzgar a nadie. */
const SENTIDO = {
  contra_declarada: "no coincide con la declaración",
  a_favor_declarada: "coincide con la declaración",
  sin_dato: "sin dato",
} as const;
const NOMBRE_RAZON = {
  velocidades: "Velocidades",
  desplazamiento: "Restos",
  ubicacion_danos: "Daños",
} as const;

const DECISION = { aceptada: "aceptó", editada: "editó", rechazada: "rechazó" } as const;

export function TextoValidacion({ validacion }: { validacion: Validacion }) {
  return (
    <span role="status" data-testid="validacion">
      {validacion.perito} {DECISION[validacion.decision]} la comparación con el reporte de CESVI el{" "}
      {new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(validacion.fecha))}.
    </span>
  );
}

/** La diferencia de una fila: el porcentaje si es numérica; si no, si llegan a lo mismo. */
function Diferencia({ f }: { f: FilaContraDictamen }) {
  if (f.coincide === null) return <span className="text-texto-3">—</span>;
  if (f.diferenciaPct === null) {
    return (
      <span className={f.coincide ? "text-texto-2" : "font-semibold text-senal-texto"}>
        {f.coincide ? "Coincide" : "Difiere"}
      </span>
    );
  }
  return (
    <span className={f.coincide ? "text-texto-2" : "font-semibold text-senal-texto"}>
      {signo(f.diferenciaPct, 2)} %
    </span>
  );
}

/** El razonamiento de la declaración, como indicadores para el perito (complemento opcional). */
function ComparacionDeclaracion({
  sugerencia,
  cambios,
  pasoDeRazon,
  nombres,
  zonas,
  impactoKmh,
  desplazamientoKmh,
  restosEvidencia,
}: {
  sugerencia: Sugerencia;
  cambios: Comparacion;
  pasoDeRazon: Record<string, number>;
  nombres: Nombres;
  zonas: Record<Letra, Zona[]>;
  impactoKmh: number | null;
  desplazamientoKmh: number | null;
  restosEvidencia: number | null;
}) {
  const { irA } = useRecorrido();
  const [verSugerencia, setVerSugerencia] = useState(false);
  const miniatura = (clave: keyof typeof NOMBRE_RAZON): ReactNode => {
    if (clave === "desplazamiento") {
      const maximo = Math.max(restosEvidencia ?? 0, 1);
      return (
        <div className="flex flex-col gap-2.5">
          {(
            [
              ["Declarada", 0],
              ["Reconstrucción", restosEvidencia],
            ] as const
          ).map(([nombre, m]) => (
            <div key={nombre} className="flex items-center gap-2.5 text-xs text-texto-2">
              <span className="w-[96px]">{nombre}</span>
              <span
                className="h-2 rounded bg-texto"
                style={{ width: m ? `${(m / maximo) * 50}%` : "4px", opacity: m ? 1 : 0.3 }}
              />
              <span className="cifras whitespace-nowrap text-texto">
                {m === null ? "—" : `${m} m`}
              </span>
            </div>
          ))}
        </div>
      );
    }
    if (clave === "velocidades") {
      return (
        <div className="grid grid-cols-2 gap-2.5">
          {(
            [
              ["Deformación", impactoKmh],
              ["Restos", desplazamientoKmh],
            ] as const
          ).map(([nombre, v]) => (
            <div key={nombre}>
              <div className="text-xs text-texto-3">{nombre}</div>
              <div className="cifras text-[1.625rem] font-semibold">
                {v === null ? "—" : v.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center gap-7">
        {(["A", "B"] as const).map((l) => (
          <div key={l} className="h-[68px]">
            <Silueta zonas={zonas[l]} etiqueta={nombres[l]} letra={l} />
          </div>
        ))}
      </div>
    );
  };
  return (
    <details className="tarjeta rounded-[22px] px-6 py-5" data-testid="comparacion-declaracion">
      <summary className="t-interfaz cursor-pointer font-semibold">
        Comparación con la declaración del conductor · opcional
      </summary>
      <div className="mt-5 flex flex-col gap-5">
        <p className="t-nota max-w-[70ch]">
          Lo que cambia entre la declaración y la reconstrucción de Croquis, como información para
          el perito. Croquis no dice quién tiene razón: el perito concluye.
        </p>
        <ol className="grid gap-5 md:grid-cols-3">
          {sugerencia.razones.map((r, i) => (
            <li key={r.clave} className="hundido flex flex-col gap-[18px] rounded-[18px] p-5">
              <span className="t-rotulo flex flex-wrap items-center justify-between gap-2 text-[0.8125rem]">
                <span>
                  {String(i + 1).padStart(2, "0")} · {NOMBRE_RAZON[r.clave]}
                </span>
                <Insignia tipo={r.sentido === "contra_declarada" ? "normal" : "supuesto"}>
                  {SENTIDO[r.sentido]}
                </Insignia>
              </span>
              <div className="rounded-[14px] bg-fondo p-4">{miniatura(r.clave)}</div>
              <p className="text-base leading-snug font-medium">{primeraFrase(r.texto)}</p>
              {pasoDeRazon[r.clave] !== undefined ? (
                <button
                  type="button"
                  className="t-interfaz mt-auto self-start text-texto-2 hover:text-texto"
                  onClick={() => irA(pasoDeRazon[r.clave]!)}
                >
                  Ver en el paso {pasoDeRazon[r.clave]! + 1} →
                </button>
              ) : null}
            </li>
          ))}
        </ol>
        <TablaCambios c={cambios} />
        {verSugerencia ? (
          <div className="hundido flex flex-col gap-1.5 p-4" data-testid="sugerencia">
            <span className="t-rotulo">Sugerencia de Croquis sobre la declaración</span>
            <p className="t-interfaz">{sugerencia.texto}</p>
            <p className="t-nota">{sugerencia.regla}</p>
          </div>
        ) : (
          <button
            type="button"
            className="boton-secundario boton-compacto self-start"
            onClick={() => setVerSugerencia(true)}
            data-testid="ver-sugerencia"
          >
            Ver la sugerencia de Croquis sobre la declaración
          </button>
        )}
      </div>
    </details>
  );
}

export function PasoContraDictamen({
  contra,
  sugerencia,
  pasoDeRazon,
  validacion,
  onValidar,
  nombres,
  zonas,
  impactoKmh,
  desplazamientoKmh,
  restosEvidencia,
  cambios,
}: {
  contra: ContraDictamen;
  cambios: Comparacion;
  sugerencia: Sugerencia;
  pasoDeRazon: Record<string, number>;
  validacion: Validacion | null;
  onValidar: (v: Validacion) => void;
  nombres: Nombres;
  zonas: Record<Letra, Zona[]>;
  impactoKmh: number | null;
  desplazamientoKmh: number | null;
  restosEvidencia: number | null;
}) {
  const { irA, paso } = useRecorrido();
  const [perito, setPerito] = useState("");
  const [modo, setModo] = useState<"ver" | "editada" | "rechazada">("ver");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const validar = (decision: Validacion["decision"]) => {
    if (!perito.trim()) return setError("Escribe tu nombre para validar.");
    if (decision !== "aceptada" && !texto.trim()) return setError("Escribe la conclusión.");
    setError(null);
    onValidar({
      decision,
      conclusion: decision === "aceptada" ? contra.resumen : texto.trim(),
      perito: perito.trim(),
      fecha: new Date().toISOString(),
    });
    setModo("ver");
    irA(paso + 1);
  };
  const e = contra.energia;
  return (
    <Pagina>
      <header className="flex max-w-[820px] flex-col gap-4">
        <Rotulo extra="Reproducción del reporte" senal />
        <h1 className="t-lanzamiento" data-testid="titulo-contra">
          Croquis contra el reporte de CESVI
        </h1>
        <div data-testid="resumen-contra">
          <Frase>{contra.resumen}</Frase>
        </div>
      </header>
      <section
        aria-label="Croquis contra el reporte de CESVI"
        className="tarjeta overflow-hidden rounded-3xl"
        data-testid="contra-dictamen"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-texto-3">
                <th className="px-6 py-3 font-medium">Punto</th>
                <th className="px-6 py-3 font-medium">Concluyó CESVI</th>
                <th className="px-6 py-3 font-medium">Obtuvo Croquis</th>
                <th className="px-6 py-3 text-right font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {contra.filas.map((f) => (
                <tr
                  key={f.clave}
                  className="border-t border-linea-suave align-top"
                  data-fila={f.clave}
                  title={f.fuente}
                >
                  <td className="px-6 py-3.5 font-medium">{f.concepto}</td>
                  <td className="cifras px-6 py-3.5">{f.cesvi}</td>
                  <td className="cifras px-6 py-3.5">{f.croquis}</td>
                  <td className="cifras px-6 py-3.5 text-right">
                    <Diferencia f={f} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {e ? (
        <section
          className="tarjeta flex flex-col gap-3 rounded-[22px] px-6 py-5"
          data-testid="discrepancia-energia"
        >
          <span className="t-interfaz font-semibold">La diferencia de energía, explicada</span>
          <p className="t-cuerpo max-w-[75ch]">
            Con los datos que imprime el reporte (L, A, B y C1–C4), la energía de deformación es{" "}
            <span className="cifras">{e.croquis.toFixed(3)}</span>; el reporte imprime{" "}
            <span className="cifras">{e.dictamen.toFixed(3)}</span> (
            <span className="cifras">{signo(e.diferenciaPct, 2)} %</span>). Por eso la velocidad por
            deformación de Croquis difiere de la del reporte. {e.lectura}
          </p>
          <button
            type="button"
            className="t-interfaz self-start text-texto-2 hover:text-texto"
            onClick={() => irA(5)}
          >
            Ver el cálculo en el paso 6 →
          </button>
        </section>
      ) : null}
      <section className="tarjeta flex flex-col gap-4 rounded-[22px] px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <span className="t-interfaz font-semibold">El perito concluye</span>
            <span className="t-nota text-texto-3">
              {validacion ? (
                <TextoValidacion validacion={validacion} />
              ) : (
                "Pendiente · se registra quién valida y cuándo"
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              className="campo h-12 w-56 rounded-full px-5"
              value={perito}
              onChange={(ev) => setPerito(ev.target.value)}
              placeholder="Nombre del perito"
              aria-label="Nombre del perito que valida"
              data-testid="perito"
            />
            <button
              type="button"
              className="boton-secundario text-texto-2"
              onClick={() => {
                setModo("rechazada");
                setTexto("");
              }}
            >
              Rechazar
            </button>
            <button
              type="button"
              className="boton-secundario"
              onClick={() => {
                setModo("editada");
                setTexto(contra.resumen);
              }}
            >
              Editar
            </button>
            <button
              type="button"
              className="boton-principal"
              onClick={() => validar("aceptada")}
              data-testid="aceptar"
            >
              Aceptar y seguir →
            </button>
          </div>
        </div>
        {modo !== "ver" ? (
          <div className="flex flex-col gap-2">
            <textarea
              className="campo min-h-20"
              value={texto}
              onChange={(ev) => setTexto(ev.target.value)}
              aria-label="Conclusión del perito"
            />
            <button
              type="button"
              className="boton-principal self-start"
              onClick={() => validar(modo)}
            >
              Guardar la conclusión y seguir →
            </button>
          </div>
        ) : null}
        {error ? <p className="t-nota text-senal-texto">{error}</p> : null}
      </section>
      <ComparacionDeclaracion
        sugerencia={sugerencia}
        cambios={cambios}
        pasoDeRazon={pasoDeRazon}
        nombres={nombres}
        zonas={zonas}
        impactoKmh={impactoKmh}
        desplazamientoKmh={desplazamientoKmh}
        restosEvidencia={restosEvidencia}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Navegacion />
        <BotonDetalle />
      </div>
    </Pagina>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Paso 8: el dictamen                                                                        */
/* ------------------------------------------------------------------------------------------ */

export interface IncluirPaso {
  croquisAmbas: boolean;
  calculos: boolean;
  tablaDatos: boolean;
  notasInternas: boolean;
}

export function PasoDictamen({
  url,
  estado,
  onGenerar,
  onDescargar,
  onWord,
  onPng,
  onJson,
  validacion,
  frase,
  incluir,
  onIncluir,
  trazabilidad,
  antesDeFirmar,
  notas,
  onNotas,
  hayCroquis,
}: {
  url: string | null;
  estado: string | null;
  onGenerar: () => void;
  onDescargar: () => void;
  onWord: () => void;
  onPng: () => void;
  onJson: () => void;
  validacion: Validacion | null;
  frase: string;
  incluir: IncluirPaso;
  onIncluir: (i: IncluirPaso) => void;
  trazabilidad: { metodo: string; huella: string; comparacion: string; valido: string };
  antesDeFirmar: { texto: string; paso: number }[];
  notas: string;
  onNotas: (t: string) => void;
  hayCroquis: boolean;
}) {
  const { irA } = useRecorrido();
  const [copiado, setCopiado] = useState(false);
  const casillas: [keyof IncluirPaso, string][] = [
    ["croquisAmbas", "Croquis de ambas versiones"],
    ["calculos", "Cálculos con valores sustituidos"],
    ["tablaDatos", "Tabla de datos y su fuente"],
    ["notasInternas", "Notas internas del perito"],
  ];
  const textoTraza = `Método: ${trazabilidad.metodo}\nHuella de entradas: ${trazabilidad.huella}\nComparación con el reporte de CESVI: ${trazabilidad.comparacion}\nValidó: ${trazabilidad.valido}`;
  return (
    <Pagina ancho="max-w-[1320px]">
      <div className="flex flex-wrap items-start gap-8">
        <div className="tarjeta flex min-h-[78vh] min-w-0 flex-[999_1_560px] flex-col rounded-3xl p-6">
          {url ? (
            <iframe
              title="Vista previa del dictamen"
              src={url}
              className="min-h-[74vh] w-full flex-1 rounded-control bg-white"
              data-testid="vista-previa"
            />
          ) : (
            <div className="t-nota grid flex-1 place-items-center">Armando el dictamen…</div>
          )}
        </div>
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
          <header className="flex flex-col gap-2">
            <Rotulo extra="Dictamen" />
            <h1 className="t-titulo">
              {validacion ? "Listo para firmar" : "Borrador del dictamen"}
            </h1>
            <Frase>{frase}</Frase>
          </header>
          {antesDeFirmar.length ? (
            <section
              className="flex flex-col gap-2 rounded-[18px] border border-senal/45 bg-[var(--falta-fondo)] p-4"
              data-testid="antes-de-firmar"
            >
              <p className="t-rotulo text-senal-texto">
                Antes de firmar · {antesDeFirmar.length}{" "}
                {antesDeFirmar.length === 1 ? "nota" : "notas"}
              </p>
              <ul className="flex flex-col gap-2">
                {antesDeFirmar.map((n) => (
                  <li key={n.texto} className="text-sm">
                    {n.texto}{" "}
                    <button type="button" className="underline" onClick={() => irA(n.paso)}>
                      Revisar en el paso {n.paso + 1} →
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="tarjeta flex flex-col gap-3 p-4">
            <button
              type="button"
              className="boton-principal h-14 text-base"
              onClick={onDescargar}
              data-testid="descargar-pdf"
              disabled={!url}
            >
              Descargar PDF
            </button>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className="boton-secundario boton-compacto"
                onClick={onWord}
                data-testid="descargar-word"
              >
                Word
              </button>
              <button
                type="button"
                className="boton-secundario boton-compacto"
                onClick={onPng}
                disabled={!hayCroquis}
                data-testid="descargar-png"
              >
                Croquis PNG
              </button>
              <button
                type="button"
                className="boton-secundario boton-compacto"
                onClick={onJson}
                data-testid="descargar-json"
              >
                Caso JSON
              </button>
            </div>
            {estado ? (
              <p role="status" className="t-nota">
                {estado}
              </p>
            ) : null}
          </section>
          <section className="tarjeta flex flex-col gap-2.5 p-4" aria-label="Incluir">
            <p className="t-rotulo">Incluir</p>
            {casillas.map(([k, texto]) => (
              <label
                key={k}
                className="flex items-center justify-between gap-3 text-sm text-texto-2"
              >
                {texto}
                <input
                  type="checkbox"
                  checked={incluir[k]}
                  onChange={(e) => onIncluir({ ...incluir, [k]: e.target.checked })}
                  className="h-[18px] w-[18px] accent-[var(--texto)]"
                  data-testid={`incluir-${k}`}
                />
              </label>
            ))}
            {incluir.notasInternas ? (
              <textarea
                className="campo min-h-20 text-sm"
                value={notas}
                onChange={(e) => onNotas(e.target.value)}
                onBlur={onGenerar}
                placeholder="Notas internas del perito (van en el dictamen solo si esta casilla está marcada)"
                aria-label="Notas internas del perito"
              />
            ) : null}
          </section>
          <section
            className="tarjeta flex flex-col gap-2 p-4"
            aria-label="Trazabilidad"
            data-testid="trazabilidad"
          >
            <p className="t-rotulo">Trazabilidad</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-texto-2">Método</dt>
              <dd className="cifras text-right">{trazabilidad.metodo}</dd>
              <dt className="text-texto-2">Huella de entradas</dt>
              <dd className="cifras text-right">{trazabilidad.huella}</dd>
              <dt className="text-texto-2">Comparación con el reporte de CESVI</dt>
              <dd className="text-right">{trazabilidad.comparacion}</dd>
              <dt className="text-texto-2">Validó</dt>
              <dd className="text-right">{trazabilidad.valido}</dd>
            </dl>
            <button
              type="button"
              className="boton-secundario boton-compacto mt-1"
              onClick={() =>
                void navigator.clipboard
                  .writeText(textoTraza)
                  .then(() => setCopiado(true))
                  .catch(() => setCopiado(false))
              }
            >
              {copiado ? "Copiado" : "Copiar datos de trazabilidad"}
            </button>
          </section>
          {validacion ? (
            <p className="t-nota">
              <TextoValidacion validacion={validacion} />
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Navegacion />
            <BotonDetalle />
          </div>
        </div>
      </div>
    </Pagina>
  );
}
