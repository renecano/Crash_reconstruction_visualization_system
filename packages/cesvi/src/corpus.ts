/**
 * El corpus estructurado de los dictámenes de CESVI (C0, docs/cesvi/PLAN-CESVI.md §3): cada dictamen
 * se lee con Claude en una lista plana de datos (`ESQUEMA_CORPUS`) y Croquis la convierte en un
 * expediente del contrato v2 (`expedienteDeSalida`).
 *
 * La lista es plana (cada fila: sección, número de grupo, vehículo, campo, valor y cita) porque un
 * esquema con una estructura por sección pasa el límite de gramática de la salida estructurada de
 * la API; la lista cabe sin importar cuántas secciones haya. Los valores cerrados se revisan aquí
 * contra las enumeraciones del contrato.
 *
 * Lo que hace Croquis al volver, sin confiar en el modelo:
 * - un valor fuera de su enumeración o un campo que no es de su sección se descarta y se cuenta;
 * - cada cita debe estar en el dictamen (sin distinguir acentos, mayúsculas ni espacios); si no está,
 *   se quita y se cuenta;
 * - cada número debe estar escrito en una cita encontrada de su grupo; si no, se quita y se cuenta;
 * - las citas y los textos que se guardan pasan por la redacción de datos personales;
 * - el expediente se valida contra el JSON Schema y el validador semántico.
 *
 * La IA ordena lo que dice el dictamen: copia los números como están escritos; las unidades de las
 * medidas de deformación (cm a m) y de altura (m a cm) las convierte este código.
 */
import { redact, sha256Hex } from "@croquis/extraction";
import {
  checkExpediente,
  ESCENA_JSON_SCHEMA,
  expedienteErrors,
  type EscenaSpec,
} from "@croquis/scene-schema";
import { GLOSARIO, glosarioParaPrompt, ubicarCita } from "./hecho-lectura";

export const VERSION_PROMPT_CORPUS = "corpus-cesvi-v2";

export type Expediente = NonNullable<EscenaSpec["expediente"]>;

// --- Enumeraciones: las del contrato -----------------------------------------------------------

type Prop = { enum?: string[]; items?: Prop; properties?: Record<string, Prop> };
const DEFS = (ESCENA_JSON_SCHEMA as unknown as { $defs: Record<string, Prop> }).$defs;
const enumDe = (def: string, ...ruta: string[]): string[] => {
  let p = DEFS[def]!;
  for (const r of ruta) p = (p.properties ?? p.items!.properties)![r]!;
  const e = p.enum ?? p.items?.enum;
  if (!e) throw new Error(`Sin enum en ${def}/${ruta.join("/")}`);
  return e;
};

export const MODALIDADES = enumDe("Modalidad");
export const VEREDICTOS = enumDe("ResultadoExpediente", "conclusion", "veredicto");

/** Hasta 8 vehículos por dictamen: V1, V2… en el orden en que el dictamen los presenta. */
export const IDS_VEHICULO = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"] as const;

/** Las secciones y sus campos. */
export const CAMPOS_POR_SECCION = {
  caso: ["modalidad", "aseguradora", "fecha_hora", "lugar", "municipio", "entidad"],
  vehiculo: ["marca", "modelo", "anio", "clase", "masa", "rigidez"],
  dano: [
    "cara",
    "tercio",
    "vertice",
    "altura",
    "direccion",
    "tipo",
    "magnitud",
    "medidas",
    "intercambio",
    "previo",
  ],
  impacto: ["participante", "objeto_fijo"],
  declaracion: ["version", "maniobra"],
  restos: ["longitud"],
  huella: ["tipo_huella", "longitud"],
  objeto_fijo: ["descripcion"],
  calculo: ["metodo", "resultado", "entradas"],
  criterio: ["criterio", "estado"],
  conclusion: ["veredicto"],
} as const;
export type Seccion = keyof typeof CAMPOS_POR_SECCION;
const SECCIONES = Object.keys(CAMPOS_POR_SECCION) as Seccion[];
const CAMPOS = [...new Set(Object.values(CAMPOS_POR_SECCION).flat())];

