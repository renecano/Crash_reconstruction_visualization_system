"use client";

import {
  FIXTURE_NAMES,
  fixtureTitle,
  loadFixture,
  loadResultado,
  type FixtureName,
  type Resultado,
} from "@croquis/scene-schema";
import {
  createClock,
  createTimeline,
  environmentFor,
  eventMarkers,
  nextQualityLevel,
  seek,
  setSpeed,
  step,
  togglePlay,
  type CameraMode,
  type QualityLevel,
  type TimelineState,
  type ViewerClock,
} from "@croquis/viewer";
import type { RendererInfo, RendererPreference } from "@croquis/viewer/react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Legend } from "../legend";
import { ResultPanel } from "./result-panel";
import { TimelineBar } from "./timeline-bar";

const SceneViewer = dynamic(() => import("@croquis/viewer/react").then((m) => m.SceneViewer), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm">Cargando visor 3D…</div>,
});

type CalidadOpcion = QualityLevel | "auto";

interface VisorParams {
  escena: FixtureName;
  camara: string;
  calidad: CalidadOpcion;
  renderer: RendererPreference;
  t: number | undefined;
  auto: boolean;
}

function parseParams(sp: URLSearchParams): VisorParams {
  const escena = sp.get("escena");
  const calidad = sp.get("calidad");
  const renderer = sp.get("renderer");
  const t = sp.get("t");
  return {
    escena: FIXTURE_NAMES.includes(escena as FixtureName)
      ? (escena as FixtureName)
      : "lateral_interseccion",
    camara: sp.get("camara") ?? "libre",
    calidad: calidad === "baja" || calidad === "media" || calidad === "alta" ? calidad : "auto",
    renderer: renderer === "webgl" || renderer === "webgpu" ? renderer : "auto",
    t: t !== null && Number.isFinite(Number(t)) ? Number(t) : undefined,
    auto: sp.get("auto") === "1",
  };
}

const CAMARAS: { value: CameraMode; label: string }[] = [
  { value: "libre", label: "Libre (arrastra para girar)" },
  { value: "cenital", label: "Cenital" },
  { value: "cinematica", label: "Cinematográfica" },
];

const noopSubscribe = () => () => undefined;
const nullSnapshot = () => null;

/** Estado del reloj como almacén externo (avisos limitados por el propio reloj). */
function useClockState(clock: ViewerClock | null): TimelineState | null {
  return useSyncExternalStore(
    clock ? clock.subscribe : noopSubscribe,
    clock ? clock.get : nullSnapshot,
    nullSnapshot,
  );
}

