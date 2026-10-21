/**
 * Un croquis hecho a mano, como el de un parte de tránsito (capítulo «El problema», PLAN §11.3):
 * se dibuja en código con trazos temblorosos de lápiz (ruido con semilla, siempre el mismo), sobre
 * el papel del parte. No es una imagen de archivo: muestra lo que hoy hace la gente a mano.
 */

/** Generador con semilla (mulberry32): el mismo dibujo en el servidor y en el navegador. */
function aleatorio(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P = [number, number];

/** Un trazo de lápiz de a a b: se desvía un poco a mitad de camino, como la mano. */
function trazo(rnd: () => number, a: P, b: P, temblor = 1.6): string {
  const n = 6;
  const pts: P[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const j = i === 0 || i === n ? 0.6 : temblor;
    pts.push([
      a[0] + (b[0] - a[0]) * f + (rnd() - 0.5) * j,
      a[1] + (b[1] - a[1]) * f + (rnd() - 0.5) * j,
    ]);
  }
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` L${pts[i]![0].toFixed(1)} ${pts[i]![1].toFixed(1)}`;
  return d;
}

export function CroquisAMano({ alt }: { alt: string }) {
  const rnd = aleatorio(20261019);
  const lineas: string[] = [];
  // Dos calles que se cruzan (orillas), con el cruce abierto.
  for (const y of [70, 130]) {
    lineas.push(trazo(rnd, [10, y], [120, y]), trazo(rnd, [180, y], [290, y]));
  }
  for (const x of [120, 180]) {
    lineas.push(trazo(rnd, [x, 10], [x, 70]), trazo(rnd, [x, 130], [x, 190]));
  }
  // Dos rectángulos (A y B) y sus flechas.
  const caja = (x: number, y: number, w: number, h: number) =>
    lineas.push(
      trazo(rnd, [x, y], [x + w, y], 0.8),
      trazo(rnd, [x + w, y], [x + w, y + h], 0.8),
      trazo(rnd, [x + w, y + h], [x, y + h], 0.8),
      trazo(rnd, [x, y + h], [x, y], 0.8),
    );
  caja(54, 104, 34, 18);
  caja(158, 26, 16, 32);
  lineas.push(
    trazo(rnd, [92, 113], [140, 112], 1.2),
    trazo(rnd, [140, 112], [133, 107], 0.4),
    trazo(rnd, [140, 112], [133, 117], 0.4),
  );
  lineas.push(
    trazo(rnd, [166, 62], [164, 100], 1.2),
    trazo(rnd, [164, 100], [160, 93], 0.4),
    trazo(rnd, [164, 100], [169, 93], 0.4),
  );
  return (
    <svg
      viewBox="0 0 300 200"
      role="img"
      aria-label={alt}
      className="block w-full max-w-md rounded-panel"
      style={{ background: "var(--marca-papel)" }}
      data-testid="croquis-a-mano"
    >
      <g
        fill="none"
        stroke="var(--marca-tinta)"
        strokeOpacity={0.78}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {lineas.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g
        fill="var(--marca-tinta)"
        fillOpacity={0.8}
        fontFamily="'Segoe Print', 'Bradley Hand', cursive"
        fontSize={13}
      >
        <text x={66} y={117}>
          A
        </text>
        <text x={162} y={46}>
          B
        </text>
        <text x={145} y={96}>
          ?
        </text>
      </g>
    </svg>
  );
}