/** Los valores permitidos de los campos cerrados (los del contrato). */
export const VALORES: Record<string, readonly string[]> = {
  modalidad: MODALIDADES,
  clase: enumDe("VehiculoExpediente", "clase"),
  cara: enumDe("ZonaDiagrama", "cara"),
  tercio: enumDe("ZonaDiagrama", "tercio"),
  vertice: enumDe("ZonaDiagrama", "vertice"),
  direccion: enumDe("DireccionDeformacion"),
  tipo: enumDe("DanoExpediente", "tipos"),
  magnitud: enumDe("DanoExpediente", "magnitud", "cualitativa"),
  previo: ["si", "no"],
  participante: IDS_VEHICULO,
  maniobra: enumDe("ManiobraExpediente", "tipo"),
  tipo_huella: enumDe("EvidenciasLugar", "huellas", "tipo"),
  metodo: enumDe("CalculoExpediente", "metodo"),
  criterio: enumDe("CriterioExpediente", "criterio"),
  estado: enumDe("CriterioExpediente", "estado"),
  veredicto: VEREDICTOS,
};

// --- Lo que devuelve el modelo ------------------------------------------------------------------

const texto = { type: "string" };
const enumeracion = (valores: readonly string[]) => ({ type: "string", enum: [...valores] });

/** La salida estructurada: una lista plana de datos, todos con sus seis campos. */
export const ESQUEMA_CORPUS = {
  type: "object",
  properties: {
    datos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          seccion: enumeracion(SECCIONES),
          n: { type: "integer" },
          vehiculo: enumeracion([...IDS_VEHICULO, "ninguno"]),
          campo: enumeracion(CAMPOS),
          valor: texto,
          cita: texto,
        },
        required: ["seccion", "n", "vehiculo", "campo", "valor", "cita"],
        additionalProperties: false,
      },
    },
  },
  required: ["datos"],
  additionalProperties: false,
} as const;

export interface FilaCorpus {
  seccion: Seccion;
  n: number;
  vehiculo: (typeof IDS_VEHICULO)[number] | "ninguno";
  campo: string;
  valor: string;
  cita: string;
}
export interface SalidaCorpus {
  datos: FilaCorpus[];
}

// --- El prompt ----------------------------------------------------------------------------------

const lista = (campo: string) => VALORES[campo]!.join(", ");

