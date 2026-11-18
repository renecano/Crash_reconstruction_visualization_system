"use client";
/**
 * La maqueta de un caso reconstruido: la escena con las velocidades reconstruidas (la misma que el
 * 3D), calculada en el worker para no bloquear la página, y con las calles del mapa si ya llegaron.
 */
import { EnRanura, useMarco } from "@/components/visor-unity/marco-vista";
import {
  formato as F,
  especReconstruida,
  posicionesEnTiempo,
  type Reconstruccion,
} from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import type { EscenaSpec } from "@croquis/scene-schema";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { conCallesDelMapa } from "@/lib/calles-del-mapa";
import { useSearchParams } from "next/navigation";
import { usePisoMapaReal } from "@/components/visor-unity/mapa-real";
import { SIN_AJUSTE } from "@/lib/visor-unity/piso";
import type { Canal } from "@/lib/canal";
import { METODO } from "@/lib/textos-caso";
import { kmhAntesDe, kmhEn, tImpacto, type ResultadoMaqueta } from "@/lib/maqueta";
import { reconstruirEnNavegador } from "@/lib/reconstruct-client";
import { BarraReproduccion } from "@/components/visor-unity/barra-reproduccion";
import type { Accion, Velocidad } from "@/lib/visor-unity/reproduccion";
import { EscenaMaqueta, type PedidoVista } from "./maqueta";

/**
 * W6: lo que tapan los paneles de la etapa (las pestañas y la nota de arriba, los botones de la
 * vista, la leyenda y la línea de tiempo de abajo), para que «Ver todo» encaje la escena en el resto.
 */
const MARGENES_ETAPA = { arriba: 150, abajo: 190, izq: 24, der: 24 };
/**
 * En el lado a lado de Contra CESVI, los botones de la vista van en columna a la derecha. Si el panel
 * es tan angosto que no deja la mitad libre, `encajar` ignora el margen.
 */
const MARGENES_COMPACTA = { arriba: 16, abajo: 16, izq: 16, der: 92 };

/**
 * PROTOTIPO (ronda 4; René, 2026-11-18: «el 2D de Reconstrucción no se entiende»): la leyenda corta
 * del croquis, con `?croquis=1|2|3`. 1: el croquis con el mapa tenue; 2: papel blanco con su cuadro
 * de referencia; 3: sobre la foto satelital.
 */
function CuadroCroquis({
  variante,
  nombres,
  atribucion,
}: {
  variante: 1 | 2 | 3;
  nombres: string[];
  atribucion: string | null;
}) {
  const fila = (simbolo: ReactNode, texto: string) => (
    <li className="flex items-center gap-2">
      <span className="inline-flex w-7 justify-center" aria-hidden="true">
        {simbolo}
      </span>
      {texto}
    </li>
  );
  return (
    <aside
      className={`pointer-events-auto absolute right-4 bottom-36 z-10 flex w-[17rem] flex-col gap-2 rounded-panel p-3 text-[0.75rem] ${variante === 2 ? "border-2 border-black bg-white text-black" : "vidrio"}`}
      data-testid="cuadro-croquis"
    >
      <span className="font-mono text-[0.6875rem] tracking-[0.08em] uppercase">
        {variante === 2 ? "Croquis ilustrativo · referencias" : "Leyenda"}
      </span>
      <ul className="flex flex-col gap-1">
        {fila(<span className="font-bold text-[#FF5B2E]">✕</span>, "Punto de impacto")}
        {fila(<span className="h-0.5 w-6 bg-[#FF5B2E]" />, "Trayectoria (más naranja, más rápido)")}
        {fila(<span className="h-3 w-5 rounded-sm border border-current" />, "Posición cada 0.4 s")}
        {fila(
          <span className="h-3 w-5 rounded-sm border border-dashed border-current" />,
          "Posición final",
        )}
        {fila(<span className="font-mono font-bold">A</span>, nombres.join(" · ") || "Vehículos")}
      </ul>
      {atribucion ? <span className="text-[0.625rem] opacity-80">{atribucion}</span> : null}
    </aside>
  );
}

