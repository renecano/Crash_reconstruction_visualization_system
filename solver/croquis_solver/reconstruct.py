"""Orquestador: de una EscenaSpec validada a una reconstrucción determinista.

Pasos: (1) modelos de vehículo a partir del contrato y de la tabla de clases; (2) punto de
contacto común según las zonas CDC declaradas (`contact.py`); (3) fase previa al impacto sobre la
geometría declarada (maniobra, frenado), muestreada en una rejilla alineada a t = 0; (4) impacto
principal (vehículo–vehículo con impulso planar, vehículo–objeto fijo, vehículo–persona con
proyección de Searle); (5) reparto de energía de deformación en perfiles CRASH3; (6) movimiento
posterior hasta el reposo; (7) trayectorias de personas; (8) banderas de consistencia básicas.
Toda cantidad incierta se toma en su valor nominal; el muestreo Monte Carlo de los rangos llega
en F7 (la semilla ya se registra).

La salida (`Reconstruction.to_dict`) sigue `packages/scene-schema/resultado.schema.json`.
"""

from __future__ import annotations

import itertools
import json
import math
from collections.abc import Callable, Container
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from croquis_solver import dmath, fixed_object, friction, occupant, pedestrian, rollover, visibility
from croquis_solver.contact import ContactSolution, Locus, contact_offset, resolve_contact
from croquis_solver.crash3 import TRIANGULAR_SHAPES, Stiffness, crush_energy, profile_for_energy
from croquis_solver.impact import ImpactResult, planar_impact
from croquis_solver.inertia import body_for
from croquis_solver.models import Body2D, State2D, Trajectory, Vec, rot, wrap_angle
from croquis_solver.person_motion import (
    PersonTrack,
    approach_track,
    rest_track,
    ride_track,
    straight_walk_track,
    throw_track,
)
from croquis_solver.postimpact import (
    ROLLING_RESISTANCE,
    JointBody,
    PlannedImpact,
    PostImpactResult,
    WheelConfig,
    integrate,
    integrate_joint_impacts,
)
from croquis_solver.preimpact import (
    ArcPath,
    CompositePath,
    LaneChangePath,
    ReversePath,
    SpeedProfile,
    StraightPath,
    braking_deceleration,
    travel_heading,
)
from croquis_solver.preimpact import (
    Path as KinPath,
)
from croquis_solver.road import RoadAxis, lane_following_path, road_axis
from croquis_solver.scene_objects import SceneObject, scene_objects
from croquis_solver.stiffness import stiffness_for, zona_from_cdc_side
from croquis_solver.units import ms_to_kmh

JsonObj = dict[str, Any]

RESULT_VERSION = "1.10.0"
DT_OUT = 0.02
T_PRE_MAX = 6.0
T_PRE_MIN = 3.0  # contexto mínimo antes del impacto para el visor
T_HOLD_AFTER_REST = 2.0  # la escena sigue 2 s después del último reposo
T_POST_MAX = 30.0
RESTITUTION_VV = 0.1  # vehículo–vehículo (Brach: 0.05–0.3 a velocidades urbanas)
IMPULSE_RATIO = 0.4  # fricción de contacto (impulso tangencial / normal)
POST_IMPACT_DRAG_FRACTION = 0.35  # fracción de μ como arrastre si las ruedas no van bloqueadas
TURN_RADIUS_M = 8.0  # radio típico de vuelta en intersección urbana
LANE_CHANGE_LENGTH_M = 40.0
LANE_WIDTH_DEFAULT = 3.5
DEFAULT_BRAKE_BEFORE_IMPACT_S = 0.6  # si frenó pero no dice desde dónde
SEARCH_LENGTH_M = 400.0  # tramo de trayectoria donde se busca el contacto
CONTACT_GAP_FLAG_M = 0.5
SEEK_CONTACT_FRACTION = 0.75
PATH_TIE_M = 0.05  # empate de holgura: se prefiere seguir el carril
PEDESTRIAN_LAUNCH_ANGLE_DEG = 10.0
PEDESTRIAN_CG_HEIGHT_FACTOR = 0.57  # altura del CG como fracción de la estatura
PEDESTRIAN_PROJECTION_FACTOR = 0.9
PEDESTRIAN_CRUSH_ENERGY_FRACTION = 0.1  # fracción de la energía del peatón que deforma cofre
WALKING_SPEED_MS = 1.4  # supuesto dentro de las medias de Knoblauch et al. 1996 (1.25–1.51 m/s)
DEFAULT_STATURE_M = 1.7
DEFAULT_PERSON_MASS_KG = 75.0
# Vía (distancia entre llantas de un eje) como fracción del ancho: ≈ 0.84 en autos y SUVs
# (p. ej. 1.55 m / 1.80 m en un sedán compacto); la misma que usa el visor para las marcas.
TRACK_WIDTH_FRACTION = 0.84
TWO_WHEEL_CLASSES = frozenset({"motocicleta", "scooter", "bicicleta"})
RIDER_ROLES = frozenset({"motociclista", "ciclista"})
# Altura del centro de masa del jinete sentado: asiento (≈ 0.8 m en moto) más ≈ 0.25 m de torso.
RIDER_CG_HEIGHT_M = {"motocicleta": 1.05, "scooter": 1.0, "bicicleta": 1.15}
# El jinete no va sujeto: sale con la velocidad de su vehículo al impacto por este factor
# (pierde parte al golpear el otro vehículo); supuesto con el mismo rango que el de peatón.
RIDER_PROJECTION_FACTOR = 0.9

CLASSES_PATH = (
    Path(__file__).resolve().parents[2] / "packages" / "scene-schema" / "vehicle_classes.json"
)

_MASS = {"kg": 1.0, "t": 1000.0, "lb": 0.45359237}
_LEN = {"m": 1.0, "cm": 0.01, "mm": 0.001, "km": 1000.0}
_SPEED = {"km/h": 1 / 3.6, "m/s": 1.0}
_ANGLE = {"deg": 1.0, "rad": 180.0 / math.pi}


@dataclass
class VehicleModel:
    id: str
    rol: str
    clase: str
    body: Body2D
    height: float
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
    clase: str
    involucrado: bool
    length: float
    width: float
    height: float
    wheelbase: float
    mass: float
    trajectory: Trajectory
    v_impact_kmh: float
    delta_v_kmh: float
    pdof_hours: float | None
    crush_profile_m: list[float]
    crush_width_m: float
    crush_energy_j: float
    crush_center_m: float
    stiffness_origen: str
    cdc: JsonObj | None
    stopped: bool
    rest_pose: tuple[float, float, float]
    distance_post_m: float
    rollover: rollover.RolloverCheck | None = None
    later_damage: list[LaterDamage] = field(default_factory=lambda: list[LaterDamage]())


@dataclass
class LaterDamage:
    """El daño de un impacto posterior en un vehículo que ya tenía daño (carambola, ADR 0066)."""

    event_id: str
    t: float
    profile_m: list[float]
    width_m: float
    center_m: float
    energy_j: float
    stiffness_origen: str
    cdc: JsonObj | None
    delta_v_kmh: float
    pdof_hours: float | None


@dataclass
class ThrowOutcome:
    launch_speed_kmh: float
    throw_distance_m: float
    throw_range_m: tuple[float, float]
    rest_position: tuple[float, float]
    contact: dict[str, str]
    band_m: tuple[float, float] = (0.0, 0.0)  # banda de Searle con el rango de fricción
    mu_body: tuple[float, float, float] = (0.0, 0.0, 0.0)  # nominal, mínimo, máximo
    launch_angle_deg: float = 0.0
    cg_height_m: float = 0.0
    heading_rad: float = 0.0


@dataclass
class ThrowInfo:
    """Proyección de una persona (peatón golpeado o jinete que sale de su vehículo)."""

    person_id: str
    outcome: ThrowOutcome
    origin: Vec
    launch: float  # m/s
    mu: float
    kind: str  # "peaton" | "jinete"
    vehicle_id: str | None = None


@dataclass
class PersonOutcome:
    id: str
    rol: str
    stature_m: float
    vehiculo_id: str | None
    track: PersonTrack
    throw: ThrowOutcome | None = None
    occupant: JsonObj | None = None

    # Compatibilidad con las pruebas de F2.
    @property
    def throw_distance_m(self) -> float | None:
        return self.throw.throw_distance_m if self.throw else None

    @property
    def throw_range_m(self) -> tuple[float, float] | None:
        return self.throw.throw_range_m if self.throw else None

    @property
    def contact(self) -> dict[str, str] | None:
        return self.throw.contact if self.throw else None


@dataclass(frozen=True)
class Aviso:
    """Bandera estructurada: código estable y datos para convertirla en pregunta (F6).

    Solo existe en Python; el resultado publica el `mensaje` en `banderas`.
    """

    codigo: str
    mensaje: str
    datos: dict[str, Any]


def _no_avisos() -> list[Aviso]:
    return []


type _Flag = Callable[[str, dict[str, Any], str], None]


def _empty_detail() -> dict[str, Any]:
    return {}


@dataclass
class EventOutcome:
    id: str
    tipo: str
    t: float
    actores: list[str]
    detalle: dict[str, Any] = field(default_factory=_empty_detail)


