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
  type Reconstruccion,
  type VerificacionVehiculo,
} from "@croquis/cesvi";
import type { ViewerExportApi } from "@croquis/viewer";
import type { Map as MapaMl } from "maplibre-gl";
import { useState } from "react";
import { huellaDelCaso, validacionVigente, type ValidacionPerito } from "@/lib/caso-guardado";
import { croquisDeReconstruccion } from "@/lib/croquis-caso";
import { croquisSobreMapa } from "@/lib/croquis-mapa";
import { dictamenCasoPdf, dictamenCasoWord, type DatosDictamenCaso } from "@/lib/dictamen-caso";
import { ESTILO_MAPA, ESTILO_MAPA_CLARO } from "./mapa-comun";

function descargar(bytes: Uint8Array, nombre: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Tres cuadros del 3D: antes del impacto, en el impacto y al final. */
function cuadros(api: ViewerExportApi | null, resultado: Record<string, unknown>) {
  if (!api) return [];
  const t0 = Number(resultado.t_inicio ?? -1);
  const t1 = Number(resultado.t_fin ?? 1);
  return [
    { t: Math.max(t0, -1), etiqueta: "Antes del impacto (−1 s)" },
    { t: 0, etiqueta: "En el impacto (0 s)" },
    { t: t1, etiqueta: `En reposo (+${t1.toFixed(1)} s)` },
  ].flatMap(({ t, etiqueta }) => {
    try {
      const c = api.captureFrame({ t, width: 960, height: 540 });
      return [{ etiqueta, imagen: c.toDataURL("image/png") }];
    } catch {
      return [];
    }
  });
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
}: {
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
}) {
  const [estructuraCesvi, setEstructuraCesvi] = useState(false);
  const [perito, setPerito] = useState(guardada?.perito ?? "");
  const [conclusion, setConclusion] = useState(guardada?.conclusion ?? "");
  // Solo vale si es de estas mismas entradas; si el perito las cambió, el dictamen es borrador.
  const vigente = validacionVigente(guardada, expediente, narracion);
  const validacion: DatosDictamenCaso["validacion"] = vigente
    ? { perito: guardada.perito, conclusion: guardada.conclusion, fecha: guardada.fecha }
    : null;
  const [estado, setEstado] = useState<string | null>(null);
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
  const datos = async (): Promise<DatosDictamenCaso> => {
    const c = await croquis();
    return {
      expediente,
      narracion,
      reconstruccion,
      verificacion,
      croquis: c.imagen,
      croquisSobreMapa: c.sobreMapa,
      cuadros3d: cuadros(exportApi, reconstruccion.resultado),
      declarada,
      validacion,
      estructuraCesvi,
      trazabilidad: {
        metodo: `solver de Croquis ${String(reconstruccion.resultado.version_resultado ?? "")}, lectura ${VERSION_PROMPT_ESCENA}, verificación con el método de CESVI`,
        huella: huellaDelCaso(expediente, narracion),
      },
    };
  };
  const nombre = (ext: string) => `dictamen-reconstruccion${validacion ? "" : "-borrador"}.${ext}`;

  const exportar = async (formato: "pdf" | "docx") => {
    setEstado(formato === "pdf" ? "Armando el PDF…" : "Armando el Word…");
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
      setEstado(null);
    } catch (e) {
      setEstado(`No se pudo armar el dictamen: ${(e as Error).message}`);
    }
  };

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="dictamen-caso"
      data-croquis={croquisUsado ?? undefined}
    >
      <h2 className="t-subtitulo">Dictamen</h2>
      <p className="t-nota">
        Lleva tu narración, el croquis sobre las calles del mapa (a escala si no hay mapa), cuadros
        del 3D si lo abriste, los resultados con sus rangos, la verificación con el método de CESVI,
        la comparación con la declaración si la usaste y la trazabilidad. La conclusión es tuya; sin
        validar, sale como borrador.
      </p>
      <label className="solo-trabajar flex flex-col gap-1.5">
        <span className="t-nota">Conclusión del perito</span>
        <textarea
          className="campo min-h-[96px]"
          value={conclusion}
          onChange={(e) => {
            setConclusion(e.target.value);
            onValidacion(null);
          }}
          data-testid="conclusion-perito"
        />
      </label>
      <div className="solo-trabajar flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="t-nota">Nombre del perito</span>
          <input
            className="campo"
            value={perito}
            onChange={(e) => {
              setPerito(e.target.value);
              onValidacion(null);
            }}
            data-testid="nombre-perito"
          />
        </label>
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
          Validar
        </button>
      </div>
      <p role="status" className="t-nota" data-testid="estado-validacion">
        {validacion
          ? `Validó ${validacion.perito} el ${new Date(validacion.fecha).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}.`
          : guardada
            ? `La validación de ${guardada.perito} era de otras entradas: cambiaron la narración o lo que marcaste. Vuelve a validar; mientras, el dictamen sale como borrador.`
            : "Sin validar: el dictamen sale como borrador."}
      </p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={estructuraCesvi}
          onChange={(e) => setEstructuraCesvi(e.target.checked)}
          data-testid="estructura-cesvi"
        />
        <span className="t-interfaz">Con la estructura de los reportes de CESVI</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="boton-principal"
          onClick={() => void exportar("pdf")}
          data-testid="descargar-dictamen-pdf"
        >
          Descargar el PDF
        </button>
        <button
          type="button"
          className="boton-secundario"
          onClick={() => void exportar("docx")}
          data-testid="descargar-dictamen-word"
        >
          Descargar el Word
        </button>
      </div>
      {estado ? (
        <p role="status" className="t-interfaz">
          {estado}
        </p>
      ) : null}
    </section>
  );
}
