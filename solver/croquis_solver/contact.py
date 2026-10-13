"""Geometría del contacto: dónde toca cada vehículo en el instante del impacto.

La zona CDC (SAE J224) de cada vehículo define un punto de contacto en su marco (x adelante,
y a la izquierda): el lado fija la cara y la zona horizontal la posición a lo largo de esa cara
(tercios para L/C/R y F/P/B; sextos para Y/Z). Cada vehículo en movimiento puede ubicar ese punto
en cualquier lugar de su trayectoria (un "lugar geométrico"); uno detenido, en un solo punto.
El punto de impacto común se obtiene con proyecciones alternadas entre los lugares geométricos,
partiendo del punto declarado, y para dos cuerpos se refina con Levenberg-Marquardt sobre sus dos
parámetros (las proyecciones alternadas convergen lento si los lugares se cruzan en ángulo bajo,
como en un cambio de carril). Resultado: su intersección si existe y, si no, los puntos más
cercanos (vehículos en la misma línea). Así ningún vehículo se encima en t = 0.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from croquis_solver.models import Vec, rot

COARSE_SAMPLES = 800
LOCAL_SAMPLES = 40
LOCAL_WINDOW_M = 10.0
REFINE_ITERATIONS = 50
ALTERNATING_ITERATIONS = 12
LM_ITERATIONS = 100

# Posición a lo largo de la cara como fracción de su longitud (positivo = izquierda o adelante).
_ALONG_FRONT_BACK = {"L": 1 / 3, "C": 0.0, "R": -1 / 3, "Y": 1 / 6, "Z": -1 / 6, "D": 0.0}
_ALONG_SIDE = {"F": 1 / 3, "P": 0.0, "B": -1 / 3, "Y": 1 / 6, "Z": -1 / 6, "D": 0.0}


def contact_offset(
    cdc: Mapping[str, Any] | None, length: float, width: float, *, standoff: float = 0.0
) -> Vec:
    """Punto de contacto en el marco del vehículo para una zona CDC.

    `standoff` aleja el punto de la cara hacia afuera (por ejemplo, el radio de un poste).
    Sin zona declarada se asume el centro del frente.
    """
    lado = str((cdc or {}).get("lado", "F"))
    zona = str((cdc or {}).get("zona_horizontal", "D"))
    if lado in {"F", "B"} or lado not in {"L", "R"}:
        sign = -1.0 if lado == "B" else 1.0
        y = _ALONG_FRONT_BACK.get(zona, 0.0) * width
        return (sign * (length / 2 + standoff), y)
    sign = 1.0 if lado == "L" else -1.0
    x = _ALONG_SIDE.get(zona, 0.0) * length
    return (x, sign * (width / 2 + standoff))


@dataclass(frozen=True)
class Locus:
    """Lugar geométrico del punto de contacto de un cuerpo.

    `pose(s)` devuelve (x, y, rumbo) del centro de masa para el parámetro s ∈ [0, s_max].
    Un cuerpo inmóvil usa s_max = 0.
    """

    pose: Callable[[float], tuple[float, float, float]]
    offset: Vec
    s_max: float

    def point(self, s: float) -> Vec:
        x, y, yaw = self.pose(s)
        o = rot(self.offset, yaw)
        return (x + o[0], y + o[1])

    def project(self, target: Vec, hint: float | None = None) -> tuple[float, Vec]:
        """Parámetro s cuyo punto de contacto está más cerca de `target` y ese punto.

        Sin `hint` barre todo el tramo; con `hint` busca solo alrededor (arranque en caliente).
        """
        if self.s_max <= 0:
            return 0.0, self.point(0.0)

        def d2(s: float) -> float:
            p = self.point(s)
            return (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2

        if hint is None:
            start, span, n = 0.0, self.s_max, COARSE_SAMPLES
        else:
            start = max(0.0, hint - LOCAL_WINDOW_M)
            span = min(self.s_max, hint + LOCAL_WINDOW_M) - start
            n = LOCAL_SAMPLES
        step = span / n
        best_i = min(range(n + 1), key=lambda i: d2(start + i * step))
        lo = max(0.0, start + (best_i - 1) * step)
        hi = min(self.s_max, start + (best_i + 1) * step)
        inv_phi = (math.sqrt(5.0) - 1.0) / 2.0
        a, b = lo, hi
        c = b - inv_phi * (b - a)
        d = a + inv_phi * (b - a)
        fc, fd = d2(c), d2(d)
        for _ in range(REFINE_ITERATIONS):
            if fc < fd:
                b, d, fd = d, c, fc
                c = b - inv_phi * (b - a)
                fc = d2(c)
            else:
                a, c, fc = c, d, fd
                d = a + inv_phi * (b - a)
                fd = d2(d)
        s = (a + b) / 2.0
        candidates = [(d2(x), x) for x in (lo, s, hi)]
        s = min(candidates)[1]
        return s, self.point(s)


@dataclass(frozen=True)
class ContactSolution:
    point: Vec  # punto de impacto común
    params: tuple[float, ...]  # parámetro s de cada lugar geométrico
    gap: float  # distancia entre los puntos de contacto de los cuerpos (0 si se tocan)


def resolve_contact(loci: list[Locus], declared: Vec) -> ContactSolution:
    """Punto de impacto común para uno o más lugares geométricos (proyecciones alternadas)."""
    if not loci:
        msg = "Se necesita al menos un cuerpo"
        raise ValueError(msg)
    p = declared
    params = [0.0] * len(loci)
    points = [declared] * len(loci)
    for it in range(ALTERNATING_ITERATIONS):
        for i, locus in enumerate(loci):
            params[i], points[i] = locus.project(p, None if it == 0 else params[i])
            p = points[i]
    if len(loci) == 2:
        params[0], params[1] = _refine_pair(loci[0], loci[1], params[0], params[1])
        points = [loci[0].point(params[0]), loci[1].point(params[1])]
    cx = sum(q[0] for q in points) / len(points)
    cy = sum(q[1] for q in points) / len(points)
    gap = max(math.hypot(q[0] - points[0][0], q[1] - points[0][1]) for q in points)
    return ContactSolution((cx, cy), tuple(params), gap)


def _derivative(locus: Locus, s: float) -> Vec:
    if locus.s_max <= 0:
        return (0.0, 0.0)
    h = 1e-4
    a, b = max(0.0, s - h), min(locus.s_max, s + h)
    pa, pb = locus.point(a), locus.point(b)
    return ((pb[0] - pa[0]) / (b - a), (pb[1] - pa[1]) / (b - a))


def _refine_pair(la: Locus, lb: Locus, sa: float, sb: float) -> tuple[float, float]:
    """Minimiza |c_a(s_a) − c_b(s_b)|² con Levenberg-Marquardt (parámetros acotados)."""

    def cost(x: float, y: float) -> float:
        pa, pb = la.point(x), lb.point(y)
        return (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2

    lam = 1e-3
    current = cost(sa, sb)
    for _ in range(LM_ITERATIONS):
        if current < 1e-16:
            break
        pa, pb = la.point(sa), lb.point(sb)
        r = (pa[0] - pb[0], pa[1] - pb[1])
        da, db = _derivative(la, sa), _derivative(lb, sb)
        a11 = da[0] * da[0] + da[1] * da[1] + lam
        a22 = db[0] * db[0] + db[1] * db[1] + lam
        a12 = -(da[0] * db[0] + da[1] * db[1])
        g1 = da[0] * r[0] + da[1] * r[1]
        g2 = -(db[0] * r[0] + db[1] * r[1])
        det = a11 * a22 - a12 * a12
        if det <= 0:
            lam *= 10.0
            continue
        dx = (-g1 * a22 + g2 * a12) / det
        dy = (-g2 * a11 + g1 * a12) / det
        nx = min(max(sa + dx, 0.0), la.s_max)
        ny = min(max(sb + dy, 0.0), lb.s_max)
        trial = cost(nx, ny)
        if trial < current:
            sa, sb, current = nx, ny, trial
            lam = max(lam / 10.0, 1e-12)
        else:
            lam *= 10.0
            if lam > 1e12:
                break
    return sa, sb
