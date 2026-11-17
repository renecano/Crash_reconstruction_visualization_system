/**
 * Las tres frases, de 18 a 23.5 s (storyboard versión 2, cuadro 5): «La IA lee. La física decide. El
 * perito firma.», una por golpe, con cortes de medio segundo entre ellas.
 *
 * - «La IA lee»: el relato de la escena inventada, con las citas de las que salió cada dato.
 * - «La física decide»: la velocidad con la que el vehículo B llega al impacto en cada simulación
 *   del solver; cada punto es una simulación y el corchete, su rango central (p10 a p90).
 * - «El perito firma»: la hoja con su firma y su sello.
 *
 * Donde hay toma del 3D, entra entre frase y frase; donde no, la tarjeta sigue.
 */
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { CASO, nubeDeVelocidades } from "../datos";
import { MONO, SANS, SERIF } from "../fuentes";
import { SENAL } from "../hoja";
import { entre, FPS, sale } from "../ritmo";
import { hay, Toma, type Hueco, type TomasDisponibles } from "../tomas";

const PAPEL = "#EFEBE1";
const TINTA = "#15181B";

/** El papel milimétrico de las tarjetas. */
function Hoja({ children, u }: { children: ReactNode; u: number }) {
  const mm = 20 * u;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: PAPEL,
        backgroundImage: [
          `linear-gradient(to right, rgba(150,140,120,0.5) ${1.4 * u}px, transparent ${1.4 * u}px)`,
          `linear-gradient(to bottom, rgba(150,140,120,0.5) ${1.4 * u}px, transparent ${1.4 * u}px)`,
          `linear-gradient(to right, rgba(150,140,120,0.22) ${u}px, transparent ${u}px)`,
          `linear-gradient(to bottom, rgba(150,140,120,0.22) ${u}px, transparent ${u}px)`,
        ].join(","),
        backgroundSize: `${mm * 5}px ${mm * 5}px, ${mm * 5}px ${mm * 5}px, ${mm}px ${mm}px, ${mm}px ${mm}px`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/** La frase a pantalla completa: entra con el golpe. */
function Frase({
  texto,
  x,
  u,
  vertical,
}: {
  texto: string;
  x: number;
  u: number;
  vertical: boolean;
}) {
  const entra = sale(entre(x, 0, 0.2));
  const palabras = texto.replace(/\.$/, "").split(" ");
  return (
    <Hoja u={u}>
      <div
        style={{
          position: "absolute",
          left: (vertical ? 70 : 120) * u,
          right: 60 * u,
          top: "50%",
          transform: `translateY(-50%) scale(${1.05 - 0.05 * entra})`,
          transformOrigin: "left center",
          fontFamily: SERIF,
          fontSize: (vertical ? 190 : 232) * u,
          lineHeight: 0.95,
          letterSpacing: "-0.03em",
          color: TINTA,
        }}
      >
        {vertical ? (
          <>
            {palabras.slice(0, -1).join(" ")}
            <br />
            {palabras[palabras.length - 1]}
          </>
        ) : (
          palabras.join(" ")
        )}
        <span style={{ color: SENAL }}>.</span>
      </div>
    </Hoja>
  );
}

/** La frase, chica, sobre los cortes que la siguen. */
function Pie({ texto, u, claro = false }: { texto: string; u: number; claro?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 64 * u,
        bottom: 84 * u,
        fontFamily: SERIF,
        fontSize: 64 * u,
        letterSpacing: "-0.02em",
        color: claro ? "#F2F5FA" : TINTA,
        textShadow: claro ? "0 2px 18px rgba(0,0,0,0.65)" : "none",
      }}
    >
      {texto.replace(/\.$/, "")}
      <span style={{ color: SENAL }}>.</span>
    </div>
  );
}

