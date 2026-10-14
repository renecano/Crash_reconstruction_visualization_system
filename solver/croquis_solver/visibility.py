"""Visibilidad desde el ojo de cada conductor (PLAN §6.1.9): ¿podía verlo y a qué distancia?

Para cada conductor y cada otro actor se traza, en cada instante antes del impacto, la línea de
vista en 3D desde el ojo hasta varios puntos del objetivo (esquinas y centro de un vehículo a
dos alturas; piernas, torso y cabeza de una persona; el tronco de un objeto). Un punto se ve si
el segmento no cruza ningún oclusor; el objetivo se ve si se ve al menos un punto.

Oclusores (con la geometría de `scene_objects`, la misma que dibuja el visor): troncos y copas de
árboles, postes, muros, bardas, puestos, vehículos estacionados y los demás vehículos en
movimiento en ese instante. Cada oclusor tiene su altura, así que la vista puede pasar por encima
de un auto bajo o por debajo de una copa.

Límites del entorno:
* Noche sin alumbrado: una persona, un objeto o un vehículo sin luces solo se ven dentro del
  alcance y del cono de los faros del observador (si lleva luces). Un vehículo con luces se ve.
* Lluvia, niebla o granizo: si el relato da la visibilidad meteorológica, nada más lejos se ve.

Alturas del ojo: AASHTO (Green Book 2018) usa 1.08 m para autos y 2.33 m para camiones; las demás
clases son supuestos documentados. El campo visual del conductor (pilares, espejos) no se modela.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from croquis_solver.scene_objects import SceneObject, footprint_radius

JsonObj = dict[str, Any]

SAMPLE_DT = 0.1  # s
NIGHT_DETECTION_M = 30.0  # luces bajas, ropa oscura: < 30 m (Olson y Sivak, citado por terceros)
NIGHT_DETECTION_RANGE_M = (10.0, 60.0)
HEADLIGHT_HALF_ANGLE_DEG = 30.0  # supuesto: apertura horizontal útil de las luces bajas
EPS = 1e-9

EYE_HEIGHT_M: dict[str, float] = {
    "sedan_compacto": 1.08,
    "sedan_mediano": 1.08,
    "hatchback": 1.08,
    "suv_compacta": 1.30,
    "suv_grande": 1.40,
    "pickup": 1.40,
    "van": 1.60,
    "microbus_combi": 1.70,
    "autobus": 2.33,
    "camion_unitario": 2.33,
    "tractocamion": 2.33,
    "motocicleta": 1.45,
    "scooter": 1.40,
    "bicicleta": 1.55,
}
AASHTO_CLASSES = frozenset(
    {"sedan_compacto", "sedan_mediano", "hatchback", "autobus", "camion_unitario", "tractocamion"}
)
FRONT_CAB = frozenset({"autobus", "camion_unitario", "tractocamion", "microbus_combi", "van"})
TWO_WHEEL = frozenset({"motocicleta", "scooter", "bicicleta"})


def eye_offset(clase: str, length: float, width: float) -> tuple[float, float]:
    """Ojo en el marco del vehículo (x adelante, y izquierda), con el volante a la izquierda."""
    if clase in TWO_WHEEL:
        return (-0.1, 0.0)
    if clase in FRONT_CAB:
        return (0.5 * length - 1.0, 0.5 * width - 0.6)
    return (-0.05 * length, max(0.0, 0.5 * width - 0.55))


@dataclass(frozen=True)
class Occluder:
    id: str  # "objeto:<id>" o "vehiculo:<id>"
    kind: str  # "cylinder" | "sphere" | "box"
    cx: float
    cy: float
    z0: float
    z1: float
    radius: float = 0.0
    yaw: float = 0.0
    hx: float = 0.0
    hy: float = 0.0
    zc: float = 0.0
    reach: float = 0.0  # radio de descarte en planta


Point3 = tuple[float, float, float]


def box_occluder(
    oid: str, cx: float, cy: float, yaw: float, lx: float, ly: float, h: float
) -> Occluder:
    return Occluder(
        oid, "box", cx, cy, 0.0, h, yaw=yaw, hx=lx / 2, hy=ly / 2, reach=0.5 * math.hypot(lx, ly)
    )


def object_occluders(o: SceneObject) -> list[Occluder]:
    oid = f"objeto:{o.id}"
    reach = footprint_radius(o)
    if o.forma == "arbol":
        return [
            Occluder(oid, "cylinder", o.x, o.y, 0.0, o.tronco_alto, radius=o.radio, reach=reach),
            Occluder(
                oid,
                "sphere",
                o.x,
                o.y,
                o.copa_centro - o.copa_radio,
                o.copa_centro + o.copa_radio,
                radius=o.copa_radio,
                zc=o.copa_centro,
                reach=reach,
            ),
        ]
    if o.forma in ("cilindro", "senal"):
        occ = [Occluder(oid, "cylinder", o.x, o.y, 0.0, o.alto, radius=o.radio, reach=reach)]
        if o.forma == "senal":
            occ.append(
                Occluder(
                    oid,
                    "box",
                    o.x,
                    o.y,
                    2.0,
                    2.6,
                    yaw=math.radians(o.rumbo_deg),
                    hx=0.02,
                    hy=0.3,
                    reach=0.3,
                )
            )
        return occ
    return [box_occluder(oid, o.x, o.y, math.radians(o.rumbo_deg), o.largo, o.ancho, o.alto)]


def _segment_circle(
    p0: Point3, p1: Point3, cx: float, cy: float, r: float
) -> tuple[float, float] | None:
    """Intervalo de parámetro u ∈ [0, 1] en que la proyección en planta está dentro del círculo."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    fx, fy = p0[0] - cx, p0[1] - cy
    a = dx * dx + dy * dy
    c = fx * fx + fy * fy - r * r
    if a < EPS:
        return (0.0, 1.0) if c <= 0 else None
    b = 2 * (fx * dx + fy * dy)
    disc = b * b - 4 * a * c
    if disc < 0:
        return None
    sq = math.sqrt(disc)
    u0, u1 = (-b - sq) / (2 * a), (-b + sq) / (2 * a)
    lo, hi = max(0.0, u0), min(1.0, u1)
    return (lo, hi) if lo <= hi else None


