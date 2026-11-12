"use client";
/**
 * La maqueta del caso (rediseño «Laboratorio», prompt §7): la escena vista desde arriba que genera
 * el caso, sin videos ni coches decorativos.
 *
 * - **La vía:** las calles del mapa real a su ancho (o la plantilla de la escena), con orillas,
 *   camellón y carriles.
 * - **Los vehículos:** con las medidas de su ficha, como piezas de maqueta con sombra, en el
 *   instante del impacto, con su zona de contacto teñida.
 * - **La estela:** sus poses reales cada 0.4 s antes del impacto, más visibles al acercarse.
 * - **La trayectoria:** con un degradado por su velocidad real.
 * - **Las posiciones finales:** punteadas.
 * - **Etiquetas** con líneas guía.
 *
 * Coordenadas: las del solver en metros. El SVG usa metros como unidad, con Y hacia abajo.
 */
import { curvasDeNivel, intervaloDeCurvas, type MallaRelieve } from "@croquis/cesvi";
import type { EscenaSpec } from "@croquis/scene-schema";
import { sceneLayout } from "@croquis/croquis-2d";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acercar,
  conProporcion,
  desplazar,
  encajar,
  escalaGrafica,
  irAlImpacto,
  verTodo,
  type Caja,
  type EscenaPlano,
  type Margenes,
  SIN_MARGENES,
} from "@/lib/vista-maqueta";
import { COLOR_CURVA, COLOR_ONDULACION, COLOR_SUPERFICIE, COLOR_TOPE } from "@/lib/terreno-colores";
import { siluetaClase } from "@/lib/colocar";
import { m, useReducedMotion } from "motion/react";
import { Anillo } from "../movimiento";
import {
  cotaDeVia,
  encuadre,
  estela,
  poseEn,
  type Pose,
  type ResultadoMaqueta,
  tImpacto,
  tramosPorVelocidad,
  versionDeclaradaEnMaqueta,
  type VehiculoResultado,
} from "@/lib/maqueta";

/** La zona de contacto en la caja de 1 × 1 de la silueta (frente arriba), del lado del daño. */
function zonaDeContacto(
  v: VehiculoResultado,
): { x: number; y: number; w: number; h: number } | null {
  const lado = v.dano?.cdc?.lado;
  if (!v.dano || !lado) return null;
  const { largo_m: L, ancho_m: A } = v.dimensiones;
  if (lado === "F" || lado === "B") {
    const w = Math.min(1, v.dano.ancho_m / A);
    const cx = Math.max(-0.5 + w / 2, Math.min(0.5 - w / 2, -v.dano.centro_m / A));
    return { x: cx - w / 2, y: lado === "F" ? -0.5 : 0.32, w, h: 0.18 };
  }
  const h = Math.min(1, v.dano.ancho_m / L);
  const cy = Math.max(-0.5 + h / 2, Math.min(0.5 - h / 2, -v.dano.centro_m / L));
  return { x: lado === "L" ? -0.5 : 0.3, y: cy - h / 2, w: 0.2, h };
}

type XY = { x: number; y: number };
/** `lugar.terreno` de la escena (C3), lo que la maqueta dibuja de él. */
interface TerrenoEscena {
  superficies?: {
    id: string;
    tipo: keyof typeof COLOR_SUPERFICIE;
    poligono: XY[];
    friccion: { valor: number };
  }[];
  ondulaciones?: {
    id: string;
    poligono: XY[];
    amplitud_m: number;
    longitud_onda_m: number;
    rumbo_deg: number;
  }[];
  topes?: { id: string; linea: XY[]; alto_m: number; largo_m: number }[];
}

