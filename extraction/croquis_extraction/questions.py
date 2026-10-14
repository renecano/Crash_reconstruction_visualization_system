"""Preguntas al usuario (PLAN §5.1, paso 6): lo que más cambia el resultado, máximo 3 por ronda.

Tres fuentes, en este orden de prioridad:

1. **Contradicciones.** Los avisos estructurados del solver (`Reconstruction.avisos`) se convierten
   en preguntas neutrales: nunca en acusaciones ni en juicios de culpa (PLAN §10).
2. **Sensibilidad.** Para cada campo incierto (velocidades supuestas, estado del piso, si frenó,
   masa por clase supuesta) se reconstruye la escena variando solo ese campo con muestras
   estratificadas y semilla explícita, y se mide la varianza que produce en la velocidad al
   impacto y en la posición final de cada vehículo. La participación de cada campo en la varianza
   total (aproximación de un factor a la vez del índice de primer orden; supone interacciones
   débiles) es cuánto se espera que reduzca la incertidumbre conocer ese dato. Se pregunta primero
   lo que más pesa, solo si pesa al menos `MIN_SHARE` y si mueve el resultado al menos
   `MIN_EFFECT` (km/h o m, desviación estándar).
3. **Ambigüedad.** Las expresiones ambiguas del glosario traen su propia pregunta.
"""

from __future__ import annotations

import copy
import json
import math
import random
import re
import statistics
from dataclasses import dataclass
from functools import cache
from typing import Any

from croquis_extraction.glossary import find_terms
from croquis_solver.reconstruct import Aviso, reconstruct

JsonObj = dict[str, Any]
MAX_QUESTIONS = 3
MIN_SHARE = 0.10
MIN_EFFECT = 2.0  # km/h en la velocidad al impacto o m en la posición final
SAMPLES = 6
SOLVER_DT = 0.1  # rejilla de salida gruesa: basta para la velocidad al impacto y el reposo
STATED = ("relato", "usuario")
CLASS_LABEL = {
    "sedan_compacto": "el auto",
    "sedan_mediano": "el auto",
    "hatchback": "el auto",
    "suv_compacta": "la camioneta",
    "suv_grande": "la camioneta",
    "pickup": "la camioneta",
    "van": "la van",
    "microbus_combi": "la combi",
    "autobus": "el autobús",
    "camion_unitario": "el camión",
    "tractocamion": "el tráiler",
    "motocicleta": "la moto",
    "bicicleta": "la bicicleta",
    "scooter": "el scooter",
}
SPEED_RANGE_BY_ROAD = {
    "autopista": (60.0, 120.0),
    "carretera_dos_carriles": (50.0, 100.0),
    "glorieta": (10.0, 40.0),
    "estacionamiento": (3.0, 20.0),
    "retorno": (10.0, 40.0),
}
SPEED_RANGE_DEFAULT = (20.0, 70.0)
NO_SE = "no sé"
MANIOBRA_OPCIONES = (
    "cambió de carril a la izquierda",
    "cambió de carril a la derecha",
    "dio vuelta a la izquierda",
    "dio vuelta a la derecha",
    "siguió recto",
    NO_SE,
)
_MANIOBRA_VALOR = {
    "cambió de carril a la izquierda": "cambio_carril_izquierda",
    "cambió de carril a la derecha": "cambio_carril_derecha",
    "dio vuelta a la izquierda": "vuelta_izquierda",
    "dio vuelta a la derecha": "vuelta_derecha",
    "siguió recto": "recto",
}
USER_CONFIDENCE = 0.8


@dataclass(frozen=True)
class Pregunta:
    id: str
    texto: str
    motivo: str  # "contradiccion" | "sensibilidad" | "ambiguedad"
    campo: str  # ruta en la EscenaSpec, p. ej. "vehiculos.1.velocidad_previa"
    opciones: tuple[str, ...] = ()
    reduccion: float | None = None  # participación en la varianza (solo sensibilidad)

    def to_dict(self) -> JsonObj:
        d: JsonObj = {
            "id": self.id,
            "texto": self.texto,
            "motivo": self.motivo,
            "campo": self.campo,
        }
        if self.opciones:
            d["opciones"] = list(self.opciones)
        if self.reduccion is not None:
            d["reduccion"] = round(self.reduccion, 3)
        return d


def _stated(campo: JsonObj | None) -> bool:
    return campo is not None and campo.get("fuente") in STATED