def _z_overlap(p0: Point3, p1: Point3, lo: float, hi: float, z0: float, z1: float) -> bool:
    za = p0[2] + (p1[2] - p0[2]) * lo
    zb = p0[2] + (p1[2] - p0[2]) * hi
    return max(min(za, zb), z0) <= min(max(za, zb), z1)


def segment_blocked(occ: Occluder, p0: Point3, p1: Point3) -> bool:
    """¿El segmento p0→p1 cruza el oclusor? (exacto para cilindro vertical, esfera y caja)."""
    # Descarte rápido en planta.
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    seg2 = dx * dx + dy * dy
    if seg2 > EPS:
        u = max(0.0, min(1.0, ((occ.cx - p0[0]) * dx + (occ.cy - p0[1]) * dy) / seg2))
        qx, qy = p0[0] + u * dx - occ.cx, p0[1] + u * dy - occ.cy
        if qx * qx + qy * qy > (occ.reach + 1e-6) ** 2:
            return False
    if occ.kind == "cylinder":
        iv = _segment_circle(p0, p1, occ.cx, occ.cy, occ.radius)
        return iv is not None and _z_overlap(p0, p1, iv[0], iv[1], occ.z0, occ.z1)
    if occ.kind == "sphere":
        ex, ey, ez = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
        fx, fy, fz = p0[0] - occ.cx, p0[1] - occ.cy, p0[2] - occ.zc
        a = ex * ex + ey * ey + ez * ez
        if a < EPS:
            return fx * fx + fy * fy + fz * fz <= occ.radius**2
        u = max(0.0, min(1.0, -(fx * ex + fy * ey + fz * ez) / a))
        qx, qy, qz = fx + u * ex, fy + u * ey, fz + u * ez
        return qx * qx + qy * qy + qz * qz <= occ.radius**2
    # Caja orientada: método de las placas en su marco local.
    c, s = math.cos(occ.yaw), math.sin(occ.yaw)

    def local(p: Point3) -> Point3:
        rx, ry = p[0] - occ.cx, p[1] - occ.cy
        return (c * rx + s * ry, -s * rx + c * ry, p[2])

    a0, a1 = local(p0), local(p1)
    lo, hi = 0.0, 1.0
    for k, (mn, mx) in enumerate(((-occ.hx, occ.hx), (-occ.hy, occ.hy), (occ.z0, occ.z1))):
        d = a1[k] - a0[k]
        if abs(d) < EPS:
            if a0[k] < mn or a0[k] > mx:
                return False
            continue
        t0, t1 = (mn - a0[k]) / d, (mx - a0[k]) / d
        if t0 > t1:
            t0, t1 = t1, t0
        lo, hi = max(lo, t0), min(hi, t1)
        if lo > hi:
            return False
    return True


def _no_flags() -> list[bool]:
    return []


