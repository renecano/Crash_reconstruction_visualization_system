/**
 * El lado web del puente con el visor Unity (U6; contrato en `packages/scene-schema/visor-puente.md`).
 * Sin React: carga el build desde Vercel Blob con su manifiesto, recibe los mensajes de Unity y
 * manda los de la web. El componente `<VisorUnity>` lo usa; las fotos del dictamen también.
 */
import { archivosPrecargados } from "./precarga";
import {
  FUNCION_PUENTE_WEB,
  OBJETO_PUENTE_UNITY,
  VISOR_PUENTE_VERSION,
  type MensajeDeUnity,
  type MensajesAUnity,
  type VistaCaptura,
} from "@croquis/scene-schema";

/** Dónde quedó el build publicado (`tools/unity/publicar-web.mjs` escribe `/visor-unity/manifest.json`). */
export interface ManifiestoVisorUnity {
  huella: string;
  base: string;
  prefijo: string;
  loader: string;
  data: string;
  framework: string;
  code: string;
}

/** Lo que `createUnityInstance` devuelve y usamos. */
export interface InstanciaUnity {
  SendMessage(objeto: string, metodo: string, valor?: string): void;
  Quit(): Promise<void>;
}

type CrearInstancia = (
  lienzo: HTMLCanvasElement,
  config: Record<string, unknown>,
  progreso?: (p: number) => void,
) => Promise<InstanciaUnity>;

/**
 * Por qué no se pudo usar Unity: con cualquiera de estos, la web abre el visor de respaldo
 * (three.js), como dice el contrato.
 */
export type MotivoRespaldo =
  | "sin_webgl2"
  | "sin_manifiesto"
  | "no_cargo"
  | "tardo_demasiado"
  | "version_puente"
  | "dispositivo_perdido";

/** Lo más que se espera a que Unity arranque (ADR 0111): pasado el plazo, respaldo. */
export const ESPERA_ARRANQUE_MS = 90_000;

/** Lo más que se espera una foto del dictamen. */
export const ESPERA_CAPTURA_MS = 30_000;

export const RUTA_MANIFIESTO = "/visor-unity/manifest.json";

/**
 * Marca un momento de la carga (`performance.mark`, «unity:<paso>»): lo leen las pruebas y el panel
 * de rendimiento del navegador para saber en qué se va el tiempo hasta ver el 3D.
 */
export function marcar(paso: string): void {
  try {
    performance.mark(`unity:${paso}`);
  } catch {
    /* sin performance (pruebas unitarias) */
  }
}

export function urlsDelBuild(m: ManifiestoVisorUnity) {
  const base = `${m.base}${m.prefijo}Build/`;
  return {
    loader: base + m.loader,
    dataUrl: base + m.data,
    frameworkUrl: base + m.framework,
    codeUrl: base + m.code,
    // Los cielos van aparte, uno por AssetBundle, y Unity baja solo el del caso (U6).
    streamingAssetsUrl: `${m.base}${m.prefijo}StreamingAssets`,
  };
}

export function hayWebgl2(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

let cargador: { src: string; listo: Promise<void> } | null = null;

/**
 * Baja el cargador de Unity una sola vez por página y devuelve su `createUnityInstance`, leída al
 * momento (no la de la primera vez).
 */
async function cargarScript(src: string): Promise<CrearInstancia> {
  if (!cargador || cargador.src !== src) {
    const listo = new Promise<void>((ok, falla) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => falla(new Error(`No se pudo bajar ${src}`));
      document.head.appendChild(s);
    });
    cargador = { src, listo };
    listo.catch(() => {
      if (cargador?.listo === listo) cargador = null;
    });
  }
  await cargador.listo;
  const crear = (window as unknown as { createUnityInstance?: CrearInstancia }).createUnityInstance;
  if (!crear) throw new Error("El cargador de Unity no definió createUnityInstance");
  return crear;
}

type Oyente = (m: MensajeDeUnity) => void;

/**
 * El puente con una instancia de Unity. Solo hay una función global para los mensajes
 * (`croquisVisorMensaje`), así que solo puede haber un visor Unity vivo por página.
 */
