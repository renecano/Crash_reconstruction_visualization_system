#!/usr/bin/env node
/**
 * El plan del video de Unity (René, 2026-11-17): cada caso completo (llegada, impacto y reposo final)
 * con cuatro cámaras y cortes limpios, cuadro por cuadro a 60 fps, en el formato del modo foto del
 * visor de escritorio (`apps/visor-unity/Assets/Croquis/Visor/Fotos.cs`). Sin interfaz, minimapa ni
 * barra: el modo foto solo dibuja la escena con la leyenda ilustrativa. Sin cifras en pantalla.
 *
 * Las tomas, en este orden:
 *   1. «llegada»: cinematográfica, un paneo lento alrededor del punto de choque mientras llegan.
 *   2. «detras»: detrás del vehículo A hasta el impacto, en cámara lenta los últimos instantes.
 *   3. «dano»: a ras del punto de choque, en cámara lenta (la del daño en el impacto).
 *   4. «cenital»: 3D desde arriba, del impacto al reposo final (el montaje sostiene el último cuadro).
 *
 * Las cámaras salen del Resultado de cada paquete (dónde chocan, hacia dónde iba cada uno), no a mano.
 *
 *   node tools/unity/video-unity.mjs <carpeta del paquete> [--ancho 3840] [--alto 2160] [--fps 60]
 *        [--casos axa-dia,alcance-dia,lateral_interseccion-dia] [--corto]
 *
 * Escribe en la carpeta del paquete `video-<caso>.json` (el plan de cada caso) y `video-montaje.json`
 * (las tomas y cuántos cuadros lleva cada una, para `video-unity-montar.mjs`). `--corto` deja cada
 * toma en un segundo: la prueba rápida antes de mandar la corrida.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Los casos de los videos. AXA solo va en la versión para CESVI; la pública usa el alcance sintético. */
export const CASOS = {
  "axa-dia": { nombre: "axa", archivo: "casos/axa-dia.json", publico: false },
  "alcance-dia": { nombre: "alcance-inventado", archivo: "casos/alcance-dia.json", publico: true },
  "lateral_interseccion-dia": {
    nombre: "lateral-interseccion",
    archivo: "casos/lateral_interseccion-dia.json",
    publico: true,
  },
};

/** Segundos de video de cada toma (a velocidad de video, no de la simulación). */
export const DURACION = { llegada: 8, detras: 9, dano: 7, cenital: 7 };

const grados = (r) => (r * 180) / Math.PI;
/** Azimut del modo foto (grados desde el norte hacia el este) de una dirección en planta (rad). */
export const azimutDe = (angulo) => (((90 - grados(angulo)) % 360) + 360) % 360;

/** La pose de un vehículo del Resultado en el instante t (interpolación lineal). */
export function pose(v, t) {
  const T = v.trayectoria;
  const n = T.t.length;
  if (t <= T.t[0]) return { x: T.x[0], y: T.y[0], rumbo: T.rumbo[0] };
  if (t >= T.t[n - 1]) return { x: T.x[n - 1], y: T.y[n - 1], rumbo: T.rumbo[n - 1] };
  let i = 1;
  while (T.t[i] < t) i++;
  const a = (t - T.t[i - 1]) / (T.t[i] - T.t[i - 1]);
  const f = (k) => T[k][i - 1] + (T[k][i] - T[k][i - 1]) * a;
  return { x: f("x"), y: f("y"), rumbo: f("rumbo") };
}

/**
 * Los instantes de una toma: de `desde` a `hasta` en tramos, cada uno con su velocidad (1 = tiempo
 * real; 0.15 = cámara lenta). Devuelve un instante por cuadro de video.
 */
export function instantes(tramos, fps) {
  const out = [];
  for (const { desde, hasta, velocidad } of tramos) {
    const cuadros = Math.max(1, Math.round(((hasta - desde) / velocidad) * fps));
    for (let k = 0; k < cuadros; k++) out.push(desde + ((hasta - desde) * k) / cuadros);
  }
  return out;
}

/** Ajusta la velocidad de un tramo para que la toma dure `segundos` de video. */
function aDuracion(tramos, segundos) {
  const actual = tramos.reduce((s, t) => s + (t.hasta - t.desde) / t.velocidad, 0);
  const k = actual / segundos;
  return tramos.map((t) => ({ ...t, velocidad: t.velocidad * k }));
}

