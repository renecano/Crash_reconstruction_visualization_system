"""CLI: ``uv run croquis-data atus download|process``."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from croquis_data import atus


def _utf8_stdout() -> None:
    # Windows PowerShell usa cp1252 por defecto y los nombres de ATUS llevan acentos.
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    _utf8_stdout()
    parser = argparse.ArgumentParser(prog="croquis-data", description="Datos externos de Croquis")
    sub = parser.add_subparsers(dest="source", required=True)

    p_atus = sub.add_parser("atus", help="INEGI ATUS (datos abiertos anuales)")
    atus_sub = p_atus.add_subparsers(dest="command", required=True)

    p_dl = atus_sub.add_parser("download", help="Descarga el zip y escribe manifest.json")
    p_dl.add_argument("--force", action="store_true", help="Vuelve a descargar aunque exista")
    p_dl.add_argument("--dest", type=Path, default=atus.RAW_DIR)

    p_pr = atus_sub.add_parser("process", help="Agrega los CSV anuales en data/processed/atus")
    p_pr.add_argument("--zip", type=Path, default=atus.RAW_DIR / atus.ZIP_NAME)
    p_pr.add_argument("--out", type=Path, default=atus.PROCESSED_DIR)
    p_pr.add_argument("--years", type=int, nargs="*", help="Años a procesar (todos por defecto)")

    args = parser.parse_args(argv)
    if args.command == "download":
        rec = atus.download(args.dest, force=args.force)
        print(f"{rec.path}: {rec.size} bytes, sha256 {rec.sha256}")
        return 0
    if args.command == "process":
        written = atus.process(args.zip, args.out, years=args.years or None, log=print)
        for name, path in written.items():
            print(f"{name}: {path}")
        return 0
    parser.error("comando desconocido")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
