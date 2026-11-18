/**
 * El cierre, de 23.5 a 28 s (storyboard versión 2, cuadro 6; René, 2026-11-17): con el golpe, la noche
 * vuelve a ser papel y el logo se escribe. La C del símbolo se traza como una trayectoria alrededor de
 * la mira (el punto de impacto), y la palabra aparece letra por letra: cada letra es primero una cosa
 * del oficio del perito y después se vuelve letra. Lo que queda al final es el logotipo exacto de la
 * marca (`assets/brand/marca.json`, por `datos/marca.json`). La música no se detiene: una nota por
 * letra y un acorde final con el lema.
 *
 * Las cosas, dibujadas en código con la misma tinta: una huella de frenado en curva (C), una señal en
 * su poste (R), una llanta (O), una lupa (Q), una flecha de retorno (U), un lápiz (I) y una curva de
 * carretera (S).
 */
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { MARCA, MIRA_DEL_SIMBOLO } from "../datos";
import { MONO, SANS } from "../fuentes";
import { SENAL } from "../hoja";
import { entre, FPS, mezcla, MOMENTOS, sale, suave } from "../ritmo";
import type { ModeloAuto } from "../tinta3d";

const PAPEL = "#EFEBE1";
const TINTA = "#15181B";

export const LEMA = "Reconstrucción de hechos de tránsito para peritos";

/** Dónde queda el logotipo en la pantalla: lo usan el cierre y la toma de aire que lo precede. */
export function geometriaDelLogo(ancho: number, alto: number) {
  const vertical = alto > ancho;
  // Centrado; en vertical ocupa casi todo el ancho.
  const anchoLogo = ancho * (vertical ? 0.84 : 0.6);
  const k = anchoLogo / MARCA.ancho;
  const altoLogo = MARCA.alto * k;
  const izq = (ancho - anchoLogo) / 2;
  const arriba = alto * (vertical ? 0.42 : 0.4) - altoLogo / 2;
  return {
    vertical,
    anchoLogo,
    altoLogo,
    k,
    izq,
    arriba,
    // La mira del símbolo: el punto de impacto.
    miraX: izq + (MARCA.simbolo.en[0] + MIRA_DEL_SIMBOLO[0]) * k,
    miraY: arriba + (MARCA.simbolo.en[1] + MIRA_DEL_SIMBOLO[1]) * k,
  };
}

