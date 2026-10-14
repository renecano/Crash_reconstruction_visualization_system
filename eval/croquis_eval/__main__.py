"""CLI: ``uv run croquis-eval atus-summary``."""

from __future__ import annotations

import argparse
import sys


def main(argv: list[str] | None = None) -> int:
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="croquis-eval", description="Evaluaciones de Croquis")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser(
        "atus-summary", help="Escribe eval/results/atus_summary.json desde data/processed/atus"
    )
    sub.add_parser("e2-barrier", help="E2: rigidez CRASH3 por clase desde pruebas de NHTSA")
    sub.add_parser("e4-pedestrian", help="E4: proyección de peatones contra casos publicados")
    args = parser.parse_args(argv)
    if args.command == "atus-summary":
        from croquis_eval.atus_summary import main as run

        print(run())
        return 0
    if args.command == "e2-barrier":
        from croquis_eval.e2_barrier import main as run_e2

        print(run_e2())
        return 0
    if args.command == "e4-pedestrian":
        from croquis_eval.e4_pedestrian import main as run_e4

        print(run_e4())
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
