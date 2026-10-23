"""Comparación de voces locales para el video demo de CESVI (pedido de CESVI, 2026-10-22).

El mismo fragmento del guion (unos 20 s), con Piper (la voz actual) y con las voces en español de
Kokoro-82M (Apache-2.0), en `demo/video/salida/muestras/`. Lo que se puede medir sin oído humano:
- **Acento:** los fonemas de Kokoro con espeak «es» (castellano: «veloθidad») y «es-419»
  (latinoamericano: «velosidad»). Para peritos de México va «es-419».
- **Inteligibilidad:** Whisper (faster-whisper «small», español) transcribe cada muestra y se mide
  el WER contra el texto. Menor es mejor. No mide naturalidad: eso lo decide quien escucha.
- **Duración y tiempo de síntesis** en esta laptop.

Herramientas fuera del repositorio (ver docs/PROGRESS.md, «Voz del video»):
- Piper en D:/dev-cache/tools/piper-venv, voz es_MX-claude-high;
- Kokoro (kokoro-onnx 0.6.1) y faster-whisper 1.2.1 en D:/dev-cache/tools/kokoro-venv, con los
  modelos en D:/dev-cache/tools/kokoro-voices.

Piper muestrea ruido al sintetizar (VITS): cada corrida suena un poco distinta, así que se mide
tres veces. Kokoro sale igual cada vez (se comprueba con dos síntesis de «ef_dora»).

Uso (desde la raíz):
  HF_HOME=D:/dev-cache/hf D:/dev-cache/tools/kokoro-venv/Scripts/python.exe -I -X utf8 \
    eval/voz_video.py
  → eval/results/voz_video.json
"""

import json
import os
import re
import subprocess
import time
import unicodedata
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel
from kokoro_onnx import Kokoro

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "demo/video/salida/muestras"
HERRAMIENTAS = Path("D:/dev-cache/tools")
PIPER = HERRAMIENTAS / "piper-venv/Scripts/piper.exe"
PIPER_VOZ = HERRAMIENTAS / "piper-voices/es_MX-claude-high.onnx"
KOKORO = HERRAMIENTAS / "kokoro-voices/kokoro-v1.0.onnx"
KOKORO_VOCES = HERRAMIENTAS / "kokoro-voices/voices-v1.0.bin"
FFMPEG = HERRAMIENTAS / "ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe"

# Del guion (docs/cesvi/video/guion.md, segmentos «caso» y «hecho-ejemplo»), con las cifras en letra
# para que el WER no dependa de si Whisper escribe «15» o «quince».
TEXTO = (
    "Este es un caso real de CESVI: un alcance en la carretera federal quince, entre una Silverado "
    "y una Tacoma. Ustedes ya lo analizaron en su reporte. Vamos a ver si Croquis llega a lo "
    "mismo. Paso dos. El perito escribe su narración técnica, como la escribe en un reporte, y "
    "Croquis la lee con el vocabulario de los reportes de CESVI."
)


def normaliza(t: str) -> list[str]:
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9ñ ]+", " ", t).split()


def wer(ref: list[str], hip: list[str]) -> float:
    d = list(range(len(hip) + 1))
    for i, r in enumerate(ref, 1):
        prev, d[0] = d[0], i
        for j, h in enumerate(hip, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (r != h))
    return d[len(hip)] / len(ref)


