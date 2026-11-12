"use client";

/**
 * El visor 3D de `/cesvi` en Unity (U6, plan v4 §3.3; ADR 0111). Arranca el build WebGL de Blob en
 * un lienzo, le manda el paquete caso-3d del caso y lo vuelve a mandar cuando la escena cambia.
 * Unity solo reproduce: el Resultado lo calcula aquí el solver de la web.
 *
 * Si Unity no puede (sin WebGL 2, sin manifiesto, versión del puente distinta, tarda demasiado o
 * pierde el dispositivo), muestra `respaldo`: el visor three.js de siempre.
 */
import type {
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
import {
  motivoDe,
  PuenteUnity,
  type MotivoRespaldo,
} from "@/lib/visor-unity/puente";
import { paqueteDelCaso, type RelieveCaso } from "@/lib/visor-unity/paquete";

/** Lo que el visor Unity le ofrece al caso: las fotos del dictamen y el paquete que tiene cargado. */
export interface ApiVisorUnity {
  capturar(vista: VistaCaptura, ancho: number, alto: number): Promise<string>;
  readonly paquete: Caso3D;
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

export function VisorUnity({
  escena,
  relieve = null,
  activo = true,
  camara = null,
  edicion = null,
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
  /** La cámara pedida por las pestañas; `n` cambia con cada pedido. */
  camara?: { modo: CamaraVisor; n: number } | null;
  edicion?: EdicionUnity | null;
  /** Lo que se muestra si Unity no puede: el visor three.js. */
  respaldo: ReactNode;
  onApi?: (api: ApiVisorUnity | null) => void;
  onTiempo?: (t: number) => void;
  onObjetoEditado?: (e: MensajesDeUnity["objetoEditado"]) => void;
  onPuntoMarcado?: (p: MensajesDeUnity["puntoMarcado"]) => void;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [puente, setPuente] = useState<PuenteUnity | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "arrancando", progreso: 0 });
  const [aviso, setAviso] = useState<string | null>(null);
  // Los callbacks del padre cambian en cada render: se leen de una referencia.
  const cb = useRef({ onApi, onTiempo, onObjetoEditado, onPuntoMarcado });
  cb.current = { onApi, onTiempo, onObjetoEditado, onPuntoMarcado };

  // Arranca Unity una vez, al montar.
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    let vivo = true;
    let p: PuenteUnity | null = null;
    const alMensaje = (m: MensajeDeUnity) => {
      if (m.tipo === "tiempo") cb.current.onTiempo?.(m.t);
      else if (m.tipo === "objetoEditado") cb.current.onObjetoEditado?.(m);
      else if (m.tipo === "puntoMarcado") cb.current.onPuntoMarcado?.(m);
      else if (m.tipo === "error" && m.codigo === "dispositivo_perdido") {
        setEstado({ fase: "respaldo", motivo: "dispositivo_perdido" });
      }
    };
    PuenteUnity.arrancar(c, alMensaje, {
      progreso: (x) => vivo && setEstado({ fase: "arrancando", progreso: x }),
    })
      .then((x) => {
        p = x;
        if (vivo) setPuente(x);
        else void x.cerrar();
      })
      .catch((e: unknown) => {
        if (vivo) setEstado({ fase: "respaldo", motivo: motivoDe(e) });
      });
    return () => {
      vivo = false;
      cb.current.onApi?.(null);
      if (p) void p.cerrar();
    };
  }, []);

  // Cada escena nueva: el Resultado completo, el paquete y a Unity. El último pedido gana.
  const turno = useRef(0);
  useEffect(() => {
    if (!puente) return;
    const mio = ++turno.current;
    setEstado({ fase: "calculando" });
    setAviso(null);
    (async () => {
      const resultado = await reconstruirCompletoEnNavegador(escena, undefined, relieve);
      if (mio !== turno.current) return;
      const paquete = paqueteDelCaso(escena, resultado, relieve);
      await puente.cargar(paquete);
      if (mio !== turno.current) return;
      setEstado({ fase: "listo" });
      cb.current.onApi?.({
        capturar: (vista, ancho, alto) => puente.capturar(vista, ancho, alto),
        paquete,
      });
    })().catch((e: unknown) => {
      if (mio !== turno.current) return;
      // Un caso que Unity no pudo cargar: el respaldo sí lo dibuja.
      setAviso(e instanceof Error ? e.message : String(e));
      setEstado({ fase: "respaldo", motivo: "no_cargo" });
    });
  }, [puente, escena, relieve]);

  // En el respaldo, Unity ya no se usa: se cierra y suelta su memoria.
  useEffect(() => {
    if (estado.fase !== "respaldo" || !puente) return;
    cb.current.onApi?.(null);
    void puente.cerrar();
    setPuente(null);
  }, [estado.fase, puente]);

  useEffect(() => {
    if (!puente || estado.fase !== "listo") return;
    puente.enviar(activo ? "reproducir" : "pausar", {});
  }, [puente, activo, estado.fase]);

  useEffect(() => {
    if (!puente || estado.fase !== "listo" || !camara) return;
    puente.enviar("camara", { modo: camara.modo });
  }, [puente, camara, estado.fase]);

  useEffect(() => {
    if (!puente || estado.fase !== "listo") return;
    puente.enviar("modoEdicion", {
      on: edicion?.on ?? false,
      ...(edicion?.herramienta ? { herramienta: edicion.herramienta } : {}),
      ...(edicion?.vehiculo_id ? { vehiculo_id: edicion.vehiculo_id } : {}),
    });
  }, [puente, edicion?.on, edicion?.herramienta, edicion?.vehiculo_id, estado.fase]);

  if (estado.fase === "respaldo") {
    return (
      <div className="relative h-full w-full" data-testid="visor-unity-respaldo" data-motivo={estado.motivo}>
        <p className="t-nota vidrio absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-control px-3 py-1.5">
          {TEXTO_RESPALDO[estado.motivo]}: se muestra el visor ligero.
          {aviso ? <span className="sr-only"> {aviso}</span> : null}
        </p>
        {respaldo}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" data-testid="visor-unity" data-fase={estado.fase}>
      <canvas
        ref={lienzo}
        id="visor-unity-lienzo"
        className="block h-full w-full"
        tabIndex={-1}
        // Unity lee el tamaño del lienzo; sin esto toma 300×150.
        style={{ width: "100%", height: "100%" }}
      />
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
