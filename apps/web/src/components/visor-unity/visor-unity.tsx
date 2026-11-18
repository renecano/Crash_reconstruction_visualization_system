"use client";

/**
 * El visor 3D de `/cesvi` en Unity (U6, plan v4 §3.3; ADR 0111). Arranca el build WebGL de Blob en
 * un lienzo, le manda el paquete caso-3d del caso y lo vuelve a mandar cuando la escena cambia.
 * Unity solo reproduce: el Resultado lo calcula aquí el solver de la web.
 *
 * Si Unity no puede (sin WebGL 2, sin manifiesto, versión del puente distinta, tarda demasiado o
 * pierde el dispositivo), muestra `respaldo`: el visor three.js de siempre.
 */
import type { CamaraDelCaso } from "@/lib/visor-unity/camaras";
import type {
  Resultado,
  CamaraVisor,
  Caso3D,
  EscenaSpec,
  HerramientaEdicion,
  MensajeDeUnity,
  MensajesDeUnity,
  VistaCaptura,
} from "@croquis/scene-schema";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { reconstruirCompletoEnNavegador } from "@/lib/reconstruct-client";
import { marcar, motivoDe, PuenteUnity, type MotivoRespaldo } from "@/lib/visor-unity/puente";
import { paqueteDelCaso, type RelieveCaso } from "@/lib/visor-unity/paquete";
import type { CanalTiempo } from "@/lib/visor-unity/canal";
import {
  ESTADO_INICIAL,
  reproducir,
  type Accion,
  type EstadoReproduccion,
  type Intervalo,
} from "@/lib/visor-unity/reproduccion";
import { BarraReproduccion } from "./barra-reproduccion";
import { EnRanura, useMarco } from "./marco-vista";
import {
  ALTO_VIDEO,
  ANCHO_VIDEO,
  grabarVideoUnity,
  nombreDelVideo,
  puedeGrabarVideo,
  textoFalta,
} from "@/lib/visor-unity/video";
import { LEYENDA_3D } from "@/lib/dictamen-caso";
import { SelectorCamaras } from "./selector-camaras";

/** Lo que el visor Unity le ofrece al caso: las fotos del dictamen y el paquete que tiene cargado. */
export interface ApiVisorUnity {
  capturar(vista: VistaCaptura, ancho: number, alto: number): Promise<string>;
  readonly paquete: Caso3D;
  /** Lleva el 3D a un instante (al volver del 2D se conserva el instante; A6). */
  ir?(t: number): void;
}

export interface EdicionUnity {
  on: boolean;
  herramienta?: HerramientaEdicion;
  vehiculo_id?: string;
}

type Estado =
  | { fase: "arrancando"; progreso: number }
  | { fase: "calculando" }
  | { fase: "listo" }
  | { fase: "respaldo"; motivo: MotivoRespaldo };

const TEXTO_RESPALDO: Record<MotivoRespaldo, string> = {
  sin_webgl2: "Este navegador no tiene WebGL 2",
  sin_manifiesto: "No se encontró el visor publicado",
  no_cargo: "El visor 3D no cargó",
  tardo_demasiado: "El visor 3D tardó demasiado en cargar",
  version_puente: "El visor publicado es de otra versión",
  dispositivo_perdido: "La tarjeta de video se reinició",
};

/** Si el perito ocultó el minimapa (se recuerda en este navegador). */
const CLAVE_MINIMAPA = "croquis.minimapa";