_FIRST_PERSON = re.compile(
    r"(?i)(?<![a-záéíóúñ])(?:yo|mi|me|iba|venía|venia|manejaba)(?![a-záéíóúñ])"
)


def _narrator_vehicle(spec: JsonObj) -> str | None:
    """Vehículo de quien narra: la nota "narrador" del constructor o, si no, el conductor cuya
    evidencia está en primera persona ("Yo iba solo con cinturón")."""
    personas: list[JsonObj] = spec.get("personas", [])
    drivers: list[JsonObj] = []
    for p in personas:
        rol: JsonObj = p.get("rol") or {}
        if rol.get("valor") == "conductor" and p.get("vehiculo_id"):
            drivers.append(p)
    for p in drivers:
        if p["rol"].get("nota") == "narrador":
            return str(p["vehiculo_id"])
    for p in drivers:
        ev: list[JsonObj] = p["rol"].get("evidencia") or []
        if any(_FIRST_PERSON.search(str(e.get("texto", ""))) for e in ev):
            return str(p["vehiculo_id"])
    return None


def _ref(spec: JsonObj, vid: str) -> str:
    """Cómo nombrar un vehículo en una pregunta, sin juicios: "tu vehículo", "la camioneta (B)"."""
    if vid == _narrator_vehicle(spec):
        return "tu vehículo"
    v = next((x for x in spec["vehiculos"] if x["id"] == vid), None)
    if v is None:
        return "el otro vehículo"
    label = CLASS_LABEL.get(str(v["clase"]["valor"]), "el vehículo")
    if not _stated(v["clase"]):
        label = "el vehículo"
    return f"{label} ({v['rol']})"


def _vindex(spec: JsonObj, vid: str) -> int:
    return next(i for i, v in enumerate(spec["vehiculos"]) if v["id"] == vid)


# --- Contradicciones ----------------------------------------------------------------------------


def from_avisos(spec: JsonObj, avisos: list[Aviso]) -> list[Pregunta]:
    out: list[Pregunta] = []
    for a in avisos:
        d = a.datos
        vid = d.get("vehiculo")
        if a.codigo == "frenado_detiene_antes" and vid:
            out.append(
                Pregunta(
                    f"frenado_distancia:{vid}",
                    f"Con unos {d['v_kmh']:.0f} km/h y {d['frenado_m']:.0f} m de frenado, "
                    f"{_ref(spec, vid)} se habría detenido antes del golpe. ¿Recuerdas desde dónde "
                    "empezó a frenar, o la velocidad?",
                    "contradiccion",
                    f"vehiculos.{_vindex(spec, vid)}.frenado.distancia_antes_impacto",
                )
            )
        elif a.codigo == "proyeccion_vs_velocidad":
            out.append(
                Pregunta(
                    f"proyeccion:{d['persona']}",
                    f"La persona quedó a unos {d['distancia_m']:.0f} m, lo que suele "
                    f"corresponder a {d['v_min_kmh']:.0f}–{d['v_max_kmh']:.0f} km/h, y la "
                    "velocidad indicada da "
                    f"{d['v_kmh']:.0f} km/h. ¿Puedes confirmar la distancia o la velocidad?",
                    "contradiccion",
                    "evidencias.distancia_proyeccion",
                )
            )
        elif a.codigo == "zonas_no_se_tocan":
            out.append(
                Pregunta(
                    "zonas_impacto",
                    "Con las zonas de golpe indicadas los vehículos no llegan a tocarse. ¿En qué "
                    "parte de cada vehículo fue el golpe?",
                    "contradiccion",
                    "eventos.0.zonas_impacto",
                    ("frente", "atrás", "lado izquierdo", "lado derecho"),
                )
            )
        elif a.codigo == "desvio_lateral" and vid:
            lado = "izquierda" if float(d["lateral_m"]) > 0 else "derecha"
            metros = f"{abs(float(d['lateral_m'])):.0f} m hacia la {lado}"
            texto = (
                f"Para llegar al punto del golpe tuviste que moverte unos {metros}. ¿Cambiaste "
                "de carril o te abriste?"
                if vid == _narrator_vehicle(spec)
                else f"Para llegar al punto del golpe, {_ref(spec, vid)} tuvo que moverse unos "
                f"{metros}. ¿Cambió de carril o se abrió?"
            )
            out.append(
                Pregunta(
                    f"maniobra:{vid}",
                    texto,
                    "contradiccion",
                    f"vehiculos.{_vindex(spec, vid)}.maniobra",
                    MANIOBRA_OPCIONES,
                )
            )
        elif a.codigo == "volcadura_sin_velocidad" and vid:
            out.append(
                Pregunta(
                    f"volcadura:{vid}",
                    "Para que el vehículo se volcara hacía falta que fuera de lado hacia la "
                    "orilla. ¿Iba derrapando, o pegó con algo antes de voltearse?",
                    "contradiccion",
                    f"vehiculos.{_vindex(spec, vid)}.maniobra",
                    ("iba derrapando", "pegó con algo", "no sé"),
                )
            )
        elif a.codigo == "volcadura_no_mencionada" and vid:
            out.append(
                Pregunta(
                    f"volcadura:{vid}",
                    f"¿{_ref(spec, vid).capitalize()} llegó a volcarse o a levantarse de un lado?",
                    "contradiccion",
                    "eventos",
                    ("sí", "no", "no sé"),
                )
            )
        elif a.codigo == "frenado_sin_distancia" and vid:
            out.append(
                Pregunta(
                    f"frenado_distancia:{vid}",
                    (
                        "¿Desde dónde empezaste a frenar?"
                        if vid == _narrator_vehicle(spec)
                        else f"¿Desde dónde empezó a frenar {_ref(spec, vid)}?"
                    )
                    + " Un aproximado en metros o en largos de auto basta.",
                    "contradiccion",
                    f"vehiculos.{_vindex(spec, vid)}.frenado.distancia_antes_impacto",
                )
            )
    return out


