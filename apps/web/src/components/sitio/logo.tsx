/**
 * El logo de Croquis: siempre el SVG de `assets/brand/` (copiado tal cual a `public/marca/`).
 * Nunca se escribe "CROQUIS" con la fuente ni se redibuja (BRAND.md).
 */

/** Proporciones de los SVG maestros (su `viewBox`). */
const LOGOTIPO = { w: 809.04, h: 128 };

type Variante = "logotipo" | "logotipo-efectos" | "logotipo-sobre-claro";

export function Logotipo({
  ancho,
  variante = "logotipo",
  alt = "Croquis",
  className,
  prioridad = false,
}: {
  /** Ancho en px; mínimo 120 (BRAND.md). Los efectos, solo a más de 300 px. */
  ancho: number;
  variante?: Variante;
  alt?: string;
  className?: string;
  prioridad?: boolean;
}) {
  const w = Math.max(120, variante === "logotipo-efectos" ? Math.max(300, ancho) : ancho);
  const h = Math.round((w * LOGOTIPO.h) / LOGOTIPO.w);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG de marca tal cual, sin optimizar
    <img
      src={`/marca/${variante}.svg`}
      width={w}
      height={h}
      alt={alt}
      className={className}
      decoding="async"
      fetchPriority={prioridad ? "high" : undefined}
    />
  );
}

/** El símbolo solo: cuando el nombre ya está cerca o falta espacio (mínimo 24 px). */
export function Simbolo({
  lado,
  alt = "Croquis",
  className,
}: {
  lado: number;
  alt?: string;
  className?: string;
}) {
  const l = Math.max(24, lado);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG de marca tal cual, sin optimizar
    <img
      src="/marca/simbolo.svg"
      width={l}
      height={l}
      alt={alt}
      className={className}
      decoding="async"
    />
  );
}
