"use client";

/**
 * La portada v3 para los peritos de CESVI (René, 2026-10-24; referencia en
 * `docs/cesvi/rediseno/Portada-v3.html`): un expediente pericial filmado. Respeta la estructura,
 * los textos, las tipografías, los colores, las animaciones y los huevos de pascua de la referencia,
 * con estos cambios:
 * - el video de fondo es la propia reconstrucción de Croquis (`demo/portada/grabar-tomas.mjs`), no
 *   clips de stock;
 * - «Entrar a Croquis» lleva a /cesvi;
 * - las cifras se calculan al compilar (`lib/portada-cesvi.ts`).
 * El comportamiento (hojas, película, animaciones, huevos de pascua) está en `comportamiento.ts`.
 */
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { iniciarPortadaV3, type TomaPortada } from "./comportamiento";
import { FUENTES_PORTADA_V3 } from "./fuentes";
import type { TextosPortadaV3 } from "./textos";
import "./portada-v3.css";

type Estilo = CSSProperties & Record<`--${string}`, string | number>;

/** Un titular partido en palabras que entran una a una (el índice sigue entre partes). */
function Partido({ partes }: { partes: { texto: string; clase?: string; em?: boolean }[] }) {
  let i = 0;
  const palabras = (texto: string) =>
    texto.split(/(\s+)/).map((p, k) =>
      !p ? null : /^\s+$/.test(p) ? (
        p
      ) : (
        <span key={k} className="w">
          <span className="wi" style={{ "--i": i++ } as Estilo}>
            {p}
          </span>
        </span>
      ),
    );
  return (
    <>
      {partes.map((p, k) =>
        p.em ? (
          <em key={k}>{palabras(p.texto)}</em>
        ) : p.clase ? (
          <span key={k} className={p.clase}>
            {palabras(p.texto)}
          </span>
        ) : (
          <span key={k}>{palabras(p.texto)}</span>
        ),
      )}
    </>
  );
}

