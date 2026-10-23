/**
 * El croquis del dictamen sobre el mapa de «Caso nuevo» (R8b, prioridad alta después de R9): las
 * calles que ve el perito, con el recorrido de cada vehículo de la reconstrucción, su contorno al
 * inicio, en el impacto y en reposo, los impactos (X1, X2…), el norte, una barra de escala y la
 * atribución del mapa.
 *
 * El mapa se encuadra en las trayectorias, se copia el cuadro en el instante en que se dibuja (sin
 * `preserveDrawingBuffer`) y se devuelve a donde estaba. El dictamen se imprime: si el mapa está en
 * el tema oscuro, el croquis se toma con el estilo claro y luego se regresa al del perito.
 */
import type { TrayectoriaEnMapa } from "@croquis/cesvi";
import type { Map as MapaMl } from "maplibre-gl";
import { COLORES } from "./croquis-caso";

const ATRIBUCION = "© OpenStreetMap · OpenFreeMap · OpenMapTiles";

const espera = (m: MapaMl, evento: "idle" | "render", ms: number) =>
  new Promise<void>((listo) => {
    const t = setTimeout(listo, ms);
    m.once(evento, () => {
      clearTimeout(t);
      listo();
    });
  });

/** La barra de escala: 5, 10, 20, 50… m, cerca de un sexto del ancho. */
function barra(metrosPorPixel: number, anchoPx: number): number {
  const objetivo = (anchoPx / 6) * metrosPorPixel;
  const p = 10 ** Math.floor(Math.log10(objetivo));
  return [1, 2, 5, 10]
    .map((k) => k * p)
    .reduce((a, b) => (Math.abs(b - objetivo) < Math.abs(a - objetivo) ? b : a));
}

type Impacto = { numero: number; punto: { lat: number; lon: number } };

export async function croquisSobreMapa(
  m: MapaMl,
  trayectorias: readonly TrayectoriaEnMapa[],
  impactos: readonly Impacto[],
  estilos?: { impresion: string; actual: string },
): Promise<string | null> {
  if (!trayectorias.some((t) => t.puntos.length)) return null;
  const antes = {
    center: m.getCenter(),
    zoom: m.getZoom(),
    bearing: m.getBearing(),
    pitch: m.getPitch(),
  };
  const otroEstilo = estilos && estilos.impresion !== estilos.actual;
  if (otroEstilo) m.setStyle(estilos.impresion);
  try {
    return await dibujar(m, trayectorias, impactos);
  } finally {
    // El mapa del perito queda como estaba: su estilo, su encuadre y su giro.
    if (otroEstilo) m.setStyle(estilos.actual);
    m.jumpTo(antes);
  }
}

async function dibujar(
  m: MapaMl,
  trayectorias: readonly TrayectoriaEnMapa[],
  impactos: readonly Impacto[],
): Promise<string | null> {
  const todos = trayectorias.flatMap((t) => [...t.puntos, ...t.contornos.flat()]);
  const lons = todos.map((p) => p[0]);
  const lats = todos.map((p) => p[1]);
  m.jumpTo({ bearing: 0, pitch: 0 });
  m.fitBounds(
    [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    { padding: 70, animate: false, maxZoom: 20 },
  );
  await espera(m, "idle", 8000);
  const fuente = m.getCanvas();
  const salida = document.createElement("canvas");
  salida.width = fuente.width;
  salida.height = fuente.height;
  const g = salida.getContext("2d");
  if (!g) return null;
  // El cuadro se copia en el mismo instante en que se dibuja (el búfer se borra después).
  const copiado = new Promise<void>((listo) => {
    m.once("render", () => {
      g.drawImage(fuente, 0, 0);
      listo();
    });
  });
  m.triggerRepaint();
  await Promise.race([copiado, espera(m, "render", 3000)]);
  const k = fuente.width / m.getContainer().clientWidth;
  const px = (p: [number, number]) => {
    const q = m.project(p);
    return [q.x * k, q.y * k] as const;
  };
  const linea = (pts: readonly [number, number][]) => {
    g.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = px(p);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
  };
  trayectorias.forEach((t, i) => {
    const color = COLORES[i % COLORES.length]!;
    g.strokeStyle = color;
    g.lineWidth = 2.5 * k;
    g.setLineDash([8 * k, 6 * k]);
    linea(t.puntos);
    g.stroke();
    g.setLineDash([]);
    t.contornos.forEach((c, j) => {
      linea(c);
      g.fillStyle = `${color}${j === 2 ? "55" : "22"}`;
      g.fill();
      g.lineWidth = (j === 2 ? 3 : 1.5) * k;
      g.stroke();
    });
    const [x, y] = px(t.contornos[2]![0]!);
    // El nombre con un halo blanco, para que se lea sobre las calles y los contornos.
    g.font = `bold ${Math.round(15 * k)}px sans-serif`;
    g.lineJoin = "round";
    g.strokeStyle = "#ffffff";
    g.lineWidth = 4 * k;
    g.strokeText(t.vehiculo, x + 8 * k, y - 8 * k);
    g.fillStyle = color;
    g.fillText(t.vehiculo, x + 8 * k, y - 8 * k);
  });
  g.strokeStyle = "#111111";
  g.fillStyle = "#111111";
  g.lineWidth = 2.5 * k;
  for (const i of impactos) {
    const [x, y] = px([i.punto.lon, i.punto.lat]);
    const r = 8 * k;
    g.beginPath();
    g.moveTo(x - r, y - r);
    g.lineTo(x + r, y + r);
    g.moveTo(x + r, y - r);
    g.lineTo(x - r, y + r);
    g.stroke();
    g.font = `bold ${Math.round(13 * k)}px sans-serif`;
    g.fillText(`X${i.numero}`, x + r + 3 * k, y + r);
  }
  // El norte (el mapa quedó sin giro), la escala y la atribución, sobre un fondo claro.
  const caja = (x: number, y: number, w: number, h: number) => {
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillRect(x, y, w, h);
    g.fillStyle = "#111111";
  };
  g.font = `${Math.round(13 * k)}px sans-serif`;
  caja(salida.width - 52 * k, 10 * k, 42 * k, 24 * k);
  g.fillText("N ↑", salida.width - 46 * k, 27 * k);
  const centro = m.getCenter();
  const a = m.project(centro);
  const b = m.unproject([a.x + 100, a.y]);
  const metrosPorPx = centro.distanceTo(b) / 100 / k;
  const metros = barra(metrosPorPx, salida.width);
  const largo = metros / metrosPorPx;
  caja(10 * k, salida.height - 34 * k, largo + 70 * k, 24 * k);
  g.fillRect(18 * k, salida.height - 22 * k, largo, 3 * k);
  g.fillText(`${metros} m`, 24 * k + largo, salida.height - 16 * k);
  const ancho = g.measureText(ATRIBUCION).width;
  caja(salida.width - ancho - 20 * k, salida.height - 30 * k, ancho + 14 * k, 22 * k);
  g.fillText(ATRIBUCION, salida.width - ancho - 13 * k, salida.height - 14 * k);
  return salida.toDataURL("image/png");
}
