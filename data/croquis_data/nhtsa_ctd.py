"""Descarga reproducible de pruebas de choque de NHTSA (Vehicle Crash Test Database, API pública).

Fuente: https://nrd.api.nhtsa.dot.gov/nhtsa/vehicle/ (OpenAPI en ``/v3/api-docs``);
ver ``data/SOURCES.md``.

Qué se baja: todas las pruebas con configuración ``VTB`` (vehículo contra barrera). Para cada
prueba, el detalle del vehículo (peso de prueba, largo, ancho, velocidad, perfil de daño DPD1–DPD6,
aplastamiento máximo, índice de daño) y la información de la barrera (rígida/deformable, forma,
ángulo, diámetro de poste). Las respuestas crudas se guardan una por prueba en ``data/raw/nhtsa/``
(no versionado, reanudable) y el resumen tabular en ``data/processed/nhtsa/vtb_tests.csv``
(versionado, pequeño), que alimenta E2.

Uso: ``uv run croquis-data nhtsa download`` y ``uv run croquis-data nhtsa process``.
"""

from __future__ import annotations

import csv
import json
import time
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import httpx

BASE_URL = "https://nrd.api.nhtsa.dot.gov/nhtsa/vehicle/api/v1/vehicle-database-test-results"
API_DOCS_URL = "https://nrd.api.nhtsa.dot.gov/nhtsa/vehicle/v3/api-docs"
DATA_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = DATA_DIR / "raw" / "nhtsa"
PROCESSED_DIR = DATA_DIR / "processed" / "nhtsa"
CSV_PATH = PROCESSED_DIR / "vtb_tests.csv"
USER_AGENT = (
    "croquis-data/0.1 (+https://github.com/renecano/Crash_reconstruction_visualization_system)"
)
PAGE_SIZE = 200

CSV_COLUMNS = [
    "test_no",
    "test_date",
    "test_type",
    "test_performer",
    "model_year",
    "make",
    "model",
    "body_type",
    "test_weight_kg",
    "curb_weight_kg",
    "length_mm",
    "width_mm",
    "cg_behind_front_axle_mm",
    "speed_kmh",
    "closing_speed_kmh",
    "impact_angle_deg",
    "pdof_deg",
    "crabbed_angle_deg",
    "barrier_rigid",
    "barrier_shape",
    "barrier_angle_deg",
    "pole_diameter_mm",
    "offset_distance_mm",
    "max_crush_mm",
    "dpd1_mm",
    "dpd2_mm",
    "dpd3_mm",
    "dpd4_mm",
    "dpd5_mm",
    "dpd6_mm",
    "total_indentation_length_mm",
    "damage_offset_mm",
    "damage_index",
    "vehicle_modification",
]


@dataclass(frozen=True)
class DownloadStats:
    listed: int
    fetched: int
    cached: int
    failed: int


def _client() -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=httpx.Timeout(30.0, read=120.0),
        follow_redirects=True,
    )


def _get_json(
    client: httpx.Client, url: str, params: dict[str, Any] | None = None, retries: int = 4
) -> Any:
    delay = 1.0
    for attempt in range(retries):
        try:
            r = client.get(url, params=params)
            if r.status_code == 429 or r.status_code >= 500:
                raise httpx.HTTPStatusError("reintentable", request=r.request, response=r)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError, ValueError:
            if attempt == retries - 1:
                raise
            time.sleep(delay)
            delay *= 2
    return None


def list_vtb_tests(
    client: httpx.Client, *, log: Callable[[str], None] | None = None
) -> list[dict[str, Any]]:
    """Lista (paginando) todas las pruebas vehículo-contra-barrera con sus campos de resumen."""
    out: list[dict[str, Any]] = []
    page = 1
    while True:
        data = _get_json(
            client,
            f"{BASE_URL}/by-search",
            {"testConfiguration": "VTB", "count": PAGE_SIZE, "pageNumber": page},
        )
        results: list[dict[str, Any]] = data.get("results") or []
        out.extend(results)
        meta: dict[str, Any] = data.get("meta") or {}
        pagination: dict[str, Any] = meta.get("pagination") or {}
        total = int(pagination.get("total") or 0)
        if log:
            log(f"página {page}: {len(out)}/{total}")
        if not results or len(out) >= total:
            break
        page += 1
    return out


