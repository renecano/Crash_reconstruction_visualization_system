/**
 * Los objetos del lugar que coloca el perito (C2, W4; PLAN-CESVI §3.4): poste, muro o pared, árbol,
 * barrera, guarnición, señal y vehículo estacionado. Viven en `expediente.objetos` y van a
 * `entorno.objetos` de la escena (`especDeExpediente`). Aquí está su edición, pura: agregar, mover,
 * girar, cambiar de tamaño y quitar, y los empalmes contra los vehículos en reposo y contra otros
 * objetos, con la propuesta para separarlos.
 *
 * Las medidas típicas son las mismas que usa la escena para un objeto sin medir (`MEDIDAS_OBJETO` en
 * `reconstruccion.ts`): un objeto que el perito no midió va con ellas, declaradas como supuesto.
 */
import type { Expediente } from "./corpus";
import { esquinas, HOLGURA_M, traslape, type Vec } from "./encimadas";
import { desdeMetros, enMetros, type LonLat } from "./geo";
import { medidasDe } from "./poses-impacto";

export type ObjetoExpediente = NonNullable<Expediente["objetos"]>[number];
export type TipoObjeto = ObjetoExpediente["tipo"];

/** Los tipos de la paleta, en su orden, con su nombre y sus medidas típicas (m). */
export const TIPOS_OBJETO: readonly {
  tipo: TipoObjeto;
  nombre: string;
  largo: number;
  ancho: number;
  /** Se le puede cambiar el largo (los tramos); a los demás, solo el grosor. */
  alargado: boolean;
}[] = [
  { tipo: "poste", nombre: "Poste", largo: 0.3, ancho: 0.3, alargado: false },
  { tipo: "muro", nombre: "Pared", largo: 6, ancho: 0.2, alargado: true },
  { tipo: "arbol", nombre: "Árbol", largo: 0.4, ancho: 0.4, alargado: false },
  { tipo: "barrera", nombre: "Barrera", largo: 6, ancho: 0.4, alargado: true },
  { tipo: "guarnicion", nombre: "Guarnición", largo: 6, ancho: 0.3, alargado: true },
  { tipo: "senal", nombre: "Señal", largo: 0.08, ancho: 0.08, alargado: false },
  {
    tipo: "vehiculo_estacionado",
    nombre: "Vehículo estacionado",
    largo: 4.3,
    ancho: 1.7,
    alargado: true,
  },
];

const tipoDe = (t: TipoObjeto) => TIPOS_OBJETO.find((x) => x.tipo === t)!;

/** Un objeto con sus medidas resueltas: las del perito o las típicas. */
export interface ObjetoColocado {
  id: string;
  tipo: TipoObjeto;
  nombre: string;
  punto: { lat: number; lon: number };
  /** Grados desde el norte, en sentido horario. */
  rumbo: number;
  largo: number;
  ancho: number;
  /** El perito cambió sus medidas (si no, son las típicas, supuesto). */
  medido: boolean;
}

const normalizar = (r: number) => ((r % 360) + 360) % 360;
/** Un decimal de grado y un centímetro: lo que el perito puede ver en pantalla. */
const redondear = (x: number, k = 100) => Math.round(x * k) / k;

export function objetosDe(e: Expediente): ObjetoColocado[] {
  return (e.objetos ?? []).map((o) => {
    const t = tipoDe(o.tipo);
    return {
      id: o.id,
      tipo: o.tipo,
      nombre: t.nombre,
      punto: o.punto,
      rumbo: o.rumbo_deg ?? 0,
      largo: o.largo_m ?? t.largo,
      ancho: o.ancho_m ?? t.ancho,
      medido: o.largo_m !== undefined || o.ancho_m !== undefined,
    };
  });
}

const conObjetos = (e: Expediente, objetos: ObjetoExpediente[]): Expediente => {
  if (objetos.length) return { ...e, objetos };
  const resto = { ...e };
  delete resto.objetos;
  return resto;
};

function cambiarObjeto(
  e: Expediente,
  id: string,
  f: (o: ObjetoExpediente) => ObjetoExpediente,
): Expediente {
  const lista = e.objetos ?? [];
  if (!lista.some((o) => o.id === id)) return e;
  return conObjetos(
    e,
    lista.map((o) => (o.id === id ? f(o) : o)),
  );
}

/** Agrega un objeto del tipo dado donde tocó el perito. Devuelve el expediente y su id. */
export function agregarObjeto(
  e: Expediente,
  tipo: TipoObjeto,
  punto: { lat: number; lon: number },
  rumbo = 0,
): { expediente: Expediente; id: string } {
  const usados = new Set((e.objetos ?? []).map((o) => o.id));
  let n = (e.objetos?.length ?? 0) + 1;
  while (usados.has(`obj-${n}`)) n++;
  const id = `obj-${n}`;
  const nuevo: ObjetoExpediente = {
    id,
    tipo,
    punto,
    rumbo_deg: redondear(normalizar(rumbo), 10) % 360,
    fuente: "perito",
  };
  return { expediente: conObjetos(e, [...(e.objetos ?? []), nuevo]), id };
}