# --- Sensibilidad -------------------------------------------------------------------------------


@cache
def _mass_ranges() -> dict[str, tuple[float, float]]:
    from croquis_solver.reconstruct import _classes  # pyright: ignore[reportPrivateUsage]

    out: dict[str, tuple[float, float]] = {}
    clases: dict[str, dict[str, Any]] = _classes()
    for clase, info in clases.items():
        rng: list[float] | None = info.get("masa_kg")
        if rng is not None and len(rng) == 2:
            out[clase] = (float(rng[0]), float(rng[1]))
    return out


@dataclass(frozen=True)
class _Candidate:
    pregunta: Pregunta
    values: tuple[Any, ...]
    path: tuple[str | int, ...]  # dónde escribir el valor muestreado en la spec
    unidad: str | None = None


def _stratified(rng: random.Random, lo: float, hi: float, n: int) -> tuple[float, ...]:
    return tuple(round(lo + (k + rng.random()) / n * (hi - lo), 2) for k in range(n))


def candidates(spec: JsonObj, rng: random.Random, n: int = SAMPLES) -> list[_Candidate]:
    """Campos inciertos que el solver usa, con sus muestras."""
    out: list[_Candidate] = []
    lugar = spec["lugar"]
    tipo_via = str(lugar["tipo_via"]["valor"])
    if not _stated(lugar.get("estado_superficie")):
        out.append(
            _Candidate(
                Pregunta(
                    "estado_superficie",
                    "¿El piso estaba seco o mojado?",
                    "sensibilidad",
                    "lugar.estado_superficie",
                    ("seco", "mojado", "encharcado"),
                ),
                ("seco", "mojado", "encharcado"),
                ("lugar", "estado_superficie"),
            )
        )
    narrator = _narrator_vehicle(spec)
    for i, v in enumerate(spec["vehiculos"]):
        vid = v["id"]
        if v["maniobra"]["valor"] in ("detenido", "estacionado"):
            continue
        ref = _ref(spec, vid)
        if not _stated(v.get("velocidad_previa")):
            lo, hi = SPEED_RANGE_BY_ROAD.get(tipo_via, SPEED_RANGE_DEFAULT)
            texto = (
                "¿A qué velocidad aproximada ibas antes del golpe?"
                if vid == narrator
                else f"¿A qué velocidad crees que iba {ref}?"
            )
            out.append(
                _Candidate(
                    Pregunta(
                        f"velocidad:{vid}", texto, "sensibilidad", f"vehiculos.{i}.velocidad_previa"
                    ),
                    _stratified(rng, lo, hi, n),
                    ("vehiculos", i, "velocidad_previa"),
                    "km/h",
                )
            )
        frenado_obj: JsonObj = v.get("frenado") or {}
        frenado: JsonObj | None = frenado_obj.get("aplico")
        if not _stated(frenado):
            texto = (
                "¿Alcanzaste a frenar antes del golpe?"
                if vid == narrator
                else f"¿Viste si {ref} frenó antes del golpe?"
            )
            out.append(
                _Candidate(
                    Pregunta(
                        f"frenado:{vid}",
                        texto,
                        "sensibilidad",
                        f"vehiculos.{i}.frenado.aplico",
                        ("sí", "no", "no sé"),
                    ),
                    (True, False),
                    ("vehiculos", i, "frenado", "aplico"),
                )
            )
        clase = str(v["clase"]["valor"])
        mass = _mass_ranges().get(clase)
        if not _stated(v["clase"]) and mass and not v.get("masa"):
            out.append(
                _Candidate(
                    Pregunta(
                        f"clase:{vid}",
                        f"¿Qué tipo o modelo de vehículo era {ref}?",
                        "sensibilidad",
                        f"vehiculos.{i}.clase",
                    ),
                    _stratified(rng, mass[0], mass[1], n),
                    ("vehiculos", i, "masa"),
                    "kg",
                )
            )
    return out


