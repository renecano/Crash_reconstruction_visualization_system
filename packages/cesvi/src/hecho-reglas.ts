/**
 * Lectura con reglas de un texto del expediente (ADR 0055), para cuando no hay llave de Claude o se
 * alcanzó el tope de gasto. Busca los términos del glosario de CESVI oración por oración y atribuye
 * cada dato al vehículo que menciona la oración (en una declaración, la primera persona es el
 * vehículo de quien declara). Cada cita es un fragmento del texto original, así que la lectura se
 * valida igual que la de Claude.
 */
import {
  plano,
  type DatoLeido,
  type Hacia,
  type LecturaHecho,
  type Maniobra,
  type ManiobraLeida,
  type TipoTexto,
  type VehiculoLeido,
} from "./hecho-lectura";

type Letra = "A" | "B";

const vacio = (): VehiculoLeido => ({
  sentido: null,
  carril: null,
  zona_contacto: null,
  acentuacion: null,
  vertice: null,
  direccion_fuerza: null,
  maniobras: [],
  posicion_final: null,
});

/** Oraciones con su posición en el texto. */
function oraciones(texto: string): { inicio: number; texto: string }[] {
  const out: { inicio: number; texto: string }[] = [];
  // Un punto entre dígitos (15.89) no termina la oración.
  const re = /(?:[^.;\n]|\.(?=\d))+[.;]?/g;
  for (const m of texto.matchAll(re)) {
    if (m[0].trim()) out.push({ inicio: m.index, texto: m[0] });
  }
  return out;
}

/** Palabras con que el texto nombra a cada vehículo (letra, marca, tipo). */
function nombresDe(descripcion: string): RegExp {
  const palabras = plano(descripcion)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  return new RegExp(`\\b(${palabras.join("|") || "\\$^"})\\b`);
}

const CARDINAL = "(norte|sur|oriente|poniente)";
const SENTIDO = new RegExp(`de ${CARDINAL} a(?:l)? ${CARDINAL}`);
const CARRIL = /carril (izquierdo|derecho|central)|acotamiento/;
const ZONA = /(parte (?:frontal|delantera|posterior|trasera)|lado (?:izquierdo|derecho))/;
const ACENTO =
  /(acentuaci[o]n|acentuad[ao]|cargad[ao]) (?:hacia |a |al )?(?:el |la )?(?:lado )?(izquierdo|derecho|izquierda|derecha)/;
const VERTICE = /vertice (delantero|posterior|trasero) (izquierdo|derecho)/;
const FUERZA =
  /de (adelante|atras|izquierda|derecha|arriba|abajo) (?:hacia|a) (adelante|delante|atras|izquierda|derecha|arriba|abajo)/;
const RESTOS = /restos/;
const METROS = /(\d+(?:[.,]\d+)?) ?(?:m\b|metros)/;
const MODALIDADES =
  /\b(alcance|colision frontal|colision lateral|crucero|volcadura|salida de camino|atropellamiento)\b/;
const VIA =
  /(carpeta asfaltica|concreto hidraulico|terraceria|lineas? discontinuas?|lineas? continuas?|tramo recto|curva|pendiente)/g;

const MANIOBRAS: [RegExp, Maniobra, string][] = [
  [/\b(revers\w*|retroce\w*)/, "reversa", "reversa"],
  [/\b(me pare|se detuvo|detenid[oa]|se detiene|alto total)\b/, "se_detiene", "se detiene"],
  [/\b(fren\w*)/, "frena", "frena"],
  [/\b(circulaba|circula|venia|se desplazaba|transitaba)\b/, "circula", "circula"],
  [/\b(evasiva|evadir|esquivar)\b/, "evasiva", "maniobra evasiva"],
];

