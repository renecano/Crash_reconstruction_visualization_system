"use client";

import type { Resultado } from "@croquis/scene-schema";
import type { PeopleAttachment } from "@croquis/viewer";
import { textos, type Lang } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { fmtNumber } from "@/lib/format-number";

type Vocab = Record<string, { es: string; en: string }>;

const ROL: Vocab = {
  conductor: { es: "Conductor", en: "Driver" },
  pasajero: { es: "Pasajero", en: "Passenger" },
  peaton: { es: "Persona peatona", en: "Pedestrian" },
  ciclista: { es: "Ciclista", en: "Cyclist" },
  motociclista: { es: "Motociclista", en: "Motorcyclist" },
};

const ASIENTO: Vocab = {
  conductor: { es: "al volante", en: "at the wheel" },
  copiloto: { es: "de copiloto", en: "in the front passenger seat" },
  trasero_izquierdo: { es: "atrás a la izquierda", en: "in the rear left seat" },
  trasero_centro: { es: "atrás al centro", en: "in the rear middle seat" },
  trasero_derecho: { es: "atrás a la derecha", en: "in the rear right seat" },
  tercera_fila: { es: "en la tercera fila", en: "in the third row" },
  otro: { es: "en otro asiento", en: "in another seat" },
};

const OBJETO: Vocab = {
  arbol: { es: "el árbol", en: "the tree" },
  poste: { es: "el poste", en: "the pole" },
  muro: { es: "el muro", en: "the wall" },
  barda: { es: "la barda", en: "the fence wall" },
  vehiculo_estacionado: { es: "el vehículo estacionado", en: "the parked vehicle" },
  puesto: { es: "el puesto", en: "the street stall" },
  contenedor: { es: "el contenedor", en: "the dumpster" },
  senal: { es: "la señal", en: "the sign" },
  parada_autobus: { es: "la parada de autobús", en: "the bus stop" },
  otro: { es: "un objeto", en: "an object" },
};

/** Zonas de contacto del ocupante (las escribe el solver en español). */
const ZONA: Record<string, string> = {
  "volante y tablero": "the steering wheel and dashboard",
  tablero: "the dashboard",
  "respaldo del asiento de adelante": "the back of the front seat",
  "interior de adelante": "the front of the interior",
  "respaldo y cabecera": "the seatback and headrest",
  "puerta y ventana del lado izquierdo": "the door and window on the left side",
  "puerta y ventana del lado derecho": "the door and window on the right side",
  "consola central o asiento contiguo": "the center console or the next seat",
  "asiento contiguo del lado izquierdo": "the next seat on the left side",
  "asiento contiguo del lado derecho": "the next seat on the right side",
};

function de(vocab: Vocab, valor: string, lang: Lang): string {
  return vocab[valor]?.[lang] ?? valor;
}

const fmt = fmtNumber;

