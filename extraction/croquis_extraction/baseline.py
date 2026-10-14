"""Línea base de reglas para E1 (PLAN §5.1): del relato redactado a una EscenaSpec.

Sin modelo de lenguaje: glosario de español mexicano, diccionario de modelos de vehículo y reglas
sobre la persona gramatical ("frené" es de quien narra; "frenó", del otro). Cada hecho que
encuentra lleva el fragmento literal como evidencia, así que nunca inventa citas. Es la
alternativa simple contra la que se comparan Claude Haiku y Claude Sonnet.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from croquis_extraction.facts import Fact, Facts
from croquis_extraction.glossary import Term, find_terms
from croquis_extraction.spec_builder import build_spec
from croquis_extraction.text import fold, load_json

JsonObj = dict[str, object]

NUM_WORDS = {
    "un": 1,
    "uno": 1,
    "una": 1,
    "dos": 2,
    "tres": 3,
    "cuatro": 4,
    "cinco": 5,
    "seis": 6,
    "siete": 7,
    "ocho": 8,
    "nueve": 9,
    "diez": 10,
    "once": 11,
    "doce": 12,
    "trece": 13,
    "catorce": 14,
    "quince": 15,
    "veinte": 20,
    "treinta": 30,
    "cuarenta": 40,
    "cincuenta": 50,
    "sesenta": 60,
    "setenta": 70,
    "ochenta": 80,
    "noventa": 90,
    "cien": 100,
    "ciento": 100,
}
_NUM = (
    r"(\d{1,3}(?:[.,]\d)?|(?:" + "|".join(sorted(NUM_WORDS, key=len, reverse=True)) + r")(?![a-z]))"
)
_SPEED = re.compile(
    r"(?<![a-z0-9])(?:como a|a unos|a eso de|iba a|venia a|ibamos a|a mas de|a menos de|"
    r"aproximadamente|de aproximadamente|a)\s+"
    + _NUM
    + r"(?:\s*(?:km/h|km|kms|kilometros(?: por hora)?|por hora|kph))?(?![\d:])(?!\s*(?:metros|m\b|mts|horas|hrs|de la|cuadras|minutos|segundos|anos|am|pm|vueltas))"
)
_MARKS = re.compile(
    r"(?:como\s+|unos\s+)?"
    + _NUM
    + r"\s*(?:metros|mts|m)\s+de\s+(?:marca|marcas|frenado|rayon|raspadura)"
)
_MARKS2 = re.compile(
    r"marcas?\s+(?:de\s+frenado\s+)?(?:de\s+)?(?:como\s+|unos\s+)?"
    + _NUM
    + r"\s*(?:metros|mts|m)\b"
)
_THROW = re.compile(
    r"(?:cayo|quedo|salio volando|lo avento|la avento|lo aventaron|la aventaron|lo lanzo|la lanzo|termino|fue a dar)\s+(?:tirad[oa]\s+)?(?:como\s+|unos\s+)?(?:a\s+)?(?:unos\s+|como\s+)?"
    + _NUM
    + r"\s*(?:metros|mts|m)\b"
)
_DRIVING = re.compile(
    r"(?<![a-z])(?:choque|me estrelle|me sali|me fui contra|me volque|me voltee|derrape|frene|"
    r"iba a \d|iba manejando|venia manejando|iba conduciendo|maneje)(?![a-z])"
)
_FIRST_STRONG = re.compile(
    r"(?<![a-z])(?:yo|mi|me|choque|frene|meti|di|doble|gire|voltee|pise|clave|maneje|traigo)(?![a-z])"
)
_FIRST = re.compile(
    r"(?<![a-z])(?:yo|mi|me|iba|venia|circulaba|manejaba|traia|choque|frene|meti|di|doble|gire|voltee|pise|clave|estaba)(?![a-z])"
)
_NARRATOR_VEH = re.compile(
    r"(?<![a-z])(?:(?:mi|mis)\s+(?:carro|coche|auto|automovil|vehiculo|camioneta|camion|moto|motocicleta|bici|bicicleta|combi|taxi|unidad|troca|nave|vocho|tsuru)|vehiculo de mi propiedad)(?![a-z])"
)
_BRANDS = (
    r"(?:(?:nissan|chevrolet|chevy|kia|toyota|honda|volkswagen|vw|ford|mazda|hyundai|seat|"
    r"renault|dodge|jeep|suzuki|mitsubishi|peugeot|audi|bmw|mercedes|gmc|italika|fiat|"
    r"buick|chrysler|mg|byd|jac)\s+)"
)
_OWN_VERB = (
    r"(?<![a-z])(?:manejando|manejaba|traia|traigo|conduciendo|conducia|iba en|venia en|"
    r"iba manejando|venia manejando|circulaba en|andaba en|iba montado en|iba montada en)"
)
_PASSENGER = re.compile(
    r"(?<![a-z])(?:mi|mis)\s+(esposa|esposo|hijo|hija|hijos|mama|papa|hermano|hermana|amigo|amiga|novio|novia|suegra|suegro|"
    r"companero|companera|abuelo|abuela)\s+(?:iba|venia|iban|venian)\s+(?:de copiloto|atras|adelante|conmigo|en el asiento)"
)


_COLORS = (
    "blanco|blanca|negro|negra|gris|plata|plateado|plateada|rojo|roja|azul|verde|amarillo|"
    "amarilla|naranja|cafe|vino|dorado|dorada|beige|morado|morada|guinda"
)
_COLOR_AFTER = re.compile(r"^[\s,]*(?:de\s+)?(?:color\s+)?(" + _COLORS + r")(?![a-z])")
_HOUR = re.compile(
    r"(?<![\d:])(\d{1,2})(?::(\d{2}))?\s*(de la manana|de la tarde|de la noche|de la madrugada|"
    r"am|a\.m\.|pm|p\.m\.|horas|hrs|h\b)"
)


@dataclass
class Mention:
    start: int
    end: int
    clase: str
    cita: str
    narrator: bool


def _num(s: str) -> float:
    s = s.replace(",", ".")
    return float(NUM_WORDS[s]) if s in NUM_WORDS else float(s)


def _vehicle_mentions(text: str, folded: str, terms: list[Term]) -> list[Mention]:
    found: list[Mention] = []
    for t in terms:
        for e in t.efectos:
            if e["campo"] == "vehiculo.clase":
                found.append(Mention(t.start, t.end, str(e["valor"]), t.texto, False))
    models = load_json("modelos.json")["modelos"]
    for key, info in models.items():
        for m in re.finditer(rf"(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])", folded):
            found.append(
                Mention(m.start(), m.end(), str(info["clase"]), text[m.start() : m.end()], False)
            )
    for m in _NARRATOR_VEH.finditer(folded):
        found.append(Mention(m.start(), m.end(), "", text[m.start() : m.end()], True))
    found.sort(key=lambda x: (x.start, -(x.end - x.start)))
    out: list[Mention] = []
    for x in found:
        if out and x.start < out[-1].end:
            prev = out[-1]
            # "mi carro Aveo" / "mi camioneta": la mención del narrador absorbe la clase.
            if x.narrator or prev.narrator:
                prev.narrator = True
                if not prev.clase and x.clase:
                    prev.clase, prev.cita = x.clase, x.cita
                prev.end = max(prev.end, x.end)
            continue
        out.append(x)
    # "mi" justo antes de un modelo o clase ("en mi Aveo", "mi moto"); verbo en primera persona
    # con artículo ("manejando la Urvan", "traía la camioneta").
    for x in out:
        before = folded[max(0, x.start - 24) : x.start]
        if re.search(r"(?<![a-z])mis?\s+(?:" + _BRANDS + r")?$", before):
            x.narrator = True
        wider = folded[max(0, x.start - 30) : x.start]
        if re.search(_OWN_VERB + r"(?:\s+(?:la|el|una|un))?\s+$", wider):
            x.narrator = True
    # "mi vehículo Nissan Versa" / "Mi carro es un Jetta": la clase pasa al narrador.
    merged: list[Mention] = []
    for x in out:
        if merged and merged[-1].narrator and not merged[-1].clase and x.clase and not x.narrator:
            gap = folded[merged[-1].end : x.start]
            if (
                len(gap) <= 30
                and not re.search(r"[.;!?]", gap)
                and re.fullmatch(r"(?:[\s,]*[a-z]+){0,4}[\s,]*", gap)
            ):
                merged[-1].clase, merged[-1].cita = x.clase, x.cita
                merged[-1].end = x.end
                continue
        merged.append(x)
    return merged


def _sentence_bounds(folded: str, pos: int) -> tuple[int, int]:
    s = max(folded.rfind(c, 0, pos) for c in ".!?;\n") + 1
    ends = [i for i in (folded.find(c, pos) for c in ".!?;\n") if i >= 0]
    return s, (min(ends) if ends else len(folded))


def _is_first_person(segment: str) -> bool:
    return bool(_FIRST.search(segment))


def extract_facts(text: str) -> Facts:
    """Hechos del relato (redactado) con evidencia literal."""
    folded = fold(text)
    terms = find_terms(text)
    f = Facts()
    # "iba", "venía", "estaba" valen para yo y para él: aquí solo cuentan las marcas inequívocas.
    first_person = bool(_FIRST_STRONG.search(folded))
    mentions = _vehicle_mentions(text, folded, terms)

    # Vehículos: el del narrador primero (A), luego los demás en orden de aparición.
    narr = [m for m in mentions if m.narrator]
    others: list[Mention] = []
    for m in mentions:
        if m.narrator:
            continue
        if any(o.clase == m.clase and o.cita.lower() == m.cita.lower() for o in others):
            continue
        if narr and narr[0].clase == m.clase and not narr[0].cita.lower().startswith("mi"):
            continue
        others.append(m)
    # Peatón que narra: "iba cruzando" sin sujeto en tercera persona ("un señor que iba
    # cruzando" es otra persona).
    pedestrian_narrator = (
        bool(
            re.search(
                r"(?<![a-z])(?<!que )(?:iba cruzando|estaba cruzando|cruzaba la calle|iba caminando)(?![a-z])",
                folded,
            )
        )
        and bool(re.search(r"(?<![a-z])(?:yo|me|mi)(?![a-z])", folded))
        and not narr
    )
    vehs: list[Mention] = []
    if narr:
        vehs.append(narr[0])
    elif first_person and not pedestrian_narrator and (others or _DRIVING.search(folded)):
        # Narra en primera persona sin decir su vehículo ("choqué contra un poste", "iba a 80"):
        # se crea uno sin clase.
        vehs.append(Mention(0, 0, "", "", True))
    vehs.extend(others[:4])
    for i, m in enumerate(vehs):
        d: dict[str, Fact] = {}
        if m.clase and m.cita:
            d["clase"] = Fact(m.clase, m.cita, "relato")
        if m.end:
            cm = _COLOR_AFTER.match(folded[m.end : m.end + 30])
            if cm:
                a, b = m.end + cm.start(1), m.end + cm.end(1)
                d["color"] = Fact(fold(text[a:b]), text[a:b], "relato")
        f.vehiculos.append(d)
        if m.narrator:
            f.narrador_vehiculo = i

    def owner(pos: int, match_text: str) -> int | None:
        """Vehículo al que pertenece un hecho en `pos`: primera persona → narrador."""
        if not f.vehiculos:
            return None
        s, _end = _sentence_bounds(folded, pos)
        mt = fold(match_text)
        third = re.search(r"(?<![a-z])(?:dio|doblo|giro|volteo|se)(?![a-z])", mt)
        first = re.search(r"(?<![a-z])(?:me|yo)(?![a-z])", mt) or re.match(
            r"(?:di|doble|gire|voltee|meti|frene|pise|clave|me)\b", mt
        )
        if third and not re.search(r"(?<![a-z])me(?![a-z])", mt):
            cands = [k for k, v in enumerate(vehs) if not v.narrator and v.start < pos]
            return cands[-1] if cands else (1 if len(f.vehiculos) > 1 else None)
        if first:
            return f.narrador_vehiculo
        before = [k for k, v in enumerate(vehs) if v.end and s <= v.start < pos]
        if before:
            return before[-1]
        window = folded[max(s, pos - 40) : pos]
        if _is_first_person(window):
            return f.narrador_vehiculo
        return f.narrador_vehiculo if f.narrador_vehiculo is not None else 0

    # Velocidades.
    for m in _SPEED.finditer(folded):
        val = _num(m.group(1))
        if not 5 <= val <= 250 or (m.group(1) in NUM_WORDS and val < 10):
            continue
        k = owner(m.start(), text[max(0, m.start() - 25) : m.start()])
        if k is not None and k < len(f.vehiculos) and "velocidad_kmh" not in f.vehiculos[k]:
            f.vehiculos[k]["velocidad_kmh"] = Fact(val, text[m.start() : m.end()].strip(), "relato")
    for t in terms:
        for e in t.efectos:
            if e["campo"] == "velocidad.cualitativa" and e["valor"] == "muy_baja":
                k = owner(t.start, t.texto)
                if k is not None and k < len(f.vehiculos) and "velocidad_kmh" not in f.vehiculos[k]:
                    f.vehiculos[k]["velocidad_kmh"] = Fact(8.0, t.texto, "relato")

    # Maniobras y frenado (las específicas primero: "dar vuelta a la derecha" gana a "se me cerró").
    generic = {"se_me_cerro", "me_echo_la_lamina", "cambio_carril"}
    for t in sorted(terms, key=lambda t: (t.id in generic, t.start)):
        for e in t.efectos:
            campo = e["campo"]
            if campo in ("vehiculo.maniobra", "otro.maniobra"):
                valor = str(e["valor"])
                if valor == "cambio_carril":
                    tail = folded[t.end : t.end + 25]
                    if "derecha" in tail:
                        valor = "cambio_carril_derecha"
                    elif "izquierda" in tail:
                        valor = "cambio_carril_izquierda"
                k = (
                    owner(t.start, t.texto)
                    if campo == "vehiculo.maniobra"
                    else (1 if len(f.vehiculos) > 1 else None)
                )
                if campo == "otro.maniobra" and f.narrador_vehiculo is not None:
                    cands = [i for i in range(len(f.vehiculos)) if i != f.narrador_vehiculo]
                    k = cands[0] if cands else None
                if k is not None and k < len(f.vehiculos) and "maniobra" not in f.vehiculos[k]:
                    f.vehiculos[k]["maniobra"] = Fact(valor, t.texto, "relato")
            elif campo == "vehiculo.frenado.aplico":
                orig = t.texto
                if re.search(r"frenó|frenaron|nunca frenó", orig) or fold(orig) in (
                    "freno a fondo",
                    "si freno",
                    "alcanzo a frenar",
                ):
                    cands = [i for i in range(len(f.vehiculos)) if i != f.narrador_vehiculo]
                    k = cands[0] if cands else None
                else:
                    k = owner(t.start, orig)
                if k is not None and k < len(f.vehiculos) and "frenado" not in f.vehiculos[k]:
                    f.vehiculos[k]["frenado"] = Fact(bool(e["valor"]), orig, "relato")

    # Lugar, entorno, dispositivos, objetos y evento.
    keymap = {
        "lugar.tipo_via": "lugar.tipo_via",
        "lugar.superficie": "lugar.superficie",
        "lugar.estado_superficie": "lugar.estado_superficie",
        "entorno.clima": "entorno.clima",
        "entorno.iluminacion": "entorno.iluminacion",
        "objeto.tipo": "evento.objeto",
    }
    for t in sorted(terms, key=lambda t: (t.ambiguo, t.start)):
        for e in t.efectos:
            campo = str(e["campo"])
            if campo in keymap and keymap[campo] not in f.escalares:
                f.escalares[keymap[campo]] = Fact(e["valor"], t.texto, "relato")
            elif campo == "dispositivo.tipo" and all(d.valor != e["valor"] for d in f.dispositivos):
                f.dispositivos.append(Fact(e["valor"], t.texto, "relato"))

    # Iluminación por la hora del relato ("8 de la mañana", "19:30 horas").
    if "entorno.iluminacion" not in f.escalares:
        hm = _HOUR.search(folded)
        if hm:
            h = int(hm.group(1)) % 24
            suf = hm.group(3)
            if suf in ("de la tarde", "de la noche", "pm", "p.m.") and h < 12:
                h += 12
            lum = "dia" if 7 <= h < 19 else ("atardecer" if 19 <= h < 20 else "noche")
            f.escalares["entorno.iluminacion"] = Fact(lum, text[hm.start() : hm.end()], "relato")
    ev: Fact | None = None
    pedestrian = next(
        (t for t in terms if any(x["campo"] == "persona.rol" for x in t.efectos)), None
    )
    vuelco = next((t for t in terms if t.id == "se_volteo"), None)
    derrape = next((t for t in terms if t.id == "derrape"), None)
    salida = re.search(
        r"me sali del camino|se salio del camino|me sali de la carretera|me fui a la cuneta|me fui al barranco",
        folded,
    )
    obj = f.escalares.get("evento.objeto")
    impact_word = re.search(
        r"(?<![a-z])(?:me pego|le pegue|me pegaron|me dio|le di|choque|chocamos|me impacto|impacto|golpe|me golpeo|la golpee|lo golpee|atropelle|lo atropelle|la atropelle|atropello|lo atropello|la atropello|lo arrollo|la arrollo|nos dimos|me rozo|me fui contra|pegue contra|me estrelle)(?![a-z])",
        folded,
    )
    if pedestrian is not None and f.vehiculos:
        ev = Fact(
            "impacto_vehiculo_persona",
            impact_word.group(0) and text[impact_word.start() : impact_word.end()]
            if impact_word
            else pedestrian.texto,
            "relato",
        )
        if not pedestrian_narrator:  # el peatón que narra se agrega abajo
            f.personas.append({"rol": Fact("peaton", pedestrian.texto, "relato")})
    elif obj is not None:
        cita = text[impact_word.start() : impact_word.end()] if impact_word else str(obj.cita)
        ev = Fact("impacto_vehiculo_objeto", cita, "relato")
    elif vuelco is not None:
        ev = Fact("volcadura", vuelco.texto, "relato")
    elif salida is not None:
        ev = Fact("derrape", text[salida.start() : salida.end()], "relato")
    elif len(f.vehiculos) >= 2 and impact_word is not None:
        ev = Fact(
            "impacto_vehiculo_vehiculo", text[impact_word.start() : impact_word.end()], "relato"
        )
    elif derrape is not None:
        ev = Fact("derrape", derrape.texto, "relato")
    if ev is not None:
        f.escalares["evento.tipo"] = ev

    # Zonas de impacto (CDC) por frases típicas.
    _zones(text, folded, f)

    # Distancias.
    m = _MARKS.search(folded) or _MARKS2.search(folded)
    if m:
        f.escalares["evidencias.marcas_m"] = Fact(
            _num(m.group(1)), text[m.start() : m.end()], "relato"
        )
    m = _THROW.search(folded)
    if m:
        f.escalares["evidencias.distancia_proyeccion_m"] = Fact(
            _num(m.group(1)), text[m.start() : m.end()], "relato"
        )

    # Personas: quien narra, pasajeros, peatón narrador, cinturón y casco.
    if f.narrador_vehiculo is not None:
        nv = vehs[f.narrador_vehiculo]
        clase = nv.clase
        rol = (
            "motociclista"
            if clase in ("motocicleta", "scooter")
            else "ciclista"
            if clase == "bicicleta"
            else "conductor"
        )
        cue = _FIRST.search(folded)
        cita = text[cue.start() : cue.end()] if cue else None
        f.personas.insert(
            0,
            {
                "rol": Fact(rol, cita, "relato" if cita else "supuesto"),
                "vehiculo": Fact(f.narrador_vehiculo, None, "supuesto"),
            },
        )
    elif pedestrian_narrator:
        pm = re.search(r"iba cruzando|estaba cruzando|cruzaba la calle|iba caminando", folded)
        assert pm is not None
        f.personas.insert(0, {"rol": Fact("peaton", text[pm.start() : pm.end()], "relato")})
    for pm in _PASSENGER.finditer(folded):
        f.personas.append(
            {
                "rol": Fact("pasajero", text[pm.start() : pm.end()], "relato"),
                "vehiculo": Fact(f.narrador_vehiculo or 0, None, "supuesto"),
            }
        )
    for t in terms:
        for e in t.efectos:
            if e["campo"] in ("persona.cinturon", "persona.casco"):
                key = str(e["campo"]).split(".")[1]
                target = (
                    f.personas[-1]
                    if len(f.personas) > 1 and _near_passenger(folded, t.start)
                    else (f.personas[0] if f.personas else None)
                )
                if target is not None and key not in target:
                    target[key] = Fact(bool(e["valor"]), t.texto, "relato")
    return f


def _near_passenger(folded: str, pos: int) -> bool:
    s, _ = _sentence_bounds(folded, pos)
    return bool(_PASSENGER.search(folded[s:pos]))


def _zones(text: str, folded: str, f: Facts) -> None:
    if not f.vehiculos:
        return
    me = f.narrador_vehiculo if f.narrador_vehiculo is not None else 0
    other = next((i for i in range(len(f.vehiculos)) if i != me), None)

    def put(i: int | None, lado: str, cita: str) -> None:
        if i is not None and i not in f.zonas:
            f.zonas[i] = Fact(lado, cita, "relato")

    rules: list[tuple[str, str | None, str | None]] = [
        # (patrón, lado del narrador, lado del otro)
        (
            r"(?:me pegaron|me pego|me dieron|me dio|sentí el golpe|senti el golpe|me alcanzo|me impacto|me golpeo|el golpe)\s+(?:\w+\s+){0,2}por (?:atras|detras)",
            "B",
            "F",
        ),
        (
            r"(?:le pegue|le di|lo alcance|la alcance|choque)\s+(?:\w+\s+){0,2}por (?:atras|detras)",
            "F",
            "B",
        ),
        (r"por alcance", "F", "B"),
        (r"(?:le di|le pegue|lo alcance|la alcance)\s+(?:un\s+)?alcance", "F", "B"),
        (r"(?:me dieron|me dio|me pegaron|me pego)\s+(?:un\s+)?alcance", "B", "F"),
        (r"de frente|frente a frente", "F", "F"),
        (r"defensas traseras", "B", "B"),
        (
            r"(?:me pego|me dio|me impacto|me pegaron|me golpeo|me rozo)\s+(?:\w+\s+){0,4}(?:puerta del copiloto|lado (?:del )?copiloto|lado derecho|costado derecho|parte de atras del lado derecho)",
            "R",
            None,
        ),
        (
            r"(?:me pego|me dio|me impacto|me pegaron|me golpeo|me rozo)\s+(?:\w+\s+){0,4}(?:puerta del conductor|lado del conductor|lado izquierdo|costado izquierdo|puerta del lado del conductor)",
            "L",
            None,
        ),
        (
            r"(?:le pegue|le di|lo golpee|la golpee)\s+(?:\w+\s+){0,4}(?:en la puerta|en el costado|de lado)",
            "F",
            None,
        ),
    ]
    for pat, mine, theirs in rules:
        m = re.search(pat, folded)
        if m:
            cita = text[m.start() : m.end()]
            if mine:
                put(me, mine, cita)
            if theirs and other is not None:
                put(other, theirs, cita)


def extract_spec(text: str, spec_id: str = "linea-base") -> dict[str, object]:
    """EscenaSpec de la línea base (mismo constructor que la referencia)."""
    return build_spec(extract_facts(text), text, spec_id=spec_id, origen="escrito", sintetico=False)
