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
    assert sorted(clases) == [
        "autobus",
        "camion",
        "combi",
        "hatchback",
        "moto",
        "pickup",
        "sedan",
        "suv",
        "tracto",
        "van",
    ]
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
        modelo = next(m for m in vehicles.MODELOS if m.clase == clase)
        if clase == "moto":
            assert nombres == ["wheel_f", "wheel_r"]
        elif modelo.generico:
            # Genéricos (T1.4): al menos un eje delantero y uno trasero, de los dos lados.
            assert {"wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"} <= set(nombres), clase
        else:
            assert nombres == ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"]
            # Los modelos de Daniel Zhabotinsky traen placas y emblemas: se quitan (regla 5).
            assert c["quitados"], clase
            assert all("Numberplate" in q or "NP_" in q or "Badges" in q for q in c["quitados"])
        for r in c["ruedas"]:
            # Cada rueda toca el piso: su centro está a la altura de su radio (la Shvan '92 trae
            # las ruedas izquierdas 1.2 cm más altas que las derechas: es del modelo).
            assert r["centro"][2] == pytest.approx(r["radio"], abs=0.015)
        assert c["papeles"].get("pintura", 0) >= 1
        assert 1.5 < c["largo_m"] < 13


def _glb_json(nombre: str) -> dict[str, Any]:
    datos = (vehicles.OUT_DIR / nombre).read_bytes()
    largo = int.from_bytes(datos[12:16], "little")
    return json.loads(datos[20 : 20 + largo])


@pytest.mark.parametrize("clase", [m.clase for m in vehicles.MODELOS])
def test_cada_version_trae_lo_que_espera_el_visor(clase: str) -> None:
    m = json.loads(vehicles.MANIFIESTO.read_text(encoding="utf-8"))["clases"][clase]
    for variante, a in m["archivos"].items():
        g = _glb_json(a["archivo"])
        requeridas = set(g.get("extensionsRequired", []))
        assert "KHR_draco_mesh_compression" in requeridas
        # La moto y el tractocamión no traen texturas; los demás, en KTX2 (en WebP la versión
        # para Blender).
        con_texturas = bool(g.get("images"))
        if variante == "blender":
            assert "KHR_texture_basisu" not in requeridas
            if con_texturas:
                assert "EXT_texture_webp" in set(g.get("extensionsUsed", []))
        elif con_texturas:
            assert "KHR_texture_basisu" in requeridas
        nodos: list[dict[str, Any]] = g["nodes"]

        def extras(n: dict[str, Any]) -> dict[str, Any]:
            return n.get("extras") or {}

        nombres = {n.get("name", "") for n in nodos}
        # Sin placas ni emblemas (regla 5).
        assert not any("Numberplate" in n or "Badges" in n or "NP_" in n for n in nombres)
        papeles = {extras(n).get("role") for n in nodos}
        assert {"pintura", "rueda"} <= papeles
        ruedas = [n for n in nodos if n.get("name", "").startswith("wheel_") and "mesh" not in n]
        assert all(extras(n).get("radius", 0) > 0 for n in ruedas)
        modelo = next(mm for mm in vehicles.MODELOS if mm.clase == clase)
        if clase == "moto":
            assert len(ruedas) == 2
        elif modelo.generico:
            # Genéricos (T1.4): ejes dobles con más de cuatro ruedas (el tractocamión).
            assert len(ruedas) >= 4
        else:
            assert len(ruedas) == 4
        if clase != "moto" and modelo.generico and not m["papeles"].get("faro"):
            # Genéricos sin faros separables (ADR 0097, límites): solo el parabrisas.
            assert "windshield" in nombres
        elif clase != "moto":
            assert {"windshield", "headlight_l", "headlight_r"} <= nombres
