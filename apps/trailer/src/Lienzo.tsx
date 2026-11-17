/**
 * Un lienzo del tamaño del video en el que cada cuadro se dibuja de cero, antes de que Remotion tome
 * la captura (`useLayoutEffect`). El dibujo depende solo del cuadro: el mismo cuadro sale igual.
 */
import { useLayoutEffect, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

export interface Marco {
  ctx: CanvasRenderingContext2D;
  ancho: number;
  alto: number;
  /** La unidad de dibujo: 1 en un video de 1080 de lado menor, 2 en 4K. */
  u: number;
  cuadro: number;
}

export function Lienzo({ dibuja }: { dibuja: (m: Marco) => void }) {
  const cuadro = useCurrentFrame();
  const { width: ancho, height: alto } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, ancho, alto);
    dibuja({ ctx, ancho, alto, u: Math.min(ancho, alto) / 1080, cuadro });
  });
  return (
    <canvas
      ref={ref}
      width={ancho}
      height={alto}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