/** La escala de transportador del símbolo grande. */
const MARCAS: { x1: string; y1: string; x2: string; y2: string }[] = [];
for (let a = 60; a <= 300; a += 15) {
  const r = (a * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const r1 = a % 45 === 0 ? 26.2 : 27.3;
  MARCAS.push({
    x1: (32 + r1 * c).toFixed(2),
    y1: (32 + r1 * s).toFixed(2),
    x2: (32 + 29.6 * c).toFixed(2),
    y2: (32 + 29.6 * s).toFixed(2),
  });
}

function Mira({ ancho = 1.6 }: { ancho?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="6.2" strokeWidth={ancho} />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" strokeWidth={ancho} />
      <circle cx="12" cy="12" r="1.8" fill="#ff5a1f" stroke="none" />
    </svg>
  );
}

function Entrar({ t, sm = false }: { t: TextosPortadaV3; sm?: boolean }) {
  return (
    <a className={`cta epic${sm ? " sm" : ""}`} href="/cesvi" data-testid="entrar">
      <span className="fill" />
      <span className="t">
        {sm ? null : <small>{t.acceso}</small>}
        <b>{t.entrar}</b>
      </span>
      <span className="ic">
        <Mira ancho={sm ? 1.8 : 1.6} />
      </span>
    </a>
  );
}

export function PortadaV3({ t, tomas }: { t: TextosPortadaV3; tomas: TomaPortada[] }) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!raiz.current) return;
    return iniciarPortadaV3(raiz.current, {
      tomas,
      etiquetas: t.etiquetas,
      toast: { sketch: t.toastSketch, vuelta: t.toastVuelta, dato: t.toastDato },
      consola: t.consola,
    });
  }, [t, tomas]);
  const primera = tomas[0]!;
  const r = (d?: string): Estilo | undefined => (d ? ({ "--d": d } as Estilo) : undefined);
  const enlace = (id: string, hijos: ReactNode, clase?: string) => (
    <a className={clase} href={`#${id}`} data-go={id}>
      {hijos}
    </a>
  );
  return (
    <div
      ref={raiz}
      className={`pv3 ${FUENTES_PORTADA_V3}`}
      data-sheet="hecho"
      data-testid="portada-v3"
      lang={t.lang === "es" ? "es-MX" : "en"}
    >
      {/* símbolo: C de trayectoria + escala de transportador + punto de impacto */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <symbol id="mark" viewBox="0 0 64 64">
            <g
              className="ticks"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="butt"
              opacity=".55"
            >
              {MARCAS.map((m, k) => (
                <line key={k} {...m} />
              ))}
            </g>
            <path
              className="arc"
              d="M 46.86 45.38 A 20 20 0 1 1 46.86 18.62"
              fill="none"
              stroke="currentColor"
              strokeWidth="6.4"
            />
            <path
              d="M 43.14 41.94 A 15 15 0 1 1 43.14 22.06"
              fill="none"
              stroke="currentColor"
              strokeWidth=".9"
              opacity=".45"
              strokeDasharray="2.2 2.2"
            />
            <g className="tgt" stroke="#ff5a1f" fill="none">
              <circle cx="52" cy="32" r="4.3" strokeWidth="1.7" />
              <line x1="52" y1="23.6" x2="52" y2="26.4" strokeWidth="1.3" />
              <line x1="52" y1="37.6" x2="52" y2="40.4" strokeWidth="1.3" />
              <line x1="57.6" y1="32" x2="60.4" y2="32" strokeWidth="1.3" />
              <circle cx="52" cy="32" r="1.2" fill="#ff5a1f" stroke="none" />
            </g>
            <circle
              className="ring"
              cx="52"
              cy="32"
              r="4.3"
              fill="none"
              stroke="#ff5a1f"
              strokeWidth=".8"
            />
          </symbol>
          <symbol id="mark-sm" viewBox="0 0 64 64">
            <path
              d="M 46.86 45.38 A 20 20 0 1 1 46.86 18.62"
              fill="none"
              stroke="currentColor"
              strokeWidth="7"
            />
            <path
              d="M 44 42 A 14.5 14.5 0 1 1 44 22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              opacity=".45"
              strokeDasharray="2.6 2.6"
            />
            <g stroke="#ff5a1f" fill="none">
              <circle cx="52" cy="32" r="4.6" strokeWidth="2.2" />
              <line x1="52" y1="22.5" x2="52" y2="25.8" strokeWidth="2" />
              <line x1="52" y1="38.2" x2="52" y2="41.5" strokeWidth="2" />
              <line x1="58.2" y1="32" x2="61.5" y2="32" strokeWidth="2" />
              <circle cx="52" cy="32" r="1.5" fill="#ff5a1f" stroke="none" />
            </g>
          </symbol>
        </defs>
      </svg>

      <div id="intro" role="status" aria-live="polite">
        <div className="intro-in">
          <svg
            className="mk"
            viewBox="0 0 64 64"
            aria-hidden="true"
            style={{ color: "var(--chalk)" }}
          >
            <use href="#mark" />
          </svg>
          <div className="intro-word" aria-label="Croquis">
            Croquis
          </div>
          <div className="intro-meta">{t.marca}</div>
        </div>
      </div>

      <div id="wipe" aria-hidden="true">
        <div className="bars">
          {Array.from({ length: 7 }, (_, k) => (
            <i key={k} />
          ))}
        </div>
        <div className="mid">
          <svg className="mk" viewBox="0 0 64 64" style={{ color: "var(--chalk)" }}>
            <use href="#mark" />
          </svg>
          <p id="wipeLabel">{t.etiquetas.hecho}</p>
        </div>
      </div>

      <div id="film" aria-hidden="true">
        <div id="scan" />
        <video id="vA" muted playsInline loop preload="none" poster={primera.poster} />
        <video id="vB" muted playsInline loop preload="none" />
      </div>
      <div id="grain" aria-hidden="true" />
      <div id="veil" aria-hidden="true" />
      <div id="heroShade" aria-hidden="true" />

      <div id="toast" role="status" aria-live="polite" />
      <div id="cursor" aria-hidden="true">
        <div className="ring" />
        <div className="dot" />
      </div>
      <header id="top">
        <div id="progress" />
        <a className="brand" href="#hecho" data-go="hecho" aria-label="Croquis">
          <svg viewBox="0 0 64 64" aria-hidden="true" style={{ color: "var(--chalk)" }}>
            <use href="#mark-sm" />
          </svg>
          <span>
            <span className="wordmark">Croquis</span>
            <small>{t.marca}</small>
          </span>
        </a>
        <nav aria-label={t.lang === "es" ? "Hojas del expediente" : "Case file sheets"}>
          {t.nav.map(([id, nombre]) => (
            <a key={id} href={`#${id}`} data-go={id}>
              {nombre}
            </a>
          ))}
        </nav>
        <Entrar t={t} sm />
      </header>

      <main>
        <section
          className="sheet"
          id="hecho"
          data-sheet="hecho"
          data-label={t.etiquetas.hecho}
          data-n="01"
        >
          <div className="wrap hero">
            <span className="eyebrow" data-r="up">
              <span className="dot" />
              <span data-decode>{t.eyebrow}</span>
            </span>
            <h1 className="h1">
              <span className="l1">{t.h1[0]}</span>
              <span className="l2 split">
                <Partido partes={[{ texto: t.h1[1]!, em: true }, { texto: t.h1[2]! }]} />
              </span>
            </h1>
            <div className="h-row">
              <p className="lede" data-r="focus" style={r(".35s")}>
                {t.lede}
              </p>
              <div className="actions" data-r="up" style={r(".55s")}>
                <Entrar t={t} />
                {enlace("metodo", t.como, "cta ghost")}
              </div>
            </div>
          </div>
          <div className="wrap h-foot" data-r="focus" style={r(".8s")}>
            <div className="proof">
              {t.proof.map((p) => (
                <span key={p}>{p}</span>
              ))}
            </div>
            <div className="foot-links">
              {enlace(
                "significado",
                <>
                  <span className="glyph" aria-hidden="true">
                    C
                  </span>
                  {t.significa}
                </>,
                "means",
              )}
              {enlace(
                "problema",
                <>
                  {t.abrir}
                  <i />
                </>,
                "scroll",
              )}
            </div>
          </div>
        </section>

        <section
          className="sheet"
          id="problema"
          data-sheet="problema"
          data-label={t.etiquetas.problema}
          data-n="02"
        >
          <div className="wrap">
            <h2 className="h2 split">
              <Partido
                partes={[{ texto: `${t.problemaH[0]} ` }, { texto: t.problemaH[1]!, clase: "lt" }]}
              />
            </h2>
            <div className="frags" id="frags">
              {t.frags.map((f) => (
                <article key={f.h} className="frag">
                  <div className="tool">
                    <b data-decode>{f.tool}</b>
                    <span>{f.que}</span>
                  </div>
                  <h3>{f.h}</h3>
                  <p>{f.p}</p>
                  {f.fault.tipo === "captura" ? (
                    // Ilustración de un error de captura (un dígito transpuesto), no un resultado.
                    <span className="fault" data-ilustracion="error-de-captura">
                      <s>{f.fault.antes}</s> → {f.fault.despues}
                    </span>
                  ) : (
                    <span className="fault">{f.fault.texto}</span>
                  )}
                </article>
              ))}
            </div>
            <p className="joint" data-r="focus">
              {t.junta[0]}
              <strong>{t.junta[1]}</strong>
              {t.junta[2]}
            </p>
          </div>
        </section>

        <section
          className="sheet"
          id="prueba"
          data-sheet="prueba"
          data-label={t.etiquetas.prueba}
          data-n="03"
        >
          <div className="wrap">
            <div className="col">
              <h2 className="h2 split">
                <Partido
                  partes={[{ texto: `${t.pruebaH[0]} ` }, { texto: t.pruebaH[1]!, clase: "lt" }]}
                />
              </h2>
              <p className="case" data-r="focus">
                <b data-decode>{t.caso}</b>
                {t.casoResto}
              </p>
              <div className="tablebox" data-watch data-testid="tabla-axa">
                <table>
                  <thead>
                    <tr>
                      {t.cols.map((c) => (
                        <th key={c} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.filas.map((f, k) => (
                      <tr key={f.k} style={{ "--i": k } as Estilo}>
                        <th scope="row">{f.k}</th>
                        <td>{f.cesvi}</td>
                        <td className="c">{f.croquis}</td>
                        <td className={`d${f.ok ? " ok" : ""}`}>
                          {f.chip ? <span className="chip">{f.dif}</span> : f.dif}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="foot" data-r="focus" style={r(".6s")}>
                {t.nota}
              </p>
            </div>
            <div className="figs">
              {t.cifras.map(([n, p], k) => (
                <div key={p} className="fig" data-r="up" style={r(k ? ".15s" : undefined)}>
                  <div className="n" data-count={n} data-testid={`cifra-${k}`}>
                    {n}
                  </div>
                  <p>{p}</p>
                </div>
              ))}
              <div className="versus" data-watch role="img" aria-label={t.versus.aria}>
                {(
                  [
                    [t.versus.croquis, t.cifraModalidad, ""],
                    [t.versus.regla, t.cifraRegla, " base"],
                  ] as const
                ).map(([nombre, v, clase]) => (
                  <div key={nombre} className={`row${clase}`}>
                    <span>{nombre}</span>
                    <div className="track">
                      <div className="fill" style={{ "--v": v } as Estilo} />
                    </div>
                    <b>
                      <span data-count={v} data-dec="1">
                        {v.toFixed(1)}
                      </span>{" "}
                      %
                    </b>
                  </div>
                ))}
                <p className="foot">{t.versus.nota}</p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="sheet"
          id="metodo"
          data-sheet="metodo"
          data-label={t.etiquetas.metodo}
          data-n="04"
        >
          <div className="wrap">
            <div style={{ display: "grid", gap: 26 }}>
              <h2 className="h2 split">
                <Partido
                  partes={[{ texto: `${t.metodoH[0]} ` }, { texto: t.metodoH[1]!, clase: "lt" }]}
                />
              </h2>
            </div>
            <div className="steps">
              <div className="step" data-r="up">
                <div className="k">
                  <b>1</b>
                  {t.pasos[0]!.k}
                </div>
                <h3>{t.pasos[0]!.h}</h3>
                <p>{t.pasos[0]!.p}</p>
                <div data-watch className="specimen" data-scan>
                  <p className="narr">
                    {t.narracion.map((x, k) =>
                      x.marca ? <mark key={k}>{x.texto}</mark> : x.texto,
                    )}
                  </p>
                  <p className="found" data-detectado={t.detectado}>
                    {t.marcas.map((m) => (
                      <span key={m}>{m}</span>
                    ))}
                  </p>
                </div>
              </div>
              <div className="step" data-r="up">
                <div className="k">
                  <b>2</b>
                  {t.pasos[1]!.k}
                </div>
                <h3>{t.pasos[1]!.h}</h3>
                <p>{t.pasos[1]!.p}</p>
                <div data-watch className="specimen">
                  <dl className="coord">
                    {t.coord.map(([dt, dd], k) => (
                      <div key={dt} style={{ display: "contents" }}>
                        <dt>{dt}</dt>
                        <dd className={k === 0 ? "hl" : undefined}>{dd}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
              <div className="step" data-r="up">
                <div className="k">
                  <b>3</b>
                  {t.pasos[2]!.k}
                </div>
                <h3>{t.pasos[2]!.h}</h3>
                <p>{t.pasos[2]!.p}</p>
                <div data-watch className="specimen dict" aria-label={t.dict.aria}>
                  <span className="lab" data-decode>
                    {t.dict.lab}
                  </span>
                  <span className="v">
                    <span data-count={t.cifraRestos} data-dec="2">
                      {t.cifraRestos.toFixed(2)}
                    </span>
                    <small>km/h</small>
                  </span>
                  <div className="src">
                    {t.dict.src.map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </div>
                  <div className="sign">
                    <span>{t.dict.valido}</span>
                    <i />
                    <span className="ok">{t.dict.perito}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="tenets">
              {t.tenets.map((x) => (
                <div key={x.h} className="tenet" data-r="up">
                  <h3 className="split">
                    <Partido partes={[{ texto: x.h }]} />
                  </h3>
                  <p>{x.p}</p>
                  <span className="tags">{x.tags}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="sheet"
          id="preguntas"
          data-sheet="preguntas"
          data-label={t.etiquetas.preguntas}
          data-n="05"
        >
          <div className="wrap">
            <div style={{ display: "grid", gap: 26, alignContent: "start" }}>
              <h2 className="h2 split">
                <Partido
                  partes={[
                    { texto: `${t.preguntasH[0]} ` },
                    { texto: t.preguntasH[1]!, clase: "lt" },
                  ]}
                />
              </h2>
            </div>
            <div className="faq">
              {t.faq.map(([q, a], k) => (
                <details key={q} data-r="up" open={k === 0}>
                  <summary>{q}</summary>
                  <div className="ans">
                    <p>{a}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section
          className="sheet"
          id="significado"
          data-sheet="preguntas"
          data-label={t.etiquetas.significado}
          data-n="06"
        >
          <div className="wrap acro-wrap">
            <div className="acro-head">
              <h2 className="h2 split">
                <Partido
                  partes={[{ texto: `${t.acroH[0]} ` }, { texto: t.acroH[1]!, clase: "lt" }]}
                />
              </h2>
              <div className="acro-side" data-r="focus">
                <p>{t.acroP}</p>
                <button className="acro-all" id="acroAll" type="button" aria-pressed="false">
                  <span className="on-t">{t.descifrar}</span>
                  <span className="off-t">{t.cerrar}</span>
                </button>
              </div>
            </div>
            <ol className="acro" id="acro" data-watch>
              {t.acro.map(([letra, palabra, p], k) => (
                <li key={letra}>
                  <button
                    className="L"
                    type="button"
                    aria-expanded="false"
                    aria-controls={`m${k}`}
                    style={{ "--i": k } as Estilo}
                  >
                    <span className="ch" style={{ "--i": k } as Estilo}>
                      {letra}
                    </span>
                    <span className="sr">{t.verSignificado}</span>
                  </button>
                  <div className="m" id={`m${k}`}>
                    <div>
                      <b>{palabra}</b>
                      <p>{p}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <p className="acro-en" data-r="focus">
              <span>{t.acroEn[0]}</span>
              {t.acroEn[1]}
            </p>
          </div>
        </section>

        <section
          className="sheet"
          id="cierre"
          data-sheet="preguntas"
          data-label={t.etiquetas.cierre}
          data-n="06"
        >
          <div className="wrap close">
            <h2 className="h2 split">
              <Partido
                partes={[{ texto: `${t.cierreH[0]} ` }, { texto: t.cierreH[1]!, clase: "lt" }]}
              />
            </h2>
            <div className="close-row" data-r="up" style={r(".3s")}>
              <div className="actions">
                <Entrar t={t} />
                {enlace("metodo", t.como, "cta ghost")}
              </div>
            </div>
            <p className="credits">
              {t.creditos} <a href={t.publico}>{t.anterior}</a> ·{" "}
              <a href={t.otroIdioma.href} hrefLang={t.lang === "es" ? "en" : "es-MX"}>
                {t.otroIdioma.texto}
              </a>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
