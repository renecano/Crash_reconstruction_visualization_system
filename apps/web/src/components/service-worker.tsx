"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (ADR 0030 y 0083) cuando la página ya cargó y el navegador está ocioso: la
 * precarga de la primera visita no compite con la carga ni con el horneado del visor.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return undefined;
    let cancelled = false;
    let idleId: number | undefined;
    const register = () => {
      if (cancelled) return;
      navigator.serviceWorker
        .register("/serwist/sw.js", { scope: "/" })
        .catch((err: unknown) => console.error("No se pudo registrar el service worker", err));
    };
    const whenIdle = () => {
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(register, { timeout: 10_000 });
      } else {
        idleId = globalThis.setTimeout(register, 2_000) as unknown as number;
      }
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", whenIdle);
      if (idleId !== undefined) {
        if ("cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
        else globalThis.clearTimeout(idleId);
      }
    };
  }, []);
  return null;
}
