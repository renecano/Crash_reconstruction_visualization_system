/**
 * La portada de Croquis para los peritos de CESVI (comentario de René, 2026-10-24, punto 4), según
 * `docs/cesvi/rediseno/Portada.html`: su estructura y sus textos, con la tipografía y los colores
 * del sistema de diseño. Todas las cifras llegan en `datos` (`lib/portada-cesvi.ts`), calculadas al
 * compilar desde `eval/results`, `data/` y el caso de AXA; aquí no se escribe ningún número.
 *
 * La animación del encabezado es la reconstrucción de AXA vista desde arriba: las trayectorias se
 * dibujan y los vehículos se encuentran en la X naranja; con «reducir movimiento» se ve quieta.
 */
import Link from "next/link";
import type { Lang } from "@/i18n";
import type { DatosPortadaCesvi, TrazoPortada } from "@/lib/portada-cesvi";
import { Aparecer } from "./aparecer";

const REPO = "https://github.com/renecano/Crash_reconstruction_visualization_system";

const COLOR: Record<string, string> = {
  V1: "var(--marca-vehiculo-a)",
  V2: "var(--marca-vehiculo-b)",
};

function textos(lang: Lang, d: DatosPortadaCesvi) {
  const n = (x: number, dec = 2) =>
    x.toLocaleString(lang === "es" ? "es-MX" : "en-US", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  const pct = (x: number) => `${x > 0.005 ? "+" : ""}${n(Math.abs(x) < 0.005 ? 0 : x)} %`;
  const entero = (x: number) => x.toLocaleString(lang === "es" ? "es-MX" : "en-US");
  const a = d.axa;
  const igualRestos = Math.abs(a.restos.pct) < 0.005;
  if (lang === "en")
    return {
      inicio: "/en",
      publico: "/en/publico",
      nav: ["The problem", "The proof", "How it works", "Questions"],
      entrar: "Enter Croquis",
      sello: "Made for CESVI México's crash experts",
      titulo: ["Reconstruct the crash.", "Defend", " the report."],
      subtitulo:
        "Narrate the crash in your technical language. Croquis places it on the real site, reconstructs it with verifiable physics and builds your report, with the source of every number.",
      verReporte: "See their report reconstructed",
      checks: [
        `Built with ${entero(d.reportes)} CESVI reports`,
        "Every number with its source",
        "The report always belongs to the expert",
      ],
      tarjetaRestos: [
        `Debris speed · AXA ${a.id}`,
        `${n(a.restos.croquis)} km/h`,
        igualRestos ? "Same as CESVI's report" : pct(a.restos.pct),
      ],
      tarjetaDictamen: ["Report", "Ready to sign", "source · method · validated"],
      aria: `Reconstruction of case ${a.id} seen from above: the two vehicles meet at the orange X`,
      problemaK: "The problem",
      problemaT: "Today a report is assembled from loose pieces.",
      problemas: [
        [
          "The sketch, by hand",
          "Positions, distances and trajectories drawn separately, without the real site underneath.",
        ],
        [
          "The calculations, on another sheet",
          "McHenry, displacement and braking typed by hand; one miscopied digit changes the conclusion.",
        ],
        [
          "The report, from scratch",
          "Written by copying from everything above, with no trace of where each number came from.",
        ],
      ],
      une: ["Croquis joins it into ", "a single flow", ", from the narrative to the signature."],
      pruebaK: "The proof",
      pruebaT: ["We took one of their reports.", "Croquis reached the same result."],
      pruebaP: `AXA ${a.id}, a ${a.modalidad.cesvi === "alcance" ? "rear-end collision" : a.modalidad.cesvi} in ${a.lugar}. Same data, same method.`,
      cols: ["", "CESVI report", "Croquis", "Difference"],
      filas: [
        [
          "Collision type",
          a.modalidad.cesvi === "alcance" ? "Rear-end" : a.modalidad.cesvi,
          a.modalidad.croquis === "alcance" ? "Rear-end" : (a.modalidad.croquis ?? "—"),
          a.modalidad.croquis === a.modalidad.cesvi ? "Matches" : "Differs",
        ],
        ["Speed from debris", n(a.restos.cesvi), n(a.restos.croquis), pct(a.restos.pct)],
        [
          "Speed from crush",
          n(a.deformacion.cesvi),
          n(a.deformacion.croquis),
          pct(a.deformacion.pct),
        ],
      ],
      nota: `km/h. The ${n(Math.abs(a.deformacion.pct))} % difference comes from the data printed in the report; Croquis shows it instead of hiding it.`,
      cifras: [
        [entero(d.reportes), "CESVI reports studied to build it"],
        [entero(d.aCiegas), "reconstructed blind, without seeing their conclusions"],
        [
          `${n(d.modalidadPct, 1)} %`,
          `correct collision types, against ${n(d.reglaPct, 1)} % for a simple rule`,
        ],
      ],
      verTodos: `See the ${entero(d.aCiegas)} reports, including where it fails ›`,
      comoK: "How it works",
      comoT: "Narrate. Place. Reconstruct.",
      pasos: [
        [
          "Narrate as always",
          "Croquis understands collision type, contact zones and debris, and only asks what is missing.",
        ],
        [
          "Mark the impact",
          "On the real map. Croquis proposes where each vehicle was; you only adjust.",
        ],
        [
          "Sign the report",
          "Speeds with their range, verification with CESVI's method and the document in PDF or Word.",
        ],
      ],
      ejemploRestos: [
        "Speed from debris",
        `${n(a.restos.croquis)} km/h`,
        igualRestos ? "same as the report" : pct(a.restos.pct),
      ],
      principios: [
        [
          "Nothing is invented.",
          "Every datum says whether it comes from the expert, the report or an assumption. What is missing is asked.",
        ],
        [
          "It always gives the same result.",
          "The same case produces the same result, with its input fingerprint to repeat it.",
        ],
        [
          "The signature is yours.",
          "Croquis reconstructs and suggests. The expert reviews, decides and validates the report.",
        ],
      ],
      preguntasK: "Questions from experts",
      preguntas: [
        [
          "Does it replace the expert?",
          "No. It organizes, calculates and documents; the conclusion and the signature belong to the expert.",
        ],
        [
          "Does it use CESVI's method?",
          "Yes: McHenry, EBS, displacement, braking and momentum, with the substituted formula, next to the physical reconstruction.",
        ],
        [
          "Can I load a report I already have?",
          "Yes, in PDF or text. Croquis reads it, cites where each datum comes from and leaves it ready to reconstruct.",
        ],
      ],
      cierreT: "Your next case, reconstructed.",
      cierreP: "Nothing to install. It works in the browser.",
      pie: "Support reconstruction: the report belongs to the expert. Streets © OpenStreetMap contributors (ODbL).",
      enlaces: [
        ["How it is measured", "/en/recorrido"],
        ["Public version", "/en/publico"],
        ["Español", "/"],
        ["Code (MIT)", REPO],
      ],
    };
  return {
    inicio: "/",
    publico: "/publico",
    nav: ["El problema", "La prueba", "Cómo funciona", "Preguntas"],
    entrar: "Entrar a Croquis",
    sello: "Hecho para los peritos de CESVI México",
    titulo: ["Reconstruye el hecho.", "Defiende", " el dictamen."],
    subtitulo:
      "Narra el choque con tu lenguaje técnico. Croquis lo ubica en el lugar real, lo reconstruye con física verificable y arma tu dictamen, con la fuente de cada número.",
    verReporte: "Ver su reporte reconstruido",
    checks: [
      `Construido con ${entero(d.reportes)} reportes de CESVI`,
      "Cada número con su fuente",
      "El dictamen siempre es del perito",
    ],
    tarjetaRestos: [
      `Velocidad por restos · AXA ${a.id}`,
      `${n(a.restos.croquis)} km/h`,
      igualRestos ? "Igual al reporte de CESVI" : pct(a.restos.pct),
    ],
    tarjetaDictamen: ["Dictamen", "Listo para firmar", "fuente · método · validó"],
    aria: `Reconstrucción del caso ${a.id} vista desde arriba: los dos vehículos se encuentran en la X naranja`,
    problemaK: "El problema",
    problemaT: "Hoy un dictamen se arma con piezas sueltas.",
    problemas: [
      [
        "El croquis, a mano",
        "Posiciones, distancias y trayectorias dibujadas aparte, sin el lugar real debajo.",
      ],
      [
        "Los cálculos, en otra hoja",
        "McHenry, desplazamiento y frenado se capturan a mano; un dígito mal copiado cambia la conclusión.",
      ],
      [
        "El dictamen, desde cero",
        "Se redacta copiando de todo lo anterior, sin una traza de dónde salió cada número.",
      ],
    ],
    une: ["Croquis lo une en ", "un solo flujo", ", del relato a la firma."],
    pruebaK: "La prueba",
    pruebaT: ["Tomamos uno de sus reportes.", "Croquis llegó a lo mismo."],
    pruebaP: `AXA ${a.id}, un ${a.modalidad.cesvi} en ${a.lugar}. Mismos datos, mismo método.`,
    cols: ["", "Reporte de CESVI", "Croquis", "Diferencia"],
    filas: [
      [
        "Modalidad",
        mayus(a.modalidad.cesvi),
        mayus(a.modalidad.croquis ?? "—"),
        a.modalidad.croquis === a.modalidad.cesvi ? "Coincide" : "Difiere",
      ],
      ["Velocidad por restos", n(a.restos.cesvi), n(a.restos.croquis), pct(a.restos.pct)],
      [
        "Velocidad por deformación",
        n(a.deformacion.cesvi),
        n(a.deformacion.croquis),
        pct(a.deformacion.pct),
      ],
    ],
    nota: `km/h. La diferencia de ${n(Math.abs(a.deformacion.pct))} % viene de los datos impresos en el reporte; Croquis la muestra en lugar de esconderla.`,
    cifras: [
      [entero(d.reportes), "reportes de CESVI estudiados para construirlo"],
      [entero(d.aCiegas), "reconstruidos a ciegas, sin ver sus conclusiones"],
      [
        `${n(d.modalidadPct, 1)} %`,
        `de modalidades correctas, contra ${n(d.reglaPct, 1)} % de una regla simple`,
      ],
    ],
    verTodos: `Ver los ${entero(d.aCiegas)} reportes, también donde falla ›`,
    comoK: "Cómo funciona",
    comoT: "Narra. Ubica. Reconstruye.",
    pasos: [
      [
        "Narra como siempre",
        "Croquis entiende modalidad, zonas de contacto y restos, y solo pregunta lo que falta.",
      ],
      [
        "Marca el impacto",
        "Sobre el mapa real. Croquis propone dónde iba cada vehículo; tú solo ajustas.",
      ],
      [
        "Firma el dictamen",
        "Velocidades con su rango, verificación con el método de CESVI y el documento en PDF o Word.",
      ],
    ],
    ejemploRestos: [
      "Velocidad por restos",
      `${n(a.restos.croquis)} km/h`,
      igualRestos ? "igual al reporte" : pct(a.restos.pct),
    ],
    principios: [
      [
        "Nada se inventa.",
        "Cada dato dice si viene del perito, del reporte o de un supuesto. Lo que falta, se pregunta.",
      ],
      [
        "Siempre da lo mismo.",
        "El mismo caso produce el mismo resultado, con su huella de entradas para repetirlo.",
      ],
      [
        "La firma es tuya.",
        "Croquis reconstruye y sugiere. El perito revisa, decide y valida el dictamen.",
      ],
    ],
    preguntasK: "Preguntas de peritos",
    preguntas: [
      [
        "¿Reemplaza al perito?",
        "No. Ordena, calcula y documenta; la conclusión y la firma son del perito.",
      ],
      [
        "¿Usa el método de CESVI?",
        "Sí: McHenry, EBS, desplazamiento, frenado y cantidad de movimiento, con la fórmula sustituida, al lado de la reconstrucción física.",
      ],
      [
        "¿Puedo cargar un reporte que ya tengo?",
        "Sí, en PDF o texto. Croquis lo lee, cita de dónde sale cada dato y lo deja listo para reconstruir.",
      ],
    ],
    cierreT: "Tu próximo caso, reconstruido.",
    cierreP: "Sin instalar nada. Funciona en el navegador.",
    pie: "Reconstrucción de apoyo: el dictamen es del perito. Calles © colaboradores de OpenStreetMap (ODbL).",
    enlaces: [
      ["Cómo se mide", "/recorrido"],
      ["Versión para el público", "/publico"],
      ["English", "/en"],
      ["Código (MIT)", REPO],
    ],
  };
}

const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const ruta = (pts: [number, number][]) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

/** La reconstrucción de AXA vista desde arriba, con sus trayectorias y la X del impacto. */
function Escena({ d, aria }: { d: DatosPortadaCesvi["escena"]; aria: string }) {
  const { calle } = d;
  const [ix, iy] = d.impacto;
  const caja = (t: TrazoPortada) => (
    <rect
      key={`caja-${t.vehiculo}`}
      className="pc-llega"
      x={t.caja.x - t.caja.largo / 2}
      y={t.caja.y - t.caja.ancho / 2}
      width={t.caja.largo}
      height={t.caja.ancho}
      rx={4}
      fill={COLOR[t.vehiculo] ?? "var(--marca-blanco)"}
      transform={`rotate(${t.caja.giro.toFixed(2)} ${t.caja.x.toFixed(1)} ${t.caja.y.toFixed(1)})`}
    />
  );
  return (
    <svg
      viewBox="0 0 1240 590"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={aria}
      className="absolute inset-0 h-full w-full"
      data-testid="escena-portada"
    >
      <defs>
        <pattern id="pc-rejilla" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0 L0 0 0 40" fill="none" stroke="#101217" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="1240" height="590" fill="url(#pc-rejilla)" />
      <rect x="0" y={calle.y - calle.alto / 2} width="1240" height={calle.alto} fill="#15171C" />
      <line
        x1="0"
        x2="1240"
        y1={calle.y}
        y2={calle.y}
        stroke="#353A42"
        strokeWidth="2"
        strokeDasharray="24 30"
      />
      {d.trazos.map((t) => (
        <path
          key={`antes-${t.vehiculo}`}
          className="pc-trazo"
          pathLength={700}
          d={ruta(t.antes)}
          stroke={COLOR[t.vehiculo] ?? "var(--marca-blanco)"}
          strokeWidth={5}
          strokeLinecap="round"
          fill="none"
          opacity={0.9}
        />
      ))}
      {d.trazos.map((t) => (
        <path
          key={`despues-${t.vehiculo}`}
          className="pc-despues"
          d={ruta(t.despues)}
          stroke={COLOR[t.vehiculo] ?? "var(--marca-blanco)"}
          strokeWidth={3}
          strokeDasharray="2 9"
          strokeLinecap="round"
          fill="none"
        />
      ))}
      {d.trazos.map(caja)}
      <circle className="pc-onda" cx={ix} cy={iy} r={10} fill="none" stroke="var(--marca-senal)" />
      <g className="pc-golpe">
        <path
          d={`M${ix - 16} ${iy - 16} L${ix + 16} ${iy + 16} M${ix + 16} ${iy - 16} L${ix - 16} ${iy + 16}`}
          stroke="var(--marca-senal)"
          strokeWidth={7}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export function PortadaCesvi({ lang, datos }: { lang: Lang; datos: DatosPortadaCesvi }) {
  const t = textos(lang, datos);
  const anclas = ["problema", "prueba", "como", "preguntas"];
  const boton =
    "inline-flex items-center justify-center rounded-full bg-[var(--marca-blanco)] font-semibold text-[var(--marca-grafito)] transition-opacity hover:opacity-90";
  return (
    <div className="portada-cesvi min-h-screen bg-black text-[var(--marca-blanco)]">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-white/[0.06] bg-black/70 px-4 backdrop-blur-xl md:px-[max(24px,calc(50%-620px))]">
        <Link href={t.inicio} className="flex items-center gap-2.5 text-[var(--marca-blanco)]">
          <svg viewBox="0 0 120 120" width="22" height="22" aria-hidden="true">
            <path
              d="M91.11 28.89 A44 44 0 1 0 91.11 91.11"
              fill="none"
              stroke="var(--marca-blanco)"
              strokeWidth="13"
              strokeDasharray="52 25.6"
            />
            <path
              d="M91 51 L109 69 M109 51 L91 69"
              stroke="var(--marca-senal)"
              strokeWidth="7"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[13px] font-semibold tracking-[0.16em]">CROQUIS</span>
        </Link>
        <nav aria-label="Principal" className="hidden gap-7 text-[13px] md:flex">
          {t.nav.map((n, i) => (
            <a
              key={n}
              href={`#${anclas[i]}`}
              className="text-[var(--marca-gris)] hover:text-[var(--marca-blanco)]"
            >
              {n}
            </a>
          ))}
        </nav>
        <Link href="/cesvi" className={`${boton} h-8 px-4 text-[13px]`} data-testid="nav-entrar">
          {t.entrar}
        </Link>
      </header>

      <main id="contenido">
        {/* Encabezado */}
        <section className="relative flex flex-col items-center overflow-hidden px-4 pt-20 text-center md:px-6 md:pt-28">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[420px] left-1/2 h-[700px] w-[1100px] max-w-none -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(255,91,46,0.22),rgba(255,91,46,0)_70%)]"
          />
          <span className="relative inline-flex h-8 items-center gap-2.5 rounded-full border border-white/[0.12] px-3.5 text-[13px] font-medium text-[#C9CDD4]">
            <span className="h-2 w-2 rounded-full bg-[var(--marca-senal)]" />
            {t.sello}
          </span>
          <h1 className="relative mt-7 max-w-[1200px] text-[clamp(44px,8.4vw,128px)] leading-[0.94] font-extrabold tracking-[-0.055em]">
            {t.titulo[0]}
            <br />
            <span className="text-[var(--marca-senal)]">{t.titulo[1]}</span>
            {t.titulo[2]}
          </h1>
          <p className="relative mt-7 max-w-[700px] text-[clamp(17px,2.2vw,22px)] leading-[1.45] text-[var(--marca-gris)]">
            {t.subtitulo}
          </p>
          <div className="relative mt-9 flex flex-wrap justify-center gap-3.5">
            <Link href="/cesvi" className={`${boton} h-14 px-8 text-lg`} data-testid="cta-apertura">
              {t.entrar}
            </Link>
            <Link
              href="/cesvi/casos/a2010930"
              className="inline-flex h-14 items-center rounded-full border border-white/[0.18] px-6 text-lg font-medium text-[var(--marca-blanco)] hover:bg-white/[0.04]"
              data-testid="ver-reporte"
            >
              {t.verReporte}
            </Link>
          </div>
          <div className="relative mt-7 flex flex-wrap justify-center gap-x-7 gap-y-2 text-sm font-medium text-[var(--marca-gris-oscuro)]">
            {t.checks.map((c) => (
              <span key={c}>✓ {c}</span>
            ))}
          </div>
          <div className="relative mt-16 aspect-[1.4/1] w-full max-w-[1240px] overflow-hidden rounded-t-[24px] border border-b-0 border-[#16181C] bg-[#060709] md:aspect-[2.1/1] md:rounded-t-[32px]">
            <Escena d={datos.escena} aria={t.aria} />
            <div className="pc-tarjeta absolute top-[8%] left-[4%] hidden rounded-2xl border border-white/[0.08] bg-[rgba(21,23,28,0.78)] px-4 py-3 text-left backdrop-blur-xl sm:block">
              <p className="text-xs text-[var(--marca-gris)]">{t.tarjetaRestos[0]}</p>
              <p className="cifras mt-1 text-2xl font-semibold" data-testid="tarjeta-restos">
                {t.tarjetaRestos[1]}
              </p>
              <p className="mt-1 text-xs text-[var(--marca-senal)]">{t.tarjetaRestos[2]}</p>
            </div>
            <div className="pc-tarjeta absolute right-[4%] bottom-[10%] hidden rounded-2xl border border-white/[0.08] bg-[rgba(21,23,28,0.78)] px-4 py-3 text-left backdrop-blur-xl sm:block">
              <p className="text-xs text-[var(--marca-gris)]">{t.tarjetaDictamen[0]}</p>
              <p className="mt-1 text-lg font-semibold">{t.tarjetaDictamen[1]}</p>
              <p className="mt-1 text-xs text-[var(--marca-gris-oscuro)]">{t.tarjetaDictamen[2]}</p>
            </div>
          </div>
        </section>

        {/* El problema */}
        <section
          id="problema"
          className="mx-auto max-w-[1240px] scroll-mt-16 px-4 py-24 md:px-6 md:py-32"
        >
          <Aparecer>
            <p className="text-sm font-semibold text-[var(--marca-senal)]">{t.problemaK}</p>
            <h2 className="mt-3 max-w-[820px] text-[clamp(32px,5vw,60px)] leading-[1.02] font-bold tracking-[-0.04em]">
              {t.problemaT}
            </h2>
          </Aparecer>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {t.problemas.map(([h, p], i) => (
              <Aparecer
                key={h}
                como="li"
                className="rounded-3xl border border-white/[0.08] bg-[#0B0C0F] p-6"
              >
                <span className="cifras text-sm text-[var(--marca-gris-oscuro)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-xl font-semibold">{h}</h3>
                <p className="mt-2 text-[var(--marca-gris)]">{p}</p>
              </Aparecer>
            ))}
          </ol>
          <Aparecer>
            <p className="mt-10 text-[clamp(20px,2.4vw,26px)] text-[var(--marca-gris)]">
              {t.une[0]}
              <b className="text-[var(--marca-blanco)]">{t.une[1]}</b>
              {t.une[2]}
            </p>
          </Aparecer>
        </section>

        {/* La prueba */}
        <section id="prueba" className="scroll-mt-16 border-y border-white/[0.06] bg-[#060709]">
          <div className="mx-auto max-w-[1240px] px-4 py-24 md:px-6 md:py-32">
            <Aparecer>
              <p className="text-sm font-semibold text-[var(--marca-senal)]">{t.pruebaK}</p>
              <h2 className="mt-3 max-w-[900px] text-[clamp(32px,5vw,60px)] leading-[1.02] font-bold tracking-[-0.04em]">
                {t.pruebaT[0]}
                <br />
                <span className="text-[var(--marca-gris)]">{t.pruebaT[1]}</span>
              </h2>
              <p className="mt-5 text-lg text-[var(--marca-gris)]">{t.pruebaP}</p>
            </Aparecer>
            <Aparecer className="mt-10 overflow-x-auto rounded-3xl border border-white/[0.08]">
              <table className="w-full min-w-[560px] text-left" data-testid="tabla-axa">
                <thead className="text-sm text-[var(--marca-gris-oscuro)]">
                  <tr>
                    {t.cols.map((c, i) => (
                      <th key={i} className={`px-5 py-4 font-medium ${i ? "text-right" : ""}`}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.filas.map((f) => (
                    <tr key={f[0]} className="border-t border-white/[0.06]">
                      <th className="px-5 py-4 font-medium">{f[0]}</th>
                      <td className="cifras px-5 py-4 text-right">{f[1]}</td>
                      <td className="cifras px-5 py-4 text-right font-semibold">{f[2]}</td>
                      <td className="cifras px-5 py-4 text-right text-[var(--marca-senal)]">
                        {f[3]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Aparecer>
            <p className="mt-4 text-sm text-[var(--marca-gris-oscuro)]">{t.nota}</p>
            <ul className="mt-14 grid gap-8 md:grid-cols-3">
              {t.cifras.map(([c, p]) => (
                <Aparecer key={p} como="li">
                  <p
                    className="cifras text-[clamp(44px,6vw,72px)] leading-none font-bold tracking-[-0.04em]"
                    data-testid="cifra-portada"
                  >
                    {c}
                  </p>
                  <p className="mt-3 text-[var(--marca-gris)]">{p}</p>
                </Aparecer>
              ))}
            </ul>
            <Link
              href="/cesvi/reproduccion"
              className="mt-10 inline-block font-medium text-[var(--marca-blanco)] underline-offset-4 hover:underline"
            >
              {t.verTodos}
            </Link>
          </div>
        </section>

        {/* Cómo funciona */}
        <section
          id="como"
          className="mx-auto max-w-[1240px] scroll-mt-16 px-4 py-24 md:px-6 md:py-32"
        >
          <Aparecer>
            <p className="text-sm font-semibold text-[var(--marca-senal)]">{t.comoK}</p>
            <h2 className="mt-3 text-[clamp(32px,5vw,60px)] leading-[1.02] font-bold tracking-[-0.04em]">
              {t.comoT}
            </h2>
          </Aparecer>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {t.pasos.map(([h, p], i) => (
              <Aparecer
                key={h}
                como="li"
                className="flex flex-col rounded-3xl border border-white/[0.08] bg-[#0B0C0F] p-6"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.14] text-sm font-semibold">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-xl font-semibold">{h}</h3>
                <p className="mt-2 text-[var(--marca-gris)]">{p}</p>
                <div className="mt-6 rounded-2xl border border-white/[0.06] bg-black p-4 text-sm">
                  {i === 0 ? (
                    <p className="text-[var(--marca-gris)]">{datos.axa.narracion}</p>
                  ) : i === 1 ? (
                    <div className="relative h-20 overflow-hidden rounded-xl bg-[#15171C]">
                      <span className="absolute inset-x-0 top-1/2 h-px border-t border-dashed border-[#353A42]" />
                      <span
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-bold text-[var(--marca-senal)]"
                        aria-hidden="true"
                      >
                        ✕
                      </span>
                    </div>
                  ) : (
                    <p>
                      <span className="text-[var(--marca-gris)]">{t.ejemploRestos[0]}</span>{" "}
                      <b className="cifras">{t.ejemploRestos[1]}</b>{" "}
                      <span className="text-[var(--marca-gris-oscuro)]">
                        · {t.ejemploRestos[2]}
                      </span>
                    </p>
                  )}
                </div>
              </Aparecer>
            ))}
          </ol>
          <div className="mt-20 grid gap-10 md:grid-cols-3">
            {t.principios.map(([h, p]) => (
              <Aparecer key={h}>
                <h3 className="text-[clamp(24px,3vw,34px)] leading-[1.05] font-bold tracking-[-0.03em]">
                  {h}
                </h3>
                <p className="mt-3 text-[var(--marca-gris)]">{p}</p>
              </Aparecer>
            ))}
          </div>
        </section>

        {/* Preguntas */}
        <section
          id="preguntas"
          className="mx-auto max-w-[900px] scroll-mt-16 px-4 pb-24 md:px-6 md:pb-32"
        >
          <Aparecer>
            <h2 className="text-[clamp(28px,4vw,44px)] font-bold tracking-[-0.03em]">
              {t.preguntasK}
            </h2>
          </Aparecer>
          <div className="mt-8 divide-y divide-white/[0.08] border-y border-white/[0.08]">
            {t.preguntas.map(([q, r], i) => (
              <details key={q} className="group py-5" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                  {q}
                  <span className="text-[var(--marca-gris)] group-open:hidden" aria-hidden="true">
                    +
                  </span>
                  <span
                    className="hidden text-[var(--marca-gris)] group-open:inline"
                    aria-hidden="true"
                  >
                    −
                  </span>
                </summary>
                <p className="mt-3 text-[var(--marca-gris)]">{r}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Cierre */}
        <section className="relative overflow-hidden border-t border-white/[0.06] px-4 py-28 text-center md:px-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-full left-1/2 h-[600px] w-[1000px] max-w-none -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgba(255,91,46,0.18),rgba(255,91,46,0)_70%)]"
          />
          <Aparecer className="relative">
            <h2 className="text-[clamp(36px,6vw,80px)] leading-[0.98] font-extrabold tracking-[-0.05em]">
              {t.cierreT}
            </h2>
            <Link
              href="/cesvi"
              className={`${boton} mt-10 h-14 px-8 text-lg`}
              data-testid="cta-cierre"
            >
              {t.entrar}
            </Link>
            <p className="mt-5 text-sm text-[var(--marca-gris-oscuro)]">{t.cierreP}</p>
          </Aparecer>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] px-4 py-8 text-sm text-[var(--marca-gris-oscuro)] md:px-[max(24px,calc(50%-620px))]">
        <p role="note">{t.pie}</p>
        <nav aria-label="Pie" className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {t.enlaces.map(([texto, href]) => (
            <a
              key={href}
              href={href}
              className="text-[var(--marca-gris)] hover:text-[var(--marca-blanco)]"
              data-testid={href?.endsWith("publico") ? "enlace-publico" : undefined}
            >
              {texto}
            </a>
          ))}
        </nav>
      </footer>
    </div>
  );
}