def _no_objects() -> list[SceneObject]:
    return []


def _no_docs() -> list[JsonObj]:
    return []


def _r(x: float, nd: int = 6) -> float:
    v = round(x, nd)
    return 0.0 if v == 0 else v  # sin -0.0


@dataclass
class Reconstruction:
    escena_id: str
    semilla: int
    dt: float
    t_inicio: float
    t_fin: float
    punto_impacto: Vec | None
    vehiculos: list[VehicleOutcome]
    personas: list[PersonOutcome]
    eventos: list[EventOutcome]
    banderas: list[str]
    parametros: dict[str, Any]
    objetos: list[SceneObject] = field(default_factory=_no_objects)
    visibilidad: list[JsonObj] = field(default_factory=_no_docs)
    avisos: list[Aviso] = field(default_factory=_no_avisos)

    def to_dict(self) -> JsonObj:
        """Documento según `resultado.schema.json` (sin nulos: lo ausente se omite)."""
        out: JsonObj = {
            "version_resultado": RESULT_VERSION,
            "escena_id": self.escena_id,
            "semilla": self.semilla,
            "dt": self.dt,
            "t_inicio": _r(self.t_inicio),
            "t_fin": _r(self.t_fin),
        }
        if self.punto_impacto is not None:
            out["punto_impacto"] = {
                "x": _r(self.punto_impacto[0]),
                "y": _r(self.punto_impacto[1]),
            }
        out["vehiculos"] = [_vehicle_dict(v) for v in self.vehiculos]
        out["personas"] = [_person_dict(p) for p in self.personas]
        out["objetos"] = [o.to_dict() for o in self.objetos]
        out["visibilidad"] = list(self.visibilidad)
        out["eventos"] = [_event_dict(e) for e in self.eventos]
        out["banderas"] = list(self.banderas)
        out["parametros"] = self.parametros
        return out

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=1)


def _dano_dict(
    profile: list[float],
    width: float,
    center: float,
    energy: float,
    origen: str,
    cdc: JsonObj | None,
) -> JsonObj:
    dano: JsonObj = {
        "perfil_m": [_r(c) for c in profile],
        "ancho_m": _r(width),
        "centro_m": _r(center),
        "energia_j": _r(energy, 3),
        "origen_rigidez": origen,
    }
    if cdc:
        dano["cdc"] = {
            k: cdc[k] for k in ("lado", "zona_horizontal", "zona_vertical", "extension") if k in cdc
        }
    return dano


def _vehicle_dict(v: VehicleOutcome) -> JsonObj:
    tr = v.trajectory
    dano = _dano_dict(
        v.crush_profile_m,
        v.crush_width_m,
        v.crush_center_m,
        v.crush_energy_j,
        v.stiffness_origen,
        v.cdc,
    )
    d: JsonObj = {
        "id": v.id,
        "rol": v.rol,
        "clase": v.clase,
        "involucrado": v.involucrado,
        "dimensiones": {
            "largo_m": _r(v.length),
            "ancho_m": _r(v.width),
            "alto_m": _r(v.height),
            "distancia_entre_ejes_m": _r(v.wheelbase),
            "masa_kg": _r(v.mass, 3),
        },
        "trayectoria": {
            "t": [_r(x) for x in tr.t],
            "x": [_r(x) for x in tr.x],
            "y": [_r(x) for x in tr.y],
            "rumbo": [_r(x) for x in tr.yaw],
            "vx": [_r(x) for x in tr.vx],
            "vy": [_r(x) for x in tr.vy],
            "vel_angular": [_r(x) for x in tr.yaw_rate],
        },
        "v_impacto_kmh": _r(v.v_impact_kmh),
        "delta_v_kmh": _r(v.delta_v_kmh),
    }
    if v.pdof_hours is not None:
        d["pdof_horas"] = _r(v.pdof_hours)
    d["dano"] = dano
    if v.later_damage:
        posteriores: list[JsonObj] = []
        for ld in v.later_damage:
            dp: JsonObj = {"evento_id": ld.event_id, "t": _r(ld.t)}
            dp["delta_v_kmh"] = _r(ld.delta_v_kmh)
            if ld.pdof_hours is not None:
                dp["pdof_horas"] = _r(ld.pdof_hours)
            dp.update(
                _dano_dict(
                    ld.profile_m,
                    ld.width_m,
                    ld.center_m,
                    ld.energy_j,
                    ld.stiffness_origen,
                    ld.cdc,
                )
            )
            posteriores.append(dp)
        d["danos_posteriores"] = posteriores
    d["en_reposo"] = v.stopped
    d["pose_final"] = {
        "x": _r(v.rest_pose[0]),
        "y": _r(v.rest_pose[1]),
        "rumbo_deg": _r(v.rest_pose[2]),
    }
    d["distancia_post_m"] = _r(v.distance_post_m)
    if v.rollover is not None:
        d["volcadura"] = v.rollover.to_dict()
    return d


def _person_dict(p: PersonOutcome) -> JsonObj:
    tr = p.track
    d: JsonObj = {"id": p.id, "rol": p.rol, "estatura_m": _r(p.stature_m)}
    if p.vehiculo_id is not None:
        d["vehiculo_id"] = p.vehiculo_id
    d["trayectoria"] = {
        "t": [_r(x) for x in tr.t],
        "x": [_r(x) for x in tr.x],
        "y": [_r(x) for x in tr.y],
        "z": [_r(x) for x in tr.z],
        "rumbo": [_r(x) for x in tr.yaw],
    }
    d["fases"] = [
        {"fase": f.fase, "t_inicio": _r(f.t_inicio), "t_fin": _r(f.t_fin)} for f in tr.fases
    ]
    if p.throw is not None:
        th = p.throw
        d["proyeccion"] = {
            "velocidad_lanzamiento_kmh": _r(th.launch_speed_kmh),
            "distancia_m": _r(th.throw_distance_m),
            "rango_m": [_r(th.throw_range_m[0]), _r(th.throw_range_m[1])],
            "posicion_reposo": {"x": _r(th.rest_position[0]), "y": _r(th.rest_position[1])},
            "contacto": dict(th.contact),
            "banda_searle_m": [_r(th.band_m[0]), _r(th.band_m[1])],
            "friccion_cuerpo": {
                "valor": _r(th.mu_body[0]),
                "rango": [_r(th.mu_body[1]), _r(th.mu_body[2])],
            },
            "angulo_lanzamiento_deg": _r(th.launch_angle_deg),
            "altura_cg_m": _r(th.cg_height_m),
            "rumbo_deg": _r(math.degrees(th.heading_rad)),
        }
    if p.occupant is not None:
        d["ocupante"] = p.occupant
    return d


def _event_dict(e: EventOutcome) -> JsonObj:
    d: JsonObj = {"id": e.id, "tipo": e.tipo, "t": _r(e.t), "actores": list(e.actores)}
    if e.detalle:
        det: JsonObj = {}
        for k, val in e.detalle.items():
            if isinstance(val, bool | str):
                det[k] = val
            elif isinstance(val, list):
                det[k] = [_r(float(x)) for x in val]  # pyright: ignore[reportUnknownVariableType, reportUnknownArgumentType]
            else:
                det[k] = _r(float(val))
        d["detalle"] = det
    return d


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


def _vehicle_model(v: JsonObj, clases: dict[str, Any], flag: _Flag) -> VehicleModel:
    clase = v["clase"]["valor"]
    tip = clases.get(clase, {}).get("tipico", {})
    mass = _num(v.get("masa"), _MASS, float(tip.get("masa_kg", 1200.0)))
    length = _num(v.get("largo"), _LEN, float(tip.get("largo_m", 4.4)))
    width = _num(v.get("ancho"), _LEN, float(tip.get("ancho_m", 1.75)))
    height = _num(v.get("alto"), _LEN, float(tip.get("alto_m", 1.5)))
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
        flag(
            "clase_sin_tabla",
            {"vehiculo": v["id"]},
            f"Vehículo {v['rol']}: sin tabla de clase ni masa; se usa 1200 kg.",
        )
    return VehicleModel(
        id=v["id"],
        rol=v["rol"],
        clase=clase,
        body=body_for(clase, mass, length, width),
        height=height,
        wheelbase=wheelbase,
        cg_from_front=0.45 * wheelbase,
        track=max(TRACK_WIDTH_FRACTION * width, 0.4),
        v0=v0,
        pose0=(float(pose["x"]), float(pose["y"]), math.radians(float(pose["rumbo_deg"]))),
        maniobra=maniobra,
        braking=braking,
        brake_distance=_num(dist, _LEN, 0.0) if dist else None,
        abs_=bool(abs_campo.get("valor", False)),
    )


def _then_straight(part: KinPath, extra: float = 400.0) -> KinPath:
    """La maniobra y, al terminarla, un tramo recto en el rumbo final."""
    end = part.pose(part.length)
    return CompositePath((part, StraightPath((end.x, end.y), end.heading, extra)))