export const SISTEMA_CORPUS = `Eres asistente de los peritos de CESVI México. Lees un dictamen técnico completo de un hecho de tránsito y ordenas lo que dice en una lista de datos, con el vocabulario técnico de los dictámenes de CESVI. Solo ordenas: no opinas, no completas lo que falta y no calculas.

Cada dato es una fila: sección, n (el número del grupo dentro de la sección: el daño 1, el daño 2, el impacto 1…), vehículo (V1, V2… o «ninguno»), campo, valor y cita.

Reglas generales:
- Solo escribe lo que el dictamen dice. Si no lo dice, no pongas la fila.
- «cita» es un fragmento copiado literal del dictamen, de 3 a 40 palabras, sin cambiar ni una letra (puede cortar a media oración). Ponla en la primera fila de cada grupo y en cada fila que salga de otra frase; en las demás filas del grupo, "". Una cita que no esté en el dictamen se descarta.
- Los números se copian tal como están escritos, con su unidad (p. ej. "1,450 kg" o "15.89 m"). No conviertas, no redondees y no hagas cuentas. Un número que no esté escrito en una cita de su grupo se descarta.
- Los campos de valores cerrados usan exactamente uno de los valores de la lista; si ninguno corresponde, no pongas la fila.
- Nunca escribas placas, VIN, números de serie ni nombres de personas en ningún valor, y evítalos en las citas.

Vehículos: V1, V2, V3… en el orden en que el dictamen los presenta por primera vez, incluidos los que solo menciona sin dar sus datos (p. ej. «el vehículo B»). Úsalos igual en todas las secciones.

Secciones y campos:
- caso (n 1, vehículo «ninguno»): modalidad (una fila por modalidad: ${lista("modalidad")}), aseguradora, fecha_hora, lugar (la dirección como la escribe), municipio, entidad (el estado de la república).
- vehiculo (n 1, 2…; vehículo V1, V2…): marca, modelo (lo que el dictamen llama tipo o versión, p. ej. «Matiz»), anio (el año modelo), clase (solo si es clara: ${lista("clase")}), masa (p. ej. "1,450 kg") y rigidez (p. ej. "A = 52,000 N/m, B = 345,000 N/m²"), solo si las escribe.
- dano (un grupo por cada zona dañada de cada vehículo que describe, incluidas las previas o sin relación; vehículo = el dañado):
  - cara (${lista("cara")}); tercio (izquierdo, centro o derecho en el frente y la parte posterior; delantero, medio o trasero en los laterales); vertice (${lista("vertice")});
  - altura: la altura del daño desde el piso, como "45 a 95 cm" (o un solo valor);
  - direccion: la dirección de la deformación (${lista("direccion")}; una fila por dirección);
  - tipo (${lista("tipo")}; una fila por tipo); magnitud (${lista("magnitud")}) si la califica;
  - medidas: las medidas de deformación C1…C6 y el ancho L, como "C1 0.96, C2 0.86, L 1.689 m";
  - intercambio: el material transferido, su color y sobre qué zona (p. ej. "pintura blanca sobre la defensa trasera");
  - previo: «si» si el dictamen dice que el daño es previo, con óxido o sin relación con el hecho.
- impacto (n = el orden en la secuencia: 1, 2, 3…; una carambola tiene varios; vehículo «ninguno»): participante (una fila por cada vehículo que participa, aunque el dictamen no dé sus datos: V1, V2…) y objeto_fijo (poste, muro, guarnición, registro, árbol…) si el impacto es contra un objeto. Todo impacto tiene dos participantes, o un participante y un objeto_fijo.
- declaracion (un grupo por cada versión de un conductor que el dictamen transcribe o resume; vehículo = el del declarante): version (valor "", con la cita más representativa de esa versión, hasta 60 palabras) y maniobra (lo que el conductor dice que hizo: ${lista("maniobra")}; una fila por maniobra).
- restos (n 1): longitud de la zona de restos (p. ej. "15.89 m"), si la mide.
- huella (un grupo por huella; vehículo = el que la dejó o «ninguno»): tipo_huella (${lista("tipo_huella")}) y longitud.
- objeto_fijo (un grupo por objeto fijo dañado): descripcion.
- calculo (un grupo por cada cálculo que hace el dictamen; vehículo = el del cálculo o «ninguno»): metodo (${lista("metodo")}), resultado con su unidad tal como lo escribe (p. ej. "220.19 kJ") y entradas: las que escribe con su valor, separadas por punto y coma (p. ej. "L = 1.689 m; A = 52,000 N/m; C1 = 0.96 m").
- criterio (un grupo por cada criterio de correspondencia que analiza): criterio (${lista("criterio")}) y estado (${lista("estado")}).
- conclusion (n 1): veredicto sobre la versión declarada o el hecho reportado a la aseguradora, con la frase de la conclusión como cita:
  - se_sostiene: concluye que los daños corresponden con el hecho reportado o con la versión declarada;
  - no_se_sostiene: concluye que no corresponden, o que la mecánica declarada no es posible;
  - parcial: concluye que una parte sí corresponde y otra no (algunos daños sí y otros no; el contacto sí, pero no como se declaró). Si unos daños no corresponden y de los demás no se puede determinar, es no_se_sostiene;
  - sin_juicio: no se pronuncia (solo describe, reconstruye o calcula).

Vocabulario de los dictámenes de CESVI, con en cuántos de los ${GLOSARIO.dictamenes} dictámenes aparece cada término:
${glosarioParaPrompt()}`;

export function mensajeCorpus(textoDictamen: string): string {
  return `Dictamen:\n\n${textoDictamen}`;
}

// --- Documentos crudos --------------------------------------------------------------------------

export interface DocumentoCrudo {
  /** `cesvi-` y 10 caracteres del SHA-256 del nombre del archivo (el nombre no se guarda). */
  id: string;
  archivo: string;
  texto: string;
}

/** Los dictámenes de un lote crudo (`# Document: <archivo>`). */
export function dividirLote(md: string): DocumentoCrudo[] {
  return md
    .split(/^# Document: /m)
    .slice(1)
    .map((bloque) => {
      const salto = bloque.indexOf("\n");
      const archivo = bloque.slice(0, salto).trim();
      return { id: idDocumento(archivo), archivo, texto: bloque.slice(salto + 1).trim() };
    });
}

export function idDocumento(archivo: string): string {
  return `cesvi-${sha256Hex(archivo).slice(0, 10)}`;
}

// --- Números escritos ---------------------------------------------------------------------------

const RX_NUMERO = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:[.,]\d+)?/g;

