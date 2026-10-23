"use client";
/**
 * El recorrido de un caso de expediente (ADR 0079): nuevo, importado, de la reproducción o
 * guardado. La misma barra y los mismos pasos que el caso de AXA, con Presentar / Trabajar y los
 * temas. A la izquierda va el paso; a la derecha, el escenario: el mapa (montado todo el recorrido,
 * para el croquis del dictamen) y, cuando se pide, el 3D de la reconstrucción.
 *
 * Lo que marca el perito lleva fuente «perito»; lo que supone Croquis, «supuesto», hasta que el
 * perito lo confirma. La validación del dictamen se guarda con el caso (ADR 0075).
 */
import {
  comparar,
  conPosicion,
  escenaDeNarracion,
  verificacionCesvi,
  type EscenaNarrada,
  type Expediente,
  type SalidaCorpus,
} from "@croquis/cesvi";
import type { ViewerExportApi } from "@croquis/viewer";
import type { Map as MapaMl } from "maplibre-gl";
import { useMemo, useState } from "react";
import type { Hipotesis } from "@/components/visor/hypothesis-panel";
import {
  casoParaGuardar,
  leerCasoGuardado,
  type ReporteCesvi,
  type ValidacionPerito,
} from "@/lib/caso-guardado";
import { guardarCaso, idNuevo, type CasoExpediente } from "@/lib/casos";
import { avisarCambio } from "@/lib/casos-navegador";
import type { DatosDictamenCaso } from "@/lib/dictamen-caso";
import { downloadBytes } from "@/lib/download";
import { useTema, type Modo } from "@/lib/preferencias-cesvi";
import ejemplo from "../../../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json";
import { ComparacionDeclaracion } from "../comparacion-declaracion";
import { DictamenCaso } from "../dictamen-caso";
import { CargaReporte } from "../importar-dictamen";
import { BarraRecorrido, PASOS, PASOS_CORTOS } from "../recorrido/barra";
import { PasoCaso, PasoContraReporte, PasoDanos, PasoHecho, PasoLugar, PasoNumeros } from "./pasos";
import { MapaEscena, type Fase, type Id } from "./piezas";
import {
  PanelReconstruccion,
  useReconstruccion,
  Visor3dCaso,
  type PosicionMovil,
} from "./reconstruccion";

const DETALLE: Record<CasoExpediente["origen"], string> = {
  nuevo:
    "Narra el hecho como en un reporte de CESVI. Croquis lo ordena en la escena, pregunta solo lo que más cambia la reconstrucción y tú colocas a los vehículos en el mapa.",
  importado:
    "Sube un reporte de CESVI en PDF, Markdown o texto. Claude lo lee y Croquis arma el expediente con la frase de donde sale cada dato; lo que no está en el texto se descarta.",
  reporte:
    "Un reporte de la prueba congelada de E-R4: Croquis recibió la narración sin las conclusiones. Reconstrúyelo y compáralo con lo que concluyó CESVI.",
  guardado: "Un caso que guardaste en este equipo, con lo que marcaste y tu validación.",
};

