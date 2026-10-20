/**
 * Los mensajes que el sistema genera en español (avisos del solver, inconsistencias y preguntas
 * de la extracción) dichos en inglés para el sitio en inglés (PLAN §11.5, ADR 0045).
 *
 * El solver y la extracción no cambian: siguen escribiendo en español, que es lo que comparan las
 * pruebas de paridad. Aquí cada plantilla española tiene su versión en inglés; una prueba recorre
 * los mensajes que de verdad se producen (escenas canónicas y Relatos-MX) y falla si alguno no se
 * reconoce. Lo que no se reconoce se muestra en español, marcado con su idioma.
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import type { Lang } from "@/i18n";
import { palabra, VALOR } from "@/i18n/vocabulario";
import type { Pregunta } from "./relato-api";

/** "el vehículo B", "la camioneta (B)", "tu vehículo" → inglés. */
function quien(es: string): string {
  const s = es.trim();
  if (/^tu vehículo$/i.test(s)) return "your vehicle";
  if (/^el otro vehículo$/i.test(s)) return "the other vehicle";
  const rol = /\(([A-Z])\)\s*$/.exec(s)?.[1] ?? /vehículo ([A-Z])\b/i.exec(s)?.[1];
  const persona = /^la persona que iba en el vehículo ([A-Z])$/i.exec(s);
  if (persona) return `the person in vehicle ${persona[1]}`;
  if (/persona|peat[oó]n/i.test(s)) return "the person";
  return rol ? `vehicle ${rol}` : s;
}

const LADO: Record<string, string> = { izquierda: "left", derecha: "right" };

const EVIDENCIA: Record<string, string> = {
  "dónde quedó": "where it came to rest",
  "hacia dónde quedó orientado": "which way it ended up facing",
  "las marcas de frenado": "the skid marks",
  "la distancia a la que quedó la persona": "how far the person ended up",
  "el daño descrito": "the damage described",
};

function listaEvidencia(es: string): string {
  const partes = es.split(/, | y /).map((p) => EVIDENCIA[p.trim()] ?? p.trim());
  return partes.length === 1
    ? partes[0]!
    : `${partes.slice(0, -1).join(", ")} and ${partes.at(-1)}`;
}

type Plantilla = [RegExp, (m: RegExpExecArray) => string];

