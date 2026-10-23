/// <reference lib="webworker" />
/**
 * Service worker de Croquis (F9, ADR 0030): la demo abre y reconstruye sin red.
 *
 * Precarga lo que genera `next build` (trozos de JavaScript con el solver, el visor, Rapier y los
 * resultados canónicos; CSS y fuentes) y lo de `public/` (cuerpos de MakeHuman y texturas). Eso se
 * sirve desde la caché y se renueva con cada despliegue (cada entrada lleva su revisión). La
 * extracción del relato con Claude (`/api/*`) no pasa por aquí: necesita red y la interfaz lo dice.
 *
 * Las páginas siempre al día (ADR 0083):
 * - **El HTML no se precarga:** va primero a la red y la copia guardada solo se usa sin internet.
 *   Antes, la portada salía de la precarga y un navegador que ya había abierto Croquis seguía
 *   viendo la versión anterior después de un despliegue.
 * - **Una versión nueva se activa sola** y toma las pestañas abiertas, sin esperar a que se cierren.
 *   Una pestaña de la versión anterior puede pedir después un trozo que ya no está en la precarga
 *   nueva ni en el despliegue nuevo: por eso los archivos estáticos del despliegue anterior se
 *   guardan aparte (`croquis-estaticos-previos`) hasta el siguiente.
 */
import { NetworkFirst, type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** La copia del HTML de las páginas, para abrirlas sin internet. */
const PAGINAS = "croquis-paginas";
/** Los archivos estáticos del despliegue anterior, para las pestañas que aún lo usan. */
const PREVIOS = "croquis-estaticos-previos";
/** Lo que se espera a la red antes de abrir la copia guardada de una página (s). */
const ESPERA_RED_S = 5;

/** Una entrada del manifiesto es una página si su URL no tiene extensión (`/`, `/cuenta`, `/en`). */
const urlDe = (e: PrecacheEntry | string) => (typeof e === "string" ? e : e.url);
const esPagina = (e: PrecacheEntry | string) => !/\.[a-z0-9]+$/i.test(urlDe(e).split("?")[0]!);
const manifiesto = self.__SW_MANIFEST ?? [];
const paginas = manifiesto.filter(esPagina);
const esEstatico = (url: URL) => url.pathname.startsWith("/_next/static/");
/** Las rutas de esta versión, para no guardar dos veces lo que ya está en su precarga. */
const actuales = new Set(manifiesto.map((e) => new URL(urlDe(e), self.location.origin).pathname));

const redPrimero = new NetworkFirst({
  cacheName: PAGINAS,
  networkTimeoutSeconds: ESPERA_RED_S,
  // `/visor?escena=…&calidad=…` abre sin red con la copia de `/visor`.
  matchOptions: { ignoreSearch: true },
});

const serwist = new Serwist({
  precacheEntries: manifiesto.filter((e) => !esPagina(e)),
  precacheOptions: { cleanupOutdatedCaches: true },
  runtimeCaching: [
    {
      matcher: ({ request, url }) =>
        request.mode === "navigate" && !/^\/(api|serwist)\//.test(url.pathname),
      handler: async ({ event, request, url }) => {
        try {
          return await redPrimero.handle({ event, request });
        } catch {
          // Sin red y sin copia de esa página, el inicio en su idioma.
          const inicio = /^\/en(\/|$)/.test(url.pathname) ? "/en" : "/";
          return (await (await caches.open(PAGINAS)).match(inicio)) ?? Response.error();
        }
      },
    },
    {
      // Lo estático que no está en la precarga de esta versión: el del despliegue anterior, si lo
      // hay; si no, la red.
      matcher: ({ url }) => url.origin === self.location.origin && esEstatico(url),
      handler: async ({ request }) =>
        (await (await caches.open(PREVIOS)).match(request, { ignoreSearch: true })) ??
        fetch(request),
    },
  ],
  skipWaiting: true,
  clientsClaim: true,
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      // Las páginas de la demo se guardan con la versión de este despliegue, para abrirlas sin
      // red. Si una falla, la instalación sigue: esa página se guarda al visitarla.
      caches.open(PAGINAS).then((c) =>
        Promise.allSettled(
          paginas.map(async (e) => {
            const url = urlDe(e);
            const r = await fetch(url, { cache: "no-store" });
            if (r.ok) await c.put(url, r);
          }),
        ),
      ),
      // Lo estático de la versión anterior pasa aparte antes de que la activación lo limpie de la
      // precarga; lo del despliegue de antes de ese se descarta.
      (async () => {
        const precarga = await caches.open(serwist.precacheStrategy.cacheName);
        await caches.delete(PREVIOS);
        const previos = await caches.open(PREVIOS);
        for (const req of await precarga.keys()) {
          const url = new URL(req.url);
          if (!esEstatico(url) || actuales.has(url.pathname)) continue;
          const r = await precarga.match(req);
          url.search = "";
          if (r) await previos.put(url.href, r);
        }
      })(),
    ]),
  );
});

serwist.addEventListeners();
