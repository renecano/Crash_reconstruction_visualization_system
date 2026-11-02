"""HDRI de Poly Haven: lock, manifiesto, decodificación RGBE y archivos versionados (sin red)."""

import hashlib
import json

import numpy as np

from croquis_assets import hdri


def _rgbe_sin_rle(img: np.ndarray) -> bytes:
    """Codifica un arreglo (alto, ancho, 3) lineal como RGBE sin RLE (ancho menor que 8)."""
    h, w, _ = img.shape
    out = bytearray(b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n" + f"-Y {h} +X {w}\n".encode())
    for y in range(h):
        for x in range(w):
            r, g, b = (float(v) for v in img[y, x])
            m = max(r, g, b)
            if m < 1e-32:
                out += bytes([0, 0, 0, 0])
                continue
            e = int(np.floor(np.log2(m))) + 1
            s = 256.0 / 2.0**e
            out += bytes([int(r * s), int(g * s), int(b * s), e + 128])
    return bytes(out)


def test_decodifica_rgbe_y_encuentra_el_azimut_del_sol() -> None:
    img = np.full((4, 6, 3), 0.25)
    img[0, 4] = [40.0, 38.0, 30.0]  # el sol, en la columna u = 0.75: hacia el sur
    dec = hdri.decode_rgbe(_rgbe_sin_rle(img))
    assert dec.shape == (4, 6, 3)
    assert np.allclose(dec, img, rtol=0.02)
    assert hdri.sun_azimuth_deg(dec) == 180.0


def test_el_lock_fija_el_hdr_de_1k_de_cada_cielo() -> None:
    lock = json.loads(hdri.LOCK.read_text(encoding="utf-8"))
    assert set(lock) == {h.polyhaven_id for h in hdri.HDRIS}
    for h in hdri.HDRIS:
        entry = lock[h.polyhaven_id]
        assert entry["url"].startswith("https://dl.polyhaven.org/")
        assert entry["url"].endswith(f"_{hdri.RESOLUCION}.hdr")
        assert len(entry["md5"]) == 32
        assert 0 < entry["bytes"] <= hdri.MAX_BYTES


def test_los_nombres_son_distintos_y_cubren_dia_nublado_crepusculo_y_noche() -> None:
    nombres = [h.nombre for h in hdri.HDRIS]
    assert len(nombres) == len(set(nombres))
    assert {"dia", "nublado", "crepusculo", "noche"} <= set(nombres)


def test_los_hdri_versionados_coinciden_con_el_manifiesto() -> None:
    manifest = json.loads((hdri.OUT_DIR / "hdri.json").read_text(encoding="utf-8"))
    assert manifest["resolucion"] == hdri.RESOLUCION
    assert set(manifest["hdri"]) == {h.nombre for h in hdri.HDRIS}
    total = 0
    for h in hdri.HDRIS:
        entry = manifest["hdri"][h.nombre]
        assert entry["licencia"] == "CC0 1.0"
        assert entry["autor"] == h.autor
        assert entry["url"] == f"https://polyhaven.com/a/{h.polyhaven_id}"
        data = (hdri.OUT_DIR / entry["archivo"]).read_bytes()
        assert data[:10] == b"#?RADIANCE", entry["archivo"]
        assert len(data) == entry["bytes"] <= hdri.MAX_BYTES
        assert hashlib.sha256(data).hexdigest() == entry["sha256"]
        assert 0 <= entry["azimut_sol_deg"] < 360
        total += len(data)
    # Cada escena carga un solo cielo; los cuatro juntos tampoco pasan del presupuesto (PLAN §7.8).
    assert total <= 8_000_000
