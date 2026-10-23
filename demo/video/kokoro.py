"""La voz del video con Kokoro-82M (Apache-2.0, ver assets/ASSETS.md), para `voz.mjs`.

Lee de la entrada estándar `{"carpeta", "voz", "segmentos": [{"id", "texto"}]}` y escribe
`<carpeta>/<id>.wav` por segmento. El acento es «es-419» (latinoamericano, con seseo): con «es»,
espeak pronuncia en castellano («veloθidad»), que no es como hablan los peritos de CESVI
(eval/results/voz_video.json).

Corre con el Python donde están kokoro-onnx y soundfile (CROQUIS_KOKORO_PYTHON en voz.mjs).
"""

import json
import os
import sys
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

MODELOS = Path(os.environ.get("CROQUIS_KOKORO_MODELOS", "D:/dev-cache/tools/kokoro-voices"))

pedido = json.loads(sys.stdin.buffer.read().decode("utf-8"))
k = Kokoro(str(MODELOS / "kokoro-v1.0.onnx"), str(MODELOS / "voices-v1.0.bin"))
for s in pedido["segmentos"]:
    audio, sr = k.create(s["texto"], voice=pedido["voz"], speed=1.0, lang="es-419")
    sf.write(Path(pedido["carpeta"]) / f"{s['id']}.wav", audio, sr)
    print(s["id"], flush=True)
