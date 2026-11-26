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
import type { PisoUnity } from "@/lib/visor-unity/piso";
import { conPisoYFantasma } from "@croquis/scene-schema";
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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { reconstruirCompletoEnNavegador } from "@/lib/reconstruct-client";
import {
  conTope,
  ESPERA_CALCULO_3D_MS,
  marcar,
  motivoDe,
  PuenteUnity,
  type MotivoRespaldo,
} from "@/lib/visor-unity/puente";
import { deformacionesMedidas } from "@/lib/visor-unity/deformacion-medida";
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
  grabarVideoUnity,
  lienzoDelVideo,
  modoDelVideo,
  nombreDelVideo,
  textoTarda,
  VideoNoDisponible,
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
  /** La versión del puente del build (1.3.0 entiende el piso de mapa y el fantasma). */
  readonly puente?: string;
  /** El crédito de lo que se ve en el piso del modo «mapa real» ahora mismo (null sin él). */
  atribucionPiso?(): string | null;
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

/**
 * Una versión del caso para el 3D (ronda 4, punto 8): la escena de la declaración (o null para la
 * reconstruida, en un «¿y si…?») y su resultado ya calculado. Unity solo la reproduce.
 */
export interface VersionUnity {
  clave: string;
  /** Cómo se llama en pantalla (el fantasma de un build 1.3.0 la lleva). */
  etiqueta?: string;
  escena: EscenaSpec | null;
  resultado: Resultado;
}

/** El nombre de la tarjeta de video que da WebGL (null si no lo da), para el modo del video. */
function rendererDeLaTarjeta(): string | null {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const nombre = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return nombre;
  } catch {
    return null;
  }
}

