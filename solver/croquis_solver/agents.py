"""Los conductores como agentes (R12a, ADR 0088): percibir → decidir → actuar antes del impacto.

La simulación empieza donde empieza la reconstrucción (t = −t_pre), con cada vehículo sobre su
misma trayectoria y a su misma velocidad, y avanza con paso fijo hasta que dos vehículos se tocan
o hasta `HORIZON_AFTER_S` después del impacto reconstruido.

* **Percibir:** con el estado del inicio del paso (todos perciben lo mismo y actúan a la vez; el
  orden por id no cambia nada), cada conductor busca al vehículo de adelante (el más cercano en su
  sentido de marcha cuyo ancho se traslapa con el suyo) y lo ve si la línea de vista no la tapa
  nada y está dentro de la visibilidad del clima (`visibility.py`). Las luces de freno se ven.
* **Decidir:** lo que diga el perito (`conductor.decision` en `conductor.instante_decision`); si no,
  lo que reconstruyó la evidencia (frenar donde frena la reconstrucción); si tampoco, reaccionar:
  frenar cuando pasa su tiempo de reacción desde que vio frenar al de adelante.
* **Actuar:** frenar con la desaceleración de la reconstrucción (fricción, ABS, pendiente);
  volantear un carril con la aceleración lateral que da la fricción (μ·g), la mitad acelerando y
  la mitad frenando el movimiento lateral; seguir a la misma velocidad.

La posición de cada agente es cerrada por tramos (crucero, frenado, volantazo), con las mismas
fórmulas que `SpeedProfile`: con las decisiones de la reconstrucción, los agentes reproducen su
cinemática. El contacto se busca en cada paso entre los rectángulos de los vehículos y se afina
por bisección.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from croquis_solver import dmath, friction, visibility
from croquis_solver.inversion import distribution
from croquis_solver.models import G
from croquis_solver.preimpact import travel_heading
from croquis_solver.reconstruct import (
    PlanPrevio,
    Reconstruction,
    _pose_at,  # pyright: ignore[reportPrivateUsage]
    _r,  # pyright: ignore[reportPrivateUsage]
)

JsonObj = dict[str, Any]

DT = 0.02  # s, el paso de la reconstrucción
HORIZON_AFTER_S = 3.0  # s después del impacto reconstruido
BISECTION_STEPS = 30
SENSITIVITY_SAMPLES = 64
DECISIONES = ("frenar", "volantear_izquierda", "volantear_derecha", "seguir")
_TIME = {"s": 1.0, "ms": 0.001, "min": 60.0}

Rect = list[tuple[float, float]]
Estado = tuple[float, float, float, float, float]  # x, y, rumbo del cuerpo, vx, vy


@dataclass
class Decision:
    tipo: str
    t: float
    origen: str  # "perito" | "reconstruccion" | "reaccion"
    ante: str | None = None
    percibio_t: float | None = None


@dataclass
class Agent:
    plan: PlanPrevio
    t0: float
    s0: float
    v0: float
    lights: bool
    decision: Decision | None = None
    # Lo que dijo el perito sin instante: se ejecuta en el instante de la evidencia o al reaccionar.
    pending: str | None = None

    @property
    def id(self) -> str:
        return self.plan.id

    def braking(self, t: float) -> bool:
        d = self.decision
        return d is not None and d.tipo == "frenar" and t >= d.t and self.v0 > 0

    def longitudinal(self, t: float) -> tuple[float, float]:
        """(s, v) en t: crucero a v0 y, si frena, desaceleración constante hasta parar."""
        d = self.decision
        if d is None or d.tipo != "frenar" or t <= d.t or self.plan.decel <= 0:
            return self.s0 + self.v0 * (t - self.t0), self.v0
        t_on = max(d.t, self.t0)
        s_on = self.s0 + self.v0 * (t_on - self.t0)
        tau = t - t_on
        t_stop = self.v0 / self.plan.decel
        tc = min(tau, t_stop)
        return s_on + self.v0 * tc - 0.5 * self.plan.decel * tc * tc, max(
            self.v0 - self.plan.decel * tau, 0.0
        )

    def lateral(self, t: float) -> tuple[float, float]:
        """(d, w): desplazamiento a la izquierda del sentido de marcha y su velocidad."""
        d = self.decision
        if d is None or not d.tipo.startswith("volantear") or t <= d.t:
            return 0.0, 0.0
        sign = 1.0 if d.tipo == "volantear_izquierda" else -1.0
        span = self.plan.lane_width
        a = self.plan.mu * G
        half = math.sqrt(span / a)  # cubre la mitad del carril acelerando: span/2 = a·T²/2
        tau = t - max(d.t, self.t0)
        if tau <= half:
            return sign * 0.5 * a * tau * tau, sign * a * tau
        if tau <= 2 * half:
            u = tau - half
            return sign * (0.5 * span + a * half * u - 0.5 * a * u * u), sign * (a * half - a * u)
        return sign * span, 0.0

    def state(self, t: float) -> Estado:
        """(x, y, rumbo del cuerpo, vx, vy) en t."""
        s, v = self.longitudinal(t)
        d, w = self.lateral(t)
        x, y, yaw, _ = _pose_at(self.plan.path, s)
        h = travel_heading(self.plan.path, yaw)
        nx, ny = -dmath.sin(h), dmath.cos(h)
        steer = dmath.atan2(w, v) if v > 0 else 0.0
        return (
            x + nx * d,
            y + ny * d,
            yaw + steer,
            v * dmath.cos(h) + w * nx,
            v * dmath.sin(h) + w * ny,
        )


@dataclass
class Contacto:
    t: float
    vehiculos: tuple[str, str]
    velocidades_kmh: dict[str, float]
    velocidad_relativa_kmh: float


@dataclass
class Simulacion:
    decisiones: dict[str, Decision | None]
    contacto: Contacto | None
    distancia_minima_m: float


@dataclass
class AgentsResult:
    simulacion: Simulacion
    linea_base: Simulacion
    reaccion: dict[str, tuple[float, tuple[float, float], str]]
    t_inicio: float
    t_fin: float
    semilla: int
    sensibilidad: JsonObj | None = None
    supuestos: list[str] = field(default_factory=lambda: list[str]())

    def to_dict(self) -> JsonObj:
        out: JsonObj = {
            "dt": DT,
            "t_inicio": _r(self.t_inicio),
            "t_fin": _r(self.t_fin),
            "conductores": [
                _conductor_doc(vid, self.reaccion[vid], self.simulacion.decisiones[vid])
                for vid in sorted(self.simulacion.decisiones)
            ],
            "resultado": _sim_doc(self.simulacion),
            "linea_base": _sim_doc(self.linea_base),
        }
        if self.sensibilidad is not None:
            out["sensibilidad"] = self.sensibilidad
        if self.supuestos:
            out["supuestos"] = self.supuestos
        return out


def _conductor_doc(
    vid: str, reaccion: tuple[float, tuple[float, float], str], d: Decision | None
) -> JsonObj:
    out: JsonObj = {
        "vehiculo": vid,
        "tiempo_reaccion_s": {
            "valor": _r(reaccion[0]),
            "rango": [_r(reaccion[1][0]), _r(reaccion[1][1])],
            "fuente": reaccion[2],
        },
    }
    if d is not None:
        dec: JsonObj = {"tipo": d.tipo, "t": _r(d.t), "origen": d.origen}
        if d.ante is not None:
            dec["ante"] = d.ante
        if d.percibio_t is not None:
            dec["percibio_t"] = _r(d.percibio_t)
        out["decision"] = dec
    return out


def _sim_doc(sim: Simulacion) -> JsonObj:
    if sim.contacto is None:
        return {"contacto": False, "distancia_minima_m": _r(sim.distancia_minima_m)}
    c = sim.contacto
    return {
        "contacto": True,
        "t": _r(c.t),
        "vehiculos": list(c.vehiculos),
        "velocidades_kmh": [
            {"vehiculo": k, "valor": _r(v)} for k, v in sorted(c.velocidades_kmh.items())
        ],
        "velocidad_relativa_kmh": _r(c.velocidad_relativa_kmh),
    }


# ---- geometría ----------------------------------------------------------------------------------


def _rect(x: float, y: float, yaw: float, length: float, width: float) -> Rect:
    c, s = dmath.cos(yaw), dmath.sin(yaw)
    out: Rect = []
    for fx, fy in ((0.5, 0.5), (-0.5, 0.5), (-0.5, -0.5), (0.5, -0.5)):
        lx, ly = fx * length, fy * width
        out.append((x + c * lx - s * ly, y + s * lx + c * ly))
    return out


def _overlap(a: Rect, b: Rect) -> bool:
    """Teorema del eje separador para dos rectángulos (se tocan o se traslapan)."""
    for poly in (a, b):
        for i in range(4):
            p, q = poly[i], poly[(i + 1) % 4]
            ax, ay = q[1] - p[1], p[0] - q[0]
            pa = [ax * u[0] + ay * u[1] for u in a]
            pb = [ax * u[0] + ay * u[1] for u in b]
            if max(pa) < min(pb) or max(pb) < min(pa):
                return False
    return True


def _point_segment(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    den = dx * dx + dy * dy
    u = 0.0 if den == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den))
    return dmath.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy))


def _distance(a: Rect, b: Rect) -> float:
    if _overlap(a, b):
        return 0.0
    best = math.inf
    for poly, other in ((a, b), (b, a)):
        for p in poly:
            for i in range(4):
                best = min(best, _point_segment(p, other[i], other[(i + 1) % 4]))
    return best


# ---- simulación ---------------------------------------------------------------------------------


def _seconds(f: JsonObj | None) -> float | None:
    if not f or "valor" not in f:
        return None
    return float(f["valor"]) * _TIME.get(str(f.get("unidad", "s")), 1.0)


def _seconds_range(f: JsonObj | None) -> tuple[float, float] | None:
    if not f or not f.get("rango"):
        return None
    k = _TIME.get(str(f.get("unidad", "s")), 1.0)
    lo, hi = f["rango"]
    return float(lo) * k, float(hi) * k


def has_drivers(spec: JsonObj) -> bool:
    """Si algún vehículo trae `conductor`: solo entonces se simulan los agentes."""
    return any("conductor" in v for v in spec["vehiculos"])


def _leader(me: Agent, states: dict[str, Estado], by_id: dict[str, Agent]) -> str | None:
    """El vehículo de adelante: el más cercano en el sentido de marcha cuyo ancho se traslapa."""
    x, y, yaw, vx, vy = states[me.id]
    h = dmath.atan2(vy, vx)
    c, sn = dmath.cos(h), dmath.sin(h)
    best: tuple[float, str] | None = None
    for oid in sorted(states):
        if oid == me.id:
            continue
        ox, oy = states[oid][0] - x, states[oid][1] - y
        ahead, side = c * ox + sn * oy, -sn * ox + c * oy
        if (
            ahead > 0
            and abs(side) < 0.5 * (me.plan.width + by_id[oid].plan.width)
            and (best is None or ahead < best[0])
        ):
            best = (ahead, oid)
    del yaw
    return best[1] if best else None


Ve = Callable[[Agent, Agent, float, dict[str, Estado]], bool]


def _simulate(
    agents: list[Agent],
    t_end: float,
    sees: Ve,
    reaction: dict[str, float],
) -> Simulacion:
    by_id = {a.id: a for a in agents}
    t0 = agents[0].t0
    n = math.ceil((t_end - t0) / DT - 1e-9)
    min_gap = math.inf

    def rects(t: float) -> dict[str, Rect]:
        out: dict[str, Rect] = {}
        for a in agents:
            x, y, yaw, _, _ = a.state(t)
            out[a.id] = _rect(x, y, yaw, a.plan.length, a.plan.width)
        return out

    def touching(t: float) -> tuple[str, str] | None:
        rs = rects(t)
        ids = sorted(rs)
        for i, a in enumerate(ids):
            for b in ids[i + 1 :]:
                if _overlap(rs[a], rs[b]):
                    return a, b
        return None

    prev_t = t0
    for k in range(n + 1):
        t = t0 + k * DT
        # Percibir y decidir con el estado del inicio del paso.
        states = {a.id: a.state(t) for a in agents}
        for a in agents:
            if a.decision is not None or a.v0 <= 0:
                continue
            lead = _leader(a, states, by_id)
            if lead is None or not by_id[lead].braking(t) or not sees(a, by_id[lead], t, states):
                continue
            a.decision = Decision(
                a.pending or "frenar", t + reaction[a.id], "reaccion", ante=lead, percibio_t=t
            )
        # Actuar ya está en la posición cerrada de cada agente: se busca el contacto en t.
        pair = touching(t)
        if pair is not None:
            lo, hi = prev_t, t
            if k == 0:
                lo = hi
            for _ in range(BISECTION_STEPS):
                if hi - lo <= 1e-9:
                    break
                mid = 0.5 * (lo + hi)
                if touching(mid) is not None:
                    hi = mid
                else:
                    lo = mid
            pair = touching(hi) or pair
            sa, sb = by_id[pair[0]].state(hi), by_id[pair[1]].state(hi)
            speeds = {
                pair[0]: 3.6 * dmath.hypot(sa[3], sa[4]),
                pair[1]: 3.6 * dmath.hypot(sb[3], sb[4]),
            }
            rel = 3.6 * dmath.hypot(sa[3] - sb[3], sa[4] - sb[4])
            return Simulacion(
                {a.id: a.decision for a in agents}, Contacto(hi, pair, speeds, rel), 0.0
            )
        rs = rects(t)
        ids = sorted(rs)
        for i, a in enumerate(ids):
            for b in ids[i + 1 :]:
                if by_id[a].v0 > 0 or by_id[b].v0 > 0:
                    min_gap = min(min_gap, _distance(rs[a], rs[b]))
        prev_t = t
    return Simulacion({a.id: a.decision for a in agents}, None, min_gap)


def _make_agents(spec: JsonObj, rec: Reconstruction, *, with_drivers: bool) -> list[Agent]:
    by_spec = {v["id"]: v for v in spec["vehiculos"]}
    t0 = rec.t_inicio
    agents: list[Agent] = []
    for vid in sorted(rec.previa):
        plan = rec.previa[vid]
        prof = plan.profile
        tau = t0 - plan.t_ref
        s0 = prof.distance(tau) if tau >= 0 else prof.v0 * tau
        v = by_spec[vid]
        luces = v.get("luces_encendidas")
        agent = Agent(
            plan=plan,
            t0=t0,
            s0=s0,
            v0=prof.v0,
            lights=bool(luces["valor"]) if luces and "valor" in luces else True,
        )
        evidence: Decision | None = None
        if prof.v0 > 0 and prof.decel > 0 and not math.isinf(prof.t_brake):
            evidence = Decision("frenar", plan.t_ref + prof.t_brake, "reconstruccion")
        c = v.get("conductor") if with_drivers else None
        dec = (c or {}).get("decision")
        t_dec = _seconds((c or {}).get("instante_decision"))
        if dec and t_dec is not None:
            agent.decision = Decision(str(dec["valor"]), t_dec, "perito")
        elif dec and evidence is not None:
            agent.decision = Decision(str(dec["valor"]), evidence.t, "perito")
        elif dec:
            agent.pending = str(dec["valor"])
        else:
            agent.decision = evidence
        agents.append(agent)
    return agents


def simulate_drivers(spec: JsonObj, rec: Reconstruction) -> AgentsResult | None:
    """Los conductores como agentes, o None si ningún vehículo trae `conductor`."""
    if not has_drivers(spec) or not rec.previa:
        return None
    nominal = friction.perception_reaction_time()
    reaction: dict[str, tuple[float, tuple[float, float], str]] = {}
    for v in spec["vehiculos"]:
        tr = (v.get("conductor") or {}).get("tiempo_reaccion")
        val = _seconds(tr)
        if val is None:
            reaction[v["id"]] = (
                nominal.nominal,
                (nominal.low, nominal.high),
                "supuesto: percepción-reacción típica (friction.json: Olson y Sivak 1986; Green 2000)",
            )
        else:
            rng = _seconds_range(tr) or (val, val)
            reaction[v["id"]] = (val, rng, str(tr.get("fuente", "perito")))

    env = spec["entorno"]
    night_unlit = env["iluminacion"]["valor"] == "noche_sin_alumbrado"
    met = env.get("visibilidad")
    met_m: float | None = None
    if met and "valor" in met:
        met_m = float(met["valor"]) * {"m": 1.0, "km": 1000.0}.get(str(met.get("unidad", "m")), 1.0)
    static = [o for ob in rec.objetos for o in visibility.object_occluders(ob)]

    def sees(a: Agent, lead: Agent, t: float, states: dict[str, Estado]) -> bool:
        me, other = states[a.id], states[lead.id]
        obs = visibility.Observer(
            a.id, a.plan.clase, [(me[0], me[1], me[2])], a.plan.length, a.plan.width, a.lights
        )
        # Las luces de freno se ven aunque las demás luces vayan apagadas.
        tgt = visibility.Actor(
            lead.id,
            "vehiculo",
            [(other[0], other[1], other[2])],
            lead.plan.length,
            lead.plan.width,
            lead.plan.height,
            True,
        )
        movers = [
            visibility.Actor(
                oid,
                "vehiculo",
                [(states[oid][0], states[oid][1], states[oid][2])],
                rec.previa[oid].length,
                rec.previa[oid].width,
                rec.previa[oid].height,
            )
            for oid in sorted(states)
            if oid not in (a.id, lead.id)
        ]
        res = visibility.analyze_pair(
            obs, tgt, static, movers, [t], night_unlit=night_unlit, met_visibility_m=met_m
        )
        return bool(res.visible and res.visible[0])

    t_end = HORIZON_AFTER_S
    nominal_rt = {k: v[0] for k, v in reaction.items()}
    agents = _make_agents(spec, rec, with_drivers=True)
    sim = _simulate(agents, t_end, sees, nominal_rt)
    base = _simulate(_make_agents(spec, rec, with_drivers=False), t_end, sees, nominal_rt)

    # Sensibilidad al tiempo de reacción de los que reaccionan (con la semilla de la escena).
    reactive = sorted(
        vid for vid, d in sim.decisiones.items() if d is not None and d.origen == "reaccion"
    )
    sens: JsonObj | None = None
    if reactive:
        rng = dmath.Random(rec.semilla)
        rel: list[float] = []
        sin_contacto = 0
        for _ in range(SENSITIVITY_SAMPLES):
            rt = dict(nominal_rt)
            for vid in reactive:
                lo, hi = reaction[vid][1]
                rt[vid] = rng.uniform(lo, hi)
            s = _simulate(_make_agents(spec, rec, with_drivers=True), t_end, sees, rt)
            if s.contacto is None:
                sin_contacto += 1
            else:
                rel.append(s.contacto.velocidad_relativa_kmh)
        sens = {
            "muestras": SENSITIVITY_SAMPLES,
            "semilla": rec.semilla,
            "vehiculos": reactive,
            "sin_contacto": sin_contacto,
        }
        if rel:
            dist = distribution(rel)
            sens["velocidad_relativa_kmh"] = {
                "p10": _r(dist.p10),
                "p50": _r(dist.p50),
                "p90": _r(dist.p90),
            }

    supuestos = [
        "Los conductores ven el estado del inicio de cada paso y actúan a la vez.",
        "Frenar usa la desaceleración de la reconstrucción; volantear desplaza un carril con μ·g.",
    ]
    return AgentsResult(
        simulacion=sim,
        linea_base=base,
        reaccion=reaction,
        t_inicio=rec.t_inicio,
        t_fin=t_end,
        semilla=rec.semilla,
        sensibilidad=sens,
        supuestos=supuestos,
    )


__all__ = ["DECISIONES", "AgentsResult", "has_drivers", "simulate_drivers"]
