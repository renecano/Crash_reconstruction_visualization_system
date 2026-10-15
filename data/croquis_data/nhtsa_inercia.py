"""Base de parámetros inerciales de vehículos ligeros de NHTSA (VRTC), descarga y lectura.

Fuente: NHTSA Vehicle Research and Test Center, "Light Vehicle Inertial Parameter Database" en
unidades métricas (PDF oficial; la versión impresa es Heydinger et al., SAE 1999-01-1336). El
servidor de NHTSA rechaza descargas automáticas, así que se baja la copia del Internet Archive del
2022-07-09, fijada por SHA-256. Ver ``data/SOURCES.md``.

El PDF trae tres tablas con los mismos vehículos en el mismo orden:

- la de especificaciones (año, marca y modelo, número, versión del equipo, tipo de carrocería,
  ocupantes, lastre, eje motriz, distancia entre ejes, vías, altura y peso en N);
- la de centro de masa y momentos de inercia (cabeceo, alabeo y guiñada en kg·m²);
- la de VIN, fecha de la prueba, corrida y largo total del vehículo.

``build`` las empareja por posición, verifica que coincidan año, número, tipo, ocupantes, lastre y
eje motriz, y falla si alguna fila no se reconoce. Escribe
``data/processed/nhtsa/inercia.csv`` (versionado). No filtra: los filtros los aplica quien usa los
datos y los cuenta.

Uso: ``uv run croquis-data inercia download`` y ``uv run croquis-data inercia build [--check]``.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
from dataclasses import asdict, dataclass, fields
from pathlib import Path

import httpx

DATA_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = DATA_DIR / "raw" / "nhtsa_inercia"
PDF_NAME = "nhtsa_inertia_database_metric.pdf"
CSV_PATH = DATA_DIR / "processed" / "nhtsa" / "inercia.csv"
ORIGINAL_URL = (
    "https://www.nhtsa.gov/DOT/NHTSA/NRD/Multimedia/PDFs/VRTC/ca/nhtsa_inertia_database_metric.pdf"
)
ARCHIVE_URL = "https://web.archive.org/web/20220709042518id_/" + ORIGINAL_URL
SHA256 = "4b8fa83b52571290c5013a885d49f9692fa1840b77b4c0c7dc0fbb49cff1b7a3"
G = 9.80665

TYPES = r"2S|2C|4S|3H|5H|SW|CV|MP|PU|VN"
_NUM = r"\d+\.\d+|N/A"
# Fila de especificaciones: el modelo puede tener espacios; el lastre puede ser "Lt Ld" o "GVWR".
SPEC_RE = re.compile(
    r"^(?P<year>(?:19|20)\d{2}) (?P<name>.+?) (?P<vno>\S+) (?P<ver>\S+) (?P<type>"
    + TYPES
    + r") +(?P<occ>\S+) +(?P<ballast>Lt Ld|\S+) +(?P<drive>[4FR]) (?P<wb>\d\.\d{3}) "
    r"(?P<tf>" + _NUM + r") (?P<tr>" + _NUM + r") +(?P<h>" + _NUM + r") +(?P<w>\d+|N/A)"
    r"(?: (?P<fuel>N/A|[A-Z]))?(?: (?P<comment>.*))?$"
)
# Fila izquierda de la tabla de inercias (sin las columnas numéricas).
LEFT_RE = re.compile(
    r"^(?P<year>(?:19|20)\d{2}) (?P<name>.+?) (?P<vno>\S+) (?P<ver>\S+) (?P<type>"
    + TYPES
    + r") +(?P<occ>\S+) +(?P<ballast>Lt Ld|\S+) +(?P<drive>[4FR])$"
)
# Fila numérica completa: CG x, CG z, cabeceo, alabeo, guiñada, [producto alabeo/guiñada], mesa,
# SSF (7 u 8 valores). Hay filas con solo dos valores: cuentan para emparejar, pero sus columnas no
# se pueden ubicar y se dejan vacías.
NUM_RE = re.compile(r"^(?:(?:-?\d+(?:\.\d+)?|N/A) ){1,7}(?:-?\d+(?:\.\d+)?|N/A)$")
FULL_ROW = (7, 8)
# Fila de la tercera tabla: VIN y, si los hay, fecha ("26-Sep-90" o "May 1988"), corrida y largo
# total (m). Las de 1998 (VIMF) solo traen el VIN.
VIN_RE = re.compile(
    r"^(?P<vin>N/A|[A-Z0-9][A-Z0-9?-]{4,19})"
    r"(?: (?P<date>\d{2}-[A-Z][a-z]{2}-\d{2}|[A-Z][a-z]{2} \d{4}))?"
    r"(?: (?P<run>#\d+))?(?: (?P<len>\d\.\d{2}|N/A))?$"
)
YEAR_LINE = re.compile(r"^(?:19|20)\d{2} ")


@dataclass(frozen=True)
class InertiaRow:
    model_year: int
    vehicle: str
    vehicle_no: str
    ipmd_version: str
    body_type: str
    occupants: str
    ballast_n: str
    drive_axle: str
    wheelbase_m: float
    track_front_m: float | None
    track_rear_m: float | None
    roof_height_m: float | None
    weight_n: float | None
    mass_kg: float | None
    length_m: float | None
    cg_from_front_axle_m: float | None
    cg_height_m: float | None
    pitch_kg_m2: float | None
    roll_kg_m2: float | None
    yaw_kg_m2: float | None
    vin: str
    test_date: str
    comment: str


def _f(s: str) -> float | None:
    return None if s == "N/A" else float(s)


def download(raw_dir: Path = RAW_DIR) -> Path:
    """Baja el PDF (copia del Internet Archive) y verifica su SHA-256."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / PDF_NAME
    if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != SHA256:
        r = httpx.get(ARCHIVE_URL, follow_redirects=True, timeout=120.0)
        r.raise_for_status()
        path.write_bytes(r.content)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != SHA256:
        msg = f"SHA-256 inesperado para {path.name}: {digest}"
        raise RuntimeError(msg)
    return path


