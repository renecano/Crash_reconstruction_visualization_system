"""Cinemática previa al impacto: trayectorias sobre la geometría de la vía y perfiles de velocidad.

Trayectorias por longitud de arco `s` (m): recta, arco circular, cambio de carril suave y
composición. Perfil de velocidad: tramo a velocidad constante, tiempo de percepción-reacción y
frenado con desaceleración constante a = μ·g·(factor ABS)·cos(α) ± g·sin(α) (pendiente).
Las muestras son deterministas: paso fijo y aritmética en doble precisión.
"""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass

from croquis_solver.models import G, State2D, Trajectory, Vec, wrap_angle


@dataclass(frozen=True)
class Pose:
    x: float
    y: float
    heading: float  # rad
    curvature: float  # 1/m (positivo = gira a la izquierda)


class Path:
    """Curva parametrizada por longitud de arco."""

    length: float

    def pose(self, s: float) -> Pose:  # pragma: no cover - interfaz
        raise NotImplementedError


@dataclass(frozen=True)
class StraightPath(Path):
    origin: Vec
    heading: float
    length: float

    def pose(self, s: float) -> Pose:
        return Pose(
            self.origin[0] + s * math.cos(self.heading),
            self.origin[1] + s * math.sin(self.heading),
            self.heading,
            0.0,
        )


@dataclass(frozen=True)
class ArcPath(Path):
    """Arco circular desde `start` con rumbo `heading`; `radius` > 0; `left` elige el sentido."""

    start: Vec
    heading: float
    radius: float
    length: float
    left: bool = True

    def __post_init__(self) -> None:
        if self.radius <= 0:
            msg = "El radio debe ser positivo"
            raise ValueError(msg)

    @property
    def center(self) -> Vec:
        sign = 1.0 if self.left else -1.0
        return (
            self.start[0] - sign * self.radius * math.sin(self.heading),
            self.start[1] + sign * self.radius * math.cos(self.heading),
        )

    def pose(self, s: float) -> Pose:
        sign = 1.0 if self.left else -1.0
        dtheta = sign * s / self.radius
        h = self.heading + dtheta
        cx, cy = self.center
        x = cx + sign * self.radius * math.sin(h)
        y = cy - sign * self.radius * math.cos(h)
        return Pose(x, y, wrap_angle(h), sign / self.radius)


@dataclass(frozen=True)
class LaneChangePath(Path):
    """Cambio de carril suave (coseno) de `lateral` m (positivo = izquierda) en `length` m."""

    origin: Vec
    heading: float
    length: float
    lateral: float

    def pose(self, s: float) -> Pose:
        s = min(max(s, 0.0), self.length)
        u = s / self.length
        offset = 0.5 * self.lateral * (1.0 - math.cos(math.pi * u))
        d_offset = 0.5 * self.lateral * math.pi / self.length * math.sin(math.pi * u)
        dd_offset = 0.5 * self.lateral * (math.pi / self.length) ** 2 * math.cos(math.pi * u)
        local_heading = math.atan(d_offset)
        curvature = dd_offset / (1.0 + d_offset * d_offset) ** 1.5
        c, sn = math.cos(self.heading), math.sin(self.heading)
        return Pose(
            self.origin[0] + s * c - offset * sn,
            self.origin[1] + s * sn + offset * c,
            wrap_angle(self.heading + local_heading),
            curvature,
        )


@dataclass(frozen=True)
class CompositePath(Path):
    parts: tuple[Path, ...]

    @property
    def length(self) -> float:  # type: ignore[override]
        return sum(p.length for p in self.parts)

    def pose(self, s: float) -> Pose:
        remaining = s
        for part in self.parts:
            if remaining <= part.length or part is self.parts[-1]:
                return part.pose(remaining)
            remaining -= part.length
        return self.parts[-1].pose(self.parts[-1].length)


def braking_deceleration(
    mu: float, *, abs_factor: float = 1.0, grade_percent: float = 0.0
) -> float:
    """Desaceleración (m/s²) de frenado a fondo: μ·g·factor·cos α ± g·sin α.

    Pendiente positiva = subida (frena más).
    """
    alpha = math.atan(grade_percent / 100.0)
    return G * (mu * abs_factor * math.cos(alpha) + math.sin(alpha))


def skid_distance(v0: float, decel: float) -> float:
    """Distancia para detenerse desde v0 con desaceleración constante: v0² / (2a)."""
    if decel <= 0:
        msg = "La desaceleración debe ser positiva"
        raise ValueError(msg)
    return v0 * v0 / (2.0 * decel)


def speed_from_skid(distance: float, decel: float) -> float:
    """Velocidad inicial a partir de la distancia de derrape: √(2 a d)."""
    return math.sqrt(2.0 * decel * max(distance, 0.0))


