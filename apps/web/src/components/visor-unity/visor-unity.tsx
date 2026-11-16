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
import type { RelieveCaso } from "@/lib/visor-unity/paquete";
import { paqueteEnWorker, prepararPaqueteEnWorker } from "@/lib/visor-unity/paquete-en-worker";
import type { CanalTiempo } from "@/lib/visor-unity/canal";
import {
  ESTADO_INICIAL,
  reproducir,
  type Accion,
  type EstadoReproduccion,
  type Intervalo,
} from "@/lib/visor-unity/reproduccion";
import { BarraReproduccion } from "./barra-reproduccion";

/** Lo que el visor Unity le ofrece al caso: las fotos del dictamen y el paquete que tiene cargado. */
export interface ApiVisorUnity {
  capturar(vista: VistaCaptura, ancho: number, alto: number): Promise<string>;
  readonly paquete: Caso3D;
  /** Lleva el 3D a un instante (al volver del 2D se conserva el instante; A6). */
  ir?(t: number): void;
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

/**
 * El selector de cámara del 3D (René, 2026-11-16, A6): las generales y, por vehículo y por persona,
 * las suyas, a un clic. Funcional; su diseño final es de la pantalla de Reconstrucción (Fable).
 */
function SelectorCamara({
  camaras,
  elegida,
  onElegir,
}: {
  camaras: readonly CamaraDelCaso[];
  elegida: string | null;
  onElegir: (c: CamaraDelCaso) => void;
}) {
  const grupos = new Map<string, CamaraDelCaso[]>();
  for (const c of camaras) grupos.set(c.grupoNombre, [...(grupos.get(c.grupoNombre) ?? []), c]);
  return (
    <label className="vidrio absolute top-3 left-3 z-10 flex items-center gap-2 rounded-control px-3 py-1.5 text-[0.8125rem]">
      <span className="font-medium">Cámara</span>
      <select
        className="bg-transparent font-medium"
        value={camaras.some((c) => c.modo === elegida) ? (elegida ?? "") : ""}
        onChange={(e) => {
          const c = camaras.find((x) => x.modo === e.target.value);
          if (c) onElegir(c);
        }}
        data-testid="selector-camara"
      >
        <option value="" disabled>
          Elige una cámara
        </option>
        {[...grupos].map(([g, cs]) => (
          <optgroup key={g} label={g}>
            {cs.map((c) => (
              <option key={c.modo} value={c.modo}>
                {c.nombre}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/**
 * El aviso mientras carga, con el avance real (René, 2026-11-16): la primera vez, la descarga del
 * motor llena hasta el 40 % y el armado del caso hasta que se ve, el resto; después, solo el armado.
 */
function textoDeCarga(estado: Estado, primera: boolean, avance: number): string {
  const armado = Math.min(1, avance / FRACCION_VISIBLE);
  if (estado.fase === "arrancando")
    return `Cargando el visor 3D… ${Math.round(estado.progreso * 40)} %`;
  if (primera) return `Cargando el visor 3D… ${Math.round(40 + armado * 60)} %`;
  return `Preparando la escena… ${Math.round(armado * 100)} %`;
}

/** El avance con el que Unity avisa que el caso ya se ve (`VisorCaso`: vehículos, vía y cámara). */
const FRACCION_VISIBLE = 0.7;

export function VisorUnity({
  escena,
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
  // El armado del caso en Unity, de 0 a 1 (puente 1.3.0); a 0.7 el caso ya se ve.
  const [avance, setAvance] = useState(0);
  const [respaldoPor, setRespaldoPor] = useState<{ motivo: MotivoRespaldo; aviso?: string } | null>(
    null,
  );
  // La escena que Unity ya tiene cargada: si es la de ahora, el visor está listo.
  const [cargada, setCargada] = useState<EscenaSpec | null>(null);
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
    // El worker del paquete arranca junto con Unity: compila el esquema mientras Unity se descarga.
    prepararPaqueteEnWorker();
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
  const pedida = useRef<{ escena: EscenaSpec; relieve: RelieveCaso } | null>(null);
  const cargando = useRef(false);
  const [vueltas, setVueltas] = useState(0);
  // El solver corre en cuanto se pide el 3D, a la par que Unity se baja y arranca (antes esperaba a
  // que Unity estuviera listo: ~1 s más en la laptop; ADR 0119). La carga solo espera su resultado.
  const calculo = useRef<{
    escena: EscenaSpec;
    relieve: RelieveCaso;
    primero: Promise<Resultado>;
    completo: Promise<Resultado>;
  } | null>(null);
  const calcular = (e: EscenaSpec, r: RelieveCaso) => {
    const c = calculo.current;
    if (c && c.escena === e && c.relieve === r) return c;
    let alParcial!: (x: Resultado) => void;
    const parcial = new Promise<Resultado>((ok) => (alParcial = ok));
    const completo = reconstruirCompletoEnNavegador(e, (x) => alParcial(x), r);
    const primero = Promise.race([parcial, completo]);
    // Si la carga no llega a esperarlos (Unity falló), no quedan rechazos sin atender.
    primero.catch(() => undefined);
    completo.catch(() => undefined);
    calculo.current = { escena: e, relieve: r, primero, completo };
    return calculo.current;
  };
  useEffect(() => {
    if (dormir) return;
    calcular(escena, relieve);
  }, [escena, relieve, dormir]);
  useEffect(() => {
    if (!puente || dormir) return;
    if (pedida.current?.escena === escena && pedida.current.relieve === relieve) return;
    pedida.current = { escena, relieve };
    const mio = ++turno.current;
    cargando.current = true;
    puente.despertar();
    (async () => {
      // Unity solo dibuja trayectorias, eventos, daño y personas: la reconstrucción, que llega en
      // milisegundos. El resultado completo (Monte Carlo, inversión, consistencia) llega después y
      // solo cambia el paquete que se descarga, sin volver a cargar la escena (U6: antes se esperaba
      // a Monte Carlo y el 3D tardaba unos 11 s más).
      marcar("solver");
      const { primero, completo } = calcular(escena, relieve);
      const resultado = await primero;
      marcar("solver_listo");
      if (mio !== turno.current) return;
      // Se arma y se valida en un worker: en el hilo principal compilaba el esquema (ADR 0119).
      const json = await paqueteEnWorker(escena, resultado, relieve);
      if (mio !== turno.current) return;
      const paquete = JSON.parse(json) as Caso3D;
      marcar("cargar_caso");
      setAvance(0);
      const { completo: armado } = await puente.cargar(json, undefined, (f) => {
        if (mio === turno.current) setAvance(f);
      });
      void armado.then(() => marcar("caso_completo")).catch(() => undefined);
      marcar("caso_cargado");
      if (mio !== turno.current) return;
      setCargada(escena);
      // Un caso recién cargado empieza a reproducirse desde su inicio, a velocidad normal.
      repActual.current = { ...ESTADO_INICIAL, t: resultado.t_inicio };
      setRep(repActual.current);
      setIntervalo({ inicio: resultado.t_inicio, fin: resultado.t_fin });
      const api = {
        capturar: (vista: VistaCaptura, ancho: number, alto: number) =>
          puente.capturar(vista, ancho, alto),
        paquete,
        // Unity avisa el tiempo nuevo y la barra lo sigue (el aviso «tiempo»).
        ir: (t: number) => puente.enviar("fijarTiempo", { t }),
      };
      cb.current.onApi?.(api);
      const final = await completo.catch(() => null);
      if (final && mio === turno.current && final !== resultado) {
        const completoJson = await paqueteEnWorker(escena, final, relieve).catch(() => null);
        if (completoJson && mio === turno.current)
          cb.current.onApi?.({ ...api, paquete: JSON.parse(completoJson) as Caso3D });
      }
      // El entorno se sigue armando después de que el caso ya se ve: Unity no se duerme hasta terminar.
      await armado.catch(() => undefined);
    })()
      .finally(() => {
        if (mio !== turno.current) return;
        cargando.current = false;
        // El ciclo de dibujo vuelve a decidirse ahora que terminó la carga.
        setVueltas((v) => v + 1);
      })
      .catch((e: unknown) => {
        if (mio !== turno.current) return;
        // Un caso que Unity no pudo cargar: el respaldo sí lo dibuja. Unity se cierra.
        setRespaldoPor({ motivo: "no_cargo", aviso: e instanceof Error ? e.message : String(e) });
        cb.current.onApi?.(null);
        void puente.cerrar();
        setPuente(null);
      });
  }, [puente, escena, relieve, dormir]);

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
      {/* Sin la barra al presentar (el instante lo pone el capítulo) y al editar en 3D. */}
      {listo && camaras.length && !tiempo && !edicion?.on ? (
        <SelectorCamara camaras={camaras} elegida={elegida?.modo ?? null} onElegir={elegirCamara} />
      ) : null}
      {listo && intervalo && !tiempo && !edicion?.on ? (
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
          {textoDeCarga(estado, cargada === null, avance)}
        </p>
      ) : null}
    </div>
  );
}