/** Un número escrito: la coma con tres cifras detrás es de miles; si no, decimal. */
function leerNumero(x: string): number {
  return /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(x)
    ? Number(x.replace(/,/g, ""))
    : Number(x.replace(",", "."));
}

/** Los números de un valor del modelo, en orden ("45 a 95 cm" → [45, 95]). */
export function numerosEscritos(t: string): number[] {
  return [...t.matchAll(RX_NUMERO)].map((m) => leerNumero(m[0]));
}

/** El primero ("1,450 kg" → 1450; "0,45" → 0.45; "" → null). */
export function numeroEscrito(t: string): number | null {
  return numerosEscritos(t)[0] ?? null;
}

/** Lo que sigue al primer número: su unidad ("220.19 kJ" → "kJ"). */
export function unidadEscrita(t: string): string {
  const m = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:[.,]\d+)?/.exec(t);
  if (!m) return "";
  return t
    .slice(m.index + m[0].length)
    .split(/[,;(]/)[0]!
    .trim()
    .slice(0, 20);
}

/** Los números escritos en una cita, leyendo la coma como decimal y como separador de miles. */
export function numerosEnCita(cita: string): number[] {
  const out: number[] = [];
  for (const m of cita.matchAll(RX_NUMERO)) {
    const x = m[0];
    out.push(leerNumero(x));
    if (/^-?\d+,\d+$/.test(x)) out.push(Number(x.replace(/,/g, "")), Number(x.replace(",", ".")));
  }
  return out;
}

// --- Grupos -------------------------------------------------------------------------------------

export interface Grupo {
  seccion: Seccion;
  n: number;
  vehiculo: (typeof IDS_VEHICULO)[number] | null;
  valores: Map<string, string[]>;
  citas: string[];
}

/** Las filas por grupo (sección y n), con los valores cerrados revisados contra el contrato. */
export function agrupar(filas: FilaCorpus[]): { grupos: Grupo[]; invalidos: number } {
  const grupos = new Map<string, Grupo>();
  let invalidos = 0;
  for (const f of filas) {
    const valor = f.valor.trim();
    const campos = CAMPOS_POR_SECCION[f.seccion] as readonly string[] | undefined;
    const cerrados = VALORES[f.campo];
    if (!campos?.includes(f.campo) || (cerrados && !cerrados.includes(valor))) {
      invalidos++;
      continue;
    }
    const k = `${f.seccion}:${f.n}`;
    let g = grupos.get(k);
    if (!g) {
      g = { seccion: f.seccion, n: f.n, vehiculo: null, valores: new Map(), citas: [] };
      grupos.set(k, g);
    }
    if (f.vehiculo !== "ninguno") g.vehiculo ??= f.vehiculo;
    if (valor || f.campo === "version")
      g.valores.set(f.campo, [...(g.valores.get(f.campo) ?? []), valor]);
    if (f.cita.trim() && !g.citas.includes(f.cita.trim())) g.citas.push(f.cita.trim());
  }
  const orden = (g: Grupo) => SECCIONES.indexOf(g.seccion);
  return {
    grupos: [...grupos.values()].sort((a, b) => orden(a) - orden(b) || a.n - b.n),
    invalidos,
  };
}

// --- De la salida al expediente -----------------------------------------------------------------

export interface Conteos {
  filas: number;
  valores_invalidos: number;
  citas: number;
  citas_fuera: number;
  numeros: number;
  numeros_fuera: number;
}

export interface Conversion {
  expediente: Expediente;
  conteos: Conteos;
}

const F = "dictamen_importado" as const;
const redondear = (x: number) => Math.round(x * 1e6) / 1e6;
/** El objeto sin sus claves `undefined`. */
const limpio = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
const algo = <T extends object>(o: T): T | undefined => (Object.keys(o).length ? o : undefined);
const noVacio = <T>(xs: T[]): T[] | undefined => (xs.length ? xs : undefined);
/**
 * El texto sin datos personales. Un «nombre» justo después de «marca» es la marca del vehículo
 * (p. ej. «Mercedes Benz»), no una persona: se conserva.
 */
