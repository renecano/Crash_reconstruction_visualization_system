"use client";
/** Lo que se entendió del relato, con la fuente de cada dato y su cita literal (evidencia). */
import type { EscenaSpec } from "@croquis/scene-schema";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { FUENTE, palabra, VALOR } from "@/i18n/vocabulario";

/** Un campo del contrato tal como llega: valor, de dónde salió y la cita que lo respalda. */
interface Campo {
  valor?: unknown;
  unidad?: string;
  fuente?: string;
  evidencia?: { texto: string }[];
}

const T = textos(
  {
    titulo: "Lo que se entendió",
    que: "Qué pasó",
    via: "Tipo de vía",
    piso: "Piso",
    clima: "Clima",
    luz: "Luz",
    vehiculo: (rol: string) => `Vehículo ${rol}`,
    tipo: "Tipo",
    color: "Color",
    maniobra: "Maniobra",
    velocidad: "Velocidad",
    frenado: "¿Frenó?",
    personas: "Personas",
    en: (rol: string) => `En ${rol}`,
    aPie: "A pie",
    si: "sí",
    no: "no",
  },
  {
    titulo: "What was understood",
    que: "What happened",
    via: "Road type",
    piso: "Surface",
    clima: "Weather",
    luz: "Light",
    vehiculo: (rol: string) => `Vehicle ${rol}`,
    tipo: "Type",
    color: "Color",
    maniobra: "Maneuver",
    velocidad: "Speed",
    frenado: "Braked?",
    personas: "People",
    en: (rol: string) => `In ${rol}`,
    aPie: "On foot",
    si: "yes",
    no: "no",
  },
);

function Fila({ nombre, campo }: { nombre: string; campo: Campo | undefined }) {
  const { lang } = useIdioma();
  const t = useTextos(T);
  if (!campo || campo.valor === undefined) return null;
  const v = campo.valor;
  const valor =
    typeof v === "boolean"
      ? v
        ? t.si
        : t.no
      : typeof v === "number"
        ? String(Math.round(v * 10) / 10)
        : palabra(VALOR, v, lang);
  const fuente = campo.fuente ?? "default";
  const cita = campo.evidencia?.[0]?.texto;
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 border-t border-linea py-3 sm:grid-cols-[10rem_1fr]">
      <dt className="t-nota">{nombre}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="t-interfaz cifras">
          {valor}
          {campo.unidad ? ` ${campo.unidad}` : ""}
        </span>
        <span className="t-nota" data-fuente={fuente}>
          {palabra(FUENTE, fuente, lang)}
        </span>
        {cita ? (
          <q className="t-nota cita basis-full text-texto" lang="es-MX">
            {cita}
          </q>
        ) : null}
      </dd>
    </div>
  );
}

export function FactsPanel({ spec }: { spec: EscenaSpec }) {
  const t = useTextos(T);
  const s = spec as unknown as {
    lugar: Record<string, Campo>;
    entorno: Record<string, Campo>;
    eventos: { tipo: string; procedencia?: Campo }[];
    vehiculos: {
      id: string;
      rol: string;
      clase: Campo;
      maniobra: Campo;
      velocidad_previa?: Campo;
      frenado?: { aplico?: Campo };
      color?: { nombre?: Campo };
    }[];
    personas: { id: string; rol: Campo; vehiculo_id?: string }[];
  };
  const evento = s.eventos[0];
  return (
    <section aria-labelledby="hechos-titulo" data-testid="hechos" className="flex flex-col gap-6">
      <h2 id="hechos-titulo" className="t-subtitulo">
        {t.titulo}
      </h2>
      <dl>
        {evento ? (
          <Fila nombre={t.que} campo={{ valor: evento.tipo, ...evento.procedencia }} />
        ) : null}
        <Fila nombre={t.via} campo={s.lugar.tipo_via} />
        <Fila nombre={t.piso} campo={s.lugar.estado_superficie} />
        <Fila nombre={t.clima} campo={s.entorno.clima} />
        <Fila nombre={t.luz} campo={s.entorno.iluminacion} />
      </dl>
      {s.vehiculos.map((v) => (
        <div key={v.id} data-testid={`hechos-${v.id}`}>
          <h3 className="t-interfaz mb-1">{t.vehiculo(v.rol)}</h3>
          <dl>
            <Fila nombre={t.tipo} campo={v.clase} />
            <Fila nombre={t.color} campo={v.color?.nombre} />
            <Fila nombre={t.maniobra} campo={v.maniobra} />
            <Fila nombre={t.velocidad} campo={v.velocidad_previa} />
            <Fila nombre={t.frenado} campo={v.frenado?.aplico} />
          </dl>
        </div>
      ))}
      {s.personas.length > 0 ? (
        <div>
          <h3 className="t-interfaz mb-1">{t.personas}</h3>
          <dl>
            {s.personas.map((p) => (
              <Fila
                key={p.id}
                nombre={
                  p.vehiculo_id ? t.en(p.vehiculo_id.replace("veh-", "").toUpperCase()) : t.aPie
                }
                campo={p.rol}
              />
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
