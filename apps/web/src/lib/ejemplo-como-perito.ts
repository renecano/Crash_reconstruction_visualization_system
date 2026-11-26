/**
 * Un ejemplo armado como lo arma el perito en La escena (René, 2026-11-26): la escena que propone La
 * escena con la narración, el lugar y las calles guardadas del ejemplo (`proponerEscena`, la misma que
 * usa la app), corregida donde no coincide con la narración, con las mismas funciones que usa La
 * escena al corregir:
 *
 * - **Por dónde venía:** si la propuesta contradice el sentido narrado, la flecha de la calle que
 *   coincide con la narración (`flechasDeLlegada`, `flechaPropuesta`, `elegirDireccion`).
 * - **Dónde quedó:** lo que La escena lee de la narración (`finalDeLaNarracion`) o, si no lo lee, lo
 *   que el perito toca en el mapa siguiendo el texto (`tocarFinal`, alineado a la calle).
 * - Puntos de paso y terreno, como en La escena.
 *
 * La usan la tabla del índice (`cifras-ronda4.test.ts`) y la prueba que compara con la app
 * (`e2e/ejemplos-como-perito.spec.ts`): así la tabla no tiene una versión propia de La escena.
 */
import {
  rumboDeLlegada,
  separarLugarYSentido,
  type Expediente,
  type PosicionDescrita,
} from "@croquis/cesvi";
import { respuestaDeGuardadas } from "./calles-guardadas";
import {
  agregarChoqueIntermedio,
  agregarPuntoDePaso,
  callesDe,
  contraNarracion,
  elegirDireccion,
  finalDeLaNarracion,
  flechaPropuesta,
  flechasDeLlegada,
  marcarFinal,
  nombresDe,
  nombreVehiculo,
  OBJETOS_C1,
  ponerTerrenoEn,
  poseDe,
  puntoDelChoqueTocado,
  quedoJuntoAlChoque,
  sentidoNarrado,
  tocarChoque,
  tocarFinal,
  type Punto,
} from "./escena-facil";
import { proponerEscena, rumboDelSentido } from "./escena-propuesta";
import { impactosAColocar } from "./pasos-caso";

/**
 * Un lugar que el perito toca siguiendo el texto: (este, norte) metros desde el choque («7 metros al
 * Norte del área de contacto»), o metros adelante y a la izquierda de la marcha de un vehículo en el
 * choque («5 metros adelante del área de restos»; «hasta un poste… a 1.50 m del borde»).
 */
export type LugarTocado =
  readonly [number, number] | { de: string; adelante: number; izquierda?: number };

/** Lo que el perito hace con un ejemplo, siguiendo el texto de su narración. */
export interface RecetaPerito {
  clave: string;
  /**
   * Por dónde venía cada vehículo que la narración ubica sin un punto cardinal que La escena lea
   * («salía en reversa de ese acceso vehicular» contra el costado izquierdo del que iba de sur a
   * norte: desde el poniente). Si la propuesta se aparta más de 45°, el perito toca la flecha de esa
   * calle o, sin calle, el mapa en esa dirección.
   */
  venia?: Record<string, "norte" | "sur" | "oriente" | "poniente">;
  /** Los choques posteriores entre vehículos que el perito toca en la lista («choque-<orden>»). */
  choques?: { orden: number; en: LugarTocado }[];
  /**
   * «¿Chocó contra algo más?»: el vehículo (por una palabra de su nombre), el objeto de La escena
   * («poste») y dónde (el poste del ejemplo). Completa el choque que trae la narración.
   */
  otros?: { vehiculo: string; objeto: (typeof OBJETOS_C1)[number]["id"]; en: LugarTocado }[];
  /**
   * Dónde quedó cada vehículo (por una palabra de su nombre): «narracion» si La escena lo lee del
   * texto; un lugar tocado si el perito lo marca como dice el texto; «junto» si quedó junto al choque.
   */
  quedo: Record<string, "narracion" | "junto" | LugarTocado>;
  /** Por dónde pasó. */
  pasos?: { vehiculo: string; en: LugarTocado }[];
  /** El terreno que dice la narración. */
  terreno?: { tipo: "terraceria" | "tope-circular"; en: LugarTocado }[];
}