export function VisorApp() {
  const sp = useSearchParams();
  const router = useRouter();
  const params = useMemo(() => parseParams(new URLSearchParams(sp.toString())), [sp]);
  const spec = useMemo(() => loadFixture(params.escena), [params.escena]);
  const [resultado, setResultado] = useState<{ name: FixtureName; r: Resultado } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<RendererInfo | null>(null);
  const [autoCalidad, setAutoCalidad] = useState<QualityLevel>("media");
  const calidad: QualityLevel = params.calidad === "auto" ? autoCalidad : params.calidad;

  useEffect(() => {
    let alive = true;
    loadResultado(params.escena)
      .then((r) => {
        if (alive) setResultado({ name: params.escena, r });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [params.escena]);

  const r = resultado?.name === params.escena ? resultado.r : null;
  const clock = useMemo(() => {
    if (!r) return null;
    return createClock(
      createTimeline(r.t_inicio, r.t_fin, r.dt, {
        t: params.t ?? r.t_inicio,
        playing: params.auto,
      }),
    );
  }, [r, params.t, params.auto]);
  const state = useClockState(clock);

  // Calidad automática con histéresis según los fps medidos (PLAN §7.8).
  useEffect(() => {
    if (params.calidad !== "auto") return undefined;
    const id = window.setInterval(() => {
      const perf = window.__croquisPerf;
      if (!perf || perf.frameMs.length < 90) return;
      const recent = perf.frameMs.slice(-90);
      const fps = 1000 / (recent.reduce((a, b) => a + b, 0) / recent.length);
      setAutoCalidad((q) => nextQualityLevel(q, fps));
    }, 3000);
    return () => window.clearInterval(id);
  }, [params.calidad]);

  const env = useMemo(
    () =>
      environmentFor({
        fechaHora: spec.entorno.fecha_hora?.valor,
        iluminacion: spec.entorno.iluminacion?.valor,
        clima: spec.entorno.clima?.valor,
        alumbrado: spec.entorno.alumbrado_publico?.valor,
        lat: spec.lugar.ubicacion_real?.lat,
        lon: spec.lugar.ubicacion_real?.lon,
      }),
    [spec],
  );

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    if (key === "escena") next.delete("t");
    router.replace(`/visor?${next.toString()}`, { scroll: false });
  };

  const [mode, driverId] = params.camara.startsWith("conductor-")
    ? (["conductor", params.camara.slice("conductor-".length)] as const)
    : ([params.camara as CameraMode, undefined] as const);
  const cameraMode: CameraMode = ["libre", "cenital", "conductor", "cinematica"].includes(mode)
    ? mode
    : "libre";

  const markers = useMemo(() => {
    if (!r) return [];
    const rol = new Map([
      ...r.vehiculos.map((v) => [v.id, v.rol] as const),
      ...r.personas.map((p) => [p.id, "peatón"] as const),
    ]);
    return eventMarkers(r.eventos, r.t_inicio, r.t_fin, (id) => rol.get(id));
  }, [r]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col gap-1">
          Escena
          <select
            value={params.escena}
            onChange={(e) => setParam("escena", e.target.value)}
            className="rounded border border-neutral-400 bg-transparent px-2 py-1"
            aria-label="Escena"
          >
            {FIXTURE_NAMES.map((n) => (
              <option key={n} value={n}>
                {fixtureTitle(n)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Cámara
          <select
            value={params.camara}
            onChange={(e) => setParam("camara", e.target.value)}
            className="rounded border border-neutral-400 bg-transparent px-2 py-1"
            aria-label="Cámara"
          >
            {CAMARAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
            {spec.vehiculos.map((v) => (
              <option key={v.id} value={`conductor-${v.id}`}>
                Vista del conductor {v.rol}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Calidad
          <select
            value={params.calidad}
            onChange={(e) => setParam("calidad", e.target.value === "auto" ? null : e.target.value)}
            className="rounded border border-neutral-400 bg-transparent px-2 py-1"
            aria-label="Calidad"
          >
            <option value="auto">Automática ({calidad})</option>
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Render
          <select
            value={params.renderer}
            onChange={(e) =>
              setParam("renderer", e.target.value === "auto" ? null : e.target.value)
            }
            className="rounded border border-neutral-400 bg-transparent px-2 py-1"
            aria-label="Render"
          >
            <option value="auto">Automático (WebGPU si está disponible)</option>
            <option value="webgl">Forzar WebGL 2</option>
          </select>
        </label>
        {info ? (
          <span
            className="pb-1 font-mono text-xs text-neutral-600 dark:text-neutral-400"
            data-testid="backend"
          >
            {info.backend === "webgpu" ? "WebGPU" : "WebGL 2"}
          </span>
        ) : null}
      </div>

      <div className="relative h-[60vh] min-h-[360px] w-full overflow-hidden rounded-lg border border-neutral-300 bg-neutral-900 dark:border-neutral-700">
        {error ? (
          <p role="alert" className="grid h-full place-items-center p-6 text-center text-white">
            {error}
          </p>
        ) : r && clock ? (
          <SceneViewer
            spec={spec}
            resultado={r}
            clock={clock}
            camera={cameraMode}
            driverVehicleId={driverId}
            quality={calidad}
            renderer={params.renderer}
            onRendererInfo={setInfo}
            onError={() =>
              setError(
                "Este navegador no pudo iniciar WebGPU ni WebGL 2; el visor 3D no está disponible.",
              )
            }
            className="h-full w-full"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-white">
            Cargando reconstrucción…
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-3 py-1.5 text-white">
          <Legend seed={spec.meta.semilla} inputHash={spec.meta.hash_relato} tone="clara" />
        </div>
      </div>

      {state && clock ? (
        <TimelineBar
          state={state}
          markers={markers}
          onTogglePlay={() => clock.set(togglePlay)}
          onSeek={(t) => clock.set((s) => seek(s, t))}
          onStep={(n) => clock.set((s) => step(s, n))}
          onSpeed={(v) => clock.set((s) => setSpeed(s, v))}
        />
      ) : null}

      {r ? <ResultPanel resultado={r} supuestosEntorno={env.supuestos} /> : null}
    </div>
  );
}
