# Relatos-MX

Benchmark de comprensión de relatos de percances viales en español mexicano (PLAN §5.2). Cada caso es un relato en primera o tercera persona con sus hechos anotados y una `EscenaSpec` de referencia construida y validada a partir de ellos. Se usa en E1 para comparar la línea base de reglas con Claude Haiku y Claude Sonnet.

## Qué es y qué no es

- **Sintético.** Todos los relatos los escribió el agente de Croquis (Claude), marcados `sintetico: true` en la spec. No hay relatos de personas reales ni datos personales reales: los nombres, placas, teléfonos, correos, CURP y RFC son inventados.
- **Distribución.** Las categorías siguen la distribución de tipos de accidente de INEGI ATUS 2025 (`eval/results/atus_summary.json`), con un mínimo por categoría para que las raras (ciclista, caída de pasajero, animal) tengan casos.

  | Categoría (`tipo`) | ATUS                                     | Meta |
  | ------------------ | ---------------------------------------- | ---- |
  | `vv`               | Colisión con vehículo automotor (58.4 %) | 175  |
  | `moto`             | Colisión con motocicleta (18.0 %)        | 55   |
  | `objeto`           | Colisión con objeto fijo (11.4 %)        | 35   |
  | `volcadura`        | Volcadura (4.1 %)                        | 13   |
  | `peaton`           | Colisión con peatón (2.8 %)              | 15   |
  | `salida`           | Salida del camino (2.6 %)                | 10   |
  | `ciclista`         | Colisión con ciclista (1.1 %)            | 10   |
  | `caida`            | Caída de pasajero (0.6 %)                | 4    |
  | `animal`           | Colisión con animal (0.3 %)              | 3    |

- **Limitación declarada.** Un benchmark escrito por un modelo puede parecerse más a cómo escribe un modelo que a cómo escribe la gente, y su autor también escribió la línea base de reglas. Se mitiga con cinco registros (`coloquial`, `formal`, `faltas`, `desordenado`, `breve`), con lotes de test escritos por agentes que no vieron la línea base, y congelando el test antes de la primera evaluación. Los números de E1 se leen con esa advertencia.

## Test CISS (segundo test, verdad de NHTSA)

El primer test lo escribió el mismo agente que escribió la línea base de reglas, así que su verdad depende de quien escribe. El test `ciss` corrige eso: cada relato se escribe desde un caso real investigado por NHTSA y los hechos los fija NHTSA, no quien escribe.

- **Fuente.** Casos de CISS 2024 (Crash Investigation Sampling System, NHTSA; datos públicos del gobierno de EE. UU.; ver `data/SOURCES.md`). Los CSV de CISS no traen narrativas, así que se usan sus campos codificados: ambiente, vía, control de tránsito, maniobra previa, freno, clase de vehículo, lado del impacto, tipo de evento, objeto y persona atropellada. La velocidad sale del EDR, en el último punto válido antes del primer evento.
- **Fichas.** `uv run croquis-data ciss relatos` (`data/croquis_data/ciss_relatos.py`) escribe `ciss/fichas.jsonl`:
  - **Selección:** casos elegidos con semilla, por cuotas de tipo que siguen la tabla de arriba dentro de lo que CISS tiene.
  - **Traducción:** cada código va al vocabulario de esta anotación solo si la equivalencia es exacta. Cada etiqueta supuesta se comprueba contra el catálogo oficial `FORMAT24.sas` del mismo zip. Lo que no tiene equivalente queda fuera de la ficha. Lo que no se adapta a México (nieve, hielo) descarta el caso.
  - **Cuentas:** las exclusiones y los campos sin equivalente están en `ciss/fichas_conteos.json`.
- **Relatos.** `fuente/ciss-*.toml`, uno por ficha y con el mismo id (`rmx-cNNN`).
  - **Quién escribe:** agentes que no vieron la línea base ni el glosario. Escriben con los cinco registros, PII sintética y ranuras contrafactuales.
  - **Verdad fija:** quien escribe solo pone el texto y las citas. `relatos check` rechaza un relato cuyos hechos, sin citas, no sean exactamente los de su ficha, o que deje un hecho sin cita.
  - **Revisión:** otro agente, independiente, revisó lote por lote que el texto no afirme hechos de campos que la ficha no trae, porque un extractor que los encontrara sería castigado injustamente.
- **Candado propio.** `ciss.lock`, escrito con `relatos freeze --split ciss` antes de la primera evaluación. El candado del primer test (`test.lock`) no cambia.

### Limitaciones declaradas