/** El rumbo de llegada de quien viene desde ese punto cardinal (hacia dónde avanza). */
const LLEGA_DESDE = { norte: 180, sur: 0, oriente: 270, poniente: 90 } as const;

/**
 * Lo que hace el perito en La escena, en orden, con los lugares en metros (este, norte) desde el primer
 * choque: lo sigue la receta del navegador (`e2e/recetas-perito.ts`), para que la app y la tabla
 * hagan lo mismo.
 */
export type ToquePerito =
  | { accion: "direccion"; vehiculo: string; como: "confirmar" }
  | { accion: "direccion"; vehiculo: string; como: "flecha"; rumbo: number }
  | { accion: "direccion"; vehiculo: string; como: "mapa"; en: [number, number] }
  | { accion: "choque"; orden: number; en: [number, number] }
  | { accion: "otro"; vehiculo: string; objeto: string; en: [number, number] }
  | { accion: "final"; vehiculo: string; como: "junto" | "narracion" }
  | { accion: "final"; vehiculo: string; como: "marcar"; en: [number, number] }
  | { accion: "paso"; vehiculo: string; en: [number, number] }
  | { accion: "terreno"; boton: string; en: [number, number] };

export interface EscenaComoPerito {
  expediente: Expediente;
  /** El punto del primer choque. */
  choque: Punto;
  /** El punto de cada choque, por orden. */
  puntos: Record<number, Punto>;
  /** La escena que propuso La escena, antes de corregirla (para compararla con la de la app). */
  propuesta: { expediente: Expediente; puntos: Record<number, Punto> };
  /** Qué corrigió el perito sobre la propuesta, en palabras. */
  notas: string[];
  /** Lo que hizo, en orden, para repetirlo en el navegador. */
  toques: ToquePerito[];
}

/** (este, norte) metros de `p` desde `c`, a centímetros. */
export function enMetrosDesde(c: Punto, p: Punto): [number, number] {
  const r = (x: number) => Math.round(x * 100) / 100;
  return [
    r((p.lon - c.lon) * 111320 * Math.cos((c.lat * Math.PI) / 180)),
    r((p.lat - c.lat) * 111320),
  ];
}

const de = <T>(mapa: Record<string, T>, nombre: string) =>
  Object.entries(mapa).find(([k]) => nombre.includes(k))?.[1];

/** Un punto a (este, norte) metros de `c`. */
export function aMetros(c: Punto, este: number, norte: number): Punto {
  return {
    lat: c.lat + norte / 111320,
    lon: c.lon + este / (111320 * Math.cos((c.lat * Math.PI) / 180)),
  };
}

/**
 * La escena del ejemplo como la deja el perito. `e0` ya trae el lugar del ejemplo (coordenadas y
 * calles guardadas, `conLugarDelEjemplo`); `posiciones`, lo que la lectura dice de cada posición.
 */