@dataclass(frozen=True)
class SpeedProfile:
    """v0 constante; desde `t_brake` desacelera `decel` hasta parar (`decel` 0 = nunca frena)."""

    v0: float
    t_brake: float = math.inf
    decel: float = 0.0

    def speed(self, t: float) -> float:
        if t <= self.t_brake or self.decel <= 0:
            return self.v0
        if t >= self.stop_time:
            return 0.0
        return self.v0 - self.decel * (t - self.t_brake)

    def distance(self, t: float) -> float:
        if t <= self.t_brake or self.decel <= 0:
            return self.v0 * t
        tb = t - self.t_brake
        t_stop = self.v0 / self.decel
        tb = min(tb, t_stop)
        return self.v0 * self.t_brake + self.v0 * tb - 0.5 * self.decel * tb * tb

    @property
    def stop_time(self) -> float:
        if self.decel <= 0 or math.isinf(self.t_brake):
            return math.inf
        return self.t_brake + self.v0 / self.decel

    def time_to_distance(self, s: float) -> float | None:
        """Instante en que se recorre `s`; None si se detiene antes."""
        if s <= 0:
            return 0.0
        if self.v0 <= 0:
            return None
        s_brake = self.v0 * self.t_brake if not math.isinf(self.t_brake) else math.inf
        if s <= s_brake or self.decel <= 0:
            return s / self.v0
        rem = s - s_brake
        disc = self.v0 * self.v0 - 2.0 * self.decel * rem
        if disc < 0:
            return None
        return self.t_brake + (self.v0 - math.sqrt(disc)) / self.decel


def simulate(
    path: Path,
    profile: SpeedProfile,
    *,
    t_end: float,
    dt: float = 0.02,
    t0: float = 0.0,
    s0: float = 0.0,
) -> Trajectory:
    """Muestrea posición, rumbo y velocidad de t0 a t_end (incluidos) sobre `path` con `profile`."""
    if dt <= 0 or t_end < t0:
        msg = "dt debe ser positivo y t_end ≥ t0"
        raise ValueError(msg)
    traj = Trajectory()
    n = round((t_end - t0) / dt)
    for i in range(n + 1):
        t = t0 + i * dt
        tau = t - t0
        s = s0 + profile.distance(tau)
        v = profile.speed(tau)
        p = path.pose(min(s, path.length))
        traj.append(
            State2D(
                x=p.x,
                y=p.y,
                yaw=p.heading,
                vx=v * math.cos(p.heading),
                vy=v * math.sin(p.heading),
                yaw_rate=v * p.curvature,
                t=t,
            )
        )
    return traj


@dataclass(frozen=True)
class CurvedLanePath(Path):
    """Sigue un carril circular (centro, radio inicial) y opcionalmente cambia de carril.

    El desplazamiento lateral (positivo = a la izquierda del sentido de marcha) sigue el mismo
    perfil coseno que `LaneChangePath` a lo largo de `change_length` m del carril original.
    La longitud de arco real se obtiene integrando la curva en una tabla fina, así que `s` es
    distancia recorrida exacta (a la resolución de la tabla).
    """

    center: tuple[float, float]
    r0: float
    phi0: float  # ángulo polar inicial (rad)
    ccw: bool
    length: float
    lateral: float = 0.0
    change_length: float = 40.0
    samples: int = 4000

    def _radius(self, u: float) -> float:
        if self.lateral == 0.0:
            return self.r0
        d = (
            0.5
            * self.lateral
            * (1.0 - math.cos(math.pi * min(max(u, 0.0), self.change_length) / self.change_length))
        )
        # A la izquierda: hacia el centro si gira antihorario, hacia afuera si gira horario.
        return self.r0 - d if self.ccw else self.r0 + d

    def _point(self, u: float) -> tuple[float, float]:
        phi = self.phi0 + (u / self.r0 if self.ccw else -u / self.r0)
        r = self._radius(u)
        return (self.center[0] + r * math.cos(phi), self.center[1] + r * math.sin(phi))

    def _table(self) -> tuple[list[float], list[float]]:
        cache: dict[str, tuple[list[float], list[float]]] = self.__dict__.setdefault("_cache", {})
        if "t" not in cache:
            u_max = 1.2 * self.length + abs(self.lateral)
            us = [u_max * i / self.samples for i in range(self.samples + 1)]
            ss = [0.0]
            prev = self._point(0.0)
            for u in us[1:]:
                p = self._point(u)
                ss.append(ss[-1] + math.hypot(p[0] - prev[0], p[1] - prev[1]))
                prev = p
            cache["t"] = (us, ss)
        return cache["t"]

    def _u_at(self, s: float) -> float:
        us, ss = self._table()
        s = min(max(s, 0.0), ss[-1])
        i = bisect.bisect_left(ss, s)
        if i <= 0:
            return 0.0
        f = (s - ss[i - 1]) / (ss[i] - ss[i - 1]) if ss[i] > ss[i - 1] else 0.0
        return us[i - 1] + f * (us[i] - us[i - 1])

    def pose(self, s: float) -> Pose:
        s = min(max(s, 0.0), self.length)
        u = self._u_at(s)
        h = 1e-3
        p0 = self._point(u - h)
        p1 = self._point(u + h)
        heading = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
        q0 = self._point(u - 2 * h)
        q1 = self._point(u + 2 * h)
        h0 = math.atan2(self._point(u)[1] - q0[1], self._point(u)[0] - q0[0])
        h1 = math.atan2(q1[1] - self._point(u)[1], q1[0] - self._point(u)[0])
        dist = math.hypot(q1[0] - q0[0], q1[1] - q0[1])
        dh = math.atan2(math.sin(h1 - h0), math.cos(h1 - h0))
        x, y = self._point(u)
        return Pose(x, y, heading, dh / (dist / 2) if dist > 0 else 0.0)
