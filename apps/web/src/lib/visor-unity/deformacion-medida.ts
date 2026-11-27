/**
 * La deformación medida por CESVI en el 3D (René, 2026-11-24: «en el de AXA, para ir a 60 km/h siento
 * que el impacto es súper ligero»). El 3D dibujaba el aplastamiento que calcula el solver para el
 * choque reconstruido (5 cm parejos en el frente de la Tacoma), aunque el reporte midiera 96, 86, 52 y
 * 20 cm. Donde el reporte mide la deformación (su perfil C1–Cn y su ancho L), el paquete del 3D lleva
 * esa, en la cara que se midió, y el visor la rotula «deformación medida por CESVI». No cambia ningún
 * número de la reconstrucción: solo lo que dibuja el 3D.
 */
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";

type Json = Record<string, unknown>;

/** Un perfil de n puntos llevado a m puntos repartidos a lo ancho (interpolación lineal). */
export function remuestrear(perfil: readonly number[], m: number): number[] {
  const n = perfil.length;
  if (n === m) return [...perfil];
  if (n === 1) return Array.from({ length: m }, () => perfil[0]!);
  return Array.from({ length: m }, (_, i) => {
    const x = (i * (n - 1)) / (m - 1);
    const k = Math.min(n - 2, Math.floor(x));
    const t = x - k;
    return Math.round((perfil[k]! * (1 - t) + perfil[k + 1]! * t) * 1e6) / 1e6;
  });
}

export interface DeformacionMedida {
  vehiculo: string;
  lado: string;
  perfil_m: number[];
  ancho_m: number;
}

/** Las deformaciones medidas de la escena: las que el perito o el reporte dieron con su perfil. */
export function deformacionesMedidas(escena: EscenaSpec): DeformacionMedida[] {
  return (((escena as unknown as Json).danos_declarados ?? []) as Json[]).flatMap((d) => {
    const perfil = (d.perfil_aplastamiento as Json | undefined)?.valor as number[] | undefined;
    const ancho = Number((d.ancho_danado as Json | undefined)?.valor);
    const fuente = String(((d.procedencia ?? {}) as Json).fuente ?? "");
    if (!perfil?.length || !(ancho > 0) || fuente === "supuesto") return [];
    return [
      {
        vehiculo: String(d.vehiculo_id),
        lado: String(((d.zona ?? {}) as Json).lado ?? ""),
        perfil_m: perfil,
        ancho_m: ancho,
      },
    ];
  });
}

/**
 * El Resultado que dibuja el 3D, con la deformación medida en lugar de la calculada, en el vehículo y
 * la cara que se midió. Si el solver no dejó daño en esa cara (otro lado), no se toca.
 */
export function conDeformacionMedida(escena: EscenaSpec, resultado: Resultado): Resultado {
  const medidas = deformacionesMedidas(escena);
  if (!medidas.length) return resultado;
  const r = structuredClone(resultado) as unknown as Json & { vehiculos: Json[] };
  for (const v of r.vehiculos) {
    const m = medidas.find((x) => x.vehiculo === v.id);
    const dano = v.dano as Json | undefined;
    if (!m || !dano) continue;
    const lado = ((dano.cdc ?? {}) as Json).lado;
    if (lado && m.lado && lado !== m.lado) continue;
    const n = ((dano.perfil_m as number[] | undefined) ?? []).length || 6;
    dano.perfil_m = remuestrear(m.perfil_m, n);
    dano.ancho_m = m.ancho_m;
  }
  return r as unknown as Resultado;
}
