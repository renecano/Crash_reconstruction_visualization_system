"""CLI: `uv run croquis-extraction relatos build|check|freeze|stats`."""

from __future__ import annotations

import argparse
import json
import sys


def main(argv: list[str] | None = None) -> int:
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="croquis-extraction")
    sub = parser.add_subparsers(dest="group", required=True)
    r = sub.add_parser("relatos", help="Benchmark Relatos-MX")
    r.add_argument("action", choices=["build", "check", "freeze", "stats"])
    args = parser.parse_args(argv)

    from croquis_extraction import relatos_mx

    items = relatos_mx.load_all()
    if args.action == "stats":
        print(json.dumps(relatos_mx.stats(items), ensure_ascii=False, indent=2))
        return 0
    probs = relatos_mx.problems(items)
    if probs:
        print("\n".join(probs), file=sys.stderr)
        return 1
    if args.action == "build":
        relatos_mx.write()
        print(f"{len(items)} relatos construidos en data/relatos-mx/build/")
        return 0
    if args.action == "check":
        stale = relatos_mx.write(check=True)
        if stale:
            print("Desactualizados: " + ", ".join(stale), file=sys.stderr)
            return 1
        frozen = relatos_mx.frozen_hash()
        if frozen is not None and frozen != relatos_mx.test_hash():
            print("El test congelado cambió (test.lock no coincide).", file=sys.stderr)
            return 1
        print("Relatos-MX al día" + (" y test congelado intacto." if frozen else "."))
        return 0
    h = relatos_mx.freeze()
    print(f"Test congelado: {h}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
