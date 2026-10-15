"""CLI: ``uv run croquis-data <fuente> <comando>`` (ver --help)."""

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

    p_veh = sub.add_parser("vehicles", help="Tabla de rangos por clase de vehículo")
    veh_sub = p_veh.add_subparsers(dest="command", required=True)
    p_vb = veh_sub.add_parser("build", help="Escribe packages/scene-schema/vehicle_classes.json")
    p_vb.add_argument("--check", action="store_true", help="Solo verifica que esté al día")

    p_nh = sub.add_parser("nhtsa", help="NHTSA Vehicle Crash Test Database (API pública)")
    nh_sub = p_nh.add_subparsers(dest="command", required=True)
    p_nd = nh_sub.add_parser(
        "download", help="Descarga las pruebas de una configuración a data/raw/nhtsa"
    )
    p_nd.add_argument("--workers", type=int, default=4)
    p_nd.add_argument("--limit", type=int, default=None, help="Solo las primeras N pruebas")
    p_np = nh_sub.add_parser(
        "process", help="Escribe data/processed/nhtsa/vtb_tests.csv o itv_tests.csv"
    )
    for p in (p_nd, p_np):
        p.add_argument(
            "--config",
            choices=["VTB", "ITV"],
            default="VTB",
            help="VTB: vehículo contra barrera (E2); ITV: barrera móvil contra el vehículo "
            "(rigidez lateral y trasera)",
        )

    p_no = sub.add_parser(
        "nombres", help="Nombres de pila comunes (DataMX, CC0) para el redactor de PII"
    )
    no_sub = p_no.add_subparsers(dest="command", required=True)
    no_sub.add_parser("download", help="Descarga los CSV a data/raw/nombres y verifica SHA-256")
    p_nb = no_sub.add_parser("build", help="Escribe packages/extraction/data/nombres.json")
    p_nb.add_argument("--check", action="store_true", help="Solo verifica que esté al día")

    p_in = sub.add_parser(
        "inercia", help="Base de parámetros inerciales de vehículos ligeros de NHTSA (VRTC)"
    )
    in_sub = p_in.add_subparsers(dest="command", required=True)
    in_sub.add_parser(
        "download", help="Descarga el PDF a data/raw/nhtsa_inercia y verifica SHA-256"
    )
    p_ib = in_sub.add_parser("build", help="Escribe data/processed/nhtsa/inercia.csv")
    p_ib.add_argument("--check", action="store_true", help="Solo verifica que esté al día")

    p_ci = sub.add_parser("ciss", help="NHTSA CISS 2017–2024 (E3: daño, WinSmash y EDR)")
    ci_sub = p_ci.add_subparsers(dest="command", required=True)
    ci_sub.add_parser(
        "download", help="Descarga los CSV anuales a data/raw/ciss y verifica SHA-256"
    )
    p_cb = ci_sub.add_parser("build", help="Escribe data/processed/ciss/e3_vehiculos.csv")
    p_cb.add_argument("--check", action="store_true", help="Solo verifica que esté al día")
    p_cr = ci_sub.add_parser(
        "relatos", help="Escribe las fichas del test CISS de Relatos-MX (data/relatos-mx/ciss)"
    )
    p_cr.add_argument("--check", action="store_true", help="Solo verifica que estén al día")

    args = parser.parse_args(argv)
    if args.source == "ciss":
        from croquis_data import ciss

        if args.command == "download":
            paths = ciss.download()
            print(f"{len(paths)} años de CISS descargados y verificados en {ciss.RAW_DIR}")
            return 0
        if args.command == "relatos":
            from croquis_data import ciss_relatos

            ok = ciss_relatos.build(check=args.check)
            if args.check:
                print("Fichas CISS al día" if ok else "Fichas CISS DESACTUALIZADAS")
            else:
                print(f"Escritas {ciss_relatos.FICHAS}")
            return 0 if ok else 1
        ok = ciss.build(check=args.check)
        if args.check:
            print("Tabla de E3 (CISS) al día" if ok else "Tabla de E3 (CISS) DESACTUALIZADA")
        else:
            print(f"Escrita {ciss.OUT_DIR / 'e3_vehiculos.csv'}")
        return 0 if ok else 1
    if args.source == "inercia":
        from croquis_data import nhtsa_inercia

        if args.command == "download":
            print(nhtsa_inercia.download())
            return 0
        ok = nhtsa_inercia.build(check=args.check)
        if args.check:
            print("inercia.csv al día" if ok else "inercia.csv desactualizado")
        else:
            print(nhtsa_inercia.CSV_PATH)
        return 0 if ok else 1
    if args.source == "nombres":
        from croquis_data import nombres

        if args.command == "download":
            errs = nombres.download()
            print("; ".join(errs) if errs else "Nombres descargados y verificados.")
            return 1 if errs else 0
        ok = nombres.build(check=args.check)
        if args.check:
            print("nombres.json al día" if ok else "nombres.json desactualizado")
        return 0 if ok else 1
    if args.source == "nhtsa":
        from croquis_data import nhtsa_ctd

        if args.command == "download":
            st = nhtsa_ctd.download(
                config=args.config, workers=args.workers, limit=args.limit, log=print
            )
            print(
                f"listadas {st.listed}, nuevas {st.fetched}, "
                f"en caché {st.cached}, fallidas {st.failed}"
            )
            return 1 if st.failed else 0
        n = nhtsa_ctd.process(config=args.config)
        print(f"{nhtsa_ctd.CONFIGS[args.config][1]}: {n} filas")
        return 0
    if args.source == "vehicles" and args.command == "build":
        from croquis_data import vehicle_classes as vc

        if args.check:
            ok = vc.check()
            print("vehicle_classes.json al día" if ok else "vehicle_classes.json DESACTUALIZADO")
            return 0 if ok else 1
        print(f"Escrito {vc.write()}")
        return 0
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