def _path_for(m: VehicleModel, lane_width: float) -> KinPath:
    x, y, yaw = m.pose0
    quarter = 0.5 * math.pi * TURN_RADIUS_M  # vuelta de 90°
    if m.maniobra == "vuelta_izquierda":
        return _then_straight(ArcPath((x, y), yaw, TURN_RADIUS_M, quarter, left=True))
    if m.maniobra == "vuelta_derecha":
        return _then_straight(ArcPath((x, y), yaw, TURN_RADIUS_M, quarter, left=False))
    if m.maniobra == "vuelta_u":
        r = 0.75 * TURN_RADIUS_M
        return _then_straight(ArcPath((x, y), yaw, r, math.pi * r, left=True))
    if m.maniobra == "cambio_carril_izquierda":
        return _then_straight(LaneChangePath((x, y), yaw, LANE_CHANGE_LENGTH_M, lane_width))
    if m.maniobra == "cambio_carril_derecha":
        return _then_straight(LaneChangePath((x, y), yaw, LANE_CHANGE_LENGTH_M, -lane_width))
    if m.maniobra == "reversa":
        # Hacia atrás con el frente donde lo dejó el perito (sentido de marcha ≠ rumbo del frente).
        return ReversePath(StraightPath((x, y), wrap_angle(yaw + math.pi), 500.0))
    return StraightPath((x, y), yaw, 500.0)


def _barrier_normal(obj: JsonObj | None, point: Vec, axis: RoadAxis, state: State2D) -> Vec:
    """Normal de una superficie fija, del vehículo hacia la superficie.

    Muro o vehículo estacionado: perpendicular a su rumbo. Guarnición sin objeto declarado: la
    orilla de la vía, hacia afuera (±Y en vía recta, radial en curva o glorieta). Se orienta
    contra la velocidad del vehículo para que el contacto sea de acercamiento.
    """
    if obj is not None and obj.get("rumbo_deg") is not None:
        r = math.radians(float(obj["rumbo_deg"]))
        n: Vec = (-dmath.sin(r), dmath.cos(r))
    elif axis.kind == "recta":
        n = (0.0, 1.0 if point[1] >= 0 else -1.0)
    else:
        dx, dy = point[0] - axis.center[0], point[1] - axis.center[1]
        d = dmath.hypot(dx, dy) or 1.0
        outward = d >= axis.radius
        n = (dx / d, dy / d) if outward else (-dx / d, -dy / d)
    if n[0] * state.vx + n[1] * state.vy < 0:
        n = (-n[0], -n[1])
    return n


def _target_path(m: VehicleModel, target: Vec, offset: Vec) -> KinPath | None:
    """Desvío suave (perfil de cambio de carril) que lleva el punto de contacto al objetivo.

    Se usa solo cuando ni el carril ni la maniobra literal alcanzan el punto declarado (por
    ejemplo, un volantazo hacia la banqueta); el orquestador lo marca como inferido.
    """
    x, y, yaw = m.pose0
    # En reversa el desvío se traza en el sentido de marcha, con el desfase del contacto girado.
    reverse = m.maniobra == "reversa"
    if reverse:
        yaw = wrap_angle(yaw + math.pi)
        offset = (-offset[0], -offset[1])
    dx, dy = target[0] - x, target[1] - y
    fwd = dx * dmath.cos(yaw) + dy * dmath.sin(yaw)
    left = -dx * dmath.sin(yaw) + dy * dmath.cos(yaw)
    lateral = left - offset[1]
    reach = fwd - offset[0]
    if reach < 15.0 or abs(lateral) < 0.3:
        return None
    # El contacto ocurre a 3/4 del desvío, todavía con movimiento lateral (un volantazo no
    # termina paralelo al objeto). Desplazamiento en u = 3/4 del perfil coseno: (1 − cos(3π/4))/2.
    u_hit = SEEK_CONTACT_FRACTION
    change = reach / u_hit
    total = lateral / (0.5 * (1.0 - dmath.cos(math.pi * u_hit)))
    path = _then_straight(LaneChangePath((x, y), yaw, change, total))
    return ReversePath(path) if reverse else path


def _path_candidates(m: VehicleModel, lane_width: float, axis: RoadAxis) -> list[KinPath]:
    """Trayectorias posibles: primero la que sigue el carril (vía curva o glorieta), luego la
    geometría literal de la maniobra (recta, vuelta, cambio de carril sobre recta)."""
    literal = _path_for(m, lane_width)
    lateral = {"recto": 0.0, "cambio_carril_izquierda": lane_width}.get(m.maniobra)
    if m.maniobra == "cambio_carril_derecha":
        lateral = -lane_width
    if lateral is None:
        return [literal]
    follow = lane_following_path(axis, m.pose0, lateral=lateral, change_length=LANE_CHANGE_LENGTH_M)
    return [follow, literal] if follow is not None else [literal]


def _pose_at(path: KinPath, s: float) -> tuple[float, float, float, float]:
    """(x, y, rumbo, curvatura) para cualquier s; antes de s = 0 se extrapola en línea recta."""
    if s >= 0:
        p = path.pose(min(s, path.length))
        return p.x, p.y, p.heading, p.curvature
    p = path.pose(0.0)
    h = travel_heading(path, p.heading)
    return p.x + s * dmath.cos(h), p.y + s * dmath.sin(h), p.heading, 0.0


def _primary_event(spec: JsonObj) -> JsonObj | None:
    eventos = sorted(spec["eventos"], key=lambda e: int(e["orden"]))
    for e in eventos:
        if str(e["tipo"]).startswith("impacto_"):
            return e
    return None


def _pair(event: JsonObj, vehicle_ids: Container[str]) -> list[str]:
    """Los dos primeros vehículos entre los actores de un evento."""
    return [str(a) for a in event["actores"] if a in vehicle_ids][:2]


def _later_impacts(
    spec: JsonObj, primary: JsonObj | None, vehicle_ids: Container[str]
) -> list[JsonObj]:
    """Los impactos entre vehículos declarados después del primero, en orden (carambola, ADR 0066).

    Cuentan los eventos `impacto_vehiculo_vehiculo` o `segundo_impacto` con al menos dos vehículos
    entre sus actores y un orden posterior al del primer impacto.
    """
    if primary is None:
        return []
    out: list[JsonObj] = []
    for e in sorted(spec["eventos"], key=lambda e: int(e["orden"])):
        if e is primary or int(e["orden"]) < int(primary["orden"]):
            continue
        tipo_ok = e["tipo"] in ("impacto_vehiculo_vehiculo", "segundo_impacto")
        if tipo_ok and len(_pair(e, vehicle_ids)) == 2:
            out.append(e)
    return out


def _side_toward(n: Vec, yaw: float) -> str:
    """La cara del vehículo (F, B, L o R) que mira hacia `n` (unitaria, mundo)."""
    c, s = dmath.cos(yaw), dmath.sin(yaw)
    lx = n[0] * c + n[1] * s
    ly = -n[0] * s + n[1] * c
    if abs(lx) >= abs(ly):
        return "F" if lx > 0 else "B"
    return "L" if ly > 0 else "R"


# Forma y fracción del largo de la cara dañada por cara y zona horizontal del CDC. Los grupos
# ajustados con E5 en desarrollo (ADR 0033): frente/trasera C, y costados D, P, Z y B; el resto
# conserva la regla original, que E5 no pudo mejorar sin empeorar alguna métrica. Las letras de
# la otra cara (el esquema las acepta en cualquiera) conservan su regla original.
_CRUSH_RULES: dict[str, dict[str, tuple[str, float]]] = {
    "FB": {
        "D": ("uniforme", 1.0),
        "Y": ("izquierda", 0.66),
        "Z": ("derecha", 0.66),
        "L": ("izquierda", 0.4),
        "R": ("derecha", 0.4),
        "C": ("uniforme", 0.89),
        "F": ("izquierda", 0.4),
        "B": ("derecha", 0.4),
    },
    "LR": {
        "D": ("centro", 0.62),
        "Y": ("izquierda", 0.66),
        "Z": ("uniforme", 0.37),
        "F": ("izquierda", 0.4),
        "B": ("uniforme", 0.21),
        "P": ("centro", 0.52),
        "L": ("izquierda", 0.4),
        "R": ("derecha", 0.4),
    },
}


def _crush_shape_and_width(cdc: JsonObj | None, body: Body2D) -> tuple[list[float], float]:
    lado = (cdc or {}).get("lado", "F")
    zona_h = (cdc or {}).get("zona_horizontal", "D")
    face = "FB" if lado in {"F", "B"} else "LR"
    side_len = body.width if face == "FB" else body.length
    shape, frac = _CRUSH_RULES[face].get(str(zona_h), ("centro", 0.4))
    return TRIANGULAR_SHAPES[shape], frac * side_len


_ALONG_FRONT_BACK = {"L": 1 / 3, "C": 0.0, "R": -1 / 3, "Y": 1 / 6, "Z": -1 / 6, "D": 0.0}
_ALONG_SIDE = {"F": 1 / 3, "P": 0.0, "B": -1 / 3, "Y": 1 / 6, "Z": -1 / 6, "D": 0.0}


def _crush_center(cdc: JsonObj | None, body: Body2D, width: float) -> float:
    """Centro del ancho dañado a lo largo de la cara (m; + = izquierda en F/B, adelante en L/R).

    Mismas fracciones que `contact.contact_offset`; se acota para que la franja dañada no se
    salga de la cara.
    """
    lado = str((cdc or {}).get("lado", "F"))
    zona = str((cdc or {}).get("zona_horizontal", "D"))
    if lado in {"L", "R"}:
        side, frac = body.length, _ALONG_SIDE.get(zona, 0.0)
    else:
        side, frac = body.width, _ALONG_FRONT_BACK.get(zona, 0.0)
    limit = max(0.0, (side - width) / 2)
    return max(-limit, min(limit, frac * side))


