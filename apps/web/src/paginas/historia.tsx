import Image from "next/image";
import Link from "next/link";
import { Marco } from "@/components/sitio/marco";
import type { Lang } from "@/i18n";
import { Legend } from "@/components/legend";
import { numero, ordinal, pct } from "@/lib/formato";
import datos from "@/data/historia.json";

const LETRAS = [
  {
    letra: "C",
    palabra: "Cuenta",
    texto:
      "Lo dices con tus palabras, como se lo contarías a alguien. Croquis intenta tachar tus datos personales en tu propio dispositivo antes de que el texto salga (cuánto se le escapa está en el recorrido técnico, E1).",
    href: "/relato",
    enlace: "Contar qué pasó",
  },
  {
    letra: "R",
    palabra: "Reconoce",
    texto:
      "La IA convierte tu relato en datos y marca de qué frase salió cada uno. Lo que no dijiste queda marcado como supuesto, y cada cita se verifica contra tu texto.",
    href: "/relato",
    enlace: "Ver qué entiende",
  },
  {
    letra: "O",
    palabra: "Ordena",
    texto:
      "Arma la línea de tiempo: lo que pasó antes, el impacto y lo que pasó después, con las marcas en el piso en su lugar.",
    href: "/visor",
    enlace: "Ver una línea de tiempo",
  },
  {
    letra: "Q",
    palabra: "¿Qué falta?",
    texto:
      "Te pregunta solo lo que de verdad cambia el resultado, como mucho tres cosas por ronda.",
    href: "/relato",
    enlace: "Probar las preguntas",
  },
  {
    letra: "U",
    palabra: "Ubica",
    texto:
      "Acomodas autos, personas y calles en el croquis, sobre una calle real de OpenStreetMap si quieres.",
    href: "/croquis",
    enlace: "Abrir el croquis",
  },
  {
    letra: "I",
    palabra: "Impacta",
    texto:
      "La física calcula el choque, la deformación y hacia dónde salió cada quien, con la rigidez medida en miles de pruebas de choque.",
    href: "/recorrido",
    enlace: "Ver cómo se mide",
  },
  {
    letra: "S",
    palabra: "Simula",
    texto:
      "Lo ves pasar en 3D, desde cualquier ángulo y en cámara lenta, y comparas hipótesis: ¿y si iba a 50 en vez de 35?",
    href: "/visor?escena=interseccion_toluca",
    enlace: "Ver la escena de Toluca",
  },
];