/** Plantillas en el orden del código que las genera (solver-ts y extraction). */
const PLANTILLAS: Plantilla[] = [
  // --- Avisos del solver (reconstruct.ts) ---
  [
    /^Vehículo (\S+): sin tabla de clase ni masa; se usa 1200 kg\.$/,
    (m) => `Vehicle ${m[1]}: no class table or mass; 1200 kg is used.`,
  ],
  [
    /^Vehículo (\S+): para alcanzar el punto de impacto declarado se infiere un desvío lateral de ([\d.]+) m hacia la (izquierda|derecha)\.$/,
    (m) =>
      `Vehicle ${m[1]}: to reach the stated point of impact, a lateral shift of ${m[2]} m to the ${LADO[m[3]!]} is inferred.`,
  ],
  [
    /^Las zonas de impacto declaradas no llegan a tocarse siguiendo las trayectorias; se usa el acercamiento máximo \(quedan a ([\d.]+) m\)\.$/,
    (m) =>
      `The stated impact zones never touch along the trajectories; the closest approach is used (${m[1]} m apart).`,
  ],
  [
    /^Vehículo (\S+): frenó pero no dice desde dónde; se asume ([\d.]+) s antes del impacto\.$/,
    (m) =>
      `Vehicle ${m[1]}: it braked but the narrative does not say where; ${m[2]} s before the impact is assumed.`,
  ],
  [
    /^Vehículo (\S+): con (\d+) km\/h y ([\d.]+) m de frenado se habría detenido antes del impacto; se recorta el frenado\.$/,
    (m) =>
      `Vehicle ${m[1]}: with ${m[2]} km/h and ${m[3]} m of braking it would have stopped before the impact; the braking is shortened.`,
  ],
  [
    /^La distancia de proyección declarada de (.+?) \((\d+) m\) sugiere entre (\d+) y (\d+) km\/h; la velocidad reconstruida al impacto es (\d+) km\/h\.$/,
    (m) =>
      `The stated throw distance of ${quien(m[1]!)} (${m[2]} m) suggests between ${m[3]} and ${m[4]} km/h; the reconstructed impact speed is ${m[5]} km/h.`,
  ],
  [
    /^Evento (\S+) \((.+?)\) sin actores suficientes o sin punto de impacto: no se resolvió\.$/,
    (m) => `Event ${m[1]} (${m[2]}) has too few actors or no point of impact: it was not resolved.`,
  ],
  [
    /^Vehículo (\S+): no llegó al reposo en (\d+) s\.$/,
    (m) => `Vehicle ${m[1]}: it did not come to rest within ${m[2]} s.`,
  ],
  [
    /^Persona (\S+): sin posición inicial ni vehículo; no se muestra en la escena\.$/,
    (m) => `Person ${m[1]}: no initial position and no vehicle; not shown in the scene.`,
  ],
  [
    /^Vehículo (\S+): el relato dice que se volcó, pero llega a la orilla con (\d+) km\/h hacia ella y el tropiezo necesita (\d+) km\/h; probablemente iba derrapando de lado, algo que la fase previa \(sin deslizamiento lateral\) no reproduce\. La volcadura del visor es ilustrativa\.$/,
    (m) =>
      `Vehicle ${m[1]}: the narrative says it rolled over, but it reaches the edge at ${m[2]} km/h toward it and tripping needs ${m[3]} km/h; it was probably sliding sideways, which the pre-impact phase (no lateral sliding) does not reproduce. The rollover in the viewer is illustrative.`,
  ],
  [
    /^Vehículo (\S+): con (\d+) km\/h hacia la orilla el tropiezo alcanza para iniciar una volcadura, aunque el relato no la menciona\.$/,
    (m) =>
      `Vehicle ${m[1]}: at ${m[2]} km/h toward the edge, tripping is enough to start a rollover, although the narrative does not mention one.`,
  ],
  // --- Inconsistencias (consistency.ts) ---
  [
    /^Se dijo que (.+?) estaba (detenido|estacionado) y también que iba a unos (\d+) km\/h\. ¿Cuál de los dos datos es el correcto\?$/,
    (m) =>
      `The narrative says ${quien(m[1]!)} was ${m[2] === "detenido" ? "stopped" : "parked"} and also that it was going about ${m[3]} km/h. Which of the two is right?`,
  ],
  [
    /^Para dejar unos (\d+) m de marcas de frenado, (.+?) tendría que ir al menos a (\d+) km\/h, aun con el piso más resbaloso posible; la velocidad indicada llega a (\d+) km\/h\. ¿Puedes confirmar el largo de las marcas o la velocidad\?$/,
    (m) =>
      `To leave about ${m[1]} m of skid marks, ${quien(m[2]!)} would have to be going at least ${m[3]} km/h, even on the most slippery surface; the speed given reaches ${m[4]} km/h. Can you confirm the length of the marks or the speed?`,
  ],
  [
    /^Que la persona quedara a unos (\d+) m corresponde a velocidades de (\d+) a (\d+) km\/h, y la velocidad indicada de (.+?) va de (\d+) a (\d+) km\/h\. ¿Puedes confirmar la distancia o la velocidad\?$/,
    (m) =>
      `The person ending up about ${m[1]} m away matches speeds of ${m[2]} to ${m[3]} km/h, and the speed given for ${quien(m[4]!)} goes from ${m[5]} to ${m[6]} km/h. Can you confirm the distance or the speed?`,
  ],
  [
    /^La posición inicial de (.+?) queda a unos (\d+) m de la calle más cercana del mapa\. ¿Puedes revisar dónde estaba\?$/,
    (m) =>
      `The starting position of ${quien(m[1]!)} is about ${m[2]} m from the nearest street on the map. Can you check where it was?`,
  ],
  [
    /^El daño descrito en (.+?) corresponde a un cambio de velocidad de (\d+) a (\d+) km\/h, y con las velocidades indicadas sale de (\d+) a (\d+) km\/h\. ¿Puedes revisar las velocidades o describir de nuevo el daño\?$/,
    (m) =>
      `The damage described on ${quien(m[1]!)} matches a change in speed of ${m[2]} to ${m[3]} km/h, and the speeds given produce ${m[4]} to ${m[5]} km/h. Can you check the speeds or describe the damage again?`,
  ],
  [
    /^Con ninguna velocidad entre 0 y 200 km\/h (.+?) termina donde se indicó, aun llegando con otro ángulo: lo más cerca que llega queda a unos (\d+) m\. ¿La posición final es correcta, o el vehículo pegó con algo más o cambió de dirección antes\?$/,
    (m) =>
      `At no speed between 0 and 200 km/h does ${quien(m[1]!)} end up where stated, even arriving at another angle: the closest it gets is about ${m[2]} m away. Is the final position right, or did the vehicle hit something else or change direction before?`,
  ],
  [
    /^Por (.+?), (el vehículo \S+) iría a unos (\d+)–(\d+) km\/h (antes de frenar|antes del choque), y la velocidad indicada va de (\d+) a (\d+) km\/h\. ¿Puedes confirmar la velocidad, o alguno de esos datos\?$/,
    (m) =>
      `From ${listaEvidencia(m[1]!)}, ${quien(m[2]!)} would be going about ${m[3]}–${m[4]} km/h ${m[5] === "antes de frenar" ? "before braking" : "before the crash"}, and the speed given goes from ${m[6]} to ${m[7]} km/h. Can you confirm the speed, or any of those facts?`,
  ],
  // --- Revisión de la escena (scene-schema/check.ts), en el editor del croquis ---
  [
    /^La escena usa la versión (\S+); la vigente es (\S+)\. Conviene migrarla\.$/,
    (m) => `The scene uses version ${m[1]}; the current one is ${m[2]}. It should be migrated.`,
  ],
  [
    /^El id “(.+?)” se repite \(ya se usó en (.+?)\)\.$/,
    (m) => `The id “${m[1]}” is repeated (already used in ${m[2]}).`,
  ],
  [
    /^“(.+?)” no corresponde a ningún elemento de la escena\.$/,
    (m) => `“${m[1]}” does not match any element of the scene.`,
  ],
  [
    /^“(.+?)” es un (\S+); aquí se esperaba (.+)\.$/,
    (m) => `“${m[1]}” is a ${m[2]}; ${m[3]!.replace(" o ", " or ")} was expected here.`,
  ],
  [
    /^El vehículo “(.+?)” tiene zona de impacto pero no está entre los actores del evento\.$/,
    (m) => `Vehicle “${m[1]}” has an impact zone but is not among the event's actors.`,
  ],
  [
    /^El dato se atribuye al relato pero no cita ningún fragmento\.$/,
    () => "The fact is attributed to the narrative but quotes no fragment.",
  ],
  [
    /^El fragmento citado tiene fin antes del inicio\.$/,
    () => "The quoted fragment ends before it starts.",
  ],
  [
    /^El fragmento citado no coincide con el relato en esas posiciones\.$/,
    () => "The quoted fragment does not match the narrative at those positions.",
  ],
  [
    /^El rango está invertido \(mínimo mayor que máximo\)\.$/,
    () => "The range is inverted (minimum greater than maximum).",
  ],
  [
    /^El valor (\S+) queda fuera de su propio rango \[(.+?)\]\.$/,
    (m) => `The value ${m[1]} falls outside its own range [${m[2]}].`,
  ],
  [
    /^Una (\S+) suele pesar entre (\S+) y (\S+) kg; aquí dice (\S+) kg\.$/,
    (m) =>
      `A ${palabra(VALOR, m[1], "en")} usually weighs between ${m[2]} and ${m[3]} kg; here it says ${m[4]} kg.`,
  ],
  [
    /^El (.+?) de una (\S+) suele estar entre (\S+) y (\S+) m; aquí dice (\S+) m\.$/,
    (m) =>
      `The ${m[1]} of a ${palabra(VALOR, m[2], "en")} is usually between ${m[3]} and ${m[4]} m; here it says ${m[5]} m.`,
  ],
  [
    /^Una (\S+) difícilmente supera (\S+) km\/h; aquí dice (\S+) km\/h\.$/,
    (m) =>
      `A ${palabra(VALOR, m[1], "en")} rarely exceeds ${m[2]} km/h; here it says ${m[3]} km/h.`,
  ],
  [
    /^Hay poca certeza sobre (.+?) del vehículo (\S+); conviene preguntar\.$/,
    (m) => `There is little certainty about the ${m[1]} of vehicle ${m[2]}; it is worth asking.`,
  ],
  [
    /^Los vehículos (\S+) y (\S+) empiezan uno encima del otro; ajusta sus posiciones iniciales en el croquis\.$/,
    (m) =>
      `Vehicles ${m[1]} and ${m[2]} start on top of each other; adjust their starting positions in the sketch.`,
  ],
  [
    /^Hay poca certeza sobre el tipo de vía; conviene preguntar\.$/,
    () => "There is little certainty about the road type; it is worth asking.",
  ],
  [
    /^La escena no tiene vehículos; el solver no tendrá nada que reconstruir\.$/,
    () => "The scene has no vehicles; the solver will have nothing to reconstruct.",
  ],
  [/^Un peatón no va a bordo de un vehículo\.$/, () => "A pedestrian is not on board a vehicle."],
  [
    /^Un (\S+) debe ir asociado a un vehículo\.$/,
    (m) => `A ${palabra(VALOR, m[1], "en")} must be linked to a vehicle.`,
  ],
  [
    /^La persona “(.+?)” dice ir en “(.+?)” pero ese vehículo no la lista entre sus ocupantes\.$/,
    (m) =>
      `Person “${m[1]}” says it is in “${m[2]}” but that vehicle does not list it among its occupants.`,
  ],
  [
    /^“(.+?)” aparece como ocupante de “(.+?)” pero la persona no lo indica\.$/,
    (m) => `“${m[1]}” appears as an occupant of “${m[2]}” but the person does not say so.`,
  ],
  [
    /^El orden (\S+) se repite \(ya lo usa el evento (.+?)\)\.$/,
    (m) => `Order ${m[1]} is repeated (event ${m[2]} already uses it).`,
  ],
  [
    /^Un impacto entre vehículos necesita al menos dos vehículos como actores\.$/,
    () => "A collision between vehicles needs at least two vehicles as actors.",
  ],
  [
    /^Un impacto con persona necesita un vehículo y una persona como actores\.$/,
    () => "An impact with a person needs a vehicle and a person as actors.",
  ],
  [
    /^Un impacto con objeto necesita al menos un vehículo como actor\.$/,
    () => "An impact with an object needs at least one vehicle as an actor.",
  ],
  // --- Preguntas de contradicción (extraction/questions.ts, fromAvisos) ---
  [
    /^Con unos (\d+) km\/h y (\d+) m de frenado, (.+?) se habría detenido antes del golpe\. ¿Recuerdas desde dónde empezó a frenar, o la velocidad\?$/,
    (m) =>
      `At about ${m[1]} km/h with ${m[2]} m of braking, ${quien(m[3]!)} would have stopped before the crash. Do you remember where the braking started, or the speed?`,
  ],
  [
    /^La persona quedó a unos (\d+) m, lo que suele corresponder a (\d+)–(\d+) km\/h, y la velocidad indicada da (\d+) km\/h\. ¿Puedes confirmar la distancia o la velocidad\?$/,
    (m) =>
      `The person ended up about ${m[1]} m away, which usually matches ${m[2]}–${m[3]} km/h, and the speed given is ${m[4]} km/h. Can you confirm the distance or the speed?`,
  ],
  [
    /^Con las zonas de golpe indicadas los vehículos no llegan a tocarse\. ¿En qué parte de cada vehículo fue el golpe\?$/,
    () =>
      "With the impact zones given, the vehicles never touch. Which part of each vehicle was hit?",
  ],
  [
    /^Para llegar al punto del golpe tuviste que moverte unos (\d+) m hacia la (izquierda|derecha)\. ¿Cambiaste de carril o te abriste\?$/,
    (m) =>
      `To reach the point of impact you had to move about ${m[1]} m to the ${LADO[m[2]!]}. Did you change lanes or swing out?`,
  ],
  [
    /^Para llegar al punto del golpe, (.+?) tuvo que moverse unos (\d+) m hacia la (izquierda|derecha)\. ¿Cambió de carril o se abrió\?$/,
    (m) =>
      `To reach the point of impact, ${quien(m[1]!)} had to move about ${m[2]} m to the ${LADO[m[3]!]}. Did it change lanes or swing out?`,
  ],
  [
    /^Para que el vehículo se volcara hacía falta que fuera de lado hacia la orilla\. ¿Iba derrapando, o pegó con algo antes de voltearse\?$/,
    () =>
      "For the vehicle to roll over it had to be moving sideways toward the edge. Was it sliding, or did it hit something before rolling?",
  ],
  [
    /^¿(.+?) llegó a volcarse o a levantarse de un lado\?$/,
    (m) => `Did ${quien(m[1]!)} roll over or tip onto one side?`,
  ],
  [
    /^¿Desde dónde empezaste a frenar\? Un aproximado en metros o en largos de auto basta\.$/,
    () => "Where did you start braking? An estimate in meters or car lengths is enough.",
  ],
  [
    /^¿Desde dónde empezó a frenar (.+?)\? Un aproximado en metros o en largos de auto basta\.$/,
    (m) =>
      `Where did ${quien(m[1]!)} start braking? An estimate in meters or car lengths is enough.`,
  ],
];