export class PuenteUnity {
  private oyentes = new Set<Oyente>();
  private capturando: Promise<unknown> = Promise.resolve();
  private constructor(private readonly instancia: InstanciaUnity) {}

  /**
   * Arranca Unity en el lienzo y espera su `listo`. Rechaza con un `MotivoRespaldo` si no se puede.
   * `alMensaje` recibe todos los mensajes desde el principio (también los de antes de `listo`).
   */
  static async arrancar(
    lienzo: HTMLCanvasElement,
    alMensaje: Oyente,
    opciones: {
      manifiesto?: ManifiestoVisorUnity;
      esperaMs?: number;
      progreso?: (p: number) => void;
    } = {},
  ): Promise<PuenteUnity> {
    if (!hayWebgl2()) throw motivo("sin_webgl2");
    let m = opciones.manifiesto;
    if (!m) {
      try {
        const r = await fetch(RUTA_MANIFIESTO, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        m = (await r.json()) as ManifiestoVisorUnity;
      } catch {
        throw motivo("sin_manifiesto");
      }
    }
    const urls = urlsDelBuild(m);
    // Si la página ya lo estaba bajando de fondo (`precarga.ts`), Unity usa esas copias en vez de
    // pedirlo otra vez.
    marcar("precarga");
    const locales = await Promise.race([
      archivosPrecargados(urls),
      new Promise<null>((ok) =>
        setTimeout(() => ok(null), opciones.esperaMs ?? ESPERA_ARRANQUE_MS),
      ),
    ]);
    marcar("precarga_lista");
    let listo!: (v: string) => void;
    const version = new Promise<string>((ok) => (listo = ok));
    const antes: MensajeDeUnity[] = [];
    let puente: PuenteUnity | null = null;
    (window as unknown as Record<string, unknown>)[FUNCION_PUENTE_WEB] = (texto: string) => {
      let msg: MensajeDeUnity;
      try {
        msg = JSON.parse(texto) as MensajeDeUnity;
      } catch {
        return;
      }
      if (msg.tipo === "listo") listo(msg.version);
      alMensaje(msg);
      if (puente) puente.repartir(msg);
      else antes.push(msg);
    };
    const plazo = new Promise<never>((_, falla) =>
      setTimeout(() => falla(motivo("tardo_demasiado")), opciones.esperaMs ?? ESPERA_ARRANQUE_MS),
    );
    let instancia: InstanciaUnity;
    try {
      marcar("cargador");
      const crear = await Promise.race([cargarScript(urls.loader), plazo]);
      marcar("cargador_listo");
      instancia = await Promise.race([
        crear(
          lienzo,
          {
            dataUrl: locales?.dataUrl ?? urls.dataUrl,
            frameworkUrl: locales?.frameworkUrl ?? urls.frameworkUrl,
            codeUrl: locales?.codeUrl ?? urls.codeUrl,
            streamingAssetsUrl: urls.streamingAssetsUrl,
            // Las copias locales ya están en memoria: no se guardan otra vez en IndexedDB.
            ...(locales ? { cacheControl: () => "no-store" } : {}),
            companyName: "Croquis",
            productName: "Visor de Croquis",
            productVersion: m.huella,
          },
          opciones.progreso,
        ),
        plazo,
      ]);
    } catch (e) {
      if (esMotivo(e)) throw e;
      throw motivo("no_cargo");
    }
    marcar("instancia");
    const v = await Promise.race([version, plazo]);
    marcar("listo");
    puente = new PuenteUnity(instancia);
    if (typeof navigator !== "undefined" && navigator.webdriver) puente.paraPruebas();
    for (const x of antes) puente.repartir(x);
    if (v !== VISOR_PUENTE_VERSION) {
      await puente.cerrar();
      throw motivo("version_puente");
    }
    return puente;
  }

  enviar<K extends keyof MensajesAUnity>(mensaje: K, datos: MensajesAUnity[K]): void {
    this.registro?.enviados.push({ metodo: mensaje, datos });
    this.instancia.SendMessage(OBJETO_PUENTE_UNITY, mensaje, JSON.stringify(datos));
  }

  private registro: {
    enviados: { metodo: string; datos: unknown }[];
    recibidos: MensajeDeUnity[];
  } | null = null;

  /**
   * Solo en un navegador automatizado (las e2e, `navigator.webdriver`): guarda lo que va y viene y
   * deja el puente en `window.__croquisPuente`, con `depurar` (los interruptores de diagnóstico de
   * Unity, fuera del contrato) para que la prueba pregunte, por ejemplo, dónde se ve un punto.
   */
  paraPruebas(): void {
    this.registro = { enviados: [], recibidos: [] };
    const r = this.registro;
    this.oir((m) => r.recibidos.push(m));
    (window as unknown as Record<string, unknown>).__croquisPuente = {
      enviados: r.enviados,
      recibidos: r.recibidos,
      enviar: (m: keyof MensajesAUnity, d: never) => this.enviar(m, d),
      depurar: (d: object) =>
        this.instancia.SendMessage(OBJETO_PUENTE_UNITY, "depurar", JSON.stringify(d)),
    };
  }

  /** Oye los mensajes de Unity; devuelve cómo dejar de oírlos. */
  oir(o: Oyente): () => void {
    this.oyentes.add(o);
    return () => this.oyentes.delete(o);
  }

  /** Espera el siguiente mensaje que cumpla `cumple`; un `error` lo rechaza. */
  esperar<T extends MensajeDeUnity>(cumple: (m: MensajeDeUnity) => m is T, ms: number): Promise<T> {
    return new Promise<T>((ok, falla) => {
      const quitar = this.oir((m) => {
        if (cumple(m)) {
          quitar();
          clearTimeout(reloj);
          ok(m);
        } else if (m.tipo === "error") {
          quitar();
          clearTimeout(reloj);
          falla(new Error(`${m.codigo}: ${m.mensaje}`));
        }
      });
      const reloj = setTimeout(() => {
        quitar();
        falla(new Error(`Unity no contestó en ${ms / 1000} s`));
      }, ms);
    });
  }

  /** Carga un paquete caso-3d y espera `cargado`. */
  async cargar(paquete: unknown, ms = ESPERA_ARRANQUE_MS): Promise<void> {
    const llega = this.esperar(
      (m): m is Extract<MensajeDeUnity, { tipo: "cargado" }> => m.tipo === "cargado",
      ms,
    );
    this.enviar("cargarCaso", {
      json: typeof paquete === "string" ? paquete : JSON.stringify(paquete),
    });
    await llega;
  }

  /**
   * Una foto del dictamen, como URL `data:` PNG. Las fotos van una por una: Unity mueve el tiempo y
   * la cámara para cada una.
   */
  capturar(vista: VistaCaptura, ancho: number, alto: number): Promise<string> {
    const foto = this.capturando.then(async () => {
      const llega = this.esperar(
        (m): m is Extract<MensajeDeUnity, { tipo: "captura" }> =>
          m.tipo === "captura" && m.vista === vista,
        ESPERA_CAPTURA_MS,
      );
      this.enviar("capturar", { vista, ancho, alto });
      const m = await llega;
      return `data:image/png;base64,${m.png}`;
    });
    this.capturando = foto.catch(() => undefined);
    return foto;
  }

  async cerrar(): Promise<void> {
    this.oyentes.clear();
    try {
      await this.instancia.Quit();
    } catch {
      /* ya cerrado */
    }
    delete (window as unknown as Record<string, unknown>)[FUNCION_PUENTE_WEB];
  }

  private repartir(m: MensajeDeUnity) {
    for (const o of [...this.oyentes]) o(m);
  }
}

class ErrorRespaldo extends Error {
  constructor(readonly motivo: MotivoRespaldo) {
    super(`Visor Unity no disponible: ${motivo}`);
  }
}

function motivo(m: MotivoRespaldo) {
  return new ErrorRespaldo(m);
}

export function esMotivo(e: unknown): e is ErrorRespaldo {
  return e instanceof ErrorRespaldo;
}

/** El motivo de respaldo de un error de `arrancar`, o `no_cargo` si es otra cosa. */
export function motivoDe(e: unknown): MotivoRespaldo {
  return esMotivo(e) ? e.motivo : "no_cargo";
}