/** El relato, con las citas que se van marcando. */
function Relato({ x, u, vertical }: { x: number; u: number; vertical: boolean }) {
  const hasta = entre(x, 0, 0.42) * CASO.citas.length;
  const trozos: ReactNode[] = [];
  let cursor = 0;
  CASO.citas.forEach((c, k) => {
    if (c.inicio > cursor) trozos.push(CASO.relato.slice(cursor, c.inicio));
    const marcada = Math.min(1, Math.max(0, hasta - k));
    trozos.push(
      <span
        key={k}
        style={{
          backgroundImage: `linear-gradient(${SENAL}, ${SENAL})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "0 92%",
          backgroundSize: `${marcada * 100}% ${0.34}em`,
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
        }}
      >
        {c.texto}
      </span>,
    );
    cursor = c.fin;
  });
  trozos.push(CASO.relato.slice(cursor));
  return (
    <Hoja u={u}>
      <div
        style={{
          position: "absolute",
          left: (vertical ? 70 : 190) * u,
          right: (vertical ? 70 : 190) * u,
          top: 0,
          bottom: (vertical ? 260 : 120) * u,
          display: "flex",
          alignItems: "center",
          fontFamily: SERIF,
          fontSize: (vertical ? 58 : 60) * u,
          lineHeight: 1.34,
          color: TINTA,
        }}
      >
        <div>{trozos}</div>
      </div>
    </Hoja>
  );
}

/** La nube: cada punto, una simulación del solver. */
function Nube({ x, u, vertical }: { x: number; u: number; vertical: boolean }) {
  const { width: ancho, height: alto } = useVideoConfig();
  const nube = nubeDeVelocidades(1);
  const letra = CASO.vehiculos[1]!.letra;
  // Los puntos se apilan de 4 en 4 simulaciones para que quepan: lo dice el rótulo.
  const porPunto = 4;
  const columnas = nube.columnas.map((c) => ({ ...c, puntos: Math.round(c.n / porPunto) }));
  const alta = Math.max(...columnas.map((c) => c.puntos));
  const paso = Math.min(((vertical ? 0.84 : 0.56) * ancho) / columnas.length, (alto * 0.46) / alta);
  const r = paso * 0.36;
  const anchoNube = paso * columnas.length;
  const x0 = (ancho - anchoNube) / 2;
  const base = alto * (vertical ? 0.58 : 0.66);
  const sale2 = entre(x, -0.06, 0.3);
  const paso4 = nube.columnas[1]!.desde - nube.columnas[0]!.desde;
  const aX = (kmh: number) => x0 + ((kmh - nube.columnas[0]!.desde) / paso4) * paso;
  const entero = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
  return (
    <Hoja u={u}>
      <svg width={ancho} height={alto} style={{ position: "absolute", inset: 0 }}>
        {columnas.map((c, k) =>
          Array.from({ length: c.puntos }, (_p, i) => {
            const visible = sale2 * columnas.length * 1.2 - k * 0.9 - i * 0.12;
            return visible > 0 ? (
              <circle
                key={`${k}-${i}`}
                cx={x0 + (k + 0.5) * paso}
                cy={base - (i + 0.5) * paso}
                r={r * Math.min(1, visible)}
                fill={SENAL}
              />
            ) : null;
          }),
        )}
        {/* El rango central de las simulaciones: de p10 a p90. */}
        <g
          stroke={TINTA}
          strokeWidth={4 * u}
          fill="none"
          opacity={entre(x, 0.3, 0.42)}
          strokeLinecap="square"
        >
          <path
            d={`M${aX(nube.p10)} ${base + 26 * u}v${22 * u}M${aX(nube.p90)} ${base + 26 * u}v${22 * u}M${aX(nube.p10)} ${base + 37 * u}H${aX(nube.p90)}`}
          />
        </g>
        <g fontFamily={MONO} fontSize={24 * u} fill={TINTA} opacity={entre(x, 0.3, 0.42)}>
          <text x={aX(nube.p10)} y={base + 84 * u} textAnchor="middle">
            {entero.format(nube.p10)}
          </text>
          <text x={aX(nube.p90)} y={base + 84 * u} textAnchor="middle">
            {entero.format(nube.p90)}
          </text>
          <text x={ancho / 2} y={base + 134 * u} textAnchor="middle" fill="#5B5546">
            velocidad de {letra} al impacto, km/h
          </text>
          <text x={ancho / 2} y={base + 170 * u} textAnchor="middle" fill="#5B5546">
            {entero.format(nube.total)} simulaciones · un punto por cada {porPunto}
          </text>
        </g>
      </svg>
    </Hoja>
  );
}

/** La hoja firmada: la firma se traza y cae el sello. */
function Firma({ x, u, vertical }: { x: number; u: number; vertical: boolean }) {
  const { width: ancho, height: alto } = useVideoConfig();
  const w = (vertical ? 760 : 700) * u;
  const h = w * 1.18;
  const traza = entre(x, 0.02, 0.3);
  const sello = sale(entre(x, 0.28, 0.4));
  return (
    <Hoja u={u}>
      <svg
        width={w}
        height={h}
        viewBox="0 0 620 730"
        style={{ position: "absolute", left: (ancho - w) / 2, top: alto * (vertical ? 0.2 : 0.08) }}
      >
        <rect
          x="4"
          y="4"
          width="612"
          height="722"
          rx="6"
          fill="#FBFAF6"
          stroke={TINTA}
          strokeWidth="4"
        />
        <g stroke="#C6BFAE" strokeWidth="12" strokeLinecap="round">
          <path d="M70 110H550M70 170H550M70 230H430M70 330H550M70 390H500" />
        </g>
        <path d="M70 610H420" stroke={TINTA} strokeWidth="3" />
        <path
          d="M84 574c40 -100 70 34 104 -34s36 80 78 10s62 20 132 -26"
          fill="none"
          stroke={TINTA}
          strokeWidth="7"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - traza}
        />
        <g
          transform={`translate(490 560) scale(${2 - sello})`}
          opacity={sello}
          fill="none"
          stroke={SENAL}
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle r="72" fill="#FBFAF6" />
          <path d="M-32 2l22 24l44 -52" />
        </g>
      </svg>
    </Hoja>
  );
}

interface Corte {
  desde: number;
  hasta: number;
  que: "frase" | "relato" | "nube" | "firma" | "toma" | "negro";
  frase?: string;
  hueco?: Hueco;
}

const F1 = "La IA lee.";
const F2 = "La física decide.";
const F3 = "El perito firma.";

/** Los cortes del tramo, en segundos desde la primera frase. Todos caen en la rejilla de pulsos. */
export const CORTES: Corte[] = [
  { desde: 0, hasta: 0.5, que: "frase", frase: F1 },
  { desde: 0.5, hasta: 1, que: "relato", frase: F1 },
  { desde: 1, hasta: 1.5, que: "toma", hueco: "faros", frase: F1 },
  { desde: 1.5, hasta: 2, que: "frase", frase: F2 },
  { desde: 2, hasta: 2.5, que: "nube", frase: F2 },
  { desde: 2.5, hasta: 3, que: "toma", hueco: "impacto", frase: F2 },
  { desde: 3, hasta: 3.5, que: "frase", frase: F3 },
  { desde: 3.5, hasta: 4, que: "firma", frase: F3 },
  { desde: 4, hasta: 4.5, que: "toma", hueco: "aerea", frase: F3 },
  // Los tres últimos, de un sexto de pulso (5 cuadros) cada uno.
  { desde: 4.5, hasta: 4.5 + 1 / 6, que: "toma", hueco: "detalle-1" },
  { desde: 4.5 + 1 / 6, hasta: 4.5 + 2 / 6, que: "nube" },
  { desde: 4.5 + 2 / 6, hasta: 5, que: "toma", hueco: "detalle-2" },
  { desde: 5, hasta: 5.5, que: "negro" },
];

export function Frases({ tomas }: { tomas: TomasDisponibles }) {
  const cuadro = useCurrentFrame();
  const { width: ancho, height: alto } = useVideoConfig();
  const vertical = alto > ancho;
  const u = Math.min(ancho, alto) / 1080;
  const x = cuadro / FPS;
  const k = CORTES.findIndex((c) => x >= c.desde && x < c.hasta);
  let corte = CORTES[Math.max(0, k)]!;
  let desde = corte.desde;
  // Sin toma para ese hueco, sigue la tarjeta anterior (que se sigue moviendo).
  if (corte.que === "toma" && !hay(tomas, corte.hueco!)) {
    const anterior = CORTES[Math.max(0, k - 1)]!;
    desde = anterior.desde;
    corte = { ...anterior, frase: corte.frase };
  }
  const local = x - desde;
  const dura = corte.hasta - corte.desde;
  if (corte.que === "negro") return <AbsoluteFill style={{ backgroundColor: "#000" }} />;
  const sobreToma = corte.que === "toma";
  return (
    <AbsoluteFill>
      {corte.que === "frase" ? (
        <Frase texto={corte.frase!} x={local} u={u} vertical={vertical} />
      ) : null}
      {corte.que === "relato" ? <Relato x={local} u={u} vertical={vertical} /> : null}
      {corte.que === "nube" ? <Nube x={local} u={u} vertical={vertical} /> : null}
      {corte.que === "firma" ? <Firma x={local} u={u} vertical={vertical} /> : null}
      {sobreToma ? (
        <Toma tomas={tomas} hueco={corte.hueco!} avance={local / dura} acerca={[1.1, 1.04]} />
      ) : null}
      {corte.frase && corte.que !== "frase" ? (
        <div style={{ position: "absolute", inset: 0, fontFamily: SANS }}>
          <Pie texto={corte.frase} u={u} claro={sobreToma} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