def _normal_from_cdc(cdc: JsonObj | None, state: State2D) -> Vec | None:
    lado = (cdc or {}).get("lado")
    local = {"F": (1.0, 0.0), "B": (-1.0, 0.0), "L": (0.0, 1.0), "R": (0.0, -1.0)}.get(str(lado))
    return rot(local, state.yaw) if local else None


def _grid(t0: float, t1: float, dt: float) -> list[float]:
    """Tiempos k·dt entre t0 y t1 (ambos múltiplos de dt), incluidos."""
    k0 = round(t0 / dt)
    k1 = round(t1 / dt)
    return [round(k * dt, 9) for k in range(k0, k1 + 1)]


def _sample_path(path: KinPath, prof: SpeedProfile, t_ref: float, times: list[float]) -> Trajectory:
    """Estados en `times`; el perfil arranca (τ = 0) en t = t_ref y antes se va a v0 constante."""
    traj = Trajectory()
    for t in times:
        tau = t - t_ref
        if tau >= 0:
            s = prof.distance(tau)
            v = prof.speed(tau)
        else:
            s = prof.v0 * tau
            v = prof.v0
        x, y, yaw, kappa = _pose_at(path, s)
        h = travel_heading(path, yaw)
        traj.append(State2D(x, y, yaw, v * dmath.cos(h), v * dmath.sin(h), v * kappa, t))
    return traj


# ----------------------------------------------------------------------------------------------
# Reconstrucción
# ----------------------------------------------------------------------------------------------


