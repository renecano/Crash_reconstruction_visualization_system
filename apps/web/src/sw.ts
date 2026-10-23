/// <reference lib="webworker" />
/**
 * Service worker de Croquis (F9, ADR 0030): la demo abre y reconstruye sin red.
 *
 * Precarga lo que genera `next build` (trozos de JavaScript con el solver, el visor, Rapier y los
 * resultados canónicos; CSS y fuentes) y lo de `public/` (cuerpos de MakeHuman y texturas). Eso se
 * sirve desde la caché y se renueva con cada despliegue (cada entrada lleva su revisión). La
 * extracción del relato con Claude (`/api/*`) no pasa por aquí: necesita red y la interfaz lo dice.
 *
 * El HTML de las páginas va primero a la red (ADR 0083): antes se servía desde la caché y quien ya
 * había abierto Croquis seguía viendo la versión anterior después de un despliegue (la nueva espera
 * a que se cierren las pestañas de la vieja). Las páginas de la demo se guardan al instalar, para
 * abrirlas sin red; sin red, una página que no se guardó abre el inicio en su idioma.
 */
import { NetworkFirst, type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** La caché del HTML de las páginas (aparte de la precarga, que sirve primero desde la caché). */
const PAGINAS = "croquis-paginas";
/** Lo que se espera a la red antes de abrir la copia guardada de una página (s). */
const ESPERA_RED_S = 5;

/** Una entrada del manifiesto es una página si su URL no tiene extensión (`/`, `/cuenta`, `/en`). */
const urlDe = (e: PrecacheEntry | string) => (typeof e === "string" ? e : e.url);
const esPagina = (e: PrecacheEntry | string) => !/\.[a-z0-9]+$/i.test(urlDe(e).split("?")[0]!);
const manifiesto = self.__SW_MANIFEST ?? [];
const paginas = manifiesto.filter(esPagina);

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
  ],
  // Una versión nueva espera a que se cierren las pestañas de la anterior: así una página abierta no
  // pide trozos que la limpieza de la caché ya borró. La primera instalación toma la página actual.
  skipWaiting: false,
  clientsClaim: true,
});

// Las páginas de la demo se guardan al instalar, con la versión de este despliegue, para abrirlas
// sin red. Si una falla, la instalación sigue: esa página se guarda al visitarla.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGINAS).then((c) =>
      Promise.allSettled(
        paginas.map(async (e) => {
          const url = urlDe(e);
          const r = await fetch(url, { cache: "no-store" });
          if (r.ok) await c.put(url, r);
        }),
      ),
    ),
  );
});

serwist.addEventListeners();
