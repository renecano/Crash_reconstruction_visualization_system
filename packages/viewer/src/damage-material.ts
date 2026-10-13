/**
 * Materiales de daño en TSL (PLAN §7.3.2 y §7.3.4): funcionan igual sobre WebGPU y WebGL 2.
 *
 * - Pintura dañada: la transferencia de pintura del otro vehículo, los rayones (metal expuesto)
 *   y las abolladuras finas (normales perturbadas por un campo de altura de ruido) aparecen con
 *   la influencia del daño y solo donde el atributo `dano`/`transferencia` horneado lo indica.
 * - Parabrisas agrietado: telaraña procedural (grietas radiales y anillos concéntricos con
 *   ruido) alrededor del punto de contacto, que crece con la influencia.
 *
 * Todo es procedural (sin texturas descargadas): no suma bytes a la carga inicial.
 */
import {
  abs,
  atan,
  attribute,
  clamp,
  color,
  cross,
  dot,
  faceDirection,
  float,
  length,
  max,
  mix,
  mx_noise_float,
  normalize,
  normalView,
  positionLocal,
  positionView,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  fract,
} from "three/tsl";
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";

type FloatNode = ReturnType<typeof mx_noise_float>;

/** Normal perturbada por un campo de altura usando derivadas en pantalla (Mikkelsen 2010). */
function perturbNormal(height: FloatNode) {
  const dHdx = height.dFdx();
  const dHdy = height.dFdy();
  const sigmaX = positionView.dFdx().normalize();
  const sigmaY = positionView.dFdy().normalize();
  const n = normalView;
  const r1 = cross(sigmaY, n);
  const r2 = cross(n, sigmaX);
  const det = dot(sigmaX, r1).mul(faceDirection);
  const grad = det.sign().mul(dHdx.mul(r1).add(dHdy.mul(r2)));
  return normalize(det.abs().mul(n).sub(grad));
}

export interface DamagedPaint {
  material: MeshPhysicalNodeMaterial;
  /** Influencia del daño (0 antes del impacto, 1 al terminar el contacto). */
  influence: { value: number };
}

/** Pintura con transferencia, rayones y abolladuras ligadas a los atributos de daño. */
export function damagedPaintMaterial(baseHex: string, otherHex?: string): DamagedPaint {
  const influence = uniform(0);
  const dano = attribute("dano", "float").mul(influence);
  const transfer = attribute("transferencia", "float").mul(influence);
  const p = positionLocal;
  const scratches = smoothstep(0.55, 0.8, mx_noise_float(p.mul(vec2(55, 6).xyx))).mul(dano);
  const base = color(baseHex);
  // Transferencia en vetas horizontales (roce entre carrocerías), no en manchas.
  const streaks = smoothstep(0.1, 0.55, mx_noise_float(p.mul(vec2(3, 38).xyx)));
  const painted = otherHex ? mix(base, color(otherHex), clamp(transfer.mul(streaks), 0, 1)) : base;
  const m = new MeshPhysicalNodeMaterial();
  m.colorNode = mix(painted, color("#8f9296"), clamp(scratches.mul(0.8), 0, 1));
  m.roughnessNode = mix(float(0.38), float(0.85), clamp(dano.mul(1.3).add(scratches), 0, 1));
  m.metalnessNode = mix(float(0.35), float(0.75), clamp(scratches, 0, 1));
  m.clearcoatNode = mix(float(1), float(0.05), clamp(dano.mul(2.5), 0, 1));
  m.clearcoatRoughnessNode = float(0.12);
  const dents = mx_noise_float(p.mul(9))
    .mul(0.018)
    .add(mx_noise_float(p.mul(31)).mul(0.004))
    .mul(dano);
  m.normalNode = perturbNormal(dents);
  return { material: m, influence };
}

export interface CrackedGlass {
  material: MeshPhysicalNodeMaterial;
  /** Crecimiento de la grieta (0–1). */
  crack: { value: number };
}

/**
 * Parabrisas con grieta en telaraña alrededor de `centerUv` (coordenadas de la cara grande del
 * parabrisas). `aspect` es ancho/alto de esa cara para que la telaraña quede circular.
 */
export function crackedGlassMaterial(
  centerUv: [number, number],
  aspect: number,
  radius = 0.35,
): CrackedGlass {
  const crack = uniform(0);
  const center = uniform(vec2(centerUv[0], centerUv[1]));
  const d = uv().sub(center).mul(vec2(aspect, 1));
  const r = length(d);
  const a = atan(d.y, d.x);
  const jitter = mx_noise_float(vec2(a.mul(3), r.mul(4)).xyx).mul(0.6);
  const radial = float(1).sub(
    smoothstep(
      0,
      0.035,
      abs(sin(a.mul(13).add(jitter)))
        .mul(r)
        .mul(1.5),
    ),
  );
  const ring = float(1).sub(
    smoothstep(0, 0.06, abs(fract(r.mul(9).add(jitter.mul(0.3))).sub(0.5))),
  );
  const extent = crack.mul(radius);
  const inside = float(1).sub(smoothstep(extent.mul(0.75), extent.add(0.001), r));
  const core = float(1)
    .sub(smoothstep(0, 0.03, r))
    .mul(crack);
  const mask = clamp(max(radial, ring.mul(0.7)).mul(inside).add(core), 0, 1);
  const m = new MeshPhysicalNodeMaterial({ transparent: true });
  m.colorNode = mix(color("#1c2730"), color("#e9eef2"), mask.mul(0.85));
  m.opacityNode = mix(float(0.78), float(0.96), mask);
  m.roughnessNode = mix(float(0.06), float(0.5), mask);
  m.metalnessNode = float(0.1);
  return { material: m, crack };
}

/** Faro roto: sin luz y opaco (las piezas de vidrio salen como restos). */
export function brokenLightMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  m.colorNode = color("#2b2d30");
  m.roughnessNode = float(0.9);
  return m;
}
