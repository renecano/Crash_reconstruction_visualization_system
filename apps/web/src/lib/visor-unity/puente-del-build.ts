"use client";
/**
 * La versión del puente del build publicado, leída del manifiesto antes de arrancar Unity (René,
 * 2026-11-27): La escena y el video no ofrecen lo que el build no trae (el trayecto previo, la cámara
 * automática). Una sola lectura por página; mientras llega, o si no se puede leer, `null`, y lo que
 * depende de ella no se ofrece.
 */
import { useEffect, useState } from "react";
import { RUTA_MANIFIESTO, type ManifiestoVisorUnity } from "./puente";

let leido: Promise<string | null> | null = null;

/** La versión del puente que anuncia el manifiesto, o null (sin campo o sin manifiesto). */
export function puenteDelManifiesto(m: Pick<ManifiestoVisorUnity, "puente"> | null): string | null {
  return m?.puente && /^\d+\.\d+\.\d+$/.test(m.puente) ? m.puente : null;
}

function leerPuente(): Promise<string | null> {
  leido ??= fetch(RUTA_MANIFIESTO, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<ManifiestoVisorUnity>) : null))
    .then(puenteDelManifiesto)
    .catch(() => null);
  return leido;
}

export function usePuenteDelBuild(): string | null {
  const [puente, setPuente] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void leerPuente().then((p) => {
      if (vivo) setPuente(p);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return puente;
}
