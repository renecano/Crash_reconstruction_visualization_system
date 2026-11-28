/**
 * «Descargar video» del 3D de Unity (René, 2026-11-18, B7): la reproducción completa con la cámara
 * elegida, en MP4 (H.264) a 1920×1080, con la leyenda ilustrativa (la dibuja Unity en el lienzo) y el
 * logo de Croquis en la esquina.
 *
 * Cuadro por cuadro, no en tiempo real: para cada instante se lleva Unity a ese tiempo
 * (`fijarTiempo`), se espera a que lo dibuje y se toma el cuadro del lienzo (`captureStream`). Así el
 * video sale fluido aunque la máquina no llegue a 30 fps. Lo codifica WebCodecs con Mediabunny
 * (MPL-2.0, ya en el stack, ADR 0031), como el video del visor three.js. Funciona en Chrome y Edge.
 */

export const ANCHO_VIDEO = 1920;
export const ALTO_VIDEO = 1080;
export const FPS_VIDEO = 30;

/**
 * Antialiasing del video (René, 2026-11-26): con una tarjeta de video dedicada, Unity dibuja cada cuadro
 * al doble (3840×2160) en calidad `ultra` y se reduce a 1920×1080, cuatro muestras por pixel del video
 * (supermuestreo). Se puede porque el video se hace cuadro por cuadro, no en tiempo real.
 */
export const SUPERMUESTREO_VIDEO = 2;

/**
 * Las tarjetas integradas no lo aguantan: en la laptop de 8 GB (Intel UHD) a 2× el 3D no dibujó ningún
 * cuadro, Chrome llegó a 3.7 GB y la memoria libre a 13 MB; a 1× un video de 8.67 s tardó 7 min
 * (2026-11-26). Con ellas el video va como antes: a 1× y en la calidad automática. Se reconocen por el
 * nombre que da WebGL de la tarjeta.
 */
export function tarjetaIntegrada(renderer: string | null): boolean {
  if (!renderer) return true;
  const r = renderer.toLowerCase();
  if (/swiftshader|llvmpipe|microsoft basic|software/.test(r)) return true;
  if (/intel/.test(r)) return !/\barc\b/.test(r);
  if (/radeon/.test(r)) return !/\brx\b|\bpro\b/.test(r);
  if (/nvidia|geforce|quadro|rtx|gtx|apple m\d/.test(r)) return false;
  return true;
}

/**
 * Las dos formas de grabar (René, 2026-11-28: 13 min por video es demasiado para un perito). Siempre
 * con el nivel y la resolución fijos mientras se graba: en automático, Unity los bajaba porque cuadro
 * por cuadro los fps son bajos, y el video salía con bordes dentados.
 * - `rapido` (por omisión): 1920×1080, en `alta` (antialiasing MSAA ×4) si la tarjeta lo dibuja a
 *   tiempo; si no, en `media` (antialiasing FXAA).
 * - `maxima`: con tarjeta dedicada, el doble en `ultra` (supermuestreo), o 1× en `ultra`, o 1× en
 *   `alta`: el primero que termine en 10 min. Con integrada, como `rapido` (a 2× la laptop de 8 GB no
 *   dibujó ningún cuadro).
 */
export type CalidadVideo = "rapido" | "maxima";
export interface ModoVideo {
  escala: 1 | 2;
  nivel: "ultra" | "alta" | "media";
}

/** Los modos que se prueban, en orden, según la calidad elegida y la tarjeta. */
export function modosDelVideo(
  renderer: string | null,
  calidad: CalidadVideo = "rapido",
): ModoVideo[] {
  const rapido: ModoVideo[] = [
    { escala: 1, nivel: "alta" },
    { escala: 1, nivel: "media" },
  ];
  if (calidad === "rapido" || tarjetaIntegrada(renderer)) return rapido;
  return [
    { escala: SUPERMUESTREO_VIDEO, nivel: "ultra" },
    { escala: 1, nivel: "ultra" },
    rapido[0]!,
  ];
}

