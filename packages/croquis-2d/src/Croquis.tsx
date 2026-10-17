"use client";
/**
 * Editor 2D del croquis: vista cenital en SVG, sincronizada con la EscenaSpec.
 * Arrastra vehículos, personas, objetos, dispositivos y puntos de evidencia; gira vehículos con el
 * asa frontal. Todo cambio pasa por `applyEdit` y vuelve como una escena nueva en `onChange`.
 */
import type { EscenaSpec, TablaClases } from "@croquis/scene-schema";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { applyEdit, type EditOp, type PoseKind } from "./edit";
import type { Vec2 } from "./geometry";
import { sceneLayout, type LaneStrip } from "./layout";
import { clientToWorld, makeViewport, worldToSvg, type Viewport } from "./viewport";

export const CROQUIS_LEGEND =
  "Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje.";

export interface CroquisProps {
  spec: EscenaSpec;
  onChange?: (next: EscenaSpec) => void;
  clases?: TablaClases;
  readOnly?: boolean;
  /** Mostrar posiciones finales (fantasmas) además de las iniciales. */
  showFinal?: boolean;
  selectedId?: string;
  onSelect?: (id: string | undefined) => void;
  /** Píxeles por metro del SVG interno. */
  scale?: number;
  className?: string;
}

type DragTarget =
  | { kind: "vehicle"; id: string; pose: PoseKind; offset: Vec2 }
  | { kind: "rotate"; id: string; pose: PoseKind; center: Vec2 }
  | { kind: "person"; id: string; pose: PoseKind; offset: Vec2 }
  | { kind: "object"; id: string; offset: Vec2 }
  | { kind: "device"; id: string; offset: Vec2 }
  | { kind: "evidence"; id: string; index: number }
  | { kind: "event"; id: string };

const ROAD_FILL = "#5b5f66";
const LINE_STROKE = "#f4f1e6";
const MEDIAN_FILL = "#7a9a6a";

