/**
 * La Escena avisa si un vehículo quedó sobre un edificio o atravesando un muro del mapa (René,
 * 2026-11-24, punto 2: «un auto colocado de lado atravesaba una casa»). Revisa las poses que se ven en
 * La escena (choque y donde quedó); el recorrido completo lo revisa la reconstrucción
 * (`conObstaculos`) y, si cruza uno, dice que no cuadra.
 */
import {
  cruzaObstaculo,
  enMetros,
  medidasDe,
  type Expediente,
  type LonLat,
  type ObstaculoDelMapa,
} from "@croquis/cesvi";
import { poseDe } from "./escena-facil";

export interface PoseEnObstaculo {
  vehiculo: string;
  fase: "impacto" | "final";
  obstaculo: ObstaculoDelMapa;
}

export function posesEnObstaculos(
  e: Expediente,
  obstaculos: readonly ObstaculoDelMapa[],
): PoseEnObstaculo[] {
  if (!obstaculos.length) return [];
  const out: PoseEnObstaculo[] = [];
  const poses = e.vehiculos.flatMap((v) =>
    (["impacto", "final"] as const).flatMap((fase) => {
      const p = poseDe(e, v.id, fase);
      return p ? [{ ...p, fase, v }] : [];
    }),
  );
  for (const p of poses) {
    const v = p.v;
    if (v.clase === "bicicleta") continue;
    const origen: LonLat = [p.punto.lon, p.punto.lat];
    const m = medidasDe(v);
    // La pose guarda el rumbo desde el norte, en grados; el rectángulo, desde el este, en radianes.
    const rect = {
      x: 0,
      y: 0,
      largo: m.largo,
      ancho: m.ancho,
      rumbo: ((90 - p.rumbo) * Math.PI) / 180,
    };
    for (const ob of obstaculos) {
      const puntos = ob.puntos.map((q) => {
        const d = enMetros(q, origen);
        return { x: d.este, y: d.norte };
      });
      // Solo los cercanos (a menos de 60 m del vehículo).
      if (!puntos.some((q) => Math.hypot(q.x, q.y) < 60)) continue;
      if (cruzaObstaculo(rect, { puntos, cerrado: ob.tipo === "edificio" })) {
        out.push({ vehiculo: String(v.id), fase: p.fase, obstaculo: ob });
        break;
      }
    }
  }
  return out;
}
