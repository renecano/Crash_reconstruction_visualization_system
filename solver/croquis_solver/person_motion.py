"""Trayectorias de personas para el visor (centro de masa en 3D) y fases de movimiento.

* Antes del impacto: de pie o caminando en línea recta a velocidad constante.
* Peatón golpeado: modelo de Searle completo (SAE 930659): vuelo balístico desde la altura del
  centro de masa con velocidad v y ángulo θ; al tocar el piso pierde la velocidad vertical y la
  fricción reduce la horizontal en μ·|v_z| (impulso de aterrizaje); después desliza con
  desaceleración μ g hasta detenerse. La distancia total es la de `pedestrian.searle_throw`
  cuando la velocidad horizontal tras el aterrizaje no se anula; una prueba lo verifica.

* Jinete de moto, scooter o bici: va con su vehículo (fase "montado") hasta el impacto y desde
  ahí sigue el mismo modelo de Searle.

Los ocupantes de vehículos cerrados no tienen trayectoria propia en el mundo: el visor los coloca
en su asiento y su movimiento relativo al habitáculo sale de `occupant.py`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from croquis_solver import dmath
from croquis_solver.models import G, Trajectory, Vec
from croquis_solver.pedestrian import ThrowKinematics, throw_kinematics

LYING_CG_HEIGHT_M = 0.15  # altura del centro de masa de un cuerpo tendido (visual)


def _floats() -> list[float]:
    return []


def _phases() -> list[PhaseSpan]:
    return []


@dataclass(frozen=True)
class PhaseSpan:
    fase: str  # "de_pie" | "caminando" | "montado" | "vuelo" | "deslizamiento" | "reposo"
    t_inicio: float
    t_fin: float


@dataclass
class PersonTrack:
    t: list[float] = field(default_factory=_floats)
    x: list[float] = field(default_factory=_floats)
    y: list[float] = field(default_factory=_floats)
    z: list[float] = field(default_factory=_floats)
    yaw: list[float] = field(default_factory=_floats)
    fases: list[PhaseSpan] = field(default_factory=_phases)

    def append(self, t: float, x: float, y: float, z: float, yaw: float) -> None:
        if self.t and t <= self.t[-1] + 1e-12:
            return
        self.t.append(t)
        self.x.append(x)
        self.y.append(y)
        self.z.append(z)
        self.yaw.append(yaw)

    def add_phase(self, fase: str, t0: float, t1: float) -> None:
        if t1 > t0 + 1e-12:
            self.fases.append(PhaseSpan(fase, t0, t1))

    def __len__(self) -> int:
        return len(self.t)


def _grid(t0: float, t1: float, dt: float) -> list[float]:
    """Tiempos k·dt (alineados a t = 0) dentro de [t0, t1], con t1 incluido."""
    k0 = math.ceil(t0 / dt - 1e-9)
    k1 = math.floor(t1 / dt + 1e-9)
    ts = [round(k * dt, 9) for k in range(k0, k1 + 1)]
    if not ts or abs(ts[-1] - t1) > 1e-9:
        ts.append(t1)
    if abs(ts[0] - t0) > 1e-9:
        ts.insert(0, t0)
    return ts


def approach_track(
    track: PersonTrack,
    start: Vec,
    target: Vec,
    speed: float,
    cg_height: float,
    t_begin: float,
    t_arrive: float,
    dt: float,
) -> None:
    """De pie en `start` y luego caminando a `speed` para llegar a `target` justo en `t_arrive`.

    Si no alcanza a recorrer la distancia en [t_begin, t_arrive], arranca ya en camino.
    """
    dx, dy = target[0] - start[0], target[1] - start[1]
    dist = dmath.hypot(dx, dy)
    yaw = dmath.atan2(dy, dx) if dist > 1e-9 else 0.0
    if dist <= 1e-9 or speed <= 0:
        for t in _grid(t_begin, t_arrive, dt):
            track.append(t, target[0], target[1], cg_height, yaw)
        track.add_phase("de_pie", t_begin, t_arrive)
        return
    walk_time = dist / speed
    t_walk = t_arrive - walk_time
    for t in _grid(t_begin, t_arrive, dt):
        remaining = max(0.0, min(dist, speed * (t_arrive - t)))
        f = 1.0 - remaining / dist
        track.append(t, start[0] + f * dx, start[1] + f * dy, cg_height, yaw)
    if t_walk > t_begin:
        track.add_phase("de_pie", t_begin, t_walk)
    track.add_phase("caminando", max(t_begin, t_walk), t_arrive)


def straight_walk_track(
    track: PersonTrack,
    start: Vec,
    heading: float,
    speed: float,
    cg_height: float,
    t_begin: float,
    t_end: float,
    dt: float,
) -> None:
    """Camina (o permanece de pie si speed = 0) en línea recta durante toda la escena."""
    for t in _grid(t_begin, t_end, dt):
        d = speed * (t - t_begin)
        track.append(
            t,
            start[0] + d * dmath.cos(heading),
            start[1] + d * dmath.sin(heading),
            cg_height,
            heading,
        )
    track.add_phase("caminando" if speed > 0 else "de_pie", t_begin, t_end)


def ride_track(track: PersonTrack, vehicle: Trajectory, cg_height: float) -> None:
    """Va montado en su vehículo: sigue su trayectoria previa al impacto (hasta t = 0)."""
    if len(vehicle) == 0:
        return
    for i in range(len(vehicle)):
        track.append(vehicle.t[i], vehicle.x[i], vehicle.y[i], cg_height, vehicle.yaw[i])
    track.add_phase("montado", vehicle.t[0], vehicle.t[-1])


def throw_track(
    track: PersonTrack,
    origin: Vec,
    heading: float,
    v: float,
    theta_deg: float,
    cg_height: float,
    mu: float,
    t0: float,
    dt: float,
) -> ThrowKinematics:
    """Agrega vuelo y deslizamiento desde `origin` en t0 a lo largo de `heading`."""
    k = throw_kinematics(v, theta_deg, cg_height, mu)
    th = math.radians(theta_deg)
    vx, vz = v * dmath.cos(th), v * dmath.sin(th)
    c, s = dmath.cos(heading), dmath.sin(heading)
    t_land = t0 + k.flight_time
    t_rest = t_land + k.slide_time
    for t in _grid(t0, t_rest, dt):
        if t <= t_land:
            tau = t - t0
            d = vx * tau
            z = cg_height + vz * tau - 0.5 * G * tau * tau
            # El centro de masa baja hacia la postura tendida al final del vuelo.
            z = max(z, 0.0) + LYING_CG_HEIGHT_M * (tau / k.flight_time if k.flight_time else 1.0)
        else:
            tau = t - t_land
            d = k.flight_distance + k.landing_speed * tau - 0.5 * mu * G * tau * tau
            z = LYING_CG_HEIGHT_M
        track.append(t, origin[0] + d * c, origin[1] + d * s, z, heading)
    track.add_phase("vuelo", t0, t_land)
    track.add_phase("deslizamiento", t_land, t_rest)
    return k


def rest_track(track: PersonTrack, t_end: float, dt: float, *, lying: bool) -> None:
    """Permanece en la última posición hasta `t_end`."""
    if not track.t:
        return
    t_last = track.t[-1]
    x, y, z, yaw = track.x[-1], track.y[-1], track.z[-1], track.yaw[-1]
    for t in _grid(t_last, t_end, dt)[1:]:
        track.append(t, x, y, z, yaw)
    track.add_phase("reposo" if lying else "de_pie", t_last, t_end)
