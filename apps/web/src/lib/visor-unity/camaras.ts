/**
 * Las cámaras del 3D en el nombre del puente de Unity (`CamaraVisor` de `visor-puente.ts`), y el
 * catálogo de las que tiene un caso (René, 2026-11-16, A6): las generales y, por cada vehículo, la
 * que va detrás siguiéndolo, la del conductor y la del daño; la de cada persona que va a pie, en bici
 * o en moto. Cada una con su nombre en el lenguaje del perito.
 */
import type { CamaraVisor } from "@croquis/scene-schema";

/** «Detrás de A»: siguiéndolo, 8 m atrás y 2.6 m arriba (la cámara «cerca» de Unity). */
export const DETRAS = { azimut: 180, distancia: 8, altura: 2.6 } as const;

/** De qué lado mira cada cara del vehículo, desde su frente hacia su derecha (°). */
const AZIMUT_CARA: Record<string, number> = {
  frontal: 0,
  posterior: 180,
  lateral_derecho: 90,
  lateral_izquierdo: -90,
};

const n = (x: number) => Number(x.toFixed(2));

/**
 * «Detrás de A», siguiéndolo. La distancia y la altura crecen con el largo del vehículo: con las de
 * un sedán, detrás de una camioneta la cámara quedaba pegada a su techo (ronda 2, A6: «Detrás de C»).
 * Un sedán de 4.5 m conserva los 8 m y 2.6 m de siempre.
 */
export function camaraDetras(resId: string, largoM = 4.5): CamaraVisor {
  const distancia = Math.max(DETRAS.distancia, (DETRAS.distancia * largoM) / 4.5);
  // La misma proporción de siempre, y 0.3 m más arriba por cada metro extra de largo.
  const altura = (DETRAS.altura * distancia) / DETRAS.distancia + 0.3 * Math.max(0, largoM - 4.5);
  return `cerca:${resId}:${DETRAS.azimut}:${n(distancia)}:${n(altura)}`;
}

export function camaraUnity(pedida: string | null | undefined): CamaraVisor {
  if (!pedida) return "cinematica";
  if (pedida === "libre" || pedida === "orbita") return "orbita";
  if (pedida.startsWith("conductor-")) return `conductor:${pedida.slice("conductor-".length)}`;
  if (pedida.startsWith("conductor:")) return pedida as CamaraVisor;
  if (pedida.startsWith("cerca:") || pedida.startsWith("persona:")) return pedida as CamaraVisor;
  // «Detrás de A» lo sigue de verdad (antes iba a la cinematográfica).
  if (pedida.startsWith("detras-"))
    return `cerca:${pedida.slice("detras-".length)}:${DETRAS.azimut}:${DETRAS.distancia}:${DETRAS.altura}`;
  if (pedida === "cenital" || pedida === "cinematica" || pedida === "acera") return pedida;
  return "cinematica";
}

/**
 * El acercamiento al daño (como el de three.js): frente a la cara golpeada, abierto 60° para que lo
 * que golpeó no tape, a 32° de elevación y a una distancia que encuadra el vehículo.
 */
export function camaraDano(resId: string, cara: string | null, largoM = 4.5): CamaraVisor {
  const az = (AZIMUT_CARA[cara ?? "frontal"] ?? 0) + 60;
  const d = Math.max(5.5, 1.7 * largoM);
  const el = (32 * Math.PI) / 180;
  return `cerca:${resId}:${n(az)}:${n(d * Math.cos(el))}:${n(d * Math.sin(el))}`;
}

export interface CamaraDelCaso {
  /** Lo que se manda a Unity. */
  modo: CamaraVisor;
  nombre: string;
  grupo: "general" | "vehiculo" | "persona";
  /** Cómo se llama su grupo en el selector: «Generales», «A · Jetta», «Personas». */
  grupoNombre: string;
  /** El vehículo (su id en la escena, `resId`) de las cámaras de un vehículo. */
  vehiculo?: string;
  /** Al elegirla, el 3D va al instante del impacto (la del daño). */
  alImpacto?: boolean;
}

export interface VehiculoParaCamaras {
  /** El id del vehículo en la escena de Unity. */
  resId: string;
  /** «A · Silverado 2500», como el panel. */
  nombre: string;
  letra: string;
  /** La cara del daño principal (`frontal`, `posterior`, `lateral_derecho`, `lateral_izquierdo`). */
  cara?: string | null;
  largoM?: number;
}

export interface PersonaParaCamaras {
  id: string;
  /** `peaton`, `ciclista`, `motociclista`… */
  rol: string;
}

const NOMBRE_ROL: Record<string, string> = {
  peaton: "Peatón",
  ciclista: "Ciclista",
  motociclista: "Motociclista",
};

/**
 * Todas las cámaras de un caso: las generales, las de cada vehículo y las de las personas que no van
 * dentro de un vehículo (a pie, en bici o en moto).
 */
export function camarasDelCaso(
  vehiculos: readonly VehiculoParaCamaras[],
  personas: readonly PersonaParaCamaras[] = [],
  /** Con un build que la entiende (puente 1.5.0): la «Automática» del video, también en el 3D. */
  conAutomatica = false,
): CamaraDelCaso[] {
  const generales: CamaraDelCaso[] = [
    // René, 2026-11-28 (ensayo de la demo): la que lleva el video, también para verla en el 3D.
    ...(conAutomatica
      ? [
          {
            modo: "automatica",
            nombre: "Automática: la llegada, el impacto y el final",
            grupo: "general",
            grupoNombre: "Generales",
          } as CamaraDelCaso,
        ]
      : []),
    {
      modo: "orbita",
      nombre: "Alrededor de la escena (se puede girar)",
      grupo: "general",
      grupoNombre: "Generales",
    },
    { modo: "cenital", nombre: "Desde arriba", grupo: "general", grupoNombre: "Generales" },
    {
      modo: "cinematica",
      nombre: "Cinematográfica (automática)",
      grupo: "general",
      grupoNombre: "Generales",
    },
    { modo: "acera", nombre: "Desde la acera", grupo: "general", grupoNombre: "Generales" },
  ];
  const porVehiculo = vehiculos.flatMap((v): CamaraDelCaso[] => [
    {
      modo: camaraDetras(v.resId, v.largoM),
      nombre: `Detrás de ${v.nombre}`,
      grupo: "vehiculo",
      grupoNombre: v.nombre,
      vehiculo: v.resId,
    },
    {
      modo: `conductor:${v.resId}`,
      nombre: `Lo que veía el conductor de ${v.letra}`,
      grupo: "vehiculo",
      grupoNombre: v.nombre,
      vehiculo: v.resId,
    },
    {
      modo: camaraDano(v.resId, v.cara ?? null, v.largoM),
      nombre: `El daño de ${v.letra}, en el impacto`,
      grupo: "vehiculo",
      grupoNombre: v.nombre,
      vehiculo: v.resId,
      alImpacto: true,
    },
  ]);
  const deLasPersonas = personas
    .filter((p) => p.rol in NOMBRE_ROL)
    .map((p, k, xs): CamaraDelCaso => ({
      modo: `persona:${p.id}`,
      nombre:
        xs.filter((x) => x.rol === p.rol).length > 1
          ? `${NOMBRE_ROL[p.rol]} ${k + 1}`
          : NOMBRE_ROL[p.rol]!,
      grupo: "persona",
      grupoNombre: "Personas",
    }));
  return [...generales, ...porVehiculo, ...deLasPersonas];
}
