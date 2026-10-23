/**
 * El croquis 2D a escala de una reconstrucción de «Caso nuevo» para el dictamen (R8, ADR 0072):
 * con el resultado del solver (metros, x al oriente, y al norte), la trayectoria de cada vehículo,
 * su rectángulo al inicio, en el impacto y en reposo, el punto del impacto, el norte y una barra
 * de escala. Sin mapa de fondo: solo lo que calculó el solver.
 */

type Json = Record<string, unknown>;

interface Trayectoria {
  t: number[];
  x: number[];
  y: number[];
  rumbo: number[];
}
interface VehiculoResultado {
  id: string;
  dimensiones: { largo_m: number; ancho_m: number };
  trayectoria: Trayectoria;
}

/** Colores de datos de los vehículos, en orden (los mismos tonos que el croquis del recorrido). */
export const COLORES = [
  "#ff5b2e",
  "#2b8cff",
  "#a05cff",
  "#1aa37a",
  "#c98a00",
  "#d6336c",
  "#5c7cfa",
  "#495057",
];

/** El marco en metros que contiene todas las trayectorias, con margen. */
export function marcoCroquis(vs: readonly VehiculoResultado[], margen = 6) {
  const xs = vs.flatMap((v) => v.trayectoria.x);
  const ys = vs.flatMap((v) => v.trayectoria.y);
  return {
    minX: Math.min(...xs) - margen,
    maxX: Math.max(...xs) + margen,
    minY: Math.min(...ys) - margen,
    maxY: Math.max(...ys) + margen,
  };
}

/** La longitud de la barra de escala: 1, 2, 5, 10, 20… m, cerca de un quinto del ancho. */
export function barraDeEscala(anchoM: number): number {
  const objetivo = anchoM / 5;
  const p = 10 ** Math.floor(Math.log10(objetivo));
  return [1, 2, 5, 10]
    .map((k) => k * p)
    .reduce((a, b) => (Math.abs(b - objetivo) < Math.abs(a - objetivo) ? b : a));
}

/**
 * El croquis en PNG (data URL), o null fuera del navegador. `nombres` da la etiqueta de cada
 * vehículo por su id en la escena («veh-a» → «V1»).
 */
export function croquisDeReconstruccion(
  resultado: Json,
  nombres: Record<string, string>,
  ancho = 900,
  alto = 560,
): string | null {
  if (typeof document === "undefined") return null;
  const vs = ((resultado.vehiculos as VehiculoResultado[] | undefined) ?? []).filter(
    (v) => v.trayectoria?.x?.length,
  );
  if (!vs.length) return null;
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const g = lienzo.getContext("2d");
  if (!g) return null;
  const m = marcoCroquis(vs);
  const escala = Math.min((ancho - 60) / (m.maxX - m.minX), (alto - 90) / (m.maxY - m.minY));
  const ox = (ancho - (m.maxX - m.minX) * escala) / 2;
  const oy = 50 + (alto - 90 - (m.maxY - m.minY) * escala) / 2;
  const px = (x: number, y: number): [number, number] => [
    ox + (x - m.minX) * escala,
    oy + (m.maxY - y) * escala,
  ];
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, ancho, alto);
  g.font = "14px sans-serif";
  g.fillStyle = "#222222";
  g.fillText("Croquis de la reconstrucción (a escala)", 20, 28);

  const rect = (x: number, y: number, rumbo: number, l: number, w: number) => {
    const [cx, cy] = px(x, y);
    g.save();
    g.translate(cx, cy);
    g.rotate(-rumbo);
    g.strokeRect((-l / 2) * escala, (-w / 2) * escala, l * escala, w * escala);
    g.restore();
  };
  vs.forEach((v, k) => {
    const color = COLORES[k % COLORES.length]!;
    const tr = v.trayectoria;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.setLineDash([6, 4]);
    g.beginPath();
    tr.x.forEach((x, i) => {
      const [a, b] = px(x, tr.y[i]!);
      if (i === 0) g.moveTo(a, b);
      else g.lineTo(a, b);
    });
    g.stroke();
    g.setLineDash([]);
    const i0 = tr.t.findIndex((t) => t >= 0);
    const indices = [0, i0 < 0 ? 0 : i0, tr.t.length - 1];
    indices.forEach((i, j) => {
      g.lineWidth = j === 2 ? 2.5 : 1.5;
      rect(tr.x[i]!, tr.y[i]!, tr.rumbo[i]!, v.dimensiones.largo_m, v.dimensiones.ancho_m);
    });
    const [lx, ly] = px(tr.x.at(-1)!, tr.y.at(-1)!);
    g.fillStyle = color;
    g.fillText(nombres[v.id] ?? v.id, lx + 8, ly - 8);
  });
  // El punto del impacto (si lo hay), el norte y la escala.
  const pi = resultado.punto_impacto as { x: number; y: number } | null | undefined;
  if (pi) {
    const [a, b] = px(pi.x, pi.y);
    g.strokeStyle = "#111111";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(a - 7, b - 7);
    g.lineTo(a + 7, b + 7);
    g.moveTo(a + 7, b - 7);
    g.lineTo(a - 7, b + 7);
    g.stroke();
  }
  g.fillStyle = "#222222";
  g.fillText("N ↑", ancho - 50, 28);
  const metros = barraDeEscala(m.maxX - m.minX);
  g.fillRect(20, alto - 24, metros * escala, 3);
  g.fillText(`${metros} m`, 24 + metros * escala, alto - 18);
  return lienzo.toDataURL("image/png");
}