export function MaquetaCaso({
  r,
  calles,
  nombres,
  detalles = {},
  anchoVia = null,
  compacta = false,
  tips = {},
  tipDelImpacto = null,
  sinControles = false,
  declarada = null,
  tInicial = null,
  onInstante,
}: {
  /**
   * El instante compartido con el 3D (A6): la maqueta empieza donde se quedó el 3D y avisa por dónde
   * va, para que al volver al 3D se conserve.
   */
  tInicial?: number | null;
  onInstante?: (t: number) => void;
  /** T6.2: la versión declarada ya simulada (R7), para dibujarla sobre la reconstrucción. */
  declarada?: { etiqueta: string; resultado: ResultadoMaqueta } | null;
  /** W6: sin «Ver todo», «Ir al impacto», zoom ni desplazamiento (el croquis del dictamen). */
  sinControles?: boolean;
  tips?: Record<string, string>;
  tipDelImpacto?: string | null;
  /** Solo el croquis, sin línea de tiempo ni leyenda («Lado a lado» de Contra CESVI). */
  compacta?: boolean;
  /** El ancho de la vía si el caso lo trae medido, con su origen. */
  anchoVia?: { m: number; de: string } | null;
  r: Reconstruccion;
  calles: OverpassResponse | null;
  nombres: Record<string, string>;
  /** La segunda línea de cada etiqueta (su daño). */
  detalles?: Record<string, string>;
}) {
  const spec = useMemo(() => {
    let s = especReconstruida(r);
    if (r.origen && calles) s = conCallesDelMapa(s, r.origen, calles);
    return s as unknown as EscenaSpec;
  }, [r, calles]);
  const [listo, setListo] = useState<{ spec: EscenaSpec; res: ResultadoMaqueta } | null>(null);
  const { enMarco } = useMarco();
  const sp = useSearchParams();
  const variante2d = (
    ["1", "2", "3"].includes(sp.get("croquis") ?? "") ? Number(sp.get("croquis")) : null
  ) as 1 | 2 | 3 | null;
  const piso2d = usePisoMapaReal(r.resultado, r.origen, {
    activo: variante2d === 1 || variante2d === 3,
    conFoto: variante2d === 3,
    ajuste: SIN_AJUSTE,
  });
  useEffect(() => {
    let vivo = true;
    // Con el relieve con que se reconstruyó (W5): la maqueta va sobre el mismo terreno.
    void reconstruirEnNavegador(spec, r.relieve)
      .then((res) => {
        if (vivo) setListo({ spec, res: res as unknown as ResultadoMaqueta });
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `spec` cambia con `r`, y con él su relieve
  }, [spec]);
  if (!listo || listo.spec !== spec)
    return (
      <p
        className="t-nota grid h-full place-items-center text-texto-3"
        data-testid="maqueta-calculando"
      >
        Calculando la maqueta…
      </p>
    );
  const conCalles = Boolean((spec as { lugar?: { red_vial?: unknown } }).lugar?.red_vial);
  // El que llega más rápido: su velocidad, de la llegada al impacto, en la propia simulación.
  const ti = tImpacto(listo.res);
  const veloz = [...listo.res.vehiculos].sort(
    (a, b) => kmhAntesDe(b.trayectoria, ti) - kmhAntesDe(a.trayectoria, ti),
  )[0];
  if (compacta)
    return (
      <EscenaMaqueta
        spec={spec}
        resultado={listo.res}
        relieve={r.relieve ?? null}
        navegable={!sinControles}
        margenes={MARGENES_COMPACTA}
        sinEtiquetas
      />
    );
  return (
    <div className="relative h-full w-full">
      <ConLineaDeTiempo resultado={listo.res} tInicial={tInicial} onInstante={onInstante}>
        {(t, pedido) => (
          <EscenaMaqueta
            pedidoVista={pedido}
            conBarra
            spec={spec}
            resultado={listo.res}
            relieve={r.relieve ?? null}
            navegable={!sinControles}
            margenes={MARGENES_ETAPA}
            nombres={nombres}
            detalles={detalles}
            anchoVia={anchoVia}
            t={t}
            tips={tips}
            tipDelImpacto={tipDelImpacto}
            declarada={declarada}
            fondo={
              variante2d && piso2d.piso
                ? {
                    imagen: variante2d === 3 ? piso2d.piso.imagenVivo : piso2d.piso.imagenMapa,
                    centroX: piso2d.piso.centro_x,
                    centroY: piso2d.piso.centro_y,
                    ladoM: piso2d.piso.lado_m,
                    opacidad: variante2d === 3 ? 0.55 : 0.32,
                  }
                : null
            }
            papel={variante2d === 2}
          />
        )}
      </ConLineaDeTiempo>
      {variante2d ? (
        <CuadroCroquis
          variante={variante2d}
          nombres={Object.values(nombres ?? {})}
          atribucion={
            variante2d === 2 || !piso2d.piso
              ? null
              : variante2d === 3
                ? piso2d.piso.atribucionVivo
                : piso2d.piso.atribucionMapa
          }
        />
      ) : null}
      {/* Cada cifra con su método (prompt §0): la de la maqueta no es el p50 de la tabla. En el marco
          del caso va abajo, fuera del dibujo (René, 2026-11-17). */}
      <LeyendaEnMarco>
        <div
          className={
            enMarco
              ? "flex flex-col gap-0.5 text-[0.75rem] leading-snug text-texto-2"
              : "vidrio absolute bottom-[6.25rem] left-4 flex max-w-[27rem] flex-col gap-0.5 rounded-control px-3 py-2 text-[0.75rem] leading-snug text-texto-2"
          }
          data-testid="maqueta-leyenda"
        >
          {veloz ? (
            <span className="font-mono text-texto" data-testid="maqueta-velocidad">
              velocidad de {nombres[veloz.id] ?? veloz.rol} ·{" "}
              {F.kmh(kmhEn(veloz.trayectoria, 0), "reconstruccion")} →{" "}
              {F.kmhConUnidad(kmhAntesDe(veloz.trayectoria, ti), "reconstruccion")}
            </span>
          ) : null}
          <span>
            {METODO.reconstruccion}: la simulación con las velocidades ajustadas; puede diferir de
            la mediana de las simulaciones con incertidumbre.
          </span>
          <span className="text-texto-3">
            Más naranja, más rápido · siluetas cada 0.4 s · reposo punteado.
          </span>
          {declarada ? (
            <span className="text-texto-3" data-testid="maqueta-leyenda-declarada">
              En azul punteado, {declarada.etiqueta}: por dónde va cada vehículo en esa versión,
              simulada con la misma física.
            </span>
          ) : null}
        </div>
      </LeyendaEnMarco>
      {conCalles ? null : (
        // Sin las calles del mapa no se dibuja una vía inventada: solo lo que calculó el solver.
        <p
          className="vidrio t-nota absolute top-20 left-4 rounded-control px-3 py-1.5"
          data-testid="maqueta-sin-calles"
        >
          Sin las calles del mapa: la maqueta muestra las trayectorias, el impacto y los reposos.
        </p>
      )}
    </div>
  );
}

/**
 * La barra de reproducción sobre el mapa real (el 2D con «Mapa» encendido; A6): el mismo reloj, y los
 * vehículos se mueven en el mapa por un canal, sin volver a dibujar la página.
 */
export function RelojDelMapa({
  r,
  tInicial = null,
  onInstante,
  canal,
}: {
  r: Reconstruccion;
  tInicial?: number | null;
  onInstante?: (t: number) => void;
  canal: Canal<ReturnType<typeof posicionesEnTiempo>>;
}) {
  // Al salir del mapa, sus vehículos en movimiento se quitan.
  useEffect(() => () => canal.avisar([]), [canal]);
  return (
    <ConLineaDeTiempo
      resultado={r.resultado as unknown as ResultadoMaqueta}
      tInicial={tInicial}
      onInstante={onInstante}
    >
      {(t) => <AvisaPosiciones r={r} t={t} canal={canal} />}
    </ConLineaDeTiempo>
  );
}

function AvisaPosiciones({
  r,
  t,
  canal,
}: {
  r: Reconstruccion;
  t: number;
  canal: Canal<ReturnType<typeof posicionesEnTiempo>>;
}) {
  useEffect(() => {
    canal.avisar(posicionesEnTiempo(r, r.resultado as never, t));
  }, [r, t, canal]);
  return null;
}

/**
 * El reloj del 2D con la barra de reproducción compartida con el 3D (ronda 2, A6): de la llegada al
 * reposo final, con el impacto marcado. Nada se mueve solo: corre al pulsar reproducir.
 */
function ConLineaDeTiempo({
  resultado,
  children,
  tInicial = null,
  onInstante,
}: {
  resultado: ResultadoMaqueta;
  tInicial?: number | null;
  onInstante?: (t: number) => void;
  /** `pedido`: lo que pide la barra a la vista («Ver todo», «Ir al impacto»). */
  children: (t: number, pedido: PedidoVista | null) => ReactNode;
}) {
  const ti = tImpacto(resultado);
  const { t_inicio: ini, t_fin: fin } = resultado;
  const [t, setT] = useState(() =>
    tInicial !== null ? Math.min(fin, Math.max(ini, tInicial)) : ti,
  );
  useEffect(() => {
    onInstante?.(t);
  }, [onInstante, t]);
  const [corre, setCorre] = useState(false);
  const [velocidad, setVelocidad] = useState<Velocidad>(1);
  const [pedido, setPedido] = useState<PedidoVista | null>(null);
  const ultimo = useRef(0);
  const actual = useRef(ti);
  useEffect(() => {
    actual.current = t;
  }, [t]);
  useEffect(() => {
    if (!corre) return;
    let id = 0;
    ultimo.current = performance.now();
    const paso = (ahora: number) => {
      const dt = ((ahora - ultimo.current) / 1000) * velocidad;
      ultimo.current = ahora;
      const n = Math.min(actual.current + dt, fin);
      actual.current = n;
      setT(n);
      if (n >= fin) setCorre(false);
      else id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [corre, velocidad, fin]);
  const pedir = (tipo: PedidoVista["tipo"]) => setPedido((x) => ({ tipo, n: (x?.n ?? 0) + 1 }));
  // Las mismas acciones que el 3D; aquí el tiempo de la barra también va respecto al impacto.
  const alControl = (a: Accion) => {
    if (a.tipo === "alternar") {
      if (!corre && t >= fin) setT(ini);
      setCorre(!corre);
    } else if (a.tipo === "ir") {
      setCorre(false);
      setT(Math.min(fin, Math.max(ini, a.t + ti)));
    } else if (a.tipo === "velocidad") setVelocidad(a.x);
    else if (a.tipo === "impacto") {
      setCorre(false);
      setT(ti);
      pedir("impacto");
    } else if (a.tipo === "todo") pedir("todo");
    else if (a.tipo === "repetir") {
      setT(ini);
      setCorre(true);
    }
  };
  return (
    <>
      {children(t, pedido)}
      <BarraReproduccion
        de="maqueta"
        estado={{ t: t - ti, pausado: !corre, velocidad }}
        intervalo={{ inicio: ini - ti, fin: fin - ti }}
        corre={corre}
        onAccion={alControl}
      />
    </>
  );
}

/** La nota de la maqueta: debajo de la barra de reproducción si hay marco; si no, sobre el dibujo. */
function LeyendaEnMarco({ children }: { children: React.ReactNode }) {
  const { enMarco } = useMarco();
  return enMarco ? <EnRanura ranura="pie">{children}</EnRanura> : <>{children}</>;
}