def fetch_test(client: httpx.Client, test_no: int, raw_dir: Path = RAW_DIR) -> dict[str, Any]:
    """Descarga (o lee de caché) detalle de prueba, vehículos y barrera de una prueba."""
    path = raw_dir / f"test_{test_no}.json"
    if path.exists():
        cached: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
        return cached
    detail = _get_json(client, f"{BASE_URL}/get-test-detail/{test_no}")
    vehicles = _get_json(client, f"{BASE_URL}/get-vehicle-info/{test_no}")
    vehicle_details: list[Any] = []
    vehicle_rows: list[dict[str, Any]] = vehicles.get("results") or []
    for v in vehicle_rows:
        vd = _get_json(client, f"{BASE_URL}/get-vehicle-detail-info/{v['vehicleNo']}/{test_no}")
        vehicle_details.append(vd.get("results"))
    barrier = _get_json(client, f"{BASE_URL}/get-barrier-info/{test_no}")
    doc = {
        "test_no": test_no,
        "test_detail": detail.get("results"),
        "vehicles": vehicle_details,
        "barrier": barrier.get("results"),
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    raw_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return doc


def download(
    raw_dir: Path = RAW_DIR,
    *,
    workers: int = 4,
    limit: int | None = None,
    log: Callable[[str], None] | None = None,
) -> DownloadStats:
    """Descarga todas las pruebas VTB. Reanudable: las que ya están en ``raw_dir`` no se repiten."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    with _client() as client:
        tests = list_vtb_tests(client, log=log)
        (raw_dir / "vtb_index.json").write_text(
            json.dumps(tests, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
        )
        numbers = [int(t["testNo"]) for t in tests]
        if limit is not None:
            numbers = numbers[:limit]
        cached = sum(1 for n in numbers if (raw_dir / f"test_{n}.json").exists())
        todo = [n for n in numbers if not (raw_dir / f"test_{n}.json").exists()]
        failed = 0
        done = 0

        def work(n: int) -> bool:
            with _client() as c:
                try:
                    fetch_test(c, n, raw_dir)
                    return True
                except Exception as exc:  # se registra y se sigue con las demás
                    if log:
                        log(f"prueba {n} falló: {exc}")
                    return False

        with ThreadPoolExecutor(max_workers=workers) as pool:
            for ok in pool.map(work, todo):
                done += 1
                if not ok:
                    failed += 1
                if log and done % 100 == 0:
                    log(f"descargadas {done}/{len(todo)} (fallidas {failed})")
    return DownloadStats(
        listed=len(numbers), fetched=len(todo) - failed, cached=cached, failed=failed
    )


def _num(v: Any) -> float | None:
    if v is None:
        return None
    try:
        s = str(v).strip()
        return float(s) if s not in {"", "NA", "N/A", "null"} else None
    except ValueError:
        return None


def _first(items: Any) -> dict[str, Any]:
    if isinstance(items, list):
        rows = cast(list[dict[str, Any]], items)
        return rows[0] if rows else {}
    return cast(dict[str, Any], items or {})


def rows_from_doc(doc: dict[str, Any]) -> list[dict[str, Any]]:
    """Una fila por vehículo de la prueba (VTB normalmente trae uno)."""
    td = _first(doc.get("test_detail"))
    bar = _first(doc.get("barrier"))
    rows: list[dict[str, Any]] = []
    vehicles_raw: list[Any] = doc.get("vehicles") or []
    for vd_raw in vehicles_raw:
        vd = _first(vd_raw)
        if not vd:
            continue
        rows.append(
            {
                "test_no": doc["test_no"],
                "test_date": (td.get("testDate") or "")[:10],
                "test_type": td.get("testType"),
                "test_performer": td.get("testPerformer"),
                "model_year": _num(vd.get("modelYear")),
                "make": vd.get("vehicleMake"),
                "model": vd.get("vehicleModel"),
                "body_type": vd.get("bodyType"),
                "test_weight_kg": _num(vd.get("vehicleTestWeight")),
                "curb_weight_kg": _num(vd.get("vehicleCurbWeight")),
                "length_mm": _num(vd.get("vehicleLength")),
                "width_mm": _num(vd.get("vehicleWidth")),
                "cg_behind_front_axle_mm": _num(
                    vd.get("vehiclecenterofGravityDistanceBehindFrontAxle")
                ),
                "speed_kmh": _num(vd.get("vehicleSpeed")),
                "closing_speed_kmh": _num(td.get("closingSpeed")),
                "impact_angle_deg": _num(td.get("impactAngle")),
                "pdof_deg": _num(vd.get("principalDirectionofForce")),
                "crabbed_angle_deg": _num(vd.get("crabbedAngle")),
                "barrier_rigid": bar.get("rigidOrDeformableBarrier"),
                "barrier_shape": bar.get("barrierShape"),
                "barrier_angle_deg": _num(bar.get("angleofFixedBarrier")),
                "pole_diameter_mm": _num(bar.get("diameterofPoleBarrier")),
                "offset_distance_mm": _num(td.get("offsetDistance")),
                "max_crush_mm": _num(vd.get("maximumCrushDistance")),
                "dpd1_mm": _num(vd.get("damageProfileDistancesOne")),
                "dpd2_mm": _num(vd.get("damageProfileDistancesTwo")),
                "dpd3_mm": _num(vd.get("damageProfileDistancesThree")),
                "dpd4_mm": _num(vd.get("damageProfileDistancesFour")),
                "dpd5_mm": _num(vd.get("damageProfileDistancesFive")),
                "dpd6_mm": _num(vd.get("damageProfileDistancesSix")),
                "total_indentation_length_mm": _num(vd.get("totalLengthofIndentation")),
                "damage_offset_mm": _num(vd.get("distancebetweencenterofDamagedareaandCGAxis")),
                "damage_index": vd.get("vehicleDamageIndex"),
                "vehicle_modification": vd.get("vehicleModificationIndicator"),
            }
        )
    return rows


def process(raw_dir: Path = RAW_DIR, csv_path: Path = CSV_PATH) -> int:
    """Convierte las respuestas crudas en ``vtb_tests.csv`` ordenado por prueba.

    Devuelve el número de filas escritas.
    """
    rows: list[dict[str, Any]] = []
    for path in sorted(raw_dir.glob("test_*.json"), key=lambda p: int(p.stem.split("_")[1])):
        rows.extend(rows_from_doc(json.loads(path.read_text(encoding="utf-8"))))
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in CSV_COLUMNS})
    return len(rows)


def iter_rows(csv_path: Path = CSV_PATH) -> Iterable[dict[str, str]]:
    with csv_path.open(encoding="utf-8", newline="") as f:
        yield from csv.DictReader(f)