export function redactar(t: string): string {
  const r = redact(t);
  let out = "";
  let pos = 0;
  for (const sp of r.spans) {
    const marca = sp.kind === "NOMBRE" && /\bmarca\s+$/i.test(t.slice(0, sp.start));
    out += t.slice(pos, sp.start) + (marca ? sp.original : `[${sp.kind}]`);
    pos = sp.end;
  }
  return out + t.slice(pos);
}

const libre = (t: string, max: number): string | undefined => {
  const r = redactar(t.trim()).trim();
  return r ? r.slice(0, max) : undefined;
};

/** La salida del modelo como expediente, revisada contra el texto del dictamen. */
export function expedienteDeSalida(s: SalidaCorpus, textoDictamen: string): Conversion {
  const { grupos, invalidos } = agrupar(s.datos);
  const conteos: Conteos = {
    filas: s.datos.length,
    valores_invalidos: invalidos,
    citas: 0,
    citas_fuera: 0,
    numeros: 0,
    numeros_fuera: 0,
  };

  // Las citas encontradas de cada grupo: la primera se guarda (redactada); todas sirven para los números.
  const encontradas = new Map<Grupo, string[]>();
  for (const g of grupos) {
    const ok: string[] = [];
    for (const c of g.citas) {
      conteos.citas++;
      if (ubicarCita(textoDictamen, c)) ok.push(c);
      else conteos.citas_fuera++;
    }
    encontradas.set(g, ok);
  }
  const cita = (g: Grupo): { texto: string } | undefined => {
    const c = encontradas.get(g)![0];
    if (!c) return undefined;
    const r = redactar(c);
    return { texto: r.length > 1200 ? `${r.slice(0, 1199)}…` : r };
  };
  /** El número, si está escrito en una cita encontrada del grupo. */
  const num = (n: number | null, g: Grupo): number | undefined => {
    if (n === null || !Number.isFinite(n)) return undefined;
    conteos.numeros++;
    const escritos = encontradas.get(g)!.flatMap(numerosEnCita);
    if (escritos.some((x) => Math.abs(x - n) < 1e-9)) return n;
    conteos.numeros_fuera++;
    return undefined;
  };
  const uno = (g: Grupo, campo: string) => g.valores.get(campo)?.[0] ?? "";
  const varios = (g: Grupo, campo: string) => [...new Set(g.valores.get(campo) ?? [])];
  const medida = (g: Grupo, campo: string, unidadPorOmision: string) => {
    const t = uno(g, campo);
    const v = num(numeroEscrito(t), g);
    return v === undefined
      ? undefined
      : { valor: v, unidad: unidadEscrita(t) || unidadPorOmision, fuente: F };
  };
  const dato = (g: Grupo, campo: string) => {
    // La marca y el modelo de un vehículo nunca son datos personales: no se redactan.
    const t = uno(g, campo).trim();
    const v =
      campo === "marca" || campo === "modelo" ? t.slice(0, 600) || undefined : libre(t, 600);
    return v ? { valor: v, fuente: F } : undefined;
  };
  const de = (seccion: Seccion) => grupos.filter((g) => g.seccion === seccion);

  // Caso
  const caso0 = de("caso")[0];
  const lugar = caso0
    ? algo(
        limpio({
          descripcion: dato(caso0, "lugar"),
          municipio: dato(caso0, "municipio"),
          estado: dato(caso0, "entidad"),
        }),
      )
    : undefined;
  const caso: Expediente["caso"] = limpio({
    aseguradora: caso0 && dato(caso0, "aseguradora"),
    fecha_hora: caso0 && dato(caso0, "fecha_hora"),
    lugar,
    modalidades: (caso0 ? varios(caso0, "modalidad") : []).slice(
      0,
      6,
    ) as Expediente["caso"]["modalidades"],
  });

  // Vehículos: los de su sección y, sin datos, los que solo aparecen en otras secciones.
  const vehiculos: Expediente["vehiculos"] = [];
  const ids = new Set<string>();
  for (const g of de("vehiculo")) {
    const id = g.vehiculo ?? IDS_VEHICULO[g.n - 1];
    if (!id || ids.has(id)) continue;
    ids.add(id);
    const anio = num(numeroEscrito(uno(g, "anio")), g);
    const masa = medida(g, "masa", "kg");
    const rig = uno(g, "rigidez");
    const a = num(numeroEscrito(/\bA\s*[=:]?\s*([-\d.,]+)/.exec(rig)?.[1] ?? ""), g);
    const b = num(numeroEscrito(/\bB\s*[=:]?\s*([-\d.,]+)/.exec(rig)?.[1] ?? ""), g);
    const c = cita(g);
    vehiculos.push(
      limpio({
        id,
        marca: dato(g, "marca"),
        modelo: dato(g, "modelo"),
        anio:
          anio !== undefined && Number.isInteger(anio) && anio >= 1900 && anio <= 2100
            ? anio
            : undefined,
        clase: (uno(g, "clase") || undefined) as Expediente["vehiculos"][number]["clase"],
        masa: masa && { ...masa, ...(c && { cita: c }) },
        rigidez:
          a !== undefined && b !== undefined
            ? { A: a, B: b, fuente: "dictamen" as const, ...(c && { cita: c }) }
            : undefined,
      }),
    );
  }
  const referidos = [
    ...grupos.map((g) => g.vehiculo),
    ...de("impacto").flatMap((g) => varios(g, "participante")),
  ].filter((v): v is string => !!v);
  for (const id of IDS_VEHICULO.filter((v) => referidos.includes(v) && !ids.has(v))) {
    ids.add(id);
    vehiculos.push({ id });
  }
  vehiculos.sort((x, y) => x.id.localeCompare(y.id));

  // Daños
  const danos = de("dano")
    .filter((g) => g.vehiculo && uno(g, "cara"))
    .map((g) => {
      const t = uno(g, "altura");
      const k = /\bcm\b|cent/i.test(t) || !/\bm\b|metro/i.test(t) ? 1 : 100;
      const hs = numerosEscritos(t)
        .map((x) => num(x, g))
        .filter((x): x is number => x !== undefined)
        .map((x) => redondear(x * k));
      const m = uno(g, "medidas");
      const km = /\bmm\b/i.test(m) ? 0.001 : /\bcm\b|cent/i.test(m) ? 0.01 : 1;
      const pares = [...m.matchAll(/\b(C[1-6]|L)\s*[=:]?\s*(-?\d[\d.,]*\d|\d)/gi)].map((p) => ({
        k: p[1]!.toUpperCase(),
        v: num(leerNumero(p[2]!), g),
      }));
      const cs = pares
        .filter((p) => p.k !== "L" && p.v !== undefined)
        .map((p) => redondear(p.v! * km));
      const l = pares.find((p) => p.k === "L")?.v;
      const tercio = uno(g, "tercio");
      return limpio({
        vehiculo: g.vehiculo!,
        zona: limpio({
          cara: uno(g, "cara"),
          tercio: tercio || undefined,
          vertice: uno(g, "vertice") || undefined,
        }),
        altura_cm: hs.length ? { min: Math.min(...hs), max: Math.max(...hs) } : undefined,
        direcciones: noVacio(varios(g, "direccion").slice(0, 4)),
        tipos: noVacio(varios(g, "tipo").slice(0, 7)),
        magnitud: algo(
          limpio({
            cualitativa: uno(g, "magnitud") || undefined,
            c_m: noVacio(cs.slice(0, 6)),
            l_m: l !== undefined ? redondear(l * km) : undefined,
          }),
        ),
        intercambio_material: (() => {
          const i = libre(uno(g, "intercambio"), 200);
          return i ? { sobre: i } : undefined;
        })(),
        dano_previo: uno(g, "previo") === "si" || undefined,
        fuente: F,
        cita: cita(g),
      });
    }) as NonNullable<Expediente["danos"]>;

  const impactos = de("impacto").map((g) =>
    limpio({
      orden: g.n,
      vehiculos: noVacio(varios(g, "participante")),
      objeto_fijo: libre(uno(g, "objeto_fijo"), 120),
      fuente: F,
      cita: cita(g),
    }),
  ) as NonNullable<Expediente["impactos"]>;

  const versiones = de("declaracion").map((g) =>
    limpio({
      tipo: "declarada" as const,
      declarante: g.vehiculo ?? undefined,
      declaracion: cita(g),
      maniobras: g.vehiculo
        ? noVacio(
            varios(g, "maniobra")
              .slice(0, 20)
              .map((tipo) => ({ vehiculo: g.vehiculo!, tipo })),
          )
        : undefined,
    }),
  ) as NonNullable<Expediente["versiones"]>;

  const restos0 = de("restos")[0];
  const huellas = de("huella")
    .filter((g) => uno(g, "tipo_huella"))
    .map((g) =>
      limpio({
        tipo: uno(g, "tipo_huella"),
        vehiculo: g.vehiculo ?? undefined,
        longitud: medida(g, "longitud", "m"),
        cita: cita(g),
      }),
    );
  const objetos = de("objeto_fijo")
    .map((g) => libre(uno(g, "descripcion"), 200))
    .filter((x): x is string => !!x);
  const evidencias = algo(
    limpio({
      restos: restos0
        ? algo(limpio({ longitud: medida(restos0, "longitud", "m"), cita: cita(restos0) }))
        : undefined,
      huellas: noVacio(huellas),
      objetos_fijos_danados: noVacio(objetos),
    }),
  ) as Expediente["evidencias"];

  const calculos = de("calculo")
    .filter((g) => uno(g, "metodo"))
    .map((g) => {
      const entradas = uno(g, "entradas")
        .split(";")
        .map((e) => /^\s*([^=:]+?)\s*[=:]\s*(.+?)\s*$/.exec(e))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => ({
          nombre: m[1]!.slice(0, 40),
          v: num(numeroEscrito(m[2]!), g),
          u: unidadEscrita(m[2]!),
        }))
        .filter((e) => e.v !== undefined)
        .slice(0, 20)
        .map((e) => ({ nombre: e.nombre, valor: { valor: e.v!, unidad: e.u || "-", fuente: F } }));
      return limpio({
        metodo: uno(g, "metodo"),
        entradas: noVacio(entradas),
        resultado: medida(g, "resultado", "-"),
        vehiculo: g.vehiculo ?? undefined,
        cita: cita(g),
      });
    }) as NonNullable<Expediente["calculos"]>;

  const criterios = de("criterio")
    .filter((g) => uno(g, "criterio") && uno(g, "estado"))
    .map((g) =>
      limpio({ criterio: uno(g, "criterio"), estado: uno(g, "estado"), cita: cita(g) }),
    ) as NonNullable<Expediente["criterios"]>;

  const conclusion0 = de("conclusion").find((g) => uno(g, "veredicto"));
  const expediente = limpio({
    caso,
    vehiculos,
    danos: noVacio(danos),
    impactos: noVacio(impactos),
    versiones: noVacio(versiones),
    evidencias,
    calculos: noVacio(calculos),
    criterios: noVacio(criterios),
    resultado: conclusion0
      ? {
          conclusion: limpio({
            veredicto: uno(conclusion0, "veredicto"),
            cita: cita(conclusion0),
            fuente: F,
          }),
        }
      : undefined,
  }) as Expediente;
  return { expediente, conteos };
}