export function VisorUnity({
  escena,
  relieve = null,
  activo = true,
  dormir = false,
  camara = null,
  camaras = [],
  edicion = null,
  tiempo = null,
  respaldo,
  onApi,
  onTiempo,
  onObjetoEditado,
  onPuntoMarcado,
}: {
  /** La escena que dibuja el 3D (la reconstruida, con calles y objetos del mapa). */
  escena: EscenaSpec;
  relieve?: RelieveCaso;
  /** El 3D está a la vista: si no, la reproducción se pausa. */
  activo?: boolean;
  /**
   * Nadie mira el 3D (ni el perito ni Presentar): Unity no dibuja y no carga casos; el último que
   * llegó se carga al volver, solo si cambió (René, 2026-11-16: la página nunca sin responder).
   */
  dormir?: boolean;
  /** La cámara pedida por las pestañas; `n` cambia con cada pedido. */
  camara?: { modo: CamaraVisor; n: number } | null;
  /** Las cámaras del caso para el selector del 3D (A6); sin ellas no hay selector. */
  camaras?: readonly CamaraDelCaso[];
  edicion?: EdicionUnity | null;
  /** Con un canal, el instante lo pone quien avisa (Presentar) y Unity no reproduce solo. */
  tiempo?: CanalTiempo | null;
  /** Lo que se muestra si Unity no puede: el visor three.js. */
  respaldo: ReactNode;
  onApi?: (api: ApiVisorUnity | null) => void;
  onTiempo?: (t: number) => void;
  onObjetoEditado?: (e: MensajesDeUnity["objetoEditado"]) => void;
  onPuntoMarcado?: (p: MensajesDeUnity["puntoMarcado"]) => void;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [puente, setPuente] = useState<PuenteUnity | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [respaldoPor, setRespaldoPor] = useState<{ motivo: MotivoRespaldo; aviso?: string } | null>(
    null,
  );
  // La escena que Unity ya tiene cargada: si es la de ahora, el visor está listo.
  const [cargada, setCargada] = useState<EscenaSpec | null>(null);
  // La reproducción que maneja el perito con la barra (I3): pausa, instante y velocidad.
  const [rep, setRep] = useState<EstadoReproduccion>(ESTADO_INICIAL);
  const repActual = useRef(rep);
  const [intervalo, setIntervalo] = useState<Intervalo | null>(null);
  // Los callbacks del padre cambian en cada render: se leen de una referencia.
  const cb = useRef({ onApi, onTiempo, onObjetoEditado, onPuntoMarcado });
  useEffect(() => {
    cb.current = { onApi, onTiempo, onObjetoEditado, onPuntoMarcado };
  });
  const estado: Estado = respaldoPor
    ? { fase: "respaldo", motivo: respaldoPor.motivo }
    : !puente
      ? { fase: "arrancando", progreso }
      : cargada === escena
        ? { fase: "listo" }
        : { fase: "calculando" };

  // Arranca Unity una vez, al montar. Si algo falla (aquí o después), Unity se cierra y suelta su
  // memoria, y se muestra el respaldo.
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    let vivo = true;
    let p: PuenteUnity | null = null;
    const alMensaje = (m: MensajeDeUnity) => {
      if (m.tipo === "tiempo") {
        cb.current.onTiempo?.(m.t);
        // El deslizador sigue a Unity, sin redibujar la página en cada cuadro.
        if (vivo && Math.abs(m.t - repActual.current.t) >= 0.04) {
          repActual.current = { ...repActual.current, t: m.t };
          setRep(repActual.current);
        }
      } else if (m.tipo === "objetoEditado") cb.current.onObjetoEditado?.(m);
      else if (m.tipo === "puntoMarcado") cb.current.onPuntoMarcado?.(m);
      else if (m.tipo === "error" && m.codigo === "dispositivo_perdido" && vivo) {
        setRespaldoPor({ motivo: "dispositivo_perdido" });
        cb.current.onApi?.(null);
        if (p) void p.cerrar();
        setPuente(null);
      }
    };
    marcar("arranque");
    PuenteUnity.arrancar(c, alMensaje, { progreso: (x) => vivo && setProgreso(x) })
      .then((x) => {
        p = x;
        if (vivo) setPuente(x);
        else void x.cerrar();
      })
      .catch((e: unknown) => {
        if (vivo) setRespaldoPor({ motivo: motivoDe(e) });
      });
    return () => {
      vivo = false;
      cb.current.onApi?.(null);
      if (p) void p.cerrar();
    };
  }, []);

  // Cada escena nueva: el Resultado completo, el paquete y a Unity. El último pedido gana. Con el 3D
  // dormido se espera; al despertar, solo se carga si la escena o el relieve cambiaron.
  const turno = useRef(0);
  const pedida = useRef<{ escena: EscenaSpec; relieve: RelieveCaso } | null>(null);
  const cargando = useRef(false);
  const [vueltas, setVueltas] = useState(0);
  useEffect(() => {
    if (!puente || dormir) return;
    if (pedida.current?.escena === escena && pedida.current.relieve === relieve) return;
    pedida.current = { escena, relieve };
    const mio = ++turno.current;
    cargando.current = true;
    puente.despertar();
    (async () => {
      // Unity solo dibuja trayectorias, eventos, daño y personas: la reconstrucción, que llega en
      // milisegundos. El resultado completo (Monte Carlo, inversión, consistencia) llega después y
      // solo cambia el paquete que se descarga, sin volver a cargar la escena (U6: antes se esperaba
      // a Monte Carlo y el 3D tardaba unos 11 s más).
      marcar("solver");
      let alParcial!: (r: Resultado) => void;
      const parcial = new Promise<Resultado>((ok) => (alParcial = ok));
      const completo = reconstruirCompletoEnNavegador(escena, (r) => alParcial(r), relieve);
      const resultado = await Promise.race([parcial, completo]);
      marcar("solver_listo");
      if (mio !== turno.current) return;
      const paquete = paqueteDelCaso(escena, resultado, relieve);
      marcar("cargar_caso");
      await puente.cargar(paquete);
      marcar("caso_cargado");
      if (mio !== turno.current) return;
      setCargada(escena);
      // Un caso recién cargado empieza a reproducirse desde su inicio, a velocidad normal.
      repActual.current = { ...ESTADO_INICIAL, t: resultado.t_inicio };
      setRep(repActual.current);
      setIntervalo({ inicio: resultado.t_inicio, fin: resultado.t_fin });
      const api = {
        capturar: (vista: VistaCaptura, ancho: number, alto: number) =>
          puente.capturar(vista, ancho, alto),
        paquete,
        // Unity avisa el tiempo nuevo y la barra lo sigue (el aviso «tiempo»).
        ir: (t: number) => puente.enviar("fijarTiempo", { t }),
      };
      cb.current.onApi?.(api);
      const final = await completo.catch(() => null);
      if (final && mio === turno.current && final !== resultado) {
        cb.current.onApi?.({ ...api, paquete: paqueteDelCaso(escena, final, relieve) });
      }
    })()
      .finally(() => {
        if (mio !== turno.current) return;
        cargando.current = false;
        // El ciclo de dibujo vuelve a decidirse ahora que terminó la carga.
        setVueltas((v) => v + 1);
      })
      .catch((e: unknown) => {
        if (mio !== turno.current) return;
        // Un caso que Unity no pudo cargar: el respaldo sí lo dibuja. Unity se cierra.
        setRespaldoPor({ motivo: "no_cargo", aviso: e instanceof Error ? e.message : String(e) });
        cb.current.onApi?.(null);
        void puente.cerrar();
        setPuente(null);
      });
  }, [puente, escena, relieve, dormir]);

  // Sin nadie mirando y sin una carga en curso, Unity no dibuja: el hilo principal queda libre.
  useEffect(() => {
    if (!puente) return;
    if (dormir && !cargando.current) puente.dormir();
    else puente.despertar();
  }, [puente, dormir, vueltas]);

  const listo = estado.fase === "listo";
  useEffect(() => {
    if (!puente || !listo) return;
    if (tiempo) {
      puente.enviar("pausar", {});
      return tiempo.oir((t) => puente.enviar("fijarTiempo", { t }));
    }
    puente.enviar(activo && !rep.pausado ? "reproducir" : "pausar", {});
  }, [puente, activo, tiempo, listo, rep.pausado]);

  // Lo que pide la barra: el estado que sigue y sus mensajes a Unity. Reproducir y pausar los manda
  // el efecto de arriba (dependen también de si el 3D está a la vista).
  const alControl = (a: Accion) => {
    if (!puente || !intervalo) return;
    const { estado: sigue, ordenes } = reproducir(repActual.current, a, intervalo);
    repActual.current = sigue;
    setRep(sigue);
    for (const o of ordenes) {
      if (o.mensaje === "reproducir" || o.mensaje === "pausar") continue;
      puente.enviar(o.mensaje, o.datos as never);
    }
  };

  useEffect(() => {
    if (!puente || !listo || !camara) return;
    puente.enviar("camara", { modo: camara.modo });
  }, [puente, camara, listo]);

  // La cámara que se ve: la última que pidieron las pestañas o el selector (A6).
  const [elegida, setElegida] = useState<{ modo: CamaraVisor; n: number } | null>(null);
  if (camara && (elegida === null || camara.n > elegida.n))
    setElegida({ modo: camara.modo, n: camara.n });
  const elegirCamara = (c: CamaraDelCaso) => {
    if (!puente) return;
    puente.enviar("camara", { modo: c.modo });
    setElegida((e) => ({ modo: c.modo, n: Math.max(e?.n ?? 0, camara?.n ?? 0) }));
    // La del daño se ve en el impacto: como «Ir al impacto».
    if (c.alImpacto) alControl({ tipo: "impacto" });
  };

  const { enMarco } = useMarco();
  const [minimapa, setMinimapa] = useState(() => {
    try {
      return window.localStorage.getItem(CLAVE_MINIMAPA) !== "no";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (!puente || !listo) return;
    puente.minimapa(minimapa);
  }, [puente, listo, minimapa]);
  // «Descargar video» (René, 2026-11-18, B7): la reproducción completa con la cámara elegida, a
  // 1920×1080, cuadro por cuadro (`lib/visor-unity/video.ts`).
  const [grabacion, setGrabacion] = useState<{ hechos: number; total: number; ms: number } | null>(
    null,
  );
  const [avisoVideo, setAvisoVideo] = useState<string | null>(null);
  const cancelarVideo = useRef<AbortController | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const descargarVideo = async () => {
    const c = lienzo.current;
    if (!puente || !intervalo || !c || grabacion) return;
    setAvisoVideo(null);
    if (!puedeGrabarVideo()) {
      setAvisoVideo("Este navegador no puede grabar el video: usa Chrome o Edge.");
      return;
    }
    const antes = { ancho: c.style.width, alto: c.style.height, t: repActual.current.t };
    const corte = new AbortController();
    cancelarVideo.current = corte;
    setGrabacion({ hechos: 0, total: 1, ms: 0 });
    // Pausado y sin minimapa; el lienzo, a 1920×1080 pixeles reales (la caja lo recorta).
    repActual.current = { ...repActual.current, pausado: true };
    setRep(repActual.current);
    puente.enviar("pausar", {});
    puente.minimapa(false);
    const dpr = window.devicePixelRatio || 1;
    c.style.width = `${ANCHO_VIDEO / dpr}px`;
    c.style.height = `${ALTO_VIDEO / dpr}px`;
    try {
      // Unity toma el tamaño nuevo en su siguiente cuadro.
      for (let i = 0; i < 6; i++) await new Promise((ok) => requestAnimationFrame(ok));
      const logo = new Image();
      logo.src = "/marca/logotipo-blanco.svg";
      await logo.decode().catch(() => undefined);
      const video = await grabarVideoUnity({
        lienzo: c,
        fijar: (t) => puente.enviar("fijarTiempo", { t }),
        inicio: intervalo.inicio,
        fin: intervalo.fin,
        logo,
        leyenda: LEYENDA_3D,
        signal: corte.signal,
        alProgreso: (hechos, total, ms) => setGrabacion({ hechos, total, ms }),
      });
      const url = URL.createObjectURL(video);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreDelVideo(
        escena.meta?.titulo ?? escena.meta?.id ?? "caso",
        camaras.find((x) => x.modo === elegida?.modo)?.nombre ?? null,
      );
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setAvisoVideo("Listo: el video se descargó.");
    } catch (e) {
      setAvisoVideo(
        e instanceof DOMException && e.name === "AbortError"
          ? "Se canceló el video."
          : e instanceof Error
            ? `No se pudo hacer el video: ${e.message}`
            : "No se pudo hacer el video.",
      );
    } finally {
      c.style.width = antes.ancho;
      c.style.height = antes.alto;
      puente.minimapa(minimapa);
      puente.enviar("fijarTiempo", { t: antes.t });
      cancelarVideo.current = null;
      setGrabacion(null);
    }
  };
  // Esc cancela el video mientras se graba.
  useEffect(() => {
    if (!grabacion) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelarVideo.current?.abort();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [grabacion]);

  const alternarMinimapa = () => {
    const si = !minimapa;
    setMinimapa(si);
    try {
      window.localStorage.setItem(CLAVE_MINIMAPA, si ? "si" : "no");
    } catch {
      /* sin almacenamiento: vale solo esta vez */
    }
  };

  useEffect(() => {
    if (!puente || !listo) return;
    puente.enviar("modoEdicion", {
      on: edicion?.on ?? false,
      ...(edicion?.herramienta ? { herramienta: edicion.herramienta } : {}),
      ...(edicion?.vehiculo_id ? { vehiculo_id: edicion.vehiculo_id } : {}),
    });
  }, [puente, edicion?.on, edicion?.herramienta, edicion?.vehiculo_id, listo]);

  if (estado.fase === "respaldo") {
    return (
      <div
        className="relative h-full w-full"
        data-testid="visor-unity-respaldo"
        data-motivo={estado.motivo}
      >
        <p className="t-nota vidrio absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-control px-3 py-1.5">
          {TEXTO_RESPALDO[estado.motivo]}: se muestra el visor ligero.
          {respaldoPor?.aviso ? <span className="sr-only"> {respaldoPor.aviso}</span> : null}
        </p>
        {respaldo}
      </div>
    );
  }

  return (
    <div
      ref={caja}
      className="relative h-full w-full overflow-hidden"
      data-testid="visor-unity"
      data-fase={estado.fase}
    >
      <canvas
        ref={lienzo}
        id="visor-unity-lienzo"
        className="block h-full w-full"
        tabIndex={-1}
        // Unity lee el tamaño del lienzo; sin esto toma 300×150.
        style={{ width: "100%", height: "100%" }}
      />
      {/* Sin la barra al presentar (el instante lo pone el capítulo) y al editar en 3D. En el marco
          del caso, solo con el 3D a la vista: el 2D pone los suyos. */}
      {listo && !tiempo && enMarco && activo ? (
        <EnRanura ranura="derecha">
          <button
            type="button"
            className="boton-secundario boton-compacto"
            aria-pressed={minimapa}
            onClick={alternarMinimapa}
            data-testid="minimapa"
          >
            {minimapa ? "Ocultar minimapa" : "Mostrar minimapa"}
          </button>
          {intervalo ? (
            <button
              type="button"
              className="boton-secundario boton-compacto"
              onClick={() => void descargarVideo()}
              disabled={grabacion !== null}
              data-testid="descargar-video"
            >
              Descargar video
            </button>
          ) : null}
        </EnRanura>
      ) : null}
      {avisoVideo && !grabacion ? (
        <p
          className="t-nota vidrio absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-control px-3 py-1.5"
          role="status"
          data-testid="aviso-video"
        >
          {avisoVideo}
        </p>
      ) : null}
      {grabacion ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-fondo/90"
          data-testid="grabando-video"
        >
          <div
            className="vidrio flex w-[min(360px,90%)] flex-col gap-3 rounded-panel p-5"
            role="status"
            aria-live="polite"
          >
            <span className="t-interfaz font-semibold">
              Grabando el video · {Math.floor((grabacion.hechos / grabacion.total) * 100)} %
            </span>
            <div
              className="h-2 overflow-hidden rounded-full bg-superficie-alta"
              role="progressbar"
              aria-label="Avance del video"
              aria-valuemin={0}
              aria-valuemax={grabacion.total}
              aria-valuenow={grabacion.hechos}
            >
              <div
                className="h-full bg-accion"
                style={{ width: `${(grabacion.hechos / grabacion.total) * 100}%` }}
              />
            </div>
            <span className="t-nota" data-testid="falta-video">
              {textoFalta(grabacion.hechos, grabacion.total, grabacion.ms)} · 1920×1080, MP4
            </span>
            <button
              type="button"
              className="boton-secundario boton-compacto self-end"
              onClick={() => cancelarVideo.current?.abort()}
              autoFocus
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
      {listo && camaras.length && !tiempo && !edicion?.on && (activo || !enMarco) ? (
        <SelectorCamaras
          camaras={camaras}
          elegida={elegida?.modo ?? null}
          onElegir={elegirCamara}
        />
      ) : null}
      {listo && intervalo && !tiempo && !edicion?.on && (activo || !enMarco) ? (
        <BarraReproduccion
          estado={rep}
          intervalo={intervalo}
          corre={activo && !rep.pausado}
          onAccion={alControl}
        />
      ) : null}
      {estado.fase !== "listo" ? (
        <p
          className="t-nota vidrio absolute bottom-4 left-1/2 -translate-x-1/2 rounded-control px-3 py-1.5"
          data-testid="visor-unity-cargando"
        >
          {estado.fase === "arrancando"
            ? `Cargando el visor 3D… ${Math.round(estado.progreso * 100)} %`
            : "Preparando la escena…"}
        </p>
      ) : null}
    </div>
  );
}
