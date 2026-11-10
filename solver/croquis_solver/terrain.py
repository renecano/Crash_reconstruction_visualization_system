"""El terreno que afecta la reconstrucción (C3, W5; docs/physics.md, «Terreno»).

Cuatro cosas salen de `lugar.terreno` y, si la hay, de la malla de relieve del paquete caso-3d:

* **Altura z(x, y):** relieve (malla regular, bilineal) + ondulaciones + topes. La pendiente que
  siente un vehículo es la de sus llantas: (z del eje de adelante − z del de atrás) / batalla, y lo
  mismo de lado a lado. Con ella, la gravedad empuja con g·sen α y la carga normal baja a N·cos α.
* **Fricción por zona:** bajo cada llanta vale la de la zona que la contiene (la última declarada);
  fuera de las zonas, la del lugar.
* **Topes:** al cruzar la línea de un tope, cada eje disipa η·(carga del eje)·h, y mientras está
  sobre él su carga baja como la de una rueda rígida sobre una cresta de radio R (1 − v²/(g·R)),
  escalada por κ; si esa rueda rígida despegaría, sigue así lo que tarda en caer la altura del
  tope. Los dos son supuestos declarados con rango (`BUMP_ENERGY`, `BUMP_CONTACT`).
* **Pose:** z, cabeceo y alabeo del plano que pasa por los contactos de las llantas.

Sin `lugar.terreno` (o con todo vacío y sin relieve, o con una malla plana) `Terrain.from_spec`
devuelve None y el solver sigue exactamente el camino de siempre.

La forma de las ondulaciones es la misma con que las dibuja el visor (`TerrenoVista.cs`). El tope
es un arco de círculo de cuerda `largo_m` y flecha `alto_m`: con 1.40 m y 0.10 m da el radio de
2.5 m del reductor circular de la NOM-034-SCT2/SEDATU-2022 (tabla 38).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from croquis_solver import dmath
from croquis_solver.models import G, Vec
from croquis_solver.preimpact import Path, ReversePath, SpeedProfile

JsonObj = dict[str, Any]

# Supuestos del cruce de un tope (docs/physics.md, «Topes»): valor nominal y rango.
BUMP_ENERGY = (1.0, 0.5, 1.5)  # η: fracción de (carga del eje × altura) que se disipa
BUMP_CONTACT = (0.5, 0.0, 1.0)  # κ: 0, la suspensión absorbe todo; 1, rueda rígida
WAVE_FADE_M = 3.0  # m: la ondulación se desvanece hacia la orilla de su zona
# Cada cuántos pasos de la integración posterior se vuelve a leer el terreno bajo las llantas.
TERRAIN_STRIDE = 5
BRAKE_STEP_M = 0.05  # m: paso de la tabla de frenado sobre terreno
BRAKE_MAX_STEPS = 40000  # 2 km: más allá, el vehículo no se detiene con ese terreno

Box = tuple[float, float, float, float]


def _box(poly: Sequence[Vec]) -> Box:
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return (min(xs), min(ys), max(xs), max(ys))


def _inside(poly: Sequence[Vec], x: float, y: float) -> bool:
    """Si (x, y) está dentro del polígono (regla par-impar)."""
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _edge_distance(poly: Sequence[Vec], x: float, y: float) -> float:
    """Distancia de (x, y) al borde del polígono."""
    best = math.inf
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        dx, dy = bx - ax, by - ay
        ln2 = dx * dx + dy * dy
        u = 0.0 if ln2 == 0 else min(1.0, max(0.0, ((x - ax) * dx + (y - ay) * dy) / ln2))
        d = dmath.hypot(x - (ax + u * dx), y - (ay + u * dy))
        best = min(best, d)
    return best


@dataclass(frozen=True)
class Zone:
    id: str
    poly: tuple[Vec, ...]
    box: Box
    mu: float


@dataclass(frozen=True)
class Wave:
    poly: tuple[Vec, ...]
    box: Box
    amplitude: float
    wavelength: float
    cos_r: float
    sin_r: float

    def height(self, x: float, y: float) -> float:
        b = self.box
        if x < b[0] or x > b[2] or y < b[1] or y > b[3] or not _inside(self.poly, x, y):
            return 0.0
        fade = min(1.0, _edge_distance(self.poly, x, y) / WAVE_FADE_M)
        s = x * self.cos_r + y * self.sin_r
        return self.amplitude * (0.5 + 0.5 * dmath.sin(2.0 * math.pi * s / self.wavelength)) * fade


@dataclass(frozen=True)
class Bump:
    """Un tope: la línea a–b que cruza la vía, con su altura y su largo en el sentido de marcha."""

    id: str
    a: Vec
    b: Vec
    height: float
    length: float
    span: float  # largo de la línea (m)
    ux: float  # unitario a lo largo de la línea
    uy: float
    radius: float  # de la cresta: (L²/4 + h²) / (2h)

    @classmethod
    def make(cls, id_: str, a: Vec, b: Vec, height: float, length: float) -> Bump:
        span = dmath.hypot(b[0] - a[0], b[1] - a[1])
        radius = (length * length / 4.0 + height * height) / (2.0 * height)
        return cls(
            id_, a, b, height, length, span, (b[0] - a[0]) / span, (b[1] - a[1]) / span, radius
        )

    def signed(self, x: float, y: float) -> float:
        """Distancia con signo de (x, y) a la línea del tope (positiva a su izquierda)."""
        return (x - self.a[0]) * -self.uy + (y - self.a[1]) * self.ux

    def along(self, x: float, y: float) -> float:
        """Posición de (x, y) a lo largo de la línea, en metros desde `a`."""
        return (x - self.a[0]) * self.ux + (y - self.a[1]) * self.uy

    def over(self, x: float, y: float) -> bool:
        """Si (x, y) está sobre el tope."""
        w = self.along(x, y)
        return 0.0 <= w <= self.span and abs(self.signed(x, y)) < self.length / 2.0

    def height_at(self, x: float, y: float) -> float:
        w = self.along(x, y)
        if w < 0.0 or w > self.span:
            return 0.0
        d = abs(self.signed(x, y))
        if d >= self.length / 2.0:
            return 0.0
        return math.sqrt(self.radius * self.radius - d * d) - (self.radius - self.height)

    def crosses(self, p0: Vec, p1: Vec) -> bool:
        """Si el tramo p0→p1 cruza la línea del tope dentro de su largo."""
        d0 = self.signed(p0[0], p0[1])
        d1 = self.signed(p1[0], p1[1])
        if (d0 > 0.0) == (d1 > 0.0):
            return False
        f = d0 / (d0 - d1)
        w = self.along(p0[0] + f * (p1[0] - p0[0]), p0[1] + f * (p1[1] - p0[1]))
        return 0.0 <= w <= self.span

    def contact(self, v_normal: float) -> float:
        """Cuánta carga conserva una rueda rígida en la cresta a esa velocidad: 1 − v²/(g·R)."""
        return max(0.0, 1.0 - v_normal * v_normal / (G * self.radius))

    @property
    def flight_s(self) -> float:
        """Lo que tarda en caer la altura del tope una rueda que despega en la cresta."""
        return math.sqrt(2.0 * self.height / G)


@dataclass(frozen=True)
class ReliefMesh:
    """La malla de relieve del paquete caso-3d: filas de sur a norte, columnas de oeste a este."""

    x0: float
    y0: float
    step: float
    nx: int
    ny: int
    heights: tuple[float, ...]

    def height(self, x: float, y: float) -> float:
        fx = min(max((x - self.x0) / self.step, 0.0), self.nx - 1.0)
        fy = min(max((y - self.y0) / self.step, 0.0), self.ny - 1.0)
        i = min(int(fx), self.nx - 2)
        j = min(int(fy), self.ny - 2)
        tx, ty = fx - i, fy - j
        h = self.heights
        k = j * self.nx + i
        low = h[k] + (h[k + 1] - h[k]) * tx
        high = h[k + self.nx] + (h[k + self.nx + 1] - h[k + self.nx]) * tx
        return low + (high - low) * ty


def _points(raw: Sequence[JsonObj]) -> tuple[Vec, ...]:
    return tuple((float(p["x"]), float(p["y"])) for p in raw)


@dataclass(frozen=True)
class Terrain:
    zones: tuple[Zone, ...]
    waves: tuple[Wave, ...]
    bumps: tuple[Bump, ...]
    relief: ReliefMesh | None

    @property
    def has_height(self) -> bool:
        return bool(self.waves or self.bumps or self.relief is not None)

    @classmethod
    def from_spec(cls, lugar: JsonObj, relieve: JsonObj | None = None) -> Terrain | None:
        """El terreno de la escena, o None si no cambia nada respecto a un plano."""
        t: JsonObj = lugar.get("terreno") or {}
        zones = tuple(
            Zone(
                str(z["id"]),
                _points(z["poligono"]),
                _box(_points(z["poligono"])),
                float(z["friccion"]["valor"]),
            )
            for z in t.get("superficies", [])
        )
        waves: list[Wave] = []
        for o in t.get("ondulaciones", []):
            poly = _points(o["poligono"])
            r = math.radians(float(o["rumbo_deg"]))
            waves.append(
                Wave(
                    poly,
                    _box(poly),
                    float(o["amplitud_m"]),
                    float(o["longitud_onda_m"]),
                    dmath.cos(r),
                    dmath.sin(r),
                )
            )
        bumps: list[Bump] = []
        for tp in t.get("topes", []):
            a, b = _points(tp["linea"])
            if a != b:
                bumps.append(
                    Bump.make(str(tp["id"]), a, b, float(tp["alto_m"]), float(tp["largo_m"]))
                )
        mesh = relief_mesh(t.get("relieve"), relieve)
        if not zones and not waves and not bumps and mesh is None:
            return None
        return cls(zones, tuple(waves), tuple(bumps), mesh)

    def height(self, x: float, y: float) -> float:
        z = 0.0 if self.relief is None else self.relief.height(x, y)
        for w in self.waves:
            z += w.height(x, y)
        for b in self.bumps:
            z += b.height_at(x, y)
        return z

    def mu(self, x: float, y: float, base: float) -> float:
        """La fricción bajo (x, y): la de la última zona declarada que lo contiene, o `base`."""
        for z in reversed(self.zones):
            b = z.box
            if b[0] <= x <= b[2] and b[1] <= y <= b[3] and _inside(z.poly, x, y):
                return z.mu
        return base

    def bump_over(self, x: float, y: float) -> Bump | None:
        for b in self.bumps:
            if b.over(x, y):
                return b
        return None


def relief_mesh(declared: JsonObj | None, relieve: JsonObj | None) -> ReliefMesh | None:
    """La malla que cita la escena, si viene y no es plana. Una malla plana no cambia nada."""
    if not declared or declared.get("fuente") == "plano" or relieve is None:
        return None
    cited = declared.get("malla_id")
    if cited is not None and str(cited) != str(relieve["id"]):
        return None
    heights = tuple(float(h) for h in relieve["alturas_m"])
    if max(heights) == min(heights):
        return None
    origen: JsonObj = relieve["origen"]
    return ReliefMesh(
        float(origen["x"]),
        float(origen["y"]),
        float(relieve["resolucion_m"]),
        int(relieve["ancho"]),
        int(relieve["alto"]),
        heights,
    )


def relief_missing(lugar: JsonObj, relieve: JsonObj | None) -> bool:
    """Si la escena cita un relieve real y la malla no llegó (se reconstruye sin relieve)."""
    terreno: JsonObj = lugar.get("terreno") or {}
    declared: JsonObj = terreno.get("relieve") or {}
    if declared.get("fuente") not in {"dem", "declarado"}:
        return False
    cited = declared.get("malla_id")
    return relieve is None or (cited is not None and str(cited) != str(relieve["id"]))


# ---- pose sobre el terreno ----------------------------------------------------------------------


def _mean(xs: Sequence[float]) -> float:
    return sum(xs) / len(xs)


def slopes(
    terrain: Terrain,
    wheels: Sequence[Vec],
    x: float,
    y: float,
    c: float,
    s: float,
) -> tuple[float, float, float]:
    """(z del centro, pendiente a lo largo, pendiente de lado) del plano de las llantas.

    La pendiente a lo largo es positiva con la nariz arriba; la de lado, con el costado izquierdo
    arriba (el derecho hacia abajo). `wheels` son las posiciones en el cuerpo (x adelante, y a la
    izquierda); (c, s) son el coseno y el seno del rumbo.
    """
    zs = [terrain.height(x + px * c - py * s, y + px * s + py * c) for px, py in wheels]
    front = [k for k, (px, _) in enumerate(wheels) if px > 0.0]
    rear = [k for k, (px, _) in enumerate(wheels) if px <= 0.0]
    left = [k for k, (_, py) in enumerate(wheels) if py > 0.0]
    right = [k for k, (_, py) in enumerate(wheels) if py <= 0.0]
    if not front or not rear or not left or not right:
        return (_mean(zs), 0.0, 0.0)
    zf, zr = _mean([zs[k] for k in front]), _mean([zs[k] for k in rear])
    xf, xr = _mean([wheels[k][0] for k in front]), _mean([wheels[k][0] for k in rear])
    zl, zd = _mean([zs[k] for k in left]), _mean([zs[k] for k in right])
    yl, yd = _mean([wheels[k][1] for k in left]), _mean([wheels[k][1] for k in right])
    along = (zf - zr) / (xf - xr)
    return (zr + along * (0.0 - xr), along, (zl - zd) / (yl - yd))


def pose_on(
    terrain: Terrain, wheels: Sequence[Vec], x: float, y: float, yaw: float
) -> tuple[float, float, float]:
    """(z, cabeceo, alabeo) en m y rad; positivos: nariz arriba y costado derecho abajo."""
    z, along, side = slopes(terrain, wheels, x, y, dmath.cos(yaw), dmath.sin(yaw))
    return (z, dmath.atan(along), dmath.atan(side))


# ---- contacto de las llantas en la integración posterior ---------------------------------------


def _floats() -> list[float]:
    return []


def _vecs() -> list[Vec]:
    return []


@dataclass
class WheelContact:
    """Lo que el terreno le da a cada llanta de un cuerpo, entre una lectura y la siguiente."""

    mu: list[float] = field(default_factory=_floats)
    load: list[float] = field(default_factory=_floats)  # factor sobre la carga estática
    g_u: float = 0.0  # gravedad a lo largo del cuerpo (m/s²)
    g_v: float = 0.0  # y de lado
    prev: list[Vec] = field(default_factory=_vecs)
    fly_until: list[float] = field(default_factory=_floats)


def read_contact(
    terrain: Terrain,
    st: WheelContact,
    wheels: Sequence[Vec],
    shares: Sequence[float],
    pose: tuple[float, float, float, float],
    vel: tuple[float, float, float],
    t: float,
    mu_base: float,
    zone_friction: bool,
) -> float:
    """Lee el terreno bajo las llantas y devuelve la fracción de energía de traslación que queda
    después de los topes cruzados desde la lectura anterior (1 si no cruzó ninguno).

    `pose` es (x, y, cos, sen) del cuerpo y `vel` es (u, v, r) en su marco.
    """
    x, y, c, s = pose
    u, v, r = vel
    n = len(wheels)
    first = not st.prev
    if first:
        st.mu = [mu_base] * n
        st.load = [1.0] * n
        st.fly_until = [-math.inf] * n
    slope_cos = 1.0
    if terrain.has_height:
        _, along, side = slopes(terrain, wheels, x, y, c, s)
        norm = math.sqrt(1.0 + along * along + side * side)
        slope_cos = 1.0 / norm
        st.g_u = -G * along / norm
        st.g_v = -G * side / norm
    ke = 0.5 * (u * u + v * v)  # por unidad de masa
    lost = 0.0
    now: list[Vec] = []
    for k, (px, py) in enumerate(wheels):
        wx = x + px * c - py * s
        wy = y + px * s + py * c
        now.append((wx, wy))
        st.mu[k] = terrain.mu(wx, wy, mu_base) if zone_friction else mu_base
        load = slope_cos
        if terrain.bumps:
            # Velocidad de la llanta en el mundo.
            ub, vb = u - r * py, v + r * px
            vwx, vwy = ub * c - vb * s, ub * s + vb * c
            over = terrain.bump_over(wx, wy)
            if over is not None:
                rigid = over.contact(abs(vwx * -over.uy + vwy * over.ux))
                load *= 1.0 - BUMP_CONTACT[0] * (1.0 - rigid)
                if rigid == 0.0:
                    st.fly_until[k] = t + over.flight_s
            elif t < st.fly_until[k]:
                load *= 1.0 - BUMP_CONTACT[0]
            if not first:
                for b in terrain.bumps:
                    if b.crosses(st.prev[k], (wx, wy)):
                        lost += BUMP_ENERGY[0] * G * shares[k] * b.height
        st.load[k] = load
    st.prev = now
    if lost <= 0.0 or ke <= 0.0:
        return 1.0
    return max(0.0, 1.0 - lost / ke)


# ---- frenado previo sobre terreno ----------------------------------------------------------------


@dataclass(frozen=True)
class TerrainProfile(SpeedProfile):
    """`SpeedProfile` con el frenado integrado sobre el terreno: desde `t_brake`, la velocidad sale
    de una tabla (distancia, velocidad, tiempo) en lugar de una desaceleración constante. `decel`
    conserva la nominal del lugar (la usan los agentes)."""

    ss: tuple[float, ...] = ()  # m desde el inicio del frenado
    vs: tuple[float, ...] = ()
    ts: tuple[float, ...] = ()  # s desde `t_brake`
    stops: bool = True

    def _at(self, tau: float) -> tuple[float, float]:
        """(distancia desde el inicio del frenado, velocidad) a `tau` s de empezar a frenar."""
        ts = self.ts
        if tau >= ts[-1]:
            extra = 0.0 if self.stops else self.vs[-1] * (tau - ts[-1])
            return (self.ss[-1] + extra, self.vs[-1])
        lo, hi = 0, len(ts) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if ts[mid] <= tau:
                lo = mid
            else:
                hi = mid
        span = ts[hi] - ts[lo]
        d = tau - ts[lo]
        acc = (self.vs[hi] - self.vs[lo]) / span if span > 0 else 0.0
        return (self.ss[lo] + self.vs[lo] * d + 0.5 * acc * d * d, self.vs[lo] + acc * d)

    def speed(self, t: float) -> float:
        if t <= self.t_brake:
            return self.v0
        return self._at(t - self.t_brake)[1]

    def distance(self, t: float) -> float:
        if t <= self.t_brake:
            return self.v0 * t
        return self.v0 * self.t_brake + self._at(t - self.t_brake)[0]

    @property
    def stop_time(self) -> float:
        return self.t_brake + self.ts[-1] if self.stops else math.inf

    def time_to_distance(self, s: float) -> float | None:
        if s <= 0:
            return 0.0
        if self.v0 <= 0:
            return None
        s_brake = self.v0 * self.t_brake
        if s <= s_brake:
            return s / self.v0
        rem = s - s_brake
        ss = self.ss
        if rem > ss[-1]:
            if self.stops or self.vs[-1] <= 0:
                return None
            return self.t_brake + self.ts[-1] + (rem - ss[-1]) / self.vs[-1]
        lo, hi = 0, len(ss) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if ss[mid] <= rem:
                lo = mid
            else:
                hi = mid
        span = self.ts[hi] - self.ts[lo]
        acc = (self.vs[hi] - self.vs[lo]) / span if span > 0 else 0.0
        ds = rem - ss[lo]
        v = self.vs[lo]
        if acc == 0.0:
            return self.t_brake + self.ts[lo] + (ds / v if v > 0 else 0.0)
        disc = max(0.0, v * v + 2.0 * acc * ds)
        return self.t_brake + self.ts[lo] + (math.sqrt(disc) - v) / acc


def brake_profile(
    path: Path,
    v0: float,
    s_brake: float,
    decel_nominal: float,
    terrain: Terrain,
    mu_base: float,
    abs_factor: float,
    grade_percent: float,
    cg_from_front: float,
    wheelbase: float,
) -> TerrainProfile:
    """El perfil de un vehículo que frena a fondo desde `s_brake` (m sobre `path`) con el terreno.

    En cada paso de `BRAKE_STEP_M`, d(v²)/ds = −2·g·(μ·k·cos α + sen α), con μ la de los dos ejes
    pesada por su carga y por su contacto, y α la pendiente entre ejes (más la `pendiente` del
    lugar). Al cruzar la línea de un tope, cada eje resta 2·η·g·(su fracción de carga)·h a v².
    """
    reverse = isinstance(path, ReversePath)
    a_front = cg_from_front
    b_rear = wheelbase - cg_from_front
    # El eje que va por delante en el sentido de marcha y el que va atrás: (distancia, carga).
    lead = (b_rear, a_front / wheelbase) if reverse else (a_front, b_rear / wheelbase)
    trail = (a_front, b_rear / wheelbase) if reverse else (b_rear, a_front / wheelbase)
    ss = [0.0]
    vs = [v0]
    ts = [0.0]
    v2 = v0 * v0
    v = v0
    t = 0.0
    fly = [-math.inf, -math.inf]  # hasta qué distancia sigue sin carga cada eje
    prev: list[Vec] = []
    stops = False
    for k in range(BRAKE_MAX_STEPS):
        s = s_brake + k * BRAKE_STEP_M
        p = path.pose(min(s, path.length))
        if s > path.length:
            over_s = s - path.length
            px = p.x + over_s * dmath.cos(p.heading) * (-1.0 if reverse else 1.0)
            py = p.y + over_s * dmath.sin(p.heading) * (-1.0 if reverse else 1.0)
        else:
            px, py = p.x, p.y
        hx, hy = dmath.cos(p.heading), dmath.sin(p.heading)
        tx, ty = (-hx, -hy) if reverse else (hx, hy)  # sentido de marcha
        axles = [
            (px + lead[0] * tx, py + lead[0] * ty),
            (px - trail[0] * tx, py - trail[0] * ty),
        ]
        slope = grade_percent / 100.0
        if terrain.has_height:
            slope += (
                terrain.height(axles[0][0], axles[0][1]) - terrain.height(axles[1][0], axles[1][1])
            ) / wheelbase
        alpha = dmath.atan(slope)
        grip = 0.0
        dropped = False
        for i, (q, share) in enumerate(zip(axles, (lead[1], trail[1]), strict=True)):
            contact = 1.0
            over = terrain.bump_over(q[0], q[1])
            if over is not None:
                rigid = over.contact(v * abs(tx * -over.uy + ty * over.ux))
                contact = 1.0 - BUMP_CONTACT[0] * (1.0 - rigid)
                if rigid == 0.0:
                    fly[i] = s + v * over.flight_s
            elif s < fly[i]:
                contact = 1.0 - BUMP_CONTACT[0]
            grip += share * terrain.mu(q[0], q[1], mu_base) * contact
            if prev:
                for b in terrain.bumps:
                    if b.crosses(prev[i], q):
                        v2 -= 2.0 * BUMP_ENERGY[0] * G * share * b.height
                        dropped = True
        prev = axles
        if v2 <= 0.0:
            stops = True
            vs[-1] = 0.0
            break
        if dropped:
            v = math.sqrt(v2)
            vs[-1] = v
        acc = G * (grip * abs_factor * dmath.cos(alpha) + dmath.sin(alpha))
        v2_next = v2 - 2.0 * acc * BRAKE_STEP_M
        if v2_next <= 0.0:
            ds = v2 / (2.0 * acc)
            t += 2.0 * ds / v
            ss.append(ss[-1] + ds)
            vs.append(0.0)
            ts.append(t)
            stops = True
            break
        v_next = math.sqrt(v2_next)
        t += 2.0 * BRAKE_STEP_M / (v + v_next)
        ss.append(ss[-1] + BRAKE_STEP_M)
        vs.append(v_next)
        ts.append(t)
        v2, v = v2_next, v_next
    if len(ss) == 1:
        # Se detuvo en el primer paso (un tope justo donde empieza a frenar): tabla mínima.
        ss.append(0.0)
        vs.append(0.0)
        ts.append(0.0)
    return TerrainProfile(v0, s_brake / v0, decel_nominal, tuple(ss), tuple(vs), tuple(ts), stops)


# ---- cruces de topes sobre una trayectoria ya calculada -----------------------------------------


def bump_crossings(
    terrain: Terrain,
    lead: float,
    ts: Sequence[float],
    xs: Sequence[float],
    ys: Sequence[float],
    yaws: Sequence[float],
    vxs: Sequence[float],
    vys: Sequence[float],
) -> list[tuple[str, float, float]]:
    """(tope, instante, velocidad en m/s) de la primera vez que el eje delantero cruza cada tope.

    `lead` es la distancia del centro al eje delantero. El instante se interpola entre muestras.
    """
    out: list[tuple[str, float, float]] = []
    for b in terrain.bumps:
        for i in range(1, len(ts)):
            p0 = (
                xs[i - 1] + lead * dmath.cos(yaws[i - 1]),
                ys[i - 1] + lead * dmath.sin(yaws[i - 1]),
            )
            p1 = (xs[i] + lead * dmath.cos(yaws[i]), ys[i] + lead * dmath.sin(yaws[i]))
            if p0 == p1 or not b.crosses(p0, p1):
                continue
            d0 = b.signed(p0[0], p0[1])
            d1 = b.signed(p1[0], p1[1])
            f = d0 / (d0 - d1)
            v0 = dmath.hypot(vxs[i - 1], vys[i - 1])
            v1 = dmath.hypot(vxs[i], vys[i])
            out.append((b.id, ts[i - 1] + f * (ts[i] - ts[i - 1]), v0 + f * (v1 - v0)))
            break
    return out


__all__ = [
    "BUMP_CONTACT",
    "BUMP_ENERGY",
    "TERRAIN_STRIDE",
    "Bump",
    "ReliefMesh",
    "Terrain",
    "TerrainProfile",
    "WheelContact",
    "brake_profile",
    "bump_crossings",
    "pose_on",
    "read_contact",
    "relief_missing",
    "slopes",
]