export function EscenaMaqueta({
  spec,
  resultado,
  nombres = {},
  detalles = {},
  t = null,
  anchoVia = null,
  sinEtiquetas = false,
  tips = {},
  tipDelImpacto = null,
  relieve = null,
  navegable = false,
  margenes = SIN_MARGENES,
  declarada = null,
}: {
  /**
   * T6.2: la versión declarada de un conductor ya simulada (R7), para dibujarla sobre la
   * reconstrucción: el camino y la silueta de cada vehículo que en esa versión va por otro lado, en
   * trazo punteado y con su nombre. Es un complemento opcional; sin culpas.
   */
  declarada?: { etiqueta: string; resultado: ResultadoMaqueta } | null;
  /** W6: lo que tapan los paneles de encima, en pixeles: «Ver todo» encaja la escena en el resto. */
  margenes?: Margenes;
  /**
   * W6 (O3): abre con «Ver todo» y se acerca, aleja y desplaza con el ratón, la rueda o los dedos,
   * con «Ver todo», «Ir al impacto», la escala gráfica y el norte. Sin esto (Presentar, el
   * dictamen), el encuadre fijo alrededor del impacto.
   */
  navegable?: boolean;
  /** Lo que dice cada vehículo al pasar el puntero o con el foco (§9). */
  tips?: Record<string, string>;
  tipDelImpacto?: string | null;
  /** O4 (W5): la malla de relieve de la escena; con ella se dibujan las curvas de nivel. */
  relieve?: MallaRelieve | null;
  /** Sin etiquetas ni cota, para un croquis chico. */
  sinEtiquetas?: boolean;
  /** El ancho de la vía si el caso lo trae medido, con su origen. */
  anchoVia?: { m: number; de: string } | null;
  spec: EscenaSpec;
  resultado: ResultadoMaqueta;
  /** El nombre de cada vehículo para su etiqueta («A · Silverado 2500»), por id del resultado. */
  nombres?: Record<string, string>;
  /** La segunda línea de su etiqueta («daño posterior, hacia la izquierda»). */
  detalles?: Record<string, string>;
  /** El instante que se dibuja (la línea de tiempo); null: el impacto. */
  t?: number | null;
}) {
  const layout = useMemo(() => sceneLayout(spec), [spec]);
  // C3 y O4 (W5): las zonas de superficie, las ondulaciones, los topes y las curvas de nivel.
  const terreno = (spec.lugar as { terreno?: TerrenoEscena }).terreno ?? null;
  const curvas = useMemo(() => (relieve ? curvasDeNivel(relieve) : []), [relieve]);
  const ti = tImpacto(resultado);
  // El marco de las coordenadas del SVG: el encuadre alrededor del impacto (lo que se ve sin navegar).
  const [x0, y0, x1, y1] = encuadre(resultado);
  const W = x1 - x0;
  const H = y1 - y0;
  const px = (x: number) => x - x0;
  const py = (y: number) => y1 - y;
  // W6: lo que se ve, en metros de la escena, con la proporción del contenedor.
  const {
    svg: refSvg,
    caja: refCaja,
    todo,
    vista: vistaNav,
    anchoPx,
    arrastrando,
    manejadores,
    verTodo: alVerTodo,
    irAlImpacto: alIrAlImpacto,
    acercar: alAcercar,
  } = useVistaMaqueta(navegable, spec as unknown as EscenaPlano, resultado, margenes);
  const vista = navegable ? vistaNav : null;
  const vw = vista ? vista[2] - vista[0] : W;
  const vh = vista ? vista[3] - vista[1] : H;
  /** La silueta de un vehículo en una pose: unidad → metros, girada a su rumbo. */
  const colocar = (p: Pose, v: Pick<VehiculoResultado, "dimensiones">) =>
    `translate(${px(p.x)} ${py(p.y)}) rotate(${90 - (p.rumbo * 180) / Math.PI}) scale(${v.dimensiones.ancho_m} ${v.dimensiones.largo_m})`;
  const impacto = resultado.punto_impacto ?? null;
  // Al navegar, las letras guardan su tamaño en pantalla: van con lo que se ve, no con el marco.
  const fuente = vista ? Math.max(vw, vh) / 55 : Math.max(1, Math.min(3, Math.max(W, H) / 40));
  const ahora = t ?? ti;
  const quieto = useReducedMotion();
  // T6.2: la versión declarada, alineada por el impacto; solo los vehículos que van por otro lado.
  const declarados = useMemo(
    () => (declarada ? versionDeclaradaEnMaqueta(resultado, declarada.resultado, ahora) : []),
    [declarada, resultado, ahora],
  );
  const cota =
    layout.mapa && impacto ? cotaDeVia(layout.mapa.vias, impacto, 14, anchoVia?.m) : null;
  // Las etiquetas van en columna a un lado del impacto: los vehículos arriba y abajo, en el orden en
  // que se ven (sin que sus guías se crucen), y «Impacto» en medio.
  const refX = impacto?.x ?? poseEn(resultado.vehiculos[0]!.trayectoria, ti).x;
  const refY = impacto?.y ?? poseEn(resultado.vehiculos[0]!.trayectoria, ti).y;
  const xEtiquetas = px(refX) + fuente * 9;
  const enOrden = [...resultado.vehiculos].sort(
    (a, b) => py(poseEn(a.trayectoria, ti).y) - py(poseEn(b.trayectoria, ti).y),
  );
  const filaDe = (id: string) => {
    const j = enOrden.findIndex((v) => v.id === id) - Math.floor(enOrden.length / 2);
    return (j >= 0 ? j + 1 : j) * fuente * 3.4;
  };

  const svg = (
    <svg
      ref={refSvg}
      viewBox={vista ? `${px(vista[0])} ${py(vista[3])} ${vw} ${vh}` : `0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      overflow="visible"
      className="h-full w-full"
      style={vista ? { touchAction: "none", cursor: arrastrando ? "grabbing" : "grab" } : undefined}
      {...(vista ? manejadores : {})}
      data-vista={vista ? vista.map((x) => x.toFixed(1)).join(" ") : undefined}
      role="img"
      aria-label="Escena reconstruida vista desde arriba: la vía, la trayectoria de cada vehículo con su velocidad, sus posiciones cada 0.4 s antes del impacto, el impacto y las posiciones finales."
      data-testid="maqueta"
    >
      <defs>
        <radialGradient id="mq-luz" cx="0.3" cy="0.4" r="0.85">
          <stop offset="0" stopColor="var(--escena-luz)" />
          <stop offset="1" stopColor="var(--escena-sombra)" />
        </radialGradient>
        <filter id="mq-sombra" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx="0.5"
            dy="0.7"
            stdDeviation="0.5"
            floodColor="#000"
            floodOpacity="0.28"
          />
        </filter>
        <filter id="mq-losa" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="0.4" stdDeviation="0.7" floodColor="#000" floodOpacity="0.1" />
        </filter>
      </defs>
      {/* El fondo sigue más allá del encuadre: la escena va a sangre en cualquier proporción. */}
      {vista ? (
        <rect
          x={px(todo[0]) - (todo[2] - todo[0]) * 3}
          y={py(todo[3]) - (todo[3] - todo[1]) * 3}
          width={(todo[2] - todo[0]) * 7}
          height={(todo[3] - todo[1]) * 7}
          fill="url(#mq-luz)"
        />
      ) : (
        <rect x={-W * 3} y={-H * 3} width={W * 7} height={H * 7} fill="url(#mq-luz)" />
      )}

      {/* La vía: calles del mapa a su ancho; si no hay mapa, la plantilla de la escena. */}
      <g filter="url(#mq-losa)">
        {layout.mapa
          ? layout.mapa.vias.map((v) => {
              const puntos = v.puntos.map((p) => `${px(p.x)},${py(p.y)}`).join(" ");
              return (
                <g key={v.id}>
                  <polyline
                    points={puntos}
                    fill="none"
                    stroke="var(--escena-orilla)"
                    strokeWidth={v.ancho + 0.35}
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={puntos}
                    fill="none"
                    stroke="var(--escena-losa)"
                    strokeWidth={v.ancho}
                    strokeLinejoin="round"
                  />
                  {(v.carriles ?? 1) > 1 ? (
                    <polyline
                      points={puntos}
                      fill="none"
                      stroke="var(--escena-carril)"
                      strokeWidth={0.15}
                      strokeDasharray="3 3.5"
                    />
                  ) : null}
                </g>
              );
            })
          : null}
      </g>

      {/* W5: el terreno, sobre la vía y debajo de los vehículos. Medidas reales, en metros. */}
      {curvas.length ? (
        <g
          data-testid="maqueta-curvas"
          data-intervalo={intervaloDeCurvas(relieve!)}
          stroke={COLOR_CURVA}
          strokeWidth={0.12}
          opacity={0.55}
          fill="none"
        >
          {curvas.map((c) => (
            <path
              key={c.nivel}
              strokeWidth={c.nivel === 0 ? 0.22 : 0.12}
              d={c.tramos
                .map(([xa, ya, xb, yb]) => `M${px(xa)} ${py(ya)}L${px(xb)} ${py(yb)}`)
                .join("")}
            />
          ))}
        </g>
      ) : null}
      {terreno ? (
        <g data-testid="maqueta-terreno">
          {(terreno.superficies ?? []).map((z) => (
            <polygon
              key={z.id}
              data-testid={`maqueta-zona-${z.id}`}
              points={z.poligono.map((q) => `${px(q.x)},${py(q.y)}`).join(" ")}
              fill={COLOR_SUPERFICIE[z.tipo] ?? "#8A8F98"}
              fillOpacity={0.45}
              stroke={COLOR_SUPERFICIE[z.tipo] ?? "#8A8F98"}
              strokeWidth={0.15}
              strokeDasharray="0.9 0.6"
            >
              <title>{`Zona de ${z.tipo}: fricción ${z.friccion.valor.toFixed(2)}`}</title>
            </polygon>
          ))}
          {(terreno.ondulaciones ?? []).map((o) => {
            // Las crestas, atravesadas al rumbo, una por longitud de onda, recortadas a la zona.
            const r = (o.rumbo_deg * Math.PI) / 180;
            const u = [Math.cos(r), Math.sin(r)] as const;
            const s = o.poligono.map((q) => q.x * u[0] + q.y * u[1]);
            const n = o.poligono.map((q) => -q.x * u[1] + q.y * u[0]);
            const [n0, n1] = [Math.min(...n), Math.max(...n)];
            const crestas: number[] = [];
            const primera = Math.ceil((Math.min(...s) - o.longitud_onda_m / 4) / o.longitud_onda_m);
            for (let k = primera; ; k++) {
              const sk = o.longitud_onda_m * (k + 0.25);
              if (sk > Math.max(...s) || crestas.length > 400) break;
              crestas.push(sk);
            }
            const punto = (sk: number, nk: number) =>
              `${px(sk * u[0] - nk * u[1])} ${py(sk * u[1] + nk * u[0])}`;
            return (
              <g key={o.id} data-testid={`maqueta-ondulacion-${o.id}`}>
                <clipPath id={`mq-onda-${o.id}`}>
                  <polygon points={o.poligono.map((q) => `${px(q.x)},${py(q.y)}`).join(" ")} />
                </clipPath>
                <polygon
                  points={o.poligono.map((q) => `${px(q.x)},${py(q.y)}`).join(" ")}
                  fill={COLOR_ONDULACION}
                  fillOpacity={0.14}
                >
                  <title>{`Zona ondulada: ${o.amplitud_m.toFixed(2)} m de valle a cresta, crestas cada ${o.longitud_onda_m.toFixed(2)} m`}</title>
                </polygon>
                <path
                  clipPath={`url(#mq-onda-${o.id})`}
                  d={crestas.map((sk) => `M${punto(sk, n0)}L${punto(sk, n1)}`).join("")}
                  stroke={COLOR_ONDULACION}
                  strokeWidth={Math.min(0.5, o.longitud_onda_m / 4)}
                  opacity={0.55}
                />
              </g>
            );
          })}
          {(terreno.topes ?? []).map((tp) => (
            <line
              key={tp.id}
              data-testid={`maqueta-tope-${tp.id}`}
              x1={px(tp.linea[0]!.x)}
              y1={py(tp.linea[0]!.y)}
              x2={px(tp.linea[1]!.x)}
              y2={py(tp.linea[1]!.y)}
              stroke={COLOR_TOPE}
              strokeWidth={tp.largo_m}
            >
              <title>{`Tope: ${tp.alto_m.toFixed(2)} m de alto y ${tp.largo_m.toFixed(2)} m de largo`}</title>
            </line>
          ))}
        </g>
      ) : null}

      {/* La cota del ancho de la vía (la que se dibuja, del mapa). */}
      {cota && !sinEtiquetas ? (
        <g data-testid="maqueta-cota" stroke="var(--texto-2)" strokeWidth={0.1}>
          <line x1={px(cota.a.x)} y1={py(cota.a.y)} x2={px(cota.b.x)} y2={py(cota.b.y)} />
          <text
            x={Math.max(px(cota.a.x), px(cota.b.x)) + fuente * 0.3}
            y={(px(cota.a.x) > px(cota.b.x) ? py(cota.a.y) : py(cota.b.y)) + fuente * 0.15}
            fontSize={fuente * 0.5}
            fill="var(--texto-2)"
            stroke="none"
            fontFamily="var(--fuente-mono)"
          >
            <title>
              {anchoVia ? `Ancho de la vía ${anchoVia.de}` : "Ancho de la vía del mapa"}
            </title>
            {`${cota.ancho.toFixed(2)} m`}
          </text>
        </g>
      ) : null}

      {declarados.length ? (
        <g data-testid="maqueta-declarada" aria-label={declarada!.etiqueta}>
          {declarados.map((d) => (
            <g key={d.id} data-testid={`maqueta-declarada-${d.rol}`}>
              {d.camino.length > 1 ? (
                <polyline
                  points={d.camino.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")}
                  fill="none"
                  stroke="var(--velocidad-inicio)"
                  strokeWidth={0.3}
                  strokeDasharray="0.1 0.7"
                  strokeLinecap="round"
                />
              ) : null}
              {d.final ? (
                <path
                  d={siluetaClase(d.clase)}
                  transform={colocar(d.final, d)}
                  fill="none"
                  stroke="var(--velocidad-inicio)"
                  strokeWidth={1.2}
                  strokeDasharray="1 3"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.7}
                  data-testid={`maqueta-declarada-final-${d.rol}`}
                />
              ) : null}
              <path
                d={siluetaClase(d.clase)}
                transform={colocar(d.pose, d)}
                fill="var(--velocidad-inicio)"
                fillOpacity={0.12}
                stroke="var(--velocidad-inicio)"
                strokeWidth={1.6}
                strokeDasharray="5 3"
                vectorEffect="non-scaling-stroke"
                data-tip={`${nombres[d.id] ?? d.rol} · ${declarada!.etiqueta}`}
              />
              {sinEtiquetas ? null : (
                <text
                  x={px(d.pose.x)}
                  y={
                    py(d.pose.y) -
                    Math.max(d.dimensiones.largo_m, d.dimensiones.ancho_m) / 2 -
                    fuente * 0.4
                  }
                  fontSize={fuente * 0.8}
                  textAnchor="middle"
                  fill="var(--texto-2)"
                >
                  {declarada!.etiqueta}
                </text>
              )}
            </g>
          ))}
        </g>
      ) : null}

      {resultado.vehiculos.map((v) => {
        const tr = v.trayectoria;
        const pi = poseEn(tr, ti);
        const pa = poseEn(tr, ahora);
        const lx = xEtiquetas;
        const ly = py(refY) + filaDe(v.id);
        const fin = v.pose_final;
        const zona = zonaDeContacto(v);
        return (
          <g key={v.id} data-testid={`maqueta-${v.rol}`}>
            {/* La trayectoria hasta el impacto, con su velocidad real como degradado. */}
            {tramosPorVelocidad(tr, ti).map((s, k, todos) => (
              <m.line
                initial={quieto ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.12, delay: (k / todos.length) * 1.2 }}
                key={k}
                x1={px(s.x1)}
                y1={py(s.y1)}
                x2={px(s.x2)}
                y2={py(s.y2)}
                stroke={`color-mix(in srgb, var(--senal) ${Math.round(s.f * 100)}%, var(--velocidad-inicio))`}
                strokeWidth={0.35}
                strokeLinecap="round"
              />
            ))}
            {/* La estela: sus poses cada 0.4 s antes del impacto. */}
            {estela(tr, resultado.t_inicio, ti).map((e) => (
              <path
                key={e.t}
                d={siluetaClase(v.clase)}
                transform={colocar(e.pose, v)}
                fill="var(--escena-vehiculo)"
                fillOpacity={e.opacidad}
                stroke="var(--texto-3)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                opacity={e.opacidad}
                data-tip={`${nombres[v.id] ?? v.rol} · t ${(e.t - ti).toFixed(2)} s`}
              />
            ))}
            {/* La posición final, punteada, con la línea desde el impacto. */}
            {fin ? (
              <>
                <line
                  x1={px(pi.x)}
                  y1={py(pi.y)}
                  x2={px(fin.x)}
                  y2={py(fin.y)}
                  stroke="var(--texto-3)"
                  strokeWidth={0.18}
                  strokeDasharray="0.4 0.6"
                />
                <path
                  d={siluetaClase(v.clase)}
                  transform={colocar(
                    { x: fin.x, y: fin.y, rumbo: (fin.rumbo_deg * Math.PI) / 180 },
                    v,
                  )}
                  fill="none"
                  stroke="var(--texto-2)"
                  strokeWidth={1.4}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                  data-testid={`maqueta-final-${v.rol}`}
                />
              </>
            ) : null}
            {/* La pieza en el impacto, con sombra y su zona de contacto teñida. */}
            <g
              transform={colocar(pa, v)}
              filter="url(#mq-sombra)"
              data-tip={tips[v.id]}
              tabIndex={tips[v.id] ? 0 : undefined}
            >
              <path
                d={siluetaClase(v.clase)}
                fill="var(--escena-vehiculo)"
                stroke="var(--texto-3)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {zona ? (
                <rect
                  x={zona.x}
                  y={zona.y}
                  width={zona.w}
                  height={zona.h}
                  fill="var(--senal)"
                  fillOpacity={0.45}
                  data-testid={`maqueta-dano-${v.rol}`}
                />
              ) : null}
            </g>
            {/* La etiqueta con su línea guía. */}
            {sinEtiquetas ? null : (
              <>
                <polyline
                  points={`${px(pa.x)},${py(pa.y)} ${lx - fuente * 3},${ly} ${lx - fuente * 0.3},${ly}`}
                  fill="none"
                  stroke="var(--texto-3)"
                  strokeWidth={0.08}
                />
                <circle cx={px(pa.x)} cy={py(pa.y)} r={fuente * 0.14} fill="var(--texto)" />
                <text
                  x={lx}
                  y={ly + fuente * 0.2}
                  fontSize={fuente * 0.66}
                  fontWeight={600}
                  fill="var(--texto)"
                >
                  {nombres[v.id] ?? v.rol}
                </text>
                {detalles[v.id] ? (
                  <text
                    x={lx}
                    y={ly + fuente * 1.05}
                    fontSize={fuente * 0.55}
                    fill="var(--texto-2)"
                  >
                    {detalles[v.id]}
                  </text>
                ) : null}
              </>
            )}
          </g>
        );
      })}

      {impacto ? (
        <g
          data-testid="maqueta-impacto"
          data-tip={tipDelImpacto ?? undefined}
          tabIndex={tipDelImpacto ? 0 : undefined}
        >
          {sinEtiquetas ? null : <Anillo cx={px(impacto.x)} cy={py(impacto.y)} r={1.4} />}
          <circle
            cx={px(impacto.x)}
            cy={py(impacto.y)}
            r={1.4}
            fill="none"
            stroke="var(--senal)"
            strokeWidth={0.15}
          />
          <circle cx={px(impacto.x)} cy={py(impacto.y)} r={0.45} fill="var(--senal)" />
          {sinEtiquetas ? null : (
            <>
              <line
                x1={px(impacto.x)}
                y1={py(impacto.y)}
                x2={xEtiquetas - fuente * 0.3}
                y2={py(impacto.y)}
                stroke="var(--senal)"
                strokeWidth={0.08}
              />
              <text
                x={xEtiquetas}
                y={py(impacto.y) + fuente * 0.2}
                fontSize={fuente * 0.6}
                fontWeight={600}
                fill="var(--senal)"
              >
                Impacto
              </text>
            </>
          )}
        </g>
      ) : null}
    </svg>
  );
  if (!vista) return svg;
  return (
    <div ref={refCaja} className="relative h-full w-full" data-testid="maqueta-navegable">
      {svg}
      <ControlesVista
        vista={vista}
        anchoPx={anchoPx}
        onVerTodo={alVerTodo}
        onIrAlImpacto={alIrAlImpacto}
        onAcercar={alAcercar}
      />
    </div>
  );
}

