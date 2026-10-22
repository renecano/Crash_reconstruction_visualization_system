"""Cinemática de ocupantes relativa al habitáculo (PLAN §6.1.8).

El ocupante sigue moviéndose cuando el vehículo cambia de velocidad: respecto al habitáculo se
desplaza hacia el punto de impacto (opuesto a la aceleración del vehículo). Se modela como una
masa puntual en el plano del vehículo (x adelante, y a la izquierda):

* **Pulso de choque.** Media onda senoidal a(t) = A sin(π t / T) en [0, T], con ∫a dt = ΔV, es
  decir A = π ΔV / (2T). La duración sale del aplastamiento: si el vehículo pierde ΔV contra una
  barrera equivalente, su desplazamiento durante el pulso senoidal es ΔV·T/2 = C, así que
  T = 2C/ΔV, acotada a [T_MIN, T_MAX] (los pulsos de choque frontal duran del orden de 0.1 s).
  La dirección es la de la fuerza principal (PDOF).
* **Sin cinturón.** Vuelo libre hasta recorrer el espacio de vuelo del modelo de Michie (1981,
  TRR 796; usado en MASH de AASHTO): 0.6 m en sentido longitudinal y 0.3 m en lateral. Se
  reporta el instante y la velocidad relativa al tocar el interior (cinemática, no lesión).
* **Con cinturón.** El cinturón de tres puntos actúa en sentido longitudinal hacia adelante: no
  hace fuerza hasta recorrer la holgura y después se comporta como resorte amortiguado (frecuencia
  natural y amortiguamiento supuestos, con rango). En sentido lateral el torso queda casi libre,
  así que la puerta del lado cercano se alcanza igual que sin cinturón.
* **Hacia atrás.** El respaldo detiene al torso casi de inmediato; la cabeza recorre la distancia
  a la cabecera.

No se estima ninguna lesión (PLAN §10 y §16.2): solo hacia dónde se mueve la persona, cuánto y
qué parte del interior alcanza. Todas las constantes son supuestos documentados en
docs/physics.md y se reportan en los parámetros del resultado.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from croquis_solver import dmath
from croquis_solver.models import G

T_MIN = 0.06  # s
T_MAX = 0.20  # s
FLAIL_LONGITUDINAL_M = 0.6  # Michie 1981 / MASH
FLAIL_LATERAL_M = 0.3  # Michie 1981 / MASH
HEADREST_GAP_M = 0.08  # distancia cabeza–cabecera (supuesto)
BELT_SLACK_M = 0.05  # supuesto; rango 0.02–0.10 (100 mm se estudia como holgura excesiva)
BELT_NATURAL_FREQ_HZ = 8.0  # supuesto; rango 6–10 Hz
BELT_DAMPING_RATIO = 0.3  # supuesto
SIM_DT = 0.0005  # s
OUTPUT_DT = 0.005  # s
OUTPUT_SPAN_S = 0.5  # s
MIN_DELTA_V = 0.3  # m/s: debajo de esto no se modela movimiento del ocupante

SEATS_LEFT = frozenset({"conductor", "trasero_izquierdo"})
SEATS_RIGHT = frozenset({"copiloto", "trasero_derecho"})
SEATS_REAR = frozenset({"trasero_izquierdo", "trasero_centro", "trasero_derecho", "tercera_fila"})


def _floats() -> list[float]:
    return []


@dataclass(frozen=True)
class CrashPulse:
    duration_s: float
    delta_v: float  # m/s
    # Dirección hacia la que se mueve el ocupante respecto al habitáculo (unitaria, marco del
    # vehículo: x adelante, y izquierda). La aceleración del vehículo apunta al revés.
    toward: tuple[float, float]

    @property
    def peak_accel(self) -> float:
        return math.pi * self.delta_v / (2.0 * self.duration_s)

    def accel(self, t: float) -> float:
        """Magnitud de la aceleración del vehículo en t (m/s²)."""
        if t < 0 or t > self.duration_s:
            return 0.0
        return self.peak_accel * dmath.sin(math.pi * t / self.duration_s)

    def velocity_change(self, t: float) -> float:
        """ΔV acumulado hasta t (m/s)."""
        tt = min(max(t, 0.0), self.duration_s)
        return 0.5 * self.delta_v * (1.0 - dmath.cos(math.pi * tt / self.duration_s))


def direction_from_pdof(pdof_hours: float) -> tuple[float, float]:
    """Dirección del movimiento del ocupante para una PDOF en horas de reloj.

    La PDOF indica de dónde viene la fuerza principal (12 = de frente, 3 = del lado derecho).
    El ocupante se mueve hacia ese lado: a las 12, hacia adelante; a las 3, hacia la derecha.
    """
    phi = math.radians(30.0 * pdof_hours)  # en sentido horario desde el frente
    return (dmath.cos(phi), -dmath.sin(phi))


def pulse_for(delta_v: float, crush_max_m: float, pdof_hours: float) -> CrashPulse | None:
    """Pulso de media onda senoidal con duración T = 2C/ΔV acotada; None si ΔV es mínimo."""
    if delta_v < MIN_DELTA_V:
        return None
    t = 2.0 * max(crush_max_m, 0.0) / delta_v
    t = min(T_MAX, max(T_MIN, t))
    return CrashPulse(t, delta_v, direction_from_pdof(pdof_hours))


@dataclass(frozen=True)
class Contact:
    zona: str
    t_s: float
    relative_speed: float  # m/s


@dataclass
class OccupantMotion:
    belted: bool
    t: list[float] = field(default_factory=_floats)
    dx: list[float] = field(default_factory=_floats)
    dy: list[float] = field(default_factory=_floats)
    contact: Contact | None = None

    @property
    def max_displacement(self) -> float:
        return max((dmath.hypot(a, b) for a, b in zip(self.dx, self.dy, strict=True)), default=0.0)


def _zone(seat: str, axis: str, sign: float) -> str:
    if axis == "x" and sign > 0:
        if seat == "conductor":
            return "volante y tablero"
        if seat == "copiloto":
            return "tablero"
        if seat in SEATS_REAR:
            return "respaldo del asiento de adelante"
        return "interior de adelante"
    if axis == "x":
        return "respaldo y cabecera"
    # Lateral: sign > 0 es hacia la izquierda.
    left = sign > 0
    if (left and seat in SEATS_LEFT) or (not left and seat in SEATS_RIGHT):
        return f"puerta y ventana del lado {'izquierdo' if left else 'derecho'}"
    if seat in SEATS_LEFT or seat in SEATS_RIGHT:
        return "consola central o asiento contiguo"
    return f"asiento contiguo del lado {'izquierdo' if left else 'derecho'}"


def simulate(
    pulse: CrashPulse,
    seat: str,
    belted: bool,
    *,
    belt_slack_m: float = BELT_SLACK_M,
    belt_freq_hz: float = BELT_NATURAL_FREQ_HZ,
    belt_damping: float = BELT_DAMPING_RATIO,
) -> OccupantMotion:
    """Integra el movimiento relativo del ocupante (paso fijo, determinista)."""
    out = OccupantMotion(belted)
    ux, uy = pulse.toward
    x = y = vx = vy = 0.0
    omega = 2.0 * math.pi * belt_freq_hz
    t = 0.0
    contact: Contact | None = None
    seat_back = ux < 0  # hacia atrás: el respaldo sostiene
    n_out = round(OUTPUT_SPAN_S / OUTPUT_DT)
    steps_per_out = round(OUTPUT_DT / SIM_DT)
    for k in range(n_out * steps_per_out + 1):
        if k % steps_per_out == 0:
            out.t.append(round(t, 9))
            out.dx.append(x)
            out.dy.append(y)
        if contact is None:
            a = pulse.accel(t)
            # Aceleración relativa: el habitáculo frena, el ocupante sigue (pseudofuerza).
            ax, ay = a * ux, a * uy
            if belted and x > belt_slack_m:
                stretch = x - belt_slack_m
                ax -= omega * omega * stretch + 2.0 * belt_damping * omega * vx
            vx += ax * SIM_DT
            vy += ay * SIM_DT
            x += vx * SIM_DT
            y += vy * SIM_DT
            hit: tuple[str, float, float] | None = None
            if seat_back and x <= -HEADREST_GAP_M:
                x = -HEADREST_GAP_M
                hit = ("x", -1.0, abs(vx))
            elif x >= FLAIL_LONGITUDINAL_M:
                x = FLAIL_LONGITUDINAL_M
                hit = ("x", 1.0, abs(vx))
            elif abs(y) >= FLAIL_LATERAL_M:
                y = math.copysign(FLAIL_LATERAL_M, y)
                hit = ("y", math.copysign(1.0, y), abs(vy))
            if hit is not None:
                contact = Contact(_zone(seat, hit[0], hit[1]), t + SIM_DT, hit[2])
                vx = vy = 0.0  # desde el contacto se mueve con el habitáculo
            elif not seat_back and x < 0.0:
                # De regreso (rebote del cinturón) el respaldo detiene al torso.
                x = 0.0
                vx = max(vx, 0.0)
        t += SIM_DT
    out.contact = contact
    return out


def occupant_motions(pulse: CrashPulse, seat: str, belted: bool | None) -> list[OccupantMotion]:
    """Movimiento con el cinturón declarado; si no se declaró, las dos variantes."""
    if belted is None:
        return [simulate(pulse, seat, True), simulate(pulse, seat, False)]
    return [simulate(pulse, seat, belted)]


def peak_g(pulse: CrashPulse) -> float:
    return pulse.peak_accel / G
