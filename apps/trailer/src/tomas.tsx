/**
 * Las tomas reales del 3D (Unity) dentro del tráiler. Cada hueco tiene un nombre; `render.mjs` busca
 * en `D:\Croquis-trailer\tomas` una secuencia (`<hueco>/0001.png`…) o una foto (`<hueco>.png`) y le
 * pasa a la composición lo que encontró. Si un hueco no tiene toma, la escena de papel sigue: nunca
 * se pone una imagen de relleno.
 */
import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { SANS } from "./fuentes";
import { mezcla } from "./ritmo";

/** Los huecos del tráiler, en el orden en que salen (los mismos nombres de `tomas-rtx.json`). */
export const HUECOS = ["heroe", "faros", "impacto", "aerea", "detalle-1", "detalle-2"] as const;
export type Hueco = (typeof HUECOS)[number];

/** Los archivos de cada hueco, relativos a la carpeta de tomas. Vacío o ausente: no hay toma. */
export type TomasDisponibles = Partial<Record<Hueco, string[]>>;

export const hay = (tomas: TomasDisponibles, hueco: Hueco): boolean =>
  (tomas[hueco]?.length ?? 0) > 0;

/**
 * Una toma a pantalla completa. `avance` va de 0 a 1 a lo largo del hueco: elige el cuadro de la
 * secuencia y mueve un acercamiento lento. Abajo va la leyenda que pide la app en toda vista del 3D.
 */
export function Toma({
  tomas,
  hueco,
  avance,
  acerca = [1.06, 1],
  opacidad = 1,
}: {
  tomas: TomasDisponibles;
  hueco: Hueco;
  avance: number;
  acerca?: readonly [number, number];
  opacidad?: number;
}) {
  const { width: ancho, height: alto } = useVideoConfig();
  const archivos = tomas[hueco] ?? [];
  if (!archivos.length) return null;
  const u = Math.min(ancho, alto) / 1080;
  const i = Math.min(
    archivos.length - 1,
    Math.floor(Math.min(0.9999, Math.max(0, avance)) * archivos.length),
  );
  return (
    <AbsoluteFill style={{ opacity: opacidad, backgroundColor: "#05080F", overflow: "hidden" }}>
      <Img
        src={staticFile(archivos[i]!)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${mezcla(acerca[0], acerca[1], avance)})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 44 * u,
          bottom: 36 * u,
          fontFamily: SANS,
          fontSize: 20 * u,
          letterSpacing: "0.02em",
          color: "rgba(255,255,255,0.78)",
          textShadow: "0 1px 6px rgba(0,0,0,0.6)",
        }}
      >
        Reconstrucción ilustrativa
      </div>
    </AbsoluteFill>
  );
}