/** Las cuatro tomas de un caso, con sus instantes y la cámara de cada cuadro. */
export function tomasDe(caso, { fps = 60, corto = false } = {}) {
  const r = caso.resultado;
  const [A, B] = r.vehiculos;
  const p = r.punto_impacto ?? pose(A, 0);
  const inicio = Math.max(r.t_inicio, -4.5);
  const fin = r.t_fin;
  const a0 = pose(A, 0);
  const rumboA = a0.rumbo;
  // El centro de lo que recorren después del golpe: el impacto y donde quedan.
  const ra = pose(A, fin);
  const rb = pose(B, fin);
  const cx = (p.x + ra.x + rb.x) / 3;
  const cy = (p.y + ra.y + rb.y) / 3;
  const alcance = Math.max(
    12,
    Math.hypot(ra.x - rb.x, ra.y - rb.y),
    Math.hypot(ra.x - p.x, ra.y - p.y),
    Math.hypot(rb.x - p.x, rb.y - p.y),
  );
  const seg = (s) => (corto ? 1 : s);

  const tomas = [
    {
      toma: "llegada",
      tramos: aDuracion([{ desde: inicio, hasta: -0.1, velocidad: 1 }], seg(DURACION.llegada)),
      camara: (u) => ({
        objetivo: "impacto",
        // Sobre la calle de A, adelante del punto de choque, viendo cómo llegan. Casi sobre su eje: a
        // 25° de lado, a 17 m, la cámara quedaba ~7 m fuera de la vía, dentro de una casa (la pared de
        // ladrillo del lateral y la rosa del alcance en la RTX, René 2026-11-17); a ±6°, menos de 2 m.
        azimut: azimutDe(rumboA) + 6 - 12 * u,
        distancia: 16 - 2 * u,
        altura: 3.4 - 1.0 * u,
        mira: 0.8,
        fov: 35,
      }),
    },
    {
      toma: "detras",
      tramos: aDuracion(
        [
          { desde: Math.max(inicio, -2.2), hasta: -0.3, velocidad: 1 },
          { desde: -0.3, hasta: Math.min(fin, 0.6), velocidad: 0.25 },
        ],
        seg(DURACION.detras),
      ),
      camara: () => ({
        objetivo: A.id,
        relativo: true,
        azimut: 180,
        distancia: 9,
        altura: 2.6,
        mira: 0.9,
        fov: 42,
      }),
    },
    {
      toma: "dano",
      tramos: aDuracion(
        [{ desde: -0.15, hasta: Math.min(fin, 0.9), velocidad: 1 }],
        seg(DURACION.dano),
      ),
      camara: (u) => ({
        objetivo: "impacto",
        // A tres cuartos, desde adelante de A y sobre su calle (de lado a la vía la tapaba un poste); a
        // 30°, a 6.5 m, queda ~3 m de lado: dentro de la vía.
        azimut: azimutDe(rumboA) + 30 - 8 * u,
        distancia: 6.5,
        altura: 1.4,
        mira: 0.6,
        fov: 38,
      }),
    },
    {
      toma: "cenital",
      tramos: aDuracion([{ desde: -0.6, hasta: fin, velocidad: 1 }], seg(DURACION.cenital)),
      camara: () => ({
        objetivo: [cx, cy],
        azimut: azimutDe(rumboA) - 90,
        distancia: 4,
        altura: Math.min(60, 14 + alcance * 1.4),
        mira: 0,
        fov: 40,
      }),
    },
  ];
  return tomas.map((x) => {
    const ts = instantes(x.tramos, fps);
    return {
      toma: x.toma,
      cuadros: ts.map((t, k) => ({
        t: Math.round(t * 1e4) / 1e4,
        camara: x.camara(ts.length > 1 ? k / (ts.length - 1) : 0),
      })),
    };
  });
}

function principal() {
  const args = process.argv.slice(2);
  const opcion = (n, d) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : d;
  };
  const carpeta = resolve(
    args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? ".",
  );
  const ancho = Number(opcion("ancho", 3840));
  const alto = Number(opcion("alto", 2160));
  const fps = Number(opcion("fps", 60));
  const corto = args.includes("--corto");
  const elegidos = opcion("casos", Object.keys(CASOS).join(",")).split(",");
  const montaje = { fps, ancho, alto, casos: [] };
  for (const clave of elegidos) {
    const c = CASOS[clave];
    if (!c) throw new Error(`No hay un caso «${clave}» para el video.`);
    const caso = JSON.parse(readFileSync(join(carpeta, c.archivo), "utf8"));
    const tomas = tomasDe(caso, { fps, corto });
    const plan = {
      ancho,
      alto,
      calidad: "ultra",
      formato: "jpg",
      calidad_jpg: 92,
      asiento: 2,
      // El logo de la esquina, que dibuja el visor en cada cuadro (video-unity-tarjetas.mjs).
      marca: "video-marca.png",
      marca_alto: 0.045,
      tomas: tomas.flatMap((x) =>
        x.cuadros.map((q, k) => ({
          id: `${c.nombre}_${x.toma}_${String(k + 1).padStart(5, "0")}`,
          caso: c.archivo,
          t: q.t,
          camara: q.camara,
        })),
      ),
    };
    writeFileSync(join(carpeta, `video-${c.nombre}.json`), JSON.stringify(plan));
    montaje.casos.push({
      nombre: c.nombre,
      publico: c.publico,
      plan: `video-${c.nombre}.json`,
      tomas: tomas.map((x) => ({ toma: x.toma, cuadros: x.cuadros.length })),
    });
    const total = plan.tomas.length;
    process.stdout.write(
      `${c.nombre}: ${total} cuadros (${(total / fps).toFixed(1)} s de video)\n`,
    );
  }
  writeFileSync(join(carpeta, "video-montaje.json"), `${JSON.stringify(montaje, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
