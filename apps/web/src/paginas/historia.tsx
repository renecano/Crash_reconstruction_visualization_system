import Image from "next/image";
import Link from "next/link";
import { Legend } from "@/components/legend";
import { CroquisAMano } from "@/components/portada/croquis-a-mano";
import { Marco } from "@/components/sitio/marco";
import datos from "@/data/historia.json";
import { ruta, textos, textosEn, type Lang } from "@/i18n";
import { numero, ordinal, pct } from "@/lib/formato";

/** Las siete letras de C-R-O-Q-U-I-S y a dónde lleva cada una. */
const LETRAS = [
  { letra: "C", href: "/cuenta" },
  { letra: "R", href: "/cuenta" },
  { letra: "O", href: "/visor" },
  { letra: "Q", href: "/cuenta" },
  { letra: "U", href: "/croquis" },
  { letra: "I", href: "/recorrido" },
  { letra: "S", href: "/visor?escena=interseccion_toluca" },
] as const;

const T = textos(
  {
    titulo: "Cuenta. Reconoce. Ordena.",
    tarde: "Una tarde nublada en Toluca",
    tardeCuerpo:
      "Mariana es una persona ficticia. Maneja su Versa gris por Benito Juárez hacia el sur, en el segundo carril, como a 35. El semáforo está en verde. En el cruce con Venustiano Carranza un taxi blanco entra al cruce y le pega del lado de la puerta del chofer. Su auto se va de lado y queda en el carril de la derecha.",
    cruceAlt:
      "Reconstrucción ilustrativa del cruce de Benito Juárez y Venustiano Carranza en Toluca, vista desde arriba, con los dos autos después del impacto",
    contar: "Y luego hay que contarlo",
    contarCuerpo:
      "El ajustador pregunta a cuánto iba. El agente de tránsito, de dónde venía el taxi. En el ministerio público le piden que lo dibuje. Su familia quiere entender cómo quedó así la puerta. Mariana recuerda fragmentos: el verde, el golpe, el giro. Cada vez lo cuenta un poco distinto, y cada quien se imagina algo diferente.",
    raro: "No es un caso raro",
    raroCuerpo: (anio: number, total: string, vv: string, lugar: string, muertos: string) =>
      `En ${anio}, el INEGI registró ${total} hechos de tránsito en zonas urbanas y suburbanas de México. El ${vv} fueron colisiones con otro vehículo, como la de Mariana. El Estado de México fue el ${lugar} lugar del país en personas fallecidas en el lugar del accidente (${muertos}).`,
    serie: (a: number, b: number) => `Hechos de tránsito por año, ${a}–${b}`,
    serieAlt: (a: string, aa: number, b: string, bb: number) =>
      `Serie anual de hechos de tránsito, de ${a} en ${aa} a ${b} en ${bb}`,
    fuente: "Fuente:",
    abiertos: "descarga",
    resultado: "Resultado:",
    noBasta: "Un croquis a mano no basta. Una animación genérica, tampoco",
    noBasta1:
      "Un dibujo a mano no tiene escala ni física: ¿cabe ese giro a 35 km/h? Una animación hecha a ojo se ve convincente, pero no sale de lo que Mariana dijo, y nadie sabe qué parte es dato y qué parte es relleno.",
    noBasta2:
      "Croquis hace otra cosa. Cada dato sale de una frase del relato, o se marca como supuesto. La física decide el choque y su incertidumbre se reporta como rango. Cada pieza se mide contra casos reales.",
    manoAlt:
      "Croquis hecho a mano: dos calles que se cruzan, dos rectángulos con las letras A y B y flechas.",
    asi: "Así funciona",
    letras: [
      {
        palabra: "Cuenta",
        texto:
          "Lo dices con tus palabras, como se lo contarías a alguien. Croquis intenta tachar tus datos personales en tu propio dispositivo antes de que el texto salga (cuánto se le escapa está en el recorrido técnico, E1).",
        enlace: "Contar qué pasó",
      },
      {
        palabra: "Reconoce",
        texto:
          "La IA convierte tu relato en datos y marca de qué frase salió cada uno. Lo que no dijiste queda marcado como supuesto, y cada cita se verifica contra tu texto.",
        enlace: "Ver qué entiende",
      },
      {
        palabra: "Ordena",
        texto:
          "Arma la línea de tiempo: lo que pasó antes, el impacto y lo que pasó después, con las marcas en el piso en su lugar.",
        enlace: "Ver una línea de tiempo",
      },
      {
        palabra: "¿Qué falta?",
        texto:
          "Te pregunta solo lo que de verdad cambia el resultado, como mucho tres cosas por ronda.",
        enlace: "Probar las preguntas",
      },
      {
        palabra: "Ubica",
        texto:
          "Acomodas autos, personas y calles en el croquis, sobre una calle real de OpenStreetMap si quieres.",
        enlace: "Abrir el croquis",
      },
      {
        palabra: "Impacta",
        texto:
          "La física calcula el choque, la deformación y hacia dónde salió cada quien, con la rigidez medida en miles de pruebas de choque.",
        enlace: "Ver cómo se mide",
      },
      {
        palabra: "Simula",
        texto:
          "Lo ves pasar en 3D, desde cualquier ángulo y en cámara lenta, y comparas hipótesis: ¿y si iba a 50 en vez de 35?",
        enlace: "Ver la escena de Toluca",
      },
    ],
    danoAlt:
      "Reconstrucción ilustrativa del auto gris con la puerta del chofer hundida junto al taxi blanco",
    noEs: "Lo que Croquis no es",
    noEs1: "No es un peritaje: es una reconstrucción ilustrativa, y lo dice en cada imagen.",
    noEs2: "No decide quién tuvo la culpa: muestra lo que el relato y la física permiten.",
    noEs3: "No estima lesiones.",
    siguiente: "Siguiente",
    cuenta: "Cuenta qué pasó",
    demo: "Ver un ejemplo",
    toluca: "Ver la escena de Toluca",
    recorrido: "Cómo se mide",
    atribucion:
      "Las imágenes de Toluca contienen información de OpenStreetMap, disponible en openstreetmap.org bajo la Open Database License (ODbL).",
  },
  {
    titulo: "Tell. Recognize. Order.",
    tarde: "A cloudy afternoon in Toluca",
    tardeCuerpo:
      "Mariana is a fictional person. She drives her gray Versa south along Benito Juárez, in the second lane, at about 35. The light is green. At the intersection with Venustiano Carranza a white taxi enters the intersection and hits her on the driver's door side. Her car spins sideways and ends up in the right lane.",
    cruceAlt:
      "Illustrative reconstruction of the intersection of Benito Juárez and Venustiano Carranza in Toluca, seen from above, with both cars after the impact",
    contar: "And then she has to tell it",
    contarCuerpo:
      "The insurance adjuster asks how fast she was going. The traffic officer, where the taxi came from. At the prosecutor's office they ask her to draw it. Her family wants to understand how the door ended up like that. Mariana remembers fragments: the green light, the hit, the spin. Each time she tells it a little differently, and everyone imagines something different.",
    raro: "It is not a rare case",
    raroCuerpo: (anio: number, total: string, vv: string, lugar: string, muertos: string) =>
      `In ${anio}, INEGI recorded ${total} road traffic incidents in urban and suburban areas of Mexico. ${vv} were collisions with another vehicle, like Mariana's. The State of Mexico ranked ${lugar} in the country in people who died at the scene (${muertos}).`,
    serie: (a: number, b: number) => `Road traffic incidents per year, ${a}–${b}`,
    serieAlt: (a: string, aa: number, b: string, bb: number) =>
      `Annual series of road traffic incidents, from ${a} in ${aa} to ${b} in ${bb}`,
    fuente: "Source:",
    abiertos: "download",
    resultado: "Result:",
    noBasta: "A hand drawing is not enough. Neither is a generic animation",
    noBasta1:
      "A hand drawing has no scale and no physics: does that spin fit at 35 km/h? An animation made by eye looks convincing, but it does not come from what Mariana said, and no one knows which part is data and which part is filler.",
    noBasta2:
      "Croquis does something else. Every fact comes from a sentence of the narrative, or is marked as assumed. Physics decides the crash and its uncertainty is reported as a range. Every piece is measured against real cases.",
    manoAlt:
      "Hand-drawn sketch: two crossing streets, two rectangles with the letters A and B, and arrows.",
    asi: "How it works",
    letras: [
      {
        palabra: "Cuenta · Tell",
        texto:
          "You say it in your own words, the way you would tell someone. Croquis tries to strike out your personal data on your own device before the text leaves it (how much slips through is in the technical walkthrough, E1).",
        enlace: "Tell what happened",
      },
      {
        palabra: "Reconoce · Recognize",
        texto:
          "The AI turns your narrative into data and marks which sentence each fact came from. What you did not say is marked as assumed, and every quote is checked against your text.",
        enlace: "See what it understands",
      },
      {
        palabra: "Ordena · Order",
        texto:
          "It builds the timeline: what happened before, the impact and what happened after, with the marks on the road in their place.",
        enlace: "See a timeline",
      },
      {
        palabra: "¿Qué falta? · What's missing?",
        texto: "It only asks what really changes the result, at most three things per round.",
        enlace: "Try the questions",
      },
      {
        palabra: "Ubica · Place",
        texto:
          "You arrange cars, people and streets on the sketch, on a real OpenStreetMap street if you want.",
        enlace: "Open the sketch",
      },
      {
        palabra: "Impacta · Impact",
        texto:
          "Physics computes the crash, the deformation and where everyone ended up, with stiffness measured in thousands of crash tests.",
        enlace: "See how it is measured",
      },
      {
        palabra: "Simula · Simulate",
        texto:
          "You watch it happen in 3D, from any angle and in slow motion, and compare hypotheses: what if she was going 50 instead of 35?",
        enlace: "See the Toluca scene",
      },
    ],
    danoAlt:
      "Illustrative reconstruction of the gray car with the driver's door dented next to the white taxi",
    noEs: "What Croquis is not",
    noEs1:
      "It is not a forensic report: it is an illustrative reconstruction, and it says so on every image.",
    noEs2: "It does not decide who was at fault: it shows what the narrative and physics allow.",
    noEs3: "It does not estimate injuries.",
    siguiente: "Next",
    cuenta: "Tell what happened",
    demo: "See an example",
    toluca: "See the Toluca scene",
    recorrido: "How it is measured",
    atribucion:
      "The Toluca images contain information from OpenStreetMap, available at openstreetmap.org under the Open Database License (ODbL).",
  },
);