def reconstruct(
    spec: JsonObj, *, dt: float = DT_OUT, downed_mu: float | None = None
) -> Reconstruction:
    """Reconstruye la escena. `spec` debe haber pasado la validación del contrato.

    `downed_mu` fija el arrastre de una motocicleta caída (Monte Carlo e inversión lo muestrean);
    sin él se usa el nominal de la tabla.
    """
    banderas: list[str] = []
    avisos: list[Aviso] = []

    def flag(codigo: str, datos: dict[str, Any], mensaje: str) -> None:
        banderas.append(mensaje)
        avisos.append(Aviso(codigo, mensaje, datos))

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
    }

    models = [_vehicle_model(v, clases, flag) for v in spec["vehiculos"]]
    by_id = {m.id: m for m in models}
    personas_spec: dict[str, JsonObj] = {p["id"]: p for p in spec["personas"]}
    objetos: dict[str, JsonObj] = {o["id"]: o for o in spec["entorno"].get("objetos", [])}
    event = _primary_event(spec)
    actores: list[str] = list(event["actores"]) if event else []
    involved = [by_id[a] for a in actores if a in by_id]
    tipo_evento = str(event["tipo"]) if event else ""
    zonas: dict[str, JsonObj | None] = {
        z["vehiculo_id"]: z.get("cdc") for z in (event or {}).get("zonas_impacto", [])
    }
    # Carambola: los impactos entre vehículos después del primero (ADR 0066). Sus vehículos se
    # integran juntos con los del primero; cada impacto ocurre cuando su par se toca.
    later = _later_impacts(spec, event, by_id)
    participantes = set(actores) | {v for e in later for v in _pair(e, by_id)}
    axis = road_axis(lugar)
    candidates: dict[str, list[KinPath]] = {
        m.id: _path_candidates(m, lane_width, axis) for m in models
    }
    paths: dict[str, KinPath] = {m.id: candidates[m.id][0] for m in models}

    # ---- punto de contacto ---------------------------------------------------------------
    declared: Vec | None = None
    if event and event.get("punto_impacto"):
        declared = (float(event["punto_impacto"]["x"]), float(event["punto_impacto"]["y"]))
    elif involved:
        declared = (
            sum(m.pose0[0] for m in involved) / len(involved),
            sum(m.pose0[1] for m in involved) / len(involved),
        )
    obj = next((objetos[x] for x in actores if x in objetos), None)
    ped = next((personas_spec[x] for x in actores if x in personas_spec), None)
    impact_point: Vec | None = None
    s_contact: dict[str, float] = {}
    if declared is not None and involved:
        standoff = 0.0
        if tipo_evento == "impacto_vehiculo_objeto" and obj is not None:
            if obj.get("diametro_tronco"):
                standoff = 0.5 * _num(obj.get("diametro_tronco"), _LEN, 0.3)
            pos: JsonObj = obj.get("posicion") or {}
            if "x" in pos:
                declared = (float(pos["x"]), float(pos["y"]))
        targets = involved[:2] if tipo_evento == "impacto_vehiculo_vehiculo" else involved[:1]
        offsets = {
            m.id: contact_offset(zonas.get(m.id), m.body.length, m.body.width, standoff=standoff)
            for m in targets
        }

        def locus_for(m: VehicleModel, path: KinPath) -> Locus:
            if m.v0 <= 0:
                pose0 = m.pose0
                return Locus(lambda _s, p=pose0: p, offsets[m.id], 0.0)

            def pose_fn(s: float, path: KinPath = path) -> tuple[float, float, float]:
                x, y, yaw, _ = _pose_at(path, s)
                return (x, y, yaw)

            return Locus(pose_fn, offsets[m.id], min(path.length, SEARCH_LENGTH_M))

        options = [candidates[m.id] if m.v0 > 0 else candidates[m.id][:1] for m in targets]
        seek: KinPath | None = None
        if tipo_evento != "impacto_vehiculo_vehiculo" and targets[0].v0 > 0:
            seek = _target_path(targets[0], declared, offsets[targets[0].id])
            if seek is not None:
                options[0] = [*options[0], seek]
        best: tuple[float, int, tuple[KinPath, ...], ContactSolution] | None = None
        for combo in itertools.product(*options):
            loci = [locus_for(m, path) for m, path in zip(targets, combo, strict=True)]
            if tipo_evento != "impacto_vehiculo_vehiculo":
                fixed = declared
                loci.append(Locus(lambda _s, p=fixed: (p[0], p[1], 0.0), (0.0, 0.0), 0.0))
            sol = resolve_contact(loci, declared)
            rank = sum(opts.index(path) for opts, path in zip(options, combo, strict=True))
            if (
                best is None
                or sol.gap < best[0] - PATH_TIE_M
                or (abs(sol.gap - best[0]) <= PATH_TIE_M and rank < best[1])
            ):
                best = (sol.gap, rank, combo, sol)
        assert best is not None
        _, _, combo, sol = best
        for m, path in zip(targets, combo, strict=True):
            paths[m.id] = path
        desvio = seek.inner if isinstance(seek, ReversePath) else seek
        if seek is not None and combo[0] is seek and isinstance(desvio, CompositePath):
            first = desvio.parts[0]
            lateral = 0.0
            if isinstance(first, LaneChangePath):
                u = SEEK_CONTACT_FRACTION
                lateral = first.lateral * 0.5 * (1.0 - dmath.cos(math.pi * u))
            flag(
                "desvio_lateral",
                {"vehiculo": targets[0].id, "lateral_m": lateral},
                f"Vehículo {targets[0].rol}: para alcanzar el punto de impacto declarado se "
                f"infiere un desvío lateral de {abs(lateral):.1f} m "
                f"hacia la {'izquierda' if lateral > 0 else 'derecha'}.",
            )
        impact_point = sol.point
        for m, s_m in zip(targets, sol.params, strict=False):
            s_contact[m.id] = s_m
        if sol.gap > CONTACT_GAP_FLAG_M:
            flag(
                "zonas_no_se_tocan",
                {"separacion_m": sol.gap},
                "Las zonas de impacto declaradas no llegan a tocarse siguiendo las trayectorias; "
                f"se usa el acercamiento máximo (quedan a {sol.gap:.1f} m).",
            )

    # ---- fase previa ---------------------------------------------------------------------
    profiles: dict[str, SpeedProfile] = {}
    t_to_impact: dict[str, float] = {}
    for m in models:
        decel = braking_deceleration(
            mu, abs_factor=abs_factor if m.abs_ else 1.0, grade_percent=grade
        )
        if m.v0 <= 0 or m.id not in s_contact:
            profiles[m.id] = SpeedProfile(m.v0)
            t_to_impact[m.id] = 0.0
            continue
        s_imp = s_contact[m.id]
        if m.braking:
            if m.brake_distance is None:
                d_brake = m.v0 * DEFAULT_BRAKE_BEFORE_IMPACT_S
                flag(
                    "frenado_sin_distancia",
                    {"vehiculo": m.id},
                    f"Vehículo {m.rol}: frenó pero no dice desde dónde; se asume "
                    f"{DEFAULT_BRAKE_BEFORE_IMPACT_S} s antes del impacto.",
                )
            else:
                d_brake = m.brake_distance
            d_brake = min(d_brake, s_imp)
            prof = SpeedProfile(m.v0, (s_imp - d_brake) / m.v0, decel)
            if prof.time_to_distance(s_imp) is None:
                flag(
                    "frenado_detiene_antes",
                    {"vehiculo": m.id, "v_kmh": ms_to_kmh(m.v0), "frenado_m": d_brake},
                    f"Vehículo {m.rol}: con {ms_to_kmh(m.v0):.0f} km/h y {d_brake:.1f} m de "
                    "frenado se habría detenido antes del impacto; se recorta el frenado.",
                )
                d_brake = 0.9 * m.v0 * m.v0 / (2 * decel)
                prof = SpeedProfile(m.v0, (s_imp - d_brake) / m.v0, decel)
        else:
            prof = SpeedProfile(m.v0)
        profiles[m.id] = prof
        t_imp = prof.time_to_distance(s_imp)
        t_to_impact[m.id] = t_imp if t_imp is not None else s_imp / m.v0

    t_pre = min(T_PRE_MAX, max([T_PRE_MIN, *t_to_impact.values()]))
    t_pre = math.ceil(t_pre / dt - 1e-9) * dt  # rejilla alineada a t = 0
    pre_times = _grid(-t_pre, 0.0, dt)
    params["aproximacion_previa_s"] = {
        "valor": t_pre,
        "fuente": "Antes de su posición inicial declarada cada vehículo avanza a velocidad "
        "constante sobre la prolongación de su trayectoria",
        "tipo": "supuesto",
    }
    pre: dict[str, Trajectory] = {}
    impact_states: dict[str, State2D] = {}
    for m in models:
        if m.id in s_contact and m.v0 > 0:
            # Llega a su punto de contacto exactamente en t = 0.
            traj = _sample_path(paths[m.id], profiles[m.id], -t_to_impact[m.id], pre_times)
        else:
            # Detenido, o no participa: sale de su pose inicial al empezar la escena.
            traj = _sample_path(paths[m.id], profiles[m.id], -t_pre, pre_times)
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
    throws: list[ThrowInfo] = []
    joint_ids: list[str] = []  # vehículos de un choque entre vehículos: fase posterior conjunta
    mu_body = friction.pedestrian_friction(lugar["superficie"]["valor"])

    def declared_throw_for(pid: str) -> JsonObj | None:
        """Distancia de proyección declarada para esa persona (o sin persona indicada)."""
        cands = [
            e
            for e in spec["evidencias"]
            if e.get("tipo") == "distancia_proyeccion" and e.get("longitud")
        ]
        own = [e for e in cands if e.get("persona_id") == pid]
        rest = own or [e for e in cands if not e.get("persona_id")]
        return rest[0] if rest else None

    def make_throw(
        pid: str,
        launch: float,
        heading: float,
        origin: Vec,
        h_cg: float,
        v_vehicle: float,
        projection: float,
        contact_info: dict[str, str],
        quien: str,
    ) -> ThrowOutcome:
        mu_p = mu_body.nominal
        d_nom = pedestrian.searle_throw(launch, mu_p, PEDESTRIAN_LAUNCH_ANGLE_DEG, h_cg)
        theta_min = pedestrian.searle_range(max(d_nom, 0.1), mu_p, h_cg).theta_min_deg
        d_lo = pedestrian.searle_throw(launch, mu_p, theta_min, h_cg)
        d_hi = pedestrian.searle_throw(launch, mu_p, 0.0, h_cg)
        band = pedestrian.searle_distance_band(launch, mu_body.low, mu_body.high, h_cg)
        decl = declared_throw_for(pid)
        if decl:
            d_decl = _num(decl["longitud"], _LEN, d_nom)
            rng = pedestrian.vehicle_speed_range_from_throw(d_decl, mu_p, h_cg, (projection, 1.0))
            if not (rng.v_min * 0.85 <= v_vehicle <= rng.v_max * 1.15):
                flag(
                    "proyeccion_vs_velocidad",
                    {
                        "persona": pid,
                        "distancia_m": d_decl,
                        "v_min_kmh": ms_to_kmh(rng.v_min),
                        "v_max_kmh": ms_to_kmh(rng.v_max),
                        "v_kmh": ms_to_kmh(v_vehicle),
                    },
                    f"La distancia de proyección declarada de {quien} ({d_decl:.0f} m) sugiere "
                    f"entre {ms_to_kmh(rng.v_min):.0f} y {ms_to_kmh(rng.v_max):.0f} km/h; la "
                    f"velocidad reconstruida al impacto es {ms_to_kmh(v_vehicle):.0f} km/h.",
                )
        rest_xy = (origin[0] + d_nom * dmath.cos(heading), origin[1] + d_nom * dmath.sin(heading))
        return ThrowOutcome(
            ms_to_kmh(launch),
            d_nom,
            (min(d_lo, d_hi), max(d_lo, d_hi)),
            rest_xy,
            contact_info,
            (band.d_min, band.d_max),
            (mu_p, mu_body.low, mu_body.high),
            PEDESTRIAN_LAUNCH_ANGLE_DEG,
            h_cg,
            heading,
        )

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
        joint_ids = [a.id, b.id]
        post_start[a.id] = res.a_after
        post_start[b.id] = res.b_after
        delta_v[a.id], delta_v[b.id] = res.delta_v_a, res.delta_v_b
        pdof[a.id], pdof[b.id] = res.pdof_a_hours, res.pdof_b_hours
        # Reparto de la energía disipada entre carrocerías: inversamente a la rigidez B.
        cdc_a: JsonObj = zonas.get(a.id) or {}
        cdc_b: JsonObj = zonas.get(b.id) or {}
        ka = stiffness_for(a.clase, zona_from_cdc_side(str(cdc_a.get("lado", "F"))))
        kb = stiffness_for(b.clase, zona_from_cdc_side(str(cdc_b.get("lado", "F"))))
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
                    "velocidad_cierre_kmh": ms_to_kmh(dmath.hypot(sa.vx - sb.vx, sa.vy - sb.vy)),
                },
            )
        )
        # Jinetes de moto, scooter o bici: no van sujetos y salen proyectados.
        for m in (a, b):
            if m.clase not in TWO_WHEEL_CLASSES:
                continue
            s_m = impact_states[m.id]
            v_m = dmath.hypot(s_m.vx, s_m.vy)
            if v_m < 0.5:
                continue
            heading_m = dmath.atan2(s_m.vy, s_m.vx)
            for pdoc in spec["personas"]:
                if pdoc.get("vehiculo_id") != m.id or pdoc["rol"]["valor"] not in RIDER_ROLES:
                    continue
                rid = str(pdoc["id"])
                launch_r = RIDER_PROJECTION_FACTOR * v_m
                out_r = make_throw(
                    rid,
                    launch_r,
                    heading_m,
                    (s_m.x, s_m.y),
                    RIDER_CG_HEIGHT_M.get(m.clase, 1.05),
                    v_m,
                    RIDER_PROJECTION_FACTOR,
                    {"defensa": "", "borde_cofre": "", "cabeza": ""},
                    f"la persona que iba en el vehículo {m.rol}",
                )
                throws.append(
                    ThrowInfo(rid, out_r, (s_m.x, s_m.y), launch_r, mu_body.nominal, "jinete", m.id)
                )
                eventos_out.append(
                    EventOutcome(
                        f"proyeccion-{rid}",
                        "proyeccion",
                        0.0,
                        [m.id, rid],
                        {
                            "distancia_proyeccion_m": out_r.throw_distance_m,
                            "rango_m": list(out_r.throw_range_m),
                        },
                    )
                )
    elif event and tipo_evento == "impacto_vehiculo_objeto" and involved and impact_point:
        a = involved[0]
        sa = impact_states[a.id]
        flat_types = {"muro", "barda", "vehiculo_estacionado", "contenedor", "puesto"}
        if obj is None or obj.get("tipo") in flat_types:
            # Superficie plana inmóvil: impulso planar con la normal de la superficie, así un
            # roce lateral contra la guarnición no se trata como choque frontal pleno.
            cdc_o = zonas.get(a.id)
            normal = _barrier_normal(obj, impact_point, axis, sa)
            res_o = planar_impact(
                a.body,
                sa,
                None,
                None,
                impact_point,
                normal,
                restitution=RESTITUTION_VV,
                friction=IMPULSE_RATIO,
            )
            k = stiffness_for(a.clase, zona_from_cdc_side(str((cdc_o or {}).get("lado", "F"))))
            shape, width = _crush_shape_and_width(cdc_o, a.body)
            delta_v[a.id] = res_o.delta_v_a
            pdof[a.id] = res_o.pdof_a_hours
            post_start[a.id] = res_o.a_after
            crush[a.id] = (
                profile_for_energy(res_o.energy_loss, width, k.stiffness, shape),
                width,
                res_o.energy_loss,
                k.origen,
            )
            detalle: dict[str, Any] = {
                "objeto": str(obj.get("tipo")) if obj else "guarnicion",
                "rigido": True,
                "energia_disipada_j": res_o.energy_loss,
            }
        else:
            k = stiffness_for(a.clase, "frontal")
            diam = _num(obj.get("diametro_tronco"), _LEN, 0.3)
            r = fixed_object.narrow_object(
                a.body,
                sa.speed,
                k.stiffness,
                diameter_m=diam,
                material=str(obj.get("material", "concreto")),
            )
            delta_v[a.id] = r.delta_v
            pdof[a.id] = 0.0
            heading = (dmath.cos(sa.yaw), dmath.sin(sa.yaw))
            sign = -1.0 if r.rigid else 1.0
            post_start[a.id] = sa.with_velocity(
                sign * r.v_after * heading[0], sign * r.v_after * heading[1], 0.0
            )
            crush[a.id] = (r.profile, r.damage_width, r.energy_absorbed_vehicle, k.origen)
            detalle = {
                "objeto": str(obj.get("tipo")),
                "rigido": r.rigid,
                "energia_objeto_j": r.energy_absorbed_object,
                "aplastamiento_max_m": r.max_crush,
            }
        eventos_out.append(
            EventOutcome(
                event["id"],
                tipo_evento,
                0.0,
                [a.id] + ([str(obj["id"])] if obj else []),
                detalle,
            )
        )
    elif event and tipo_evento == "impacto_vehiculo_persona" and involved and impact_point:
        a = involved[0]
        sa = impact_states[a.id]
        ped_id = str(ped["id"]) if ped else "peaton"
        v_imp = sa.speed
        ped_doc: JsonObj = ped or {}
        stature = _num(ped_doc.get("estatura"), _LEN, DEFAULT_STATURE_M)
        m_ped = _num(ped_doc.get("masa"), _MASS, DEFAULT_PERSON_MASS_KG)
        launch = PEDESTRIAN_PROJECTION_FACTOR * v_imp
        h_cg = PEDESTRIAN_CG_HEIGHT_FACTOR * stature
        heading = (dmath.cos(sa.yaw), dmath.sin(sa.yaw))
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
        contact = pedestrian.contact_zones(
            stature, 0.32 * a.height, 0.55 * a.height, 0.25 * a.body.length
        )
        out_p = make_throw(
            ped_id,
            launch,
            sa.yaw,
            impact_point,
            h_cg,
            v_imp,
            PEDESTRIAN_PROJECTION_FACTOR,
            {
                "defensa": contact.bumper_on_body,
                "borde_cofre": contact.hood_edge_on_body or "",
                "cabeza": contact.head_contact,
            },
            "la persona peatona",
        )
        throws.append(ThrowInfo(ped_id, out_p, impact_point, launch, mu_body.nominal, "peaton"))
        d_lo, d_hi = out_p.throw_range_m
        d_nom = out_p.throw_distance_m
        eventos_out.append(
            EventOutcome(
                event["id"],
                tipo_evento,
                0.0,
                [a.id, ped_id],
                {"distancia_proyeccion_m": d_nom, "rango_m": [d_lo, d_hi]},
            )
        )
    elif event:
        flag(
            "evento_sin_resolver",
            {"evento": event["id"]},
            f"Evento {event['id']} ({tipo_evento}) sin actores suficientes o sin punto de "
            "impacto: no se resolvió.",
        )

    # ---- fase posterior ------------------------------------------------------------------
    t_fin = dt
    post: dict[str, tuple[Trajectory, bool, float]] = {}
    mu_downed = friction.downed_motorcycle_friction(lugar["superficie"]["valor"])

    def post_body(m: VehicleModel) -> JointBody:
        start = post_start[m.id]
        downed = m.clase in friction.DOWNED_SLIDE_CLASSES
        # Caída, se arrastra de lado: todo el contacto desliza con el arrastre medido.
        wheels = WheelConfig.four_wheels(
            m.wheelbase, m.track, m.cg_from_front, locked=m.braking or downed
        )
        drag = (
            ROLLING_RESISTANCE
            if m.braking or downed
            else max(ROLLING_RESISTANCE, POST_IMPACT_DRAG_FRACTION * mu)
        )
        mu_post = (mu_downed.nominal if downed_mu is None else downed_mu) if downed else mu
        # Un vehículo que todavía no choca (solo está en un impacto posterior) rueda libre hasta
        # su primer impacto (ADR 0066).
        waits = m.id not in actores
        return JointBody(
            m.body,
            State2D(start.x, start.y, start.yaw, start.vx, start.vy, start.yaw_rate, 0.0),
            wheels,
            mu_post,
            ROLLING_RESISTANCE if waits else drag,
            max(0.0, *crush[m.id][0]),
            str((zonas.get(m.id) or {}).get("lado", "F")),
            drag if waits else None,
        )

    # Los vehículos de un choque entre vehículos se mueven juntos: si después de separarse se
    # vuelven a encajar más que su aplastamiento, el contacto secundario los detiene (ADR 0063).
    # En una carambola entran también los de los impactos posteriores (ADR 0066).
    group: list[str] = list(joint_ids)
    if later:
        for vid in [*(m.id for m in involved[:1]), *(v for e in later for v in _pair(e, by_id))]:
            if vid not in group:
                group.append(vid)
    plans: list[PlannedImpact] = []
    for e in later:
        pa, pb = _pair(e, by_id)
        if {pa, pb} != set(joint_ids):  # el mismo par del primero: lo cubre el contacto secundario
            plans.append(
                PlannedImpact(
                    group.index(pa), group.index(pb), str(e["id"]), RESTITUTION_VV, IMPULSE_RATIO
                )
            )
    joint_list, joint_hits = integrate_joint_impacts(
        [post_body(by_id[i]) for i in group], impacts=plans, dt_out=dt, t_max=T_POST_MAX
    )
    joint_post: dict[str, PostImpactResult] = dict(zip(group, joint_list, strict=True))

    # Los impactos posteriores que ocurrieron: daño, delta-v y evento, como el primero.
    later_damage: dict[str, list[LaterDamage]] = {m.id: [] for m in models}
    v_impact_at: dict[str, float] = {}
    later_by_id = {str(e["id"]): e for e in later}
    for hit in joint_hits:
        ev = later_by_id[hit.event_id]
        zonas_ev: dict[str, JsonObj | None] = {
            z["vehiculo_id"]: z.get("cdc") for z in ev.get("zonas_impacto", [])
        }
        res2 = hit.result
        ids2 = (group[hit.a], group[hit.b])
        sides = (
            (ids2[0], hit.a_before, hit.normal, res2.delta_v_a, res2.pdof_a_hours),
            (
                ids2[1],
                hit.b_before,
                (-hit.normal[0], -hit.normal[1]),
                res2.delta_v_b,
                res2.pdof_b_hours,
            ),
        )
        cdcs: dict[str, JsonObj] = {}
        ks: dict[str, Any] = {}
        for vid, before, toward, _, _ in sides:
            cdc_v = zonas_ev.get(vid) or {"lado": _side_toward(toward, before.yaw)}
            cdcs[vid] = cdc_v
            ks[vid] = stiffness_for(
                by_id[vid].clase, zona_from_cdc_side(str(cdc_v.get("lado", "F")))
            )
        w = {vid: 1.0 / ks[vid].stiffness.b for vid in ids2}
        for vid, before, _, dv, pd in sides:
            m = by_id[vid]
            energy = res2.energy_loss * w[vid] / (w[ids2[0]] + w[ids2[1]])
            shape, width = _crush_shape_and_width(cdcs[vid], m.body)
            prof = profile_for_energy(energy, width, ks[vid].stiffness, shape)
            if crush[vid][3] == "sin impacto":
                # Su primer impacto: va en su daño, su delta-v y su velocidad de impacto.
                crush[vid] = (prof, width, energy, ks[vid].origen)
                delta_v[vid], pdof[vid] = dv, pd
                zonas[vid] = cdcs[vid]
                v_impact_at[vid] = before.speed
            else:
                later_damage[vid].append(
                    LaterDamage(
                        hit.event_id,
                        hit.t,
                        prof,
                        width,
                        _crush_center(cdcs[vid], m.body, width),
                        energy,
                        ks[vid].origen,
                        cdcs[vid],
                        ms_to_kmh(dv),
                        pd,
                    )
                )
        sa2, sb2 = hit.a_before, hit.b_before
        eventos_out.append(
            EventOutcome(
                hit.event_id,
                "impacto_vehiculo_vehiculo",
                hit.t,
                list(ids2),
                {
                    "impulso_ns": [res2.impulse[0], res2.impulse[1]],
                    "adherencia": res2.sticking,
                    "friccion_contacto_usada": res2.friction_used,
                    "energia_disipada_j": res2.energy_loss,
                    "velocidad_cierre_kmh": ms_to_kmh(
                        dmath.hypot(sa2.vx - sb2.vx, sa2.vy - sb2.vy)
                    ),
                    "punto_m": [hit.point[0], hit.point[1]],
                },
            )
        )
    for e in later:
        pa, pb = _pair(e, by_id)
        planned = {pa, pb} != set(joint_ids)
        if planned and not any(h.event_id == e["id"] for h in joint_hits):
            flag(
                "impacto_no_ocurre",
                {"evento": e["id"], "vehiculos": [pa, pb]},
                f"El impacto entre los vehículos {by_id[pa].rol} y {by_id[pb].rol} declarado "
                "después del primero no ocurre en la reconstrucción: sus trayectorias no llegan a "
                "tocarse.",
            )

    for m in models:
        if m.id not in participantes:
            continue
        start = post_start[m.id]
        res_post: PostImpactResult | None = joint_post.get(m.id)
        if res_post is None and (start.speed > 0.05 or abs(start.yaw_rate) > 0.05):
            pb = post_body(m)
            res_post = integrate(
                pb.body,
                pb.start,
                pb.wheels,
                pb.mu,
                dt_out=dt,
                t_max=T_POST_MAX,
                rolling_drag=pb.rolling_drag,
            )
        if res_post is not None:
            post[m.id] = (res_post.trajectory, res_post.stopped, res_post.distance)
            if not res_post.stopped:
                flag(
                    "sin_reposo",
                    {"vehiculo": m.id},
                    f"Vehículo {m.rol}: no llegó al reposo en {T_POST_MAX:.0f} s.",
                )
        else:
            post[m.id] = (Trajectory(), True, 0.0)
        tr_post = post[m.id][0]
        t_fin = max(t_fin, tr_post.t[-1] if len(tr_post) else 0.0)
    if any(m.id in participantes and m.clase in friction.DOWNED_SLIDE_CLASSES for m in models):
        params["friccion_moto_caida"] = {
            "valor": mu_downed.nominal if downed_mu is None else downed_mu,
            "rango": [mu_downed.low, mu_downed.high],
            "fuente": mu_downed.fuente,
            "tipo": mu_downed.tipo,
        }

    # ---- personas ------------------------------------------------------------------------
    personas_out: list[PersonOutcome] = []
    ped_tracks: dict[str, PersonTrack] = {}
    for th in throws:
        track = PersonTrack()
        pdoc2: JsonObj = personas_spec.get(th.person_id) or {}
        out = th.outcome
        if th.kind == "peaton":
            pose = pdoc2.get("posicion_inicial")
            start_xy = (float(pose["x"]), float(pose["y"])) if pose else th.origin
            speed = _num(pdoc2.get("velocidad"), _SPEED, WALKING_SPEED_MS)
            approach_track(track, start_xy, th.origin, speed, out.cg_height_m, -t_pre, 0.0, dt)
            params["velocidad_peaton"] = {
                "valor": speed,
                "rango": [1.0, 1.6],
                "fuente": "Knoblauch, Pietrucha y Nitzburg 1996, TRR 1538 (medias 1.25–1.51 m/s)",
                "tipo": "supuesto" if pdoc2.get("velocidad") is None else "relato",
            }
        else:
            assert th.vehicle_id is not None
            ride_track(track, pre[th.vehicle_id], out.cg_height_m)
        kin = throw_track(
            track,
            th.origin,
            out.heading_rad,
            th.launch,
            out.launch_angle_deg,
            out.cg_height_m,
            th.mu,
            0.0,
            dt,
        )
        ped_tracks[th.person_id] = track
        t_rest = kin.total_time
        t_fin = max(t_fin, t_rest)
        eventos_out.append(EventOutcome(f"reposo-{th.person_id}", "reposo", t_rest, [th.person_id]))
    if throws:
        params["friccion_cuerpo_suelo"] = {
            "valor": mu_body.nominal,
            "rango": [mu_body.low, mu_body.high],
            "fuente": mu_body.fuente,
            "tipo": mu_body.tipo,
        }
    if any(th.kind == "jinete" for th in throws):
        params["factor_proyeccion_jinete"] = {
            "valor": RIDER_PROJECTION_FACTOR,
            "rango": [PEDESTRIAN_PROJECTION_FACTOR - 0.1, 1.0],
            "fuente": "Searle 1993 (SAE 930659) aplica el mismo modelo a jinetes; el factor es "
            "un supuesto hasta calibrarlo",
            "tipo": "supuesto",
        }
    t_fin = math.ceil((t_fin + T_HOLD_AFTER_REST) / dt - 1e-9) * dt

    for p in spec["personas"]:
        pid = str(p["id"])
        stature = _num(p.get("estatura"), _LEN, DEFAULT_STATURE_M)
        h_cg = PEDESTRIAN_CG_HEIGHT_FACTOR * stature
        veh = p.get("vehiculo_id")
        track = ped_tracks.get(pid, PersonTrack())
        throw_out = next((th.outcome for th in throws if th.person_id == pid), None)
        if pid in ped_tracks:
            rest_track(track, t_fin, dt, lying=True)
        elif veh is None and p.get("posicion_inicial"):
            pose = p["posicion_inicial"]
            speed = _num(p.get("velocidad"), _SPEED, 0.0)
            dir_deg = _num(p.get("direccion_movimiento"), _ANGLE, float(pose["rumbo_deg"]))
            straight_walk_track(
                track,
                (float(pose["x"]), float(pose["y"])),
                math.radians(dir_deg),
                speed,
                h_cg,
                -t_pre,
                t_fin,
                dt,
            )
        elif veh is None:
            flag(
                "persona_sin_posicion",
                {"persona": pid},
                f"Persona {pid}: sin posición inicial ni vehículo; no se muestra en la escena.",
            )
        occ_doc: JsonObj | None = None
        if veh is not None and pid not in ped_tracks and str(veh) in by_id:
            occ_doc = _occupant_doc(
                p, by_id[str(veh)], delta_v[str(veh)], crush[str(veh)][0], pdof[str(veh)]
            )
        personas_out.append(
            PersonOutcome(
                pid,
                str(p["rol"]["valor"]),
                stature,
                str(veh) if veh is not None else None,
                track,
                throw_out,
                occ_doc,
            )
        )

    # ---- ensamblado ----------------------------------------------------------------------
    vehiculos_out: list[VehicleOutcome] = []
    for m in models:
        full = Trajectory()
        full.extend(pre[m.id])
        if m.id in participantes:
            tr, stopped, dist_post = post[m.id]
            for i in range(1, len(tr)):
                full.append(tr.state(i))
            last = full.last()
            for t in _grid(0.0, t_fin, dt):
                if t > last.t + 1e-9:
                    full.append(State2D(last.x, last.y, last.yaw, 0.0, 0.0, 0.0, t))
        else:
            # Sigue su camino con el mismo perfil hasta que la escena termina.
            stopped, dist_post = m.v0 <= 0, 0.0
            rest_t = _sample_path(paths[m.id], profiles[m.id], -t_pre, _grid(0.0, t_fin, dt))
            for i in range(1, len(rest_t)):
                full.append(rest_t.state(i))
        last = full.last()
        prof, width, e, origen = crush[m.id]
        vehiculos_out.append(
            VehicleOutcome(
                id=m.id,
                rol=m.rol,
                clase=m.clase,
                involucrado=m.id in participantes,
                length=m.body.length,
                width=m.body.width,
                height=m.height,
                wheelbase=m.wheelbase,
                mass=m.body.mass,
                trajectory=full,
                v_impact_kmh=ms_to_kmh(v_impact_at.get(m.id, impact_states[m.id].speed)),
                delta_v_kmh=ms_to_kmh(delta_v[m.id]),
                pdof_hours=pdof[m.id],
                crush_profile_m=prof,
                crush_width_m=width,
                crush_energy_j=e,
                crush_center_m=_crush_center(zonas.get(m.id), m.body, width),
                stiffness_origen=origen,
                cdc=zonas.get(m.id),
                stopped=stopped,
                rest_pose=(last.x, last.y, math.degrees(last.yaw)),
                distance_post_m=dist_post,
                later_damage=later_damage[m.id],
            )
        )
        if m.braking and m.v0 > 0 and m.id in s_contact:
            tb = profiles[m.id].t_brake
            if not math.isinf(tb):
                t_ev = round(tb - t_to_impact[m.id], 6)
                eventos_out.append(EventOutcome(f"frenado-{m.id}", "inicio_frenado", t_ev, [m.id]))
        if m.id in participantes:
            tr_post = post[m.id][0]
            t_stop = tr_post.t[-1] if len(tr_post) else 0.0
            eventos_out.append(EventOutcome(f"reposo-{m.id}", "reposo", t_stop, [m.id]))
    # ---- volcadura (criterio de tropiezo) -------------------------------------------------
    declared_roll = {
        a for e in spec["eventos"] if e.get("tipo") == "volcadura" for a in e.get("actores", [])
    }
    if (
        tipo_evento == "impacto_vehiculo_objeto"
        and involved
        and impact_point is not None
        and (obj is None or obj.get("tipo") in {"muro", "barda"} or involved[0].id in declared_roll)
    ):
        a = involved[0]
        sa = impact_states[a.id]
        n = _barrier_normal(obj, impact_point, axis, sa)
        v_n = sa.vx * n[0] + sa.vy * n[1]  # componente de la velocidad hacia la orilla
        left = -dmath.sin(sa.yaw) * n[0] + dmath.cos(sa.yaw) * n[1]
        check = rollover.trip_check(
            a.track, a.body.width, a.height, v_n, "izquierdo" if left > 0 else "derecho"
        )
        vo = next(v for v in vehiculos_out if v.id == a.id)
        vo.rollover = check
        params["altura_cg_volcadura"] = {
            "valor": rollover.CG_HEIGHT_FRACTION,
            "fuente": "Fracción del alto del vehículo; SSF típico 1.0–1.5 según la clase (NHTSA)",
            "tipo": "supuesto",
        }
        if a.id in declared_roll and not check.starts:
            flag(
                "volcadura_sin_velocidad",
                {"vehiculo": a.id},
                f"Vehículo {a.rol}: el relato dice que se volcó, pero llega a la orilla con "
                f"{ms_to_kmh(check.lateral_speed):.0f} km/h hacia ella y el tropiezo necesita "
                f"{ms_to_kmh(check.critical_speed):.0f} km/h; probablemente iba derrapando de "
                "lado, algo que la fase previa (sin deslizamiento lateral) no reproduce. La "
                "volcadura del visor es ilustrativa.",
            )
        elif check.starts and a.id not in declared_roll:
            flag(
                "volcadura_no_mencionada",
                {"vehiculo": a.id},
                f"Vehículo {a.rol}: con {ms_to_kmh(check.lateral_speed):.0f} km/h hacia la orilla "
                "el tropiezo alcanza para iniciar una volcadura, aunque el relato no la menciona.",
            )
        if a.id in declared_roll:
            t_roll = next(
                (
                    float(e["t"]["valor"])
                    for e in spec["eventos"]
                    if e.get("tipo") == "volcadura" and e.get("t")
                ),
                0.0,
            )
            eventos_out.append(EventOutcome(f"volcadura-{a.id}", "volcadura", t_roll, [a.id]))

    # ---- visibilidad ---------------------------------------------------------------------
    objetos_out = scene_objects(spec)
    visibilidad_out = _visibility(
        spec, models, vehiculos_out, personas_out, objetos_out, actores, -t_pre, params
    )
    eventos_out.sort(key=lambda e: (e.t, e.id))

    return Reconstruction(
        escena_id=str(spec["meta"]["id"]),
        semilla=seed,
        dt=dt,
        t_inicio=-t_pre,
        t_fin=t_fin,
        punto_impacto=impact_point,
        vehiculos=vehiculos_out,
        personas=personas_out,
        eventos=eventos_out,
        banderas=banderas,
        parametros=params,
        avisos=avisos,
        objetos=objetos_out,
        visibilidad=visibilidad_out,
    )


