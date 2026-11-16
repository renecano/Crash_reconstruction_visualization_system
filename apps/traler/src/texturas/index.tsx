/**
 * Las texturas del tráiler, generadas en código (René, 2026-11-16): papel con grano, papel
 * milimétrico, tinta que se expande y grano de película. Son SVG (filtros feTurbulence y patrones):
 * no llevan imágenes ni recursos de terceros, escalan a cualquier resolución y se animan con el
 * cuadro de Remotion. Todo lo aleatorio lleva semilla. Sin decisiones creativas: los colores y los
 * tiempos son parámetros con valores neutros; el storyboard decide.
 */
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { avance, azar, semillaDelCuadro } from "./azar";

/** Los colores del sistema de la app (el de señal es #FF5B2E). */
export const COLORES = {
  senal: "#FF5B2E",
  papel: "#F4F1EA",
  tinta: "#14161B",
  linea: "#C9C3B6",
} as const;

/**
 * Papel con grano: un fondo de papel con fibras finas (ruido fractal) que casi no se mueve. Con
 * `vivo`, el grano cambia cada `cada` cuadros, como papel filmado.
 */
export function PapelConGrano({
  color = COLORES.papel,
  intensidad = 0.08,
  semilla = 7,
  vivo = false,
  cada = 3,
}: {
  color?: string;
  intensidad?: number;
  semilla?: number;
  vivo?: boolean;
  cada?: number;
}) {
  const cuadro = useCurrentFrame();
  const s = vivo ? semillaDelCuadro(semilla, cuadro, cada) : semilla;
  return (
    <AbsoluteFill style={{ backgroundColor: color }}>
      <svg width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
        <filter id={`papel-${semilla}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.6" numOctaves={4} seed={s} />
          <feColorMatrix
            type="matrix"
            values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${intensidad * 4} ${-intensidad}`}
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#papel-${semilla})`} />
      </svg>
    </AbsoluteFill>
  );
}

/**
 * Papel milimétrico: líneas de 1 mm, más marcadas cada 5 y cada 10. `mm` es cuántos píxeles mide un
 * milímetro. Se dibuja de izquierda a derecha entre `desde` y `hasta` cuadros (con `hasta` = 0 ya
 * está completo).
 */
export function PapelMilimetrico({
  mm = 8,
  color = COLORES.linea,
  desde = 0,
  hasta = 0,
}: {
  mm?: number;
  color?: string;
  desde?: number;
  hasta?: number;
}) {
  const cuadro = useCurrentFrame();
  const visible = hasta > desde ? avance(cuadro, desde, hasta) : 1;
  const id = `mm-${mm}`;
  return (
    <AbsoluteFill>
      <svg width="100%" height="100%" aria-hidden="true">
        <defs>
          <pattern id={`${id}-1`} width={mm} height={mm} patternUnits="userSpaceOnUse">
            <path
              d={`M ${mm} 0 L 0 0 0 ${mm}`}
              fill="none"
              stroke={color}
              strokeWidth={0.5}
              opacity={0.5}
            />
          </pattern>
          <pattern id={`${id}-5`} width={mm * 5} height={mm * 5} patternUnits="userSpaceOnUse">
            <rect width={mm * 5} height={mm * 5} fill={`url(#${id}-1)`} />
            <path
              d={`M ${mm * 5} 0 L 0 0 0 ${mm * 5}`}
              fill="none"
              stroke={color}
              strokeWidth={0.9}
            />
          </pattern>
          <pattern id={`${id}-10`} width={mm * 10} height={mm * 10} patternUnits="userSpaceOnUse">
            <rect width={mm * 10} height={mm * 10} fill={`url(#${id}-5)`} />
            <path
              d={`M ${mm * 10} 0 L 0 0 0 ${mm * 10}`}
              fill="none"
              stroke={color}
              strokeWidth={1.6}
            />
          </pattern>
          <clipPath id={`${id}-recorte`}>
            <rect width={`${visible * 100}%`} height="100%" />
          </clipPath>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id}-10)`} clipPath={`url(#${id}-recorte)`} />
      </svg>
    </AbsoluteFill>
  );
}

/**
 * Tinta que se expande: una mancha que crece desde (x, y) entre `desde` y `hasta` cuadros, con el
 * borde irregular de la tinta en papel (ruido que desplaza el contorno).
 */
export function TintaQueSeExpande({
  x = 0.5,
  y = 0.5,
  radio = 0.35,
  color = COLORES.tinta,
  desde = 0,
  hasta = 45,
  semilla = 11,
}: {
  /** El centro, en fracciones del cuadro. */
  x?: number;
  y?: number;
  /** El radio final, en fracciones del lado menor. */
  radio?: number;
  color?: string;
  desde?: number;
  hasta?: number;
  semilla?: number;
}) {
  const cuadro = useCurrentFrame();
  const r = radio * avance(cuadro, desde, hasta);
  const id = `tinta-${semilla}`;
  return (
    <AbsoluteFill>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012"
            numOctaves={3}
            seed={semilla}
            result="ruido"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="ruido"
            scale={60}
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feGaussianBlur stdDeviation={1.2} />
        </filter>
        <circle cx={x * 1000} cy={y * 1000} r={r * 1000} fill={color} filter={`url(#${id})`} />
      </svg>
    </AbsoluteFill>
  );
}

/**
 * Grano de película: ruido fino que cambia en cada cuadro, encima de todo (mezcla «overlay»). Con
 * `rayas`, alguna raya vertical tenue que aparece y desaparece (con semilla).
 */
export function GranoDePelicula({
  intensidad = 0.12,
  semilla = 3,
  rayas = false,
}: {
  intensidad?: number;
  semilla?: number;
  rayas?: boolean;
}) {
  const cuadro = useCurrentFrame();
  const s = semillaDelCuadro(semilla, cuadro);
  const r = azar(s);
  const raya = rayas && r() < 0.25 ? { x: r() * 100, ancho: 0.08 + r() * 0.15 } : null;
  return (
    <AbsoluteFill style={{ mixBlendMode: "overlay", pointerEvents: "none" }}>
      <svg width="100%" height="100%" aria-hidden="true">
        <filter id={`grano-${s}`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves={2}
            seed={s}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grano-${s})`} opacity={intensidad} />
        {raya ? (
          <rect
            x={`${raya.x}%`}
            width={`${raya.ancho}%`}
            height="100%"
            fill="#fff"
            opacity={0.18}
          />
        ) : null}
      </svg>
    </AbsoluteFill>
  );
}