export function VisorUnity({
  escena,
  version = null,
  piso = null,
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
  /**
   * Ronda 4: en vez de la reconstrucción, una versión del caso. Al alternar se conservan el instante
   * y la cámara (su modo); el paquete que se descarga y las fotos siguen siendo los de la
   * reconstrucción.
   */
  version?: VersionUnity | null;
  /**
   * Ronda 4, punto 9: el piso del modo «mapa real» (solo con un build 1.3.0). El paquete lleva el
   * mapa solo; lo que se ve en vivo (con la foto satelital) va por el mensaje `piso`.
   */
  piso?: PisoUnity | null;
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
  // Lo que Unity tiene que dibujar: la reconstrucción o una versión (con su resultado ya calculado).
  const vEscena = version?.escena ?? null;
  const vResultado = version?.resultado ?? null;
  const vClave = version?.clave ?? null;
  // Con un build 1.3.0 (ronda 4), la versión va como fantasma sobre la reconstrucción; con el
  // publicado antes (1.2.0), se alterna: Unity carga la versión en lugar de la reconstrucción.
  const superpone = conPisoYFantasma(puente?.version);
  const vEtiqueta = version?.etiqueta ?? "";
  const objetivo = useMemo(
    () =>
      superpone
        ? {
            escena,
            fijo: null,
            clave: vClave,
            fantasma: vResultado ? { etiqueta: vEtiqueta, resultado: vResultado } : null,
          }
        : { escena: vEscena ?? escena, fijo: vResultado, clave: vClave, fantasma: null },
    [superpone, escena, vEscena, vResultado, vClave, vEtiqueta],
  );
  // El piso que hay que mandar en el próximo paquete (el mapa solo) y el último que se mandó en vivo.
  const pisoActual = useRef<PisoUnity | null>(null);
  useEffect(() => {
    pisoActual.current = superpone ? piso : null;
  }, [superpone, piso]);
  const pisoEnviado = useRef<string | null>(null);
  // Mientras se graba el video, el piso lo maneja la grabación (el mapa solo).
  const grabando = useRef(false);
  // Lo que Unity ya tiene cargado: si es lo de ahora, el visor está listo.
  const [cargada, setCargada] = useState<typeof objetivo | null>(null);
  // El paquete de la reconstrucción: el que se descarga aunque se vea una versión.
  const paqueteBase = useRef<Caso3D | null>(null);
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
      : cargada === objetivo
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
  const pedida = useRef<{ objetivo: typeof objetivo; relieve: RelieveCaso } | null>(null);
  const cargando = useRef(false);
  /**
   * Una carga en Unity a la vez (René, 2026-11-20): una escena nueva mientras Unity carga la anterior
   * (en un caso de ciudad, las calles del mapa llegan después) espera a que termine y entonces va, solo
   * la última. Unity no dice de qué carga es cada respuesta: el «error» de la vieja (que tocaba lo que
   * la nueva ya había destruido) tumbaba la nueva y abría el visor de respaldo.
   */
  const enUnity = useRef(false);
  const [vueltas, setVueltas] = useState(0);
  /** Lo que el 3D omitió de este caso (un elemento con un dato faltante): se le dice al perito. */
  const [omitidos, setOmitidos] = useState<string[]>([]);
  useEffect(() => {
    if (!puente || dormir) return;
    if (pedida.current?.objetivo === objetivo && pedida.current.relieve === relieve) return;
    if (enUnity.current) return;
    // Mientras se graba el video, la escena no cambia: la nueva va al terminar (René, 2026-11-20).
    if (grabando.current) return;
    // Al alternar entre la reconstrucción y una versión (ronda 4) se queda el mismo instante.
    const mantener = pedida.current !== null && pedida.current.objetivo.clave !== objetivo.clave;
    pedida.current = { objetivo, relieve };
    const mio = ++turno.current;
    cargando.current = true;
    puente.despertar();
    (async () => {
      // Unity solo dibuja trayectorias, eventos, daño y personas: la reconstrucción, que llega en
      // milisegundos. El resultado completo (Monte Carlo, inversión, consistencia) llega después y
      // solo cambia el paquete que se descarga, sin volver a cargar la escena (U6: antes se esperaba
      // a Monte Carlo y el 3D tardaba unos 11 s más).
      const tAntes = repActual.current.t;
      const { escena: aCargar, fijo } = objetivo;
      marcar("solver");
      let completo: Promise<Resultado> | null = null;
      let resultado: Resultado;
      if (fijo) {
        // Una versión ya trae su resultado: no se vuelve a calcular nada.
        resultado = fijo;
      } else {
        let alParcial!: (r: Resultado) => void;
        const parcial = new Promise<Resultado>((ok) => (alParcial = ok));
        completo = reconstruirCompletoEnNavegador(aCargar, (r) => alParcial(r), relieve);
        resultado = await conTope(
          Promise.race([parcial, completo]),
          ESPERA_CALCULO_3D_MS,
          `El cálculo de la escena del 3D no terminó en ${ESPERA_CALCULO_3D_MS / 1000} s`,
        );
      }
      marcar("solver_listo");
      if (mio !== turno.current) return;
      const paquete = paqueteDelCaso(aCargar, resultado, relieve);
      const p = pisoActual.current;
      const conExtras = {
        ...paquete,
        ...(p
          ? {
              piso: {
                imagen: p.imagenMapa,
                centro_x: p.centro_x,
                centro_y: p.centro_y,
                lado_m: p.lado_m,
                atribucion: p.atribucionMapa,
              },
            }
          : {}),
        ...(objetivo.fantasma ? { fantasma: objetivo.fantasma } : {}),
      } as Caso3D;
      marcar("cargar_caso");
      enUnity.current = true;
      // El humo de las tandas: el paquete exacto que recibe Unity, para reproducir un caso que se traba.
      if ((window as unknown as { __croquisDiagnostico?: boolean }).__croquisDiagnostico)
        console.debug(`[croquis] paquete-3d ${JSON.stringify(conExtras)}`);
      let omitidosDelCaso: string[];
      try {
        omitidosDelCaso = await puente.cargar(conExtras);
      } finally {
        enUnity.current = false;
        // Si llegó otra escena mientras Unity cargaba, ahora va.
        setVueltas((v) => v + 1);
      }
      pisoEnviado.current = p ? p.imagenMapa : null;
      marcar("caso_cargado");
      if (mio !== turno.current) return;
      setOmitidos(omitidosDelCaso);
      setCargada(objetivo);
      // Un caso recién cargado empieza desde su inicio, a velocidad normal; al alternar con una
      // versión, en el mismo instante (dentro de lo que dura la otra) y con la misma velocidad.
      const t0 = mantener
        ? Math.min(resultado.t_fin, Math.max(resultado.t_inicio, tAntes))
        : resultado.t_inicio;
      repActual.current = { ...(mantener ? repActual.current : ESTADO_INICIAL), t: t0 };
      setRep(repActual.current);
      setIntervalo({ inicio: resultado.t_inicio, fin: resultado.t_fin });
      if (mantener) puente.enviar("fijarTiempo", { t: t0 });
      if (!fijo && !vClave) paqueteBase.current = paquete;
      const api = {
        capturar: (vista: VistaCaptura, ancho: number, alto: number) =>
          puente.capturar(vista, ancho, alto),
        paquete: paqueteBase.current ?? paquete,
        // Unity avisa el tiempo nuevo y la barra lo sigue (el aviso «tiempo»).
        ir: (t: number) => puente.enviar("fijarTiempo", { t }),
        puente: puente.version,
        atribucionPiso: () =>
          pisoEnviado.current && pisoActual.current
            ? pisoEnviado.current === pisoActual.current.imagenVivo
              ? pisoActual.current.atribucionVivo
              : pisoActual.current.atribucionMapa
            : null,
      };
      cb.current.onApi?.(api);
      const final = completo ? await completo.catch(() => null) : null;
      if (final && mio === turno.current && final !== resultado) {
        const conFinal = paqueteDelCaso(aCargar, final, relieve);
        if (!vClave) paqueteBase.current = conFinal;
        cb.current.onApi?.({ ...api, paquete: paqueteBase.current ?? conFinal });
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
        // Un caso que Unity no pudo cargar (o que no terminó a tiempo): el respaldo sí lo dibuja y
        // dice por qué. Unity se cierra.
        const aviso = e instanceof Error ? e.message : String(e);
        setRespaldoPor({
          motivo: /no contestó|no terminó/.test(aviso) ? "tardo_demasiado" : "no_cargo",
          aviso,
        });
        cb.current.onApi?.(null);
        void puente.cerrar();
        setPuente(null);
      });
    // `vClave` sale de `objetivo`; `vueltas`, para la escena que esperó a que Unity terminara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puente, objetivo, relieve, dormir, vueltas]);

  /** Manda el piso a Unity: lo que se ve en vivo, o el mapa solo (para el video). */
  const enviarPiso = (p: PisoUnity | null, vivo: boolean) => {
    if (!puente || !conPisoYFantasma(puente.version)) return;
    const imagen = p ? (vivo ? p.imagenVivo : p.imagenMapa) : null;
    if (pisoEnviado.current === imagen) return;
    pisoEnviado.current = imagen;
    puente.enviar(
      "piso",
      p && imagen
        ? {
            imagen,
            centro_x: p.centro_x,
            centro_y: p.centro_y,
            lado_m: p.lado_m,
            atribucion: vivo ? p.atribucionVivo : p.atribucionMapa,
          }
        : { imagen: null },
    );
  };
  // El piso en vivo: al activarlo, al mover la foto y después de cada carga (que trae el mapa solo).
  useEffect(() => {
    if (!puente || cargada !== objetivo || grabando.current) return;
    enviarPiso(superpone ? piso : null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `enviarPiso` lee referencias
  }, [puente, cargada, objetivo, piso, superpone]);

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
  /** «Tarda ~X min. ¿Seguir?» antes de grabar todo (René, 2026-11-26). */
  const [confirmacion, setConfirmacion] = useState<{
    ms: number;
    responder: (si: boolean) => void;
  } | null>(null);
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
    // Con tarjeta dedicada, al doble y en `ultra` (antialiasing, René, 2026-11-26); con integrada,
    // como antes: 1× y la calidad automática (a 2× la laptop de 8 GB no dibujó ningún cuadro).
    let modo = modoDelVideo(rendererDeLaTarjeta());
    const ponerModo = () => {
      if (modo.calidad) puente.enviar("calidad", { nivel: modo.calidad });
      const tamano = lienzoDelVideo(window.devicePixelRatio || 1, modo.escala);
      c.style.width = `${tamano.ancho}px`;
      c.style.height = `${tamano.alto}px`;
    };
    ponerModo();
    try {
      // Unity toma el tamaño nuevo en su siguiente cuadro.
      for (let i = 0; i < 6; i++) await new Promise((ok) => requestAnimationFrame(ok));
      const logo = new Image();
      logo.src = "/marca/logotipo-blanco.svg";
      await logo.decode().catch(() => undefined);
      // El video lleva el mapa sin la foto satelital (la licencia de Esri no menciona video) y el
      // crédito del mapa en cada cuadro (ronda 4).
      const pv = pisoActual.current;
      grabando.current = true;
      if (pv && pisoEnviado.current !== pv.imagenMapa) {
        enviarPiso(pv, false);
        for (let i = 0; i < 10; i++) await new Promise((ok) => requestAnimationFrame(ok));
      }
      const grabar = () =>
        grabarVideoUnity({
          credito: pv ? pv.atribucionMapa : null,
          lienzo: c,
          fijar: (t) => puente.enviar("fijarTiempo", { t }),
          inicio: intervalo.inicio,
          fin: intervalo.fin,
          logo,
          leyenda: LEYENDA_3D,
          signal: corte.signal,
          alProgreso: (hechos, total, ms) => setGrabacion({ hechos, total, ms }),
          confirmar: (ms) =>
            new Promise<boolean>((responder) => {
              // «Cancelar» o Esc mientras pregunta: no se queda esperando.
              corte.signal.addEventListener("abort", () => responder(false), { once: true });
              setConfirmacion({ ms, responder });
            }),
        });
      let video: Blob;
      try {
        video = await grabar();
      } catch (e) {
        // Si al doble no llega ningún cuadro, otra vez como antes: 1× y la calidad automática.
        if (!(e instanceof VideoNoDisponible) || modo.escala === 1) throw e;
        if (modo.calidad) puente.enviar("calidad", { nivel: "auto" });
        modo = { escala: 1, calidad: null };
        ponerModo();
        for (let i = 0; i < 6; i++) await new Promise((ok) => requestAnimationFrame(ok));
        video = await grabar();
      }
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
      if (modo.calidad) puente.enviar("calidad", { nivel: "auto" });
      setConfirmacion(null);
      puente.minimapa(minimapa);
      grabando.current = false;
      // Si cambió la escena mientras se grababa, ahora va.
      setVueltas((v) => v + 1);
      if (pisoActual.current) enviarPiso(pisoActual.current, true);
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
          {respaldoPor?.aviso ? (
            <span data-testid="visor-unity-aviso"> ({respaldoPor.aviso}).</span>
          ) : null}
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
      {/* La deformación que dibuja el 3D es la medida por CESVI donde el reporte la midió (René,
          2026-11-24): se dice cuál, con sus medidas. */}
      {listo && escena && deformacionesMedidas(escena).length ? (
        <p
          className="t-nota vidrio absolute top-3 left-3 z-10 max-w-[60%] rounded-control px-3 py-1.5"
          data-testid="visor-unity-deformacion-medida"
        >
          Deformación medida por CESVI:{" "}
          {deformacionesMedidas(escena)
            .map((d) => `${d.perfil_m.map((c) => Math.round(c * 100)).join(", ")} cm`)
            .join("; ")}
          .
        </p>
      ) : null}
      {/* Lo que el 3D no pudo dibujar y omitió (René, 2026-11-20): el caso abre igual y el perito lo sabe. */}
      {listo && omitidos.length ? (
        <p
          className="t-nota vidrio absolute bottom-3 left-3 z-10 max-w-[60%] rounded-control px-3 py-1.5"
          data-testid="visor-unity-omitidos"
        >
          En el 3D se omitió, por un dato que no se pudo leer: {omitidos.join("; ")}. La
          reconstrucción no cambia.
        </p>
      ) : null}
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
          {/* El video es de la reconstrucción: con una versión a la vista no se ofrece. */}
          {intervalo && !vClave ? (
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
            {confirmacion ? (
              <div className="flex flex-col gap-2" role="alertdialog" data-testid="video-tarda">
                <span className="t-interfaz">
                  {textoTarda(confirmacion.ms)} en esta computadora. ¿Seguir grabando?
                </span>
                <div className="flex gap-2 self-end">
                  <button
                    type="button"
                    className="boton-principal boton-compacto"
                    onClick={() => {
                      confirmacion.responder(true);
                      setConfirmacion(null);
                    }}
                    data-testid="video-seguir"
                  >
                    Seguir
                  </button>
                  <button
                    type="button"
                    className="boton-secundario boton-compacto"
                    onClick={() => {
                      confirmacion.responder(false);
                      setConfirmacion(null);
                    }}
                  >
                    No, cancelar
                  </button>
                </div>
              </div>
            ) : null}
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
