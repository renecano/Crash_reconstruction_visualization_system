"use client";
/**
 * La portada de lanzamiento (PLAN §11.3): una sola página con la cámara que recorre la escena real
 * de Toluca, capítulo por capítulo (C-R-O-Q-U-I-S). Cada capítulo es una sección real del documento
 * (el texto se lee sin JavaScript y sin 3D); el escenario 3D está fijo detrás y lo guía el scroll.
 *
 * - **Revelación (Ubica → Impacta):** el croquis pintado sobre el asfalto se levanta hasta ser la
 *   escena 3D, y el scroll recorre el tiempo del choque.
 * - **Control de velocidad:** cambia la velocidad de A y el solver lo recalcula en el navegador.
 * - **Movimiento reducido:** sin suavizado ni transiciones; el escenario es el cuadro fijo del capítulo.
 */
import { loadFixture, loadResultado, type Resultado } from "@croquis/scene-schema";
import { formatTime } from "@croquis/viewer";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { RelatoConCitas } from "@/components/relato/relato-con-citas";
import { Cota } from "@/components/sitio/cota";
import { Legend } from "@/components/legend";
import { Logotipo } from "@/components/sitio/logo";
import { withSpeed } from "@/components/visor/hypothesis-panel";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { opcionEtiqueta, preguntaVista } from "@/lib/mensajes";
import { reconstruirEnNavegador } from "@/lib/reconstruct-client";
import type { Pregunta } from "@/lib/relato-api";
import {
  CAPITULOS,
  N,
  opacidadTexto,
  T_ANTES,
  T_DESPUES,
  tiempoEscena,
  velo,
  type Capitulo,
} from "./camara";
import { CroquisAMano } from "./croquis-a-mano";
import { Escenario } from "./escenario";
import { TEXTOS_PORTADA } from "./textos";

export interface DatosPortada {
  anio: number;
  accidentes: number;
  e1: { croquis: number; reglas: number };
  e3: { croquis: number; winsmash: number };
  e5: { croquis: number; uniforme: number; lineal: number };
  relato: string;
  preguntas: Pregunta[];
  galeria: { prueba: string; foto: string; render: string };
}

const VEHICULO_A = "veh-a";