def audio_16k(wav: Path) -> np.ndarray:
    """El WAV a 16 kHz mono en float32, como lo pide Whisper (ffmpeg del video, no PyAV)."""
    crudo = subprocess.run(
        [
            str(FFMPEG),
            "-v",
            "error",
            "-i",
            str(wav),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "f32le",
            "-",
        ],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(crudo, dtype=np.float32)


def caracteres_del_guion() -> int:
    """Los caracteres que lee la voz: los segmentos del guion sin indicaciones (como comun.mjs)."""
    md = (RAIZ / "docs/cesvi/video/guion.md").read_text(encoding="utf-8")
    total = 0
    for parte in re.split(r"^## ", md, flags=re.M)[1:]:
        lineas = parte.splitlines()[1:]
        texto = " ".join(lin for lin in lineas if lin.strip() and not lin.startswith(">"))
        total += len(re.sub(r"\s+", " ", texto).strip())
    return total


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    (SALIDA / "texto.txt").write_text(TEXTO, encoding="utf-8")
    muestras: list[dict] = []

    for n in (1, 2, 3):
        t0 = time.perf_counter()
        piper = SALIDA / f"piper-es_MX-claude-high-{n}.wav"
        subprocess.run(
            [str(PIPER), "-m", str(PIPER_VOZ), "-f", str(piper)],
            input=TEXTO,
            text=True,
            encoding="utf-8",
            check=True,
            capture_output=True,
            # Sin PYTHONUTF8, Piper lee la entrada como ANSI en Windows y dice «narraci-A tilde…».
            env={**os.environ, "PYTHONUTF8": "1"},
        )
        muestras.append(
            {
                "voz": "piper/es_MX-claude-high",
                "corrida": n,
                "wav": piper,
                "sintesis_s": time.perf_counter() - t0,
            }
        )

    k = Kokoro(str(KOKORO), str(KOKORO_VOCES))
    acento = {
        lang: k.tokenizer.phonemize("La velocidad de impacto es de quince kilómetros.", lang)
        for lang in ("es", "es-419")
    }
    voces = sorted(v for v in k.get_voices() if v.startswith(("ef_", "em_")))
    for v in voces:
        t0 = time.perf_counter()
        audio, sr = k.create(TEXTO, voice=v, speed=1.0, lang="es-419")
        wav = SALIDA / f"kokoro-{v}-es419.wav"
        sf.write(wav, audio, sr)
        muestras.append(
            {
                "voz": f"kokoro/{v} (es-419)",
                "corrida": 1,
                "wav": wav,
                "sintesis_s": time.perf_counter() - t0,
            }
        )
    una, _ = k.create(TEXTO, voice="ef_dora", speed=1.0, lang="es-419")
    otra, _ = k.create(TEXTO, voice="ef_dora", speed=1.0, lang="es-419")
    kokoro_igual = bool(np.array_equal(una, otra))

    modelo = WhisperModel("small", device="cpu", compute_type="int8")
    ref = normaliza(TEXTO)
    for m in muestras:
        info = sf.info(m["wav"])
        segs, _ = modelo.transcribe(
            audio_16k(m["wav"]), language="es", beam_size=5, temperature=0.0
        )
        texto = " ".join(s.text.strip() for s in segs)
        m.update(
            wav=m["wav"].relative_to(RAIZ).as_posix(),
            duracion_s=round(info.duration, 2),
            muestreo_hz=info.samplerate,
            sintesis_s=round(m["sintesis_s"], 2),
            transcripcion=texto,
            wer_pct=round(100 * wer(ref, normaliza(texto)), 1),
        )
        print(f"{m['voz']}: {m['duracion_s']} s, WER {m['wer_pct']} %")

    out = {
        "fecha": datetime.now(UTC).isoformat(timespec="seconds"),
        "descripcion": (
            "Voces locales para el video demo: mismo fragmento del guion con Piper (tres "
            "corridas) y Kokoro-82M (es-419). WER de Whisper small en español (menor es mejor; "
            "mide inteligibilidad, no naturalidad) y fonemas de Kokoro con espeak «es» contra "
            "«es-419»."
        ),
        "texto": TEXTO,
        "caracteres_del_guion": caracteres_del_guion(),
        "palabras": len(ref),
        "asr": "faster-whisper 1.2.1, modelo small, int8, CPU, beam 5, temperatura 0",
        "acento_kokoro_fonemas": acento,
        "kokoro_ef_dora_igual_en_dos_sintesis": kokoro_igual,
        "muestras": muestras,
    }
    destino = RAIZ / "eval/results/voz_video.json"
    destino.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
