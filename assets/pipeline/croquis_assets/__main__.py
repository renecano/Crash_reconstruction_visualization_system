"""CLI: `uv run croquis-assets humans download|build|check`."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
from pathlib import Path

import httpx

from croquis_assets import humans


def download() -> int:
    files: dict[str, dict[str, object]] = {}
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        for repo_path in humans.required_files():
            dest = humans.local_path(repo_path)
            if not dest.exists():
                r = client.get(humans.REPO_URL + repo_path)
                r.raise_for_status()
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(r.content)
            data = dest.read_bytes()
            files[repo_path] = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
    lock = {
        "_generado_por": "uv run croquis-assets humans download",
        "repositorio": "https://github.com/makehumancommunity/makehuman",
        "commit": humans.COMMIT,
        "licencia": "CC0 1.0 Universal (LICENSE.ASSETS.md del repositorio)",
        "archivos": files,
    }
    if humans.LOCK_PATH.exists():
        old = json.loads(humans.LOCK_PATH.read_text(encoding="utf-8"))
        if old.get("archivos") != files:
            print("Los archivos descargados no coinciden con el candado.", file=sys.stderr)
            return 1
    humans.LOCK_PATH.write_text(
        json.dumps(lock, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"{len(files)} archivos verificados en {humans.RAW_DIR}")
    return 0


def build() -> int:
    errors = humans.check_lock()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    m = humans.build_all()
    for v in m["variantes"]:
        print(
            f"{v['archivo']}: {v['vertices']} vértices, {v['triangulos']} triángulos, "
            f"{v['bytes']} bytes"
        )
    return 0


def check() -> int:
    """Reconstruye en una carpeta temporal y compara byte a byte con lo versionado."""
    errors = humans.check_lock()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    with tempfile.TemporaryDirectory() as tmp:
        humans.build_all(Path(tmp))
        bad = [
            f.name
            for f in sorted(Path(tmp).iterdir())
            if not (humans.OUT_DIR / f.name).exists()
            or (humans.OUT_DIR / f.name).read_bytes() != f.read_bytes()
        ]
    if bad:
        print("Desactualizados: " + ", ".join(bad), file=sys.stderr)
        return 1
    print("Cuerpos al día.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="croquis-assets")
    sub = parser.add_subparsers(dest="group", required=True)
    h = sub.add_parser("humans", help="Cuerpos de MakeHuman (CC0) para el visor")
    h.add_argument("action", choices=["download", "build", "check"])
    tx = sub.add_parser("textures", help="Texturas PBR de Poly Haven (CC0) para el entorno")
    tx.add_argument("action", choices=["download", "build", "check"])
    vh = sub.add_parser("vehicles", help="Vehículos de Sketchfab (CC-BY o CC0) para R10")
    vh.add_argument("action", choices=["download", "build", "check"])
    args = parser.parse_args(argv)
    if args.group == "textures":
        return _textures(args.action)
    if args.group == "vehicles":
        return _vehicles(args.action)
    return {"download": download, "build": build, "check": check}[args.action]()


def _textures(action: str) -> int:
    from croquis_assets import textures

    if action == "download":
        print(f"{len(textures.download())} mapas descargados y verificados (MD5 del lock)")
        return 0
    if action == "build":
        print(f"{len(textures.build())} archivos escritos en {textures.OUT_DIR}")
        return 0
    bad = textures.check()
    if bad:
        print("Desactualizados: " + ", ".join(bad), file=sys.stderr)
        return 1
    print("Texturas al día.")
    return 0


def _vehicles(action: str) -> int:
    from croquis_assets import vehicles

    if action == "download":
        rutas = vehicles.download()
        print(f"{len(rutas)} modelos descargados y verificados (licencia y SHA-256 del lock)")
        return 0
    if action == "build":
        m = vehicles.build()
        for clase, c in m["clases"].items():
            tam = ", ".join(f"{v} {a['bytes'] / 1e6:.2f} MB" for v, a in c["archivos"].items())
            print(f"{clase}: {c['caras']} caras; {tam}; quitados: {len(c['quitados'])}")
        return 0
    errores = vehicles.check()
    if errores:
        print("\n".join(errores), file=sys.stderr)
        return 1
    print("Vehículos al día.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