const reducidoQuery = "(prefers-reduced-motion: reduce)";
function suscribirReducido(cb: () => void) {
  const m = window.matchMedia(reducidoQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

export function Portada({ datos }: { datos: DatosPortada }) {
  const { lang, ruta } = useIdioma();
  const t = useTextos(TEXTOS_PORTADA);
  const reducido = useSyncExternalStore(
    suscribirReducido,
    () => window.matchMedia(reducidoQuery).matches,
    () => false,
  );
  const spec = useMemo(() => loadFixture("interseccion_toluca"), []);
  const [base, setBase] = useState<Resultado | null>(null);
  // La escena recalculada con otra velocidad de A (se sigue viendo la anterior mientras se calcula).
  const [recalculado, setRecalculado] = useState<{ kmh: number; r: Resultado } | null>(null);
  const [hipotesis, setHipotesis] = useState<Resultado[]>([]);
  const velBase = spec.vehiculos.find((v) => v.id === VEHICULO_A)?.velocidad_previa?.valor ?? 35;
  const [kmh, setKmh] = useState(velBase);
  const [calculando, setCalculando] = useState(false);

  // Scroll: progreso suavizado (lerp 0.09; 1 con movimiento reducido), leído por el escenario.
  const progreso = useRef(0);
  const copias = useRef<(HTMLDivElement | null)[]>([]);
  const veloRef = useRef<HTMLDivElement>(null);
  const [capitulo, setCapitulo] = useState<Capitulo>("apertura");
  const [tiempo, setTiempo] = useState(tiempoEscena(0));
  // Capítulo en que el 3D quedó listo: desde ahí el cuadro fijo ya no cambia (está oculto).
  const [listoEn, setListoEn] = useState<Capitulo | null>(null);
  const alListo = useCallback(() => setListoEn((c) => c ?? capitulo), [capitulo]);

  useEffect(() => {
    let alive = true;
    loadResultado("interseccion_toluca").then((r) => {
      if (!alive) return;
      setBase(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let actual = -1;
    let tActual = Number.NaN;
    let antes = performance.now();
    const alto = () => Math.max(1, window.innerHeight * 1.5);
    const loop = () => {
      const ahora = performance.now();
      const dt = Math.min(0.25, (ahora - antes) / 1000);
      antes = ahora;
      const objetivo = Math.min(N - 1e-6, window.scrollY / alto());
      // Suavizado independiente de los cuadros por segundo: 0.09 por cuadro a 60 fps (scroll-world).
      const k = reducido ? 1 : 1 - Math.exp(-5.66 * dt);
      progreso.current += (objetivo - progreso.current) * k;
      const p = progreso.current;
      copias.current.forEach((el, i) => {
        if (!el) return;
        const o = reducido ? (Math.floor(p) === i ? 1 : 0) : opacidadTexto(p, i);
        el.style.opacity = String(o);
        // Las copias están una encima de otra: solo la visible recibe el puntero.
        el.style.pointerEvents = o > 0.5 ? "auto" : "none";
      });
      if (veloRef.current) veloRef.current.style.opacity = String(velo(p));
      const i = Math.min(N - 1, Math.max(0, Math.floor(p)));
      if (i !== actual) {
        actual = i;
        setCapitulo(CAPITULOS[i]!);
      }
      const tt = Math.round(tiempoEscena(p) * 100) / 100;
      if (tt !== tActual) {
        tActual = tt;
        setTiempo(tt);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reducido]);

  // «Impacta»: cambiar la velocidad de A vuelve a reconstruir la escena en el navegador.
  useEffect(() => {
    if (!base || kmh === velBase) return undefined;
    let alive = true;
    const id = window.setTimeout(() => {
      setCalculando(true);
      reconstruirEnNavegador(withSpeed(spec, VEHICULO_A, kmh))
        .then((r) => {
          if (alive) setRecalculado({ kmh, r });
        })
        .catch((e: unknown) => console.error("No se pudo recalcular la escena", e))
        .finally(() => {
          if (alive) setCalculando(false);
        });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [kmh, base, spec, velBase]);

  // «Simula»: una hipótesis de A a 10 km/h más, calculada una vez al llegar al capítulo.
  const resultado = kmh === velBase ? base : (recalculado?.r ?? base);
  const kmhHipotesis = velBase + 10;
  useEffect(() => {
    if (capitulo !== "s" || hipotesis.length > 0) return;
    reconstruirEnNavegador(withSpeed(spec, VEHICULO_A, kmhHipotesis))
      .then((r) => setHipotesis([r]))
      .catch((e: unknown) => console.error("No se pudo calcular la hipótesis", e));
  }, [capitulo, hipotesis.length, spec, kmhHipotesis]);

  const ir = useCallback(
    (i: number, instantaneo = false) => {
      const top = (i + 0.5) * window.innerHeight * 1.5;
      window.scrollTo({ top, behavior: reducido || instantaneo ? "auto" : "smooth" });
      // Al saltar con teclado, la copia aparece sin esperar al suavizado.
      if (instantaneo) progreso.current = i + 0.5;
    },
    [reducido],
  );

  const pregunta = datos.preguntas[0];
  const vistaPregunta = pregunta ? preguntaVista(pregunta, spec, lang) : null;
  const caracteres = useTipeo(datos.relato, capitulo === "c", reducido);
  // Cifras con los decimales de su evaluación, en el formato del idioma.
  const fmt = (x: number, d: number) =>
    x.toLocaleString(lang === "es" ? "es-MX" : "en-US", {
      maximumFractionDigits: d,
      minimumFractionDigits: d,
    });

  const copia = (i: number, contenido: React.ReactNode, centrado = false) => (
    <div
      ref={(el) => {
        copias.current[i] = el;
      }}
      className={`pagina w-full ${centrado ? "flex flex-col items-center text-center" : ""}`}
      style={{ opacity: i === 0 ? 1 : 0, pointerEvents: i === 0 ? "auto" : "none" }}
    >
      {contenido}
    </div>
  );
  /**
   * Un capítulo. `centrado`: texto al centro (apertura y cierre, también centrados en vertical en
   * celular, para que el pie no tape el cierre). `fluye`: en celular el contenido no cabe en una
   * pantalla, así que corre con el scroll en lugar de quedarse fijo.
   */
  const seccion = (
    c: Capitulo,
    contenido: React.ReactNode,
    { centrado = false, fluye = false } = {},
  ) => {
    const i = CAPITULOS.indexOf(c);
    const vertical = centrado ? "items-center" : "items-end md:items-center";
    const capa = fluye
      ? "absolute inset-x-0 top-[55svh] pb-8 md:fixed md:inset-0 md:flex md:items-center md:pt-20 md:pb-8"
      : `fixed inset-0 flex ${vertical} pt-20 pb-[max(2rem,env(safe-area-inset-bottom))] md:pb-8`;
    return (
      <section
        key={c}
        id={`capitulo-${c}`}
        aria-label={t.capitulos[c]}
        data-capitulo={c}
        className="relative h-[150svh]"
        // Con teclado, enfocar algo de un capítulo lleva el scroll a ese capítulo.
        onFocus={() => {
          if (Math.floor(progreso.current) !== i) ir(i, true);
        }}
      >
        {/* La copia queda fija mientras dura el capítulo (como la cámara): el scroll solo maneja
            su opacidad, que llega a 1 a la mitad, cuando la cámara se asienta. */}
        <div className={`pointer-events-none z-10 ${capa}`}>{copia(i, contenido, centrado)}</div>
      </section>
    );
  };
  const letra = (c: Capitulo, l: string) => (
    <p aria-hidden="true" className="t-letra text-texto/90 mb-2 select-none" data-letra={c}>
      {l}
    </p>
  );
  const columna = "carril flex max-w-2xl flex-col gap-5";

  return (
    <div className="relative" data-testid="portada" data-capitulo={capitulo}>
      {resultado ? (
        <Escenario
          spec={spec}
          resultado={resultado}
          hipotesis={capitulo === "s" ? hipotesis : []}
          progreso={progreso}
          enImpacta={capitulo === "i"}
          reducido={reducido}
          // Cuadro fijo del capítulo mientras no hay 3D (o en su lugar, con movimiento reducido).
          cuadro={`/portada/${listoEn ?? capitulo}`}
          onListo={alListo}
        />
      ) : (
        <div
          className="fixed inset-0 -z-0"
          aria-hidden="true"
          style={{ background: "var(--efecto-luz-escena)" }}
        />
      )}
      {/* Velo para leer el texto sobre la escena: a la izquierda en escritorio, abajo en celular. */}
      <div
        ref={veloRef}
        data-velo
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-0 bg-[linear-gradient(0deg,var(--fondo)_8%,transparent_62%)] md:bg-[linear-gradient(90deg,var(--fondo)_0%,color-mix(in_srgb,var(--fondo)_70%,transparent)_34%,transparent_62%)]"
        style={{ opacity: 0.45 }}
      />

      {/* Leyenda obligatoria sobre la escena (PLAN §10) y atribución de la calle (ODbL). */}
      <div className="pointer-events-none fixed top-16 left-0 z-20 max-w-[min(34rem,100vw)] px-4 py-2 md:top-auto md:right-14 md:bottom-3 md:left-auto md:text-right">
        <Legend tone="clara" atribucion={spec.lugar.red_vial?.atribucion} />
      </div>

      <nav
        aria-label={t.riel}
        className="fixed top-1/2 right-[max(4px,1.4vw)] z-30 hidden -translate-y-1/2 flex-col md:flex"
      >
        {CAPITULOS.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => ir(i)}
            aria-label={t.capitulos[c]}
            aria-current={capitulo === c ? "step" : undefined}
            className="group grid h-11 w-11 place-items-center"
          >
            <span
              className={`block w-[2px] transition-all ${capitulo === c ? "h-6 bg-texto" : "h-3 bg-texto-3 group-hover:bg-texto-2"}`}
            />
          </button>
        ))}
      </nav>

      <div className="relative z-10">
        {seccion(
          "apertura",
          <div className="flex flex-col items-center gap-8">
            <h1 className="sr-only">Croquis</h1>
            <Logotipo
              ancho={420}
              variante="logotipo-efectos"
              alt="Croquis"
              prioridad
              className="h-auto w-[min(78vw,420px)]"
            />
            <p className="t-lanzamiento">
              {t.lema.split(/(?<=\.)\s+/).map((frase) => (
                <span key={frase} className="block">
                  {frase}
                </span>
              ))}
            </p>
            <Link href={ruta("/cuenta")} className="boton-principal" data-testid="cta-apertura">
              {t.cuenta}
            </Link>
            <p className="t-nota" aria-hidden="true">
              {t.sigue}
            </p>
          </div>,
          { centrado: true },
        )}

        {seccion(
          "problema",
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className={columna}>
              <p className="t-lanzamiento cifras" data-testid="cifra-atus">
                {fmt(datos.accidentes, 0)}
              </p>
              <p className="t-cuerpo">{t.problema.cifra(datos.anio)}</p>
              <Link href={ruta("/historia")} className="t-nota self-start">
                {t.problema.fuente}
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              <CroquisAMano alt={t.problema.manoAlt} />
              <p className="t-interfaz max-w-md">{t.problema.mano}</p>
            </div>
          </div>,
        )}

        {seccion(
          "c",
          <div className={columna}>
            {letra("c", "C")}
            <h2 className="t-capitulo">{t.c.titulo}</h2>
            <p className="t-cuerpo text-texto-2">{t.c.cuerpo}</p>
            <p
              className="campo t-cuerpo min-h-40 whitespace-pre-wrap"
              lang="es-MX"
              data-testid="relato-en-vivo"
              aria-label={datos.relato}
            >
              <span aria-hidden="true">{datos.relato.slice(0, caracteres)}</span>
              <span
                aria-hidden="true"
                className="ml-0.5 inline-block h-5 w-[2px] translate-y-1 animate-pulse bg-texto"
              />
            </p>
          </div>,
        )}

        {seccion(
          "r",
          <div className={columna}>
            {letra("r", "R")}
            <h2 className="t-capitulo">{t.r.titulo}</h2>
            <div lang="es-MX">
              <RelatoConCitas texto={datos.relato} spec={spec} />
            </div>
            <p className="t-nota">{t.r.cuerpo}</p>
          </div>,
        )}

        {seccion(
          "o",
          <div className={columna}>
            {letra("o", "O")}
            <h2 className="t-capitulo">{t.o.titulo}</h2>
            <ol className="relative mt-4 grid grid-cols-3 gap-2 border-t border-texto pt-3">
              {(
                [
                  [t.o.antes, T_ANTES],
                  [t.o.impacto, 0],
                  [t.o.despues, T_DESPUES],
                ] as const
              ).map(([nombre, s]) => (
                <li key={nombre} className="flex flex-col">
                  <span className={`t-interfaz ${s === 0 ? "marca-evidencia" : ""}`}>{nombre}</span>
                  <span className="t-cota">{formatTime(s)}</span>
                </li>
              ))}
            </ol>
          </div>,
        )}

        {seccion(
          "q",
          <div className={columna}>
            {letra("q", "Q")}
            <h2 className="t-capitulo">{t.q.titulo}</h2>
            <p className="t-cuerpo text-texto-2">{t.q.cuerpo}</p>
            {pregunta && vistaPregunta ? (
              <div className="vidrio flex flex-col gap-3 p-5" data-testid="pregunta-portada">
                <p className="t-subtitulo" lang={vistaPregunta.lang}>
                  {vistaPregunta.texto}
                </p>
                {pregunta.opciones?.length ? (
                  <ul className="flex flex-wrap gap-2" aria-hidden="true">
                    {pregunta.opciones.map((o) => (
                      <li key={o} className="boton-secundario pointer-events-none min-h-11 px-4">
                        {opcionEtiqueta(o, lang)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>,
        )}

        {seccion(
          "u",
          <div className={columna}>
            {letra("u", "U")}
            <h2 className="t-capitulo">{t.u.titulo}</h2>
            <p className="t-cuerpo text-texto-2">{t.u.cuerpo}</p>
          </div>,
        )}

        {seccion(
          "i",
          <div className={columna}>
            {letra("i", "I")}
            <h2 className="t-capitulo">{t.i.titulo}</h2>
            <p className="t-cuerpo text-texto-2">{t.i.cuerpo}</p>
            <p className="t-cota text-4xl" data-testid="tiempo-portada" aria-live="off">
              {t.i.tiempo} = {formatTime(tiempo)}
            </p>
            <label className="flex flex-col gap-2">
              <span className="t-interfaz flex items-baseline justify-between gap-4">
                {t.i.velocidad}
                <span className="t-cota text-2xl" data-testid="velocidad-portada">
                  {kmh} km/h
                </span>
              </span>
              <input
                type="range"
                min={20}
                max={70}
                step={1}
                value={kmh}
                onChange={(e) => setKmh(Number(e.target.value))}
                className="w-full accent-[var(--accion)]"
                data-testid="control-velocidad"
              />
              <span className="t-nota" aria-live="polite">
                {calculando ? t.i.calculando : t.i.recalcula}
              </span>
            </label>
            {/* El resultado en cifras: se ve también sin 3D (movimiento reducido o sin WebGL). */}
            {resultado ? (
              <p className="t-interfaz cifras" data-testid="resultado-portada" aria-live="polite">
                {resumenImpacto(resultado, (x, d) => fmt(x, d), t.i.resultado)}
              </p>
            ) : null}
          </div>,
        )}

        {seccion(
          "s",
          <div className={columna}>
            {letra("s", "S")}
            <h2 className="t-capitulo">{t.s.titulo}</h2>
            <p className="t-cuerpo text-texto-2">{t.s.cuerpo}</p>
            {hipotesis.length > 0 ? (
              <p className="t-nota">{t.s.fantasma(String(kmhHipotesis))}</p>
            ) : null}
            <Link
              href={`${ruta("/visor")}?escena=interseccion_toluca`}
              className="boton-secundario self-start"
            >
              {t.s.visor}
            </Link>
          </div>,
        )}

        {seccion(
          "pruebas",
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div className={columna}>
              <h2 className="t-capitulo">{t.pruebas.titulo}</h2>
              <Cota
                etiqueta={t.pruebas.e1}
                filas={[
                  {
                    nombre: t.pruebas.croquis,
                    valor: datos.e1.croquis,
                    texto: fmt(datos.e1.croquis, 3),
                    croquis: true,
                  },
                  {
                    nombre: lang === "es" ? "Reglas" : "Rules",
                    valor: datos.e1.reglas,
                    texto: fmt(datos.e1.reglas, 3),
                  },
                ]}
                href={`${ruta("/recorrido")}#E1`}
                enlace={t.pruebas.fuente}
              />
              <Cota
                etiqueta={t.pruebas.e3}
                filas={[
                  {
                    nombre: t.pruebas.croquis,
                    valor: datos.e3.croquis,
                    texto: fmt(datos.e3.croquis, 2),
                    croquis: true,
                  },
                  {
                    nombre: "WinSMASH",
                    valor: datos.e3.winsmash,
                    texto: fmt(datos.e3.winsmash, 2),
                  },
                ]}
                unidad="km/h"
                nota={t.pruebas.e3Nota}
                href={`${ruta("/recorrido")}#E3`}
                enlace={t.pruebas.fuente}
              />
            </div>
            <div className="flex flex-col gap-6">
              <Cota
                etiqueta={t.pruebas.e5}
                filas={[
                  {
                    nombre: t.pruebas.croquis,
                    valor: datos.e5.croquis,
                    texto: fmt(datos.e5.croquis, 2),
                    croquis: true,
                  },
                  {
                    nombre: lang === "es" ? "Uniforme" : "Uniform",
                    valor: datos.e5.uniforme,
                    texto: fmt(datos.e5.uniforme, 2),
                  },
                  {
                    nombre: lang === "es" ? "Lineal simple" : "Simple linear",
                    valor: datos.e5.lineal,
                    texto: fmt(datos.e5.lineal, 2),
                  },
                ]}
                unidad="cm"
                href={`${ruta("/recorrido")}#E5`}
                enlace={t.pruebas.fuente}
              />
              <Comparador
                foto={datos.galeria.foto}
                render={datos.galeria.render}
                etiqueta={t.pruebas.comparar}
                fotoTexto={t.pruebas.foto}
                renderTexto={t.pruebas.render}
                fuente={t.pruebas.fotoFuente(datos.galeria.prueba)}
              />
            </div>
          </div>,
          { fluye: true },
        )}

        {seccion(
          "noes",
          <div className={columna}>
            <h2 className="sr-only">{t.noes.titulo}</h2>
            <ul className="flex flex-col gap-2">
              <li className="t-capitulo">{t.noes.peritaje}</li>
              <li className="t-capitulo">{t.noes.culpas}</li>
              <li className="t-capitulo">{t.noes.lesiones}</li>
            </ul>
            <p className="t-cuerpo text-texto-2">{t.noes.cuerpo}</p>
          </div>,
        )}

        {seccion(
          "cierre",
          <div className="flex flex-col items-center gap-8">
            <Logotipo
              ancho={420}
              variante="logotipo-efectos"
              alt="Croquis"
              className="h-auto w-[min(76vw,420px)]"
            />
            <h2 className="t-lanzamiento max-w-[20ch]">{t.cierre.titulo}</h2>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={ruta("/cuenta")} className="boton-principal" data-testid="cta-cierre">
                {t.cuenta}
              </Link>
              <Link href={ruta("/demo")} className="boton-secundario">
                {t.ejemplo}
              </Link>
            </div>
          </div>,
          { centrado: true },
        )}
      </div>
    </div>
  );
}

/** ΔV de A y B y a qué distancia del impacto queda A, para el texto bajo el control de velocidad. */
function resumenImpacto(
  r: Resultado,
  fmt: (x: number, d: number) => string,
  texto: (dvA: string, dvB: string, reposo: string) => string,
): string {
  const a = r.vehiculos.find((v) => v.rol === "A");
  const b = r.vehiculos.find((v) => v.rol === "B");
  const p = r.punto_impacto;
  if (!a || !b || !p) return "";
  const n = a.trayectoria.t.length - 1;
  const reposo = Math.hypot(a.trayectoria.x[n]! - p.x, a.trayectoria.y[n]! - p.y);
  return texto(fmt(a.delta_v_kmh, 0), fmt(b.delta_v_kmh, 0), fmt(reposo, 1));
}

/** El relato que «se escribe en vivo» al llegar al capítulo C (completo con movimiento reducido). */
function useTipeo(texto: string, activo: boolean, reducido: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!activo) return undefined;
    if (reducido) {
      const id = window.setTimeout(() => setN(texto.length), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setInterval(() => setN((k) => (k >= texto.length ? k : k + 2)), 28);
    return () => window.clearInterval(id);
  }, [activo, reducido, texto]);
  return n;
}

/** Foto real contra abolladura de Croquis, con un deslizador (también con teclado). */
function Comparador({
  foto,
  render,
  etiqueta,
  fotoTexto,
  renderTexto,
  fuente,
}: {
  foto: string;
  render: string;
  etiqueta: string;
  fotoTexto: string;
  renderTexto: string;
  fuente: string;
}) {
  const [corte, setCorte] = useState(50);
  return (
    <figure className="m-0 flex w-full max-w-md flex-col gap-2" data-testid="comparador">
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-panel bg-superficie">
        {/* eslint-disable-next-line @next/next/no-img-element -- foto de NHTSA de la galería de E5 */}
        <img
          src={foto}
          alt={fotoTexto}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${corte}%)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- render de Croquis de la misma prueba */}
          <img
            src={render}
            alt={renderTexto}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        </div>
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-[2px] bg-texto"
          style={{ left: `${corte}%` }}
        />
        <span className="t-nota vidrio absolute top-2 left-2 max-w-[46%] px-2 py-0.5 text-texto">
          {fotoTexto}
        </span>
        <span className="t-nota vidrio absolute top-2 right-2 max-w-[46%] px-2 py-0.5 text-right text-texto">
          {renderTexto}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={corte}
        onChange={(e) => setCorte(Number(e.target.value))}
        aria-label={etiqueta}
        className="w-full accent-[var(--accion)]"
      />
      <figcaption className="t-nota">{fuente}</figcaption>
    </figure>
  );
}
