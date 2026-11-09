"use client";
/**
 * El dictamen de la reconstrucción (R8, ADR 0072): el perito escribe su conclusión, valida con su
 * nombre y descarga el PDF o el Word. Lleva la narración, el croquis 2D a escala, cuadros del 3D
 * (si lo abrió), los resultados con sus rangos, la verificación CESVI, la comparación con la
 * declaración (si la usó) y la trazabilidad. Sin validación sale como borrador. Con la casilla, en
 * el orden de los reportes de CESVI.
 */
import {
  impactosEnMapa,
  trayectoriasEnMapa,
  VERSION_PROMPT_ESCENA,
  type Expediente,
  type MensajeBitacora,
  type Reconstruccion,
  type SupuestoDeclarado,
  type VerificacionVehiculo,
} from "@croquis/cesvi";
import type { ViewerExportApi } from "@croquis/viewer";
import type { OverpassResponse } from "@croquis/croquis-2d";
import type { Map as MapaMl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { huellaDelCaso, validacionVigente, type ValidacionPerito } from "@/lib/caso-guardado";
import { croquisDeReconstruccion } from "@/lib/croquis-caso";
import { croquisSobreMapa } from "@/lib/croquis-mapa";
import type { CifraContraste } from "@/lib/contraste-lab";
import { dictamenCasoPdf, dictamenCasoWord, type DatosDictamenCaso } from "@/lib/dictamen-caso";
import {
  citaContraste,
  citarUnaVez,
  citaSupuestos,
  citaVelocidad,
  MARCAS_DE_CITA,
  type MarcaDeCita,
} from "@/lib/dictamen-lab";
import { protagonista } from "@/lib/reconstruccion-lab";
import { HojaDictamen } from "./caso/hoja-dictamen";
import { ESTILO_MAPA, ESTILO_MAPA_CLARO } from "./mapa-comun";

/**
 * Descarga un archivo. El enlace va dentro del documento y la dirección se libera un minuto después:
 * con el enlace suelto o liberada al segundo, algunos navegadores no alcanzan a guardar el archivo.
 */
function descargar(bytes: Uint8Array, nombre: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Tres cuadros del 3D: antes del impacto, en el impacto y al final. Cada foto espera a que el visor
 * esté listo y dibuje su instante, con la cámara cinematográfica (con la del conductor y los
 * vehículos detenidos, «en el impacto» y «en reposo» salían iguales) y sin marcadores de interfaz
 * (René, 2026-11-04).
 */
/**
 * Lo más que esperan las tres fotos, juntas, a que el 3D termine de compilar (ms). Antes cada una
 * esperaba hasta 60 s: en una máquina lenta el PDF tardaba minutos (CI, 2026-11-05). Pasado el
 * plazo, la foto sale con lo que el visor ya dibuja.
 */
export const PRESUPUESTO_FOTOS_MS = 20_000;

async function cuadros(api: ViewerExportApi | null, resultado: Record<string, unknown>) {
  if (!api) return [];
  const desde = performance.now();
  const t0 = Number(resultado.t_inicio ?? -1);
  const t1 = Number(resultado.t_fin ?? 1);
  const out: { etiqueta: string; imagen: string }[] = [];
  for (const { t, etiqueta } of [
    { t: Math.max(t0, -1), etiqueta: "Antes del impacto (−1 s)" },
    { t: 0, etiqueta: "En el impacto (0 s)" },
    { t: t1, etiqueta: `En reposo (+${t1.toFixed(1)} s)` },
  ]) {
    try {
      const c = await api.captureFrameReady({
        t,
        width: 960,
        height: 540,
        camara: "cinematica",
        sinInterfaz: true,
        esperaMs: Math.max(0, PRESUPUESTO_FOTOS_MS - (performance.now() - desde)),
      });
      out.push({ etiqueta, imagen: c.toDataURL("image/png") });
    } catch {
      /* sin ese cuadro */
    }
  }
  // Para las pruebas: los cuadros del último dictamen (que impacto y reposo no salgan iguales).
  (window as unknown as { __croquisCuadrosDictamen?: typeof out }).__croquisCuadrosDictamen = out;
  return out;
}

export function DictamenCaso({
  expediente,
  narracion,
  reconstruccion,
  verificacion,
  declarada,
  exportApi,
  mapa = null,
  validacion: guardada,
  onValidacion,
  tema,
  bitacora,
  supuestos,
  titulo,
  casoId,
  lugar,
  relato,
  calles,
  contra,
  letraDe,
  acciones,
  pedidoExportar = 0,
}: {
  /** Sube cada vez que el perito pulsa «Exportar» en la barra: lleva la vista a las descargas. */
  pedidoExportar?: number;
  /** El título del hecho, para la hoja. */
  titulo: string;
  /** El relato del caso, para la hoja (el dictamen de un reporte no lleva `narracion`). */
  relato: string | null;
  casoId: string | null;
  lugar: string;
  calles: OverpassResponse | null;
  /** La velocidad comparable con el reporte de CESVI, si la hay. */
  contra: CifraContraste | null;
  letraDe: (id: string) => string;
  /** Guardar en el equipo o en un archivo, junto a las descargas. */
  acciones: { guardarAqui: () => void; guardarArchivo: () => void; aviso: string | null };
  expediente: Expediente;
  narracion: string | null;
  reconstruccion: Reconstruccion;
  verificacion: VerificacionVehiculo[];
  declarada: DatosDictamenCaso["declarada"];
  /** El visor 3D abierto, para los cuadros (null si el perito no lo abrió). */
  exportApi: ViewerExportApi | null;
  /** El mapa de «Caso nuevo»: con él, el croquis va sobre las calles (R8b). */
  mapa?: MapaMl | null;
  /** La validación del perito, que se guarda con el caso (ADR 0075). */
  validacion: ValidacionPerito | null;
  onValidacion: (v: ValidacionPerito | null) => void;
  /** El tema del mapa del perito: el croquis se toma con el estilo claro y se regresa a este. */
  tema: "claro" | "oscuro";
  /** La bitácora de los agentes de la pizarra (R12b): va en la trazabilidad. */
  bitacora?: readonly MensajeBitacora[];
  /** Lo que el caso no trae, como supuesto declarado (ADR 0091). */
  supuestos?: readonly SupuestoDeclarado[];
}) {
  // El dictamen sale con la estructura de los reportes de CESVI, salvo que el perito pida el otro.
  const [estructuraCesvi, setEstructuraCesvi] = useState(true);
  const campoConclusion = useRef<HTMLTextAreaElement>(null);
  const [perito, setPerito] = useState(guardada?.perito ?? "");
  const [conclusion, setConclusion] = useState(guardada?.conclusion ?? "");
  // Solo vale si es de estas mismas entradas; si el perito las cambió, el dictamen es borrador.
  const vigente = validacionVigente(guardada, expediente, narracion);
  const validacion: DatosDictamenCaso["validacion"] = vigente
    ? { perito: guardada.perito, conclusion: guardada.conclusion, fecha: guardada.fecha }
    : null;
  const [estado, setEstado] = useState<string | null>(null);
  // Qué formato se está armando: su botón lo dice y no se puede pedir dos veces.
  const [armando, setArmando] = useState<"pdf" | "docx" | null>(null);
  const [avisoCita, setAvisoCita] = useState<string | null>(null);
  const descargas = useRef<HTMLDivElement>(null);
  const botonPdf = useRef<HTMLButtonElement>(null);
  // Qué croquis llevó el último dictamen descargado: sobre el mapa o a escala sin mapa.
  const [croquisUsado, setCroquisUsado] = useState<"mapa" | "escala" | null>(null);

  /** El croquis sobre las calles del mapa si el caso está en el mapa; si no, el dibujo a escala. */
  const croquis = async () => {
    const trs = trayectoriasEnMapa(reconstruccion, reconstruccion.resultado);
    if (mapa && trs.length) {
      const imagen = await croquisSobreMapa(
        mapa,
        trs,
        impactosEnMapa(reconstruccion, reconstruccion.resultado),
        {
          impresion: ESTILO_MAPA_CLARO,
          actual: tema === "claro" ? ESTILO_MAPA_CLARO : ESTILO_MAPA,
        },
      );
      if (imagen) return { imagen, sobreMapa: true };
    }
    return {
      imagen: croquisDeReconstruccion(reconstruccion.resultado, reconstruccion.ids),
      sobreMapa: false,
    };
  };
  // Las fotos del 3D se toman al abrir el dictamen, no al pedir el archivo (O2, plan v4): con el
  // visor recién abierto esperan a que termine de compilar, y la descarga parecía no hacer nada.
  const fotosListas = useRef<{
    de: unknown;
    api: ViewerExportApi | null;
    promesa: ReturnType<typeof cuadros>;
  } | null>(null);
  const fotos = () => {
    const f = fotosListas.current;
    if (f && f.de === reconstruccion.resultado && f.api === exportApi) return f.promesa;
    const promesa = cuadros(exportApi, reconstruccion.resultado);
    fotosListas.current = { de: reconstruccion.resultado, api: exportApi, promesa };
    return promesa;
  };
  useEffect(() => {
    void fotos();
    // Solo cuando cambia de qué son las fotos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportApi, reconstruccion.resultado]);

  const datos = async (): Promise<DatosDictamenCaso> => {
    const c = await croquis();
    return {
      expediente,
      narracion,
      reconstruccion,
      verificacion,
      croquis: c.imagen,
      croquisSobreMapa: c.sobreMapa,
      cuadros3d: await fotos(),
      modelos3d: exportApi ? [...exportApi.vehicleCredits] : [],
      declarada,
      validacion,
      estructuraCesvi,
      contraDeformacion: contra,
      trazabilidad: {
        metodo: `solver de Croquis ${String(reconstruccion.resultado.version_resultado ?? "")}, lectura ${VERSION_PROMPT_ESCENA}, verificación con el método de CESVI`,
        huella: huellaDelCaso(expediente, narracion),
      },
      bitacora: bitacora ?? [],
      supuestos: supuestos ?? [],
    };
  };
  const nombre = (ext: string) => `dictamen-reconstruccion${validacion ? "" : "-borrador"}.${ext}`;

  const exportar = async (formato: "pdf" | "docx") => {
    if (armando) return;
    setArmando(formato);
    setEstado(
      exportApi
        ? "Tomando las fotos del 3D y armando el archivo…"
        : formato === "pdf"
          ? "Armando el PDF…"
          : "Armando el Word…",
    );
    try {
      const d = await datos();
      setCroquisUsado(d.croquisSobreMapa ? "mapa" : "escala");
      if (formato === "pdf") descargar(await dictamenCasoPdf(d), nombre("pdf"), "application/pdf");
      else
        descargar(
          await dictamenCasoWord(d),
          nombre("docx"),
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
      setEstado(`Listo: se descargó ${nombre(formato)}. Búscalo en tus descargas.`);
    } catch (e) {
      setEstado(`No se pudo armar el dictamen: ${(e as Error).message}`);
    } finally {
      setArmando(null);
    }
  };

  // «Exportar» de la barra: trae las descargas a la vista y deja el foco en el PDF.
  useEffect(() => {
    if (!pedidoExportar) return;
    descargas.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    botonPdf.current?.focus({ preventScroll: true });
  }, [pedidoExportar]);

  // Ctrl+P descarga el PDF en este acto, como dice el botón.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void exportar("pdf");
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  });

  /**
   * Pone una cita donde está el cursor, una sola vez (O2, plan v4): si ya está, la resalta; si hay
   * una anterior del mismo tipo, la reemplaza. La escribe Croquis solo si el perito la pide.
   */
  const citar = (cita: string, marca: MarcaDeCita) => {
    const c = campoConclusion.current;
    // Al final de lo seleccionado, nunca encima: la cita anterior queda resaltada (seleccionada), y
    // la siguiente la habría reemplazado.
    const fin = c?.selectionEnd ?? conclusion.length;
    const nueva = citarUnaVez(conclusion, cita, marca, fin, fin);
    if (nueva.accion !== "ya_estaba") {
      setConclusion(nueva.texto);
      onValidacion(null);
    }
    setAvisoCita(
      nueva.accion === "ya_estaba"
        ? "Esa cita ya está en tu conclusión: quedó resaltada."
        : nueva.accion === "reemplazada"
          ? "Se actualizó la cita que ya tenías."
          : "Cita agregada a tu conclusión.",
    );
    requestAnimationFrame(() => {
      c?.focus();
      c?.setSelectionRange(nueva.desde, nueva.hasta);
    });
  };
  const pistaExportar = pedidoExportar
    ? "Elige cómo exportar: PDF, Word o el archivo .croquis."
    : null;
  const vPico = protagonista(reconstruccion);
  const idPico = vPico ? String(vPico.vehiculo) : null;
  const citaDeVelocidad = idPico ? citaVelocidad(reconstruccion, idPico, letraDe(idPico)) : null;
  const citaDeSupuestos = citaSupuestos(supuestos ?? []);

  return (
    <section
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,436px)]"
      data-testid="dictamen-caso"
      data-croquis={croquisUsado ?? undefined}
    >
      <div className="flex min-w-0 justify-center">
        <HojaDictamen
          titulo={titulo}
          casoId={casoId}
          lugar={lugar}
          narracion={relato}
          r={reconstruccion}
          calles={calles}
          contra={contra}
          letraDe={letraDe}
          conclusion={conclusion}
          perito={perito}
          firma={
            validacion && guardada
              ? { perito: validacion.perito, fecha: validacion.fecha, huella: guardada.huella }
              : null
          }
          formato={estructuraCesvi ? "cesvi" : "completo"}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <h2 className="font-[family-name:var(--fuente-titulo)] text-[3.25rem] leading-none font-normal tracking-[-0.03em]">
          Dictamen
        </h2>
        <label className="solo-trabajar flex flex-col gap-1.5">
          <span className="font-semibold">Tu conclusión</span>
          <textarea
            ref={campoConclusion}
            className="campo min-h-[160px]"
            placeholder="Escríbela tú. Croquis no la redacta por ti."
            value={conclusion}
            onChange={(e) => {
              setConclusion(e.target.value);
              onValidacion(null);
            }}
            data-testid="conclusion-perito"
          />
        </label>
        <div className="solo-trabajar flex flex-wrap gap-2" data-testid="citas-dictamen">
          {citaDeVelocidad && idPico ? (
            <button
              type="button"
              className="boton-secundario boton-compacto"
              onClick={() => citar(citaDeVelocidad, MARCAS_DE_CITA.velocidad(letraDe(idPico)))}
              data-testid="citar-velocidad"
            >
              Citar velocidad de {letraDe(idPico)}
            </button>
          ) : null}
          {contra ? (
            <button
              type="button"
              className="boton-secundario boton-compacto"
              onClick={() =>
                citar(
                  citaContraste(contra, letraDe(contra.vehiculo)),
                  MARCAS_DE_CITA.contraste(letraDe(contra.vehiculo)),
                )
              }
              data-testid="citar-contraste"
            >
              Citar contraste
            </button>
          ) : null}
          {citaDeSupuestos ? (
            <button
              type="button"
              className="boton-secundario boton-compacto"
              onClick={() => citar(citaDeSupuestos, MARCAS_DE_CITA.supuestos())}
              data-testid="citar-supuestos"
            >
              Citar supuestos
            </button>
          ) : null}
        </div>
        {avisoCita ? (
          <p role="status" className="solo-trabajar t-nota" data-testid="aviso-cita">
            {avisoCita}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold">Formato</span>
          <div className="segmentado" role="group" aria-label="Formato del dictamen">
            <button
              type="button"
              aria-pressed={estructuraCesvi}
              onClick={() => setEstructuraCesvi(true)}
              data-testid="formato-cesvi"
            >
              Estructura de CESVI
            </button>
            <button
              type="button"
              aria-pressed={!estructuraCesvi}
              onClick={() => setEstructuraCesvi(false)}
              data-testid="formato-completo"
            >
              Croquis completo
            </button>
          </div>
        </div>
        <div className="solo-trabajar flex flex-col gap-1.5">
          <label className="font-semibold" htmlFor="nombre-perito">
            Nombre del perito
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="nombre-perito"
              className="campo min-w-0 flex-1 basis-40"
              placeholder="Como aparecerá en la firma"
              value={perito}
              onChange={(e) => {
                setPerito(e.target.value);
                onValidacion(null);
              }}
              data-testid="nombre-perito"
            />
            <button
              type="button"
              className="boton-secundario"
              disabled={!perito.trim() || !conclusion.trim()}
              onClick={() =>
                onValidacion({
                  perito: perito.trim(),
                  conclusion: conclusion.trim(),
                  fecha: new Date().toISOString(),
                  huella: huellaDelCaso(expediente, narracion),
                })
              }
              data-testid="validar-dictamen"
            >
              Validar y firmar
            </button>
          </div>
        </div>
        <p role="status" className="t-nota" data-testid="estado-validacion">
          {validacion
            ? `Validó ${validacion.perito} el ${new Date(validacion.fecha).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}.`.replace(
                "..",
                ".",
              )
            : guardada
              ? `La validación de ${guardada.perito} era de otras entradas: cambiaron la narración o lo que marcaste. Vuelve a validar.`
              : "Sin validar: el dictamen sale como borrador. Para firmar, escribe tu conclusión y tu nombre."}
        </p>
        {/* El estado va arriba de los botones: abajo quedaba fuera de la pantalla (O2, plan v4). */}
        {(estado ?? pistaExportar) ? (
          <p role="status" className="t-interfaz" data-testid="estado-descarga">
            {estado ?? pistaExportar}
          </p>
        ) : null}
        <button
          ref={botonPdf}
          type="button"
          className="boton-principal flex items-center justify-between"
          onClick={() => void exportar("pdf")}
          aria-busy={armando === "pdf"}
          aria-disabled={armando !== null}
          data-testid="descargar-dictamen-pdf"
        >
          {armando === "pdf" ? "Armando el PDF…" : "Descargar el PDF"}
          <kbd className="font-mono text-[0.6875rem] opacity-70">Ctrl P</kbd>
        </button>
        <div className="grid grid-cols-3 gap-2" ref={descargas}>
          <button
            type="button"
            className="boton-secundario boton-compacto"
            onClick={() => void exportar("docx")}
            aria-busy={armando === "docx"}
            aria-disabled={armando !== null}
            data-testid="descargar-dictamen-word"
          >
            {armando === "docx" ? "Armando…" : "Word"}
          </button>
          <button
            type="button"
            className="boton-secundario boton-compacto"
            onClick={acciones.guardarArchivo}
            data-testid="guardar-caso"
          >
            .croquis
          </button>
          <button
            type="button"
            className="boton-secundario boton-compacto"
            onClick={acciones.guardarAqui}
            data-testid="guardar-en-equipo"
          >
            Guardar aquí
          </button>
        </div>
        {acciones.aviso ? (
          <p role="status" className="t-nota" data-testid="aviso-guardado">
            {acciones.aviso}
          </p>
        ) : null}
      </div>
    </section>
  );
}