def _set(spec: JsonObj, path: tuple[str | int, ...], value: Any, unidad: str | None) -> None:
    node: Any = spec
    for key in path[:-1]:
        if isinstance(key, str) and key not in node:
            node[key] = {}
        node = node[key]
    campo: JsonObj = {"valor": value, "fuente": "supuesto", "confianza": 0.3}
    if unidad:
        campo["unidad"] = unidad
    node[path[-1]] = campo


def _outputs(spec: JsonObj) -> list[float] | None:
    try:
        r = reconstruct(spec, dt=SOLVER_DT)
    except ValueError, KeyError, ZeroDivisionError, ArithmeticError:
        return None
    ys: list[float] = []
    for v in r.vehiculos:
        ys += [v.v_impact_kmh, v.rest_pose[0], v.rest_pose[1]]
    return ys


def sensitivity(
    spec: JsonObj, seed: int, n: int = SAMPLES
) -> list[tuple[_Candidate, float, float]]:
    """(campo, participación en la varianza, efecto absoluto), de mayor a menor participación.

    El efecto absoluto es la mayor desviación estándar que el campo produce en una salida (km/h en
    la velocidad al impacto, m en la posición final).
    """
    rng = random.Random(seed)
    cands = candidates(spec, rng, n)
    per_cand: list[list[list[float]]] = []
    for c in cands:
        runs: list[list[float]] = []
        for value in c.values:
            s = copy.deepcopy(spec)
            _set(s, c.path, value, c.unidad)
            y = _outputs(s)
            if y is not None:
                runs.append(y)
        per_cand.append(runs)
    k_out = max((len(r[0]) for r in per_cand if r), default=0)
    variances: list[list[float]] = []
    for runs in per_cand:
        row: list[float] = []
        for k in range(k_out):
            col = [r[k] for r in runs if len(r) > k]
            row.append(statistics.pvariance(col) if len(col) >= 2 else 0.0)
        variances.append(row)
    shares = [0.0] * len(cands)
    used = 0
    for k in range(k_out):
        total = sum(row[k] for row in variances)
        if total <= 1e-9:
            continue
        used += 1
        for i, row in enumerate(variances):
            shares[i] += row[k] / total
    if used:
        shares = [s / used for s in shares]
    effects = [math.sqrt(max(row, default=0.0)) for row in variances]
    return sorted(
        zip(cands, shares, effects, strict=True), key=lambda cs: (-cs[1], cs[0].pregunta.id)
    )


# --- Ronda de preguntas -------------------------------------------------------------------------


def topic(qid: str) -> str:
    """Tema de una pregunta: dos preguntas del mismo tema no van en la misma ronda."""
    kind, _, target = qid.partition(":")
    return f"{kind.removesuffix('_distancia')}:{target}"


def from_glossary(text: str) -> list[Pregunta]:
    out: list[Pregunta] = []
    seen: set[str] = set()
    for t in find_terms(text):
        if t.ambiguo and t.pregunta and t.id not in seen:
            seen.add(t.id)
            campo = str(t.efectos[0]["campo"]) if t.efectos else "relato"
            out.append(Pregunta(f"glosario:{t.id}", t.pregunta, "ambiguedad", campo))
    return out


