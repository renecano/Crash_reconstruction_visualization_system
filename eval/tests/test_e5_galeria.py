"""Galería de E5: lectura de la lista de fotografías de los reportes de NHTSA (ADR 0032)."""

from __future__ import annotations

import pytest

from croquis_eval import e5_galeria as g

REPORT = """
Photo No. 009 Post-Test Front View of Test Vehicle A-5
Photo No. 011 Post-Test Left View of Test Vehicle A-6
Photo No. 013 Post-Test Right View of Test Vehicle A-7
Photo No. 015 Post-Test Right Front 3-4 View A-8
Photo No. 017 Post-Test Left Rear 3-4 View A-9
Photo No. 025 Post-Test Front Underbody View A-13
Photo No. 031 Post-Test Driver Dummy Front View A-16
10 Post-Test Observations 19
"""


def test_photo_list_reads_numbers_and_captions_without_page_numbers() -> None:
    lista = dict(g.photo_list(REPORT))
    assert lista[9] == "Post-Test Front View of Test Vehicle"
    assert lista[15] == "Post-Test Right Front 3-4 View"
    assert 31 in lista  # se lee, pero no es una vista exterior (ver abajo)


@pytest.mark.parametrize(
    ("side", "numero"),
    [("F", 9), ("L", 11), ("R", 13), ("B", 17)],
)
def test_best_view_of_the_damaged_face(side: str, numero: int) -> None:
    hit = g.from_report(REPORT, side)
    assert hit is not None
    assert hit[0] == numero


@pytest.mark.parametrize(
    ("caption", "side", "rank"),
    [
        ("Post-Test Front View of Test Vehicle", "F", 0),
        ("Post-Test Left Front ¾ View of Test Vehicle", "F", 1),
        ("Post-Test Left Front ¾ View of Test Vehicle", "L", 1),
        ("Post-Test Left Side View", "L", 0),
        ("Post-Test Left Side View", "R", None),
        ("Post-Test Driver Dummy Front View", "F", None),
        ("Post-Test Front Underbody View", "F", None),
        ("Post-Test Left Side View of Position 3 CRS", "L", None),
        ("Pre-Test Front View", "F", None),
    ],
)
def test_view_rank(caption: str, side: str, rank: int | None) -> None:
    assert g.view_rank(caption, side) == rank


def test_numbered_file_with_and_without_zero_padding() -> None:
    photos = [{"fileName": "v04887P007.jpg"}, {"fileName": "v10174P009.JPG"}]
    assert g._numbered(photos, 4887, 7) == photos[0]  # pyright: ignore[reportPrivateUsage]
    assert g._numbered(photos, 10174, 9) == photos[1]  # pyright: ignore[reportPrivateUsage]
    assert g._numbered(photos, 10174, 90) is None  # pyright: ignore[reportPrivateUsage]
