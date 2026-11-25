/**
 * La portada pública (René, 2026-11-24): de la misma familia que la app. Usa el sistema «Laboratorio»
 * de /cesvi tal cual (tokens, tipografías, `t-rotulo`, `cifra-protagonista`, `boton-*`, la barra de
 * actos con su punto naranja y `transicion-acto`); aquí solo va su composición. De día o de noche
 * según el sistema. Todo lo que se ve son capturas reales de la app (`scripts/portada-capturas.mjs`).
 *
 * Es HTML del servidor: lo único que corre en el navegador es `movimiento-portada.tsx`.
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { preload } from "react-dom";
import { FUENTES_LABORATORIO } from "@/components/cesvi/fuentes-laboratorio";
import { Logotipo } from "@/components/sitio/logo";
import { MovimientoPortada } from "./movimiento-portada";
import IMAGENES from "./imagenes.json";
import { DETALLES, LEMA, PASOS, SECCIONES, type TextosPortadaV3 } from "./textos";
import MARCA from "../../../../../assets/brand/marca.json";
import "./portada-v3.css";

const REPO = "https://github.com/renecano/Crash_reconstruction_visualization_system";
/** El tráiler (René, 2026-11-25), en YouTube; se incrusta sin cookies y solo al tocarlo. */
const TRAILER_YOUTUBE = "mUWk-sZgdjM";
const SIMBOLO = MARCA.simbolo;
const [MX, MY] = MARCA.mira as [number, number];
const i = (n: number) => ({ "--i": n }) as CSSProperties;

/**
 * Antes de pintar: el tema del sistema, «hay movimiento» (sin JavaScript todo se ve quieto) y la
 * apertura con el logo, una vez por visita.
 */
const ANTES_DE_PINTAR = `(function(r){
var m=window.matchMedia;r.dataset.tema=m("(prefers-color-scheme: dark)").matches?"oscuro":"claro";
if(m("(prefers-reduced-motion: reduce)").matches)return;r.dataset.movimiento="si";
try{if(sessionStorage.getItem("croquis.portada"))return;sessionStorage.setItem("croquis.portada","1")}catch(e){return}
if(!location.hash)r.dataset.apertura="si"
})(document.currentScript.parentElement)`;

/** El logo de la página, el de día o el de noche. */
function Logo({ ancho, prioridad = false }: { ancho: number; prioridad?: boolean }) {
  return (
    <>
      <Logotipo
        ancho={ancho}
        variante="logotipo-sobre-claro"
        className="solo-dia"
        prioridad={prioridad}
      />
      <Logotipo ancho={ancho} className="solo-noche" prioridad={prioridad} />
    </>
  );
}

/** El símbolo en línea, porque se anima: su geometría es la de `marca.json`. */
function Simbolo({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${MARCA.lienzo} ${MARCA.lienzo}`}
      className={`overflow-visible ${className ?? ""}`}
      aria-hidden="true"
    >
      <g className="ta-trazo" fill="none" stroke="currentColor">
        <path d={MARCA.arco} strokeWidth={SIMBOLO.arco_grosor} />
        <path
          d={SIMBOLO.interior.d}
          strokeWidth={SIMBOLO.interior.grosor}
          opacity={SIMBOLO.interior.opacidad}
          strokeDasharray={SIMBOLO.interior.guiones}
        />
      </g>
      <circle
        className="ta-anillo"
        cx={MX}
        cy={MY}
        r={SIMBOLO.mira.radio + 2.4}
        fill="none"
        stroke="var(--senal)"
        opacity="0"
      />
      <g className="ta-mira" fill="none" stroke="var(--senal)">
        <circle cx={MX} cy={MY} r={SIMBOLO.mira.radio} strokeWidth={SIMBOLO.mira.grosor} />
        {SIMBOLO.mira.rayas.map(([x1, y1, x2, y2]) => (
          <line
            key={`${x1}-${y1}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeWidth={SIMBOLO.mira.rayas_grosor}
          />
        ))}
        <circle cx={MX} cy={MY} r={SIMBOLO.mira.punto} fill="var(--senal)" stroke="none" />
      </g>
    </svg>
  );
}

/** Un texto partido en palabras que suben desde su máscara, una tras otra. */
function Palabras({ texto, desde = 0 }: { texto: string; desde?: number }) {
  return texto.split(" ").map((p, k) =>
    p ? (
      <span key={k}>
        {k ? " " : null}
        <span className="pv-mascara">
          <span className="pv-palabra" style={i(desde + k)}>
            {p}
          </span>
        </span>
      </span>
    ) : (
      " "
    ),
  );
}