/** Un mensaje del sistema en inglés, o null si no corresponde a ninguna plantilla conocida. */
export function mensajeEn(es: string): string | null {
  for (const [re, f] of PLANTILLAS) {
    const m = re.exec(es.trim());
    if (m) return f(m);
  }
  return null;
}

/** Un mensaje en el idioma de la página, con el idioma en que quedó (para `lang`). */
export function mensaje(es: string, lang: Lang): { texto: string; lang: "es-MX" | "en" } {
  if (lang === "es") return { texto: es, lang: "es-MX" };
  const en = mensajeEn(es);
  return en ? { texto: en, lang: "en" } : { texto: es, lang: "es-MX" };
}

/** Opciones de las preguntas: el valor (en español) va al servidor; la etiqueta se traduce. */
const OPCION_EN: Record<string, string> = {
  seco: "dry",
  mojado: "wet",
  encharcado: "flooded",
  sí: "yes",
  no: "no",
  "no sé": "I don't know",
  frente: "front",
  atrás: "rear",
  "lado izquierdo": "left side",
  "lado derecho": "right side",
  "cambió de carril a la izquierda": "changed lanes to the left",
  "cambió de carril a la derecha": "changed lanes to the right",
  "dio vuelta a la izquierda": "turned left",
  "dio vuelta a la derecha": "turned right",
  "siguió recto": "went straight",
  "iba derrapando": "it was sliding",
  "pegó con algo": "it hit something",
};