- **Origen.** CISS investiga choques en EE. UU. con al menos un vehículo de pasajeros remolcado. No hay relatos de motociclista, caída de pasajero ni salida del camino sin impacto, y las motocicletas solo aparecen como el otro vehículo. La distribución de tipos sigue a ATUS hasta donde CISS lo permite (ver `cuota_por_tipo`).
- **Velocidad.** La que se narra es la del EDR redondeada a 5 km/h, como la diría una persona; el valor original queda en la ficha. Se eligen primero los casos con velocidad del EDR, lo que sesga hacia vehículos con EDR, que son los más nuevos.
- **Texto.** Lo escribió un modelo desde una ficha, no una persona que vivió el choque. La verdad es de NHTSA; la forma de contarlo sigue siendo sintética y se marca `sintetico: true`.
- **Menciones.** Cada ficha pide mencionar un subconjunto de los hechos, elegido con semilla (`probabilidad_de_mencion`), porque la gente no lo dice todo. Los hechos no mencionados no se evalúan. Algunos van juntos porque no se pueden decir por separado: velocidad 0 con `detenido`, un semáforo con el tipo de cruce.
- **Clase.** Las clases de vehículo solo son exactas si la carrocería de NHTSA, la de VPIC y `modelos.json` coinciden (ADR 0012). Si el modelo no está en la tabla, el relato dice el tamaño junto al modelo ("mi sedán mediano Accord"), y eso se lee menos natural que como lo diría una persona.

## Licencia

Textos y anotaciones: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.es) (`LICENSE` en esta carpeta); el código que los procesa es MIT como el resto del repositorio. Las clases de vehículo citan fichas técnicas (ver `data/SOURCES.md`).

## Archivos

- `fuente/dev-*.toml`, `fuente/test-*.toml`: lo que se escribe a mano. El prefijo decide la partición.
- `build/{dev,test,contrafactuales}.jsonl`: generado con `uv run croquis-extraction relatos build`. Trae el texto final, la PII verdadera con posiciones, los hechos y la `EscenaSpec` de referencia. CI verifica que esté al día (`relatos check`).
- `ciss/fichas.jsonl`, `ciss/fichas_conteos.json`, `fuente/ciss-*.toml`, `build/ciss.jsonl` y `ciss.lock`: el test CISS (ver arriba).
- `test.lock`: hash SHA-256 del contenido fuente del test (id, tipo, registro, texto con marcas y hechos, en JSON canónico), escrito una sola vez con `relatos freeze`. No depende del constructor de specs: mejorar el constructor no rompe el congelamiento, cambiar un relato o su anotación sí. Después de congelarlo el test no se modifica (CLAUDE.md).

## Formato de un relato

```toml
[[relato]]
id = "rmx-t001"          # rmx-dNNN (dev) o rmx-tNNN (test), único
tipo = "vv"              # categoría de la tabla
registro = "coloquial"   # coloquial | formal | faltas | desordenado | breve
texto = """
Iba en mi Aveo como a 50 y {{sexo:una señora|un señor}} en una camioneta se me cerró...
"""
[relato.hechos]
"evento.tipo" = ["impacto_vehiculo_vehiculo", "le pegué por detrás"]
dispositivos = [["semaforo", "semáforo"]]
zonas = { "0" = ["F", "le pegué por detrás"], "1" = ["B"] }
[[relato.hechos.vehiculos]]
narrador = true
clase = ["sedan_compacto", "Aveo"]
velocidad_kmh = [50, "como a 50"]
[[relato.hechos.vehiculos]]
clase = ["suv_o_pickup", "camioneta"]
maniobra = ["cambio_carril", "se me cerró"]
[[relato.hechos.personas]]
rol = ["conductor", "Iba"]
vehiculo = 0
```

### Marcas en el texto

- `[[TIPO:valor]]` con TIPO ∈ `NOMBRE`, `PLACA`, `TELEFONO`, `CORREO`, `CURP`, `RFC`, `NUMERO`: dato personal sintético. En el texto final queda solo `valor`; la marca registra la verdad para medir la fuga de PII. `NUMERO` es el número de un domicilio ("número 245").
- `{{grupo:opción canónica|variante}}` con grupo ∈ `sexo`, `edad`, `vehiculo`: ranura contrafactual. El relato canónico usa la primera opción; la variante de un grupo cambia todas sus ranuras a la segunda. Las ranuras no deben cambiar velocidades ni maniobras, ni romper la gramática (concordancia de género y número en ambas versiones). Una ranura de `vehiculo` cambia el modelo o la clase de un vehículo **que no sea** el que se anota con cita (o anota la cita fuera de la ranura).

### Hechos

Cada hecho es `[valor, "cita literal"]`. La cita debe aparecer tal cual (mayúsculas, acentos y faltas incluidas) en el texto canónico ya sin marcas. Un hecho sin cita (`[valor]`) es una inferencia de quien anota: queda en la spec como `supuesto` y no se evalúa como extracción. Anota con cita solo lo que el relato dice.

