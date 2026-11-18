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
 *
 * El último medio segundo es la toma de aire antes del golpe: de noche, los anillos del impacto se
 * cierran sobre el punto donde va a quedar la mira del logo. La música sube; no hay silencio.
 */
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { CASO, MARCA, nubeDeVelocidades } from "../datos";
import { MONO, SANS, SERIF } from "../fuentes";
import { SENAL } from "../hoja";
import { entre, FPS, sale } from "../ritmo";
import { hay, Toma, type Hueco, type TomasDisponibles } from "../tomas";
import { geometriaDelLogo } from "./Logo";

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
          // Marcado como con un marcador: una pasada ancha y translúcida y otra fina encima, que no
          // empiezan ni acaban parejo.
          backgroundImage: `linear-gradient(rgba(255,91,46,0.3), rgba(255,91,46,0.3)), linear-gradient(${SENAL}, ${SENAL})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: `0 ${78 + (k % 3) * 3}%, ${(k % 2) * 0.12}em 96%`,
          backgroundSize: `${marcada * 100}% 0.62em, ${marcada * (97 - (k % 4))}% 0.09em`,
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

/**
 * La hoja firmada: el dictamen con el símbolo de la marca, un croquis de la escena (las trayectorias
 * del Resultado), la firma que se traza con el pulso de una mano y el sello que cae.
 */
function Firma({ x, u, vertical }: { x: number; u: number; vertical: boolean }) {
  const { width: ancho, height: alto } = useVideoConfig();
  const w = (vertical ? 800 : 700) * u;
  const h = w * 1.18;
  const traza = entre(x, 0.02, 0.3);
  const sello = sale(entre(x, 0.28, 0.4));
  // El croquis: las dos trayectorias de la escena, llevadas a un recuadro de la hoja.
  const caminos = CASO.vehiculos.map((v) => v.trayectoria.filter((_p, i) => i % 6 === 0));
  const xs = caminos.flat().map((q) => q[1]!);
  const ys = caminos.flat().map((q) => q[2]!);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const medio = (y0 + y1) / 2;
  const escala = 420 / (x1 - x0);
  const aHoja = (q: number[]) => `${100 + (q[1]! - x0) * escala} ${300 - (q[2]! - medio) * escala}`;
  const sim = MARCA.simbolo;
  return (
    <Hoja u={u}>
      <svg
        width={w}
        height={h}
        viewBox="0 0 620 730"
        style={{
          position: "absolute",
          left: (ancho - w) / 2,
          top: alto * (vertical ? 0.2 : 0.07),
          filter: `drop-shadow(0 ${10 * u}px ${22 * u}px rgba(21,24,27,0.22))`,
        }}
      >
        <rect
          x="4"
          y="4"
          width="612"
          height="722"
          rx="5"
          fill="#FBFAF6"
          stroke={TINTA}
          strokeWidth="2.5"
        />
        {/* El encabezado: el símbolo de la marca y el título del documento. */}
        <g transform="translate(58 44) scale(0.92)">
          <path d={sim.arco} fill="none" stroke={TINTA} strokeWidth={sim.arco_grosor} />
          <circle
            cx="52"
            cy="32"
            r={sim.mira.radio}
            fill="none"
            stroke={SENAL}
            strokeWidth={sim.mira.grosor}
          />
          <circle cx="52" cy="32" r={sim.mira.punto} fill={SENAL} />
        </g>
        <text x="132" y="72" fontFamily={SERIF} fontSize="34" fill={TINTA}>
          Dictamen
        </text>
        <text x="132" y="96" fontFamily={MONO} fontSize="11" fill="#5B5546" letterSpacing="1.2">
          RECONSTRUCCIÓN DE HECHOS DE TRÁNSITO
        </text>
        <path d="M58 122H562" stroke={TINTA} strokeWidth="1.4" />
        <g stroke="#C6BFAE" strokeWidth="8" strokeLinecap="round">
          <path d="M58 156H562M58 186H500" />
        </g>
        {/* El croquis del caso: la cuadrícula y las trayectorias. */}
        <g>
          <rect
            x="58"
            y="220"
            width="504"
            height="160"
            fill="#EFEBE1"
            stroke="#C6BFAE"
            strokeWidth="1.2"
          />
          {Array.from({ length: 12 }, (_q, i) => (
            <path key={`v${i}`} d={`M${58 + i * 42} 220V380`} stroke="#D8D2C4" strokeWidth="1" />
          ))}
          {Array.from({ length: 3 }, (_q, i) => (
            <path key={`h${i}`} d={`M58 ${260 + i * 40}H562`} stroke="#D8D2C4" strokeWidth="1" />
          ))}
          {caminos.map((c, i) => (
            <path
              key={i}
              d={`M${c.map(aHoja).join("L")}`}
              fill="none"
              stroke={i === 0 ? SENAL : TINTA}
              strokeWidth={i === 0 ? 3 : 2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          <circle
            cx={100 + (CASO.impacto.x - x0) * escala}
            cy={300 - (CASO.impacto.y - medio) * escala}
            r="7"
            fill="none"
            stroke={SENAL}
            strokeWidth="2.4"
          />
        </g>
        <g stroke="#C6BFAE" strokeWidth="8" strokeLinecap="round">
          <path d="M58 420H562M58 450H562M58 480H430" />
        </g>
        <path d="M58 640H360" stroke={TINTA} strokeWidth="1.6" />
        <text x="58" y="664" fontFamily={MONO} fontSize="11" fill="#5B5546" letterSpacing="1.2">
          FIRMA DEL PERITO
        </text>
        {/* La firma: dos pasadas, como tinta que carga más donde la mano frena. */}
        {[
          [5.5, 1],
          [2.2, 0.55],
        ].map(([grueso, op], i) => (
          <path
            key={i}
            d="M70 612c22 -74 44 -86 52 -40c6 34 -30 44 -22 8c10 -44 60 -52 74 -12c8 22 22 -30 40 -30c22 0 6 46 34 30c20 -12 30 -34 50 -30c18 4 8 30 40 22"
            fill="none"
            stroke={TINTA}
            strokeWidth={grueso}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={op}
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - Math.min(1, traza * (i === 0 ? 1 : 1.08))}
            transform={i === 1 ? "translate(1.4 1.2)" : undefined}
          />
        ))}
        {/* El sello: cae, con su anillo de marcas, y queda un poco girado. */}
        <g
          transform={`translate(478 600) rotate(-9) scale(${2.1 - 1.1 * sello})`}
          opacity={sello}
          fill="none"
          stroke={SENAL}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle r="64" strokeWidth="5" />
          <circle r="52" strokeWidth="1.6" />
          {Array.from({ length: 36 }, (_q, i) => (
            <path key={i} d="M0 -55V-61" strokeWidth="1.6" transform={`rotate(${i * 10})`} />
          ))}
          <path d="M-26 2l18 20l36 -44" strokeWidth="8" />
        </g>
      </svg>
    </Hoja>
  );
}

/** La toma de aire: los anillos del impacto se cierran sobre el punto donde irá la mira del logo. */
function Aire({ x }: { x: number }) {
  const { width: ancho, height: alto } = useVideoConfig();
  const u = Math.min(ancho, alto) / 1080;
  const g = geometriaDelLogo(ancho, alto);
  const cierra = x ** 1.6;
  const mm = 40 * u;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0A1120",
        backgroundImage: [
          `linear-gradient(to right, rgba(143,161,191,0.16) ${u}px, transparent ${u}px)`,
          `linear-gradient(to bottom, rgba(143,161,191,0.16) ${u}px, transparent ${u}px)`,
        ].join(","),
        backgroundSize: `${mm}px ${mm}px`,
      }}
    >
      <svg width={ancho} height={alto} style={{ position: "absolute", inset: 0 }}>
        {[1, 0.62, 1.5, 2.1].map((f, i) => (
          <circle
            key={i}
            cx={g.miraX}
            cy={g.miraY}
            r={Math.max(2 * u, Math.max(ancho, alto) * 0.72 * f * (1 - cierra))}
            fill="none"
            stroke={SENAL}
            strokeWidth={(i === 0 ? 6 : 2.4) * u}
            opacity={(i === 0 ? 1 : 0.5) * Math.min(1, x * 4)}
          />
        ))}
        <circle cx={g.miraX} cy={g.miraY} r={(3 + 9 * cierra) * u} fill={SENAL} opacity={cierra} />
      </svg>
    </AbsoluteFill>
  );
}

interface Corte {
  desde: number;
  hasta: number;
  que: "frase" | "relato" | "nube" | "firma" | "toma" | "aire";
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
  // Los tres últimos, de un sexto de segundo (5 cuadros) cada uno.
  { desde: 4.5, hasta: 4.5 + 1 / 6, que: "toma", hueco: "detalle-1" },
  { desde: 4.5 + 1 / 6, hasta: 4.5 + 2 / 6, que: "nube" },
  { desde: 4.5 + 2 / 6, hasta: 5, que: "toma", hueco: "detalle-2" },
  { desde: 5, hasta: 5.5, que: "aire" },
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
  if (corte.que === "aire") return <Aire x={local / dura} />;
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
