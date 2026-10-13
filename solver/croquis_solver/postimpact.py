"""Movimiento posterior al impacto: modelo planar de 3 grados de libertad con fricción por llanta.

Estado en el marco del cuerpo: (u, v, r) = velocidad longitudinal, lateral y de guiñada; posición y
rumbo en el mundo. Cada llanta recibe una fuerza de fricción saturada (círculo de fricción):

* llanta bloqueada: F = −μ N · dirección de su velocidad de deslizamiento (magnitud μ N);
* llanta rodando: fuerza lateral −μ N · sat(v_lat / v_ref) más un arrastre longitudinal
  `rolling_drag · N` (resistencia a la rodadura pura ≈ 0.015; tras un choque se usa una fracción
  mayor que representa frenado parcial y daño en ruedas, documentada en reconstruct.py).

Integración semi-implícita de Euler con paso fijo (determinista), hasta reposo
(|velocidad| < 0.05 m/s y |r| < 0.05 rad/s) o hasta `t_max`. Referencias en docs/physics.md.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from croquis_solver.models import Body2D, G, State2D, Trajectory, wrap_angle

ROLLING_RESISTANCE = 0.015  # fracción de N (llanta rodando libre, asfalto)
V_REF_LATERAL = 0.3  # m/s, ancho de la zona lineal de la saturación lateral
STOP_SPEED = 0.05
STOP_YAW_RATE = 0.05


@dataclass(frozen=True)
class WheelConfig:
    """Posición de cada llanta en el cuerpo (x adelante, y izquierda) y si va bloqueada."""

    positions: tuple[tuple[float, float], ...]
    locked: tuple[bool, ...]
    load_fractions: tuple[float, ...]

    @classmethod
    def four_wheels(
        cls,
        wheelbase: float,
        track: float,
        cg_from_front_axle: float,
        *,
        locked: bool | tuple[bool, bool, bool, bool] = True,
    ) -> WheelConfig:
        a = cg_from_front_axle
        b = wheelbase - a
        if a <= 0 or b <= 0:
            msg = "El centro de gravedad debe quedar entre los ejes"
            raise ValueError(msg)
        front_share = b / wheelbase / 2.0
        rear_share = a / wheelbase / 2.0
        lk = (locked,) * 4 if isinstance(locked, bool) else locked
        return cls(
            positions=((a, track / 2), (a, -track / 2), (-b, track / 2), (-b, -track / 2)),
            locked=lk,
            load_fractions=(front_share, front_share, rear_share, rear_share),
        )


@dataclass(frozen=True)
class PostImpactResult:
    trajectory: Trajectory
    stopped: bool
    distance: float  # m recorridos por el CG
    duration: float  # s
    energy_dissipated: float  # J


def _tire_force(
    u_c: float, v_c: float, normal_load: float, mu: float, locked: bool, rolling_drag: float
) -> tuple[float, float]:
    """Fuerza (Fx, Fy) en el marco del cuerpo sobre una llanta con velocidad de contacto (u_c, v_c).

    Devuelve newtons.
    """
    if locked:
        speed = math.hypot(u_c, v_c)
        if speed < 1e-9:
            return (0.0, 0.0)
        f = mu * normal_load
        return (-f * u_c / speed, -f * v_c / speed)
    f_lat = -mu * normal_load * max(-1.0, min(1.0, v_c / V_REF_LATERAL))
    sign = 1.0 if u_c > 1e-9 else (-1.0 if u_c < -1e-9 else 0.0)
    f_roll = -rolling_drag * normal_load * sign
    return (f_roll, f_lat)


def _step_component(value: float, delta: float, other: float) -> float:
    """Avanza `value` en `delta` sin que la fricción invierta el sentido en un solo paso."""
    reverses = abs(delta) > abs(value) and (
        value == 0 or math.copysign(1, delta) != math.copysign(1, value)
    )
    if reverses:
        return 0.0 if abs(other) < STOP_SPEED else value + delta
    return value + delta


def integrate(
    body: Body2D,
    start: State2D,
    wheels: WheelConfig,
    mu: float,
    *,
    dt: float = 0.002,
    dt_out: float = 0.02,
    t_max: float = 30.0,
    rolling_drag: float = ROLLING_RESISTANCE,
) -> PostImpactResult:
    """Integra desde `start` hasta el reposo.

    `start.t` es el instante inicial (por ejemplo, el del impacto).
    """
    if dt <= 0 or dt_out < dt:
        msg = "dt debe ser positivo y dt_out ≥ dt"
        raise ValueError(msg)
    m, inertia = body.mass, body.inertia
    x, y, yaw = start.x, start.y, start.yaw
    c, s = math.cos(yaw), math.sin(yaw)
    u = start.vx * c + start.vy * s
    v = -start.vx * s + start.vy * c
    r = start.yaw_rate
    t = start.t
    traj = Trajectory()
    traj.append(start)
    ke0 = 0.5 * m * (u * u + v * v) + 0.5 * inertia * r * r
    steps_per_out = max(1, round(dt_out / dt))
    step = 0
    distance = 0.0
    stopped = False
    x_prev, y_prev = x, y
    while t < start.t + t_max - 1e-12:
        fx_tot = fy_tot = mz = 0.0
        for (px, py), locked, share in zip(
            wheels.positions, wheels.locked, wheels.load_fractions, strict=True
        ):
            u_c = u - r * py
            v_c = v + r * px
            fx, fy = _tire_force(u_c, v_c, m * G * share, mu, locked, rolling_drag)
            fx_tot += fx
            fy_tot += fy
            mz += px * fy - py * fx
        du = (fx_tot / m + r * v) * dt
        dv = (fy_tot / m - r * u) * dt
        dr = (mz / inertia) * dt
        u_new = _step_component(u, du, v)
        v_new = _step_component(v, dv, u)
        if abs(dr) > abs(r) and (r == 0 or math.copysign(1, dr) != math.copysign(1, r)):
            r = 0.0
        else:
            r += dr
        u, v = u_new, v_new
        yaw = wrap_angle(yaw + r * dt)
        c, s = math.cos(yaw), math.sin(yaw)
        vx = u * c - v * s
        vy = u * s + v * c
        x += vx * dt
        y += vy * dt
        t += dt
        step += 1
        speed = math.hypot(u, v)
        if step % steps_per_out == 0:
            traj.append(State2D(x, y, yaw, vx, vy, r, t))
            distance += math.hypot(x - x_prev, y - y_prev)
            x_prev, y_prev = x, y
        if speed < STOP_SPEED and abs(r) < STOP_YAW_RATE:
            stopped = True
            if step % steps_per_out != 0:
                traj.append(State2D(x, y, yaw, 0.0, 0.0, 0.0, t))
                distance += math.hypot(x - x_prev, y - y_prev)
            break
    ke1 = 0.5 * m * (u * u + v * v) + 0.5 * inertia * r * r
    return PostImpactResult(traj, stopped, distance, t - start.t, max(ke0 - ke1, 0.0))
