"use client";
/**
 * Presentar (rediseño «Laboratorio», prompt §8): la maqueta grande a sangre con un velo hacia la
 * izquierda y la historia del caso en capítulos de 6 s. ← → cambian de capítulo, Espacio pausa y Esc
 * sale. El aviso de reconstrucción de apoyo está siempre a la vista.
 */
import { especReconstruida, type Reconstruccion } from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import type { EscenaSpec } from "@croquis/scene-schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logotipo } from "@/components/sitio/logo";
import { conCallesDelMapa } from "@/lib/calles-del-mapa";
import type { CifraContraste, conteoCriterios, LecturaFisica } from "@/lib/contraste-lab";
import type { ResultadoMaqueta } from "@/lib/maqueta";
import { guardarTema, type Tema } from "@/lib/preferencias-cesvi";
import { capitulos, DURACION_CAPITULO_S, tDelCapitulo } from "@/lib/presentar-lab";
import { reconstruirEnNavegador } from "@/lib/reconstruct-client";
import type { CanalTiempo } from "@/lib/visor-unity/canal";
import { EscenaMaqueta } from "../escena/maqueta";
import { Linea, Sube } from "../movimiento";

export function PresentarCaso({
  r,
  calles,
  clave,
  tema,
  lugar,
  modalidad,
  contra,
  fisica,
  letraDe,
  conteo,
  nombreDe,
  onSalir,
  con3d = null,
}: {
  /**
   * U6: el visor Unity ya cargó y va detrás, a la derecha. Presentar le avisa el instante de cada
   * capítulo por este canal y no dibuja la maqueta. Sin él, la maqueta de siempre.
   */
  con3d?: CanalTiempo | null;
  fisica: LecturaFisica | null;
  letraDe: (id: string) => string;
  r: Reconstruccion;
  calles: OverpassResponse | null;
  /** «AXA · A2010930» o el título del hecho. */
  clave: string;
  tema: Tema;
  lugar: string;
  modalidad: string | null;
  contra: CifraContraste | null;
  conteo: ReturnType<typeof conteoCriterios> | null;
  nombreDe: (id: string) => string;
  onSalir: () => void;
}) {
  const spec = useMemo(() => {
    let s = especReconstruida(r);
    if (r.origen && calles) s = conCallesDelMapa(s, r.origen, calles);
    return s as unknown as EscenaSpec;
  }, [r, calles]);
  const [res, setRes] = useState<ResultadoMaqueta | null>(null);
  useEffect(() => {
    let vivo = true;
    void reconstruirEnNavegador(spec, r.relieve)
      .then((x) => {
        if (vivo) setRes(x as unknown as ResultadoMaqueta);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [spec, r.relieve]);

  const caps = useMemo(
    () =>
      res ? capitulos({ r, res, nombreDe, lugar, modalidad, contra, fisica, letraDe, conteo }) : [],
    // `nombreDe` cambia en cada render del recorrido, pero depende de lo mismo que `r`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, res, lugar, modalidad, contra, fisica, conteo],
  );
  const [k, setK] = useState(0);
  const [fraccion, setFraccion] = useState(0);
  // Con movimiento reducido no avanza solo: el perito pasa de capítulo con las flechas.
  const [corre, setCorre] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const n = caps.length;
  const ir = (d: number) => {
    setK((x) => Math.max(0, Math.min(n - 1, x + d)));
    setFraccion(0);
  };
  const irRef = useRef(ir);
  useEffect(() => {
    irRef.current = ir;
  });
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") irRef.current(1);
      else if (e.key === "ArrowLeft") irRef.current(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setCorre((c) => !c);
      } else if (e.key === "Escape") onSalir();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onSalir]);
  // La historia avanza sola, y se queda en el último capítulo.
  useEffect(() => {
    if (!corre || !n) return;
    let id = 0;
    let previo = performance.now();
    const paso = (ahora: number) => {
      const dt = (ahora - previo) / 1000 / DURACION_CAPITULO_S;
      previo = ahora;
      setFraccion((f) => Math.min(1, f + dt));
      id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [corre, n]);
  useEffect(() => {
    if (fraccion < 1 || k >= n - 1) return undefined;
    const id = requestAnimationFrame(() => {
      setK((x) => x + 1);
      setFraccion(0);
    });
    return () => cancelAnimationFrame(id);
  }, [fraccion, k, n]);

  const c = caps[k];
  const t = c ? tDelCapitulo(c, fraccion) : null;
  useEffect(() => {
    if (con3d && t !== null) con3d.avisar(t);
  }, [con3d, t]);
  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden text-texto ${con3d ? "" : "bg-fondo"}`}
      role="dialog"
      aria-modal="true"
      aria-label="Presentar el caso"
      data-testid="presentar-caso"
      data-capitulo={c?.clave}
      data-corre={corre ? "si" : "no"}
    >
      {con3d ? (
        // El 3D va detrás (`VisorCasoUnity` en modo Presentar); aquí solo el fondo de la izquierda.
        <div className="absolute inset-y-0 left-0 w-[30%] bg-fondo" aria-hidden="true" />
      ) : res && c ? (
        <div className="absolute inset-y-0 right-0 left-[30%]" aria-hidden="true">
          <EscenaMaqueta spec={spec} resultado={res} sinEtiquetas t={tDelCapitulo(c, fraccion)} />
        </div>
      ) : null}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-[62%]"
        style={{
          background:
            "linear-gradient(to right, var(--fondo) 62%, color-mix(in srgb, var(--fondo) 70%, transparent) 82%, transparent)",
        }}
      />
      <header className="absolute inset-x-0 top-0 flex items-center justify-between gap-4 p-8 md:px-14">
        <div className="flex min-w-0 items-center gap-4">
          <Logotipo ancho={104} variante={tema === "claro" ? "logotipo-sobre-claro" : "logotipo"} />
          <span
            className="truncate font-mono text-[0.75rem] text-texto-2"
            data-testid="presentar-clave"
          >
            {clave}
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="boton-secundario boton-compacto grid w-10 place-items-center px-0"
            onClick={() => guardarTema("presentar", tema === "claro" ? "oscuro" : "claro")}
            aria-label={tema === "claro" ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
          >
            ◐
          </button>
          <button
            type="button"
            className="boton-secundario boton-compacto"
            onClick={onSalir}
            data-testid="salir-presentar"
          >
            Salir · Esc
          </button>
        </div>
      </header>
      {c ? (
        <main className="absolute top-32 left-8 flex w-[min(40rem,calc(100%-4rem))] flex-col gap-5 md:left-14">
          <span className="font-mono text-[0.8125rem] text-texto-2" data-testid="capitulo-n">
            {String(k + 1).padStart(2, "0")} de {String(n).padStart(2, "0")}
          </span>
          <h1
            className="font-[family-name:var(--fuente-titulo)] text-[clamp(3.5rem,7.2vw,6.5rem)] leading-none font-normal tracking-[-0.03em]"
            data-testid="capitulo-titulo"
          >
            <Linea clave={c.clave}>{c.titulo}</Linea>
          </h1>
          <dl
            className="flex flex-col divide-y divide-[var(--linea)] border-t border-linea"
            data-testid="capitulo-datos"
          >
            {c.filas.map((f, i) => (
              <Sube
                key={`${c.clave}-${i}`}
                i={i}
                className="flex items-baseline justify-between gap-6 py-3"
              >
                <dt className="text-texto-2">{f.etiqueta}</dt>
                <dd
                  className={
                    f.grande
                      ? "font-[family-name:var(--fuente-titulo)] text-[2.75rem] leading-none italic"
                      : "text-right font-mono text-[0.9375rem]"
                  }
                >
                  {f.valor}
                </dd>
              </Sube>
            ))}
          </dl>
          {c.nota ? (
            <p className="max-w-[40rem] text-[0.875rem] text-texto-2" data-testid="capitulo-nota">
              {c.nota}
            </p>
          ) : null}
        </main>
      ) : (
        <p className="t-nota absolute top-1/2 left-14" data-testid="presentar-calculando">
          Calculando la maqueta…
        </p>
      )}
      <p
        className="absolute right-8 bottom-16 text-[0.8125rem] text-texto-2 md:right-14"
        data-testid="aviso-apoyo"
      >
        Reconstrucción de apoyo · el dictamen es del perito
      </p>
      <footer className="absolute inset-x-0 bottom-0 flex items-end gap-6 px-8 pb-7 md:px-14">
        <ol className="flex min-w-0 flex-1 gap-3">
          {caps.map((x, i) => (
            <li key={x.clave} className="min-w-0 flex-1">
              <button
                type="button"
                className="flex w-full flex-col gap-2 text-left"
                onClick={() => {
                  setK(i);
                  setFraccion(0);
                }}
                aria-current={i === k ? "step" : undefined}
                data-testid={`capitulo-${x.clave}`}
              >
                <span className="relative block h-0.5 w-full bg-linea">
                  <span
                    className={`absolute inset-y-0 left-0 ${i === k ? "bg-senal" : "bg-texto-2"}`}
                    style={{
                      width: `${i < k ? 100 : i === k ? fraccion * 100 : 0}%`,
                    }}
                  />
                </span>
                <span
                  className={`truncate text-[0.8125rem] ${i === k ? "font-semibold text-texto" : "text-texto-2"}`}
                >
                  {String(i + 1).padStart(2, "0")} · {x.titulo}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <span className="hidden shrink-0 font-mono text-[0.6875rem] text-texto-3 md:inline">
          ← → capítulos · Espacio {corre ? "pausa" : "sigue"}
        </span>
      </footer>
    </div>
  );
}