def ask(
    spec: JsonObj,
    text: str | None = None,
    *,
    seed: int | None = None,
    samples: int = SAMPLES,
    max_questions: int = MAX_QUESTIONS,
    answered: frozenset[str] = frozenset(),
) -> list[Pregunta]:
    """La ronda de preguntas para `spec` (y su relato redactado, si se tiene)."""
    seed = int(spec["meta"]["semilla"]) if seed is None else seed
    base = reconstruct(spec, dt=SOLVER_DT)
    chosen: list[Pregunta] = []
    seen: set[str] = {topic(a) for a in answered}

    def take(p: Pregunta) -> None:
        key = topic(p.id)
        if key not in seen and len(chosen) < max_questions:
            seen.add(key)
            chosen.append(p)

    for p in from_avisos(spec, base.avisos):
        take(p)
    for cand, share, effect in sensitivity(spec, seed, samples):
        if share >= MIN_SHARE and effect >= MIN_EFFECT:
            take(
                Pregunta(
                    cand.pregunta.id,
                    cand.pregunta.texto,
                    cand.pregunta.motivo,
                    cand.pregunta.campo,
                    cand.pregunta.opciones,
                    share,
                )
            )
    if text:
        for p in from_glossary(text):
            take(p)
    return chosen


def ask_json(spec: JsonObj, text: str | None = None, seed: int | None = None) -> str:
    return json.dumps([p.to_dict() for p in ask(spec, text, seed=seed)], ensure_ascii=False)


# --- Respuestas -------------------------------------------------------------------------------


def _user(valor: Any, unidad: str | None = None) -> JsonObj:
    campo: JsonObj = {"valor": valor, "fuente": "usuario", "confianza": USER_CONFIDENCE}
    if unidad:
        campo["unidad"] = unidad
    return campo


def _number(raw: Any) -> float | None:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int | float):
        return float(raw)
    m = re.search(r"\d+(?:[.,]\d+)?", str(raw))
    return float(m.group(0).replace(",", ".")) if m else None


def _yes_no(raw: Any) -> bool | None:
    if isinstance(raw, bool):
        return raw
    return {"sí": True, "si": True, "no": False}.get(str(raw).strip().lower())


def apply_answers(spec: JsonObj, respuestas: dict[str, Any]) -> tuple[JsonObj, list[str]]:
    """La spec con las respuestas del usuario (`fuente: usuario`) y los ids que cambiaron algo.

    "no sé", respuestas vacías y preguntas sin campo directo (zonas, glosario, volcadura) se dan
    por contestadas sin inventar nada: la persona corrige esos detalles en el croquis.
    """
    out = copy.deepcopy(spec)
    applied: list[str] = []
    ids = {v["id"]: v for v in out["vehiculos"]}
    for qid, raw in respuestas.items():
        if raw is None or str(raw).strip().lower() in ("", NO_SE, "no se"):
            continue
        kind, _, target = qid.partition(":")
        v = ids.get(target)
        if kind == "velocidad" and v is not None:
            n = _number(raw)
            if n is not None and 0 <= n <= 300:
                v["velocidad_previa"] = _user(n, "km/h")
                applied.append(qid)
        elif kind == "frenado" and v is not None:
            yn = _yes_no(raw)
            if yn is not None:
                v.setdefault("frenado", {})["aplico"] = _user(yn)
                applied.append(qid)
        elif kind == "frenado_distancia" and v is not None:
            n = _number(raw)
            if n is not None and 0 < n <= 200:
                fr = v.setdefault("frenado", {})
                fr["aplico"] = _user(True)
                fr["distancia_antes_impacto"] = _user(n, "m")
                applied.append(qid)
        elif kind == "clase" and v is not None and raw in CLASS_LABEL:
            v["clase"] = _user(raw)
            v.pop("masa", None)
            applied.append(qid)
        elif kind == "maniobra" and v is not None and raw in _MANIOBRA_VALOR:
            v["maniobra"] = _user(_MANIOBRA_VALOR[raw])
            applied.append(qid)
        elif kind == "estado_superficie" and raw in ("seco", "mojado", "encharcado"):
            out["lugar"]["estado_superficie"] = _user(raw)
            applied.append(qid)
        elif kind == "proyeccion":
            n = _number(raw)
            ev = next(
                (e for e in out.get("evidencias", []) if e.get("tipo") == "distancia_proyeccion"),
                None,
            )
            if n is not None and 0 < n <= 100 and ev is not None:
                ev["longitud"] = _user(n, "m")
                applied.append(qid)
    return out, applied
