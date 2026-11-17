/**
 * El cierre, de 23.5 a 28 s (storyboard versión 2, cuadro 6): con el golpe, la noche vuelve a ser
 * papel y las piezas del choque arman la palabra. Los anillos del impacto se cierran sobre la mira del
 * símbolo, la C se traza como una trayectoria y las letras caen una por una. Lo que queda al final es
 * el logotipo exacto de la marca (`assets/brand/marca.json`, por `datos/marca.json`).
 */
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { MARCA, MIRA_DEL_SIMBOLO } from "../datos";
import { SANS } from "../fuentes";
import { SENAL } from "../hoja";
import { entre, FPS, mezcla, sale, suave } from "../ritmo";

const PAPEL = "#EFEBE1";
const TINTA = "#15181B";

export const LEMA = "Reconstrucción de hechos de tránsito para peritos";

export function Logo() {
  const cuadro = useCurrentFrame();
  const { width: ancho, height: alto } = useVideoConfig();
  const vertical = alto > ancho;
  const u = Math.min(ancho, alto) / 1080;
  const x = cuadro / FPS;
  const mm = 20 * u;

  // El logotipo, centrado: en vertical ocupa casi todo el ancho.
  const anchoLogo = ancho * (vertical ? 0.84 : 0.6);
  const k = anchoLogo / MARCA.ancho;
  const altoLogo = MARCA.alto * k;
  const izq = (ancho - anchoLogo) / 2;
  const arriba = alto * (vertical ? 0.42 : 0.4) - altoLogo / 2;
  const s = MARCA.simbolo;
  // La mira, en pantalla: ahí se cierran los anillos del impacto.
  const miraX = izq + (s.en[0] + MIRA_DEL_SIMBOLO[0]) * k;
  const miraY = arriba + (s.en[1] + MIRA_DEL_SIMBOLO[1]) * k;

  const cierra = sale(entre(x, 0, 0.7));
  const arco = suave(entre(x, 0.15, 0.95));
  const mira = sale(entre(x, 0.5, 0.8));
  const interior = entre(x, 0.9, 1.3);
  const medida = suave(entre(x, 1.05, 1.5)) * (1 - entre(x, 2.2, 2.7));
  const lema = sale(entre(x, 1.5, 2.1));
  const respira = 1 + 0.02 * entre(x, 0, 4.5);
  const destello = Math.max(0, 0.85 - x * FPS * 0.28);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: PAPEL,
        backgroundImage: [
          `linear-gradient(to right, rgba(150,140,120,0.42) ${1.4 * u}px, transparent ${1.4 * u}px)`,
          `linear-gradient(to bottom, rgba(150,140,120,0.42) ${1.4 * u}px, transparent ${1.4 * u}px)`,
          `linear-gradient(to right, rgba(150,140,120,0.18) ${u}px, transparent ${u}px)`,
          `linear-gradient(to bottom, rgba(150,140,120,0.18) ${u}px, transparent ${u}px)`,
        ].join(","),
        backgroundSize: `${mm * 5}px ${mm * 5}px, ${mm * 5}px ${mm * 5}px, ${mm}px ${mm}px, ${mm}px ${mm}px`,
      }}
    >
      {/* Los anillos del impacto, que se cierran sobre la mira. */}
      <svg width={ancho} height={alto} style={{ position: "absolute", inset: 0 }}>
        {[1, 0.56, 1.5].map((f, i) => (
          <circle
            key={i}
            cx={miraX}
            cy={miraY}
            r={mezcla(Math.max(ancho, alto) * 0.62 * f, s.mira.radio * k, cierra)}
            fill="none"
            stroke={SENAL}
            strokeWidth={mezcla((i === 0 ? 7 : 3) * u, s.mira.grosor * k, cierra)}
            opacity={(i === 0 ? 1 : 0.5) * (1 - entre(x, 0.6, 0.8))}
          />
        ))}
      </svg>

      <svg
        width={anchoLogo}
        height={altoLogo}
        viewBox={`0 0 ${MARCA.ancho} ${MARCA.alto}`}
        style={{
          position: "absolute",
          left: izq,
          top: arriba,
          overflow: "visible",
          transform: `scale(${respira})`,
          transformOrigin: "50% 50%",
        }}
      >
        <g transform={`translate(${s.en[0]} ${s.en[1]})`}>
          {/* La C: una trayectoria que se traza. */}
          <path
            d={s.arco}
            fill="none"
            stroke={TINTA}
            strokeWidth={s.arco_grosor}
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - arco}
          />
          <path
            d={s.interior.d}
            fill="none"
            stroke={TINTA}
            strokeWidth={s.interior.grosor}
            opacity={s.interior.opacidad * interior}
            strokeDasharray={s.interior.guiones}
          />
          {/* La mira: el punto de impacto. */}
          <g opacity={mira}>
            <circle
              cx={MIRA_DEL_SIMBOLO[0]}
              cy={MIRA_DEL_SIMBOLO[1]}
              r={s.mira.radio}
              fill="none"
              stroke={SENAL}
              strokeWidth={s.mira.grosor}
            />
            <path
              d={s.mira.rayas.map((r) => `M${r[0]} ${r[1]}L${r[2]} ${r[3]}`).join("")}
              fill="none"
              stroke={SENAL}
              strokeWidth={s.mira.rayas_grosor}
            />
            <circle
              cx={MIRA_DEL_SIMBOLO[0]}
              cy={MIRA_DEL_SIMBOLO[1]}
              r={s.mira.punto}
              fill={SENAL}
            />
          </g>
        </g>
        {/* La palabra, letra por letra. */}
        <g transform={`translate(${MARCA.palabra.en[0]} ${MARCA.palabra.en[1]})`}>
          {MARCA.palabra.letras.map((l, i) => {
            const t = sale(entre(x, 0.55 + i * 0.07, 0.85 + i * 0.07));
            return (
              <path
                key={l.letra + i}
                d={l.d}
                fill={TINTA}
                opacity={t}
                transform={`translate(${(1 - t) * 26} 0)`}
              />
            );
          })}
          {/* Una marca de medición bajo la palabra; se va antes del final. */}
          <g stroke={SENAL} strokeWidth={0.8} fill="none" opacity={medida}>
            <path
              d={`M0 27H${MARCA.palabra.letras[MARCA.palabra.letras.length - 1]!.x1 * medida}M0 24.5v5`}
            />
          </g>
        </g>
      </svg>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: arriba + altoLogo + (vertical ? 90 : 70) * u,
          textAlign: "center",
          padding: `0 ${60 * u}px`,
          opacity: lema,
          transform: `translateY(${(1 - lema) * 12 * u}px)`,
          fontFamily: SANS,
          fontSize: (vertical ? 40 : 36) * u,
          letterSpacing: "0.01em",
          color: TINTA,
        }}
      >
        {LEMA}
      </div>

      {destello > 0 ? (
        <AbsoluteFill style={{ backgroundColor: `rgba(255,246,238,${destello})` }} />
      ) : null}
    </AbsoluteFill>
  );
}