def _occupant_doc(
    p: JsonObj, m: VehicleModel, dv: float, profile: list[float], pdof_h: float | None
) -> JsonObj | None:
    """Cinemática del ocupante relativa al habitáculo (`occupant.py`) para el resultado."""
    if m.clase in TWO_WHEEL_CLASSES:
        return None
    seat_field: JsonObj = p.get("asiento") or {}
    seat = str(seat_field.get("valor", "otro"))
    belt_field = p.get("cinturon")
    belted = bool(belt_field["valor"]) if belt_field and "valor" in belt_field else None
    pulse = occupant.pulse_for(
        dv, max(profile, default=0.0), pdof_h if pdof_h is not None else 12.0
    )
    if pulse is None:
        return None
    toward = pulse.toward
    doc: JsonObj = {
        "asiento": seat,
        "pulso": {
            "duracion_s": _r(pulse.duration_s),
            "delta_v_kmh": _r(ms_to_kmh(pulse.delta_v)),
            "aceleracion_max_g": _r(occupant.peak_g(pulse)),
            "direccion_deg": _r(math.degrees(dmath.atan2(toward[1], toward[0]))),
        },
        "variantes": [],
    }
    if belted is not None:
        doc["cinturon_declarado"] = belted
    for mo in occupant.occupant_motions(pulse, seat, belted):
        var: JsonObj = {
            "cinturon": mo.belted,
            "t": [_r(x) for x in mo.t],
            "dx": [_r(x) for x in mo.dx],
            "dy": [_r(x) for x in mo.dy],
            "desplazamiento_max_m": _r(mo.max_displacement),
        }
        if mo.contact is not None:
            var["contacto"] = {
                "zona": mo.contact.zona,
                "t_s": _r(mo.contact.t_s),
                "velocidad_relativa_kmh": _r(ms_to_kmh(mo.contact.relative_speed)),
            }
        doc["variantes"].append(var)
    return doc