export function moverObjeto(
  e: Expediente,
  id: string,
  punto: { lat: number; lon: number },
): Expediente {
  return cambiarObjeto(e, id, (o) => ({ ...o, punto }));
}

/** Gira un objeto `grados` (positivo, en sentido horario). */
export function girarObjeto(e: Expediente, id: string, grados: number): Expediente {
  return cambiarObjeto(e, id, (o) => ({
    ...o,
    rumbo_deg: redondear(normalizar((o.rumbo_deg ?? 0) + grados), 10) % 360,
  }));
}

/** Medidas mínimas y máximas que acepta el contrato (m), con un tope razonable para un objeto. */
const MIN_M = 0.05;
const MAX_LARGO_M = 60;
const MAX_ANCHO_M = 20;

/**
 * Cambia el tamaño: los tramos (pared, barrera, guarnición, vehículo estacionado) cambian de largo;
 * los demás (poste, árbol, señal), de grosor. `factor` multiplica la medida actual.
 */
export function cambiarTamano(e: Expediente, id: string, factor: number): Expediente {
  return cambiarObjeto(e, id, (o) => {
    const t = tipoDe(o.tipo);
    if (t.alargado) {
      const largo = Math.min(MAX_LARGO_M, Math.max(MIN_M, (o.largo_m ?? t.largo) * factor));
      return { ...o, largo_m: redondear(largo), ancho_m: o.ancho_m ?? t.ancho };
    }
    const grosor = Math.min(MAX_ANCHO_M, Math.max(MIN_M, (o.ancho_m ?? t.ancho) * factor));
    return { ...o, largo_m: redondear(grosor), ancho_m: redondear(grosor) };
  });
}

export function quitarObjeto(e: Expediente, id: string): Expediente {
  return conObjetos(
    e,
    (e.objetos ?? []).filter((o) => o.id !== id),
  );
}

// ---- Empalmes ------------------------------------------------------------------------------------

/** Un empalme: un objeto encima de un vehículo en reposo o de otro objeto. */
export interface Empalme {
  /** El objeto (siempre un objeto del perito). */
  objeto: string;
  /** Con qué: el id de un vehículo o de otro objeto. */
  con: string;
  conVehiculo: boolean;
  /** Cuánto se traslapan (m), por el eje de menor traslape. */
  traslape_m: number;
  /** Dónde queda el objeto si se separa: lo justo, sobre la normal del traslape, sin girarlo. */
  propuesta: { lat: number; lon: number };
}

/** m: un traslape menor no se avisa (es el redondeo del mapa). */
const TOLERANCIA_M = 0.01;

/**
 * Los objetos que quedan encima de un vehículo en reposo o de otro objeto. En el impacto los
 * vehículos y el objeto del choque se tocan por definición; en el reposo no ocupan el mismo lugar.
 */
export function empalmesDeObjetos(e: Expediente): Empalme[] {
  const objetos = objetosDe(e);
  if (!objetos.length) return [];
  const origen: LonLat = [objetos[0]!.punto.lon, objetos[0]!.punto.lat];
  const centro = (p: { lat: number; lon: number }): Vec => {
    const m = enMetros([p.lon, p.lat], origen);
    return [m.este, m.norte];
  };
  const cajas = objetos.map((o) => {
    const c = centro(o.punto);
    return { id: o.id, c, contorno: esquinas(c, o.rumbo, o.largo, o.ancho) };
  });
  const finales =
    e.versiones
      ?.find((v) => v.tipo === "evidencia")
      ?.posiciones?.filter((p) => p.fase === "final") ?? [];
  const vehiculos = finales.map((p) => {
    const v = e.vehiculos.find((x) => x.id === p.vehiculo);
    const { largo, ancho } = v ? medidasDe(v) : { largo: 4.5, ancho: 1.8 };
    return { id: p.vehiculo, contorno: esquinas(centro(p.punto), p.rumbo, largo, ancho) };
  });
  const out: Empalme[] = [];
  const agregar = (
    a: (typeof cajas)[number],
    con: string,
    contorno: Vec[],
    esVehiculo: boolean,
  ) => {
    const t = traslape(a.contorno, contorno);
    if (!t || t.prof < TOLERANCIA_M) return;
    // Se mueve solo el objeto, hacia afuera del otro: todo el traslape más la holgura.
    const d = t.prof + HOLGURA_M;
    const [lon, lat] = desdeMetros(a.c[0] - d * t.n[0], a.c[1] - d * t.n[1], origen);
    out.push({
      objeto: a.id,
      con,
      conVehiculo: esVehiculo,
      traslape_m: Math.round(t.prof * 100) / 100,
      propuesta: { lat, lon },
    });
  };
  for (const a of cajas) {
    for (const v of vehiculos) agregar(a, v.id, v.contorno, true);
  }
  for (let i = 0; i < cajas.length; i++) {
    for (let k = i + 1; k < cajas.length; k++) {
      agregar(cajas[k]!, cajas[i]!.id, cajas[i]!.contorno, false);
    }
  }
  return out;
}
