"""Hash del relato.

El texto completo del relato solo vive en el dispositivo salvo consentimiento (PLAN §4.1, §10).
Lo que viaja y se guarda es este hash, que además se imprime en la leyenda de cada exportación.
"""

import hashlib
import unicodedata


def normalize_story(text: str) -> str:
    """Normaliza Unicode (NFC), saltos de línea y espacios al final para que el hash sea estable."""
    nfc = unicodedata.normalize("NFC", text)
    return "\n".join(line.rstrip() for line in nfc.replace("\r\n", "\n").split("\n")).strip()


def story_hash(text: str) -> str:
    """SHA-256 hexadecimal del relato normalizado."""
    return hashlib.sha256(normalize_story(text).encode("utf-8")).hexdigest()
