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
  /** La cámara pedida por las pestañas; `n` cambia con cada pedido. */
  camara?: { modo: CamaraVisor; n: number } | null;
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
      if (m.tipo === "tiempo") cb.current.onTiempo?.(m.t);
      else if (m.tipo === "objetoEditado") cb.current.onObjetoEditado?.(m);
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

  // Cada escena nueva: el Resultado completo, el paquete y a Unity. El último pedido gana.
  const turno = useRef(0);
  useEffect(() => {
    if (!puente) return;
    const mio = ++turno.current;
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
      const api = {
        capturar: (vista: VistaCaptura, ancho: number, alto: number) =>
          puente.capturar(vista, ancho, alto),
        paquete,
      };
      cb.current.onApi?.(api);
      const final = await completo.catch(() => null);
      if (final && mio === turno.current && final !== resultado) {
        cb.current.onApi?.({ ...api, paquete: paqueteDelCaso(escena, final, relieve) });
      }
    })().catch((e: unknown) => {
      if (mio !== turno.current) return;
      // Un caso que Unity no pudo cargar: el respaldo sí lo dibuja. Unity se cierra.
      setRespaldoPor({ motivo: "no_cargo", aviso: e instanceof Error ? e.message : String(e) });
      cb.current.onApi?.(null);
      void puente.cerrar();
      setPuente(null);
    });
  }, [puente, escena, relieve]);

  const listo = estado.fase === "listo";
  useEffect(() => {
    if (!puente || !listo) return;
    if (tiempo) {
      puente.enviar("pausar", {});
      return tiempo.oir((t) => puente.enviar("fijarTiempo", { t }));
    }
    puente.enviar(activo ? "reproducir" : "pausar", {});
  }, [puente, activo, tiempo, listo]);

  useEffect(() => {
    if (!puente || !listo || !camara) return;
    puente.enviar("camara", { modo: camara.modo });
  }, [puente, camara, listo]);

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
