"use client";

import {
  FIXTURE_NAMES,
  fixtureTitle,
  loadFixture,
  loadResultado,
  type EscenaSpec,
  type FixtureName,
  legendFor,
  type Resultado,
} from "@croquis/scene-schema";
import {
  createClock,
  createTimeline,
  environmentFor,
  eventMarkers,
  isQualityLevel,
  nextQualityLevel,
  qualityForGpu,
  readGpuRenderer,
  type GpuTier,
  recentFps,
  recordTrial,
  startTrial,
  type Backend,
  type BackendTrial,
  seek,
  setSpeed,
  step,
  togglePlay,
  type CameraMode,
  type EventMarker,
  type QualityLevel,
  type TimelineState,
  type ViewerClock,
  type ViewerExportApi,
} from "@croquis/viewer";
import type { RendererInfo, RendererPreference } from "@croquis/viewer/react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { Legend } from "../legend";
import { describeAmbiente, parseAmbiente } from "./ambiente";
import type { PeopleAttachment } from "@croquis/viewer";
import { EvidencePanel } from "./evidence-panel";
import { HypothesisPanel, type Hipotesis } from "./hypothesis-panel";
import { PeoplePanel } from "./people-panel";
import { ResultPanel } from "./result-panel";
import { ExportPanel } from "./export-panel";
import { TimelineBar } from "./timeline-bar";
import { leerEscenaPropia } from "@/lib/escena-propia";
import { reconstruirCompletoEnNavegador } from "@/lib/reconstruct-client";

const SceneViewer = dynamic(() => import("@croquis/viewer/react").then((m) => m.SceneViewer), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm">Cargando visor 3D…</div>,
});

type CalidadOpcion = QualityLevel | "auto";
/** Una escena canónica o la escena propia de la persona usuaria (`escena=propia`). */
type EscenaVisor = FixtureName | "propia";

interface VisorParams {
  escena: EscenaVisor;
  camara: string;
  calidad: CalidadOpcion;
  renderer: RendererPreference;
  t: number | undefined;
  auto: boolean;
  /** Visor a pantalla completa (demos y medición de E6 a 1080p). */
  completa: boolean;
  bucle: boolean;
}

function parseParams(sp: URLSearchParams): VisorParams {
  const escena = sp.get("escena");
  const calidad = sp.get("calidad");
  const renderer = sp.get("renderer");
  const t = sp.get("t");
  return {
    escena:
      escena === "propia"
        ? "propia"
        : FIXTURE_NAMES.includes(escena as FixtureName)
          ? (escena as FixtureName)
          : "lateral_interseccion",
    camara: sp.get("camara") ?? "libre",
    calidad: isQualityLevel(calidad) ? calidad : "auto",
    renderer: renderer === "webgl" || renderer === "webgpu" ? renderer : "auto",
    t: t !== null && Number.isFinite(Number(t)) ? Number(t) : undefined,
    auto: sp.get("auto") === "1",
    completa: sp.get("pantalla") === "completa",
    bucle: sp.get("bucle") === "1",
  };
}

const BACKEND_KEY = "croquis.backend";

/** Preferencia de backend recordada en este navegador (puede no existir o no estar disponible). */
function readBackend(): Backend | null {
  try {
    const v = window.localStorage.getItem(BACKEND_KEY);
    return v === "webgpu" || v === "webgl" ? v : null;
  } catch {
    return null;
  }
}

function saveBackend(b: Backend): void {
  try {
    window.localStorage.setItem(BACKEND_KEY, b);
  } catch {
    /* almacenamiento no disponible: se vuelve a medir la próxima vez */
  }
}

const CAMARAS: { value: CameraMode; label: string }[] = [
  { value: "libre", label: "Libre (arrastra para girar)" },
  { value: "cenital", label: "Cenital" },
  { value: "cinematica", label: "Cinematográfica" },
  { value: "dano", label: "Acercamiento al daño" },
  { value: "persona", label: "Seguir a la persona" },
];