export default function HistoriaPage({ lang }: { lang: Lang }) {
  const d = datos;
  const max = Math.max(...d.serie.map((s) => s.accidentes));
  return (
    <Marco lang={lang}>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-16 px-4 py-12">
        <header className="flex flex-col gap-4">
          <p className="text-sm">
            <Link href="/" className="underline">
              Croquis
            </Link>{" "}
            · Historia
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">Cuenta. Reconoce. Ordena.</h1>
          <p className="text-lg text-neutral-700 dark:text-neutral-300">
            <span lang="en">Crash Reconstruction from Oral Queries Using Impact Simulation</span>
          </p>
        </header>

        <section aria-labelledby="h-tarde" className="flex flex-col gap-4">
          <h2 id="h-tarde" className="text-2xl font-semibold">
            Una tarde nublada en Toluca
          </h2>
          <p className="leading-relaxed">
            Mariana es una persona ficticia. Maneja su Versa gris por Benito Juárez hacia el sur, en
            el segundo carril, como a 35. El semáforo está en verde. En el cruce con Venustiano
            Carranza un taxi blanco entra al cruce y le pega del lado de la puerta del chofer. Su
            auto se va de lado y queda en el carril de la derecha.
          </p>
          <Image
            src="/historia/toluca-cruce.jpg"
            alt="Reconstrucción ilustrativa del cruce de Benito Juárez y Venustiano Carranza en Toluca, vista desde arriba, con los dos autos después del impacto"
            width={1232}
            height={516}
            className="rounded"
            unoptimized
          />
        </section>

        <section aria-labelledby="h-contar" className="flex flex-col gap-4">
          <h2 id="h-contar" className="text-2xl font-semibold">
            Y luego hay que contarlo
          </h2>
          <p className="leading-relaxed">
            El ajustador pregunta a cuánto iba. El agente de tránsito, de dónde venía el taxi. En el
            ministerio público le piden que lo dibuje. Su familia quiere entender cómo quedó así la
            puerta. Mariana recuerda fragmentos: el verde, el golpe, el giro. Cada vez lo cuenta un
            poco distinto, y cada quien se imagina algo diferente.
          </p>
        </section>

        <section aria-labelledby="h-datos" className="flex flex-col gap-4">
          <h2 id="h-datos" className="text-2xl font-semibold">
            No es un caso raro
          </h2>
          <p className="leading-relaxed">
            En {d.anio}, el INEGI registró{" "}
            <strong className="tabular-nums">{numero(d.nacional.accidentes)}</strong> hechos de
            tránsito en zonas urbanas y suburbanas de México. El{" "}
            <strong>{pct(d.tipos[0]!.participacion)}</strong> fueron colisiones con otro vehículo,
            como la de Mariana. El Estado de México fue el{" "}
            <strong>{ordinal(d.estado_de_mexico.lugar_por_muertos)} lugar</strong> del país en
            personas fallecidas en el lugar del accidente ({numero(d.estado_de_mexico.muertos)}).
          </p>
          <figure>
            <figcaption className="mb-2 text-sm font-medium">
              Hechos de tránsito por año, {d.serie[0]!.anio}–{d.serie[d.serie.length - 1]!.anio}
            </figcaption>
            <div
              className="flex h-24 items-end gap-px"
              role="img"
              aria-label={`Serie anual de hechos de tránsito, de ${numero(d.serie[0]!.accidentes)} en ${d.serie[0]!.anio} a ${numero(d.serie[d.serie.length - 1]!.accidentes)} en ${d.serie[d.serie.length - 1]!.anio}`}
            >
              {d.serie.map((s) => (
                <span
                  key={s.anio}
                  title={`${s.anio}: ${numero(s.accidentes)}`}
                  className="flex-1 rounded-t-sm bg-neutral-400 dark:bg-neutral-500"
                  style={{ height: `${(100 * s.accidentes) / max}%` }}
                />
              ))}
            </div>
          </figure>
          <ul className="flex flex-col gap-1 text-sm">
            {d.tipos.map((t) => (
              <li
                key={t.tipo}
                className="flex justify-between gap-4 border-b border-neutral-200 py-1 dark:border-neutral-800"
              >
                <span>{t.tipo}</span>
                <span className="tabular-nums">
                  {numero(t.accidentes)} ({pct(t.participacion)})
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-neutral-500">
            Fuente: {d.fuente.nombre} (
            <a href={d.fuente.url} className="underline">
              datos abiertos
            </a>
            ). {d.fuente.nota} Resultado:{" "}
            <a href={d.fuente.url_resultado} className="font-mono underline">
              {d.fuente.archivo}
            </a>
            .
          </p>
        </section>

        <section aria-labelledby="h-nobasta" className="flex flex-col gap-4">
          <h2 id="h-nobasta" className="text-2xl font-semibold">
            Un croquis a mano no basta. Una animación genérica, tampoco
          </h2>
          <p className="leading-relaxed">
            Un dibujo a mano no tiene escala ni física: ¿cabe ese giro a 35 km/h? Una animación
            hecha a ojo se ve convincente, pero no sale de lo que Mariana dijo, y nadie sabe qué
            parte es dato y qué parte es relleno.
          </p>
          <p className="leading-relaxed">
            Croquis hace otra cosa. Cada dato sale de una frase del relato, o se marca como
            supuesto. La física decide el choque y su incertidumbre se reporta como rango. Cada
            pieza se mide contra casos reales.
          </p>
        </section>

        <section aria-labelledby="h-croquis" className="flex flex-col gap-6">
          <h2 id="h-croquis" className="text-2xl font-semibold">
            Así funciona
          </h2>
          <ol className="flex flex-col gap-4">
            {LETRAS.map((l) => (
              <li key={l.letra} className="grid grid-cols-[3rem_1fr] gap-3">
                <span aria-hidden="true" className="text-4xl leading-none font-semibold">
                  {l.letra}
                </span>
                <div>
                  <h3 className="font-semibold">{l.palabra}</h3>
                  <p className="text-neutral-700 dark:text-neutral-300">{l.texto}</p>
                  <Link href={l.href} className="text-sm underline">
                    {l.enlace}
                  </Link>
                </div>
              </li>
            ))}
          </ol>
          <Image
            src="/historia/toluca-dano.jpg"
            alt="Reconstrucción ilustrativa del auto gris con la puerta del chofer hundida junto al taxi blanco"
            width={1232}
            height={516}
            className="rounded"
            unoptimized
          />
        </section>

        <section aria-labelledby="h-noes" className="flex flex-col gap-4">
          <h2 id="h-noes" className="text-2xl font-semibold">
            Lo que Croquis no es
          </h2>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed">
            <li>No es un peritaje: es una reconstrucción ilustrativa, y lo dice en cada imagen.</li>
            <li>No decide quién tuvo la culpa: muestra lo que el relato y la física permiten.</li>
            <li>No estima lesiones.</li>
          </ul>
          <nav aria-label="Siguiente" className="flex flex-wrap gap-3">
            <Link
              href="/relato"
              className="rounded bg-neutral-900 px-4 py-2 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Contar qué pasó
            </Link>
            <Link href="/demo" className="rounded border border-neutral-400 px-4 py-2 font-medium">
              Probar la demo
            </Link>
            <Link
              href="/visor?escena=interseccion_toluca"
              className="rounded border border-neutral-400 px-4 py-2 font-medium"
            >
              Ver la escena de Toluca
            </Link>
            <Link
              href="/recorrido"
              className="rounded border border-neutral-400 px-4 py-2 font-medium"
            >
              Recorrido técnico
            </Link>
          </nav>
        </section>

        <footer className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <Legend atribucion="Las imágenes de Toluca contienen información de OpenStreetMap, disponible en openstreetmap.org bajo la Open Database License (ODbL)." />
        </footer>
      </div>
    </Marco>
  );
}