| Campo                                                          | Valores                                                                                                                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"lugar.tipo_via"`                                             | `recta`, `curva`, `interseccion_x`, `interseccion_t`, `glorieta`, `incorporacion`, `retorno`, `estacionamiento`, `carretera_dos_carriles`, `autopista`; genérico `interseccion` (cruce sin saber si es X o T) |
| `"lugar.superficie"`                                           | `asfalto`, `concreto`, `adoquin`, `empedrado`, `terraceria`                                                                                                                                                   |
| `"lugar.estado_superficie"`                                    | `seco`, `mojado`, `encharcado`, `grava_suelta`, `aceite`, `lodo`                                                                                                                                              |
| `"lugar.carriles_por_sentido"`                                 | entero                                                                                                                                                                                                        |
| `"entorno.clima"`                                              | `despejado`, `nublado`, `lluvia_ligera`, `lluvia_fuerte`, `niebla`, `granizo`; genérico `lluvia`                                                                                                              |
| `"entorno.iluminacion"`                                        | `dia`, `amanecer`, `atardecer`, `noche_con_alumbrado`, `noche_sin_alumbrado`; genérico `noche`                                                                                                                |
| `"evento.tipo"`                                                | `impacto_vehiculo_vehiculo`, `impacto_vehiculo_objeto`, `impacto_vehiculo_persona`, `volcadura`, `derrape` (salida del camino sin impacto), `inicio_frenado` y `arrastre` (caída de pasajero)                 |
| `"evento.objeto"`                                              | `arbol`, `poste`, `muro`, `barda`, `vehiculo_estacionado`, `puesto`, `contenedor`, `senal`, `parada_autobus`, `otro` (con `impacto_vehiculo_objeto`)                                                          |
| `"evidencias.marcas_m"`, `"evidencias.distancia_proyeccion_m"` | metros (número)                                                                                                                                                                                               |
| `dispositivos`                                                 | lista de `[tipo, cita]`; tipo ∈ `semaforo`, `alto`, `ceda_el_paso`, `tope`, `paso_peatonal`, `linea_continua`, `linea_discontinua`, `limite_velocidad`, `no_vuelta`, `un_sentido`, `otro`                     |
| `zonas`                                                        | índice de vehículo (`"0"`, `"1"`) → lado del impacto en ese vehículo, CDC SAE J224: `F` frente, `B` atrás, `L` izquierdo, `R` derecho, `T` techo, `U` bajo                                                    |

Por vehículo (`[[relato.hechos.vehiculos]]`, en orden: el de quien narra primero si narra un conductor):

| Campo           | Valores                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `narrador`      | `true` si es el vehículo de quien narra (sin cita)                                                                                                                                                                                                                                   |
| `clase`         | `sedan_compacto`, `sedan_mediano`, `hatchback`, `suv_compacta`, `suv_grande`, `pickup`, `van`, `microbus_combi`, `autobus`, `camion_unitario`, `tractocamion`, `motocicleta`, `bicicleta`, `scooter`; genéricos `suv_o_pickup` ("camioneta") y `camion_o_autobus` ("camión" sin más) |
| `maniobra`      | `recto`, `vuelta_izquierda`, `vuelta_derecha`, `vuelta_u`, `cambio_carril_izquierda`, `cambio_carril_derecha`, `reversa`, `incorporacion`, `detenido`, `estacionado`; genérico `cambio_carril` ("se me cerró", sin lado)                                                             |
| `velocidad_kmh` | número en km/h (convierte si el relato dice m/s); "a vuelta de rueda" ≈ 8; parado = 0 con maniobra `detenido`                                                                                                                                                                        |
| `frenado`       | `true` / `false` (si el relato dice si frenó)                                                                                                                                                                                                                                        |
| `color`         | el color tal como lo dice el relato, en minúsculas y sin acento (`blanca`, `gris`, `rojo`)                                                                                                                                                                                           |

Por persona (`[[relato.hechos.personas]]`): `rol` ∈ `conductor`, `pasajero`, `peaton`, `ciclista`, `motociclista`; `vehiculo` (índice, sin cita) para quien va a bordo; `cinturon` y `casco` (`true`/`false`) si el relato los menciona. Quien narra y maneja va primero.

La clase de un modelo sale de `packages/extraction/data/modelos.json` cuando está ahí (fichas técnicas); si no, se usa la clase evidente ("Aveo" → `sedan_compacto`).

### Validar un lote

```powershell
uv run croquis-extraction relatos check   # todo el benchmark (esquema, semántica, build al día)
uv run croquis-extraction relatos build   # regenera build/
uv run croquis-extraction relatos stats   # conteos por categoría, registro, PII y contrafactuales
```

`problems` rechaza ids repetidos, categorías o registros desconocidos, citas que no aparecen literal y specs que no pasan el esquema o el validador semántico (por ejemplo, un impacto entre vehículos necesita dos vehículos).