/** La meta de «Rápido» (ms): un video de ~10 s del choque en 1 a 2 minutos (René, 2026-11-28). */
export const META_RAPIDO_MS = 120_000;

/**
 * El tope de «Máxima calidad» (ms): el perito eligió esperar, pero no una hora (en la Mac M1, al doble
 * en `ultra`, un video de 13 s no terminó en 60 min; 2026-11-28).
 */
export const META_MAXIMA_MS = 600_000;

/** ¿Este modo hace el video de `cuadros` cuadros dentro de la meta de la calidad elegida? */
export const aTiempo = (ms: number, cuadros: number, calidad: CalidadVideo = "rapido") =>
  ms * cuadros <= (calidad === "maxima" ? META_MAXIMA_MS : META_RAPIDO_MS);

/**
 * El modo con que se graba, con lo medido de cada uno (ms por cuadro; Infinity si no dibujó). En
 * cada calidad, el primero que hace el video dentro de su meta (2 min en «Rápido», 10 en «Máxima») o,
 * si ninguno, el más rápido. Antes de empezar se le dice al perito cuánto tardará.
 */
export function elegirModo(
  medidos: { modo: ModoVideo; ms: number }[],
  calidad: CalidadVideo,
  cuadros: number,
): { modo: ModoVideo; ms: number } | null {
  const dibujan = medidos.filter((m) => Number.isFinite(m.ms));
  if (!dibujan.length) return null;
  return (
    dibujan.find((m) => aTiempo(m.ms, cuadros, calidad)) ??
    dibujan.reduce((a, b) => (b.ms < a.ms ? b : a))
  );
}

/** En qué se fue el tiempo de una grabación (ms), para medir y para estimar la siguiente. */
export interface MedicionVideo {
  cuadros: number;
  ms_total: number;
  /** Desde que se pide el instante hasta que Unity entrega su cuadro dibujado. */
  ms_unity: number;
  /** Componer el cuadro (reducirlo, el logo y los letreros). */
  ms_componer: number;
  /** Entregarlo al codificador H.264. */
  ms_codificar: number;
  /** Cerrar el archivo (lo que queda por codificar y el MP4). */
  ms_cerrar: number;
  /** Las pasadas por codificador antes de esta (las que fallaron), con lo que tardaron. */
  fallidas?: { codificador: string; ms: number; error: string }[];
}

