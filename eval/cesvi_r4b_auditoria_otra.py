"""Auditoría de la etiqueta «otra» de R0 contra el título del propio reporte (R4b, ADR 0069).

Solo informa: no cambia ninguna regla ni la etiqueta con que se mide E-R4. Para cada reporte que R0
etiquetó «otra» (la modalidad que concluyó CESVI, leída por Claude), busca en el texto crudo la
modalidad que CESVI escribió en su título («... EN SU MODALIDAD DE ALCANCE») y la clasifica con
reglas fijas: choque entre vehículos (alcance, lateral, frontal, reversa), un vehículo (volcadura,
objeto fijo, salida del camino), hecho sin choque (incendio, inundación, corte de circulación,
bache, desprendimiento, partes bajas) o sin clasificar.

Los textos crudos están fuera de git (data/raw/cesvi/); el resultado guarda solo conteos.

Uso (desde la raíz): python -I -X utf8 eval/cesvi_r4b_auditoria_otra.py
  → eval/results/cesvi_r4b_auditoria_otra.json
"""

import collections
import glob
import hashlib
import json
import re
import unicodedata
from datetime import UTC, datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]

CLASES: list[tuple[str, str]] = [
    (
        "sin_choque",
        r"incendio|inundacion|corte de circulacion|corte de|bache|desprendimiento"
        r"|partes bajas|parte baja|granizo",
    ),
    ("reversa", r"revers"),
    ("volcadura", r"volcadura|vuelco"),
    ("alcance", r"alcance"),
    ("frontal", r"frontal|frente"),
    ("lateral", r"lateral|perpendicular|oblicu|embestida|crucero|raspado"),
    ("objeto_fijo", r"objeto fijo|poste|muro|barda|arbol"),
    ("salida_de_camino", r"salida|despiste"),
]


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def titulos() -> dict[str, str]:
    out: dict[str, str] = {}
    for f in sorted(glob.glob(str(RAIZ / "data/raw/cesvi/crash_reports_batch_*.md"))):
        for b in re.split(r"^# Document: ", Path(f).read_text(encoding="utf-8"), flags=re.M)[1:]:
            archivo = b[: b.index("\n")].strip()
            ident = "cesvi-" + hashlib.sha256(archivo.encode()).hexdigest()[:10]
            m = re.search(r"modalidad\s+de\s+([^\n.,]{3,80})", norm(b))
            out[ident] = m.group(1).strip() if m else ""
    return out


def clase(titulo: str) -> str:
    if not titulo:
        return "sin_titulo"
    return next((c for c, rx in CLASES if re.search(rx, titulo)), "sin_clasificar")


def main() -> None:
    narr = [
        json.loads(x) for x in (RAIZ / "data/cesvi/corpus/narraciones.jsonl").open(encoding="utf-8")
    ]
    prueba = set(
        json.loads((RAIZ / "data/cesvi/corpus/particion.json").read_text(encoding="utf-8"))[
            "prueba"
        ]
    )
    tit = titulos()
    out: dict[str, object] = {
        "fecha": datetime.now(UTC).isoformat(timespec="seconds"),
        "descripcion": (
            "Reportes que R0 etiquetó «otra», por la clase de la modalidad que CESVI escribió "
            "en el título del propio reporte. Informativo: E-R4 se mide con la etiqueta de R0."
        ),
    }
    for nombre, en_prueba in (("desarrollo", False), ("prueba", True)):
        otras = [
            n
            for n in narr
            if (n["id"] in prueba) == en_prueba
            and not n["fugas"]
            and not n["solo_conclusiones"]
            and n["conclusiones"]["modalidad"] == "otra"
        ]
        c = collections.Counter(clase(tit.get(n["id"], "")) for n in otras)
        out[nombre] = {"otra_en_r0": len(otras), "por_titulo": dict(c.most_common())}
    destino = RAIZ / "eval/results/cesvi_r4b_auditoria_otra.json"
    destino.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