const T = textos(
  {
    region: "Personas y visibilidad",
    personas: "Personas",
    delVehiculo: (rol: string) => ` del vehículo ${rol}`,
    proyeccion: (dist: string, vel: string, a: string, b: string) =>
      `Proyección (Searle): ${dist} m a ${vel} km/h; banda posible ${a}–${b} m.`,
    ragdoll: (dist: string, dentro: boolean) =>
      ` Ragdoll del visor: ${dist} m, ${dentro ? "dentro" : "fuera"} de la banda.`,
    sentado: (asiento: string) => `Sentado ${asiento}`,
    cinturonNoDicho: "; el relato no dice si llevaba cinturón (se muestran ambos casos)",
    conCinturonDicho: ", con cinturón",
    sinCinturonDicho: ", sin cinturón",
    seMueve: (direccion: string) => `. En el impacto se mueve ${direccion}:`,
    variante: (cinturon: boolean, cm: string) =>
      `${cinturon ? "Con cinturón" : "Sin cinturón"}: hasta ${cm} cm`,
    contacto: (zona: string, ms: string) => `; alcanza ${zona} a los ${ms} ms`,
    notaPersonas:
      "Cinemática ilustrativa del cuerpo y del interior del vehículo. Croquis no estima lesiones; los aros azules solo marcan zonas de contacto probables.",
    visibilidad: "Visibilidad",
    desde: (rol: string) => `Desde el vehículo ${rol}`,
    noSeVeia: (que: string, tapaba: string | null) =>
      `${que} no se veía al momento del impacto${tapaba ? ` (lo tapaba ${tapaba})` : ""}.`,
    todaAproximacion: (que: string, m: string) =>
      `${que} se veía durante toda la aproximación mostrada (desde ${m} m).`,
    seVeiaDesde: (que: string, s: string, m: string, tapaba: string | null) =>
      `${que} se veía desde ${s} s antes del impacto, a ${m} m${tapaba ? `; antes lo tapaba ${tapaba}` : ""}.`,
    notaVisibilidad:
      "Línea de vista desde el ojo del conductor (altura AASHTO) con los objetos y vehículos de la escena. En la cámara del conductor se dibuja: verde si se veía, naranja si algo lo tapaba.",
  },
  {
    region: "People and visibility",
    personas: "People",
    delVehiculo: (rol: string) => ` of vehicle ${rol}`,
    proyeccion: (dist: string, vel: string, a: string, b: string) =>
      `Throw (Searle): ${dist} m at ${vel} km/h; possible band ${a}–${b} m.`,
    ragdoll: (dist: string, dentro: boolean) =>
      ` Viewer ragdoll: ${dist} m, ${dentro ? "inside" : "outside"} the band.`,
    sentado: (asiento: string) => `Seated ${asiento}`,
    cinturonNoDicho:
      "; the narrative does not say whether they wore a seat belt (both cases are shown)",
    conCinturonDicho: ", with a seat belt",
    sinCinturonDicho: ", without a seat belt",
    seMueve: (direccion: string) => `. In the impact they move ${direccion}:`,
    variante: (cinturon: boolean, cm: string) =>
      `${cinturon ? "With seat belt" : "Without seat belt"}: up to ${cm} cm`,
    contacto: (zona: string, ms: string) => `; reaches ${zona} at ${ms} ms`,
    notaPersonas:
      "Illustrative kinematics of the body and the vehicle interior. Croquis does not estimate injuries; the blue rings only mark likely contact areas.",
    visibilidad: "Visibility",
    desde: (rol: string) => `From vehicle ${rol}`,
    noSeVeia: (que: string, tapaba: string | null) =>
      `${que} could not be seen at the moment of impact${tapaba ? ` (blocked by ${tapaba})` : ""}.`,
    todaAproximacion: (que: string, m: string) =>
      `${que} could be seen during the whole approach shown (from ${m} m).`,
    seVeiaDesde: (que: string, s: string, m: string, tapaba: string | null) =>
      `${que} could be seen from ${s} s before the impact, at ${m} m${tapaba ? `; before that it was blocked by ${tapaba}` : ""}.`,
    notaVisibilidad:
      "Line of sight from the driver's eye (AASHTO height) with the objects and vehicles in the scene. The driver camera draws it green if it could be seen and orange if something blocked it.",
  },
);

/** Hacia dónde se mueve el ocupante respecto al habitáculo, en palabras. */
export function directionWords(deg: number, lang: Lang = "es"): string {
  const a = ((deg % 360) + 360) % 360;
  const en = lang === "en";
  if (a < 22.5 || a >= 337.5) return en ? "forward" : "hacia adelante";
  if (a < 67.5) return en ? "forward and to the left" : "hacia adelante y a la izquierda";
  if (a < 112.5) return en ? "to the left" : "hacia la izquierda";
  if (a < 157.5) return en ? "backward and to the left" : "hacia atrás y a la izquierda";
  if (a < 202.5) return en ? "backward" : "hacia atrás";
  if (a < 247.5) return en ? "backward and to the right" : "hacia atrás y a la derecha";
  if (a < 292.5) return en ? "to the right" : "hacia la derecha";
  return en ? "forward and to the right" : "hacia adelante y a la derecha";
}

function actorName(resultado: Resultado, id: string, tipo: string, lang: Lang): string {
  const en = lang === "en";
  if (tipo === "vehiculo") {
    const v = resultado.vehiculos.find((x) => x.id === id);
    return v ? `${en ? "vehicle" : "el vehículo"} ${v.rol}` : id;
  }
  if (tipo === "persona") {
    const p = resultado.personas.find((x) => x.id === id);
    if (!p) return id;
    if (en) return `the ${de(ROL, p.rol, "en").toLowerCase()}`;
    return (ROL[p.rol]?.es ?? p.rol).toLowerCase().replace(/^persona /, "la persona ");
  }
  const o = resultado.objetos?.find((x) => x.id === id);
  return o ? de(OBJETO, o.tipo, lang) : id;
}

/** Explica una causa de no visibilidad (`objeto:<id>`, `vehiculo:<id>`, `noche`, `clima`). */
export function causeWords(resultado: Resultado, cause: string, lang: Lang = "es"): string {
  const en = lang === "en";
  if (cause === "noche") {
    return en
      ? "the darkness (beyond the reach of the headlights)"
      : "la oscuridad (fuera del alcance de los faros)";
  }
  if (cause === "clima") {
    return en
      ? "the rain or fog (stated visibility)"
      : "la lluvia o la niebla (visibilidad declarada)";
  }
  const [kind, id] = cause.split(":");
  if (kind === "objeto" && id) return actorName(resultado, id, "objeto", lang);
  if (kind === "vehiculo" && id) return actorName(resultado, id, "vehiculo", lang);
  return cause;
}