export function RecorridoCaso({ inicial }: { inicial: CasoExpediente }) {
  // Trabajar para armar un caso; Presentar para un reporte de la reproducción (se consulta).
  const [modo, setModo] = useState<Modo>(inicial.origen === "reporte" ? "presentar" : "trabajar");
  const tema = useTema(modo);
  const [paso, setPaso] = useState(0);
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [reporte, setReporte] = useState<ReporteCesvi | null>(inicial.reporte);
  const [texto, setTexto] = useState(inicial.narracion ?? "");
  const [leida, setLeida] = useState<EscenaNarrada | null>(inicial.escena);
  const [expediente, setExpediente] = useState<Expediente | null>(
    inicial.escena?.expediente ?? null,
  );
  const [validacion, setValidacion] = useState<ValidacionPerito | null>(inicial.validacion);
  const [estado, setEstado] = useState<string | null>(null);
  const [noSe, setNoSe] = useState<Set<string>>(new Set());
  const [herramienta, setHerramienta] = useState<{ vehiculo: Id; fase: Fase } | null>(
    inicial.escena?.expediente.vehiculos[0]
      ? { vehiculo: inicial.escena.expediente.vehiculos[0].id, fase: "final" }
      : null,
  );
  const [rumbo, setRumbo] = useState("");
  const [mapa, setMapa] = useState<MapaMl | null>(null);
  const [moviles, setMoviles] = useState<PosicionMovil[]>([]);
  const [vista, setVista] = useState<"mapa" | "3d">("mapa");
  const [declarada, setDeclarada] = useState<Hipotesis | null>(null);
  const [comparacionDeclarada, setComparacionDeclarada] =
    useState<DatosDictamenCaso["declarada"]>(null);
  const [exportApi, setExportApi] = useState<ViewerExportApi | null>(null);
  const [guardadoId, setGuardadoId] = useState<string | null>(
    inicial.origen === "guardado" ? inicial.id : null,
  );
  const [avisoGuardado, setAvisoGuardado] = useState<string | null>(null);
  const rec = useReconstruccion(expediente);
  const r = rec.r;

  // Un caso con reporte se lee del reporte: su narración no se edita ni va al dictamen.
  const editable = reporte === null;
  const narracion = editable ? texto.trim() || null : null;
  const pasos = PASOS.filter((_, i) => i !== 6 || reporte !== null);
  const cortos = PASOS_CORTOS.filter((_, i) => i !== 6 || reporte !== null);
  const clave = (i: number) => PASOS.indexOf(pasos[i]!);
  const actual = clave(paso);
  const irA = (i: number) => setPaso(Math.max(0, Math.min(pasos.length - 1, i)));

  const evidencia = expediente?.versiones?.find((v) => v.tipo === "evidencia");
  const posiciones = useMemo(() => evidencia?.posiciones ?? [], [evidencia]);
  const verificacion = useMemo(
    () => (expediente ? verificacionCesvi(expediente) : []),
    [expediente],
  );
  const comparacionReporte = useMemo(
    () =>
      reporte && expediente && leida
        ? comparar(reporte.conclusiones, expediente, leida.posiciones, texto)
        : null,
    [reporte, expediente, leida, texto],
  );
  const preguntas = (leida?.preguntas ?? []).filter((p) => {
    if (noSe.has(p.clave) || !expediente) return false;
    if (p.clave === "impacto-propuesto")
      return expediente.impactos?.some((i) => i.fuente === "supuesto");
    if (p.clave.startsWith("masa-"))
      return !expediente.vehiculos.find((v) => v.id === p.vehiculo)?.masa;
    if (p.clave === "restos") return !expediente.evidencias?.restos?.longitud;
    if (p.clave.startsWith("final-"))
      return !posiciones.some((x) => x.vehiculo === p.vehiculo && x.fase === "final");
    return true;
  });

  const cambiarExpediente = (e: Expediente) => {
    setExpediente(e);
    setLeida((l) => (l ? { ...l, expediente: e } : l));
  };
  const abrirEscena = (e: EscenaNarrada) => {
    setLeida(e);
    setExpediente(e.expediente);
    setNoSe(new Set());
    setValidacion(null);
    const primero = e.expediente.vehiculos[0];
    setHerramienta(primero ? { vehiculo: primero.id, fase: "final" } : null);
  };

  const leer = async () => {
    setEstado("Leyendo la narración…");
    try {
      const res = await fetch("/api/cesvi/escena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const d = (await res.json()) as { metodo?: string; motivo?: string; salida?: SalidaCorpus };
      if (d.metodo !== "claude" || !d.salida) {
        setEstado(`No se pudo leer con Claude (${d.motivo ?? "sin respuesta"}).`);
        return;
      }
      abrirEscena(escenaDeNarracion(d.salida, texto));
      setEstado(null);
    } catch {
      setEstado("No se pudo leer la narración.");
    }
  };

  const abrirArchivo = async (f: File) => {
    let datos: unknown;
    try {
      datos = JSON.parse(await f.text());
    } catch {
      setAvisoGuardado("El archivo no es un caso de Croquis.");
      return;
    }
    const c = leerCasoGuardado(datos);
    if ("error" in c) {
      setAvisoGuardado(c.error);
      return;
    }
    abrirEscena(c.escena);
    setTexto(c.narracion ?? "");
    setReporte(c.reporte);
    setValidacion(c.validacion);
    if (c.titulo) setTitulo(c.titulo);
    setAvisoGuardado(
      c.validacion
        ? `Caso abierto. Validó ${c.validacion.perito}: reconstruye para descargar el dictamen.`
        : "Caso abierto, sin validar.",
    );
  };

  const archivoCaso = () =>
    leida && expediente
      ? casoParaGuardar({
          narracion,
          escena: leida,
          expediente,
          validacion,
          titulo,
          reporte,
        })
      : null;
  const guardarEnEquipo = () => {
    const a = archivoCaso();
    if (!a) return;
    const id = guardadoId ?? idNuevo();
    try {
      guardarCaso(window.localStorage, id, a);
      setGuardadoId(id);
      avisarCambio();
      setAvisoGuardado("Guardado en este equipo: aparece en la lista de casos.");
    } catch {
      setAvisoGuardado("No se pudo guardar en este navegador; descarga el archivo del caso.");
    }
  };

  const colocar = (punto: { lat: number; lon: number }) => {
    // Se coloca en el paso del lugar y al trabajar; al presentar el mapa solo se mira.
    if (modo !== "trabajar" || actual !== 2) return;
    if (!expediente || !herramienta || rumbo.trim() === "") return;
    const rumboNum = Number(rumbo.replace(",", "."));
    if (!Number.isFinite(rumboNum)) return;
    cambiarExpediente(conPosicion(expediente, { ...herramienta, punto, rumbo: rumboNum }));
  };

  const inicio =
    inicial.origen === "importado" && !leida ? (
      <CargaReporte
        onImportado={(d, archivo) => {
          abrirEscena(d);
          setTexto(d.narracion.descripcion);
          setReporte({ nombre: archivo, conclusiones: d.narracion.conclusiones });
          setTitulo(`Reporte de CESVI · ${archivo}`);
          setPaso(1);
        }}
      />
    ) : inicial.origen === "nuevo" && !leida ? (
      <div className="solo-trabajar flex flex-wrap items-center gap-3">
        <button type="button" className="boton-principal" onClick={() => irA(1)}>
          Narrar el hecho
        </button>
        <label className="boton-secundario cursor-pointer">
          Abrir un archivo de caso
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void abrirArchivo(f);
              e.target.value = "";
            }}
            data-testid="abrir-caso"
          />
        </label>
      </div>
    ) : null;

  const sinEscena = (
    <p className="t-nota" data-testid="sin-escena">
      {inicial.origen === "importado"
        ? "Primero carga el reporte en el paso «El caso»."
        : "Primero narra el hecho y léelo en el paso «El hecho»."}
    </p>
  );

  const cuerpo = (() => {
    if (actual === 0)
      return (
        <PasoCaso
          titulo={titulo}
          detalle={DETALLE[inicial.origen]}
          escena={leida}
          reporte={reporte}
          inicio={
            <>
              {inicio}
              {avisoGuardado ? (
                <p role="status" className="t-nota" data-testid="caso-abierto">
                  {avisoGuardado}
                </p>
              ) : null}
            </>
          }
        />
      );
    if (actual === 1)
      return (
        <PasoHecho
          narracion={texto}
          editable={editable}
          onNarracion={setTexto}
          onLeer={() => void leer()}
          onEjemplo={() => setTexto(ejemplo.narracion)}
          estado={estado}
          escena={leida}
          preguntas={preguntas}
          onExpediente={cambiarExpediente}
          onNoSe={(c) => setNoSe((s) => new Set([...s, c]))}
        />
      );
    if (!expediente || !leida) return sinEscena;
    if (actual === 2)
      return (
        <PasoLugar
          expediente={expediente}
          escena={leida}
          herramienta={herramienta}
          onHerramienta={setHerramienta}
          rumbo={rumbo}
          onRumbo={setRumbo}
          colocados={posiciones.length}
        />
      );
    if (actual === 3)
      return (
        <div className="flex flex-col gap-5">
          <PanelReconstruccion
            rec={rec}
            ver3d={vista === "3d"}
            onVer3d={(v) => {
              if (!v) setMoviles([]);
              setVista(v ? "3d" : "mapa");
            }}
          />
          {r ? (
            <ComparacionDeclaracion
              expediente={expediente}
              reconstruccion={r}
              onHipotesis={setDeclarada}
              onComparacion={setComparacionDeclarada}
            />
          ) : null}
        </div>
      );
    if (actual === 4) return <PasoDanos expediente={expediente} r={r} />;
    if (actual === 5) return <PasoNumeros r={r} verificacion={verificacion} />;
    if (actual === 6 && reporte && comparacionReporte)
      return <PasoContraReporte reporte={reporte} comparacion={comparacionReporte} />;
    return (
      <div className="flex flex-col gap-5">
        <h2 className="t-subtitulo">El dictamen</h2>
        {r ? (
          <DictamenCaso
            expediente={expediente}
            narracion={narracion}
            reconstruccion={r}
            verificacion={verificacion}
            declarada={comparacionDeclarada}
            exportApi={vista === "3d" ? exportApi : null}
            mapa={mapa}
            validacion={validacion}
            onValidacion={setValidacion}
            tema={tema}
          />
        ) : (
          <p className="t-nota">Reconstruye en «La reconstrucción» para armar el dictamen.</p>
        )}
        <div className="solo-trabajar flex flex-col gap-3 border-t border-linea-suave pt-4">
          <h3 className="t-interfaz font-semibold">El caso</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="boton-secundario"
              onClick={guardarEnEquipo}
              data-testid="guardar-en-equipo"
            >
              Guardar en este equipo
            </button>
            <button
              type="button"
              className="boton-secundario"
              onClick={() => {
                const a = archivoCaso();
                if (!a) return;
                downloadBytes(
                  new TextEncoder().encode(
                    `${JSON.stringify(a, null, 2)}\n`,
                  ) as Uint8Array<ArrayBuffer>,
                  "caso-croquis.json",
                  "application/json",
                );
              }}
              data-testid="guardar-caso"
            >
              Descargar el archivo del caso
            </button>
          </div>
          {avisoGuardado ? (
            <p role="status" className="t-nota" data-testid="aviso-guardado">
              {avisoGuardado}
            </p>
          ) : null}
        </div>
      </div>
    );
  })();

  const verMapa = vista === "mapa" || !r;
  return (
    <div
      className="fixed inset-0 flex flex-col bg-fondo text-texto"
      data-tema={tema}
      data-modo={modo}
      data-testid="recorrido-caso"
      data-origen={inicial.origen}
    >
      <BarraRecorrido
        pasos={pasos}
        pasosCortos={cortos}
        paso={paso}
        irA={irA}
        modo={modo}
        onModo={setModo}
        tema={tema}
        resumen={titulo}
        onExportar={() => {
          setModo("presentar");
          irA(pasos.length - 1);
        }}
      />
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(50vh,1fr)] overflow-y-auto lg:grid-cols-[minmax(380px,460px)_1fr] lg:grid-rows-1 lg:overflow-hidden">
        <aside
          className="flex min-h-0 flex-col gap-5 border-linea-suave p-5 lg:overflow-y-auto lg:border-r"
          aria-label={pasos[paso]}
          data-testid="panel-paso"
          data-paso={actual + 1}
        >
          <p className="t-rotulo">
            Paso {paso + 1} de {pasos.length}
          </p>
          {cuerpo}
          <nav className="mt-auto flex justify-between gap-2 pt-4" aria-label="Pasos">
            <button
              type="button"
              className="boton-secundario"
              onClick={() => irA(paso - 1)}
              disabled={paso === 0}
              data-testid="anterior"
            >
              Anterior
            </button>
            <button
              type="button"
              className="boton-principal"
              onClick={() => irA(paso + 1)}
              disabled={paso === pasos.length - 1}
              data-testid="siguiente"
            >
              Siguiente
            </button>
          </nav>
        </aside>
        <section className="relative min-h-[50vh]" aria-label="Escenario" data-testid="escenario">
          <div className={`absolute inset-0 ${verMapa ? "" : "invisible"}`}>
            <MapaEscena
              tema={tema}
              onMapa={setMapa}
              posiciones={posiciones}
              moviles={moviles}
              impactos={rec.impactos}
              onClic={colocar}
            />
          </div>
          {r ? (
            <div
              className={`absolute inset-0 bg-fondo ${verMapa ? "pointer-events-none invisible" : ""}`}
            >
              <Visor3dCaso
                r={r}
                declarada={declarada}
                onExportApi={setExportApi}
                onPosiciones={setMoviles}
              />
            </div>
          ) : null}
          {r ? (
            <div
              className="segmentado absolute top-3 left-3 z-10"
              role="tablist"
              aria-label="Vista"
            >
              {(["mapa", "3d"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={vista === v}
                  className="px-3"
                  onClick={() => {
                    if (v === "mapa") setMoviles([]);
                    setVista(v);
                  }}
                  data-testid={`vista-${v}`}
                >
                  {v === "mapa" ? "Mapa" : "3D"}
                </button>
              ))}
            </div>
          ) : null}
          <p className="vidrio pointer-events-none absolute bottom-3 left-3 z-10 px-2 py-1 text-[0.6875rem] text-texto-2">
            Reconstrucción de apoyo · el dictamen es del perito.
          </p>
        </section>
      </div>
    </div>
  );
}