ROW_TOLERANCE = 1.5  # puntos: fragmentos a esta distancia están en la misma fila


def _rows(pdf: Path) -> list[list[str]]:
    """Filas de cada página con sus fragmentos en orden de columna.

    Las páginas vienen giradas: la posición de la fila es la coordenada x de la matriz de texto
    (``tm[4]``). Emparejar por esa posición, y no por orden, deja vacía la celda que falta en vez
    de correr las siguientes.
    """
    from pypdf import PdfReader

    reader = PdfReader(str(pdf))
    pages: list[list[str]] = []
    for page in reader.pages:
        collector = _Fragments()
        page.extract_text(visitor_text=collector.visit)
        frags = sorted(collector.items)
        groups: list[list[tuple[float, str]]] = []
        last = -1e9
        for row, col, text in frags:
            if groups and row - last <= ROW_TOLERANCE:
                groups[-1].append((col, text))
            else:
                groups.append([(col, text)])
                last = row
        pages.append([" | ".join(t for _, t in sorted(g)) for g in groups])
    return pages


class _Fragments:
    """Junta los fragmentos de texto de una página con su posición (fila, columna)."""

    def __init__(self) -> None:
        self.items: list[tuple[float, float, str]] = []

    def visit(self, text: str, *args: object) -> None:
        # pypdf llama con (texto, cm, tm, fuente, tamaño); la posición es la de tm.
        tm = args[1]
        if text.strip() and isinstance(tm, (list, tuple)):
            pos: list[float] = [float(x) for x in tm]  # pyright: ignore[reportUnknownVariableType, reportUnknownArgumentType]
            self.items.append((pos[4], pos[5], text.strip()))


def _page_kind(rows: list[str]) -> str:
    """Tabla de la página según su encabezado."""
    text = " ".join(rows[:12])
    if "Wheel-" in text:
        return "spec"
    if "CG Location" in text:
        return "num"
    if "Test Run Length" in text:
        return "vin"
    return ""


