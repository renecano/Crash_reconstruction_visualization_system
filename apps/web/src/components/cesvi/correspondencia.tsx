"use client";
/**
 * Correspondencia, sugerencia y dictamen (Hito 3, docs/cesvi/PROTOTIPO.md, ADR 0051): los criterios
 * de CESVI por vehículo, el diagrama de zonas de daño, la sugerencia de Croquis con sus razones y
 * la validación del perito, el borrador de las consideraciones con Claude y el dictamen en PDF.
 */
import {
  CRITERIOS,
  criteriosVacios,
  NOMBRE_ZONA,
  reproducir,
  sugerir,
  zonasDeDanos,
  type CasoCesvi,
  type ClaveCriterio,
  type CriterioMarcado,
  type MarcaCriterio,
  type Validacion,
  type Zona,
} from "@croquis/cesvi";
import { useId, useMemo, useState } from "react";
import { downloadBytes } from "@/lib/download";
import type { DistanciaRestos, ResultadosCalculo } from "./calculos";

export interface CapturaCroquis {
  imagen: string;
  version: string;
}

/** La cuadrícula del vehículo visto desde arriba, con el frente hacia arriba. */
const CUADRICULA: (Zona | null)[] = [
  "frontal_izquierda",
  "frontal_centro",
  "frontal_derecha",
  "lateral_izquierdo",
  null,
  "lateral_derecho",
  "posterior_izquierda",
  "posterior_centro",
  "posterior_derecha",
];

function DiagramaZonas({
  letra,
  titulo,
  zonas,
  onCambio,
}: {
  letra: "A" | "B";
  titulo: string;
  zonas: Zona[];
  onCambio: (z: Zona[]) => void;
}) {
  return (
    <figure className="flex flex-col items-start gap-2">
      <figcaption className="t-interfaz">
        Vehículo {letra}: {titulo}
      </figcaption>
      <div
        className="grid w-48 grid-cols-3 grid-rows-[3rem_6rem_3rem] gap-1 rounded-panel border border-linea p-1"
        role="group"
        aria-label={`Zonas de daño del vehículo ${letra}, frente hacia arriba`}
      >
        {CUADRICULA.map((z, i) =>
          z ? (
            <button
              key={z}
              type="button"
              aria-pressed={zonas.includes(z)}
              title={NOMBRE_ZONA[z]}
              aria-label={NOMBRE_ZONA[z]}
              data-testid={`zona-${letra}-${z}`}
              onClick={() =>
                onCambio(zonas.includes(z) ? zonas.filter((x) => x !== z) : [...zonas, z])
              }
              className={`min-h-11 rounded-control border ${
                zonas.includes(z)
                  ? "border-evidencia bg-evidencia/70"
                  : "border-linea bg-superficie hover:border-texto-3"
              }`}
            />
          ) : (
            <div key={`cabina-${i}`} className="t-nota grid place-items-center text-texto-3">
              {letra}
            </div>
          ),
        )}
      </div>
      <p className="t-nota text-texto-2">
        {zonas.length ? zonas.map((z) => NOMBRE_ZONA[z]).join(", ") : "Sin zonas marcadas"}
      </p>
    </figure>
  );
}

function Criterios({
  letra,
  valores,
  onCambio,
}: {
  letra: "A" | "B";
  valores: Record<ClaveCriterio, CriterioMarcado>;
  onCambio: (clave: ClaveCriterio, v: CriterioMarcado) => void;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="t-subtitulo mb-2">Vehículo {letra}</legend>
      {CRITERIOS.map((c) => (
        <div key={c.clave} className="flex flex-col gap-1 border-b border-linea pb-3">
          <label htmlFor={`${id}-${c.clave}`} className="t-interfaz">
            {c.nombre}
            <span className="t-nota block text-texto-2">{c.descripcion}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <select
              id={`${id}-${c.clave}`}
              className="campo w-56"
              value={valores[c.clave].marca ?? ""}
              data-testid={`criterio-${letra}-${c.clave}`}
              onChange={(e) =>
                onCambio(c.clave, {
                  ...valores[c.clave],
                  marca: (e.target.value || null) as MarcaCriterio,
                })
              }
            >
              <option value="">Sin marcar</option>
              <option value="corresponde">Corresponde</option>
              <option value="no_corresponde">No corresponde</option>
              <option value="no_determinable">No se puede determinar</option>
            </select>
            <input
              className="campo min-w-0 flex-1"
              placeholder="Nota del perito"
              aria-label={`Nota: ${c.nombre}, vehículo ${letra}`}
              value={valores[c.clave].nota}
              onChange={(e) => onCambio(c.clave, { ...valores[c.clave], nota: e.target.value })}
            />
          </div>
        </div>
      ))}
    </fieldset>
  );
}

