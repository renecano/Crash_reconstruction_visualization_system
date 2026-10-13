/**
 * Daño de un vehículo en la escena (PLAN §7.3): deformación horneada, materiales de daño, faros
 * rotos, parabrisas agrietado, llantas desplazadas y bolsas de aire, todo animado con
 * `update(t)` a partir del instante del impacto. Las reglas que no salen del solver (cuándo se
 * agrieta un parabrisas o se rompe un faro) son ilustrativas y están documentadas en ADR 0007.
 */
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import {
  BoxGeometry,
  type Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { airbagForVehicle, airbagScale, type AirbagDecision } from "./airbag";
import {
  applyVehicleDamage,
  crushAt,
  damageInfluence,
  type DamageInput,
  type DamageSide,
  type VehicleDamage,
} from "./damage";
import { brokenLightMaterial, crackedGlassMaterial, damagedPaintMaterial } from "./damage-material";
import { profileFor, type CarLayout, type VehicleDimensions } from "./vehicle-geometry";

type VehicleResult = Resultado["vehiculos"][number];

/** Aplastamiento mínimo para deformar (m). */
export const MIN_CRUSH_M = 0.002;
/** Un faro se rompe si el aplastamiento en su posición supera esto (ilustrativo). */
export const HEADLIGHT_BREAK_M = 0.04;
/** Grietas en el parabrisas por deformación frontal a partir de este aplastamiento (ilustrativo). */
export const WINDSHIELD_CRACK_M = 0.3;
/** Las grietas crecen durante este tiempo después del impacto (s). */
export const CRACK_GROWTH_S = 0.25;

export interface DamageRig {
  damage: VehicleDamage | null;
  airbag: AirbagDecision;
  /** Descripción para el panel: qué se rompió y por qué. */
  notas: string[];
  update(t: number): void;
  materials: Material[];
}

export interface DamageRigContext {
  spec: EscenaSpec;
  resultado: Resultado;
  colorOf: (vehicleId: string) => string | undefined;
  seed: number;
}

function primaryEvent(r: Resultado) {
  return r.eventos.find((e) => e.tipo.startsWith("impacto_"));
}

export function damageInputFor(v: VehicleResult, ctx: DamageRigContext): DamageInput | null {
  const lado = v.dano.cdc?.lado ?? "F";
  if (!["F", "B", "L", "R"].includes(lado) || Math.max(...v.dano.perfil_m) < MIN_CRUSH_M)
    return null;
  const ev = primaryEvent(ctx.resultado);
  let otherColor: string | undefined;
  if (ev?.tipo === "impacto_vehiculo_vehiculo" && ev.actores.includes(v.id)) {
    const other = ev.actores.find((a) => a !== v.id);
    otherColor = other ? ctx.colorOf(other) : undefined;
  }
  return {
    lado: lado as DamageSide,
    perfil: v.dano.perfil_m,
    ancho: v.dano.ancho_m,
    centro: v.dano.centro_m,
    zonaVertical: v.dano.cdc?.zona_vertical,
    seed: ctx.seed,
    otherColor,
  };
}

export function buildDamageRig(
  group: Group,
  v: VehicleResult,
  dims: VehicleDimensions,
  paintHex: string,
  ctx: DamageRigContext,
): DamageRig {
  const notas: string[] = [];
  const materials: Material[] = [];
  const influences: { value: number }[] = [];
  const morphMeshes: Mesh[] = [];
  const swaps: { mesh: Mesh; broken: Material }[] = [];
  const cracks: { value: number }[] = [];
  const twoWheel = profileFor(v.clase).kind === "two_wheel";
  const input = damageInputFor(v, ctx);
  let damage: VehicleDamage | null = null;
  const wheelBase = new Map<Group, { pos: Vector3; rotY: number }>();

  if (input) {
    damage = applyVehicleDamage(group, v.clase, dims, input);
    for (const md of damage.meshes) {
      if (!md.mesh.userData.damaged) continue;
      morphMeshes.push(md.mesh);
      if (md.mesh.userData.role === "pintura") {
        const paint = damagedPaintMaterial(paintHex, input.otherColor);
        md.mesh.material = paint.material;
        materials.push(paint.material);
        influences.push(paint.influence);
      }
    }
    for (const w of damage.wheels)
      wheelBase.set(w.obj, { pos: w.obj.position.clone(), rotY: w.obj.rotation.y });
    if (damage.wheels.length > 0) notas.push("Una llanta queda desplazada por el aplastamiento.");
    // Faros rotos donde el aplastamiento los alcanza.
    if (input.lado === "F" || input.lado === "B") {
      for (const name of ["headlight_l", "headlight_r"]) {
        const m = group.getObjectByName(name);
        if (!(m instanceof Mesh) || input.lado !== "F") continue;
        const u = -m.position.z;
        if (crushAt(input, u) >= HEADLIGHT_BREAK_M) {
          const broken = brokenLightMaterial();
          materials.push(broken);
          swaps.push({ mesh: m as Mesh, broken });
        }
      }
      if (swaps.length > 0)
        notas.push(`Faro${swaps.length > 1 ? "s" : ""} roto${swaps.length > 1 ? "s" : ""}.`);
    }
  }

  // Parabrisas: contacto de la cabeza de un peatón o deformación frontal fuerte (ilustrativo).
  const windshield = group.getObjectByName("windshield");
  const ev = primaryEvent(ctx.resultado);
  const headOnGlass =
    ev?.tipo === "impacto_vehiculo_persona" &&
    ev.actores.includes(v.id) &&
    ctx.resultado.personas.some(
      (p) => ev.actores.includes(p.id) && p.proyeccion?.contacto.cabeza === "parabrisas",
    );
  const frontalCrush = input?.lado === "F" ? Math.max(...input.perfil) : 0;
  if (windshield instanceof Mesh && (headOnGlass || frontalCrush >= WINDSHIELD_CRACK_M)) {
    const geo = windshield.geometry as BoxGeometry;
    const params = geo.parameters;
    const aspect = params.depth / Math.max(0.01, params.height);
    const glass = crackedGlassMaterial(
      headOnGlass ? [0.5, 0.35] : [0.5, 0.12],
      aspect,
      headOnGlass ? 0.45 : 0.4,
    );
    (windshield as Mesh).material = glass.material;
    materials.push(glass.material);
    cracks.push(glass.crack);
    notas.push(
      headOnGlass
        ? "Parabrisas agrietado por el contacto con el peatón."
        : "Parabrisas agrietado por la deformación frontal.",
    );
  }

  // Bolsas de aire (misma regla que el panel).
  const airbag = airbagForVehicle(
    { id: v.id, delta_v_kmh: v.delta_v_kmh, pdof_horas: v.pdof_horas, dosRuedas: twoWheel },
    {
      personas: ctx.spec.personas,
      objetos: ctx.spec.entorno.objetos ?? [],
      eventos: ctx.resultado.eventos,
    },
  );
  const bags: Mesh[] = [];
  const layout = group.userData.layout as CarLayout | undefined;
  if (layout && (airbag.frontal || airbag.lateral)) {
    const fabric = new MeshStandardMaterial({ color: "#eceae4", roughness: 0.9 });
    materials.push(fabric);
    if (airbag.frontal) {
      const bag = new Mesh(new SphereGeometry(0.3, 16, 12), fabric);
      bag.name = "bolsa_frontal";
      bag.position.set(layout.wsBase - 0.55, layout.belt + 0.22, -(layout.cabinW / 2 - 0.42));
      bag.scale.setScalar(0);
      group.add(bag);
      bags.push(bag);
    }
    if (airbag.lateral) {
      const len = Math.max(0.8, layout.wsBase - layout.rwBase - 0.3);
      const side = airbag.lateral === "izquierda" ? -1 : 1;
      const curtain = new Mesh(new BoxGeometry(len, 0.38, 0.05), fabric);
      curtain.name = "bolsa_lateral";
      curtain.position.set(
        (layout.wsBase + layout.rwBase) / 2,
        layout.belt + 0.28,
        side * (layout.cabinW / 2 - 0.08),
      );
      curtain.scale.setScalar(0);
      group.add(curtain);
      bags.push(curtain);
    }
  }
  notas.push(`Bolsas de aire (ilustrativo): ${airbag.motivo}`);

  return {
    damage,
    airbag,
    notas,
    materials,
    update(t: number) {
      const k = damageInfluence(t);
      for (const m of morphMeshes) if (m.morphTargetInfluences) m.morphTargetInfluences[0] = k;
      for (const u of influences) u.value = k;
      for (const [obj, base] of wheelBase) {
        const w = damage?.wheels.find((x) => x.obj === obj);
        if (!w) continue;
        obj.position.copy(base.pos).addScaledVector(w.shift, k);
        obj.rotation.y = base.rotY + w.toe * k;
      }
      for (const s of swaps) {
        if (!s.mesh.userData.original) s.mesh.userData.original = s.mesh.material;
        s.mesh.material = k > 0.5 ? s.broken : (s.mesh.userData.original as Material);
      }
      const crack = Math.min(1, Math.max(0, t / CRACK_GROWTH_S));
      for (const c of cracks) c.value = crack;
      const sc = airbagScale(t);
      for (const b of bags) b.scale.setScalar(sc);
    },
  };
}