const noopSubscribe = () => () => undefined;
const nullSnapshot = () => null;
/** GPU leída una sola vez por página (la instantánea de `useSyncExternalStore` debe ser estable). */
let gpuTierCache: GpuTier | null = null;
const gpuTierSnapshot = (): GpuTier => (gpuTierCache ??= qualityForGpu(readGpuRenderer()));

/** Estado del reloj como almacén externo (avisos limitados por el propio reloj). */
function useClockState(clock: ViewerClock | null): TimelineState | null {
  return useSyncExternalStore(
    clock ? clock.subscribe : noopSubscribe,
    clock ? clock.get : nullSnapshot,
    nullSnapshot,
  );
}

/**
 * Barra de tiempo suscrita al reloj. La suscripción vive aquí y no en `VisorApp`: el reloj avisa
 * a la interfaz 15 veces por segundo durante la reproducción y, si `VisorApp` se suscribiera, cada
 * aviso volvería a dibujar los paneles de resultados, que no cambian con el tiempo (E6: tirones de
 * 50–70 ms en el hilo principal).
 */
function ClockedTimelineBar({
  clock,
  markers,
}: {
  clock: ViewerClock;
  markers: EventMarker[];
}): ReactElement | null {
  const state = useClockState(clock);
  if (!state) return null;
  return (
    <TimelineBar
      state={state}
      markers={markers}
      onTogglePlay={() => clock.set(togglePlay)}
      onSeek={(t) => clock.set((s) => seek(s, t))}
      onStep={(n) => clock.set((s) => step(s, n))}
      onSpeed={(v) => clock.set((s) => setSpeed(s, v))}
    />
  );
}

const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * Elige la escena: una canónica o la propia (guardada en esta pestaña desde el relato o el
 * croquis). Sin escena propia explica cómo crearla.
 */
export function VisorApp() {
  const sp = useSearchParams();
  const escena = useMemo(() => parseParams(new URLSearchParams(sp.toString())).escena, [sp]);
  const hidratado = useSyncExternalStore(noopSubscribe, hydratedSnapshot, serverSnapshot);
  const propia = useSyncExternalStore(noopSubscribe, leerEscenaPropia, nullSnapshot);
  const spec = useMemo(
    () => (escena === "propia" ? propia : loadFixture(escena)),
    [escena, propia],
  );
  if (!spec) {
    return (
      <div
        className="grid min-h-[360px] place-items-center rounded-lg border border-neutral-300 p-6 text-center text-sm dark:border-neutral-700"
        data-testid="sin-escena-propia"
      >
        {hidratado ? (
          <p>
            No hay una escena propia en esta pestaña. Escribe un relato en{" "}
            <a className="underline" href="/relato">
              /relato
            </a>{" "}
            o arma una en el{" "}
            <a className="underline" href="/croquis">
              croquis
            </a>{" "}
            y usa «Ver en 3D».
          </p>
        ) : (
          <p>Cargando escena…</p>
        )}
      </div>
    );
  }
  return <VisorEscena key={escena} spec={spec} hayPropia={propia !== null} />;
}

