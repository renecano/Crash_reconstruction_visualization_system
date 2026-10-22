"""Tipos básicos del solver: cuerpos rígidos planos y estados cinemáticos (todo en SI).

Marco de referencia: X al este, Y al norte, ángulos en radianes antihorarios desde +X.
Marco del cuerpo: x hacia el frente, y hacia la izquierda (mano derecha, z hacia arriba).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace

from croquis_solver import dmath

G = 9.80665  # m/s², gravedad estándar

Vec = tuple[float, float]


def rot(v: Vec, angle: float) -> Vec:
    """Rota un vector `angle` radianes en sentido antihorario."""
    c, s = dmath.cos(angle), dmath.sin(angle)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)


def dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1]


def cross(a: Vec, b: Vec) -> float:
    """Producto cruz escalar en 2D (componente z)."""
    return a[0] * b[1] - a[1] * b[0]


def norm(v: Vec) -> float:
    return dmath.hypot(v[0], v[1])


def unit(v: Vec) -> Vec:
    n = norm(v)
    if n == 0:
        msg = "No se puede normalizar el vector cero"
        raise ValueError(msg)
    return (v[0] / n, v[1] / n)


def perp(v: Vec) -> Vec:
    """Vector girado +90° (k × v)."""
    return (-v[1], v[0])


def wrap_angle(a: float) -> float:
    """Lleva un ángulo a (-π, π]."""
    a = math.fmod(a + math.pi, 2 * math.pi)
    if a <= 0:
        a += 2 * math.pi
    return a - math.pi


@dataclass(frozen=True)
class Body2D:
    """Cuerpo rígido plano (vehículo visto desde arriba)."""

    mass: float  # kg
    inertia: float  # kg·m², momento de inercia de guiñada
    length: float  # m
    width: float  # m

    def __post_init__(self) -> None:
        if self.mass <= 0 or self.inertia <= 0 or self.length <= 0 or self.width <= 0:
            msg = "Masa, inercia y dimensiones deben ser positivas"
            raise ValueError(msg)

    @staticmethod
    def box_inertia(mass: float, length: float, width: float) -> float:
        """Inercia de guiñada de una placa rectangular uniforme (aproximación documentada)."""
        return mass * (length * length + width * width) / 12

    @classmethod
    def from_dimensions(cls, mass: float, length: float, width: float) -> Body2D:
        return cls(
            mass=mass, inertia=cls.box_inertia(mass, length, width), length=length, width=width
        )


@dataclass(frozen=True)
class State2D:
    """Estado cinemático en el marco del mundo."""

    x: float = 0.0
    y: float = 0.0
    yaw: float = 0.0  # rad
    vx: float = 0.0  # m/s
    vy: float = 0.0  # m/s
    yaw_rate: float = 0.0  # rad/s
    t: float = 0.0  # s

    @property
    def position(self) -> Vec:
        return (self.x, self.y)

    @property
    def velocity(self) -> Vec:
        return (self.vx, self.vy)

    @property
    def speed(self) -> float:
        return dmath.hypot(self.vx, self.vy)

    def velocity_at(self, point: Vec) -> Vec:
        """Velocidad del punto material `point` (mundo) del cuerpo: v + ω × r."""
        r = (point[0] - self.x, point[1] - self.y)
        return (self.vx - self.yaw_rate * r[1], self.vy + self.yaw_rate * r[0])

    def with_velocity(self, vx: float, vy: float, yaw_rate: float) -> State2D:
        return replace(self, vx=vx, vy=vy, yaw_rate=yaw_rate)

    def body_to_world(self, local: Vec) -> Vec:
        w = rot(local, self.yaw)
        return (self.x + w[0], self.y + w[1])

    def world_to_body(self, world: Vec) -> Vec:
        return rot((world[0] - self.x, world[1] - self.y), -self.yaw)


def kinetic_energy(body: Body2D, state: State2D) -> float:
    return 0.5 * body.mass * (state.vx * state.vx + state.vy * state.vy) + 0.5 * body.inertia * (
        state.yaw_rate * state.yaw_rate
    )


def linear_momentum(body: Body2D, state: State2D) -> Vec:
    return (body.mass * state.vx, body.mass * state.vy)


def angular_momentum_about(body: Body2D, state: State2D, origin: Vec) -> float:
    """Momento angular respecto a un punto fijo del mundo (componente z)."""
    r = (state.x - origin[0], state.y - origin[1])
    return body.inertia * state.yaw_rate + body.mass * cross(r, (state.vx, state.vy))


def _floats() -> list[float]:
    return []


@dataclass
class Trajectory:
    """Muestras de un cuerpo en el tiempo (listas paralelas, SI)."""

    t: list[float] = field(default_factory=_floats)
    x: list[float] = field(default_factory=_floats)
    y: list[float] = field(default_factory=_floats)
    yaw: list[float] = field(default_factory=_floats)
    vx: list[float] = field(default_factory=_floats)
    vy: list[float] = field(default_factory=_floats)
    yaw_rate: list[float] = field(default_factory=_floats)

    def append(self, s: State2D) -> None:
        self.t.append(s.t)
        self.x.append(s.x)
        self.y.append(s.y)
        self.yaw.append(s.yaw)
        self.vx.append(s.vx)
        self.vy.append(s.vy)
        self.yaw_rate.append(s.yaw_rate)

    def __len__(self) -> int:
        return len(self.t)

    def state(self, i: int) -> State2D:
        return State2D(
            self.x[i], self.y[i], self.yaw[i], self.vx[i], self.vy[i], self.yaw_rate[i], self.t[i]
        )

    def last(self) -> State2D:
        return self.state(len(self.t) - 1)

    def extend(self, other: Trajectory) -> None:
        for i in range(len(other)):
            self.append(other.state(i))