export function opcionEtiqueta(valor: string, lang: Lang): string {
  return lang === "en" ? (OPCION_EN[valor] ?? valor) : valor;
}

/** Cómo se nombra un vehículo en una pregunta en inglés (como `ref` de la extracción). */
function refEn(spec: EscenaSpec, vid: string, narrador: boolean): string {
  if (narrador) return "your vehicle";
  const v = spec.vehiculos.find((x) => x.id === vid);
  if (!v) return "the other vehicle";
  const fuente = v.clase.fuente;
  const declarada = fuente === "relato" || fuente === "usuario";
  return declarada ? `the ${palabra(VALOR, v.clase.valor, "en")} (${v.rol})` : `vehicle ${v.rol}`;
}

/**
 * Una pregunta lista para mostrar. En español, tal cual. En inglés, las de sensibilidad se
 * construyen desde su `id` y la escena; las de contradicción, desde su plantilla; las del
 * glosario (expresiones del español mexicano) se quedan en español.
 */
export function preguntaVista(
  p: Pregunta,
  spec: EscenaSpec | null,
  lang: Lang,
): { texto: string; lang: "es-MX" | "en" } {
  if (lang === "es") return { texto: p.texto, lang: "es-MX" };
  const [tipo, vid = ""] = p.id.split(":");
  // Quien narra se reconoce porque la pregunta en español le habla de tú.
  const narrador = /\b(ibas|alcanzaste|empezaste|tuviste)\b/i.test(p.texto);
  if (spec && p.motivo === "sensibilidad") {
    const r = refEn(spec, vid, narrador);
    if (tipo === "estado_superficie") return { texto: "Was the road dry or wet?", lang: "en" };
    if (tipo === "velocidad") {
      return {
        texto: narrador
          ? "About how fast were you going before the crash?"
          : `How fast do you think ${r} was going?`,
        lang: "en",
      };
    }
    if (tipo === "frenado") {
      return {
        texto: narrador
          ? "Did you manage to brake before the crash?"
          : `Did you see whether ${r} braked before the crash?`,
        lang: "en",
      };
    }
    if (tipo === "clase") return { texto: `What type or model of vehicle was ${r}?`, lang: "en" };
  }
  if (tipo === "glosario") return { texto: p.texto, lang: "es-MX" };
  return mensaje(p.texto, lang);
}
