"use client";
/**
 * Las pantallas del recorrido del perito (docs/cesvi/PROTOTIPO.md, «Recorrido del perito»; ADR
 * 0052). Cada una muestra poco texto y lo demás va al panel de detalle; el estado vive en
 * `recorrido.tsx`.
 */
import {
  NOMBRE_ZONA,
  type CasoCesvi,
  type ClaveVersion,
  type ComparacionVelocidades,
  type DatoEntendido,
  type Interpretacion,
  type Sugerencia,
  type Validacion,
  type Zona,
} from "@croquis/cesvi";
import { useId, useState } from "react";
import { NumeroAnimado, Silueta } from "./piezas";

const FUENTE: Record<DatoEntendido["fuente"], string> = {
  declaracion: "declaración",
  expediente: "expediente",
  perito: "perito",
  supuesto: "supuesto",
};
const POR: Record<DatoEntendido["entendidoPor"], string> = {
  ia: "IA",
  reglas: "reglas",
  perito: "perito",
};

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );

/** Paso 1: el caso, los dos vehículos vistos desde arriba y la declaración como cita. */
export function PasoCaso({ caso }: { caso: CasoCesvi }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-4 text-center">
      <p className="t-cota text-texto-2">
        {caso.aseguradora} · siniestro {caso.id} · {fecha(caso.fecha_hora.valor)},{" "}
        {caso.fecha_hora.aproximada ? "aprox. " : ""}
        {caso.fecha_hora.valor.slice(11)} h
      </p>
      <div className="flex items-end justify-center gap-10 md:gap-20">
        {(["A", "B"] as const).map((l) => (
          <figure key={l} className="flex h-[38vh] flex-col items-center gap-3">
            <Silueta zonas={[]} etiqueta={`Vehículo ${l}`} />
            <figcaption className="t-interfaz">
              <span className="t-titulo block">{l}</span>
              {caso.vehiculos[l].marca} {caso.vehiculos[l].tipo} {caso.vehiculos[l].modelo}
            </figcaption>
          </figure>
        ))}
      </div>
      <blockquote
        className="t-subtitulo max-w-[60ch] border-l-2 border-evidencia pl-4 text-left"
        lang="es-MX"
        data-testid="declaracion"
      >
        «{caso.declaracion.texto}»
        <span className="t-nota mt-2 block text-texto-2">
          Conductor del vehículo {caso.declaracion.conductor}
        </span>
      </blockquote>
    </div>
  );
}

/** El texto con las frases que entendió Croquis subrayadas (y numeradas para ligarlas a sus datos). */
function TextoSubrayado({ texto, datos }: { texto: string; datos: DatoEntendido[] }) {
  const frases = datos
    .map((d, i) => ({ d, i }))
    .filter((x) => x.d.frase)
    .sort((a, b) => a.d.frase!.inicio - b.d.frase!.inicio);
  const partes: React.ReactNode[] = [];
  let desde = 0;
  for (const { d, i } of frases) {
    const f = d.frase!;
    if (f.inicio < desde) continue;
    partes.push(texto.slice(desde, f.inicio));
    partes.push(
      <mark
        key={i}
        className="bg-transparent text-texto underline decoration-evidencia decoration-2 underline-offset-4"
        data-dato={d.clave}
      >
        {texto.slice(f.inicio, f.fin)}
        <sup className="t-nota ml-0.5 text-evidencia">{i + 1}</sup>
      </mark>,
    );
    desde = f.fin;
  }
  partes.push(texto.slice(desde));
  return <>{partes}</>;
}