export function escenaComoPerito(
  e0: Expediente,
  narracion: string,
  posiciones: readonly PosicionDescrita[],
  receta: RecetaPerito,
): EscenaComoPerito {
  const lugar = e0.caso.lugar as
    | {
        coordenadas?: { lat: number; lon: number };
        descripcion?: { valor?: string };
        calles_del_mapa?: Parameters<typeof respuestaDeGuardadas>[0];
      }
    | undefined;
  const coords = lugar?.coordenadas;
  if (!coords || !lugar?.calles_del_mapa)
    throw new Error(`${receta.clave}: sin el lugar o las calles guardadas del ejemplo.`);
  const calles = callesDe(respuestaDeGuardadas(lugar.calles_del_mapa));
  const impactos = impactosAColocar(e0);
  const vs = e0.vehiculos;
  const nombre = (id: string) =>
    nombreVehiculo(
      vs.find((v) => v.id === id)!,
      vs,
    );
  // El sentido del lugar como lo calcula La escena (sin destino buscado en la red).
  const sentidoDelLugar =
    separarLugarYSentido(lugar.descripcion?.valor).sentido ??
    separarLugarYSentido(narracion).sentido;
  const notas: string[] = [];
  const toques: ToquePerito[] = [];
  if (sentidoDelLugar?.tipo === "destino")
    notas.push(`El sentido del lugar es un destino («${sentidoDelLugar.destino}»): sin buscarlo.`);
  const prop = proponerEscena({
    expediente: e0,
    impactos,
    calles,
    narracion,
    lugar: { lat: coords.lat, lon: coords.lon },
    nombreDe: nombre,
    rumboNarrado: rumboDelSentido(sentidoDelLugar, null, { lat: coords.lat, lon: coords.lon }),
  });
  if (!prop) throw new Error(`${receta.clave}: La escena no propuso nada.`);
  let e = prop.expediente;
  const puntos: Record<number, Punto> = { ...prop.puntos };
  const puntoDe = (orden: number) => puntos[orden] ?? null;
  const choque = puntoDe(1);
  if (!choque) throw new Error(`${receta.clave}: la propuesta no puso el choque.`);
  /** El lugar que toca el perito, con la marcha que tiene el vehículo en ese momento. */
  const tocado = (l: LugarTocado): Punto => {
    if (Array.isArray(l)) return aMetros(choque, l[0], l[1]);
    const r = l as { de: string; adelante: number; izquierda?: number };
    const v = vs.find((x) => nombre(x.id).includes(r.de));
    const pose = v ? poseDe(e, v.id, "impacto") : null;
    if (!v || !pose) throw new Error(`${receta.clave}: no está «${r.de}» en el choque.`);
    const h = (rumboDeLlegada(e, v.id, pose.rumbo) * Math.PI) / 180;
    const iz = r.izquierda ?? 0;
    return aMetros(
      choque,
      r.adelante * Math.sin(h) - iz * Math.cos(h),
      r.adelante * Math.cos(h) + iz * Math.sin(h),
    );
  };

  // Por dónde venía: lo propuesto, salvo que contradiga la narración.
  for (const v of vs) {
    const pose = poseDe(e, v.id, "impacto");
    if (!pose) continue;
    const desde = de(receta.venia ?? {}, nombre(v.id));
    if (desde) {
      const quiere = LLEGA_DESDE[desde];
      const llega = rumboDeLlegada(e, v.id, pose.rumbo);
      const aparta = Math.abs(((llega - quiere + 540) % 360) - 180);
      if (aparta > 45) {
        const imp = impactos.find((i) => i.vehiculos.includes(v.id));
        const c = imp ? puntoDe(imp.orden) : null;
        const flechas = c ? flechasDeLlegada(calles, c) : [];
        const cerca = flechas
          .map((f) => ({ f, d: Math.abs(((f.rumbo - quiere + 540) % 360) - 180) }))
          .filter((x) => x.d <= 45)
          .sort((a, b) => a.d - b.d)[0];
        // Sin una flecha cerca, el perito toca el mapa a 15 m del choque, del lado de donde venía.
        const en = aMetros(
          c ?? choque,
          -15 * Math.sin((quiere * Math.PI) / 180),
          -15 * Math.cos((quiere * Math.PI) / 180),
        );
        e = elegirDireccion(e, impactos, v.id, cerca?.f.rumbo ?? quiere, puntoDe);
        toques.push(
          cerca
            ? { accion: "direccion", vehiculo: v.id, como: "flecha", rumbo: cerca.f.rumbo }
            : { accion: "direccion", vehiculo: v.id, como: "mapa", en: enMetrosDesde(choque, en) },
        );
        notas.push(
          `${nombre(v.id)}: la propuesta lo traía a ${Math.round(llega)}°; la narración lo pone desde el ${desde} (${cerca ? `la flecha del ${cerca.f.desde}` : "sin calle: se toca el mapa en esa dirección"}).`,
        );
        continue;
      }
    }
    const sentido = desde ? null : sentidoNarrado(narracion, nombresDe(v, vs));
    const imp = impactos.find((i) => i.vehiculos.includes(v.id));
    const c = imp ? puntoDe(imp.orden) : null;
    if (!sentido || !c || !contraNarracion(rumboDeLlegada(e, v.id, pose.rumbo), sentido)) {
      // Lo propuesto coincide con la narración: «Confirmar», como en La escena (`confirmarItem`).
      e = elegirDireccion(e, impactos, v.id, rumboDeLlegada(e, v.id, pose.rumbo), puntoDe);
      toques.push({ accion: "direccion", vehiculo: v.id, como: "confirmar" });
      continue;
    }
    const flechas = flechasDeLlegada(calles, c);
    const i = flechaPropuesta(flechas, sentido, null);
    if (i < 0) {
      notas.push(
        `${nombre(v.id)}: la propuesta contradice la narración y no hay flecha que coincida.`,
      );
      continue;
    }
    e = elegirDireccion(e, impactos, v.id, flechas[i]!.rumbo, puntoDe);
    toques.push({ accion: "direccion", vehiculo: v.id, como: "flecha", rumbo: flechas[i]!.rumbo });
    notas.push(
      `${nombre(v.id)}: venía ${sentido.cita}; se corrigió a la flecha del ${flechas[i]!.desde}.`,
    );
  }

  // Los choques posteriores que el perito toca.
  for (const c of receta.choques ?? []) {
    const tocadoEn = tocado(c.en);
    // Como en La escena: sobre la calle, salvo el choque contra un objeto (`puntoDelChoqueTocado`).
    const p = puntoDelChoqueTocado(e, calles, c.orden, tocadoEn);
    toques.push({ accion: "choque", orden: c.orden, en: enMetrosDesde(choque, tocadoEn) });
    const primero = impactos.find((i) => i.orden === c.orden)?.vehiculos[0];
    const v = primero ? vs.find((x) => x.id === primero) : null;
    e = tocarChoque(
      e,
      impactos,
      c.orden,
      p,
      v ? sentidoNarrado(narracion, nombresDe(v, vs)) : null,
      calles,
    );
    puntos[c.orden] = p;
  }

  // «¿Chocó contra algo más?», como en La escena (`agregarChoqueIntermedio`, sin pegarlo a la calle).
  for (const o of receta.otros ?? []) {
    const v = vs.find((x) => nombre(x.id).includes(o.vehiculo));
    if (!v) throw new Error(`${receta.clave}: no está «${o.vehiculo}».`);
    const en = tocado(o.en);
    e = agregarChoqueIntermedio(e, v.id, o.objeto, en);
    toques.push({
      accion: "otro",
      vehiculo: v.id,
      objeto: o.objeto,
      en: enMetrosDesde(choque, en),
    });
  }

  // Dónde quedó.
  const finales = posiciones.filter((p) => p.fase === "final");
  for (const v of vs) {
    const q = de(receta.quedo, nombre(v.id)) ?? "junto";
    if (q === "junto") {
      e = quedoJuntoAlChoque(e, v.id);
      toques.push({ accion: "final", vehiculo: v.id, como: "junto" });
    } else if (q === "narracion") {
      const n = finales.find((p) => p.vehiculo === v.id);
      const f = n ? finalDeLaNarracion(e, v.id, n.descripcion, finales) : null;
      if (!f) throw new Error(`${receta.clave}: La escena no lee dónde quedó ${nombre(v.id)}.`);
      e = marcarFinal(e, v.id, f.punto, f.rumbo);
      toques.push({ accion: "final", vehiculo: v.id, como: "narracion" });
    } else {
      const p = tocado(q);
      e = tocarFinal(e, v.id, p, calles);
      toques.push({
        accion: "final",
        vehiculo: v.id,
        como: "marcar",
        en: enMetrosDesde(choque, p),
      });
    }
  }
  for (const p of receta.pasos ?? []) {
    const en = tocado(p.en);
    e = agregarPuntoDePaso(e, p.vehiculo, en);
    toques.push({ accion: "paso", vehiculo: p.vehiculo, en: enMetrosDesde(choque, en) });
  }
  // «¿Cómo es el terreno?», alineado a la calle como en La escena (`ponerTerrenoEn`).
  for (const t of receta.terreno ?? []) {
    const en = tocado(t.en);
    e = ponerTerrenoEn(
      e,
      calles,
      t.tipo === "tope-circular"
        ? { clase: "tope", norma: "circular" }
        : { clase: "zona", tipo: "terraceria" },
      en,
    );
    toques.push({
      accion: "terreno",
      boton: t.tipo === "tope-circular" ? "terreno-tope-circular" : "terreno-terraceria",
      en: enMetrosDesde(choque, en),
    });
  }
  return {
    expediente: e,
    choque,
    puntos,
    propuesta: { expediente: prop.expediente, puntos: { ...prop.puntos } },
    notas,
    toques,
  };
}