/** Lo que tardó cada cuadro en esta computadora, por calidad: para estimar antes de empezar. */
const CLAVE_MEDIDA = (c: CalidadVideo) => `croquis.video.msPorCuadro.${c}`;
export function medidaGuardada(c: CalidadVideo): number | null {
  try {
    const v = Number(localStorage.getItem(CLAVE_MEDIDA(c)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
export function guardarMedida(c: CalidadVideo, m: MedicionVideo) {
  try {
    if (m.cuadros > 0) localStorage.setItem(CLAVE_MEDIDA(c), String(m.ms_total / m.cuadros));
  } catch {
    /* sin almacenamiento: se mide al empezar */
  }
}

/**
 * La estimación antes de empezar: con lo que tardó cada cuadro la última vez en esta computadora; sin
 * eso, `null` (se mide con los primeros cuadros y, si pasa de dos minutos, se pregunta).
 */
export function estimarVideo(cuadros: number, msPorCuadro: number | null): number | null {
  return msPorCuadro === null ? null : Math.round(cuadros * msPorCuadro);
}

/** El tamaño del lienzo de Unity mientras se graba, en px de CSS (con su `devicePixelRatio`). */
export function lienzoDelVideo(
  dpr: number,
  escala = SUPERMUESTREO_VIDEO,
): { ancho: number; alto: number } {
  const d = dpr > 0 ? dpr : 1;
  return {
    ancho: (ANCHO_VIDEO * escala) / d,
    alto: (ALTO_VIDEO * escala) / d,
  };
}

/** Cuántos cuadros se miden antes de decir cuánto tardará, si no hay una grabación anterior. */
export const CUADROS_PARA_ESTIMAR = 8;
/** Desde cuánto se pregunta antes de seguir (ms): dos minutos. */
export const AVISAR_DESDE_MS = 120_000;

/** «Tarda ~8 min», «Tarda ~3 min», «Tarda menos de un minuto». */
export function textoTarda(ms: number): string {
  if (ms < 60_000) return "Tarda menos de un minuto";
  return `Tarda ~${Math.max(1, Math.round(ms / 60_000))} min`;
}

/** Los instantes de cada cuadro, de `inicio` a `fin` a `fps` (sin pasar de `fin`). */
export function instantesDelVideo(
  inicio: number,
  fin: number,
  fps = FPS_VIDEO,
  lenta: CamaraLenta | null = null,
  acelerado: Acelerado | null = null,
): number[] {
  if (!(fin > inicio)) return [inicio];
  if (!lenta && !acelerado) {
    const n = Math.floor((fin - inicio) * fps + 1e-9) + 1;
    return Array.from({ length: n }, (_, i) => inicio + i / fps);
  }
  // En la ventana del impacto, cada cuadro avanza `factor` de lo normal: el impacto dura más en el video.
  const t: number[] = [];
  for (let x = inicio; x <= fin + 1e-9;) {
    t.push(x);
    const factor =
      acelerado && x < acelerado.hasta - 1e-9
        ? acelerado.factor
        : lenta && enLenta(x, lenta)
          ? lenta.factor
          : 1;
    x += factor / fps;
  }
  return t;
}

/** El trayecto lejano acelerado en el video: hasta `hasta` (s), cada cuadro avanza `factor` veces. */
export interface Acelerado {
  hasta: number;
  factor: number;
}

/** Lo que dura el video «Desde el inicio» (René, 2026-11-27: ~1 min, no 12). */
export const VIDEO_DESDE_EL_INICIO_S = 60;
/** La llegada, los últimos segundos antes de la reconstrucción, va a velocidad normal. */
export const LLEGADA_NORMAL_S = 8;
const FACTORES = [2, 5, 10, 20, 50, 100, 200, 500];

/**
 * Cuánto acelerar el trayecto lejano para que el video «Desde el inicio» dure ~1 min: el tramo de
 * `inicio` a `reconstruccion − LLEGADA_NORMAL_S` va ×N (el primer N redondo que alcanza); la llegada y la
 * reconstrucción, como siempre (con su cámara lenta). Null si no hace falta.
 */
export function aceleradoDelVideo(
  inicio: number,
  reconstruccion: number,
  fin: number,
  lenta: CamaraLenta | null,
  objetivoS = VIDEO_DESDE_EL_INICIO_S,
): Acelerado | null {
  const hasta = reconstruccion - LLEGADA_NORMAL_S;
  if (!(hasta > inicio)) return null;
  const resto = instantesDelVideo(hasta, fin, FPS_VIDEO, lenta).length / FPS_VIDEO;
  const lejos = hasta - inicio;
  if (lejos + resto <= objetivoS) return null;
  const queda = Math.max(5, objetivoS - resto);
  const factor = FACTORES.find((f) => lejos / f <= queda) ?? FACTORES.at(-1)!;
  return { hasta, factor };
}

/** «Trayecto ilustrativo · acelerado ×20». */
export const rotuloAcelerado = (a: Acelerado) => `Trayecto ilustrativo · acelerado ×${a.factor}`;

/** La cámara lenta del video: de `desde` a `hasta` (s, 0 es el impacto), a `factor` de la velocidad. */
export interface CamaraLenta {
  desde: number;
  hasta: number;
  factor: number;
}

/**
 * La misma ventana y el mismo ×5 que la reproducción en Unity (`EnfasisImpacto`: 0.35 s antes y 0.8 s
 * después del impacto, a 0.2 de la velocidad).
 */
export const CAMARA_LENTA_VIDEO: CamaraLenta = { desde: -0.35, hasta: 0.8, factor: 0.2 };

export const enLenta = (t: number, l: CamaraLenta) => t >= l.desde - 1e-9 && t <= l.hasta + 1e-9;

/** «Cámara lenta ×5». */
export const rotuloLenta = (l: CamaraLenta) => `Cámara lenta ×${Math.round(1 / l.factor)}`;

/** «45 s», «3 min 10 s»: lo que dura el video, para elegir antes de grabar. */
export function duracionVideo(segundos: number): string {
  const s = Math.max(1, Math.round(segundos));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`;
}

/** «Faltan 40 s», «Falta 1 min 5 s», «Casi listo», a partir de lo que llevan los cuadros hechos. */
export function textoFalta(hechos: number, total: number, msTranscurridos: number): string {
  if (hechos <= 0) return "Calculando cuánto falta…";
  const restante = ((total - hechos) * msTranscurridos) / hechos / 1000;
  if (restante < 2) return "Casi listo";
  const s = Math.ceil(restante);
  if (s < 60) return `Faltan ${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m === 1 && r === 0 ? "Falta" : "Faltan"} ${m} min${r ? ` ${r} s` : ""}`;
}

/** «croquis-axa-a2010930-cinematica.mp4»: sin acentos ni espacios. */
export function nombreDelVideo(caso: string, camara: string | null): string {
  const limpio = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  return `croquis-${[limpio(caso) || "caso", camara ? limpio(camara) : ""].filter(Boolean).join("-")}.mp4`;
}

/** ¿Puede este navegador hacer el MP4? (WebCodecs y leer cuadros del lienzo: Chrome y Edge). */
export function puedeGrabarVideo(): boolean {
  const g = globalThis as Record<string, unknown>;
  return (
    typeof g.VideoEncoder === "function" &&
    typeof g.MediaStreamTrackProcessor === "function" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

export class VideoNoDisponible extends Error {}

interface Procesador {
  readable: ReadableStream<VideoFrame>;
}
type ConstructorProcesador = new (o: { track: MediaStreamTrack }) => Procesador;

export interface OpcionesGrabacion {
  /** El lienzo de Unity, ya al tamaño del video. */
  lienzo: HTMLCanvasElement;
  /** Lleva Unity a ese instante (pausado). */
  fijar: (t: number) => void;
  inicio: number;
  fin: number;
  /** El logo (blanco, fondo transparente) para la esquina; null sin logo. */
  logo: HTMLImageElement | null;
  /** Lo que dice la leyenda: va en los metadatos del archivo. */
  leyenda: string;
  /**
   * El crédito de lo que se ve en el piso (ronda 4: el mapa de OpenStreetMap en el modo «mapa
   * real»), abajo a la derecha de cada cuadro. Sin él, nada.
   */
  credito?: string | null;
  alProgreso?: (hechos: number, total: number, ms: number) => void;
  signal?: AbortSignal;
  /**
   * Antes de seguir, cuánto tardará todo (ms), medido con los primeros `CUADROS_PARA_ESTIMAR`
   * cuadros: si pasa de `AVISAR_DESDE_MS`, se pregunta y con `false` se cancela. Sin él, no se pregunta.
   */
  confirmar?: (msEstimados: number) => Promise<boolean>;
  /**
   * Lo que tardó cada cuadro al medir el modo (ms): con él se estima y se pregunta antes del primer
   * cuadro. Sin él, con los primeros `CUADROS_PARA_ESTIMAR`.
   */
  msPorCuadro?: number;
  /** En qué se fue el tiempo, al terminar. */
  alMedir?: (m: MedicionVideo) => void;
  /** La cámara lenta alrededor del impacto (con su letrero en el cuadro); sin ella, todo a 1×. */
  lenta?: CamaraLenta | null;
  /** El trayecto lejano acelerado (con su letrero en el cuadro). */
  acelerado?: Acelerado | null;
}

/** Espera la siguiente vuelta del navegador. */
const vuelta = () => new Promise<void>((ok) => requestAnimationFrame(() => ok()));

/**
 * Lo que se le dice al perito si de verdad no se puede (nunca el error crudo del navegador, como el
 * «Encoding error» de la Intel UHD, 2026-11-26).
 */
export const SIN_VIDEO =
  "No se pudo hacer el video en esta computadora. Cierra otras pestañas y vuelve a intentarlo; si sigue igual, actualiza Chrome o Edge, o haz el video en otra computadora.";

/**
 * Las configuraciones del codificador H.264, en orden: si una falla (en la laptop con Intel UHD, el
 * codificador por hardware dio «Encoding error», 2026-11-26), se vuelve a grabar con la siguiente.
 */
export const CODIFICADORES = [
  { aceleracion: "no-preference", calidad: "alta" },
  { aceleracion: "prefer-software", calidad: "alta" },
  { aceleracion: "prefer-software", calidad: "media" },
] as const;

/** Cuánto se espera a que llegue un cuadro antes de decir que el 3D no dibuja (ms). */
export const ESPERA_CUADRO_MS = 10_000;

/**
 * Cuántos cuadros se miden de cada modo antes de elegirlo. El nombre de la tarjeta no basta: en
 * laptops híbridas Chrome reporta la NVIDIA y dibuja en la Intel.
 */
export const CUADROS_PARA_MEDIR = 5;

/**
 * Los cuadros del lienzo de Unity, uno por instante y solo cuando se piden (René, 2026-11-28: 13 min
 * por video). Antes se leían todos los que Unity dibujaba, unos 60 por segundo, y cada uno es una copia
 * del cuadro desde la tarjeta de video: eso frenaba al propio Unity. Con `captureStream(0)` el
 * navegador no entrega ninguno hasta que se pide con `requestFrame`.
 */
function lectorDeCuadros(lienzo: HTMLCanvasElement) {
  const pista = lienzo.captureStream(0).getVideoTracks()[0] as
    (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
  if (!pista?.requestFrame) throw new VideoNoDisponible("El lienzo del 3D no entrega cuadros.");
  const Proc = (globalThis as unknown as { MediaStreamTrackProcessor: ConstructorProcesador })
    .MediaStreamTrackProcessor;
  const lector = new Proc({ track: pista }).readable.getReader();
  let ultimo: VideoFrame | null = null;
  let llegados = 0;
  let leyendo = true;
  const espera: { aviso: (() => void) | null } = { aviso: null };
  const lectura = (async () => {
    while (leyendo) {
      const { value, done } = await lector.read();
      if (done || !value) break;
      ultimo?.close();
      ultimo = value;
      llegados++;
      espera.aviso?.();
    }
  })();
  return {
    ultimo: () => ultimo,
    /**
     * El cuadro del instante que se acaba de fijar: se dejan pasar `vueltas` cuadros del navegador y
     * se pide uno solo. Con una basta: `requestFrame` toma el siguiente cuadro que se pinte, y Unity ya
     * tiene el instante nuevo (`fijarTiempo` es síncrono). Antes se esperaban dos cuadros completos
     * de Unity por instante. false si no llega en `ESPERA_CUADRO_MS`.
     */
    tomar: async (vueltas: number) => {
      for (let k = 0; k < vueltas; k++) await vuelta();
      const meta = llegados + 1;
      const llego = new Promise<void>((ok) => (espera.aviso = ok));
      pista.requestFrame!();
      // Al doble en `ultra` un cuadro puede tardar varios segundos (Mac M1: 1.5 s en promedio): con
      // 3 s de espera, uno lento se tomaba como «el 3D no dibuja» y la grabación bajaba de modo.
      await Promise.race([llego, new Promise((ok) => setTimeout(ok, ESPERA_CUADRO_MS))]);
      espera.aviso = null;
      return llegados >= meta;
    },
    cerrar: async () => {
      leyendo = false;
      pista.stop();
      await lector.cancel().catch(() => undefined);
      await lectura.catch(() => undefined);
      ultimo?.close();
      ultimo = null;
    },
  };
}

/**
 * Cuánto tarda Unity en dibujar cada cuadro al tamaño actual del lienzo (ms), con los primeros
 * instantes del video. Infinity si no llega ninguno.
 */
export async function msPorCuadro(
  lienzo: HTMLCanvasElement,
  fijar: (t: number) => void,
  instantes: number[],
): Promise<number> {
  const l = lectorDeCuadros(lienzo);
  try {
    fijar(instantes[0]!);
    if (!(await l.tomar(4))) return Infinity;
    const muestra = instantes.slice(1, 1 + CUADROS_PARA_MEDIR);
    const t0 = performance.now();
    for (const t of muestra) {
      fijar(t);
      if (!(await l.tomar(1))) return Infinity;
    }
    return muestra.length ? (performance.now() - t0) / muestra.length : 0;
  } finally {
    await l.cerrar();
  }
}

/**
 * Graba el MP4. Si el codificador falla, vuelve a grabar con la siguiente configuración de
 * `CODIFICADORES`; si fallan todas, o si el 3D no dibuja, rechaza con `VideoNoDisponible`.
 */
export async function grabarVideoUnity(o: OpcionesGrabacion): Promise<Blob> {
  if (!puedeGrabarVideo())
    throw new VideoNoDisponible("Este navegador no puede grabar el video: usa Chrome o Edge.");
  const mb = await import("mediabunny");

  // El lienzo donde se compone cada cuadro: el de Unity a 1920×1080 y el logo.
  const comp = document.createElement("canvas");
  comp.width = ANCHO_VIDEO;
  comp.height = ALTO_VIDEO;
  const ctx = comp.getContext("2d");
  if (!ctx) throw new VideoNoDisponible("No hay contexto 2D para componer el video.");

  const instantes = instantesDelVideo(
    o.inicio,
    o.fin,
    FPS_VIDEO,
    o.lenta ?? null,
    o.acelerado ?? null,
  );
  let pregunto = false;
  if (o.confirmar && o.msPorCuadro !== undefined && Number.isFinite(o.msPorCuadro)) {
    pregunto = true;
    const estimado = o.msPorCuadro * instantes.length;
    if (estimado > AVISAR_DESDE_MS && !(await o.confirmar(estimado)))
      throw new DOMException("Grabación cancelada", "AbortError");
  }
  const pasada = async (
    l: ReturnType<typeof lectorDeCuadros>,
    cfg: (typeof CODIFICADORES)[number],
  ): Promise<Blob | null> => {
    const bitrate = cfg.calidad === "alta" ? mb.QUALITY_HIGH : mb.QUALITY_MEDIUM;
    const codec = await mb.getFirstEncodableVideoCodec(["avc"], {
      width: ANCHO_VIDEO,
      height: ALTO_VIDEO,
      bitrate,
    });
    if (!codec) return null;
    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new mb.BufferTarget(),
    });
    const source = new mb.CanvasSource(comp, {
      codec,
      bitrate,
      keyFrameInterval: 2,
      hardwareAcceleration: cfg.aceleracion,
    });
    output.addVideoTrack(source, { frameRate: FPS_VIDEO });
    output.setMetadataTags({
      title: "Croquis — reconstrucción ilustrativa",
      description: o.leyenda,
      comment: o.leyenda,
    });
    const empezo = performance.now();
    const med = { unity: 0, componer: 0, codificar: 0 };
    await output.start();
    try {
      for (let i = 0; i < instantes.length; i++) {
        if (o.signal?.aborted) throw new DOMException("Grabación cancelada", "AbortError");
        const t0 = performance.now();
        o.fijar(instantes[i]!);
        const tomado = await l.tomar(i === 0 ? 4 : 1);
        const cuadro = tomado ? l.ultimo() : null;
        if (!cuadro) throw new VideoNoDisponible("El 3D no dibujó ningún cuadro.");
        const t1 = performance.now();
        med.unity += t1 - t0;
        dibujar(
          ctx,
          cuadro,
          o.logo,
          o.credito ?? null,
          o.acelerado && instantes[i]! < o.acelerado.hasta
            ? rotuloAcelerado(o.acelerado)
            : o.lenta && enLenta(instantes[i]!, o.lenta)
              ? rotuloLenta(o.lenta)
              : null,
        );
        const t2 = performance.now();
        med.componer += t2 - t1;
        await source.add(i / FPS_VIDEO, 1 / FPS_VIDEO);
        med.codificar += performance.now() - t2;
        o.alProgreso?.(i + 1, instantes.length, performance.now() - empezo);
        if (
          o.confirmar &&
          !pregunto &&
          i + 1 === CUADROS_PARA_ESTIMAR &&
          instantes.length > CUADROS_PARA_ESTIMAR
        ) {
          pregunto = true;
          const estimado = ((performance.now() - empezo) / (i + 1)) * instantes.length;
          if (estimado > AVISAR_DESDE_MS && !(await o.confirmar(estimado)))
            throw new DOMException("Grabación cancelada", "AbortError");
        }
      }
      const t3 = performance.now();
      await output.finalize();
      const ms = (x: number) => Math.round(x);
      o.alMedir?.({
        cuadros: instantes.length,
        ms_total: ms(performance.now() - empezo),
        ms_unity: ms(med.unity),
        ms_componer: ms(med.componer),
        ms_codificar: ms(med.codificar),
        ms_cerrar: ms(performance.now() - t3),
        fallidas,
      });
    } catch (e) {
      await output.cancel().catch(() => undefined);
      throw e;
    }
    const bytes = output.target.buffer;
    if (!bytes) throw new Error("El video quedó vacío.");
    return new Blob([bytes], { type: "video/mp4" });
  };

  const l = lectorDeCuadros(o.lienzo);
  const fallidas: NonNullable<MedicionVideo["fallidas"]> = [];
  try {
    let fallo: unknown = null;
    for (const cfg of CODIFICADORES) {
      const inicio = performance.now();
      try {
        const video = await pasada(l, cfg);
        if (video) return video;
      } catch (e) {
        // Cancelar o un 3D que no dibuja no se arreglan con otro codificador.
        if (
          e instanceof VideoNoDisponible ||
          (e instanceof DOMException && e.name === "AbortError")
        )
          throw e;
        fallo = e;
        fallidas.push({
          codificador: `${cfg.aceleracion} · ${cfg.calidad}`,
          ms: Math.round(performance.now() - inicio),
          error: e instanceof Error ? e.message : String(e),
        });
        console.warn(`Video: falló el codificador (${cfg.aceleracion}, ${cfg.calidad})`, e);
      }
    }
    throw new VideoNoDisponible(SIN_VIDEO, { cause: fallo });
  } finally {
    await l.cerrar();
  }
}

/** El cuadro llenando 1920×1080 (sin deformar) y el logo arriba a la derecha, con su sombra. */
function dibujar(
  ctx: CanvasRenderingContext2D,
  cuadro: VideoFrame,
  logo: HTMLImageElement | null,
  credito: string | null = null,
  rotulo: string | null = null,
) {
  const w = cuadro.displayWidth;
  const h = cuadro.displayHeight;
  const k = Math.max(ANCHO_VIDEO / w, ALTO_VIDEO / h);
  const dw = w * k;
  const dh = h * k;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
  // La reducción del cuadro al doble promedia sus pixeles (el supermuestreo).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cuadro, (ANCHO_VIDEO - dw) / 2, (ALTO_VIDEO - dh) / 2, dw, dh);
  if (logo && logo.naturalWidth > 0) {
    const alto = 44;
    const ancho = (logo.naturalWidth / logo.naturalHeight) * alto;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 12;
    ctx.drawImage(logo, ANCHO_VIDEO - ancho - 48, 40, ancho, alto);
    ctx.restore();
  }
  if (rotulo) {
    ctx.save();
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#fff";
    ctx.fillText(rotulo, 48, 44);
    ctx.restore();
  }
  if (credito) {
    ctx.save();
    ctx.font = "500 20px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#fff";
    ctx.fillText(credito, ANCHO_VIDEO - 48, ALTO_VIDEO - 28);
    ctx.restore();
  }
}