/** Primera letra en mayúscula (el inglés empieza la frase con «the …» o «vehicle …»). */
const inicial = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Personas (proyección y ocupantes) y visibilidad. Lenguaje neutro: describe movimientos y
 * líneas de vista, nunca lesiones ni responsabilidades (PLAN §10).
 */
export function PeoplePanel({
  resultado,
  people,
}: {
  resultado: Resultado;
  people?: PeopleAttachment | null;
}) {
  const { lang } = useIdioma();
  const t = useTextos(T);
  const ragdoll = new Map((people?.ragdolls ?? []).map((r) => [r.personId, r]));
  const vis = resultado.visibilidad ?? [];
  return (
    <section className="t-interfaz flex flex-col gap-6" aria-label={t.region}>
      <div>
        <h3 className="t-subtitulo">{t.personas}</h3>
        <ul className="mt-2 flex flex-col" data-testid="personas">
          {resultado.personas.map((p) => {
            const veh = p.vehiculo_id
              ? resultado.vehiculos.find((v) => v.id === p.vehiculo_id)
              : undefined;
            const r = ragdoll.get(p.id);
            return (
              <li key={p.id} className="border-t border-linea py-3">
                <span className="text-texto">{de(ROL, p.rol, lang)}</span>
                {veh ? t.delVehiculo(veh.rol) : ""}
                {p.proyeccion ? (
                  <span className="cifras block">
                    {t.proyeccion(
                      fmt(p.proyeccion.distancia_m, 1),
                      fmt(p.proyeccion.velocidad_lanzamiento_kmh),
                      fmt(p.proyeccion.banda_searle_m[0], 1),
                      fmt(p.proyeccion.banda_searle_m[1], 1),
                    )}
                    {r ? t.ragdoll(fmt(r.distance, 1), r.inBand) : ""}
                  </span>
                ) : null}
                {p.ocupante ? (
                  <span className="block">
                    {t.sentado(de(ASIENTO, p.ocupante.asiento, lang))}
                    {p.ocupante.cinturon_declarado === undefined
                      ? t.cinturonNoDicho
                      : p.ocupante.cinturon_declarado
                        ? t.conCinturonDicho
                        : t.sinCinturonDicho}
                    {t.seMueve(directionWords(p.ocupante.pulso.direccion_deg, lang))}
                    {p.ocupante.variantes.map((v) => (
                      <span key={String(v.cinturon)} className="cifras block pl-3">
                        {t.variante(v.cinturon, fmt(100 * v.desplazamiento_max_m))}
                        {v.contacto
                          ? t.contacto(
                              lang === "en"
                                ? (ZONA[v.contacto.zona] ?? v.contacto.zona)
                                : v.contacto.zona,
                              fmt(1000 * v.contacto.t_s),
                            )
                          : ""}
                        .
                      </span>
                    ))}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="t-nota mt-2">{t.notaPersonas}</p>
      </div>
      {vis.length > 0 ? (
        <div className="border-t border-linea pt-3">
          <h3 className="t-subtitulo">{t.visibilidad}</h3>
          <ul className="mt-2 flex flex-col" data-testid="visibilidad">
            {vis.map((v) => {
              const s = v.resumen;
              const who = t.desde(
                resultado.vehiculos.find((x) => x.id === v.observador)?.rol ?? v.observador,
              );
              const nombre = actorName(resultado, v.objetivo, v.tipo_objetivo, lang);
              const what = lang === "en" ? inicial(nombre) : nombre;
              const tapaba = s.oclusor_principal
                ? causeWords(resultado, s.oclusor_principal, lang)
                : null;
              let text: string;
              if (!s.visible_al_impacto) {
                text = t.noSeVeia(what, tapaba);
              } else if (s.visible_toda_la_aproximacion) {
                text = t.todaAproximacion(what, fmt(s.distancia_al_verse_m ?? 0));
              } else {
                text = t.seVeiaDesde(
                  what,
                  fmt(-(s.visible_desde_s ?? 0), 1),
                  fmt(s.distancia_al_verse_m ?? 0, 1),
                  tapaba,
                );
              }
              return (
                <li
                  key={`${v.observador}-${v.objetivo}`}
                  className="cifras border-t border-linea py-2"
                >
                  <span className="text-texto">{who}:</span> {text}
                </li>
              );
            })}
          </ul>
          <p className="t-nota mt-2">{t.notaVisibilidad}</p>
        </div>
      ) : null}
    </section>
  );
}
