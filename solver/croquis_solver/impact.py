"""Impacto planar entre dos cuerpos rígidos con modelo de impulso (Brach; Kudlich–Slibar).

Hipótesis: el contacto es instantáneo en un punto P; se conservan momento lineal y angular del
sistema por construcción (impulsos iguales y opuestos); la restitución `e` relaciona las
velocidades normales relativas antes y después; en la dirección tangencial el impulso es la
fracción `mu` del normal (deslizamiento) salvo que baste menos para anular la velocidad tangencial
relativa (adherencia, "impulso crítico" de Brach).

Con restitución de Newton y fricción de Coulomb hay configuraciones (acoplamiento fuerte entre la
normal y la tangencial) en las que la combinación produce ganancia de energía cinética (paradoja de
Kane). Como la energía nunca puede aumentar en un choque, se evalúan candidatos en orden
(adherencia, deslizamiento con `mu`, `mu/2`, `mu/4`, …, 0) y se toma el primero que no gane energía;
el caso sin fricción nunca la gana para e ≤ 1. El resultado indica si hubo que reducir la fricción.
Referencias en docs/physics.md.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from croquis_solver.models import Body2D, State2D, Vec, cross, dot, perp, rot, unit


@dataclass(frozen=True)
class ImpactResult:
    """Resultado del impacto. `impulse` actúa sobre B; sobre A actúa `-impulse`."""

    impulse: Vec  # N·s, mundo
    impulse_normal: float
    impulse_tangential: float
    sticking: bool
    friction_used: float
    a_after: State2D
    b_after: State2D | None
    delta_v_a: float  # m/s
    delta_v_b: float  # m/s (0 si B es una barrera fija)
    pdof_a_deg: float  # 0 = frente, horario
    pdof_b_deg: float
    energy_loss: float  # J (≥ 0)

    @property
    def pdof_a_hours(self) -> float:
        return pdof_hours(self.pdof_a_deg)

    @property
    def pdof_b_hours(self) -> float:
        return pdof_hours(self.pdof_b_deg)


def pdof_hours(deg: float) -> float:
    """Convierte grados horarios (0 = 12 h) a horas de reloj en [0, 12)."""
    h = (deg % 360.0) / 30.0
    return 0.0 if abs(h - 12.0) < 1e-12 else h


def pdof_degrees(state: State2D, force_world: Vec) -> float:
    """Dirección de la que viene la fuerza, en el marco del cuerpo, grados horarios (0 = frente)."""
    f_body = rot(force_world, -state.yaw)
    d = (-f_body[0], -f_body[1])  # de dónde viene la fuerza
    deg = math.degrees(math.atan2(-d[1], d[0])) % 360.0
    return 0.0 if deg >= 360.0 - 1e-9 else deg


def _k_matrix(body: Body2D, state: State2D, point: Vec) -> tuple[float, float, float]:
    """Contribución del cuerpo a la matriz K (simétrica 2×2): I/m + s sᵀ / I_z, con s = k × r."""
    r = (point[0] - state.x, point[1] - state.y)
    s = perp(r)
    inv_m = 1.0 / body.mass
    inv_i = 1.0 / body.inertia
    return (inv_m + s[0] * s[0] * inv_i, s[0] * s[1] * inv_i, inv_m + s[1] * s[1] * inv_i)


def _apply(body: Body2D, state: State2D, point: Vec, impulse: Vec) -> State2D:
    r = (point[0] - state.x, point[1] - state.y)
    return state.with_velocity(
        state.vx + impulse[0] / body.mass,
        state.vy + impulse[1] / body.mass,
        state.yaw_rate + cross(r, impulse) / body.inertia,
    )


def _ke(body: Body2D, state: State2D) -> float:
    return 0.5 * body.mass * (state.vx**2 + state.vy**2) + 0.5 * body.inertia * state.yaw_rate**2


@dataclass(frozen=True)
class _Candidate:
    j_n: float
    j_t: float
    sticking: bool
    friction: float


def _candidates(
    k_nn: float,
    k_nt: float,
    k_tt: float,
    v_n: float,
    v_t: float,
    restitution: float,
    friction: float,
) -> list[_Candidate]:
    rhs_n = -(1.0 + restitution) * v_n
    out: list[_Candidate] = []
    det = k_nn * k_tt - k_nt * k_nt
    if det > 0:
        j_n_stick = (rhs_n * k_tt + k_nt * v_t) / det
        j_t_stick = (-k_nn * v_t - k_nt * rhs_n) / det
        if j_n_stick > 0 and abs(j_t_stick) <= friction * j_n_stick * (1 + 1e-12):
            out.append(_Candidate(j_n_stick, j_t_stick, True, friction))
    sgn = -1.0 if v_t > 0 else (1.0 if v_t < 0 else 0.0)
    mu = friction
    for _ in range(8):
        denom = k_nn + sgn * mu * k_nt
        if denom > 0:
            j_n = rhs_n / denom
            if j_n > 0:
                out.append(_Candidate(j_n, sgn * mu * j_n, False, mu))
        if mu == 0.0:
            break
        mu = 0.0 if mu < 1e-6 else mu / 2.0
    if not out or out[-1].friction != 0.0:
        out.append(_Candidate(rhs_n / k_nn, 0.0, False, 0.0))
    return out


def planar_impact(
    body_a: Body2D,
    state_a: State2D,
    body_b: Body2D | None,
    state_b: State2D | None,
    point: Vec,
    normal: Vec,
    *,
    restitution: float = 0.1,
    friction: float = 0.4,
) -> ImpactResult:
    """Resuelve el impulso en el punto `point` con normal `normal` (unitaria, de A hacia B).

    Si `body_b` es None, B es una barrera fija (masa infinita).
    """
    if not 0.0 <= restitution <= 1.0:
        msg = "La restitución debe estar en [0, 1]"
        raise ValueError(msg)
    if friction < 0:
        msg = "La fricción de contacto no puede ser negativa"
        raise ValueError(msg)
    n = unit(normal)
    t = perp(n)
    has_b = body_b is not None and state_b is not None

    v_pa = state_a.velocity_at(point)
    v_pb = state_b.velocity_at(point) if state_b is not None else (0.0, 0.0)
    v_rel = (v_pb[0] - v_pa[0], v_pb[1] - v_pa[1])
    v_n = dot(v_rel, n)
    v_t = dot(v_rel, t)
    if v_n >= 0:
        return ImpactResult(
            impulse=(0.0, 0.0),
            impulse_normal=0.0,
            impulse_tangential=0.0,
            sticking=False,
            friction_used=friction,
            a_after=state_a,
            b_after=state_b,
            delta_v_a=0.0,
            delta_v_b=0.0,
            pdof_a_deg=pdof_degrees(state_a, (-n[0], -n[1])),
            pdof_b_deg=pdof_degrees(state_b, n) if state_b is not None else 0.0,
            energy_loss=0.0,
        )

    kxx, kxy, kyy = _k_matrix(body_a, state_a, point)
    if body_b is not None and state_b is not None:
        bxx, bxy, byy = _k_matrix(body_b, state_b, point)
        kxx, kxy, kyy = kxx + bxx, kxy + bxy, kyy + byy
    k_nn = kxx * n[0] * n[0] + 2 * kxy * n[0] * n[1] + kyy * n[1] * n[1]
    k_tt = kxx * t[0] * t[0] + 2 * kxy * t[0] * t[1] + kyy * t[1] * t[1]
    k_nt = kxx * n[0] * t[0] + kxy * (n[0] * t[1] + n[1] * t[0]) + kyy * n[1] * t[1]

    ke_before = _ke(body_a, state_a) + (_ke(body_b, state_b) if has_b else 0.0)  # type: ignore[arg-type]
    chosen: tuple[_Candidate, Vec, State2D, State2D | None, float] | None = None
    for cand in _candidates(k_nn, k_nt, k_tt, v_n, v_t, restitution, friction):
        impulse = (cand.j_n * n[0] + cand.j_t * t[0], cand.j_n * n[1] + cand.j_t * t[1])
        a_after = _apply(body_a, state_a, point, (-impulse[0], -impulse[1]))
        b_after = _apply(body_b, state_b, point, impulse) if has_b else None  # type: ignore[arg-type]
        ke_after = _ke(body_a, a_after) + (_ke(body_b, b_after) if has_b else 0.0)  # type: ignore[arg-type]
        loss = ke_before - ke_after
        if loss >= -1e-9 * max(ke_before, 1.0):
            chosen = (cand, impulse, a_after, b_after, max(loss, 0.0))
            break
    if chosen is None:  # pragma: no cover - el candidato sin fricción siempre cumple
        msg = "No se encontró un impulso que no gane energía"
        raise RuntimeError(msg)
    cand, impulse, a_after, b_after, loss = chosen
    j_mag = math.hypot(*impulse)
    force_on_a = (-impulse[0], -impulse[1]) if j_mag > 0 else (-n[0], -n[1])
    force_on_b = impulse if j_mag > 0 else n
    return ImpactResult(
        impulse=impulse,
        impulse_normal=cand.j_n,
        impulse_tangential=cand.j_t,
        sticking=cand.sticking,
        friction_used=cand.friction,
        a_after=a_after,
        b_after=b_after,
        delta_v_a=j_mag / body_a.mass,
        delta_v_b=(j_mag / body_b.mass) if body_b is not None else 0.0,
        pdof_a_deg=pdof_degrees(state_a, force_on_a),
        pdof_b_deg=pdof_degrees(state_b, force_on_b) if state_b is not None else 0.0,
        energy_loss=loss,
    )


def central_collision_1d(
    m_a: float, v_a: float, m_b: float, v_b: float, e: float
) -> tuple[float, float]:
    """Choque central en línea (solución cerrada) para verificar el modelo planar."""
    total = m_a + m_b
    va2 = (m_a * v_a + m_b * v_b + m_b * e * (v_b - v_a)) / total
    vb2 = (m_a * v_a + m_b * v_b + m_a * e * (v_a - v_b)) / total
    return va2, vb2
