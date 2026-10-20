/**
 * Capítulo «Reconoce» de la portada (PLAN §11.3): los fragmentos del relato se marcan en naranja
 * y viajan a sus campos. Son cinco datos de la escena de Toluca, cada uno con la cita que lo
 * respalda (`evidencia[].inicio`/`fin` de la escena); solo esas cinco van subrayadas, para que el
 * naranja señale y no decore (BRAND.md).
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { RelatoConCitas } from "@/components/relato/relato-con-citas";
import { textosEn, textos, type Lang } from "@/i18n";
import { CLASE, palabra, VALOR } from "@/i18n/vocabulario";

const T = textos(
  {
    velocidad: "Velocidad de A",
    vehiculoB: "Vehículo B",
    semaforo: "Semáforo de B",
    rojo: "en rojo",
    dano: "Golpe en A",
    danoValor: "lado del conductor, puerta",
    clima: "Clima",
    lista: "Datos que salieron del relato, con su frase",
  },
  {
    velocidad: "Speed of A",
    vehiculoB: "Vehicle B",
    semaforo: "Light for B",
    rojo: "red",
    dano: "Impact on A",
    danoValor: "driver's side, door",
    clima: "Weather",
    lista: "Facts that came from the narrative, with their sentence",
  },
);

type Ruta = (string | number)[];

function en(o: unknown, ruta: Ruta): unknown {
  return ruta.reduce<unknown>(
    (x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined),
    o,
  );
}

/** La primera cita de un campo de la escena. */
function cita(o: unknown): { inicio: number; fin: number } | null {
  const e = en(o, ["evidencia", 0]) as { inicio?: number; fin?: number } | undefined;
  return typeof e?.inicio === "number" && typeof e.fin === "number" && e.fin > e.inicio
    ? { inicio: e.inicio, fin: e.fin }
    : null;
}

export interface CampoCitado {
  etiqueta: string;
  valor: string;
  inicio: number;
  fin: number;
}

/** Los cinco campos del capítulo, con su valor en el idioma de la página y su cita. */
export function camposCitados(spec: EscenaSpec, lang: Lang): CampoCitado[] {
  const t = textosEn(T, lang);
  const filas: { ruta: Ruta; etiqueta: string; valor: (o: unknown) => string }[] = [
    {
      ruta: ["vehiculos", 0, "velocidad_previa"],
      etiqueta: t.velocidad,
      valor: (o) => `${String(en(o, ["valor"]))} km/h`,
    },
    {
      ruta: ["vehiculos", 1, "clase"],
      etiqueta: t.vehiculoB,
      valor: (o) => palabra(CLASE, en(o, ["valor"]), lang),
    },
    {
      ruta: ["lugar", "dispositivos", 1, "procedencia"],
      etiqueta: t.semaforo,
      valor: () => t.rojo,
    },
    { ruta: ["danos_declarados", 0, "procedencia"], etiqueta: t.dano, valor: () => t.danoValor },
    {
      ruta: ["entorno", "clima"],
      etiqueta: t.clima,
      valor: (o) => palabra(VALOR, en(o, ["valor"]), lang),
    },
  ];
  return filas.flatMap((f) => {
    const o = en(spec, f.ruta);
    const c = cita(o);
    return c ? [{ etiqueta: f.etiqueta, valor: f.valor(o), ...c }] : [];
  });
}

export function CitasACampos({
  texto,
  spec,
  lang,
}: {
  texto: string;
  spec: EscenaSpec;
  lang: Lang;
}) {
  const t = textosEn(T, lang);
  const campos = camposCitados(spec, lang);
  return (
    <div className="flex flex-col gap-4" data-testid="citas-a-campos">
      {/* En el celular el relato completo no cabe junto a los campos: quedan las citas. */}
      <div lang="es-MX" className="hidden md:block">
        <RelatoConCitas
          texto={texto}
          spec={spec}
          tramos={campos.map((c) => ({ inicio: c.inicio, fin: c.fin }))}
          className="t-interfaz text-texto-2"
        />
      </div>
      <ul aria-label={t.lista} className="flex flex-col gap-2 border-t border-linea pt-3">
        {campos.map((c) => (
          <li
            key={c.etiqueta}
            className="grid grid-cols-1 items-baseline gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <span className="t-interfaz cita text-texto" lang="es-MX">
              «{texto.slice(c.inicio, c.fin)}»
            </span>
            <span className="flex items-baseline gap-2 sm:justify-end sm:text-right">
              <span aria-hidden="true" className="text-texto-3">
                →
              </span>
              <span className="t-nota">{c.etiqueta}</span>
              <span className="t-cota text-texto">{c.valor}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
