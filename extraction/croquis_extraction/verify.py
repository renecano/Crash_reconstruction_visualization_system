"""Verificador de evidencia (PLAN §5.1, paso 3).

Todo campo con `fuente: relato` debe citar un fragmento que exista literalmente en el relato (el
texto que recibió el extractor, ya redactado). Si la cita existe pero sus posiciones no coinciden,
se corrigen; si no existe, el campo baja a `supuesto` (confianza ≤ 0.4) con una nota que lo dice.
Así ninguna afirmación "del relato" llega al usuario sin respaldo literal.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

JsonObj = dict[str, Any]
DOWNGRADED_CONFIDENCE = 0.4


@dataclass(frozen=True)
class VerifyStats:
    revisados: int
    corregidos: int  # cita literal con posiciones arregladas
    degradados: int  # sin cita literal: pasan a supuesto

    @property
    def tasa_alucinacion(self) -> float:
        return self.degradados / self.revisados if self.revisados else 0.0


def _fix_evidence(ev: list[JsonObj], text: str) -> tuple[list[JsonObj] | None, bool]:
    """Evidencia válida (o None si alguna cita no está) y si hubo que corregir posiciones."""
    out: list[JsonObj] = []
    fixed = False
    for e in ev:
        cita = str(e.get("texto", ""))
        if not cita:
            return None, False
        i, j = e.get("inicio"), e.get("fin")
        if isinstance(i, int) and isinstance(j, int) and text[i:j] == cita:
            out.append({"inicio": i, "fin": j, "texto": cita})
            continue
        k = text.find(cita)
        if k < 0:
            return None, False
        out.append({"inicio": k, "fin": k + len(cita), "texto": cita})
        fixed = True
    return out, fixed


def verify_spec(spec: JsonObj, text: str) -> tuple[JsonObj, VerifyStats]:
    """Copia de la EscenaSpec con la evidencia verificada contra `text`."""
    out = copy.deepcopy(spec)
    revisados = corregidos = degradados = 0

    def walk(o: Any) -> None:
        nonlocal revisados, corregidos, degradados
        if isinstance(o, dict):
            d: JsonObj = o  # pyright: ignore[reportUnknownVariableType]
            if d.get("fuente") == "relato":
                revisados += 1
                ev: list[JsonObj] = d.get("evidencia") or []
                fixed_ev, fixed = _fix_evidence(ev, text) if ev else (None, False)
                if fixed_ev is None:
                    degradados += 1
                    d["fuente"] = "supuesto"
                    d["confianza"] = min(
                        float(d.get("confianza", DOWNGRADED_CONFIDENCE)), DOWNGRADED_CONFIDENCE
                    )
                    d.pop("evidencia", None)
                    nota = "La cita no aparece literal en el relato; se marcó como supuesto."
                    d["nota"] = (str(d["nota"]) + " " + nota)[:300] if d.get("nota") else nota
                else:
                    d["evidencia"] = fixed_ev
                    corregidos += int(fixed)
            for v in d.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:  # pyright: ignore[reportUnknownVariableType]
                walk(v)

    walk(out)
    return out, VerifyStats(revisados, corregidos, degradados)
