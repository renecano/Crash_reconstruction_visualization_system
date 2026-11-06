"use client";
/**
 * Las piezas del catálogo de movimiento (rediseño «Laboratorio», prompt §6), con Motion. Cada una
 * corre una sola vez al aparecer: nada se mueve solo mientras el perito trabaja. Con
 * `prefers-reduced-motion` todo sale en su estado final.
 */
import { animate, LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { CURVA, curvaCuenta, textoContado } from "@/lib/movimiento";

export function Movimiento({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}

/** `rise`: sube con desenfoque. `i` es su lugar en un escalonado (cada uno 100 ms después). */
export function Sube({
  children,
  i = 0,
  className,
  testid,
}: {
  children: ReactNode;
  i?: number;
  className?: string;
  testid?: string;
}) {
  const quieto = useReducedMotion();
  return (
    <m.div
      className={className}
      data-testid={testid}
      initial={quieto ? false : { opacity: 0, y: 18, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.75, ease: CURVA, delay: i * 0.1 }}
    >
      {children}
    </m.div>
  );
}

/** `line`: un título que sube desde una máscara. Cambiar `clave` lo repite (Presentar). */
export function Linea({ children, clave }: { children: ReactNode; clave?: string }) {
  const quieto = useReducedMotion();
  return (
    <span className="block overflow-hidden pb-[0.12em]">
      <m.span
        key={clave}
        className="block"
        initial={quieto ? false : { y: "110%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.9, ease: CURVA }}
      >
        {children}
      </m.span>
    </span>
  );
}

/**
 * `count`: una cifra protagonista cuenta desde 0 y termina exactamente en el valor del cálculo.
 */
export function Cuenta({
  valor,
  decimales,
  sufijo = "",
  prefijo = "",
  className,
  testid,
}: {
  valor: number;
  decimales: number;
  sufijo?: string;
  /** El signo de una diferencia («+»): `valor` va sin él. */
  prefijo?: string;
  className?: string;
  testid?: string;
}) {
  const quieto = useReducedMotion();
  const nodo = useRef<HTMLSpanElement>(null);
  const final = `${prefijo}${valor.toFixed(decimales)}${sufijo}`;
  useEffect(() => {
    const n = nodo.current;
    if (!n) return undefined;
    if (quieto) {
      n.textContent = final;
      return undefined;
    }
    const a = animate(0, 1, {
      duration: 1.45,
      ease: "linear",
      onUpdate: (p) => {
        n.textContent = `${prefijo}${textoContado(valor, decimales, p)}${sufijo}`;
      },
    });
    return () => a.stop();
  }, [valor, decimales, sufijo, prefijo, final, quieto]);
  return (
    <span ref={nodo} className={className} data-testid={testid}>
      {quieto ? final : `${prefijo}${textoContado(valor, decimales, 0)}${sufijo}`}
    </span>
  );
}

/** `grow`: una barra crece desde abajo (o desde su mediana, a lo ancho). */
export function Crece({
  className,
  style,
  i = 0,
  eje = "y",
  origen = "bottom",
}: {
  className?: string;
  style?: React.CSSProperties;
  i?: number;
  eje?: "x" | "y";
  origen?: string;
}) {
  const quieto = useReducedMotion();
  const clave = eje === "y" ? "scaleY" : "scaleX";
  return (
    <m.span
      className={className}
      style={{ ...style, transformOrigin: origen }}
      initial={quieto ? false : { [clave]: 0 }}
      animate={{ [clave]: 1 }}
      transition={{ duration: 0.7, ease: CURVA, delay: i * 0.03 }}
    />
  );
}

/** `draw`: un dibujo se traza de izquierda a derecha. */
export function Traza({ children, retraso = 0 }: { children: ReactNode; retraso?: number }) {
  const quieto = useReducedMotion();
  return (
    <m.g
      initial={quieto ? false : { clipPath: "inset(-20% 100% -20% 0%)" }}
      animate={{ clipPath: "inset(-20% -5% -20% 0%)" }}
      transition={{ duration: 1.25, ease: (p) => curvaCuenta(p), delay: retraso }}
    >
      {children}
    </m.g>
  );
}

/** `pulse`: el impacto suelta un anillo, una vez. */
export function Anillo({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const quieto = useReducedMotion();
  if (quieto) return null;
  return (
    <m.circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke="var(--senal)"
      strokeWidth={r * 0.12}
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
      initial={{ opacity: 0.9, scale: 1 }}
      animate={{ opacity: 0, scale: 3.4 }}
      transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
      aria-hidden="true"
    />
  );
}

/** Un marcador que se desliza a su lugar en una regla (Contra CESVI). */
export function Desliza({
  pos,
  desde = 50,
  className,
  tip,
}: {
  pos: number;
  desde?: number;
  className?: string;
  tip?: string;
}) {
  const quieto = useReducedMotion();
  return (
    <m.span
      className={className}
      tabIndex={tip ? 0 : undefined}
      data-tip={tip}
      initial={quieto ? false : { left: `${desde}%`, opacity: 0 }}
      animate={{ left: `${pos}%`, opacity: 1 }}
      transition={{ duration: 1.2, ease: CURVA, delay: 0.2 }}
    />
  );
}