/** Lee un texto con reglas. `vehiculos` dice cómo se llama cada uno («Chevrolet Silverado 2500»). */
export function leerConReglas(
  texto: string,
  tipo: TipoTexto,
  vehiculos: { A: string; B: string },
  declarante: Letra = "A",
): LecturaHecho {
  const l: LecturaHecho = {
    modalidad: null,
    vehiculos: { A: vacio(), B: vacio() },
    restos: [],
    huellas: [],
    via: [],
    preguntas: [],
  };
  const nombre = { A: nombresDe(vehiculos.A), B: nombresDe(vehiculos.B) };
  const otro: Letra = declarante === "A" ? "B" : "A";
  const cita = (o: { inicio: number; texto: string }, m: RegExpMatchArray, desde = 0): string => {
    const i = (m.index ?? 0) + desde;
    return o.texto.slice(i, i + m[0].length);
  };

  for (const o of oraciones(texto)) {
    const p = plano(o.texto);
    const menciona = {
      A: /vehiculo a\b/.test(p) || nombre.A.test(p),
      B:
        /vehiculo b\b/.test(p) ||
        nombre.B.test(p) ||
        (tipo === "declaracion" && /camioneta|carro|auto|coche|el otro/.test(p)),
    };
    const ambos = /ambos|los dos/.test(p) || (menciona.A && menciona.B);
    // A quién se refiere la oración: el que menciona; en una declaración, si no menciona a nadie,
    // a quien declara.
    const sujeto: Letra[] = ambos
      ? ["A", "B"]
      : menciona.A
        ? ["A"]
        : menciona.B && tipo === "descripcion"
          ? ["B"]
          : tipo === "declaracion"
            ? [declarante]
            : [];

    const s = SENTIDO.exec(p);
    if (s) {
      for (const v of sujeto.length ? sujeto : (["A"] as Letra[])) {
        l.vehiculos[v].sentido ??= {
          valor: `de ${s[1]} a ${s[2]}`,
          cita: cita(o, s),
          hacia: s[2] as Hacia,
        };
      }
    }
    const asigna = (
      re: RegExp,
      campo: keyof Omit<VehiculoLeido, "maniobras" | "sentido">,
      valor?: (m: RegExpMatchArray) => string,
    ) => {
      const m = re.exec(p);
      if (!m) return;
      for (const v of sujeto.length === 1 ? sujeto : []) {
        const d: DatoLeido = { valor: valor ? valor(m) : m[0], cita: cita(o, m) };
        l.vehiculos[v][campo] ??= d;
      }
    };
    asigna(CARRIL, "carril");
    asigna(ZONA, "zona_contacto");
    asigna(ACENTO, "acentuacion", (m) => `hacia el lado ${m[2]!.replace(/a$/, "o")}`);
    asigna(VERTICE, "vertice", (m) => `vértice ${m[1] === "trasero" ? "posterior" : m[1]} ${m[2]}`);
    asigna(FUERZA, "direccion_fuerza", (m) => m[0].replace("atras", "atrás"));

    // Maniobras, en el orden del texto. En una declaración, lo que hace «el otro» (llegó, me
    // impactó) no es maniobra de quien declara.
    const hallazgos: { i: number; m: ManiobraLeida; v: Letra }[] = [];
    for (const [re, tipoM, valor] of MANIOBRAS) {
      const m = re.exec(p);
      if (!m) continue;
      const metros = tipoM === "reversa" ? METROS.exec(p.slice(m.index ?? 0)) : null;
      const v: Letra = tipo === "declaracion" ? declarante : sujeto.length === 1 ? sujeto[0]! : "A";
      hallazgos.push({
        i: m.index ?? 0,
        v,
        m: {
          valor,
          cita: cita(o, m),
          tipo: tipoM,
          metros: metros ? Number(metros[1]!.replace(",", ".")) : null,
        },
      });
    }
    for (const h of hallazgos.sort((a, b) => a.i - b.i)) {
      // Con «metros», la cita se extiende hasta el número para que lo respalde.
      if (h.m.metros !== null) {
        const fin = p.indexOf(String(h.m.metros).replace(".", "."), h.i);
        if (fin >= 0) h.m.cita = o.texto.slice(h.i, fin + String(h.m.metros).length + 2).trim();
      }
      l.vehiculos[h.v].maniobras.push(h.m);
    }
    if (tipo === "declaracion" && /(llego|vino|me (?:impacto|pego|choco))/.test(p)) {
      const m = /(llego|vino|me (?:impacto|pego|choco))/.exec(p)!;
      l.vehiculos[otro].maniobras.push({
        valor: "circula",
        cita: cita(o, m),
        tipo: "circula",
        metros: null,
      });
    }

    if (RESTOS.test(p)) {
      const r = RESTOS.exec(p)!;
      const m = METROS.exec(p.slice(r.index));
      const fin = m ? r.index + (m.index ?? 0) + m[0].length : r.index + r[0].length;
      l.restos.push({
        valor: m ? `restos a lo largo de ${m[1]} m` : "restos",
        cita: o.texto.slice(r.index, fin),
        metros: m ? Number(m[1]!.replace(",", ".")) : null,
      });
    }
    const mod = MODALIDADES.exec(p);
    if (mod && !l.modalidad)
      l.modalidad = { valor: mod[1]!.replace("colision", "colisión"), cita: cita(o, mod) };
    for (const v of p.matchAll(VIA)) {
      l.via.push({ valor: v[0], cita: o.texto.slice(v.index, v.index + v[0].length) });
    }
  }
  void otro;
  return l;
}