def _pose_on(tr: Trajectory, t: float) -> tuple[float, float, float]:
    """Pose de una trayectoria muestreada en el instante más cercano a t."""
    if len(tr) == 0:
        return (0.0, 0.0, 0.0)
    k = min(range(len(tr)), key=lambda i: abs(tr.t[i] - t)) if len(tr) < 8 else None
    if k is None:
        lo, hi = 0, len(tr) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if tr.t[mid] < t:
                lo = mid + 1
            else:
                hi = mid
        k = lo if lo == 0 or abs(tr.t[lo] - t) <= abs(tr.t[lo - 1] - t) else lo - 1
    return (tr.x[k], tr.y[k], tr.yaw[k])


def _track_pose(track: PersonTrack, t: float) -> tuple[float, float, float] | None:
    if not track.t or t < track.t[0] - 1e-9:
        return None
    lo, hi = 0, len(track.t) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if track.t[mid] < t:
            lo = mid + 1
        else:
            hi = mid
    k = lo if lo == 0 or abs(track.t[lo] - t) <= abs(track.t[lo - 1] - t) else lo - 1
    return (track.x[k], track.y[k], track.yaw[k])


def _visibility(
    spec: JsonObj,
    models: list[VehicleModel],
    vehicles: list[VehicleOutcome],
    persons: list[PersonOutcome],
    objects: list[SceneObject],
    actores: list[str],
    t0: float,
    params: dict[str, Any],
) -> list[JsonObj]:
    """Visibilidad de cada conductor hacia los demás actores antes del impacto."""
    dt_s = visibility.SAMPLE_DT
    n = math.floor(-t0 / dt_s + 1e-9)
    times = [round(-dt_s * k, 9) for k in range(n, -1, -1)]
    env = spec["entorno"]
    night_unlit = env["iluminacion"]["valor"] == "noche_sin_alumbrado"
    met = env.get("visibilidad")
    met_m = _num(met, _LEN, 0.0) if met else None
    spec_by_id = {v["id"]: v for v in spec["vehiculos"]}

    def lights(vid: str) -> bool:
        f = spec_by_id[vid].get("luces_encendidas")
        return bool(f["valor"]) if f and "valor" in f else True

    static = [o for ob in objects for o in visibility.object_occluders(ob)]
    vout = {v.id: v for v in vehicles}
    movers: list[visibility.Actor] = []
    for m in models:
        tr = vout[m.id].trajectory
        movers.append(
            visibility.Actor(
                m.id,
                "vehiculo",
                [_pose_on(tr, t) for t in times],
                m.body.length,
                m.body.width,
                m.height,
                lights(m.id),
            )
        )
    walkers: list[visibility.Actor] = []
    for pr in persons:
        if pr.vehiculo_id is not None or not pr.track.t:
            continue
        poses = [_track_pose(pr.track, t) for t in times]
        walkers.append(
            visibility.Actor(
                pr.id,
                "persona",
                [q or (0.0, 0.0, 0.0) for q in poses],
                height=pr.stature_m,
                present=[q is not None for q in poses],
            )
        )
    impact_objs = [
        visibility.Actor(o.id, "objeto", [(o.x, o.y, 0.0)] * len(times), height=o.alto)
        for o in objects
        if o.id in actores
    ]
    out: list[JsonObj] = []
    for m in models:
        if m.v0 <= 0:
            continue
        obs = visibility.Observer(
            m.id,
            m.clase,
            next(a.poses for a in movers if a.id == m.id),
            m.body.length,
            m.body.width,
            lights(m.id),
        )
        targets = [a for a in movers if a.id != m.id] + walkers
        if m.id in actores:
            targets += impact_objs
        for tgt in targets:
            res = visibility.analyze_pair(
                obs,
                tgt,
                static,
                [a for a in movers if a.id != tgt.id],
                times,
                night_unlit=night_unlit,
                met_visibility_m=met_m,
            )
            if not res.t:
                continue
            out.append(
                {
                    "observador": res.observador,
                    "objetivo": res.objetivo,
                    "tipo_objetivo": res.tipo_objetivo,
                    "altura_ojo_m": _r(obs.eye_height),
                    "t": res.t,
                    "visible": res.visible,
                    "fraccion": res.fraccion,
                    "distancia_m": res.distancia,
                    "causa": res.causa,
                    "resumen": res.summary(),
                }
            )
    params["altura_ojo"] = {
        "valor": visibility.EYE_HEIGHT_M["sedan_compacto"],
        "fuente": "AASHTO Green Book 2018: 1.08 m autos, 2.33 m camiones; otras clases supuestas",
        "tipo": "primaria",
    }
    if night_unlit:
        params["alcance_deteccion_nocturna"] = {
            "valor": visibility.NIGHT_DETECTION_M,
            "rango": list(visibility.NIGHT_DETECTION_RANGE_M),
            "fuente": "Olson y Sivak (1983), citado por terceros: peatones con ropa oscura se "
            "detectan a menos de 30 m con luces bajas",
            "tipo": "supuesto",
        }
    return out


def crush_energy_check(v: VehicleOutcome, k: Stiffness) -> float:
    """Energía del perfil reportado con la rigidez dada (para pruebas)."""
    return crush_energy(v.crush_profile_m, v.crush_width_m, k)


__all__ = [
    "RESULT_VERSION",
    "EventOutcome",
    "PersonOutcome",
    "Reconstruction",
    "ThrowOutcome",
    "VehicleOutcome",
    "crush_energy_check",
    "reconstruct",
]
