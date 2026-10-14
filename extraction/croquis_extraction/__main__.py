"""CLI: `croquis-extraction relatos …`, `golden build|check` y `claude record` (ver --help)."""

from __future__ import annotations

import argparse
import json
import sys

REPEAT_SUFFIX = "-rep"


def _record(split: str, model: str | None, limit: int | None, repeat: bool = False) -> int:
    """Graba (o salta si ya existe) la respuesta de cada relato y contrafactual del split.

    Con `repeat`, graba una segunda respuesta de cada relato base con el mismo texto (clave
    `<id>-rep`): mide cuánto varía el modelo consigo mismo, el piso de ruido del contrafactual.
    """
    from croquis_extraction import claude_client as cc
    from croquis_extraction import relatos_mx
    from croquis_extraction.pii import redact

    models = [model] if model else list(cc.MODELS)
    if repeat:
        rows = [{**x, "id": x["id"] + REPEAT_SUFFIX} for x in relatos_mx.load_split(split)]
    else:
        rows = relatos_mx.load_split(split) + [
            x for x in relatos_mx.load_split("contrafactuales") if x["split"] == split
        ]
    if limit is not None:
        rows = rows[:limit]
    spent = 0.0
    for m in models:
        done = 0
        for row in rows:
            text = redact(row["texto"]).text
            try:
                cc.load_recording(m, row["id"], text)
                continue  # ya grabada y vigente
            except cc.LLMError:
                pass
            try:
                rec = cc.extract(text, row["id"], m, mode="record")
            except cc.BudgetExceededError as e:
                print(f"Detenido: {e}", file=sys.stderr)
                return 2
            spent += float(rec["costo_usd"])
            done += 1
        print(f"{m}: {done} grabadas")
    print(f"Gasto de esta corrida: {spent:.4f} USD")
    return 0


def main(argv: list[str] | None = None) -> int:
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="croquis-extraction")
    sub = parser.add_subparsers(dest="group", required=True)
    r = sub.add_parser("relatos", help="Benchmark Relatos-MX")
    r.add_argument("action", choices=["build", "check", "freeze", "stats"])
    g = sub.add_parser("golden", help="Salidas doradas para la paridad del port TS")
    g.add_argument("action", choices=["build", "check"])
    c = sub.add_parser("claude", help="Graba respuestas de Claude para E1 (requiere llave)")
    c.add_argument("action", choices=["record"])
    c.add_argument("--split", choices=["dev", "test"], required=True)
    c.add_argument("--model", default=None, help="claude-sonnet-5-5 o claude-haiku-5-5")
    c.add_argument("--limit", type=int, default=None)
    c.add_argument(
        "--repetir",
        action="store_true",
        help="Segunda respuesta de cada relato base con el mismo texto (piso de ruido)",
    )
    args = parser.parse_args(argv)

    if args.group == "claude":
        return _record(args.split, args.model, args.limit, args.repetir)

    if args.group == "golden":
        from croquis_extraction import golden

        if args.action == "check":
            if not golden.write(check=True):
                print(
                    "packages/extraction/fixtures/golden.json desactualizado: corre "
                    "`uv run croquis-extraction golden build`.",
                    file=sys.stderr,
                )
                return 1
            print("Salidas doradas al día.")
            return 0
        golden.write()
        print("Salidas doradas escritas en packages/extraction/fixtures/golden.json")
        return 0

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
        if frozen is not None and frozen != relatos_mx.split_hash():
            print("El test congelado cambió (test.lock no coincide).", file=sys.stderr)
            return 1
        print("Relatos-MX al día" + (" y test congelado intacto." if frozen else "."))
        return 0
    h = relatos_mx.freeze()
    print(f"Test congelado: {h}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