@dataclass
class Actor:
    """Objetivo o vehículo en movimiento con su pose en cada instante de muestreo."""

    id: str
    tipo: str  # "vehiculo" | "persona" | "objeto"
    poses: list[tuple[float, float, float]]  # x, y, rumbo por muestra
    length: float = 0.0
    width: float = 0.0
    height: float = 0.0
    lights: bool = False
    present: list[bool] = field(default_factory=_no_flags)  # persona: si está en la escena

    def points(self, k: int) -> list[Point3]:
        x, y, yaw = self.poses[k]
        if self.tipo == "persona":
            return [(x, y, 0.5), (x, y, 0.55 * self.height), (x, y, self.height - 0.1)]
        if self.tipo == "objeto":
            return [(x, y, 0.5), (x, y, min(1.5, self.height))]
        c, s = math.cos(yaw), math.sin(yaw)
        pts: list[Point3] = []
        for fx, fy in ((0.5, 0.5), (0.5, -0.5), (-0.5, 0.5), (-0.5, -0.5), (0.0, 0.0)):
            lx, ly = fx * self.length * 0.95, fy * self.width * 0.95
            px, py = x + c * lx - s * ly, y + s * lx + c * ly
            for z in (0.6, max(0.7, self.height - 0.1)):
                pts.append((px, py, z))
        return pts


@dataclass
class Observer:
    vehicle_id: str
    clase: str
    poses: list[tuple[float, float, float]]
    length: float
    width: float
    lights: bool

    @property
    def eye_height(self) -> float:
        return EYE_HEIGHT_M.get(self.clase, 1.08)

    def eye(self, k: int) -> Point3:
        x, y, yaw = self.poses[k]
        ox, oy = eye_offset(self.clase, self.length, self.width)
        c, s = math.cos(yaw), math.sin(yaw)
        return (x + c * ox - s * oy, y + s * ox + c * oy, self.eye_height)


@dataclass
class PairResult:
    observador: str
    objetivo: str
    tipo_objetivo: str
    t: list[float]
    visible: list[bool]
    fraccion: list[float]
    distancia: list[float]
    causa: list[str]

    def summary(self) -> JsonObj:
        n = len(self.t)
        k = n - 1
        while k >= 0 and self.visible[k]:
            k -= 1
        since = k + 1  # inicio del último tramo visible que llega al impacto
        visible_at_end = n > 0 and self.visible[-1]
        before = [c for c in self.causa[: since if visible_at_end else n] if c]
        main = Counter(before).most_common(1)
        out: JsonObj = {
            "visible_al_impacto": visible_at_end,
            "limitado_por": sorted(set(before)),
        }
        if main:
            out["oclusor_principal"] = main[0][0]
        if visible_at_end:
            out["visible_desde_s"] = self.t[since]
            out["distancia_al_verse_m"] = self.distancia[since]
            out["tiempo_disponible_s"] = self.t[-1] - self.t[since]
            out["visible_toda_la_aproximacion"] = since == 0
        return out


def analyze_pair(
    obs: Observer,
    target: Actor,
    static_occ: list[Occluder],
    movers: list[Actor],
    times: list[float],
    *,
    night_unlit: bool,
    met_visibility_m: float | None,
    night_detection_m: float = NIGHT_DETECTION_M,
) -> PairResult:
    res = PairResult(obs.vehicle_id, target.id, target.tipo, [], [], [], [], [])
    exclude = {f"vehiculo:{obs.vehicle_id}", f"{target.tipo}:{target.id}"}
    half = math.radians(HEADLIGHT_HALF_ANGLE_DEG)
    for k, t in enumerate(times):
        if target.present and not target.present[k]:
            continue
        eye = obs.eye(k)
        pts = target.points(k)
        tx, ty, _ = target.poses[k]
        dist = math.hypot(tx - eye[0], ty - eye[1])
        occ = [o for o in static_occ if o.id not in exclude]
        for mv in movers:
            if f"vehiculo:{mv.id}" in exclude:
                continue
            mx, my, myaw = mv.poses[k]
            occ.append(
                box_occluder(f"vehiculo:{mv.id}", mx, my, myaw, mv.length, mv.width, mv.height)
            )
        cause = ""
        if met_visibility_m is not None and dist > met_visibility_m:
            cause = "clima"
        elif night_unlit and not (target.tipo == "vehiculo" and target.lights):
            yaw = obs.poses[k][2]
            bearing = math.atan2(ty - eye[1], tx - eye[0])
            off = abs(math.atan2(math.sin(bearing - yaw), math.cos(bearing - yaw)))
            if not obs.lights or dist > night_detection_m or off > half:
                cause = "noche"
        seen = 0
        first_block = ""
        if not cause:
            for p in pts:
                blocker = next((o.id for o in occ if segment_blocked(o, eye, p)), None)
                if blocker is None:
                    seen += 1
                elif not first_block:
                    first_block = blocker
        frac = seen / len(pts) if not cause else 0.0
        res.t.append(round(t, 6))
        res.visible.append(seen > 0)
        res.fraccion.append(round(frac, 4))
        res.distancia.append(round(dist, 4))
        res.causa.append("" if seen > 0 else (cause or first_block))
    return res