export default function HistoriaPage({ lang }: { lang: Lang }) {
  const t = textosEn(T, lang);
  const d = datos;
  const max = Math.max(...d.serie.map((s) => s.accidentes));
  const primero = d.serie[0]!;
  const ultimo = d.serie[d.serie.length - 1]!;
  const vv = pct(d.tipos[0]!.participacion, lang);
  return (
    <Marco lang={lang}>
      <div className="pagina flex flex-col gap-20 py-10 md:py-16">
        <header className="flex flex-col gap-4">
          <h1 className="t-lanzamiento max-w-[16ch]">{t.titulo}</h1>
          <p className="t-subtitulo text-texto-2">
            <span lang="en">Crash Reconstruction from Oral Queries Using Impact Simulation</span>
          </p>
        </header>

        <section aria-labelledby="h-tarde" className="grid gap-8 lg:grid-cols-12">
          <div className="carril flex flex-col gap-4 lg:col-span-5">
            <h2 id="h-tarde" className="t-titulo">
              {t.tarde}
            </h2>
            <p className="t-cuerpo text-texto-2">{t.tardeCuerpo}</p>
          </div>
          <Image
            src="/historia/toluca-cruce.jpg"
            alt={t.cruceAlt}
            width={1232}
            height={516}
            className="h-auto w-full rounded-panel lg:col-span-7"
            unoptimized
          />
        </section>

        <section aria-labelledby="h-contar" className="carril flex max-w-3xl flex-col gap-4">
          <h2 id="h-contar" className="t-titulo">
            {t.contar}
          </h2>
          <p className="t-cuerpo text-texto-2">{t.contarCuerpo}</p>
        </section>

        <section aria-labelledby="h-datos" className="grid gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-5">
            <h2 id="h-datos" className="t-titulo">
              {t.raro}
            </h2>
            <p className="t-lanzamiento cifras">{numero(d.nacional.accidentes)}</p>
            <p className="t-cuerpo text-texto-2">
              {t.raroCuerpo(
                d.anio,
                numero(d.nacional.accidentes),
                vv,
                ordinal(d.estado_de_mexico.lugar_por_muertos, lang),
                numero(d.estado_de_mexico.muertos),
              )}
            </p>
          </div>
          <div className="flex flex-col gap-6 lg:col-span-7">
            <figure className="m-0">
              <figcaption className="t-interfaz mb-3 text-texto">
                {t.serie(primero.anio, ultimo.anio)}
              </figcaption>
              <div
                className="flex h-32 items-end gap-px border-b border-linea"
                role="img"
                aria-label={t.serieAlt(
                  numero(primero.accidentes),
                  primero.anio,
                  numero(ultimo.accidentes),
                  ultimo.anio,
                )}
              >
                {d.serie.map((s) => (
                  <span
                    key={s.anio}
                    title={`${s.anio}: ${numero(s.accidentes)}`}
                    className={`flex-1 ${s.anio === ultimo.anio ? "bg-texto" : "bg-texto-3"}`}
                    style={{ height: `${(100 * s.accidentes) / max}%` }}
                  />
                ))}
              </div>
              <p className="t-nota mt-1 flex justify-between cifras">
                <span>{primero.anio}</span>
                <span>{ultimo.anio}</span>
              </p>
            </figure>
            <ul className="flex flex-col">
              {d.tipos.map((x) => (
                <li
                  key={x.tipo.es}
                  className="t-interfaz flex justify-between gap-4 border-b border-linea py-2"
                >
                  <span>{x.tipo[lang]}</span>
                  <span className="cifras text-texto-2">
                    {numero(x.accidentes)} ({pct(x.participacion, lang)})
                  </span>
                </li>
              ))}
            </ul>
            <p className="t-nota">
              {t.fuente} {lang === "es" ? d.fuente.nombre : d.fuente.nombre_en} (
              <a href={d.fuente.url}>{t.abiertos}</a>).{" "}
              {lang === "es" ? d.fuente.nota : d.fuente.nota_en} {t.resultado}{" "}
              <a href={d.fuente.url_resultado} className="cifras">
                {d.fuente.archivo}
              </a>
              .
            </p>
          </div>
        </section>

        <section aria-labelledby="h-nobasta" className="grid items-center gap-8 lg:grid-cols-12">
          <div className="carril flex flex-col gap-4 lg:col-span-7">
            <h2 id="h-nobasta" className="t-titulo">
              {t.noBasta}
            </h2>
            <p className="t-cuerpo text-texto-2">{t.noBasta1}</p>
            <p className="t-cuerpo text-texto-2">{t.noBasta2}</p>
          </div>
          <div className="lg:col-span-5">
            <CroquisAMano alt={t.manoAlt} />
          </div>
        </section>

        <section aria-labelledby="h-croquis" className="flex flex-col gap-8">
          <h2 id="h-croquis" className="t-titulo">
            {t.asi}
          </h2>
          <ol className="grid gap-x-10 gap-y-8 md:grid-cols-2">
            {LETRAS.map((l, i) => {
              const x = t.letras[i]!;
              return (
                <li key={l.letra} className="grid grid-cols-[4.5rem_1fr] gap-4">
                  <span aria-hidden="true" className="t-letra text-[4rem] leading-none">
                    {l.letra}
                  </span>
                  <div className="flex flex-col gap-2">
                    <h3 className="t-subtitulo">{x.palabra}</h3>
                    <p className="t-interfaz text-texto-2">{x.texto}</p>
                    <Link href={ruta(lang, l.href)} className="t-interfaz self-start">
                      {x.enlace}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ol>
          <Image
            src="/historia/toluca-dano.jpg"
            alt={t.danoAlt}
            width={1232}
            height={516}
            className="h-auto w-full rounded-panel"
            unoptimized
          />
        </section>

        <section aria-labelledby="h-noes" className="carril flex max-w-3xl flex-col gap-5">
          <h2 id="h-noes" className="t-titulo">
            {t.noEs}
          </h2>
          <ul className="flex flex-col gap-2">
            <li className="t-cuerpo">{t.noEs1}</li>
            <li className="t-cuerpo">{t.noEs2}</li>
            <li className="t-cuerpo">{t.noEs3}</li>
          </ul>
          <nav aria-label={t.siguiente} className="flex flex-wrap gap-3 pt-2">
            <Link href={ruta(lang, "/cuenta")} className="boton-principal">
              {t.cuenta}
            </Link>
            <Link href={ruta(lang, "/demo")} className="boton-secundario">
              {t.demo}
            </Link>
            <Link
              href={ruta(lang, "/visor?escena=interseccion_toluca")}
              className="boton-secundario"
            >
              {t.toluca}
            </Link>
            <Link href={ruta(lang, "/recorrido")} className="boton-secundario">
              {t.recorrido}
            </Link>
          </nav>
        </section>

        <footer className="border-t border-linea pt-6">
          <Legend atribucion={t.atribucion} />
        </footer>
      </div>
    </Marco>
  );
}
