"""Movimiento posterior al impacto: modelo planar de 3 grados de libertad con fricción por llanta.

Estado en el marco del cuerpo: (u, v, r) = velocidad longitudinal, lateral y de guiñada; posición y
rumbo en el mundo. Cada llanta recibe una fuerza de fricción saturada (círculo de fricción):

* llanta bloqueada: F = −μ N · dirección de su velocidad de deslizamiento (magnitud μ N);
* llanta rodando: fuerza lateral −μ N · sat(v_lat / v_ref) más un arrastre longitudinal
  `rolling_drag · N` (resistencia a la rodadura pura ≈ 0.015; tras un choque se usa una fracción
  mayor que representa frenado parcial y daño en ruedas, documentada en reconstruct.py).

Integración semi-implícita de Euler con paso fijo (determinista), hasta reposo
(|velocidad| < 0.05 m/s y |r| < 0.05 rad/s) o hasta `t_max`. Referencias en docs/physics.md.

Los vehículos de un choque entre vehículos se integran juntos (`integrate_joint`, ADR 0063): avanzan
al mismo paso y, si sus cajas se encajan más que lo que permite su aplastamiento, se resuelve el
contacto secundario (impulso plástico en la normal y separación de lo que sobra).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field

from croquis_solver import dmath
from croquis_solver.models import Body2D, G, State2D, Trajectory, Vec, wrap_angle

ROLLING_RESISTANCE = 0.015  # fracción de N (llanta rodando libre, asfalto)
V_REF_LATERAL = 0.3  # m/s, ancho de la zona lineal de la saturación lateral
STOP_SPEED = 0.05
STOP_YAW_RATE = 0.05
# m: la normal de un contacto secundario se mantiene mientras dure el contacto y solo cambia a otro
# eje si ese separa con al menos esto menos. Sin ella, dos ejes casi empatados se turnan de un paso
# a otro por el redondeo y el empujón cambia de dirección (ADR 0063).
AXIS_HYSTERESIS = 0.05
# m/s: a qué ritmo se deshace el encaje con que arrancan dos contornos en el instante del impacto
# (2 mm por paso, 2 cm por cuadro de 0.02 s): lo bastante lento para no verse como un salto y
# mucho más rápido que lo que dura la fase posterior (ADR 0063).
DEPENETRATION_SPEED = 1.0


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
        speed = dmath.hypot(u_c, v_c)
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


def _advance(
    body: Body2D,
    wheels: WheelConfig,
    mu: float,
    rolling_drag: float,
    u: float,
    v: float,
    r: float,
    dt: float,
) -> tuple[float, float, float]:
    """Un paso de las velocidades (u, v, r), en el marco del cuerpo, con la fricción de llantas."""
    m, inertia = body.mass, body.inertia
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
        r_new = 0.0
    else:
        r_new = r + dr
    return u_new, v_new, r_new


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
    c, s = dmath.cos(yaw), dmath.sin(yaw)
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
        u, v, r = _advance(body, wheels, mu, rolling_drag, u, v, r, dt)
        yaw = wrap_angle(yaw + r * dt)
        c, s = dmath.cos(yaw), dmath.sin(yaw)
        vx = u * c - v * s
        vy = u * s + v * c
        x += vx * dt
        y += vy * dt
        t += dt
        step += 1
        speed = dmath.hypot(u, v)
        if step % steps_per_out == 0:
            traj.append(State2D(x, y, yaw, vx, vy, r, t))
            distance += dmath.hypot(x - x_prev, y - y_prev)
            x_prev, y_prev = x, y
        if speed < STOP_SPEED and abs(r) < STOP_YAW_RATE:
            stopped = True
            if step % steps_per_out != 0:
                traj.append(State2D(x, y, yaw, 0.0, 0.0, 0.0, t))
                distance += dmath.hypot(x - x_prev, y - y_prev)
            break
    ke1 = 0.5 * m * (u * u + v * v) + 0.5 * inertia * r * r
    return PostImpactResult(traj, stopped, distance, t - start.t, max(ke0 - ke1, 0.0))


# ---- integración conjunta y contacto secundario (ADR 0063) ----------------------------------


@dataclass(frozen=True)
class JointBody:
    """Un vehículo en la integración conjunta: cuerpo, arranque, llantas y aplastamiento.

    `crush` es la profundidad máxima de su perfil de daño (m) y `crush_face` la cara dañada según
    el lado de su CDC (F, B, L o R): su contorno para el contacto secundario es la caja con esa
    cara hundida esa profundidad.
    """

    body: Body2D
    start: State2D
    wheels: WheelConfig
    mu: float
    rolling_drag: float = ROLLING_RESISTANCE
    crush: float = 0.0
    crush_face: str = "F"


Extents = tuple[float, float, float, float]  # adelante, atrás, izquierda, derecha (m, desde el CG)


def deformed_extents(length: float, width: float, crush: float, face: str) -> Extents:
    """Distancias del CG a cada cara de la caja, con la cara dañada hundida `crush` metros.

    El hundimiento se acota a la mitad de la dimensión para que la caja nunca se invierta.
    """
    hl, hw = length / 2, width / 2
    front, rear, left, right = hl, hl, hw, hw
    if face == "B":
        rear = hl - min(crush, hl)
    elif face == "L":
        left = hw - min(crush, hw)
    elif face == "R":
        right = hw - min(crush, hw)
    else:
        front = hl - min(crush, hl)
    return (front, rear, left, right)


def box_corners(x: float, y: float, yaw: float, extents: Extents) -> list[Vec]:
    """Esquinas de la caja con esas distancias a sus caras, en el mundo (CG en (x, y))."""
    return _corners(x, y, dmath.cos(yaw), dmath.sin(yaw), extents)


def _corners(x: float, y: float, c: float, s: float, extents: Extents) -> list[Vec]:
    front, rear, left, right = extents
    return [
        (x + a * c - b * s, y + a * s + b * c)
        for a, b in ((front, left), (front, -right), (-rear, -right), (-rear, left))
    ]


def axis_overlaps(a: Sequence[Vec], b: Sequence[Vec]) -> list[tuple[float, Vec]] | None:
    """Traslapes de dos rectángulos convexos por el teorema del eje separador.

    Para cada eje (las normales de las aristas de `a`, luego las de `b`) y cada sentido, cuánto hay
    que mover `b` en ese sentido para separarlos y ese sentido unitario: 16 pares, en ese orden.
    Si algún eje los separa, devuelve None.
    """
    out: list[tuple[float, Vec]] = []
    for poly in (a, b):
        for i in range(4):
            p, q = poly[i], poly[(i + 1) % 4]
            nx, ny = q[1] - p[1], p[0] - q[0]
            ln = dmath.hypot(nx, ny)
            ex, ey = nx / ln, ny / ln
            pa = [vx * ex + vy * ey for vx, vy in a]
            pb = [vx * ex + vy * ey for vx, vy in b]
            forward = max(pa) - min(pb)
            backward = max(pb) - min(pa)
            if forward <= 0 or backward <= 0:
                return None
            out.append((forward, (ex, ey)))
            out.append((backward, (-ex, -ey)))
    return out


def _argmin(overlaps: Sequence[tuple[float, Vec]]) -> int:
    best = 0
    for k in range(1, len(overlaps)):
        if overlaps[k][0] < overlaps[best][0]:
            best = k
    return best


def box_penetration(a: Sequence[Vec], b: Sequence[Vec]) -> tuple[float, Vec]:
    """Penetración de dos rectángulos convexos: el menor desplazamiento de `b` que los separa y
    su sentido (en un empate gana el primero de `axis_overlaps`). Si no se tocan, (0, (0, 0))."""
    ov = axis_overlaps(a, b)
    if ov is None:
        return 0.0, (0.0, 0.0)
    return ov[_argmin(ov)]


@dataclass
class JointState:
    """Estado mutable de un cuerpo durante la integración conjunta."""

    spec: JointBody
    extents: Extents
    x: float
    y: float
    yaw: float
    c: float
    s: float
    u: float
    v: float
    r: float
    vx: float
    vy: float
    active: bool
    ke0: float
    ke1: float = 0.0
    traj: Trajectory = field(default_factory=Trajectory)
    keep: int = 1
    moved: bool = False
    distance: float = 0.0
    x_prev: float = 0.0
    y_prev: float = 0.0

    @classmethod
    def from_body(cls, spec: JointBody) -> JointState:
        """Estado inicial: velocidades al marco del cuerpo; en reposo si arranca sin velocidad."""
        st = spec.start
        c, s = dmath.cos(st.yaw), dmath.sin(st.yaw)
        u = st.vx * c + st.vy * s
        v = -st.vx * s + st.vy * c
        r = st.yaw_rate
        m, inertia = spec.body.mass, spec.body.inertia
        ke0 = 0.5 * m * (u * u + v * v) + 0.5 * inertia * r * r
        active = st.speed > STOP_SPEED or abs(st.yaw_rate) > STOP_YAW_RATE
        ext = deformed_extents(spec.body.length, spec.body.width, spec.crush, spec.crush_face)
        j = cls(spec, ext, st.x, st.y, st.yaw, c, s, u, v, r, st.vx, st.vy, active, ke0)
        if not active:
            j.ke1 = ke0
            j.u = j.v = j.r = j.vx = j.vy = 0.0
        j.traj.append(st)
        j.x_prev, j.y_prev = st.x, st.y
        return j


def _corners_of(j: JointState) -> list[Vec]:
    # j.c y j.s son siempre cos y sin de j.yaw: los mismos bits, sin volver a calcularlos.
    return _corners(j.x, j.y, j.c, j.s, j.extents)


def _kinetic(j: JointState) -> float:
    m, inertia = j.spec.body.mass, j.spec.body.inertia
    return 0.5 * m * (j.u * j.u + j.v * j.v) + 0.5 * inertia * j.r * j.r


def _set_world_velocity(j: JointState, vx: float, vy: float) -> None:
    j.vx, j.vy = vx, vy
    j.u = vx * j.c + vy * j.s
    j.v = -vx * j.s + vy * j.c


def resolve_secondary_contact(
    a: JointState, b: JointState, allowance: float, axis: int | None = None
) -> tuple[float, int | None]:
    """Contacto secundario entre dos contornos deformados que se encajan más que `allowance` (m).

    La normal es la del menor traslape (`axis_overlaps`), orientada de `a` hacia `b`. Mientras dura
    un contacto se conserva la de `axis` (su índice en `axis_overlaps`), salvo que otra separe con
    `AXIS_HYSTERESIS` menos. Si pasa del encaje permitido:

    1. Si se acercan en la normal, impulso plástico (restitución 0) en los centros: conserva el
       momento lineal e iguala su velocidad normal. Un cuerpo en reposo al que ese impulso no saca
       del reposo (`STOP_SPEED`) se queda quieto, como sujeto por sus llantas, y el otro pierde
       toda su velocidad normal contra él.
    2. Separa lo que sobra del encaje permitido, en proporción inversa a la masa entre los que se
       mueven (el centro de masa del par no se mueve); si los dos están en reposo, entre los dos.

    Devuelve el encaje que queda en esa normal y la normal del contacto (None si no hay contacto).
    """
    ov = axis_overlaps(_corners_of(a), _corners_of(b))
    if ov is None:
        return 0.0, None
    k = _argmin(ov)
    if axis is not None and ov[k][0] >= ov[axis][0] - AXIS_HYSTERESIS:
        k = axis
    depth, n = ov[k]
    excess = depth - allowance
    if excess <= 0:
        return depth, (None if axis is None else k)
    wa, wb = 1.0 / a.spec.body.mass, 1.0 / b.spec.body.mass
    v_rel = (b.vx - a.vx) * n[0] + (b.vy - a.vy) * n[1]
    if v_rel < 0:
        impulse = -v_rel / (wa + wb)
        ax, ay = a.vx - impulse * wa * n[0], a.vy - impulse * wa * n[1]
        bx, by = b.vx + impulse * wb * n[0], b.vy + impulse * wb * n[1]
        a_moves = a.active or dmath.hypot(ax, ay) >= STOP_SPEED
        b_moves = b.active or dmath.hypot(bx, by) >= STOP_SPEED
        if a_moves and b_moves:
            _set_world_velocity(a, ax, ay)
            _set_world_velocity(b, bx, by)
            a.active = b.active = True
        elif a_moves:
            _set_world_velocity(a, a.vx + v_rel * n[0], a.vy + v_rel * n[1])
        elif b_moves:
            _set_world_velocity(b, b.vx - v_rel * n[0], b.vy - v_rel * n[1])
    if a.active or b.active:
        wa = wa if a.active else 0.0
        wb = wb if b.active else 0.0
    share_a, share_b = wa / (wa + wb), wb / (wa + wb)
    if share_a > 0:
        a.x -= excess * share_a * n[0]
        a.y -= excess * share_a * n[1]
        a.moved = True
    if share_b > 0:
        b.x += excess * share_b * n[0]
        b.y += excess * share_b * n[1]
        b.moved = True
    return allowance, k


def _sample(j: JointState, state: State2D) -> None:
    j.traj.append(state)
    j.distance += dmath.hypot(j.x - j.x_prev, j.y - j.y_prev)
    j.x_prev, j.y_prev = j.x, j.y


def integrate_joint(
    bodies: Sequence[JointBody],
    *,
    dt: float = 0.002,
    dt_out: float = 0.02,
    t_max: float = 30.0,
) -> list[PostImpactResult]:
    """Integra juntos los vehículos de un choque entre vehículos, con contacto secundario.

    Cada cuerpo avanza con el mismo modelo de llantas que `integrate` y al mismo paso que los
    demás. El contorno de cada uno es su caja (largo × ancho) con la cara dañada hundida su
    aplastamiento máximo: la caja sin deformar puede encajarse en la otra hasta esa profundidad,
    que es el daño, pero no más. Tras cada paso, cada par cuyos contornos se encajan más que su
    encaje permitido recibe el contacto secundario (`resolve_secondary_contact`). El encaje
    permitido arranca en el que tienen en el instante del impacto (esa configuración la fija el
    punto de contacto, no este modelo) y solo baja: sigue al encaje real cuando se separan y,
    además, se deshace a `DEPENETRATION_SPEED`, así que no hay un salto en el primer paso y al
    poco tiempo los contornos ya no se encajan. La integración sigue mientras algún cuerpo se
    mueva o quede encaje por deshacer.

    Un cuerpo que arranca sin velocidad (≤ 0.05 m/s y ≤ 0.05 rad/s) espera en reposo y solo se
    mueve si lo empujan; uno que llega al reposo vuelve a moverse si otro lo empuja. Cada
    trayectoria se muestrea como en `integrate` (cada `dt_out` y en el instante del reposo) y
    termina en su último reposo. Sin contacto, cada resultado es idéntico al de `integrate`.

    Límites (ADR 0063): impulso lineal en los centros (no acopla la guiñada), sin fricción entre
    carrocerías, y el contorno es una caja rectangular con la cara dañada hundida de forma pareja
    (su aplastamiento máximo, no el perfil).
    """
    if dt <= 0 or dt_out < dt:
        msg = "dt debe ser positivo y dt_out ≥ dt"
        raise ValueError(msg)
    t0 = bodies[0].start.t if bodies else 0.0
    joints = [JointState.from_body(spec) for spec in bodies]
    pairs: list[tuple[JointState, JointState]] = []
    allowances: list[float] = []
    axes: list[int | None] = []
    for i, a in enumerate(joints):
        for b in joints[i + 1 :]:
            pairs.append((a, b))
            allowances.append(box_penetration(_corners_of(a), _corners_of(b))[0])
            axes.append(None)
    steps_per_out = max(1, round(dt_out / dt))
    step = 0
    t = t0
    relax = DEPENETRATION_SPEED * dt
    while t < t0 + t_max - 1e-12 and (
        any(j.active for j in joints) or any(w > 0 for w in allowances)
    ):
        for j in joints:
            if not j.active:
                continue
            sp = j.spec
            j.u, j.v, j.r = _advance(sp.body, sp.wheels, sp.mu, sp.rolling_drag, j.u, j.v, j.r, dt)
            j.yaw = wrap_angle(j.yaw + j.r * dt)
            j.c, j.s = dmath.cos(j.yaw), dmath.sin(j.yaw)
            j.vx = j.u * j.c - j.v * j.s
            j.vy = j.u * j.s + j.v * j.c
            j.x += j.vx * dt
            j.y += j.vy * dt
        t += dt
        step += 1
        for k, (a, b) in enumerate(pairs):
            left, axes[k] = resolve_secondary_contact(a, b, allowances[k], axes[k])
            allowances[k] = max(0.0, min(allowances[k], left) - relax)
        on_grid = step % steps_per_out == 0
        for j in joints:
            if j.active:
                speed = dmath.hypot(j.u, j.v)
                if on_grid:
                    _sample(j, State2D(j.x, j.y, j.yaw, j.vx, j.vy, j.r, t))
                if speed < STOP_SPEED and abs(j.r) < STOP_YAW_RATE:
                    if not on_grid:
                        _sample(j, State2D(j.x, j.y, j.yaw, 0.0, 0.0, 0.0, t))
                    j.ke1 = _kinetic(j)
                    j.active = False
                    j.u = j.v = j.r = j.vx = j.vy = 0.0
                j.keep = len(j.traj)
                j.moved = False
            elif on_grid:
                _sample(j, State2D(j.x, j.y, j.yaw, 0.0, 0.0, 0.0, t))
                if j.moved:
                    j.keep = len(j.traj)
                    j.moved = False
    out: list[PostImpactResult] = []
    for j in joints:
        if j.moved:
            _sample(j, State2D(j.x, j.y, j.yaw, 0.0, 0.0, 0.0, t))
            j.keep = len(j.traj)
        if j.active:
            j.ke1 = _kinetic(j)
        tr = j.traj
        for col in (tr.t, tr.x, tr.y, tr.yaw, tr.vx, tr.vy, tr.yaw_rate):
            del col[j.keep :]
        end = t if j.active else tr.t[-1]
        out.append(
            PostImpactResult(
                tr, not j.active, j.distance, end - j.spec.start.t, max(j.ke0 - j.ke1, 0.0)
            )
        )
    return out
