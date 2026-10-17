"""CLI del solver: `croquis-solver reconstruct ...`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from croquis_scene_schema import load_fixture
from croquis_solver.reconstruct import reconstruct
from croquis_solver.results_io import check_all, write_all


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="croquis-solver", description="Solver de Croquis")
    sub = parser.add_subparsers(dest="command", required=True)
    rec = sub.add_parser("reconstruct", help="Reconstruye escenas")
    rec.add_argument("escena", nargs="?", help="Nombre de una escena canónica")
    rec.add_argument("--all", action="store_true", help="Las escenas canónicas → resultados/")
    rec.add_argument("--check", action="store_true", help="Falla si los resultados no están al día")
    rec.add_argument("--json", type=Path, help="EscenaSpec en un archivo JSON")
    args = parser.parse_args(argv)

    if args.all or args.check:
        if args.check:
            bad = check_all()
            for name, diff in bad.items():
                print(f"{name}: {len(diff)} diferencias; primeras: {diff[:3]}", file=sys.stderr)
            if bad:
                print("Corre `uv run croquis-solver reconstruct --all`.", file=sys.stderr)
                return 1
            print("Resultados de las escenas canónicas al día.")
            return 0
        for path in write_all():
            print(path)
        return 0
    if args.json:
        spec = json.loads(args.json.read_text(encoding="utf-8"))
    elif args.escena:
        spec = load_fixture(args.escena)
    else:
        parser.error("Indica una escena, --json o --all")
    sys.stdout.write(reconstruct(spec).to_json() + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