def parse(pdf: Path) -> list[InertiaRow]:
    """Empareja las tres tablas del PDF y verifica que hablen del mismo vehículo."""
    specs: list[re.Match[str]] = []
    inertia: list[tuple[re.Match[str], list[str] | None]] = []
    vins: list[tuple[re.Match[str], re.Match[str] | None]] = []
    for i, lines in enumerate(_rows(pdf), start=1):
        kind = _page_kind(lines)
        if not kind:
            msg = f"Página {i} sin encabezado conocido"
            raise ValueError(msg)
        for row in lines:
            parts = row.split(" | ")
            if not YEAR_LINE.match(parts[0]):
                continue
            if kind == "spec":
                m = SPEC_RE.match(" ".join(parts))
                if m is None:
                    msg = f"Fila no reconocida en la página {i}: {row!r}"
                    raise ValueError(msg)
                specs.append(m)
                continue
            left = LEFT_RE.match(parts[0])
            right = " ".join(parts[1:]) or None
            if left is None:
                msg = f"Fila no reconocida en la página {i}: {row!r}"
                raise ValueError(msg)
            if kind == "num":
                if right is not None and not NUM_RE.match(right):
                    msg = f"Datos no reconocidos en la página {i}: {row!r}"
                    raise ValueError(msg)
                inertia.append((left, None if right is None else right.split()))
            else:
                vm = None if right is None else VIN_RE.match(right)
                if right is not None and vm is None:
                    msg = f"Datos no reconocidos en la página {i}: {row!r}"
                    raise ValueError(msg)
                vins.append((left, vm))
    if not len(specs) == len(inertia) == len(vins):
        msg = (
            f"Tablas de distinto tamaño: {len(specs)} especificaciones, {len(inertia)} "
            f"inercias y {len(vins)} VIN"
        )
        raise ValueError(msg)
    key = ("year", "vno", "ver", "type", "occ", "ballast", "drive")
    rows: list[InertiaRow] = []
    for s, (left, n_raw), (vleft, v) in zip(specs, inertia, vins, strict=True):
        for other in (left, vleft):
            if any(s[k] != other[k] for k in key):
                msg = f"Las tablas no coinciden: {s.group(0)!r} contra {other.group(0)!r}"
                raise ValueError(msg)
        n = n_raw if n_raw is not None and len(n_raw) in FULL_ROW else ["N/A"] * 5
        weight = _f(s["w"])
        rows.append(
            InertiaRow(
                model_year=int(s["year"]),
                vehicle=s["name"].strip(),
                vehicle_no=s["vno"],
                ipmd_version=s["ver"],
                body_type=s["type"],
                occupants=s["occ"],
                ballast_n=s["ballast"],
                drive_axle=s["drive"],
                wheelbase_m=float(s["wb"]),
                track_front_m=_f(s["tf"]),
                track_rear_m=_f(s["tr"]),
                roof_height_m=_f(s["h"]),
                weight_n=weight,
                mass_kg=None if weight is None else round(weight / G, 1),
                length_m=_f(v["len"] or "N/A") if v else None,
                cg_from_front_axle_m=_f(n[0]),
                cg_height_m=_f(n[1]),
                pitch_kg_m2=_f(n[2]),
                roll_kg_m2=_f(n[3]),
                yaw_kg_m2=_f(n[4]),
                vin=v["vin"] if v else "",
                test_date=(v["date"] or "") if v else "",
                comment=(s["comment"] or "").strip(),
            )
        )
    return rows


def to_csv(rows: list[InertiaRow]) -> str:
    buf = io.StringIO()
    names = [f.name for f in fields(InertiaRow)]
    w = csv.DictWriter(buf, fieldnames=names, lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({k: ("" if v is None else v) for k, v in asdict(r).items()})
    return buf.getvalue()


def build(check: bool = False, raw_dir: Path = RAW_DIR, csv_path: Path = CSV_PATH) -> bool:
    """Escribe (o verifica) el CSV desde el PDF crudo."""
    text = to_csv(parse(download(raw_dir)))
    if check:
        return csv_path.exists() and csv_path.read_text(encoding="utf-8") == text
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    csv_path.write_text(text, encoding="utf-8", newline="\n")
    return True


def load(csv_path: Path = CSV_PATH) -> list[dict[str, str]]:
    with csv_path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


__all__ = ["CSV_PATH", "InertiaRow", "build", "download", "load", "parse"]
