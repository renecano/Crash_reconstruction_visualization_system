"""CLI: ``uv run croquis-eval atus-summary``."""

from __future__ import annotations

import argparse
import sys


def main(argv: list[str] | None = None) -> int:
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8")
    from croquis_extraction.claude_client import PROMPT_VERSION, PROMPT_VERSIONS

    parser = argparse.ArgumentParser(prog="croquis-eval", description="Evaluaciones de Croquis")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser(
        "atus-summary", help="Escribe eval/results/atus_summary.json desde data/processed/atus"
    )
    sub.add_parser("e2-barrier", help="E2: rigidez CRASH3 por clase desde pruebas de NHTSA")
    sub.add_parser(
        "e2-mdb",
        help="E2 lateral y trasera: rigidez desde pruebas de barrera móvil de NHTSA",
    )
    sub.add_parser("e4-pedestrian", help="E4: proyección de peatones contra casos publicados")
    sub.add_parser("e3-ciss", help="E3: ΔV desde el daño contra el EDR y WinSmash (NHTSA CISS)")
    sub.add_parser("f7-inversion", help="F7: inversión, consistencia y tiempos en las escenas")
    e1 = sub.add_parser("e1-extraction", help="E1: extracción del relato en Relatos-MX")
    e1.add_argument("--split", choices=["dev", "test", "ciss"], default="test")
    e1.add_argument(
        "--pipeline",
        choices=["ts", "py"],
        default="ts",
        help="ts: el pipeline de producción (por omisión); py: la referencia Python, para comparar",
    )
    e1.add_argument(
        "--prompt",
        choices=list(PROMPT_VERSIONS),
        default=PROMPT_VERSION,
        help="Versión del prompt cuyas respuestas grabadas se puntúan (por omisión, la de "
        "producción)",
    )
    args = parser.parse_args(argv)
    if args.command == "atus-summary":
        from croquis_eval.atus_summary import main as run

        print(run())
        return 0
    if args.command == "e2-barrier":
        from croquis_eval.e2_barrier import main as run_e2

        print(run_e2())
        return 0
    if args.command == "e2-mdb":
        from croquis_eval.e2_mdb import main as run_e2_mdb

        print(run_e2_mdb())
        return 0
    if args.command == "e1-extraction":
        from croquis_eval.e1_extraction import main as run_e1

        print(run_e1(args.split, args.pipeline, args.prompt))
        return 0
    if args.command == "e3-ciss":
        from croquis_eval.e3_ciss import main as run_e3

        print(run_e3())
        return 0
    if args.command == "f7-inversion":
        from croquis_eval.f7_inversion import main as run_f7

        print(run_f7())
        return 0
    if args.command == "e4-pedestrian":
        from croquis_eval.e4_pedestrian import main as run_e4

        print(run_e4())
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
