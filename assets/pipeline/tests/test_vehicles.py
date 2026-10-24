"""Vehículos de Sketchfab (R10, ADR 0086): licencias, manifiesto y archivos versionados."""

from __future__ import annotations

import json
from typing import Any

import pytest

from croquis_assets import vehicles

MODELO = vehicles.MODELOS[0]


def _detalle(**cambios: Any) -> dict[str, Any]:
    base: dict[str, Any] = {"uid": MODELO.uid, "isDownloadable": True, "license": {"slug": "by"}}
    return {**base, **cambios}


@pytest.mark.parametrize("slug", ["by", "cc0"])
def test_acepta_cc_by_y_cc0(slug: str) -> None:
    assert vehicles.verificar_licencia(_detalle(license={"slug": slug}), MODELO) == slug


@pytest.mark.parametrize(
    "slug", ["by-nc", "by-nd", "by-sa", "by-nc-sa", "st", "free-st", "ed", None]
)
def test_rechaza_nc_nd_sa_y_de_pago(slug: str | None) -> None:
    with pytest.raises(ValueError, match="no permitida"):
        vehicles.verificar_licencia(_detalle(license={"slug": slug}), MODELO)


def test_rechaza_si_ya_no_se_puede_descargar_o_es_otro_modelo() -> None:
    with pytest.raises(ValueError, match="descargable"):
        vehicles.verificar_licencia(_detalle(isDownloadable=False), MODELO)
    with pytest.raises(ValueError, match="uid"):
        vehicles.verificar_licencia(_detalle(uid="otro"), MODELO)


def test_un_modelo_por_clase() -> None:
    clases = [m.clase for m in vehicles.MODELOS]
    assert sorted(clases) == ["camion", "hatchback", "moto", "pickup", "sedan", "suv"]
    assert len({m.uid for m in vehicles.MODELOS}) == len(clases)


def test_los_archivos_versionados_coinciden_con_el_manifiesto() -> None:
    assert vehicles.check() == []


def test_el_manifiesto_trae_licencia_ruedas_y_limpieza() -> None:
    m = json.loads(vehicles.MANIFIESTO.read_text(encoding="utf-8"))
    lock = json.loads(vehicles.LOCK.read_text(encoding="utf-8"))
    for clase, c in m["clases"].items():
        assert c["modelo"]["licencia"] in {"CC-BY 4.0", "CC0 1.0"}
        assert c["modelo"]["licencia"] == lock[clase]["licencia"]
        assert set(c["archivos"]) == {"alta", "ligero", "blender"}
        # La versión ligera (calidad media) pesa menos que la de alta.
        assert c["archivos"]["ligero"]["bytes"] <= c["archivos"]["alta"]["bytes"]
        nombres = [r["nombre"] for r in c["ruedas"]]
        if clase == "moto":
            assert nombres == ["wheel_f", "wheel_r"]
        else:
            assert nombres == ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"]
            # Los modelos de Daniel Zhabotinsky traen placas y emblemas: se quitan (regla 5).
            assert c["quitados"], clase
            assert all("Numberplate" in q or "NP_" in q or "Badges" in q for q in c["quitados"])
        for r in c["ruedas"]:
            # Cada rueda toca el piso: su centro está a la altura de su radio.
            assert r["centro"][2] == pytest.approx(r["radio"], abs=0.01)
        assert c["papeles"].get("pintura", 0) >= 1
        assert 1.5 < c["largo_m"] < 8