/** Las rutas de una imagen en un formato, para `srcset`. */
function juego(nombre: string, anchos: readonly number[], formato: "avif" | "webp") {
  return anchos.map((a) => `/portada/app/${nombre}-${a}.${formato} ${a}w`).join(", ");
}

/** Una captura de la app, la del tema del sistema: AVIF y, si el navegador no lo lee, WebP. */
function Captura({
  nombre,
  alt,
  tamanos,
}: {
  nombre: keyof typeof IMAGENES;
  alt: string;
  tamanos: string;
}) {
  const { w, h, anchos } = IMAGENES[nombre];
  const noche = "(prefers-color-scheme: dark)";
  return (
    <picture>
      <source
        media={noche}
        type="image/avif"
        srcSet={juego(`${nombre}-oscuro`, anchos, "avif")}
        sizes={tamanos}
      />
      <source media={noche} srcSet={juego(`${nombre}-oscuro`, anchos, "webp")} sizes={tamanos} />
      <source type="image/avif" srcSet={juego(`${nombre}-claro`, anchos, "avif")} sizes={tamanos} />
      <img
        src={`/portada/app/${nombre}-claro-${w}.webp`}
        srcSet={juego(`${nombre}-claro`, anchos, "webp")}
        sizes={tamanos}
        width={w}
        height={h}
        alt={alt}
        loading="lazy"
        fetchPriority="low"
        decoding="async"
      />
    </picture>
  );
}

/** La entrada de una sección: el símbolo que se traza, su número en mono y el título en la serif. */
function Cabeza({ n, rotulo, titulo }: { n: number; rotulo: string; titulo: string }) {
  return (
    <header className="pv-cabeza" data-ve>
      <div className="flex items-center gap-4">
        <Simbolo className="h-10 w-10" />
        <span className="t-rotulo">
          0{n} · {rotulo}
        </span>
      </div>
      <h2 className="pv-titulo">
        <Palabras texto={titulo} />
      </h2>
    </header>
  );
}