/** Problemas del expediente: el JSON Schema y, si pasa, los errores semánticos. */
export function problemasExpediente(e: Expediente): string[] {
  const esquema = expedienteErrors(e);
  if (esquema.length) return esquema.map((x) => `esquema ${x}`);
  return checkExpediente(e)
    .filter((p) => p.severidad === "error")
    .map((p) => `${p.codigo} ${p.ruta}: ${p.mensaje}`);
}

// --- Partición --------------------------------------------------------------------------------

export interface ParaParticion {
  id: string;
  modalidad: string;
  veredicto: string;
}

/**
 * Partición fija: 30 % de prueba, estratificada por modalidad principal y conclusión. Dentro de
 * cada estrato, los dictámenes se ordenan por el SHA-256 de `semilla:id` y la prueba se queda con
 * los primeros `round(0.3 · n)`. Devuelve los ids de prueba, ordenados.
 */
export function particionPrueba(docs: ParaParticion[], semilla: number, fraccion = 0.3): string[] {
  const estratos = new Map<string, ParaParticion[]>();
  for (const d of docs) {
    const k = `${d.modalidad}|${d.veredicto}`;
    estratos.set(k, [...(estratos.get(k) ?? []), d]);
  }
  const prueba: string[] = [];
  for (const grupo of estratos.values()) {
    const orden = grupo
      .map((d) => ({ id: d.id, h: sha256Hex(`${semilla}:${d.id}`) }))
      .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
    prueba.push(...orden.slice(0, Math.round(fraccion * grupo.length)).map((x) => x.id));
  }
  return prueba.sort();
}
