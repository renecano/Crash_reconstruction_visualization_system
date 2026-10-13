"""Orquestador: de una EscenaSpec validada a una reconstrucción determinista.

Pasos: (1) modelos de vehículo a partir del contrato y de la tabla de clases; (2) fase previa al
impacto sobre la geometría declarada (maniobra, frenado, percepción-reacción); (3) impacto
principal (vehículo–vehículo con impulso planar, vehículo–objeto fijo, vehículo–persona con
proyección de Searle); (4) reparto de energía de deformación en perfiles CRASH3; (5) movimiento
posterior hasta el reposo; (6) banderas de consistencia básicas. Toda cantidad incierta se toma
en su valor nominal; el muestreo Monte Carlo de los rangos llega en F7 (la semilla ya se registra).
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from croquis_solver import fixed_object, friction, pedestrian
from croquis_solver.crash3 import TRIANGULAR_SHAPES, Stiffness, crush_energy, profile_for_energy
from croquis_solver.impact import ImpactResult, planar_impact
from croquis_solver.models import Body2D, State2D, Trajectory, Vec, rot, wrap_angle
from croquis_solver.postimpact import ROLLING_RESISTANCE, WheelConfig, integrate
from croquis_solver.preimpact import (
    ArcPath,
    LaneChangePath,
    SpeedProfile,
    StraightPath,
    braking_deceleration,
    simulate,
)
from croquis_solver.preimpact import (
    Path as KinPath,
)
from croquis_solver.stiffness import stiffness_for, zona_from_cdc_side
from croquis_solver.units import ms_to_kmh

JsonObj = dict[str, Any]

DT_OUT = 0.02
T_PRE_MAX = 6.0
T_PRE_MIN = 1.0
T_POST_MAX = 30.0
RESTITUTION_VV = 0.1  # vehículo–vehículo (Brach: 0.05–0.3 a velocidades urbanas)
IMPULSE_RATIO = 0.4  # fricción de contacto (impulso tangencial / normal)
POST_IMPACT_DRAG_FRACTION = 0.35  # fracción de μ como arrastre si las ruedas no van bloqueadas
TURN_RADIUS_M = 8.0  # radio típico de vuelta en intersección urbana
LANE_CHANGE_LENGTH_M = 40.0
LANE_WIDTH_DEFAULT = 3.5
DEFAULT_BRAKE_BEFORE_IMPACT_S = 0.6  # si frenó pero no dice desde dónde
PEDESTRIAN_LAUNCH_ANGLE_DEG = 10.0
PEDESTRIAN_CG_HEIGHT_FACTOR = 0.57  # altura del CG como fracción de la estatura
PEDESTRIAN_PROJECTION_FACTOR = 0.9
PEDESTRIAN_CRUSH_ENERGY_FRACTION = (
    0.1  # fracción de la energía del peatón que deforma cofre/cristal
)

CLASSES_PATH = (
    Path(__file__).resolve().parents[2] / "packages" / "scene-schema" / "vehicle_classes.json"
)

_MASS = {"kg": 1.0, "t": 1000.0, "lb": 0.45359237}
_LEN = {"m": 1.0, "cm": 0.01, "mm": 0.001, "km": 1000.0}
_SPEED = {"km/h": 1 / 3.6, "m/s": 1.0}


@dataclass
class VehicleModel:
    id: str
    rol: str
    clase: str
    body: Body2D
    wheelbase: float
    cg_from_front: float
    track: float
    v0: float  # m/s
    pose0: tuple[float, float, float]  # x, y, yaw (rad)
    maniobra: str
    braking: bool
    brake_distance: float | None
    abs_: bool


@dataclass
class VehicleOutcome:
    id: str
    rol: str
    involucrado: bool
    trajectory: Trajectory
    v_impact_kmh: float
    delta_v_kmh: float
    pdof_hours: float | None
    crush_profile_m: list[float]
    crush_width_m: float
    crush_energy_j: float
    stiffness_origen: str
    stopped: bool
    rest_pose: tuple[float, float, float]
    distance_post_m: float


@dataclass
class PersonOutcome:
    id: str
    rol: str
    launch_speed_kmh: float | None
    throw_distance_m: float | None
    throw_range_m: tuple[float, float] | None
    rest_position: tuple[float, float] | None
    contact: dict[str, str] | None


def _empty_detail() -> dict[str, Any]:
    return {}


@dataclass
class EventOutcome:
    id: str
    tipo: str
    t: float
    actores: list[str]
    detalle: dict[str, Any] = field(default_factory=_empty_detail)


@dataclass
class Reconstruction:
    escena_id: str
    semilla: int
    dt: float
    t_inicio: float
    t_fin: float
    vehiculos: list[VehicleOutcome]
    personas: list[PersonOutcome]
    eventos: list[EventOutcome]
    banderas: list[str]
    parametros: dict[str, Any]

    def to_dict(self) -> JsonObj:
        d = asdict(self)
        for v in d["vehiculos"]:
            tr = v["trajectory"]
            v["trajectory"] = {k: [round(x, 6) for x in tr[k]] for k in tr}
        return d

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=1)


# ----------------------------------------------------------------------------------------------
# Lectura del contrato (SI)
# ----------------------------------------------------------------------------------------------


def _num(campo: JsonObj | None, table: dict[str, float], default: float) -> float:
    if not campo:
        return default
    return float(campo["valor"]) * table.get(str(campo.get("unidad", "")), 1.0)


def _classes() -> dict[str, Any]:
    if not CLASSES_PATH.exists():
        return {}
    data: dict[str, Any] = json.loads(CLASSES_PATH.read_text(encoding="utf-8"))
    clases: dict[str, Any] = data.get("clases", {})
    return clases


def _vehicle_model(v: JsonObj, clases: dict[str, Any], banderas: list[str]) -> VehicleModel:
    clase = v["clase"]["valor"]
    tip = clases.get(clase, {}).get("tipico", {})
    mass = _num(v.get("masa"), _MASS, float(tip.get("masa_kg", 1200.0)))
    length = _num(v.get("largo"), _LEN, float(tip.get("largo_m", 4.4)))
    width = _num(v.get("ancho"), _LEN, float(tip.get("ancho_m", 1.75)))
    wb_default = float(tip.get("distancia_entre_ejes_m", 0.58 * length))
    wheelbase = min(_num(v.get("distancia_entre_ejes"), _LEN, wb_default), 0.9 * length)
    pose = v["posicion_inicial"]
    frenado: JsonObj = v.get("frenado") or {}
    aplico: JsonObj = frenado.get("aplico") or {}
    abs_campo: JsonObj = frenado.get("abs") or {}
    braking = bool(aplico.get("valor", False))
    dist: JsonObj | None = frenado.get("distancia_antes_impacto")
    maniobra = v["maniobra"]["valor"]
    v0 = _num(v.get("velocidad_previa"), _SPEED, 0.0)
    if maniobra in {"detenido", "estacionado"}:
        v0 = 0.0
    if not clases.get(clase) and v.get("masa") is None:
        banderas.append(f"Vehículo {v['rol']}: sin tabla de clase ni masa; se usa 1200 kg.")
    return VehicleModel(
        id=v["id"],
        rol=v["rol"],
        clase=clase,
        body=Body2D.from_dimensions(mass, length, width),
        wheelbase=wheelbase,
        cg_from_front=0.45 * wheelbase,
        track=max(0.6 * width, 0.4),
        v0=v0,
        pose0=(float(pose["x"]), float(pose["y"]), math.radians(float(pose["rumbo_deg"]))),
        maniobra=maniobra,
        braking=braking,
        brake_distance=_num(dist, _LEN, 0.0) if dist else None,
        abs_=bool(abs_campo.get("valor", False)),
    )


def _path_for(m: VehicleModel, lane_width: float) -> KinPath:
    x, y, yaw = m.pose0
    if m.maniobra == "vuelta_izquierda":
        return ArcPath((x, y), yaw, TURN_RADIUS_M, math.pi * TURN_RADIUS_M, left=True)
    if m.maniobra == "vuelta_derecha":
        return ArcPath((x, y), yaw, TURN_RADIUS_M, math.pi * TURN_RADIUS_M, left=False)
    if m.maniobra == "vuelta_u":
        r = 0.75 * TURN_RADIUS_M
        return ArcPath((x, y), yaw, r, math.pi * r, left=True)
    if m.maniobra == "cambio_carril_izquierda":
        return LaneChangePath((x, y), yaw, LANE_CHANGE_LENGTH_M, lane_width)
    if m.maniobra == "cambio_carril_derecha":
        return LaneChangePath((x, y), yaw, LANE_CHANGE_LENGTH_M, -lane_width)
    if m.maniobra == "reversa":
        return StraightPath((x, y), wrap_angle(yaw + math.pi), 500.0)
    return StraightPath((x, y), yaw, 500.0)


def _arc_length_to(path: KinPath, target: Vec, s_max: float) -> float:
    """Longitud de arco cuyo punto está más cerca de `target` (búsqueda fina determinista)."""
    best_s, best_d = 0.0, math.inf
    n = 2000
    for i in range(n + 1):
        s = s_max * i / n
        p = path.pose(s)
        d = (p.x - target[0]) ** 2 + (p.y - target[1]) ** 2
        if d < best_d:
            best_s, best_d = s, d
    return best_s


def _primary_event(spec: JsonObj) -> JsonObj | None:
    eventos = sorted(spec["eventos"], key=lambda e: int(e["orden"]))
    for e in eventos:
        if str(e["tipo"]).startswith("impacto_"):
            return e
    return None


def _crush_shape_and_width(cdc: JsonObj | None, body: Body2D) -> tuple[list[float], float]:
    lado = (cdc or {}).get("lado", "F")
    zona_h = (cdc or {}).get("zona_horizontal", "D")
    side_len = body.width if lado in {"F", "B"} else body.length
    if zona_h == "D":
        return TRIANGULAR_SHAPES["uniforme"], side_len
    if zona_h in {"Y", "Z"}:
        shape = TRIANGULAR_SHAPES["izquierda"] if zona_h == "Y" else TRIANGULAR_SHAPES["derecha"]
        return shape, 0.66 * side_len
    if zona_h in {"L", "F"}:
        return TRIANGULAR_SHAPES["izquierda"], 0.4 * side_len
    if zona_h in {"R", "B"}:
        return TRIANGULAR_SHAPES["derecha"], 0.4 * side_len
    return TRIANGULAR_SHAPES["centro"], 0.4 * side_len


def _normal_from_cdc(cdc: JsonObj | None, state: State2D) -> Vec | None:
    lado = (cdc or {}).get("lado")
    local = {"F": (1.0, 0.0), "B": (-1.0, 0.0), "L": (0.0, 1.0), "R": (0.0, -1.0)}.get(str(lado))
    return rot(local, state.yaw) if local else None


def _static_trajectory(
    pose: tuple[float, float, float], t0: float, t1: float, dt: float
) -> Trajectory:
    x, y, yaw = pose
    traj = Trajectory()
    n = round((t1 - t0) / dt)
    for i in range(n + 1):
        traj.append(State2D(x, y, yaw, 0.0, 0.0, 0.0, t0 + i * dt))
    return traj


# ----------------------------------------------------------------------------------------------
# Reconstrucción
# ----------------------------------------------------------------------------------------------


def reconstruct(spec: JsonObj, *, dt: float = DT_OUT) -> Reconstruction:
    """Reconstruye la escena. `spec` debe haber pasado la validación del contrato."""
    banderas: list[str] = []
    seed = int(spec["meta"]["semilla"])
    lugar = spec["lugar"]
    clases = _classes()
    mu_tire = friction.tire_friction(
        lugar["superficie"]["valor"], lugar["estado_superficie"]["valor"]
    )
    mu = float(lugar["friccion"]["valor"]) if lugar.get("friccion") else mu_tire.nominal
    lane_width = _num(lugar.get("ancho_carril"), _LEN, LANE_WIDTH_DEFAULT)
    grade = float(lugar["pendiente"]["valor"]) if lugar.get("pendiente") else 0.0
    abs_factor = friction.abs_peak_factor().nominal
    params: dict[str, Any] = {
        "friccion_llanta": {
            "valor": mu,
            "rango": [mu_tire.low, mu_tire.high],
            "fuente": mu_tire.fuente,
            "tipo": mu_tire.tipo,
        },
        "restitucion_vehiculo_vehiculo": {"valor": RESTITUTION_VV, "tipo": "supuesto"},
        "relacion_impulso_tangencial": {"valor": IMPULSE_RATIO, "tipo": "supuesto"},
        "arrastre_post_impacto": {"valor": POST_IMPACT_DRAG_FRACTION, "tipo": "supuesto"},
        "factor_abs": {"valor": abs_factor, "tipo": friction.abs_peak_factor().tipo},
        "semilla": seed,
    }

    models = [_vehicle_model(v, clases, banderas) for v in spec["vehiculos"]]
    by_id = {m.id: m for m in models}
    event = _primary_event(spec)
    actores: list[str] = list(event["actores"]) if event else []
    involved = [by_id[a] for a in actores if a in by_id]
    impact_point: Vec | None = None
    if event and event.get("punto_impacto"):
        impact_point = (float(event["punto_impacto"]["x"]), float(event["punto_impacto"]["y"]))
    elif involved:
        impact_point = (
            sum(m.pose0[0] for m in involved) / len(involved),
            sum(m.pose0[1] for m in involved) / len(involved),
        )

    # ---- fase previa ---------------------------------------------------------------------
    paths: dict[str, KinPath] = {}
    profiles: dict[str, SpeedProfile] = {}
    t_to_impact: dict[str, float] = {}
    for m in models:
        path = _path_for(m, lane_width)
        paths[m.id] = path
        decel = braking_deceleration(
            mu, abs_factor=abs_factor if m.abs_ else 1.0, grade_percent=grade
        )
        if m.v0 <= 0 or impact_point is None or m.id not in actores:
            profiles[m.id] = SpeedProfile(m.v0)
            t_to_impact[m.id] = 0.0
            continue
        s_imp = _arc_length_to(path, impact_point, min(path.length, 400.0))
        if m.braking:
            if m.brake_distance is None:
                d_brake = m.v0 * DEFAULT_BRAKE_BEFORE_IMPACT_S
                banderas.append(
                    f"Vehículo {m.rol}: frenó pero no dice desde dónde; se asume "
                    f"{DEFAULT_BRAKE_BEFORE_IMPACT_S} s antes del impacto."
                )
            else:
                d_brake = m.brake_distance
            d_brake = min(d_brake, s_imp)
            prof = SpeedProfile(m.v0, (s_imp - d_brake) / m.v0, decel)
            if prof.time_to_distance(s_imp) is None:
                banderas.append(
                    f"Vehículo {m.rol}: con {ms_to_kmh(m.v0):.0f} km/h y {d_brake:.1f} m de "
                    "frenado se habría detenido antes del impacto; se recorta el frenado."
                )
                d_brake = 0.9 * m.v0 * m.v0 / (2 * decel)
                prof = SpeedProfile(m.v0, (s_imp - d_brake) / m.v0, decel)
        else:
            prof = SpeedProfile(m.v0)
        profiles[m.id] = prof
        t_imp = prof.time_to_distance(s_imp)
        t_to_impact[m.id] = t_imp if t_imp is not None else s_imp / m.v0

    t_pre = min(T_PRE_MAX, max([T_PRE_MIN, *t_to_impact.values()]))
    pre: dict[str, Trajectory] = {}
    impact_states: dict[str, State2D] = {}
    for m in models:
        prof = profiles[m.id]
        t_imp = t_to_impact[m.id]
        if m.v0 <= 0:
            traj = _static_trajectory(m.pose0, -t_pre, 0.0, dt)
        elif m.id not in actores:
            # No participa en el impacto: sigue su camino a velocidad constante.
            traj = simulate(paths[m.id], prof, t_end=t_pre, dt=dt, t0=0.0)
            shifted = Trajectory()
            for i in range(len(traj)):
                s = traj.state(i)
                shifted.append(
                    State2D(s.x, s.y, s.yaw, s.vx, s.vy, s.yaw_rate, round(s.t - t_pre, 9))
                )
            traj = shifted
        else:
            # Llega al punto de impacto exactamente en t = 0.
            raw = simulate(paths[m.id], prof, t_end=t_imp, dt=dt, t0=0.0)
            traj = Trajectory()
            if t_imp < t_pre - 1e-9:
                first = raw.state(0)
                traj = _static_trajectory((first.x, first.y, first.yaw), -t_pre, -t_imp - dt, dt)
                banderas.append(
                    f"Vehículo {m.rol}: aparece en escena {t_imp:.1f} s antes del impacto."
                )
            for i in range(len(raw)):
                s = raw.state(i)
                traj.append(State2D(s.x, s.y, s.yaw, s.vx, s.vy, s.yaw_rate, round(s.t - t_imp, 9)))
        pre[m.id] = traj
        impact_states[m.id] = traj.last()

    # ---- impacto principal ---------------------------------------------------------------
    eventos_out: list[EventOutcome] = []
    post_start: dict[str, State2D] = {m.id: impact_states[m.id] for m in models}
    delta_v: dict[str, float] = dict.fromkeys(by_id, 0.0)
    pdof: dict[str, float | None] = dict.fromkeys(by_id, None)
    crush: dict[str, tuple[list[float], float, float, str]] = {
        m.id: ([0.0] * 6, m.body.width, 0.0, "sin impacto") for m in models
    }
    personas_out: list[PersonOutcome] = []
    zonas = {z["vehiculo_id"]: z.get("cdc") for z in (event or {}).get("zonas_impacto", [])}
    tipo_evento = str(event["tipo"]) if event else ""

    if event and tipo_evento == "impacto_vehiculo_vehiculo" and len(involved) >= 2 and impact_point:
        a, b = involved[0], involved[1]
        sa, sb = impact_states[a.id], impact_states[b.id]
        normal = _normal_from_cdc(zonas.get(a.id), sa)
        if normal is None:
            rel = (sb.vx - sa.vx, sb.vy - sa.vy)
            normal = (-rel[0], -rel[1]) if (rel[0] or rel[1]) else rot((1.0, 0.0), sa.yaw)
        res: ImpactResult = planar_impact(
            a.body,
            sa,
            b.body,
            sb,
            impact_point,
            normal,
            restitution=RESTITUTION_VV,
            friction=IMPULSE_RATIO,
        )
        assert res.b_after is not None
        post_start[a.id] = res.a_after
        post_start[b.id] = res.b_after
        delta_v[a.id], delta_v[b.id] = res.delta_v_a, res.delta_v_b
        pdof[a.id], pdof[b.id] = res.pdof_a_hours, res.pdof_b_hours
        # Reparto de la energía disipada entre carrocerías: inversamente a la rigidez B.
        cdc_a: JsonObj = zonas.get(a.id) or {}
        cdc_b: JsonObj = zonas.get(b.id) or {}
        lado_a = str(cdc_a.get("lado", "F"))
        lado_b = str(cdc_b.get("lado", "F"))
        ka = stiffness_for(a.clase, zona_from_cdc_side(lado_a))
        kb = stiffness_for(b.clase, zona_from_cdc_side(lado_b))
        wa, wb = 1.0 / ka.stiffness.b, 1.0 / kb.stiffness.b
        for m, e, k in (
            (a, res.energy_loss * wa / (wa + wb), ka),
            (b, res.energy_loss * wb / (wa + wb), kb),
        ):
            shape, width = _crush_shape_and_width(zonas.get(m.id), m.body)
            crush[m.id] = (profile_for_energy(e, width, k.stiffness, shape), width, e, k.origen)
        eventos_out.append(
            EventOutcome(
                event["id"],
                tipo_evento,
                0.0,
                [a.id, b.id],
                {
                    "impulso_ns": [res.impulse[0], res.impulse[1]],
                    "adherencia": res.sticking,
                    "friccion_contacto_usada": res.friction_used,
                    "energia_disipada_j": res.energy_loss,
                    "velocidad_cierre_kmh": ms_to_kmh(math.hypot(sa.vx - sb.vx, sa.vy - sb.vy)),
                },
            )
        )
    elif event and tipo_evento == "impacto_vehiculo_objeto" and involved and impact_point:
        a = involved[0]
        sa = impact_states[a.id]
        objetos = {o["id"]: o for o in spec["entorno"].get("objetos", [])}
        obj = next((objetos[x] for x in actores if x in objetos), None)
        k = stiffness_for(a.clase, "frontal")
        v_imp = sa.speed
        flat_types = {"muro", "barda", "vehiculo_estacionado", "contenedor", "puesto"}
        if obj is None or obj.get("tipo") in flat_types:
            r = fixed_object.rigid_barrier(a.body, v_imp, k.stiffness, restitution=0.1)
            detalle_obj = str(obj.get("tipo")) if obj else "guarnicion"
        else:
            diam = _num(obj.get("diametro_tronco"), _LEN, 0.3)
            r = fixed_object.narrow_object(
                a.body,
                v_imp,
                k.stiffness,
                diameter_m=diam,
                material=str(obj.get("material", "concreto")),
            )
            detalle_obj = str(obj.get("tipo"))
        delta_v[a.id] = r.delta_v
        pdof[a.id] = 0.0
        heading = (math.cos(sa.yaw), math.sin(sa.yaw))
        sign = -1.0 if r.rigid else 1.0
        post_start[a.id] = sa.with_velocity(
            sign * r.v_after * heading[0], sign * r.v_after * heading[1], 0.0
        )
        crush[a.id] = (r.profile, r.damage_width, r.energy_absorbed_vehicle, k.origen)
        eventos_out.append(
            EventOutcome(
                event["id"],
                tipo_evento,
                0.0,
                [a.id] + ([str(obj["id"])] if obj else []),
                {
                    "objeto": detalle_obj,
                    "rigido": r.rigid,
                    "energia_objeto_j": r.energy_absorbed_object,
                    "aplastamiento_max_m": r.max_crush,
                },
            )
        )
    elif event and tipo_evento == "impacto_vehiculo_persona" and involved and impact_point:
        a = involved[0]
        sa = impact_states[a.id]
        personas = {p["id"]: p for p in spec["personas"]}
        ped = next((personas[x] for x in actores if x in personas), None)
        ped_id = str(ped["id"]) if ped else "peaton"
        v_imp = sa.speed
        mu_ped = friction.pedestrian_friction(lugar["superficie"]["valor"]).nominal
        ped_doc: JsonObj = ped or {}
        stature = _num(ped_doc.get("estatura"), _LEN, 1.7)
        m_ped = _num(ped_doc.get("masa"), _MASS, 75.0)
        rol_doc: JsonObj = ped_doc.get("rol") or {}
        launch = PEDESTRIAN_PROJECTION_FACTOR * v_imp
        h_cg = PEDESTRIAN_CG_HEIGHT_FACTOR * stature
        d_nom = pedestrian.searle_throw(launch, mu_ped, PEDESTRIAN_LAUNCH_ANGLE_DEG, h_cg)
        theta_min = pedestrian.searle_range(max(d_nom, 0.1), mu_ped, h_cg).theta_min_deg
        d_lo = pedestrian.searle_throw(launch, mu_ped, theta_min, h_cg)
        d_hi = pedestrian.searle_throw(launch, mu_ped, 0.0, h_cg)
        heading = (math.cos(sa.yaw), math.sin(sa.yaw))
        rest = (impact_point[0] + d_nom * heading[0], impact_point[1] + d_nom * heading[1])
        dv_a = m_ped * launch / (a.body.mass + m_ped)  # el vehículo cede momento al peatón
        delta_v[a.id] = dv_a
        pdof[a.id] = 0.0
        post_start[a.id] = sa.with_velocity(
            sa.vx - dv_a * heading[0], sa.vy - dv_a * heading[1], sa.yaw_rate
        )
        k = stiffness_for(a.clase, "frontal")
        e_ped = PEDESTRIAN_CRUSH_ENERGY_FRACTION * 0.5 * m_ped * launch * launch
        width_ped = 0.4 * a.body.width
        crush[a.id] = (
            profile_for_energy(e_ped, width_ped, k.stiffness, TRIANGULAR_SHAPES["centro"]),
            width_ped,
            e_ped,
            k.origen,
        )
        alto = float(clases.get(a.clase, {}).get("tipico", {}).get("alto_m", 1.5))
        contact = pedestrian.contact_zones(stature, 0.32 * alto, 0.55 * alto, 0.25 * a.body.length)
        declared = next(
            (
                e
                for e in spec["evidencias"]
                if e.get("tipo") == "distancia_proyeccion" and e.get("longitud")
            ),
            None,
        )
        if declared:
            d_decl = _num(declared["longitud"], _LEN, d_nom)
            rng = pedestrian.vehicle_speed_range_from_throw(
                d_decl, mu_ped, h_cg, (PEDESTRIAN_PROJECTION_FACTOR, 1.0)
            )
            if not (rng.v_min * 0.85 <= v_imp <= rng.v_max * 1.15):
                banderas.append(
                    f"La distancia de proyección declarada ({d_decl:.0f} m) sugiere entre "
                    f"{ms_to_kmh(rng.v_min):.0f} y {ms_to_kmh(rng.v_max):.0f} km/h; la velocidad "
                    f"reconstruida al impacto es {ms_to_kmh(v_imp):.0f} km/h."
                )
        personas_out.append(
            PersonOutcome(
                ped_id,
                str(rol_doc.get("valor", "peaton")),
                ms_to_kmh(launch),
                d_nom,
                (min(d_lo, d_hi), max(d_lo, d_hi)),
                rest,
                {
                    "defensa": contact.bumper_on_body,
                    "borde_cofre": contact.hood_edge_on_body or "",
                    "cabeza": contact.head_contact,
                },
            )
        )
        eventos_out.append(
            EventOutcome(
                event["id"],
                tipo_evento,
                0.0,
                [a.id, ped_id],
                {"distancia_proyeccion_m": d_nom, "rango_m": [min(d_lo, d_hi), max(d_lo, d_hi)]},
            )
        )
    elif event:
        banderas.append(
            f"Evento {event['id']} ({tipo_evento}) sin actores suficientes o sin punto de "
            "impacto: no se resolvió."
        )

    # ---- fase posterior ------------------------------------------------------------------
    vehiculos_out: list[VehicleOutcome] = []
    t_fin = 0.0
    post: dict[str, tuple[Trajectory, bool, float]] = {}
    for m in models:
        if m.id not in actores:
            continue
        start = post_start[m.id]
        if start.speed > 0.05 or abs(start.yaw_rate) > 0.05:
            wheels = WheelConfig.four_wheels(
                m.wheelbase, m.track, m.cg_from_front, locked=m.braking
            )
            drag = (
                ROLLING_RESISTANCE
                if m.braking
                else max(ROLLING_RESISTANCE, POST_IMPACT_DRAG_FRACTION * mu)
            )
            res_post = integrate(
                m.body,
                State2D(start.x, start.y, start.yaw, start.vx, start.vy, start.yaw_rate, 0.0),
                wheels,
                mu,
                dt_out=dt,
                t_max=T_POST_MAX,
                rolling_drag=drag,
            )
            post[m.id] = (res_post.trajectory, res_post.stopped, res_post.distance)
            if not res_post.stopped:
                banderas.append(f"Vehículo {m.rol}: no llegó al reposo en {T_POST_MAX:.0f} s.")
        else:
            post[m.id] = (Trajectory(), True, 0.0)
        t_fin = max(t_fin, post[m.id][0].t[-1] if len(post[m.id][0]) else 0.0)
    t_fin = max(t_fin, dt)

    for m in models:
        full = Trajectory()
        full.extend(pre[m.id])
        if m.id in actores:
            tr, stopped, dist_post = post[m.id]
            for i in range(1, len(tr)):
                full.append(tr.state(i))
        else:
            # Sigue a velocidad constante hasta que la escena termina.
            last = full.last()
            stopped, dist_post = m.v0 <= 0, 0.0
            n = round(t_fin / dt)
            for i in range(1, n + 1):
                t = i * dt
                full.append(
                    State2D(
                        last.x + last.vx * t,
                        last.y + last.vy * t,
                        last.yaw,
                        last.vx,
                        last.vy,
                        last.yaw_rate,
                        round(t, 9),
                    )
                )
        last = full.last()
        prof, width, e, origen = crush[m.id]
        vehiculos_out.append(
            VehicleOutcome(
                id=m.id,
                rol=m.rol,
                involucrado=m.id in actores,
                trajectory=full,
                v_impact_kmh=ms_to_kmh(impact_states[m.id].speed),
                delta_v_kmh=ms_to_kmh(delta_v[m.id]),
                pdof_hours=pdof[m.id],
                crush_profile_m=prof,
                crush_width_m=width,
                crush_energy_j=e,
                stiffness_origen=origen,
                stopped=stopped,
                rest_pose=(last.x, last.y, math.degrees(last.yaw)),
                distance_post_m=dist_post,
            )
        )
        if m.braking and m.v0 > 0 and m.id in actores:
            tb = profiles[m.id].t_brake
            if not math.isinf(tb):
                t_ev = round(tb - t_to_impact[m.id], 6)
                eventos_out.append(EventOutcome(f"frenado-{m.id}", "inicio_frenado", t_ev, [m.id]))
    for vo in vehiculos_out:
        if vo.involucrado:
            eventos_out.append(
                EventOutcome(f"reposo-{vo.id}", "reposo", vo.trajectory.last().t, [vo.id])
            )
    eventos_out.sort(key=lambda e: (e.t, e.id))

    return Reconstruction(
        escena_id=str(spec["meta"]["id"]),
        semilla=seed,
        dt=dt,
        t_inicio=-t_pre,
        t_fin=t_fin,
        vehiculos=vehiculos_out,
        personas=personas_out,
        eventos=eventos_out,
        banderas=banderas,
        parametros=params,
    )


def crush_energy_check(v: VehicleOutcome, k: Stiffness) -> float:
    """Energía del perfil reportado con la rigidez dada (para pruebas)."""
    return crush_energy(v.crush_profile_m, v.crush_width_m, k)


__all__ = [
    "EventOutcome",
    "PersonOutcome",
    "Reconstruction",
    "VehicleOutcome",
    "crush_energy_check",
    "reconstruct",
]
