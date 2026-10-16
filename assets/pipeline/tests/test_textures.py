"""Texturas de Poly Haven: lock, tamaño, formato y reconstrucción byte a byte (sin red)."""

import io
import json

from PIL import Image, ImageChops

from croquis_assets import textures


def _gray_spread(img: Image.Image) -> int:
    """Mayor diferencia entre canales (0 = gris exacto)."""
    r, g, b = img.convert("RGB").split()
    worst = 0
    for x, y in ((r, g), (g, b), (r, b)):
        hi = ImageChops.difference(x, y).getextrema()[1]
        assert isinstance(hi, int)  # imagen de un canal: (mín, máx) enteros
        worst = max(worst, hi)
    return worst


def test_el_lock_fija_los_tres_mapas_de_cada_textura() -> None:
    lock = json.loads(textures.LOCK.read_text(encoding="utf-8"))
    for t in textures.TEXTURAS:
        for mapa in textures.MAPS:
            entry = lock[t.polyhaven_id][mapa]
            assert entry["url"].startswith("https://dl.polyhaven.org/")
            assert entry["url"].endswith("_1k.jpg")
            assert len(entry["md5"]) == 32


def test_las_texturas_versionadas_son_webp_de_512_y_coinciden_con_el_manifiesto() -> None:
    manifest = json.loads((textures.OUT_DIR / "texturas.json").read_text(encoding="utf-8"))
    assert manifest["tamano_px"] == textures.SIZE == 512
    total = 0
    for t in textures.TEXTURAS:
        entry = manifest["texturas"][t.nombre]
        assert entry["licencia"] == "CC0 1.0"
        assert entry["autor"] == t.autor
        for mapa, info in entry["archivos"].items():
            data = (textures.OUT_DIR / info["archivo"]).read_bytes()
            total += len(data)
            img = Image.open(io.BytesIO(data))
            assert img.format == "WEBP"
            assert img.size == (512, 512)
            assert img.mode == "RGB"
            if mapa == "rough":
                # WebP no guarda un solo canal: la rugosidad va en gris. Con pérdida (YUV) los
                # canales difieren a lo más unos niveles; el material lee solo el rojo.
                assert _gray_spread(img) <= 3
    # Presupuesto de carga de E6 (≤ 8 MB al primer cuadro): las texturas son una fracción.
    assert total < 1_000_000


def test_codificar_es_determinista() -> None:
    img = Image.new("RGB", (1024, 1024))
    for x in range(0, 1024, 64):
        img.paste((x // 4, 255 - x // 4, 128), (x, 0, x + 32, 1024))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    raw = buf.getvalue()
    a = textures.encode(raw, "diff")
    assert a == textures.encode(raw, "diff")
    assert _gray_spread(Image.open(io.BytesIO(textures.encode(raw, "rough")))) <= 3