/** Paso 2: la narración y lo que entiende la IA, con sus preguntas. */
export function PasoNarracion({
  declaracion,
  interpretacion,
  notas,
  onNotas,
  estado,
  onLeer,
  reversaM,
  onReversaM,
  onImpacta,
}: {
  declaracion: string;
  interpretacion: Interpretacion;
  notas: string;
  onNotas: (t: string) => void;
  estado: string | null;
  onLeer: () => void;
  reversaM: number | null;
  onReversaM: (m: number | null) => void;
  onImpacta: (v: "B_a_A" | "A_a_B") => void;
}) {
  const id = useId();
  return (
    <div className="grid h-full gap-8 overflow-y-auto px-4 py-6 md:grid-cols-2 md:px-10">
      <div className="flex flex-col gap-4">
        <p className="t-subtitulo leading-relaxed" lang="es-MX" data-testid="texto-subrayado">
          «<TextoSubrayado texto={declaracion} datos={interpretacion.datos} />»
        </p>
        <label htmlFor={`${id}-notas`} className="t-nota text-texto-2">
          Narración o notas del perito
        </label>
        <textarea
          id={`${id}-notas`}
          className="campo min-h-24"
          value={notas}
          onChange={(e) => onNotas(e.target.value)}
          placeholder="Por ejemplo: según el croquis de tránsito, retrocedió 3 m"
          data-testid="notas-perito"
        />
        <button
          type="button"
          className="boton-secundario min-h-11 self-start px-4"
          onClick={onLeer}
          data-testid="leer-ia"
        >
          Leer con IA
        </button>
        {estado ? (
          <p role="status" className="t-nota text-texto-2">
            {estado}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        <ol className="flex flex-col gap-2" data-testid="datos-entendidos">
          {interpretacion.datos.map((d, i) => (
            <li key={d.clave} className="t-interfaz flex gap-3 border-b border-linea pb-2">
              <span className="t-nota text-evidencia">{d.frase ? i + 1 : "·"}</span>
              <span className="flex-1">
                <span className="t-nota block text-texto-2">{d.etiqueta}</span>
                {d.valor}
              </span>
              <span className="t-nota self-start rounded-control border border-linea px-2 py-0.5 text-texto-2">
                {FUENTE[d.fuente]} · {POR[d.entendidoPor]}
              </span>
            </li>
          ))}
        </ol>
        {interpretacion.preguntas.length ? (
          <div className="flex flex-col gap-3" aria-label="Preguntas">
            {interpretacion.preguntas.map((p) =>
              p.clave === "reversa" ? (
                <label key={p.clave} className="t-interfaz flex flex-wrap items-center gap-3">
                  {p.texto}
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className="campo cifras w-24"
                    value={reversaM ?? ""}
                    onChange={(e) =>
                      onReversaM(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))
                    }
                    data-testid="respuesta-reversa"
                  />
                  m
                </label>
              ) : p.clave === "impacta" ? (
                <label key={p.clave} className="t-interfaz flex flex-wrap items-center gap-3">
                  {p.texto}
                  <select
                    className="campo w-44"
                    defaultValue=""
                    onChange={(e) => onImpacta(e.target.value as "B_a_A" | "A_a_B")}
                  >
                    <option value="" disabled>
                      Elige
                    </option>
                    <option value="B_a_A">B impacta a A</option>
                    <option value="A_a_B">A impacta a B</option>
                  </select>
                </label>
              ) : (
                <p key={p.clave} className="t-nota text-texto-2">
                  {p.texto}
                </p>
              ),
            )}
          </div>
        ) : null}
        {interpretacion.preguntas.every((p) => p.clave !== "reversa") &&
        interpretacion.dinamica.maniobraA === "reversa" ? (
          <label className="t-nota flex flex-wrap items-center gap-3 text-texto-2">
            Metros de reversa
            <input
              type="number"
              min={0}
              step={0.5}
              className="campo cifras w-24"
              value={reversaM ?? interpretacion.dinamica.reversaM ?? ""}
              onChange={(e) =>
                onReversaM(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))
              }
              data-testid="respuesta-reversa"
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

/** Paso 3: el lugar; si aún no hay punto de impacto, se marca aquí. */
export function PasoLugar({
  marcado,
  aviso,
  onCoordenadas,
}: {
  marcado: boolean;
  aviso: string | null;
  onCoordenadas: (lat: number, lon: number) => void;
}) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="pointer-events-none flex h-full items-start justify-end p-4">
      <div className="vidrio pointer-events-auto flex max-w-sm flex-col gap-3 p-4">
        {marcado ? (
          <p className="t-interfaz">Punto de impacto marcado. Puedes moverlo en el paso 4.</p>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(texto);
              const lat = m ? Number(m[1]) : Number.NaN;
              const lon = m ? Number(m[2]) : Number.NaN;
              if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) {
                setError("Latitud y longitud en grados decimales, por ejemplo 25.79, -108.99.");
                return;
              }
              setError(null);
              onCoordenadas(lat, lon);
            }}
          >
            <p className="t-interfaz">
              Toca el punto de impacto en el mapa o escribe sus coordenadas.
            </p>
            <input
              className="campo cifras"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="25.79, -108.99"
              aria-label="Coordenadas del punto de impacto (latitud, longitud)"
              data-testid="coordenadas"
            />
            <button type="submit" className="boton-principal">
              Marcar el impacto
            </button>
            {error ? <p className="t-nota">{error}</p> : null}
          </form>
        )}
        {aviso ? (
          <p role="status" className="t-nota text-texto-2">
            {aviso}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Paso 4: las dos versiones, con selector y la medida de la zona de restos. */
export function PasoVersiones({
  activa,
  onActiva,
  restosM,
  restosDictamen,
  animando,
  onRepetir,
  onUsarRestos,
}: {
  activa: ClaveVersion;
  onActiva: (k: ClaveVersion) => void;
  restosM: number | null;
  restosDictamen: number;
  animando: boolean;
  onRepetir: () => void;
  onUsarRestos: () => void;
}) {
  return (
    <div className="pointer-events-none flex h-full flex-col justify-between p-4">
      <div
        className="pointer-events-auto flex flex-wrap gap-2 self-center"
        role="group"
        aria-label="Versión"
      >
        {(["declarada", "evidencia"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={activa === k}
            className={`min-h-11 px-4 ${activa === k ? "boton-principal" : "boton-secundario"}`}
            onClick={() => onActiva(k)}
            data-testid={`version-${k}`}
          >
            {k === "declarada" ? "Versión declarada" : "Versión de la evidencia"}
          </button>
        ))}
        <button
          type="button"
          className="boton-secundario min-h-11 px-4"
          onClick={onRepetir}
          disabled={animando}
        >
          Repetir
        </button>
      </div>
      {restosM !== null ? (
        <div className="vidrio pointer-events-auto flex flex-col gap-2 self-start p-4">
          <p className="t-nota text-texto-2">Zona de restos</p>
          <p className="t-titulo text-evidencia" data-testid="restos-mapa">
            <NumeroAnimado key={`${activa}-${restosM.toFixed(2)}`} valor={restosM} decimales={2} />{" "}
            m
          </p>
          <p className="t-nota text-texto-2">El dictamen midió {restosDictamen} m.</p>
          <button
            type="button"
            className="boton-secundario min-h-11 px-4"
            onClick={onUsarRestos}
            data-testid="usar-restos"
          >
            Usar en el cálculo
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Paso 5: dónde están los daños contra dónde estarían si la declaración fuera cierta. */
export function PasoDanos({
  caso,
  zonas,
  onZonas,
}: {
  caso: CasoCesvi;
  zonas: Record<"A" | "B", Zona[]>;
  onZonas: (l: "A" | "B", z: Zona[]) => void;
}) {
  const esperadas: Record<"A" | "B", Zona[]> = { A: ["posterior_centro"], B: ["frontal_centro"] };
  return (
    <div className="grid h-full grid-cols-2 gap-6 overflow-y-auto px-4 py-6 md:px-16">
      {(
        [
          ["Dónde están", zonas, true],
          ["Si la declaración fuera cierta", esperadas, false],
        ] as const
      ).map(([titulo, z, editable]) => (
        <section key={titulo} className="flex flex-col items-center gap-4">
          <h3 className="t-subtitulo">{titulo}</h3>
          <div className="flex h-[48vh] items-end gap-6">
            {(["A", "B"] as const).map((l) => (
              <figure key={l} className="flex h-full flex-col items-center gap-2">
                <Silueta
                  zonas={z[l]}
                  etiqueta={`Vehículo ${l}, ${titulo.toLowerCase()}`}
                  onCambio={editable ? (nuevas) => onZonas(l, nuevas) : undefined}
                  testid={`silueta-${editable ? "real" : "declarada"}-${l}`}
                />
                <figcaption className="t-nota text-center text-texto-2">
                  {l} · {caso.vehiculos[l].tipo}
                  <span className="block">
                    {z[l].length ? z[l].map((q) => NOMBRE_ZONA[q]).join(", ") : "sin daño marcado"}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Paso 6: los dos números en grande y si difieren de forma significativa. */
export function PasoNumeros({
  impactoKmh,
  desplazamientoKmh,
  comparacion,
}: {
  impactoKmh: number | null;
  desplazamientoKmh: number | null;
  comparacion: ComparacionVelocidades | null;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 px-4 text-center">
      <div className="flex flex-wrap items-end justify-center gap-12 md:gap-24">
        {(
          [
            ["Por los daños de B", impactoKmh, "numero-impacto"],
            ["Por el desplazamiento de A", desplazamientoKmh, "numero-desplazamiento"],
          ] as const
        ).map(([etiqueta, valor, testid]) => (
          <div key={testid} className="flex flex-col gap-2">
            <span className="t-lanzamiento">
              {valor === null ? "—" : <NumeroAnimado valor={valor} decimales={2} testid={testid} />}
            </span>
            <span className="t-interfaz text-texto-2">km/h · {etiqueta}</span>
          </div>
        ))}
      </div>
      {comparacion ? (
        <p className="t-subtitulo" data-testid="conclusion-numeros">
          {comparacion.significativa ? "Diferencia significativa" : "Sin diferencia significativa"}
          <span className="t-nota block text-texto-2">
            {comparacion.diferenciaPct.toFixed(2)} % de diferencia; umbral del perito:{" "}
            {comparacion.umbralPct} %
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** La primera oración de un texto (con su punto). */
const primeraFrase = (t: string) => /^.*?\.(?=\s|$)/.exec(t)?.[0] ?? t;

const SENTIDO = {
  contra_declarada: "en contra de la declarada",
  a_favor_declarada: "a favor de la declarada",
  sin_dato: "sin dato suficiente",
} as const;

/** Paso 7: la sugerencia de Croquis con sus razones (cada una lleva a su paso) y la validación. */
export function PasoSugerencia({
  sugerencia,
  pasoDeRazon,
  onIrA,
  validacion,
  onValidar,
}: {
  sugerencia: Sugerencia;
  pasoDeRazon: Record<string, number>;
  onIrA: (paso: number) => void;
  validacion: Validacion | null;
  onValidar: (v: Validacion) => void;
}) {
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
      conclusion: decision === "aceptada" ? sugerencia.texto : texto.trim(),
      perito: perito.trim(),
      fecha: new Date().toISOString(),
    });
    setModo("ver");
  };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 overflow-y-auto px-4 py-6">
      <p className="t-capitulo max-w-[24ch] text-center" data-testid="sugerencia">
        {sugerencia.texto.split(":")[0]}.
      </p>
      <ol className="grid max-w-5xl gap-4 md:grid-cols-3">
        {sugerencia.razones.map((r, i) => (
          <li key={r.clave} className="vidrio flex flex-col gap-2 p-4">
            <span className="t-nota text-texto-2">
              Razón {i + 1} · {SENTIDO[r.sentido]}
            </span>
            <span className="t-interfaz">{primeraFrase(r.texto)}</span>
            {pasoDeRazon[r.clave] !== undefined ? (
              <button
                type="button"
                className="t-nota self-start underline"
                onClick={() => onIrA(pasoDeRazon[r.clave]!)}
              >
                Ver el paso {pasoDeRazon[r.clave]! + 1}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-end justify-center gap-3">
        <label className="t-nota flex flex-col gap-1 text-texto-2">
          Perito que valida
          <input
            className="campo w-64"
            value={perito}
            onChange={(e) => setPerito(e.target.value)}
            data-testid="perito"
          />
        </label>
        <button
          type="button"
          className="boton-principal"
          onClick={() => validar("aceptada")}
          data-testid="aceptar"
        >
          Aceptar
        </button>
        <button
          type="button"
          className="boton-secundario min-h-11 px-4"
          onClick={() => {
            setModo("editada");
            setTexto(sugerencia.texto);
          }}
        >
          Editar
        </button>
        <button
          type="button"
          className="boton-secundario min-h-11 px-4"
          onClick={() => {
            setModo("rechazada");
            setTexto("");
          }}
        >
          Rechazar
        </button>
      </div>
      {modo !== "ver" ? (
        <div className="flex w-full max-w-2xl flex-col gap-2">
          <textarea
            className="campo min-h-20"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label="Conclusión del perito"
          />
          <button
            type="button"
            className="boton-principal self-start"
            onClick={() => validar(modo)}
          >
            Guardar la conclusión
          </button>
        </div>
      ) : null}
      {error ? <p className="t-nota">{error}</p> : null}
      {validacion ? (
        <p className="t-interfaz" role="status" data-testid="validacion">
          {validacion.perito}{" "}
          {{ aceptada: "aceptó", editada: "editó", rechazada: "rechazó" }[validacion.decision]} la
          sugerencia.
        </p>
      ) : null}
    </div>
  );
}

/** Paso 8: la vista previa del dictamen y su descarga. */
export function PasoDictamen({
  url,
  estado,
  onGenerar,
  onDescargar,
  validado,
}: {
  url: string | null;
  estado: string | null;
  onGenerar: () => void;
  onDescargar: () => void;
  validado: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-4 px-4 py-4 md:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="boton-principal"
          onClick={onDescargar}
          data-testid="descargar-pdf"
          disabled={!url}
        >
          Descargar el dictamen
        </button>
        <button type="button" className="boton-secundario min-h-11 px-4" onClick={onGenerar}>
          Actualizar la vista previa
        </button>
        {!validado ? (
          <span className="t-nota text-texto-2">Sin validar: sale como borrador.</span>
        ) : null}
        {estado ? (
          <span role="status" className="t-nota text-texto-2">
            {estado}
          </span>
        ) : null}
      </div>
      {url ? (
        <iframe
          title="Vista previa del dictamen"
          src={url}
          className="min-h-0 w-full flex-1 rounded-panel border border-linea bg-superficie"
          data-testid="vista-previa"
        />
      ) : (
        <div className="t-nota grid flex-1 place-items-center rounded-panel bg-superficie">
          Armando el dictamen…
        </div>
      )}
    </div>
  );
}
