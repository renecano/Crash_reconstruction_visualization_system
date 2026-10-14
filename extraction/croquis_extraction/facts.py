"""Hechos de un relato: la vista plana de una EscenaSpec que se evalúa en E1.

Un hecho es un valor más, opcionalmente, la cita literal del relato que lo respalda. La referencia
de Relatos-MX se anota así (cita = el fragmento donde el relato lo dice; sin cita = lo infirió quien
anotó y no se evalúa como extracción). De cualquier EscenaSpec, venga de la línea base de reglas o
de Claude, se sacan los mismos hechos: los campos con `fuente: relato` cuentan como afirmados por
el relato y los demás como supuestos.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

JsonObj = dict[str, Any]

SCALAR_FIELDS = (
    "lugar.tipo_via",
    "lugar.superficie",
    "lugar.estado_superficie",
    "lugar.carriles_por_sentido",
    "entorno.clima",
    "entorno.iluminacion",
    "evento.tipo",
    "evento.objeto",
    "evidencias.distancia_proyeccion_m",
    "evidencias.marcas_m",
)
VEHICLE_FIELDS = ("clase", "maniobra", "velocidad_kmh", "frenado", "color")
PERSON_FIELDS = ("rol", "cinturon", "casco")
NUMERIC = {
    "lugar.carriles_por_sentido",
    "evidencias.distancia_proyeccion_m",
    "evidencias.marcas_m",
    "velocidad_kmh",
}
# Tolerancias para contar un número como correcto (además se reporta el error absoluto).
TOLERANCE = {
    "velocidad_kmh": 10.0,
    "evidencias.distancia_proyeccion_m": 2.0,
    "evidencias.marcas_m": 2.0,
    "lugar.carriles_por_sentido": 0.0,
}


def _none() -> None:
    return None


@dataclass
class Fact:
    valor: Any
    cita: str | None = None
    fuente: str = "relato"  # "relato" si el texto lo dice; "supuesto"/"default" si no

    @property
    def stated(self) -> bool:
        return self.fuente == "relato"


def _facts() -> dict[str, Fact]:
    return {}


def _list_facts() -> list[dict[str, Fact]]:
    return []


def _fact_list() -> list[Fact]:
    return []


def _zones() -> dict[int, Fact]:
    return {}


@dataclass
class Facts:
    tipo: str | None = None  # categoría del percance (anotación, no se extrae)
    escalares: dict[str, Fact] = field(default_factory=_facts)
    dispositivos: list[Fact] = field(default_factory=_fact_list)
    vehiculos: list[dict[str, Fact]] = field(default_factory=_list_facts)
    narrador_vehiculo: int | None = field(default_factory=_none)
    personas: list[dict[str, Fact]] = field(default_factory=_list_facts)
    zonas: dict[int, Fact] = field(default_factory=_zones)  # índice de vehículo → lado CDC


def fact_from_annotation(raw: Any) -> Fact:
    """`[valor, "cita"]` o `[valor]` o un valor suelto (sin cita: inferido)."""
    if isinstance(raw, list) and raw:
        items: list[Any] = list(raw)  # pyright: ignore[reportUnknownArgumentType]
        valor = items[0]
        cita = items[1] if len(items) > 1 else None
        return Fact(valor, cita, "relato" if cita else "supuesto")
    return Fact(raw, None, "supuesto")


def facts_from_annotation(h: JsonObj) -> Facts:
    """Hechos de la anotación de Relatos-MX (formato compacto de los TOML fuente)."""
    f = Facts(tipo=h.get("tipo"))
    for key in SCALAR_FIELDS:
        if key in h:
            f.escalares[key] = fact_from_annotation(h[key])
    for raw in h.get("dispositivos", []):
        f.dispositivos.append(fact_from_annotation(raw))
    for v in h.get("vehiculos", []):
        f.vehiculos.append({k: fact_from_annotation(v[k]) for k in VEHICLE_FIELDS if k in v})
        if v.get("narrador"):
            f.narrador_vehiculo = len(f.vehiculos) - 1
    for p in h.get("personas", []):
        d = {k: fact_from_annotation(p[k]) for k in PERSON_FIELDS if k in p}
        if "vehiculo" in p:
            d["vehiculo"] = Fact(int(p["vehiculo"]), None, "supuesto")
        f.personas.append(d)
    for k, raw in h.get("zonas", {}).items():
        f.zonas[int(k)] = fact_from_annotation(raw)
    return f


def _campo(spec_field: JsonObj | None) -> Fact | None:
    if not spec_field or "valor" not in spec_field:
        return None
    ev: list[JsonObj] = spec_field.get("evidencia") or []
    cita = ev[0]["texto"] if ev else None
    return Fact(spec_field["valor"], cita, str(spec_field.get("fuente", "supuesto")))


def _kmh(campo: JsonObj) -> float:
    v = float(campo["valor"])
    return v * 3.6 if campo.get("unidad") == "m/s" else v


def _m(campo: JsonObj) -> float:
    v = float(campo["valor"])
    return v * {"m": 1.0, "cm": 0.01, "mm": 0.001, "km": 1000.0}.get(
        str(campo.get("unidad", "m")), 1.0
    )


def _proc_fact(valor: Any, proc: JsonObj | None) -> Fact:
    proc = proc or {}
    ev: list[JsonObj] = proc.get("evidencia") or []
    return Fact(valor, ev[0]["texto"] if ev else None, str(proc.get("fuente", "supuesto")))


def facts_from_spec(spec: JsonObj) -> Facts:
    """Hechos de una EscenaSpec (de la línea base, de Claude o de la referencia construida)."""
    f = Facts()
    lugar = spec.get("lugar", {})
    for key in ("tipo_via", "superficie", "estado_superficie", "carriles_por_sentido"):
        c = _campo(lugar.get(key))
        if c:
            f.escalares[f"lugar.{key}"] = c
    entorno = spec.get("entorno", {})
    for key in ("clima", "iluminacion"):
        c = _campo(entorno.get(key))
        if c:
            f.escalares[f"entorno.{key}"] = c
    for disp in lugar.get("dispositivos", []):
        disp_obj: JsonObj = disp
        f.dispositivos.append(_proc_fact(disp_obj["tipo"], disp_obj.get("procedencia")))
    ids = [v["id"] for v in spec.get("vehiculos", [])]
    for v in spec.get("vehiculos", []):
        d: dict[str, Fact] = {}
        for key in ("clase", "maniobra"):
            c = _campo(v.get(key))
            if c:
                d[key] = c
        vp = v.get("velocidad_previa")
        if vp:
            c = _campo(vp)
            if c:
                c.valor = _kmh(vp)
                d["velocidad_kmh"] = c
        frenado: JsonObj = v.get("frenado") or {}
        c = _campo(frenado.get("aplico"))
        if c:
            d["frenado"] = c
        color: JsonObj = v.get("color") or {}
        c = _campo(color.get("nombre"))
        if c:
            d["color"] = c
        f.vehiculos.append(d)
    pids = {p["id"]: p for p in spec.get("personas", [])}
    for p in spec.get("personas", []):
        d = {}
        c = _campo(p.get("rol"))
        if c:
            d["rol"] = c
        for key in ("cinturon", "casco"):
            c = _campo(p.get(key))
            if c:
                d[key] = c
        if p.get("vehiculo_id") in ids:
            d["vehiculo"] = Fact(ids.index(p["vehiculo_id"]), None, "supuesto")
            rol_obj: JsonObj = p.get("rol") or {}
            if rol_obj.get("valor") == "conductor" and (
                rol_obj.get("nota") == "narrador" or f.narrador_vehiculo is None
            ):
                f.narrador_vehiculo = ids.index(p["vehiculo_id"])
        f.personas.append(d)
    _ = pids
    eventos = sorted(spec.get("eventos", []), key=lambda e: e.get("orden", 0))
    impacto = next((e for e in eventos if str(e.get("tipo", "")).startswith("impacto")), None)
    principal = impacto or next(
        (
            e
            for e in eventos
            if e.get("tipo") in ("volcadura", "derrape", "arrastre", "inicio_frenado", "giro")
        ),
        None,
    )
    if principal:
        f.escalares["evento.tipo"] = _proc_fact(principal["tipo"], principal.get("procedencia"))
        objetos = {o["id"]: o for o in entorno.get("objetos", [])}
        obj = next((objetos[a] for a in principal.get("actores", []) if a in objetos), None)
        if obj:
            f.escalares["evento.objeto"] = _proc_fact(obj["tipo"], obj.get("procedencia"))
        for z in principal.get("zonas_impacto", []):
            if z.get("vehiculo_id") in ids:
                f.zonas[ids.index(z["vehiculo_id"])] = _proc_fact(
                    z["cdc"]["lado"], principal.get("procedencia")
                )
    for e in spec.get("evidencias", []):
        lon = e.get("longitud")
        if not lon:
            continue
        if e.get("tipo") == "distancia_proyeccion":
            c = _campo(lon)
            if c:
                c.valor = _m(lon)
                f.escalares["evidencias.distancia_proyeccion_m"] = c
        elif e.get("tipo") in ("marcas_frenado", "marcas_derrape"):
            c = _campo(lon)
            if c:
                c.valor = _m(lon)
                f.escalares["evidencias.marcas_m"] = c
    return f