const SENTIDO = {
  contra_declarada: "En contra de la versión declarada",
  a_favor_declarada: "A favor de la versión declarada",
  sin_dato: "Sin dato suficiente",
} as const;

interface BorradorRespuesta {
  texto: string;
  numerosNoReconocidos: string[];
  error?: string;
}

export function Correspondencia({
  caso,
  resultados,
  distancia,
  capturarCroquis,
}: {
  caso: CasoCesvi;
  resultados: ResultadosCalculo | null;
  distancia: DistanciaRestos;
  capturarCroquis: () => CapturaCroquis | null;
}) {
  const [criterios, setCriterios] = useState({ A: criteriosVacios(), B: criteriosVacios() });
  const [zonas, setZonas] = useState<Record<"A" | "B", Zona[]>>(() => ({
    A: zonasDeDanos(caso.vehiculos.A.danos),
    B: zonasDeDanos(caso.vehiculos.B.danos),
  }));
  const [perito, setPerito] = useState("");
  const [modo, setModo] = useState<"ver" | "editar" | "rechazar">("ver");
  const [textoPerito, setTextoPerito] = useState("");
  const [validacion, setValidacion] = useState<Validacion | null>(null);
  const [borrador, setBorrador] = useState<string>("");
  const [revisado, setRevisado] = useState(false);
  const [noReconocidos, setNoReconocidos] = useState<string[]>([]);
  const [estado, setEstado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const distanciaM = Number(distancia.valor.replace(",", "."));
  const fuenteDistancia = distancia.fuente === "perito" ? "medida por el perito" : "del dictamen";
  const sugerencia = useMemo(
    () =>
      sugerir({
        comparacion: resultados?.comparacion ?? null,
        distanciaRestos: Number.isFinite(distanciaM) ? distanciaM : null,
        fuenteDistancia,
        zonasA: zonas.A,
        zonasB: zonas.B,
      }),
    [resultados, distanciaM, fuenteDistancia, zonas],
  );

  const validar = (decision: Validacion["decision"]) => {
    if (!perito.trim()) {
      setEstado("Escribe tu nombre para validar.");
      return;
    }
    if (decision !== "aceptada" && !textoPerito.trim()) {
      setEstado("Escribe la conclusión que queda en el dictamen.");
      return;
    }
    setValidacion({
      decision,
      conclusion: decision === "aceptada" ? sugerencia.texto : textoPerito.trim(),
      perito: perito.trim(),
      fecha: new Date().toISOString(),
    });
    setModo("ver");
    setEstado(null);
  };

  const comparacionTexto = resultados?.comparacion
    ? `La velocidad de impacto (${resultados.comparacion.diferenciaKmh.toFixed(2)} km/h de diferencia con la de desplazamiento, ${resultados.comparacion.diferenciaPct.toFixed(2)} %) ${resultados.comparacion.significativa ? "sí" : "no"} difiere de forma significativa con el umbral de ${resultados.comparacion.umbralPct} % que fijó el perito.`
    : null;

  const hechos = () => ({
    caso: caso.id,
    modalidad_dictaminada: caso.modalidad_dictaminada,
    objetivo: caso.objetivo.valor,
    declaracion: { conductor: caso.declaracion.conductor, texto: caso.declaracion.texto },
    vehiculos: {
      A: `${caso.vehiculos.A.marca} ${caso.vehiculos.A.tipo} ${caso.vehiculos.A.modelo}`,
      B: `${caso.vehiculos.B.marca} ${caso.vehiculos.B.tipo} ${caso.vehiculos.B.modelo}`,
    },
    calculos: {
      energia_deformacion_B: resultados?.mcHenry
        ? {
            formula: resultados.mcHenry.general,
            sustituida: resultados.mcHenry.sustituida,
            resultado: resultados.mcHenry.resultado,
          }
        : null,
      energia_del_dictamen_original_kJ: caso.calculos.deformacion_B.reporte.energia.valor,
      velocidad_impacto_desde_energia_del_dictamen: resultados?.ebsReporte?.resultado ?? null,
      velocidad_impacto_con_energia_calculada: resultados?.ebsDatos?.resultado ?? null,
      desplazamiento: resultados?.v3
        ? { sustituida: resultados.v3.sustituida, resultado: resultados.v3.resultado }
        : null,
      comparacion: comparacionTexto,
    },
    separacion_restos: { metros: distancia.valor, fuente: fuenteDistancia },
    zonas_de_dano: {
      A: zonas.A.map((z) => NOMBRE_ZONA[z]),
      B: zonas.B.map((z) => NOMBRE_ZONA[z]),
    },
    criterios_del_perito: Object.fromEntries(
      (["A", "B"] as const).map((l) => [
        l,
        Object.fromEntries(
          CRITERIOS.map((c) => [c.nombre, criterios[l][c.clave]]).filter(
            ([, v]) => (v as CriterioMarcado).marca,
          ),
        ),
      ]),
    ),
    sugerencia_de_croquis: {
      texto: sugerencia.texto,
      razones: sugerencia.razones.map((r) => r.texto),
    },
    conclusion_validada_por_el_perito: validacion?.conclusion ?? null,
  });

  const pedirBorrador = async () => {
    setOcupado(true);
    setEstado("Redactando el borrador con Claude…");
    try {
      const r = await fetch("/api/cesvi/consideraciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hechos: hechos() }),
      });
      const datos = (await r.json()) as BorradorRespuesta;
      if (!r.ok) throw new Error(datos.error ?? `HTTP ${r.status}`);
      setBorrador(datos.texto);
      setNoReconocidos(datos.numerosNoReconocidos);
      setRevisado(false);
      setEstado(null);
    } catch (e) {
      setEstado(`No se pudo redactar el borrador: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado(false);
    }
  };

  const exportar = async () => {
    setOcupado(true);
    setEstado("Armando el PDF…");
    try {
      const { dictamenPdf } = await import("@/lib/dictamen-cesvi");
      const bytes = await dictamenPdf({
        caso,
        calculos: {
          mcHenry: resultados?.mcHenry ?? null,
          ebsReporte: resultados?.ebsReporte ?? null,
          ebsDatos: resultados?.ebsDatos ?? null,
          v3: resultados?.v3 ?? null,
          comparacionTexto,
        },
        distanciaRestos: Number.isFinite(distanciaM)
          ? { valor: distanciaM, fuente: fuenteDistancia }
          : null,
        reproduccion: reproducir(caso).filas,
        croquis: capturarCroquis(),
        criterios,
        zonas,
        sugerencia,
        validacion,
        consideraciones: borrador.trim() ? { texto: borrador.trim(), revisadas: revisado } : null,
      });
      downloadBytes(
        bytes,
        `dictamen-${caso.id}${validacion ? "" : "-borrador"}.pdf`,
        "application/pdf",
      );
      setEstado(null);
    } catch (e) {
      setEstado(`No se pudo armar el PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section aria-labelledby="correspondencia" className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h2 id="correspondencia" className="t-titulo">
          Correspondencia y dictamen
        </h2>
        <p className="t-cuerpo max-w-[72ch] text-texto-2">
          El perito marca los criterios de correspondencia y las zonas de daño; Croquis sugiere si
          la versión declarada se sostiene, con sus razones, y el perito decide.
        </p>
      </div>

      <section aria-labelledby="zonas" className="flex flex-col gap-4">
        <h3 id="zonas" className="t-subtitulo">
          Zonas de daño
        </h3>
        <div className="flex flex-wrap gap-10">
          {(["A", "B"] as const).map((l) => (
            <DiagramaZonas
              key={l}
              letra={l}
              titulo={`${caso.vehiculos[l].marca} ${caso.vehiculos[l].tipo}`}
              zonas={zonas[l]}
              onCambio={(z) => setZonas((zs) => ({ ...zs, [l]: z }))}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="criterios" className="flex flex-col gap-4">
        <h3 id="criterios" className="t-subtitulo">
          Criterios de correspondencia de CESVI
        </h3>
        <div className="grid gap-8 md:grid-cols-2">
          {(["A", "B"] as const).map((l) => (
            <Criterios
              key={l}
              letra={l}
              valores={criterios[l]}
              onCambio={(clave, v) =>
                setCriterios((cs) => ({ ...cs, [l]: { ...cs[l], [clave]: v } }))
              }
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="sugerencia" className="flex flex-col gap-4">
        <h3 id="sugerencia" className="t-subtitulo">
          Sugerencia de Croquis
        </h3>
        <p className="t-cuerpo font-semibold" data-testid="sugerencia">
          {sugerencia.texto}
        </p>
        <ul className="flex flex-col gap-3">
          {sugerencia.razones.map((r) => (
            <li key={r.clave} className="t-cuerpo border-l-2 border-linea pl-4">
              <span className="t-nota block text-texto-2">
                {SENTIDO[r.sentido]} · {r.evidencia}
              </span>
              {r.texto}
            </li>
          ))}
        </ul>
        <p className="t-nota max-w-[72ch] text-texto-2">{sugerencia.regla}</p>

        <div className="flex flex-col gap-3 border-t border-linea pt-4">
          <label className="t-nota flex flex-col gap-1 text-texto-2">
            Perito que valida
            <input
              className="campo w-72"
              value={perito}
              onChange={(e) => setPerito(e.target.value)}
              data-testid="perito"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="boton-principal"
              onClick={() => validar("aceptada")}
              data-testid="aceptar"
            >
              Aceptar la sugerencia
            </button>
            <button
              type="button"
              className="boton-secundario min-h-11 px-4"
              onClick={() => {
                setModo("editar");
                setTextoPerito(sugerencia.texto);
              }}
            >
              Editarla
            </button>
            <button
              type="button"
              className="boton-secundario min-h-11 px-4"
              onClick={() => {
                setModo("rechazar");
                setTextoPerito("");
              }}
            >
              Rechazarla
            </button>
          </div>
          {modo !== "ver" ? (
            <div className="flex flex-col gap-2">
              <label className="t-nota flex flex-col gap-1 text-texto-2">
                {modo === "editar"
                  ? "La conclusión, editada por el perito"
                  : "La conclusión del perito"}
                <textarea
                  className="campo min-h-24"
                  value={textoPerito}
                  onChange={(e) => setTextoPerito(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="boton-principal self-start"
                onClick={() => validar(modo === "editar" ? "editada" : "rechazada")}
              >
                Guardar la conclusión
              </button>
            </div>
          ) : null}
          {validacion ? (
            <p className="t-interfaz" role="status" data-testid="validacion">
              {validacion.perito}{" "}
              {{ aceptada: "aceptó", editada: "editó", rechazada: "rechazó" }[validacion.decision]}{" "}
              la sugerencia el{" "}
              {new Date(validacion.fecha).toLocaleString("es-MX", {
                dateStyle: "long",
                timeStyle: "short",
              })}
              .
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="borrador" className="flex flex-col gap-3">
        <h3 id="borrador" className="t-subtitulo">
          Consideraciones (borrador)
        </h3>
        <p className="t-nota max-w-[72ch] text-texto-2">
          Claude redacta el borrador en el estilo de los dictámenes de CESVI con los números que ya
          calculó Croquis; no calcula nada. Es un borrador: el perito lo revisa y lo corrige.
        </p>
        <button
          type="button"
          className="boton-secundario min-h-11 self-start px-4"
          onClick={() => void pedirBorrador()}
          disabled={ocupado}
          data-testid="pedir-borrador"
        >
          {borrador ? "Volver a redactar el borrador" : "Redactar el borrador con Claude"}
        </button>
        {borrador ? (
          <>
            {noReconocidos.length ? (
              <p role="alert" className="t-interfaz" data-testid="numeros-no-reconocidos">
                Revisa estas cifras: no vienen de los cálculos ({noReconocidos.join(", ")}).
              </p>
            ) : null}
            <label className="t-nota flex flex-col gap-1 text-texto-2">
              Borrador, editable por el perito
              <textarea
                className="campo min-h-64"
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                data-testid="texto-borrador"
              />
            </label>
            <label className="t-interfaz flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={revisado}
                onChange={(e) => setRevisado(e.target.checked)}
                className="h-5 w-5 accent-[var(--accion)]"
              />
              Revisé y corregí el borrador
            </label>
          </>
        ) : null}
      </section>

      <section
        aria-labelledby="exportar"
        className="flex flex-col gap-3 border-t border-linea pt-6"
      >
        <h3 id="exportar" className="t-subtitulo">
          Dictamen en PDF
        </h3>
        <p className="t-nota max-w-[72ch] text-texto-2">
          Con la estructura de CESVI: título con la modalidad, objetivos, fundamentos, vehículos,
          daños, lugar con el croquis sobre el mapa, consideraciones, conclusiones y la validación
          del perito.
          {validacion ? "" : " Sin validar, sale marcado como borrador."}
        </p>
        <button
          type="button"
          className="boton-principal self-start"
          onClick={() => void exportar()}
          disabled={ocupado}
          data-testid="exportar-pdf"
        >
          Exportar el dictamen
        </button>
      </section>

      {estado ? (
        <p role="status" className="t-interfaz">
          {estado}
        </p>
      ) : null}
    </section>
  );
}