function Abrir({
  t,
  children,
  testid,
}: {
  t: TextosPortadaV3;
  children?: ReactNode;
  testid: string;
}) {
  return (
    <Link
      href="/cesvi"
      prefetch={false}
      className="boton-principal boton-continuar no-underline"
      data-testid={testid}
    >
      {t.abrir}
      {children}
      <span className="flecha-continuar" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

/** Lo que ocupa la foto del inicio: en celular es baja y ancha, así que basta una chica. */
const TAMANO_INICIO = "(min-width: 72rem) 70vw, 100vw";
/** El tráiler va a lo ancho del contenido (hasta 1500 px). */
const TAMANO_TRAILER = "(min-width: 100rem) 1500px, 92vw";

export function PortadaV3({ t }: { t: TextosPortadaV3 }) {
  // La imagen más grande de la primera pantalla se pide antes que nada (LCP).
  preload(`/portada/app/inicio-${IMAGENES.inicio.w}.avif`, {
    as: "image",
    type: "image/avif",
    imageSrcSet: juego("inicio", IMAGENES.inicio.anchos, "avif"),
    imageSizes: TAMANO_INICIO,
    fetchPriority: "high",
  });
  return (
    <div data-diseno="laboratorio" className={FUENTES_LABORATORIO}>
      <div
        className="pv"
        data-tema="claro"
        data-testid="portada-v3"
        // El tema y el movimiento los pone el script de abajo antes de pintar.
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: ANTES_DE_PINTAR }} />
        <a href="#inicio" className="pv-saltar">
          {t.saltar}
        </a>

        {/* La cortina con el logo: al abrir y al cambiar de sección desde la barra. */}
        <div className="transicion-acto pv-cortina" aria-hidden="true" data-cortina>
          <div className="flex flex-col items-center gap-6">
            <Simbolo className="h-24 w-24" />
            <div className="flex flex-col items-center gap-1 overflow-hidden">
              <span className="ta-titulo t-rotulo cifras" data-cortina-numero>
                {t.rotulo}
              </span>
              <span className="ta-titulo ta-nombre" data-cortina-nombre />
            </div>
          </div>
        </div>

        <header className="vidrio barra pv-barra" data-testid="barra-portada">
          <a href="#inicio" className="shrink-0" data-ir="inicio">
            <Logo ancho={132} prioridad />
          </a>
          <nav aria-label={t.navegacion} className="pv-nav">
            <ol>
              {SECCIONES.map((s, k) => (
                <li key={s}>
                  <a href={`#${s}`} data-ir={s} data-numero={`0${k + 1}`}>
                    {t.secciones[s]}
                  </a>
                </li>
              ))}
            </ol>
            <div className="pv-linea" aria-hidden="true" data-linea="secciones">
              <i />
              <b />
            </div>
          </nav>
          <a
            href={t.otroIdioma.href}
            hrefLang={t.otroIdioma.hrefLang}
            lang={t.otroIdioma.hrefLang}
            className="pv-idioma"
          >
            {t.otroIdioma.texto}
          </a>
          <Link
            href="/cesvi"
            prefetch={false}
            className="boton-principal boton-compacto pv-abrir no-underline"
            data-testid="entrar-barra"
          >
            {t.abrir}
          </Link>
        </header>

        <main>
          <section id="inicio" tabIndex={-1} className="pv-inicio" data-ve>
            <div className="pv-inicio-foto">
              <picture>
                <source
                  type="image/avif"
                  srcSet={juego("inicio", IMAGENES.inicio.anchos, "avif")}
                  sizes={TAMANO_INICIO}
                />
                <img
                  src={`/portada/app/inicio-${IMAGENES.inicio.w}.webp`}
                  srcSet={juego("inicio", IMAGENES.inicio.anchos, "webp")}
                  sizes={TAMANO_INICIO}
                  width={IMAGENES.inicio.w}
                  height={IMAGENES.inicio.h}
                  alt={t.altInicio}
                  fetchPriority="high"
                />
              </picture>
            </div>
            <div className="pv-inicio-texto">
              <p className="t-rotulo">{t.rotulo}</p>
              <h1>
                <span>
                  <Palabras texto={t.h1[0]} />
                </span>{" "}
                <span>
                  <Palabras texto={t.h1[1]} desde={5} />
                </span>
              </h1>
              <p className="pv-lede">{t.lede}</p>
              <div className="pv-acciones">
                <Abrir t={t} testid="entrar" />
                <a href="#como-funciona" className="boton-secundario boton-continuar">
                  {t.ver}
                </a>
              </div>
            </div>
            <p className="pv-leyenda">{t.leyenda}</p>
          </section>

          {/* El tráiler con fachada: un cuadro del video y ▶. Es un enlace a YouTube; con JavaScript,
              al tocarlo se cambia por el reproductor de youtube-nocookie (nada se carga antes). */}
          <section className="pv-seccion pv-trailer" aria-labelledby="pv-trailer-titulo">
            <header className="pv-cabeza" data-ve>
              <span className="t-rotulo">{t.trailer.rotulo}</span>
              <h2 id="pv-trailer-titulo" className="pv-titulo">
                <Palabras texto={t.trailer.titulo} />
              </h2>
            </header>
            <div className="pv-captura pv-trailer-caja" data-ve>
              <a
                href={`https://www.youtube.com/watch?v=${TRAILER_YOUTUBE}`}
                className="pv-trailer-fachada"
                data-youtube={TRAILER_YOUTUBE}
                data-titulo={t.trailer.titulo}
                aria-label={t.trailer.ver}
                data-testid="trailer"
              >
                <picture>
                  <source
                    type="image/avif"
                    srcSet={juego("trailer-poster", [960, 1280, 1920], "avif")}
                    sizes={TAMANO_TRAILER}
                  />
                  <img
                    src="/portada/app/trailer-poster-1280.webp"
                    srcSet={juego("trailer-poster", [960, 1280, 1920], "webp")}
                    sizes={TAMANO_TRAILER}
                    width={1920}
                    height={1080}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
                <span className="pv-trailer-play" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="28" height="28">
                    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
                  </svg>
                </span>
              </a>
            </div>
          </section>

          <section className="pv-lema" aria-label={t.lemaTitulo}>
            <p className="t-rotulo">{t.lemaTitulo}</p>
            <ol>
              {LEMA.map((p, k) => {
                // La letra del nombre: la primera que no es un signo («¿Qué falta?» → Q).
                const l = p.startsWith("¿") ? 1 : 0;
                return (
                  <li key={p} data-ve>
                    <span className="pv-mascara">
                      <span className="pv-palabra" lang="es-MX">
                        {p.slice(0, l)}
                        <em>{p.slice(l, l + 1)}</em>
                        {p.slice(l + 1)}
                      </span>
                    </span>
                    {t.lemaGlosa ? <span className="t-rotulo">{t.lemaGlosa[k]}</span> : null}
                  </li>
                );
              })}
            </ol>
          </section>

          <section id="como-funciona" tabIndex={-1} className="pv-seccion pv-superficie">
            <Cabeza n={1} rotulo={t.secciones["como-funciona"]} titulo={t.comoTitulo} />
            {/* La barra de actos de la app, que aquí sigue el paso que se lee. */}
            <nav className="pv-actos" aria-label={t.pasosNav}>
              <ol>
                {t.pasos.map((p, k) => (
                  <li key={p.nombre}>
                    <a
                      href={`#paso-${PASOS[k]}`}
                      data-acto={k}
                      aria-label={`${k + 1}. ${p.nombre}`}
                    >
                      <span>{p.nombre}</span>
                      {/* En una ventana chica, como en la app, los demás pasos van con su número. */}
                      <b aria-hidden="true">{k + 1}</b>
                    </a>
                  </li>
                ))}
              </ol>
              <div className="pv-linea" aria-hidden="true" data-linea="pasos">
                <i />
                <b />
              </div>
            </nav>
            <ol className="pv-pasos">
              {t.pasos.map((p, k) => (
                <li
                  key={p.nombre}
                  id={`paso-${PASOS[k]}`}
                  data-paso={k}
                  data-testid={`paso-portada-${PASOS[k]}`}
                >
                  <div className="pv-paso-texto" data-ve>
                    <span className="t-rotulo">
                      {k + 1} / {t.pasos.length} · {p.nombre}
                    </span>
                    <h3>
                      <Palabras texto={p.titulo} />
                    </h3>
                    <p>{p.texto}</p>
                  </div>
                  <figure className="pv-captura" data-ve data-captura={PASOS[k]}>
                    <Captura
                      nombre={PASOS[k]!}
                      alt={p.alt}
                      tamanos="(min-width: 64rem) 62vw, 92vw"
                    />
                  </figure>
                </li>
              ))}
            </ol>
            <p className="t-nota">{t.capturas}</p>
          </section>

          <section id="distinto" tabIndex={-1} className="pv-seccion">
            <Cabeza n={2} rotulo={t.secciones.distinto} titulo={t.distintoTitulo} />
            <ul className="pv-distinto">
              {t.distinto.map((x, k) => (
                <li key={x.titulo}>
                  <figure className="pv-captura" data-ve>
                    <Captura
                      nombre={`detalle-${DETALLES[k]!}`}
                      alt={x.alt}
                      tamanos="(min-width: 64rem) 46vw, 92vw"
                    />
                  </figure>
                  <h3>{x.titulo}</h3>
                  <p>{x.texto}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="resultados" tabIndex={-1} className="pv-seccion pv-superficie">
            <Cabeza n={3} rotulo={t.secciones.resultados} titulo={t.resultadosTitulo} />
            <ul className="pv-cifras">
              {t.cifras.map((c) => (
                <li key={c.clave} data-testid={`cifra-${c.clave}`}>
                  <p className="pv-cifra">
                    <span className="sr-only">
                      {c.tasa.k} {c.de} {c.tasa.n}
                    </span>
                    <span aria-hidden="true">
                      <span
                        className="cifra-protagonista"
                        style={{ "--d": String(c.tasa.k).length } as CSSProperties}
                        data-cuenta={c.tasa.k}
                      >
                        {c.tasa.k}
                      </span>
                      <span className="pv-cifra-n">
                        {c.de} {c.tasa.n}
                      </span>
                    </span>
                  </p>
                  <p className="pv-cifra-que">
                    {c.que} <span className="t-cota">({c.pct})</span>
                  </p>
                  <p className="t-nota pv-cifra-limite">{c.limite}</p>
                </li>
              ))}
            </ul>
            <p className="t-nota">{t.resultadosNota}</p>
          </section>

          <section id="limites" tabIndex={-1} className="pv-seccion">
            <Cabeza n={4} rotulo={t.secciones.limites} titulo={t.limitesTitulo} />
            <ul className="pv-limites">
              {t.limites.map((x) => (
                <li key={x.titulo}>
                  <h3>{x.titulo}</h3>
                  <p>{x.texto}</p>
                </li>
              ))}
            </ul>
            <p className="pv-firma" data-ve>
              <Palabras texto={t.firma} />
            </p>
          </section>

          <section className="pv-cierre" data-ve>
            <Simbolo className="h-24 w-24" />
            <p className="pv-cierre-titulo">
              <Palabras texto={t.cierre} />
            </p>
            <Abrir t={t} testid="entrar-cierre" />
          </section>
        </main>

        <footer className="pv-pie" data-testid="pie-portada">
          <div className="flex flex-col gap-4">
            <Logo ancho={160} />
            <p className="t-nota">{t.pie.leyenda}</p>
          </div>
          <div>
            <h2 className="t-rotulo">{t.pie.fuentes}</h2>
            <ul className="t-nota">
              {t.pie.lista.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div className="t-nota flex flex-col gap-2">
            <a href={REPO}>{t.pie.codigo}</a>
            <a
              href={t.otroIdioma.href}
              hrefLang={t.otroIdioma.hrefLang}
              lang={t.otroIdioma.hrefLang}
            >
              {t.otroIdioma.texto}
            </a>
          </div>
        </footer>
        <MovimientoPortada />
      </div>
    </div>
  );
}
