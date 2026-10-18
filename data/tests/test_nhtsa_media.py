"""Lista de multimedia de NHTSA y elección de la foto de la cara dañada (E5, F10)."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from croquis_data import nhtsa_ctd

PHOTOS: list[dict[str, Any]] = [
    {"fileName": "Photo No. 3. Pre-Test Front View of Test Vehicle.JPG"},
    {"fileName": "Photo No. 4.  Post-Test Front View of Test Vehicle.JPG"},
    {"fileName": "Photo No. 6. Post-Test Left Side View of Test Vehicle.JPG"},
    {"fileName": "Photo No. 10. Post-Test Left Front Three-Quarter View.JPG"},
    {"fileName": "POSTTEST_RIGHT_SIDE.jpg"},
    {"fileName": "Photo No. 15. Pre-Test Left Rear Three-Quarter View.JPG"},
]


def test_damaged_side_photo_picks_post_test_view_of_each_side() -> None:
    pick = nhtsa_ctd.damaged_side_photo
    assert pick(PHOTOS, "F")["fileName"].startswith("Photo No. 4.")  # type: ignore[index]
    assert "Left Side" in pick(PHOTOS, "L")["fileName"]  # type: ignore[index]
    assert pick(PHOTOS, "R")["fileName"] == "POSTTEST_RIGHT_SIDE.jpg"  # type: ignore[index]
    # Sin foto posterior de la parte trasera (solo hay una previa): None.
    assert pick(PHOTOS, "B") is None
    assert pick(PHOTOS, "X") is None


def test_front_does_not_take_a_three_quarter_view_when_pure_front_exists() -> None:
    photos = [
        {"fileName": "Post-Test Left Front Three-Quarter View.jpg"},
        {"fileName": "Post-Test Front View.jpg"},
    ]
    assert nhtsa_ctd.damaged_side_photo(photos, "F") == {"fileName": "Post-Test Front View.jpg"}


def _api(calls: list[str]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        body = {
            "results": [
                {
                    "photos": [
                        {
                            "fileName": "Post-Test Front View.JPG",
                            "fileSize": "123",
                            "media": "https://nrd-static.nhtsa.dot.gov/x.JPG",
                            "thumbnail": "https://nrd-static.nhtsa.dot.gov/x_t.JPG",
                            "index": 1,
                        }
                    ],
                    "reports": None,
                    "videos": None,
                }
            ]
        }
        return httpx.Response(200, json=body)

    return httpx.MockTransport(handler)


def test_fetch_media_keeps_only_needed_fields_and_caches(tmp_path: Path) -> None:
    calls: list[str] = []
    with httpx.Client(transport=_api(calls)) as client:
        doc = nhtsa_ctd.fetch_media(client, 15703, tmp_path)
        again = nhtsa_ctd.fetch_media(client, 15703, tmp_path)
    assert calls == [
        "/nhtsa/vehicle/api/v1/vehicle-database-test-results/get-multimedia-files/15703"
    ]
    assert doc == again
    assert doc["photos"] == [
        {
            "fileName": "Post-Test Front View.JPG",
            "fileSize": "123",
            "media": "https://nrd-static.nhtsa.dot.gov/x.JPG",
            "thumbnail": "https://nrd-static.nhtsa.dot.gov/x_t.JPG",
        }
    ]
    assert doc["reports"] == []
    assert (
        json.loads((tmp_path / "media_15703.json").read_text(encoding="utf-8"))["test_no"] == 15703
    )


def _csv(path: Path, rows: list[dict[str, str]]) -> None:
    cols = [
        "test_no",
        "body_type",
        *(f"dpd{i}_mm" for i in range(1, 7)),
        "total_indentation_length_mm",
    ]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})


@pytest.mark.parametrize("missing", ["dpd3_mm", "total_indentation_length_mm"])
def test_media_candidates_need_full_profile_and_skip_the_moving_barrier(
    tmp_path: Path, missing: str
) -> None:
    full = {f"dpd{i}_mm": "100" for i in range(1, 7)} | {"total_indentation_length_mm": "1500"}
    rows = [
        {"test_no": "1", "body_type": "FOUR DOOR SEDAN", **full},
        {"test_no": "2", "body_type": "NOT APPLICABLE", **full},  # la barrera móvil
        {"test_no": "3", "body_type": "PICKUP", **(full | {missing: ""})},
    ]
    _csv(tmp_path / "a.csv", rows)
    assert nhtsa_ctd.media_candidates([tmp_path / "a.csv", tmp_path / "no-existe.csv"]) == [1]
