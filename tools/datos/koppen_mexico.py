# /// script
# requires-python = ">=3.12,<3.14"
# dependencies = ["tifffile>=2025.5", "imagecodecs>=2025.3", "numpy>=2.2"]
# ///
"""Recorte de México del mapa Köppen-Geiger de 1 km (Beck et al. 2023, CC BY 4.0), solo «árido o no».

Respaldo del paisaje del 3D (`paisajeDelMapa` en packages/croquis-2d): cuando OpenStreetMap no trae
cobertura del suelo a 150 m, el clima del lugar decide. BWh, BWk, BSh y BSk (clases 4 a 7) son
«árido»; lo demás, «templado».

    curl -L -o koppen_geiger_tif.zip https://ndownloader.figshare.com/files/61012822
    unzip koppen_geiger_tif.zip 1991_2020/koppen_geiger_0p00833333.tif
    uv run tools/datos/koppen_mexico.py 1991_2020/koppen_geiger_0p00833333.tif \\
        packages/croquis-2d/src/data/koppen-mexico.json

Formato de salida: la rejilla del recorte (esquina noroeste, paso en grados, columnas y filas) y,
por fila de norte a sur, las corridas alternadas «no árido, árido, no árido…» que empiezan en «no
árido», como enteros sin signo LEB128 y luego en base64. Mismo archivo con la misma entrada.
"""

import base64
import json
import sys

import numpy as np
import tifffile

# México con un margen de 0.25°: de 118.5° O a 86.5° O y de 14.25° N a 32.75° N.
OESTE, ESTE, SUR, NORTE = -118.5, -86.5, 14.25, 32.75
ARIDAS = (4, 5, 6, 7)


def leb128(n: int) -> bytes:
    salida = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        salida.append(b | (0x80 if n else 0))
        if not n:
            return bytes(salida)


def main(tif: str, destino: str) -> None:
    with tifffile.TiffFile(tif) as t:
        pagina = t.pages[0]
        escala = pagina.tags["ModelPixelScaleTag"].value
        punto = pagina.tags["ModelTiepointTag"].value
        paso = float(escala[0])
        lon0, lat0 = float(punto[3]), float(punto[4])
        mapa = pagina.asarray()
    c0 = int(round((OESTE - lon0) / paso))
    c1 = int(round((ESTE - lon0) / paso))
    f0 = int(round((lat0 - NORTE) / paso))
    f1 = int(round((lat0 - SUR) / paso))
    arido = np.isin(mapa[f0:f1, c0:c1], ARIDAS)
    filas = []
    for fila in arido:
        cambios = np.flatnonzero(np.diff(fila.astype(np.int8))) + 1
        bordes = np.concatenate(([0], cambios, [fila.size]))
        corridas = np.diff(bordes).tolist()
        if fila[0]:
            corridas = [0, *corridas]
        filas.append(base64.b64encode(b"".join(leb128(n) for n in corridas)).decode())
    salida = {
        "fuente": "Beck et al. (2023), High-resolution (1 km) Köppen-Geiger maps for 1901–2099 based on constrained CMIP6 projections, Scientific Data 10, 724. 1991–2020, 0.00833°.",
        "licencia": "CC BY 4.0",
        "url": "https://doi.org/10.6084/m9.figshare.21789074",
        "aridas": ["BWh", "BWk", "BSh", "BSk"],
        "oeste": lon0 + c0 * paso,
        "norte": lat0 - f0 * paso,
        "paso": paso,
        "columnas": int(arido.shape[1]),
        "filas": filas,
    }
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"{destino}: {arido.shape[1]}×{arido.shape[0]} celdas, {arido.mean() * 100:.1f} % árido")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