/**
 * W6: la vista de la maqueta. Abre con «Ver todo», guarda la proporción del contenedor y vuelve a
 * «Ver todo» cuando llega otro resultado. La rueda acerca alrededor del puntero; un dedo o el ratón
 * desplazan; dos dedos acercan alrededor de su punto medio.
 */
function useVistaMaqueta(
  activa: boolean,
  spec: EscenaPlano,
  r: ResultadoMaqueta,
  margenes: Margenes,
) {
  const svg = useRef<SVGSVGElement | null>(null);
  const caja = useRef<HTMLDivElement | null>(null);
  const todo = useMemo(() => verTodo(spec, r), [spec, r]);
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null);
  const [propia, setPropia] = useState<{ de: ResultadoMaqueta; v: Caja } | null>(null);
  const aspecto = tam && tam.h > 0 ? tam.w / tam.h : 16 / 10;
  const encajada = (c: Caja) =>
    tam ? encajar(c, tam.w, tam.h, margenes) : conProporcion(c, aspecto);
  // Sin una vista propia para este resultado, «Ver todo», en lo que no tapan los paneles.
  const vista = propia?.de === r ? conProporcion(propia.v, aspecto) : encajada(todo);
  const fijar = useCallback((v: Caja) => setPropia({ de: r, v }), [r]);

  useEffect(() => {
    const el = caja.current;
    if (!activa || !el) return undefined;
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [activa]);

  /** Del punto en pantalla a metros de la escena. */
  const aEscena = useCallback(
    (cx: number, cy: number) => {
      const el = svg.current;
      const ctm = el?.getScreenCTM();
      if (!el || !ctm) return null;
      const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
      // El SVG tiene su origen en la esquina del encuadre del impacto, con Y hacia abajo.
      const [x0, , , y1] = encuadre(r);
      return { x: p.x + x0, y: y1 - p.y };
    },
    [r],
  );
  const metrosPorPx = () => {
    const a = svg.current?.getScreenCTM()?.a;
    return a ? 1 / a : 0;
  };

  // La rueda, con un escucha que no es pasivo: si no, la página se desplaza.
  const vistaRef = useRef(vista);
  useEffect(() => {
    vistaRef.current = vista;
  });
  useEffect(() => {
    const el = svg.current;
    if (!activa || !el) return undefined;
    const rueda = (ev: WheelEvent) => {
      ev.preventDefault();
      const ancla = aEscena(ev.clientX, ev.clientY);
      if (!ancla) return;
      fijar(acercar(vistaRef.current, Math.exp(-ev.deltaY * 0.0015), ancla, todo));
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, [activa, aEscena, fijar, todo]);

  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const [arrastrando, setArrastrando] = useState(false);
  const manejadores = {
    onPointerDown: (ev: React.PointerEvent<SVGSVGElement>) => {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      ev.currentTarget.setPointerCapture(ev.pointerId);
      punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      setArrastrando(true);
    },
    onPointerMove: (ev: React.PointerEvent<SVGSVGElement>) => {
      const antes = punteros.current.get(ev.pointerId);
      if (!antes) return;
      const otros = [...punteros.current.entries()].filter(([id]) => id !== ev.pointerId);
      const ahora = { x: ev.clientX, y: ev.clientY };
      if (otros.length === 1) {
        // Dos dedos: acercar por la razón de sus distancias, alrededor de su punto medio.
        const o = otros[0]![1];
        const d0 = Math.hypot(antes.x - o.x, antes.y - o.y);
        const d1 = Math.hypot(ahora.x - o.x, ahora.y - o.y);
        const ancla = aEscena((ahora.x + o.x) / 2, (ahora.y + o.y) / 2);
        if (ancla && d0 > 0) fijar(acercar(vistaRef.current, d1 / d0, ancla, todo));
      } else if (otros.length === 0) {
        const m = metrosPorPx();
        fijar(desplazar(vistaRef.current, -(ahora.x - antes.x) * m, (ahora.y - antes.y) * m, todo));
      }
      punteros.current.set(ev.pointerId, ahora);
    },
    onPointerUp: (ev: React.PointerEvent<SVGSVGElement>) => {
      punteros.current.delete(ev.pointerId);
      if (!punteros.current.size) setArrastrando(false);
    },
    onPointerCancel: (ev: React.PointerEvent<SVGSVGElement>) => {
      punteros.current.delete(ev.pointerId);
      if (!punteros.current.size) setArrastrando(false);
    },
  };

  const centro = { x: (vista[0] + vista[2]) / 2, y: (vista[1] + vista[3]) / 2 };
  return {
    svg,
    caja,
    todo,
    vista,
    anchoPx: tam?.w ?? 0,
    arrastrando,
    manejadores,
    verTodo: () => setPropia(null),
    irAlImpacto: () => fijar(encajada(irAlImpacto(r))),
    acercar: (factor: number) => fijar(acercar(vista, factor, centro, todo)),
  };
}

/** Los botones de la vista, el norte y la escala gráfica, arriba a la derecha de la maqueta. */
function ControlesVista({
  vista,
  anchoPx,
  onVerTodo,
  onIrAlImpacto,
  onAcercar,
}: {
  vista: Caja;
  anchoPx: number;
  onVerTodo: () => void;
  onIrAlImpacto: () => void;
  onAcercar: (factor: number) => void;
}) {
  const ancho = vista[2] - vista[0];
  const escala = escalaGrafica(ancho);
  const pxEscala = anchoPx > 0 ? (escala / ancho) * anchoPx : 0;
  const texto = escala >= 1 ? `${escala} m` : `${Math.round(escala * 100)} cm`;
  // En una maqueta angosta (el lado a lado de Contra CESVI), los botones van en columna y con
  // nombres cortos: en fila no caben.
  const angosta = anchoPx > 0 && anchoPx < 420;
  return (
    <div
      className={`pointer-events-none absolute z-10 flex flex-col items-end gap-2 ${angosta ? "top-2 right-2" : "top-3 right-3"}`}
      data-angosta={angosta ? "si" : "no"}
    >
      <div
        className={`pointer-events-auto flex gap-1 ${angosta ? "flex-col items-stretch" : ""}`}
        role="group"
        aria-label="Encuadre de la maqueta"
      >
        <button
          type="button"
          className="boton-secundario boton-compacto"
          onClick={onVerTodo}
          aria-label="Ver todo"
          data-testid="maqueta-ver-todo"
        >
          {angosta ? "Todo" : "Ver todo"}
        </button>
        <button
          type="button"
          className="boton-secundario boton-compacto"
          onClick={onIrAlImpacto}
          aria-label="Ir al impacto"
          data-testid="maqueta-ir-impacto"
        >
          {angosta ? "Impacto" : "Ir al impacto"}
        </button>
        <button
          type="button"
          className={`boton-secundario boton-compacto ${angosta ? "" : "w-9"}`}
          aria-label="Acercar"
          onClick={() => onAcercar(1.5)}
          data-testid="maqueta-acercar"
        >
          +
        </button>
        <button
          type="button"
          className={`boton-secundario boton-compacto ${angosta ? "" : "w-9"}`}
          aria-label="Alejar"
          onClick={() => onAcercar(1 / 1.5)}
          data-testid="maqueta-alejar"
        >
          −
        </button>
      </div>
      <div
        className={`vidrio flex items-end rounded-control ${angosta ? "gap-2 px-2 py-1.5" : "gap-3 px-3 py-2"}`}
        data-testid="maqueta-escala"
        data-metros={escala}
      >
        <svg
          viewBox="0 0 16 22"
          width="16"
          height="22"
          role="img"
          aria-label="El norte, hacia arriba"
        >
          <path d="M8 1 L14 15 L8 11 L2 15 Z" fill="var(--texto)" />
          <text
            x="8"
            y="21.5"
            textAnchor="middle"
            fontSize="7"
            fontWeight={700}
            fill="var(--texto)"
          >
            N
          </text>
        </svg>
        <div className="flex flex-col items-start gap-0.5">
          <span className="t-nota font-mono leading-none">{texto}</span>
          <span
            className="block h-1.5 border-x-2 border-b-2 border-[var(--texto)]"
            style={{ width: `${pxEscala.toFixed(1)}px` }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
