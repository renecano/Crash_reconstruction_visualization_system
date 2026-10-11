"""Ingesta reproducible de INEGI ATUS.

ATUS: Accidentes de Tránsito Terrestre en Zonas Urbanas y Suburbanas.

Fuente: conjunto de datos abiertos anual 1997–2025, publicación del 2026-08-28
(ver ``data/SOURCES.md``).
Este módulo solo **descarga** y **agrega** por año; las cifras que cita el README las calcula
``croquis_eval.atus_summary`` a partir de los agregados y las escribe en ``eval/results``.

Memoria: cada CSV anual pesa ~100 MB. Se extrae un año a la vez a un archivo temporal, se agrega con
``polars`` en modo streaming y se borra, para que el proceso quepa en una laptop de 8 GB.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import tempfile
import zipfile
from collections.abc import Callable, Iterable
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import httpx
import polars as pl

ATUS_URL = (
    "https://www.inegi.org.mx/contenidos/programas/accidentes/datosabiertos/"
    "conjunto_de_datos_atus_anual_csv.zip"
)
ATUS_LICENSE_URL = "https://www.inegi.org.mx/inegi/terminos.html"
ATUS_EXPECTED_SIZE = 140_302_758  # bytes; Content-Length de la publicación 2026-08-28
ZIP_NAME = "conjunto_de_datos_atus_anual_csv.zip"

DATA_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = DATA_DIR / "raw" / "atus"
PROCESSED_DIR = DATA_DIR / "processed" / "atus"

CERTIFICADO_CERO = "Certificado cero"
"""Registros de municipios sin accidentes; no son accidentes y se excluyen de todo conteo."""

DEATH_COLS = ["CONDMUERTO", "PASAMUERTO", "PEATMUERTO", "CICLMUERTO", "OTROMUERTO", "NEMUERTO"]
INJURED_COLS = ["CONDHERIDO", "PASAHERIDO", "PEATHERIDO", "CICLHERIDO", "OTROHERIDO", "NEHERIDO"]
ROLES = {
    "conductor": ("CONDMUERTO", "CONDHERIDO"),
    "pasajero": ("PASAMUERTO", "PASAHERIDO"),
    "peaton": ("PEATMUERTO", "PEATHERIDO"),
    "ciclista": ("CICLMUERTO", "CICLHERIDO"),
    "otro": ("OTROMUERTO", "OTROHERIDO"),
    "no_especificado": ("NEMUERTO", "NEHERIDO"),
}
VEHICLE_COLS = [
    "AUTOMOVIL",
    "CAMPASAJ",
    "MICROBUS",
    "PASCAMION",
    "OMNIBUS",
    "TRANVIA",
    "CAMIONETA",
    "CAMION",
    "TRACTOR",
    "FERROCARRI",
    "MOTOCICLET",
    "BICICLETA",
    "OTROVEHIC",
]
# Dimensiones agregadas: nombre del archivo procesado → columna de ATUS.
# No se agregan SEXO, ALIENTO, CINTURON ni CAUSAACCI: describen al "conductor presunto responsable"
# y Croquis no asigna culpa (PLAN §10).
DIMENSIONS = {
    "tipo": "TIPACCID",
    "clase": "CLASACC",
    "entidad": "CVE_ENT",
    "hora": "ID_HORA",
    "dia_semana": "DIASEMANA",
    "mes": "MES",
    "zona_urbana": "URBANA",
    "zona_suburbana": "SUBURBANA",
    "superficie": "CAPAROD",
}
# Antes de la publicación de julio de 2026 las claves se llamaban ID_ENTIDAD / ID_MUNICIPIO.
LEGACY_RENAMES = {"ID_ENTIDAD": "CVE_ENT", "ID_MUNICIPIO": "CVE_MUN"}

_YEAR_RE = re.compile(r"conjunto_de_datos/atus_anual_(\d{4})\.csv$")


@dataclass(frozen=True)
class DownloadRecord:
    url: str
    path: str
    size: int
    sha256: str
    downloaded_at: str
    last_modified: str | None
    license: str = ATUS_LICENSE_URL


def sha256_of(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while block := f.read(chunk):
            h.update(block)
    return h.hexdigest()


def download(
    dest_dir: Path = RAW_DIR,
    *,
    url: str = ATUS_URL,
    expected_size: int | None = ATUS_EXPECTED_SIZE,
    client: httpx.Client | None = None,
    force: bool = False,
) -> DownloadRecord:
    """Descarga el zip de ATUS a ``dest_dir``, verifica el tamaño y escribe ``manifest.json``.

    Si el archivo ya existe con el tamaño esperado y ``force`` es falso, no vuelve a descargar;
    solo recalcula el hash y refresca el manifiesto.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    target = dest_dir / ZIP_NAME
    last_modified: str | None = None
    if force or not target.exists() or (expected_size and target.stat().st_size != expected_size):
        own_client = client is None
        client = client or httpx.Client(
            timeout=httpx.Timeout(60.0, read=600.0), follow_redirects=True
        )
        try:
            tmp = target.with_suffix(".part")
            with client.stream("GET", url) as resp:
                resp.raise_for_status()
                last_modified = resp.headers.get("last-modified")
                with tmp.open("wb") as f:
                    for chunk in resp.iter_bytes(1 << 20):
                        f.write(chunk)
            if expected_size is not None and tmp.stat().st_size != expected_size:
                size = tmp.stat().st_size
                tmp.unlink()
                msg = (
                    f"Tamaño inesperado: {size} bytes (se esperaban {expected_size}). "
                    "¿Cambió la publicación?"
                )
                raise ValueError(msg)
            shutil.move(tmp, target)
        finally:
            if own_client:
                client.close()
    record = DownloadRecord(
        url=url,
        path=(
            target.relative_to(DATA_DIR) if target.is_relative_to(DATA_DIR) else target
        ).as_posix(),
        size=target.stat().st_size,
        sha256=sha256_of(target),
        downloaded_at=datetime.now(UTC).isoformat(timespec="seconds"),
        last_modified=last_modified,
    )
    (dest_dir / "manifest.json").write_text(
        json.dumps(asdict(record), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return record


def list_years(zip_path: Path) -> dict[int, str]:
    """Años disponibles en el zip → nombre del miembro CSV."""
    with zipfile.ZipFile(zip_path) as zf:
        found: dict[int, str] = {}
        for name in zf.namelist():
            m = _YEAR_RE.search(name)
            if m:
                found[int(m.group(1))] = name
    return dict(sorted(found.items()))


def read_entity_catalog(zip_path: Path) -> pl.DataFrame:
    """Catálogo de entidades federativas (clave → nombre)."""
    with zipfile.ZipFile(zip_path) as zf, zf.open("catalogos/tc_entidad.csv") as f:
        return pl.read_csv(f.read(), infer_schema=False).select(
            pl.col("CVE_ENT").alias("clave"), pl.col("NOM_ENTIDAD").alias("nombre")
        )


def _base_frame(csv_path: Path) -> pl.LazyFrame:
    lf = pl.scan_csv(csv_path, infer_schema=False, encoding="utf8")
    present = set(lf.collect_schema().names())
    renames = {
        old: new for old, new in LEGACY_RENAMES.items() if old in present and new not in present
    }
    if renames:
        lf = lf.rename(renames)
    numeric = DEATH_COLS + INJURED_COLS + VEHICLE_COLS
    lf = lf.with_columns([pl.col(c).cast(pl.Int32, strict=False).fill_null(0) for c in numeric])
    lf = lf.filter(pl.col("TIPACCID") != CERTIFICADO_CERO)
    return lf.with_columns(
        muertos=pl.sum_horizontal(DEATH_COLS), heridos=pl.sum_horizontal(INJURED_COLS)
    )


def aggregate_year(csv_path: Path, year: int) -> dict[str, pl.DataFrame]:
    """Agrega un CSV anual en tablas largas pequeñas.

    Claves del resultado: cada dimensión, ``victimas``, ``vehiculos`` y ``total``.
    """
    lf = _base_frame(csv_path)
    anio = pl.lit(year, dtype=pl.Int32).alias("anio")
    out: dict[str, pl.DataFrame] = {}
    for name, col in DIMENSIONS.items():
        out[name] = (
            lf.group_by(col)
            .agg(
                accidentes=pl.len().cast(pl.Int64),
                muertos=pl.col("muertos").sum().cast(pl.Int64),
                heridos=pl.col("heridos").sum().cast(pl.Int64),
            )
            .select(anio, pl.col(col).alias("clave"), "accidentes", "muertos", "heridos")
            .sort("clave")
            .collect(engine="streaming")
        )
    sums = lf.select(
        [pl.col(c).sum().cast(pl.Int64) for c in DEATH_COLS + INJURED_COLS + VEHICLE_COLS]
        + [pl.len().cast(pl.Int64).alias("accidentes")]
    ).collect(engine="streaming")
    row = sums.row(0, named=True)
    out["victimas"] = pl.DataFrame(
        {
            "anio": [year] * len(ROLES),
            "rol": list(ROLES),
            "muertos": [row[m] for m, _ in ROLES.values()],
            "heridos": [row[h] for _, h in ROLES.values()],
        },
        schema={"anio": pl.Int32, "rol": pl.String, "muertos": pl.Int64, "heridos": pl.Int64},
    )
    out["vehiculos"] = pl.DataFrame(
        {
            "anio": [year] * len(VEHICLE_COLS),
            "vehiculo": VEHICLE_COLS,
            "involucrados": [row[c] for c in VEHICLE_COLS],
        },
        schema={"anio": pl.Int32, "vehiculo": pl.String, "involucrados": pl.Int64},
    )
    out["total"] = pl.DataFrame(
        {
            "anio": [year],
            "accidentes": [row["accidentes"]],
            "muertos": [sum(row[c] for c in DEATH_COLS)],
            "heridos": [sum(row[c] for c in INJURED_COLS)],
        },
        schema={"anio": pl.Int32, "accidentes": pl.Int64, "muertos": pl.Int64, "heridos": pl.Int64},
    )
    return out


def _merge_processed(path: Path, new: pl.DataFrame) -> pl.DataFrame:
    """Sustituye en el CSV existente las filas de los años presentes en ``new``."""
    if path.exists():
        old = pl.read_csv(path, schema_overrides=dict(new.schema))
        years = new.get_column("anio").unique()
        old = old.filter(~pl.col("anio").is_in(years))
        new = pl.concat([old.select(new.columns), new], how="vertical")
    return new.sort(new.columns[:2])


def process(
    zip_path: Path = RAW_DIR / ZIP_NAME,
    processed_dir: Path = PROCESSED_DIR,
    *,
    years: Iterable[int] | None = None,
    log: Callable[[str], None] | None = None,
) -> dict[str, Path]:
    """Agrega los años pedidos (todos por defecto) y escribe ``processed_dir/atus_<tabla>.csv``."""
    members = list_years(zip_path)
    wanted = sorted(set(years) if years is not None else set(members))
    missing = [y for y in wanted if y not in members]
    if missing:
        msg = f"Años no disponibles en {zip_path.name}: {missing}"
        raise ValueError(msg)
    processed_dir.mkdir(parents=True, exist_ok=True)
    entities = read_entity_catalog(zip_path)
    parts: dict[str, list[pl.DataFrame]] = {}
    with zipfile.ZipFile(zip_path) as zf, tempfile.TemporaryDirectory(dir=zip_path.parent) as tmp:
        for year in wanted:
            tmp_csv = Path(tmp) / f"atus_{year}.csv"
            with zf.open(members[year]) as src, tmp_csv.open("wb") as dst:
                shutil.copyfileobj(src, dst, 1 << 20)
            tables = aggregate_year(tmp_csv, year)
            tmp_csv.unlink()
            for name, df in tables.items():
                parts.setdefault(name, []).append(df)
            total = tables["total"].row(0, named=True)
            if log:
                log(f"{year}: {total['accidentes']} accidentes, {total['muertos']} muertos")
    written: dict[str, Path] = {}
    for name, dfs in parts.items():
        df = pl.concat(dfs, how="vertical")
        if name == "entidad":
            df = df.join(entities, on="clave", how="left").select(
                "anio", "clave", "nombre", "accidentes", "muertos", "heridos"
            )
        path = processed_dir / f"atus_{name}.csv"
        _merge_processed(path, df).write_csv(path)
        written[name] = path
    return written


def read_processed(name: str, processed_dir: Path = PROCESSED_DIR) -> pl.DataFrame:
    return pl.read_csv(processed_dir / f"atus_{name}.csv", infer_schema_length=None)