function VisorEscena({ spec, hayPropia }: { spec: EscenaSpec; hayPropia: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const params = useMemo(() => parseParams(new URLSearchParams(sp.toString())), [sp]);
  const searchKey = sp.toString();
  const ambiente = useMemo(() => parseAmbiente(new URLSearchParams(searchKey)), [searchKey]);
  // La escena propia se reconstruye en el navegador (Web Worker): primero la reconstrucción, que
  // es lo que se dibuja, y luego el resultado completo (Monte Carlo, inversión y consistencia) para
  // los paneles. El visor 3D se queda con la primera para no reconstruir la escena 3D al llegar la
  // segunda (las trayectorias son las mismas).
  const [resultado, setResultado] = useState<{
    name: EscenaVisor;
    dibujo: Resultado;
    r: Resultado;
    completo: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<RendererInfo | null>(null);
  const [exportApi, setExportApi] = useState<ViewerExportApi | null>(null);
  const legend = useMemo(() => legendFor(spec), [spec]);
  // Modo automático (ADR 0026): arranca en el nivel que sugiere la GPU y luego lo ajustan los fps
  // medidos. En el prerender no hay GPU (null) y se usa media.
  const gpu = useSyncExternalStore(noopSubscribe, gpuTierSnapshot, nullSnapshot);
  const [autoAjustada, setAutoAjustada] = useState<QualityLevel | null>(null);
  const autoCalidad: QualityLevel = autoAjustada ?? gpu?.level ?? "media";
  const calidad: QualityLevel = params.calidad === "auto" ? autoCalidad : params.calidad;

  useEffect(() => {
    let alive = true;
    const name = params.escena;
    const fail = (e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : String(e));
    };
    if (name === "propia") {
      reconstruirCompletoEnNavegador(spec, (parcial) => {
        if (alive) setResultado({ name, dibujo: parcial, r: parcial, completo: false });
      })
        .then((completo) => {
          if (alive) {
            setResultado((prev) => ({
              name,
              dibujo: prev?.name === name ? prev.dibujo : completo,
              r: completo,
              completo: true,
            }));
          }
        })
        .catch(fail);
    } else {
      loadResultado(name)
        .then((r) => {
          if (alive) setResultado({ name, dibujo: r, r, completo: true });
        })
        .catch(fail);
    }
    return () => {
      alive = false;
    };
  }, [params.escena, spec]);

  const r = resultado?.name === params.escena ? resultado.r : null;
  const dibujo = resultado?.name === params.escena ? resultado.dibujo : null;
  const calculando = resultado?.name === params.escena && !resultado.completo;
  // Hipótesis alternativa de la escena actual (se descarta al cambiar de escena).
  const [hyp, setHyp] = useState<{ escena: EscenaVisor; lista: Hipotesis[] } | null>(null);
  const hipotesis = useMemo(
    () => (hyp?.escena === params.escena ? hyp.lista : []),
    [hyp, params.escena],
  );
  const ghostResults = useMemo(() => hipotesis.map((h) => h.resultado), [hipotesis]);
  const clock = useMemo(() => {
    if (!dibujo) return null;
    return createClock(
      createTimeline(dibujo.t_inicio, dibujo.t_fin, dibujo.dt, {
        t: params.t ?? dibujo.t_inicio,
        playing: params.auto,
        loop: params.bucle,
      }),
    );
  }, [dibujo, params.t, params.auto, params.bucle]);

  // Backend automático por medición (ADR 0006): WebGPU primero; si no llega a 60 fps se prueba
  // WebGL 2 y se queda el más rápido. La decisión se recuerda en este navegador.
  // Resultado del montaje de personas (ragdolls calibrados) para el panel.
  const [people, setPeople] = useState<{ escena: EscenaVisor; data: PeopleAttachment } | null>(
    null,
  );
  const onPeople = useCallback(
    (data: PeopleAttachment) => setPeople({ escena: params.escena, data }),
    [params.escena],
  );
  // Una prueba por escena: lo que rinde en una escena puede no rendir en otra.
  const [trialState, setTrialState] = useState<{ escena: EscenaVisor; trial: BackendTrial }>(
    () => ({
      escena: params.escena,
      trial: startTrial(readBackend()),
    }),
  );
  const trial = trialState.escena === params.escena ? trialState.trial : startTrial(readBackend());
  const escena = params.escena;
  const setTrial = useCallback(
    (update: (t: BackendTrial) => BackendTrial): void =>
      setTrialState((s) => ({
        escena,
        trial: update(s.escena === escena ? s.trial : startTrial(readBackend())),
      })),
    [escena],
  );
  const effectiveRenderer: RendererPreference =
    params.renderer === "auto" ? trial.current : params.renderer;
  useEffect(() => {
    if (params.renderer !== "auto" || trial.decided || !info) return undefined;
    const id = window.setInterval(() => {
      const perf = window.__croquisPerf;
      if (!perf || perf.frameMs.length < 240) return;
      const fps = recentFps(perf.frameMs, 120);
      if (!Number.isFinite(fps)) return;
      setTrial((t) => {
        const next = recordTrial(t, fps, info.backend);
        if (next.decided) saveBackend(next.current);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [params.renderer, trial.decided, info, setTrial]);

  // Calidad automática con histéresis según los fps medidos (PLAN §7.8), una vez elegido el backend.
  useEffect(() => {
    if (params.calidad !== "auto" || (params.renderer === "auto" && !trial.decided))
      return undefined;
    const id = window.setInterval(() => {
      const fps = recentFps(window.__croquisPerf?.frameMs ?? [], 90);
      if (Number.isFinite(fps)) {
        setAutoAjustada((q) => nextQualityLevel(q ?? gpu?.level ?? "media", fps));
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [params.calidad, params.renderer, trial.decided, gpu]);

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
  const cameraMode: CameraMode = [
    "libre",
    "cenital",
    "conductor",
    "cinematica",
    "dano",
    "persona",
  ].includes(mode)
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
            {hayPropia ? (
              <option value="propia">Escena propia (del relato o el croquis)</option>
            ) : null}
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
            <option value="auto">
              Automática ({calidad}
              {gpu ? ` · ${gpu.kind}` : ""})
            </option>
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="ultra">Ultra</option>
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
            <option value="auto">Automático (elige el más rápido)</option>
            <option value="webgpu">Forzar WebGPU</option>
            <option value="webgl">Forzar WebGL 2</option>
          </select>
        </label>
        {info ? (
          <span
            className="pb-1 font-mono text-xs text-neutral-600 dark:text-neutral-400"
            data-testid="backend"
          >
            {info.backend === "webgpu" ? "WebGPU" : "WebGL 2"}
            {params.renderer === "auto" && trial.decided && Object.keys(trial.measured).length > 0
              ? ` · elegido por medición (${Object.entries(trial.measured)
                  .map(([k, v]) => `${k === "webgpu" ? "WebGPU" : "WebGL 2"} ${Math.round(v)} fps`)
                  .join(", ")})`
              : ""}
          </span>
        ) : null}
      </div>

      {ambiente ? (
        <p
          role="status"
          data-testid="ambiente-forzado"
          className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          {describeAmbiente(ambiente)}
        </p>
      ) : null}

      <div
        className={
          params.completa
            ? "fixed inset-0 z-50 bg-neutral-900"
            : "relative h-[60vh] min-h-[360px] w-full overflow-hidden rounded-lg border border-neutral-300 bg-neutral-900 dark:border-neutral-700"
        }
      >
        {error ? (
          <p role="alert" className="grid h-full place-items-center p-6 text-center text-white">
            {error}
          </p>
        ) : dibujo && clock ? (
          <SceneViewer
            spec={spec}
            resultado={dibujo}
            clock={clock}
            camera={cameraMode}
            driverVehicleId={driverId}
            quality={calidad}
            renderer={effectiveRenderer}
            onRendererInfo={setInfo}
            onPeople={onPeople}
            hipotesis={ghostResults}
            onExport={setExportApi}
            ambiente={ambiente ?? undefined}
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
          <Legend
            seed={spec.meta.semilla}
            inputHash={spec.meta.hash_relato}
            tone="clara"
            atribucion={spec.lugar.red_vial?.atribucion}
          />
        </div>
      </div>

      {clock ? <ClockedTimelineBar clock={clock} markers={markers} /> : null}

      <ExportPanel
        api={exportApi}
        clock={clock}
        legend={legend}
        nombre={params.escena === "propia" ? "escena-propia" : params.escena}
      />

      {calculando ? (
        <p
          role="status"
          data-testid="calculo-completo"
          className="text-sm text-neutral-600 dark:text-neutral-400"
        >
          Calculando la incertidumbre (Monte Carlo), la inversión desde la evidencia y la
          consistencia en este navegador…
        </p>
      ) : null}

      {r ? <ResultPanel resultado={r} supuestosEntorno={env.supuestos} spec={spec} /> : null}
      {r ? <EvidencePanel resultado={r} /> : null}
      {r ? (
        <HypothesisPanel
          spec={spec}
          resultado={r}
          hipotesis={hipotesis}
          onChange={(lista) => setHyp({ escena: params.escena, lista })}
        />
      ) : null}
      {r ? (
        <PeoplePanel resultado={r} people={people?.escena === params.escena ? people.data : null} />
      ) : null}
    </div>
  );
}