export function Croquis({
  spec,
  onChange,
  clases,
  readOnly = false,
  showFinal = true,
  selectedId,
  onSelect,
  scale = 10,
  className,
}: CroquisProps) {
  const layout = useMemo(() => sceneLayout(spec, clases), [spec, clases]);
  const vp = useMemo(() => makeViewport(layout.bounds, scale), [layout.bounds, scale]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragTarget | null>(null);
  const [preview, setPreview] = useState<EscenaSpec | null>(null);
  const shown = preview ?? spec;
  const shownLayout = useMemo(
    () => (preview ? sceneLayout(preview, clases) : layout),
    [preview, clases, layout],
  );

  const pointerWorld = useCallback(
    (e: ReactPointerEvent): Vec2 => {
      const svg = svgRef.current;
      const rect = svg ? svg.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
      return clientToWorld(vp, rect, { x: e.clientX, y: e.clientY });
    },
    [vp],
  );

  const begin = (e: ReactPointerEvent, target: DragTarget) => {
    if (readOnly) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag(target);
    onSelect?.(target.id);
  };

  const opFor = (t: DragTarget, w: Vec2): EditOp => {
    switch (t.kind) {
      case "vehicle":
        return {
          kind: "move_vehicle",
          id: t.id,
          pose: t.pose,
          x: w.x - t.offset.x,
          y: w.y - t.offset.y,
        };
      case "rotate":
        return {
          kind: "rotate_vehicle",
          id: t.id,
          pose: t.pose,
          rumbo_deg: (Math.atan2(w.y - t.center.y, w.x - t.center.x) * 180) / Math.PI,
        };
      case "person":
        return {
          kind: "move_person",
          id: t.id,
          pose: t.pose,
          x: w.x - t.offset.x,
          y: w.y - t.offset.y,
        };
      case "object":
        return { kind: "move_object", id: t.id, x: w.x - t.offset.x, y: w.y - t.offset.y };
      case "device":
        return { kind: "move_device", id: t.id, x: w.x - t.offset.x, y: w.y - t.offset.y };
      case "evidence":
        return { kind: "move_evidence_point", id: t.id, index: t.index, x: w.x, y: w.y };
      case "event":
        return { kind: "move_event_point", id: t.id, x: w.x, y: w.y };
    }
  };

  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    setPreview(applyEdit(spec, opFor(drag, pointerWorld(e))));
  };

  const onUp = (e: ReactPointerEvent) => {
    if (!drag) return;
    const next = applyEdit(spec, opFor(drag, pointerWorld(e)));
    setDrag(null);
    setPreview(null);
    onChange?.(next);
  };

  const P = (p: Vec2) => worldToSvg(vp, p);
  const m = (v: number) => v * vp.scale;

  return (
    <svg
      ref={svgRef}
      data-testid="croquis"
      className={className}
      viewBox={`${vp.viewBox.x} ${vp.viewBox.y} ${vp.viewBox.width} ${vp.viewBox.height}`}
      width="100%"
      role="img"
      aria-label={`Croquis de la escena ${spec.meta.titulo ?? spec.meta.id}`}
      style={{ touchAction: "none", background: "#dfe7d8", userSelect: "none" }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerDown={() => onSelect?.(undefined)}
    >
      <Road layout={shownLayout} vp={vp} />
      {shownLayout.evidence.map((ev) => (
        <g key={ev.id} data-testid={`evidence-${ev.id}`}>
          <polyline
            points={ev.puntos.map((p) => `${P(p).x},${P(p).y}`).join(" ")}
            fill="none"
            stroke={ev.tipo.startsWith("marcas") ? "#1f1f1f" : "#b05a00"}
            strokeWidth={ev.tipo.startsWith("marcas") ? m(0.25) : m(0.1)}
            strokeDasharray={ev.tipo.startsWith("marcas") ? undefined : `${m(0.4)} ${m(0.4)}`}
            opacity={0.8}
          />
          {ev.puntos.map((p, i) => (
            <circle
              key={i}
              cx={P(p).x}
              cy={P(p).y}
              r={m(0.35)}
              fill="#b05a00"
              stroke="#fff"
              strokeWidth={m(0.08)}
              cursor={readOnly ? "default" : "move"}
              data-testid={`evidence-point-${ev.id}-${i}`}
              onPointerDown={(e) => begin(e, { kind: "evidence", id: ev.id, index: i })}
            />
          ))}
        </g>
      ))}
      {shownLayout.objects.map((o) => (
        <ObjectGlyphView
          key={o.id}
          o={o}
          vp={vp}
          readOnly={readOnly}
          selected={selectedId === o.id}
          onDown={(e) =>
            begin(e, { kind: "object", id: o.id, offset: sub(pointerWorld(e), o.posicion) })
          }
        />
      ))}
      {shownLayout.devices.map((d) => (
        <g
          key={d.id}
          data-testid={`device-${d.id}`}
          transform={`translate(${P(d.posicion).x} ${P(d.posicion).y}) rotate(${-d.orientacion})`}
          cursor={readOnly ? "default" : "move"}
          onPointerDown={(e) =>
            begin(e, { kind: "device", id: d.id, offset: sub(pointerWorld(e), d.posicion) })
          }
        >
          <DeviceIcon tipo={d.tipo} m={m} />
        </g>
      ))}
      {showFinal &&
        shownLayout.vehicles
          .filter((v) => v.final)
          .map((v) => (
            <VehicleShape
              key={`${v.id}-final`}
              id={v.id}
              pose="final"
              rol={v.rol}
              color={v.colorHex}
              largo={v.largo}
              ancho={v.ancho}
              x={v.final!.x}
              y={v.final!.y}
              heading={v.final!.rumbo_deg}
              vp={vp}
              ghost
              readOnly={readOnly}
              selected={false}
              onDown={(e) =>
                begin(e, {
                  kind: "vehicle",
                  id: v.id,
                  pose: "final",
                  offset: sub(pointerWorld(e), v.final!),
                })
              }
              onRotate={(e) =>
                begin(e, { kind: "rotate", id: v.id, pose: "final", center: v.final! })
              }
            />
          ))}
      {shownLayout.vehicles.map((v) => (
        <VehicleShape
          key={v.id}
          id={v.id}
          pose="inicial"
          rol={v.rol}
          color={v.colorHex}
          largo={v.largo}
          ancho={v.ancho}
          x={v.inicial.x}
          y={v.inicial.y}
          heading={v.inicial.rumbo_deg}
          vp={vp}
          readOnly={readOnly}
          selected={selectedId === v.id}
          onDown={(e) =>
            begin(e, {
              kind: "vehicle",
              id: v.id,
              pose: "inicial",
              offset: sub(pointerWorld(e), v.inicial),
            })
          }
          onRotate={(e) =>
            begin(e, { kind: "rotate", id: v.id, pose: "inicial", center: v.inicial })
          }
        />
      ))}
      {shownLayout.people.flatMap((p) =>
        (["inicial", "final"] as const)
          .filter((k) => p[k] && (k === "inicial" || showFinal))
          .map((k) => {
            const pose = p[k]!;
            const c = P(pose);
            return (
              <g
                key={`${p.id}-${k}`}
                data-testid={`person-${p.id}-${k}`}
                opacity={k === "final" ? 0.5 : 1}
                cursor={readOnly ? "default" : "move"}
                onPointerDown={(e) =>
                  begin(e, {
                    kind: "person",
                    id: p.id,
                    pose: k,
                    offset: sub(pointerWorld(e), pose),
                  })
                }
              >
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={m(0.45)}
                  fill="#f2c14e"
                  stroke="#1f1f1f"
                  strokeWidth={m(0.08)}
                />
                <circle cx={c.x} cy={c.y} r={m(0.18)} fill="#1f1f1f" />
              </g>
            );
          }),
      )}
      {shownLayout.events.map((ev) => {
        const c = P(ev.punto);
        return (
          <g
            key={ev.id}
            data-testid={`event-${ev.id}`}
            cursor={readOnly ? "default" : "move"}
            onPointerDown={(e) => begin(e, { kind: "event", id: ev.id })}
          >
            <line
              x1={c.x - m(0.7)}
              y1={c.y - m(0.7)}
              x2={c.x + m(0.7)}
              y2={c.y + m(0.7)}
              stroke="#c0392b"
              strokeWidth={m(0.18)}
            />
            <line
              x1={c.x - m(0.7)}
              y1={c.y + m(0.7)}
              x2={c.x + m(0.7)}
              y2={c.y - m(0.7)}
              stroke="#c0392b"
              strokeWidth={m(0.18)}
            />
          </g>
        );
      })}
      <NorthArrow vp={vp} />
      {shownLayout.mapa ? (
        <text
          data-testid="atribucion-osm"
          x={m(1)}
          y={vp.viewBox.height - m(2.3)}
          fontSize={m(0.9)}
          fill="#333"
          fontFamily="system-ui, sans-serif"
        >
          {shownLayout.mapa.atribucion}
        </text>
      ) : null}
      <text
        x={m(1)}
        y={vp.viewBox.height - m(0.8)}
        fontSize={m(1.1)}
        fill="#333"
        fontFamily="system-ui, sans-serif"
      >
        {CROQUIS_LEGEND} · semilla {shown.meta.semilla}
      </text>
    </svg>
  );
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function Road({ layout, vp }: { layout: ReturnType<typeof sceneLayout>; vp: Viewport }) {
  const m = (v: number) => v * vp.scale;
  const P = (p: Vec2) => worldToSvg(vp, p);
  if (layout.mapa) {
    // Calles del mapa (ADR 0023): cada una como trazo de su ancho, con uniones redondas.
    return (
      <g data-testid="road" data-fuente="mapa">
        {layout.mapa.vias.map((v, i) => (
          <polyline
            key={`${v.id}-${i}`}
            data-testid={`via-${v.id}`}
            points={v.puntos
              .map((p) => {
                const q = P(p);
                return `${q.x},${q.y}`;
              })
              .join(" ")}
            fill="none"
            stroke={ROAD_FILL}
            strokeWidth={m(v.ancho)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
    );
  }
  return (
    <g data-testid="road">
      {layout.road.arcs.map((a, i) => {
        const c = P(a.center);
        const r = m(a.radius);
        const toXY = (deg: number) => ({
          x: c.x + r * Math.cos((deg * Math.PI) / 180),
          y: c.y - r * Math.sin((deg * Math.PI) / 180),
        });
        const s = toXY(a.from);
        const e = toXY(a.to);
        return (
          <path
            key={i}
            d={`M ${s.x} ${s.y} A ${r} ${r} 0 0 0 ${e.x} ${e.y}`}
            fill="none"
            stroke={ROAD_FILL}
            strokeWidth={m(a.width)}
          />
        );
      })}
      {layout.road.rings.map((r, i) => {
        const c = P(r.center);
        return (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={m(r.outerRadius)} fill={ROAD_FILL} />
            <circle cx={c.x} cy={c.y} r={m(Math.max(0.1, r.innerRadius))} fill={MEDIAN_FILL} />
          </g>
        );
      })}
      {layout.road.strips.map((s, i) => (
        <Strip key={i} s={s} vp={vp} />
      ))}
    </g>
  );
}

function Strip({ s, vp }: { s: LaneStrip; vp: Viewport }) {
  const m = (v: number) => v * vp.scale;
  const c = worldToSvg(vp, s.center);
  const w = m(s.width);
  const l = m(s.length);
  const laneW = (s.width - s.median) / Math.max(1, s.lanes);
  const lines: number[] = [];
  for (let i = 1; i < s.lanes; i++) {
    let off = -s.width / 2 + i * laneW;
    if (s.median > 0 && i >= s.lanes / 2) off += s.median;
    lines.push(off);
  }
  return (
    <g transform={`translate(${c.x} ${c.y}) rotate(${-s.heading})`}>
      <rect x={-l / 2} y={-w / 2} width={l} height={w} fill={ROAD_FILL} />
      {s.median > 0 && (
        <rect x={-l / 2} y={-m(s.median) / 2} width={l} height={m(s.median)} fill={MEDIAN_FILL} />
      )}
      {lines.map((off, i) => (
        <line
          key={i}
          x1={-l / 2}
          y1={m(off)}
          x2={l / 2}
          y2={m(off)}
          stroke={LINE_STROKE}
          strokeWidth={m(0.12)}
          strokeDasharray={`${m(3)} ${m(3)}`}
          opacity={0.8}
        />
      ))}
    </g>
  );
}

interface VehicleShapeProps {
  id: string;
  pose: PoseKind;
  rol: string;
  color: string;
  largo: number;
  ancho: number;
  x: number;
  y: number;
  heading: number;
  vp: Viewport;
  ghost?: boolean;
  readOnly: boolean;
  selected: boolean;
  onDown: (e: ReactPointerEvent) => void;
  onRotate: (e: ReactPointerEvent) => void;
}

function VehicleShape({
  id,
  pose,
  rol,
  color,
  largo,
  ancho,
  x,
  y,
  heading,
  vp,
  ghost,
  readOnly,
  selected,
  onDown,
  onRotate,
}: VehicleShapeProps) {
  const m = (v: number) => v * vp.scale;
  const c = worldToSvg(vp, { x, y });
  const L = m(largo);
  const W = m(ancho);
  return (
    <g
      data-testid={`vehicle-${id}-${pose}`}
      transform={`translate(${c.x} ${c.y}) rotate(${-heading})`}
      opacity={ghost ? 0.45 : 1}
    >
      <rect
        x={-L / 2}
        y={-W / 2}
        width={L}
        height={W}
        rx={m(0.25)}
        fill={color}
        stroke={selected ? "#ff8800" : "#111"}
        strokeWidth={m(selected ? 0.2 : 0.1)}
        cursor={readOnly ? "default" : "move"}
        onPointerDown={onDown}
      />
      <rect
        x={L / 2 - m(Math.min(1.1, largo * 0.25))}
        y={-W / 2 + m(0.15)}
        width={m(Math.min(0.5, largo * 0.1))}
        height={W - m(0.3)}
        fill="#111"
        opacity={0.6}
        pointerEvents="none"
      />
      <text
        x={0}
        y={m(0.35)}
        textAnchor="middle"
        fontSize={m(1)}
        fontWeight={700}
        fill={isDark(color) ? "#fff" : "#111"}
        fontFamily="system-ui, sans-serif"
        pointerEvents="none"
      >
        {rol}
      </text>
      {!readOnly && !ghost && (
        <circle
          data-testid={`vehicle-${id}-${pose}-rotate`}
          cx={L / 2 + m(0.9)}
          cy={0}
          r={m(0.4)}
          fill="#ff8800"
          stroke="#fff"
          strokeWidth={m(0.08)}
          cursor="grab"
          onPointerDown={onRotate}
        />
      )}
    </g>
  );
}

function ObjectGlyphView({
  o,
  vp,
  readOnly,
  selected,
  onDown,
}: {
  o: ReturnType<typeof sceneLayout>["objects"][number];
  vp: Viewport;
  readOnly: boolean;
  selected: boolean;
  onDown: (e: ReactPointerEvent) => void;
}) {
  const m = (v: number) => v * vp.scale;
  const c = worldToSvg(vp, o.posicion);
  const stroke = selected ? "#ff8800" : "#2b2b2b";
  const cursor = readOnly ? "default" : "move";
  if (o.tipo === "arbol") {
    return (
      <g data-testid={`object-${o.id}`} cursor={cursor} onPointerDown={onDown}>
        <circle
          cx={c.x}
          cy={c.y}
          r={m(2.2)}
          fill="#5f9a4b"
          opacity={0.75}
          stroke={stroke}
          strokeWidth={m(0.08)}
        />
        <circle cx={c.x} cy={c.y} r={m(Math.max(0.15, (o.diametro ?? 0.3) / 2))} fill="#5a3a1a" />
      </g>
    );
  }
  if (o.tipo === "poste" || o.tipo === "senal") {
    return (
      <g data-testid={`object-${o.id}`} cursor={cursor} onPointerDown={onDown}>
        <circle
          cx={c.x}
          cy={c.y}
          r={m(Math.max(0.2, (o.diametro ?? 0.3) / 2) + 0.1)}
          fill="#9aa0a6"
          stroke={stroke}
          strokeWidth={m(0.1)}
        />
      </g>
    );
  }
  const L = m(o.largo);
  const W = m(o.ancho);
  const fill =
    o.tipo === "vehiculo_estacionado"
      ? "#a9b4c2"
      : o.tipo === "muro" || o.tipo === "barda"
        ? "#8c7b6b"
        : "#b8a98a";
  return (
    <g
      data-testid={`object-${o.id}`}
      transform={`translate(${c.x} ${c.y}) rotate(${-o.rumbo})`}
      cursor={cursor}
      onPointerDown={onDown}
    >
      <rect
        x={-L / 2}
        y={-W / 2}
        width={L}
        height={W}
        fill={fill}
        stroke={stroke}
        strokeWidth={m(0.1)}
      />
    </g>
  );
}

function DeviceIcon({ tipo, m }: { tipo: string; m: (v: number) => number }) {
  switch (tipo) {
    case "semaforo":
      return (
        <g>
          <rect x={-m(0.35)} y={-m(0.9)} width={m(0.7)} height={m(1.8)} rx={m(0.1)} fill="#222" />
          <circle cx={0} cy={-m(0.55)} r={m(0.2)} fill="#e53935" />
          <circle cx={0} cy={0} r={m(0.2)} fill="#fdd835" />
          <circle cx={0} cy={m(0.55)} r={m(0.2)} fill="#43a047" />
        </g>
      );
    case "alto":
      return (
        <polygon points={octagon(m(0.7))} fill="#c62828" stroke="#fff" strokeWidth={m(0.08)} />
      );
    case "ceda_el_paso":
      return (
        <polygon
          points={`0,${m(0.8)} ${-m(0.75)},${-m(0.5)} ${m(0.75)},${-m(0.5)}`}
          fill="#fff"
          stroke="#c62828"
          strokeWidth={m(0.15)}
        />
      );
    case "paso_peatonal":
      return (
        <g>
          {[-2, -1, 0, 1, 2].map((i) => (
            <rect
              key={i}
              x={m(i * 0.8) - m(0.25)}
              y={-m(2)}
              width={m(0.5)}
              height={m(4)}
              fill="#f4f1e6"
              opacity={0.9}
            />
          ))}
        </g>
      );
    case "tope":
      return <rect x={-m(0.3)} y={-m(3)} width={m(0.6)} height={m(6)} fill="#f2c14e" />;
    default:
      return (
        <rect
          x={-m(0.4)}
          y={-m(0.4)}
          width={m(0.8)}
          height={m(0.8)}
          fill="#3949ab"
          stroke="#fff"
          strokeWidth={m(0.08)}
        />
      );
  }
}

function octagon(r: number): string {
  return Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI / 8) * (2 * i + 1);
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

function NorthArrow({ vp }: { vp: Viewport }) {
  const m = (v: number) => v * vp.scale;
  const x = vp.viewBox.width - m(3);
  const y = m(3);
  return (
    <g data-testid="north" fontFamily="system-ui, sans-serif">
      <line x1={x} y1={y + m(1.5)} x2={x} y2={y - m(1.5)} stroke="#333" strokeWidth={m(0.15)} />
      <polygon
        points={`${x},${y - m(2)} ${x - m(0.5)},${y - m(1)} ${x + m(0.5)},${y - m(1)}`}
        fill="#333"
      />
      <text x={x} y={y + m(2.8)} textAnchor="middle" fontSize={m(1)} fill="#333">
        N
      </text>
    </g>
  );
}

function isDark(hex: string): boolean {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return false;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}
