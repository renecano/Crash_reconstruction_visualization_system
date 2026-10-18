/// <reference lib="webworker" />
/**
 * Service worker de Croquis (F9, ADR 0030): la demo abre y reconstruye sin red.
 *
 * Precarga lo que genera `next build` (trozos de JavaScript con el solver, el visor, Rapier y los
 * resultados canónicos; CSS y fuentes), lo de `public/` (cuerpos de MakeHuman y texturas) y el HTML
 * de las páginas. Lo precargado se sirve desde la caché y se renueva con cada despliegue (cada
 * entrada lleva su revisión). La extracción del relato con Claude (`/api/*`) no pasa por aquí:
 * necesita red y la interfaz lo dice.
 */
import { type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    // `/visor?escena=…&calidad=…` usa el HTML precargado de `/visor`. `_rsc` no se ignora: esas
    // peticiones esperan la carga RSC, no HTML; sin red fallan y Next navega con el documento.
    ignoreURLParametersMatching: [/^(?!_rsc$).+$/],
    // Una ruta sin precargar abre el inicio (sin red no hay más que mostrar).
    navigateFallback: "/",
    navigateFallbackDenylist: [/^\/api\//, /^\/serwist\//],
  },
  // Una versión nueva espera a que se cierren las pestañas de la anterior: así una página abierta no
  // pide trozos que la limpieza de la caché ya borró. La primera instalación toma la página actual.
  skipWaiting: false,
  clientsClaim: true,
});

serwist.addEventListeners();