const trazo = {
  fill: "none",
  stroke: TINTA,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** La cosa que es cada letra antes de ser letra, en un cuadro de −12 a 12. */
export const COSAS: { letra: string; que: string; dibujo: ReactNode }[] = [
  {
    letra: "C",
    que: "una huella de frenado en curva",
    dibujo: (
      <g {...trazo} strokeLinecap="butt">
        <path
          d="M 7.4 -7.4 A 10.4 10.4 0 1 0 7.4 7.4"
          strokeWidth={2.1}
          strokeDasharray="2.4 1.3"
        />
        <path d="M 4.9 -4.9 A 6.9 6.9 0 1 0 4.9 4.9" strokeWidth={2.1} strokeDasharray="2.4 1.3" />
      </g>
    ),
  },
  {
    letra: "R",
    que: "una señal en su poste",
    dibujo: (
      <g {...trazo} strokeWidth={1.5}>
        <path d="M -6 -11.5 V 11.5" strokeWidth={2} />
        <rect x={-6} y={-11} width={13} height={10} rx={1.6} fill={PAPEL} />
        <path
          d="M -2.6 -3.4 L 0.5 -8.6 L 3.6 -3.4 Z"
          fill={SENAL}
          stroke={SENAL}
          strokeWidth={0.6}
        />
        <path d="M -0.5 -1 L 7 11.5" strokeWidth={2} />
      </g>
    ),
  },
  {
    letra: "O",
    que: "una llanta",
    dibujo: (
      <g {...trazo}>
        <circle r={9.4} strokeWidth={3.6} />
        <circle r={5} strokeWidth={1.1} />
        <circle r={1.3} fill={TINTA} />
        {[0, 72, 144, 216, 288].map((a) => (
          <path key={a} d="M 0 -1.8 V -4.9" strokeWidth={1.3} transform={`rotate(${a})`} />
        ))}
        {Array.from({ length: 18 }, (_x, i) => (
          <path
            key={i}
            d="M 0 -8.2 V -10.6"
            stroke={PAPEL}
            strokeWidth={0.5}
            transform={`rotate(${i * 20})`}
          />
        ))}
      </g>
    ),
  },
  {
    letra: "Q",
    que: "una lupa",
    dibujo: (
      <g {...trazo}>
        <circle cx={-1.6} cy={-1.6} r={8.2} strokeWidth={1.9} fill={PAPEL} />
        <path d="M -6.6 -3.2 A 5.6 5.6 0 0 1 -3 -7" strokeWidth={0.9} opacity={0.6} />
        <rect x={-2.9} y={-2.9} width={2.6} height={2.6} fill={SENAL} stroke="none" />
        <path d="M 4.4 4.4 L 10.8 10.8" strokeWidth={3.2} />
      </g>
    ),
  },
  {
    letra: "U",
    que: "una flecha de retorno",
    dibujo: (
      <g {...trazo}>
        <path d="M -6 -10.5 V 3 A 6 6 0 0 0 6 3 V -4.5" strokeWidth={2.8} strokeLinecap="butt" />
        <path d="M 1.6 -4 L 6 -11.5 L 10.4 -4 Z" fill={TINTA} strokeWidth={0.8} />
      </g>
    ),
  },
  {
    letra: "I",
    que: "un lápiz",
    dibujo: (
      <g {...trazo} strokeWidth={0.9}>
        <rect x={-2.5} y={-12} width={5} height={2} rx={0.8} fill="#D8837B" />
        <rect x={-2.7} y={-10} width={5.4} height={1.9} fill="#C9CBD0" />
        <rect x={-2.5} y={-8.1} width={5} height={13.6} fill={SENAL} />
        <path d="M -0.8 -8.1 V 5.5 M 0.9 -8.1 V 5.5" strokeWidth={0.45} opacity={0.5} />
        <path d="M -2.5 5.5 L 0 11.8 L 2.5 5.5 Z" fill="#D9B487" />
        <path d="M -0.75 9.9 L 0 11.8 L 0.75 9.9 Z" fill={TINTA} />
      </g>
    ),
  },
  {
    letra: "S",
    que: "una curva de carretera",
    dibujo: (
      <g {...trazo} strokeLinecap="butt">
        <path d="M 7.5 -8.6 C -10 -11.5 -10 -0.6 0 0 S 10 11.5 -7.5 8.6" strokeWidth={5.6} />
        <path
          d="M 7.5 -8.6 C -10 -11.5 -10 -0.6 0 0 S 10 11.5 -7.5 8.6"
          stroke={PAPEL}
          strokeWidth={3.6}
        />
        <path
          d="M 7.5 -8.6 C -10 -11.5 -10 -0.6 0 0 S 10 11.5 -7.5 8.6"
          stroke={SENAL}
          strokeWidth={0.55}
          strokeDasharray="1.6 1.4"
        />
      </g>
    ),
  },
];

/** La altura de las mayúsculas de la palabra, en sus unidades. */
const ALTO_LETRA = 18.4;
/** Lo que tarda cada cosa en volverse letra: un tercio de segundo (10 cuadros). */
const DE_COSA_A_LETRA = 1 / 3;

/** El crédito de los modelos 3D (CC-BY): quién los hizo y con qué licencia, tal como lo dicen sus datos. */
export function creditoDeModelos(modelos: Record<string, ModeloAuto> | null): string | null {
  const lista = Object.values(modelos ?? {});
  if (!lista.length) return null;
  const autores = [...new Set(lista.map((m) => m.autor))].join(", ");
  const licencias = [...new Set(lista.map((m) => m.licencia))].join(", ");
  return `Modelos 3D de los vehículos: ${lista.map((m) => `«${m.nombre}»`).join(" y ")}, de ${autores} (${licencias})`;
}

export function Logo({ modelos }: { modelos: Record<string, ModeloAuto> | null }) {
  const cuadro = useCurrentFrame();
  const { width: ancho, height: alto } = useVideoConfig();
  const u = Math.min(ancho, alto) / 1080;
  const x = cuadro / FPS;
  const mm = 20 * u;
  const g = geometriaDelLogo(ancho, alto);
  const s = MARCA.simbolo;
  const letras = MARCA.palabra.letras;

  // El golpe: la mira ya está (es el punto donde todo se cerró) y los anillos se abren.
  const abre = sale(entre(x, 0, 0.75));
  const arco = suave(entre(x, 0.05, 0.5));
  const mira = sale(entre(x, 0, 0.18));
  const interior = entre(x, 0.42, 0.75);
  const lemaEn = MOMENTOS.acorde_final - MOMENTOS.golpe_final;
  const lema = sale(entre(x, lemaEn, lemaEn + 0.4));
  const respira = 1 + 0.022 * entre(x, 0, 4.5);
  const destello = Math.max(0, 0.9 - x * FPS * 0.28);

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
      {/* Los anillos del impacto, que se abren desde la mira. */}
      <svg width={ancho} height={alto} style={{ position: "absolute", inset: 0 }}>
        {[1, 0.6, 1.45].map((f, i) => (
          <circle
            key={i}
            cx={g.miraX}
            cy={g.miraY}
            r={mezcla(s.mira.radio * g.k, Math.max(ancho, alto) * 0.7 * f, abre)}
            fill="none"
            stroke={SENAL}
            strokeWidth={mezcla(s.mira.grosor * g.k, (i === 0 ? 6 : 2.4) * u, abre)}
            opacity={(i === 0 ? 0.9 : 0.5) * (1 - entre(x, 0.12, 0.75))}
          />
        ))}
      </svg>

      <svg
        width={g.anchoLogo}
        height={g.altoLogo}
        viewBox={`0 0 ${MARCA.ancho} ${MARCA.alto}`}
        style={{
          position: "absolute",
          left: g.izq,
          top: g.arriba,
          overflow: "visible",
          transform: `scale(${respira})`,
          transformOrigin: "50% 50%",
        }}
      >
        <g transform={`translate(${s.en[0]} ${s.en[1]})`}>
          {/* La C: una trayectoria que se traza alrededor del punto de impacto. */}
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
          <g
            opacity={mira}
            transform={`translate(${MIRA_DEL_SIMBOLO[0]} ${MIRA_DEL_SIMBOLO[1]}) scale(${1.7 - 0.7 * mira}) translate(${-MIRA_DEL_SIMBOLO[0]} ${-MIRA_DEL_SIMBOLO[1]})`}
          >
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

        {/* La palabra se escribe: cada letra es primero una cosa y después se vuelve letra. */}
        <g transform={`translate(${MARCA.palabra.en[0]} ${MARCA.palabra.en[1]})`}>
          {letras.map((l, i) => {
            const aparece = MOMENTOS.letras[i]! - MOMENTOS.golpe_final;
            const cambia = aparece + DE_COSA_A_LETRA;
            const cx = (l.x0 + l.x1) / 2;
            const cy = ALTO_LETRA / 2;
            const entra = sale(entre(x, aparece, aparece + 0.14));
            const seVa = entre(x, cambia - 0.03, cambia + 0.1);
            const letra = sale(entre(x, cambia - 0.02, cambia + 0.16));
            const tamano = (ALTO_LETRA / 24) * 1.5;
            return (
              <g key={l.letra + i}>
                {entra > 0 && seVa < 1 ? (
                  <g
                    opacity={entra * (1 - seVa)}
                    transform={`translate(${cx} ${cy}) rotate(${(1 - entra) * -14}) scale(${tamano * (0.5 + 0.5 * entra) * (1 + 0.2 * seVa)})`}
                  >
                    {COSAS[i]!.dibujo}
                  </g>
                ) : null}
                {letra > 0 ? (
                  <g
                    transform={`translate(${cx} ${cy}) scale(${1.2 - 0.2 * letra}) translate(${-cx} ${-cy})`}
                  >
                    <path d={l.d} fill={TINTA} opacity={letra} />
                    {/* Un destello de señal en el contorno, en el instante en que se vuelve letra. */}
                    <path
                      d={l.d}
                      fill="none"
                      stroke={SENAL}
                      strokeWidth={0.9}
                      opacity={(1 - letra) * 0.9}
                    />
                  </g>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: g.arriba + g.altoLogo + (g.vertical ? 90 : 70) * u,
          textAlign: "center",
          padding: `0 ${60 * u}px`,
          opacity: lema,
          transform: `translateY(${(1 - lema) * 12 * u}px)`,
          fontFamily: SANS,
          fontSize: (g.vertical ? 40 : 36) * u,
          letterSpacing: "0.01em",
          color: TINTA,
        }}
      >
        {LEMA}
      </div>

      {/* El crédito de los modelos de los vehículos (CC-BY), con el lema. */}
      {creditoDeModelos(modelos) ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 40 * u,
            textAlign: "center",
            padding: `0 ${40 * u}px`,
            opacity: lema * 0.72,
            fontFamily: MONO,
            fontSize: 15 * u,
            letterSpacing: "0.02em",
            color: TINTA,
          }}
        >
          {creditoDeModelos(modelos)}
        </div>
      ) : null}

      {destello > 0 ? (
        <AbsoluteFill style={{ backgroundColor: `rgba(255,246,238,${destello})` }} />
      ) : null}
    </AbsoluteFill>
  );
}
