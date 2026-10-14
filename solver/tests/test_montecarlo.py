"""Monte Carlo: muestreo con semilla de los campos inciertos y percentiles de las salidas."""

import copy

from croquis_scene_schema import load_fixture, result_errors
from croquis_solver.montecarlo import monte_carlo, ranges
from croquis_solver.reconstruct import reconstruct


def test_determinista_por_semilla() -> None:
    spec = load_fixture("alcance")
    a = monte_carlo(spec, samples=8, seed=5).to_dict()
    b = monte_carlo(spec, samples=8, seed=5).to_dict()
    c = monte_carlo(spec, samples=8, seed=6).to_dict()
    assert a == b
    assert a != c


def test_rangos_salen_del_contrato_y_de_las_tablas() -> None:
    spec = load_fixture("alcance")
    rs = {r.ruta: r for r in ranges(spec)}
    assert rs["vehiculos.0.velocidad_previa"].nota == "rango declarado"
    assert "lugar.friccion" in rs
    assert all(r.minimo <= r.maximo for r in rs.values())


def test_dato_de_la_persona_usuaria_estrecha_el_rango() -> None:
    spec = load_fixture("lateral_interseccion")
    before = next(r for r in ranges(spec) if r.ruta == "vehiculos.1.velocidad_previa")
    user = copy.deepcopy(spec)
    vp = user["vehiculos"][1]["velocidad_previa"]
    vp.pop("rango", None)
    vp["fuente"] = "usuario"
    after = next(r for r in ranges(user) if r.ruta == "vehiculos.1.velocidad_previa")
    assert (after.maximo - after.minimo) < (before.maximo - before.minimo)


def test_percentiles_ordenados_y_resultado_valido() -> None:
    spec = load_fixture("peaton_cruce")
    u = monte_carlo(spec, samples=12, seed=1)
    assert u.validas == 12
    for ds in list(u.vehiculos.values()) + list(u.personas.values()):
        for d in ds.values():
            assert d.p10 <= d.p50 <= d.p90
    assert u.personas, "el peatón proyectado debe tener su distancia"
    doc = reconstruct(spec).to_dict()
    doc["incertidumbre"] = u.to_dict()
    assert result_errors(doc) == []


def test_sin_rango_el_valor_nominal_cae_en_el_intervalo_de_su_velocidad() -> None:
    spec = load_fixture("alcance")
    u = monte_carlo(spec, samples=32, seed=2)
    nominal = reconstruct(spec)
    for v in nominal.vehiculos:
        d = u.vehiculos[v.id]["v_impacto_kmh"]
        lo = min(d.p10, d.p50) - 25
        hi = max(d.p90, d.p50) + 25
        assert lo <= v.v_impact_kmh <= hi
