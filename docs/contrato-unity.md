# Contrato con el visor Unity: daños y «¿Y si…?»

Para Alberto, que lleva todo lo de Unity (René, 2026-11-26): daños visuales, pedazos, entorno, cámara lenta y la animación del «¿Y si…?». Aquí está qué datos recibe Unity, dónde vienen y qué puede leer desde hoy. Lo de fondo está en `packages/scene-schema/visor-puente.md` (puente 1.3.0), `caso3d.schema.json` (1.0.0) y `resultado.schema.json` (1.9.0).

## Reglas que no cambian

- **Unity solo reproduce.** Todo movimiento sale de `resultado` y todo daño, de `dano`. Unity no usa su física para el choque, no recalcula y no inventa una deformación que el solver no dio.
- **Una sola entrada:** el paquete caso-3d (`cargarCaso`). La web lo arma con `armarCaso3d`.
- **Contratos primero:** un campo marcado como «propuesto» no se lee hasta que esté en `main`.
- **Coordenadas:** metros, X al este, Y al norte, Z arriba. `rumbo` en radianes antihorario desde +X dentro de las trayectorias; `rumbo_deg` en grados en los mensajes.

## 1. Daños

**Lo calcula el solver.** Cada vehículo de `resultado.vehiculos[]` trae el daño de su primer impacto en `dano`, y el de cada impacto posterior (carambola, poste) en `danos_posteriores[]`. Se puede leer desde hoy.

| Campo                                                    | Qué es                                                                                                                                                                                                                                         | Cómo se usa en 3D                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `dano.perfil_m`                                          | C1 a C6: seis profundidades de aplastamiento, equiespaciadas sobre el ancho dañado, en **metros** (en pantalla, ×100 = cm). En el frente y la parte trasera van de izquierda a derecha del vehículo; en los costados, de adelante hacia atrás. | Hundir la carrocería hacia adentro, perpendicular a la cara golpeada, con esas seis profundidades e interpolar entre ellas. |
| `dano.ancho_m`, `dano.centro_m`                          | El ancho dañado y su centro a lo largo de la cara (positivo hacia la izquierda en el frente y la parte trasera; hacia adelante en los costados).                                                                                               | Dónde empieza y termina el hundimiento en la cara.                                                                          |
| `dano.cdc.lado`                                          | La cara golpeada: `F` frente, `B` trasera, `L` izquierda, `R` derecha, `T` techo, `U` piso.                                                                                                                                                    | Qué cara se deforma.                                                                                                        |
| `dano.cdc.zona_horizontal`, `zona_vertical`, `extension` | La zona de contacto en la nomenclatura CDC (SAE J224), si se sabe.                                                                                                                                                                             | Afinar la zona; sin ella, el centro y el ancho bastan.                                                                      |
| `pdof_horas`                                             | La dirección de la fuerza principal, como en un reloj visto desde arriba: 12 es de frente, 3 desde la derecha.                                                                                                                                 | La dirección en la que se empuja la lámina (y hacia dónde salen los pedazos).                                               |
| `dano.energia_j`                                         | La energía que absorbió esa deformación.                                                                                                                                                                                                       | Escalar la cantidad de pedazos y el polvo, nunca la profundidad: la profundidad es `perfil_m`.                              |
| `dano.origen_rigidez`                                    | `nhtsa`, `supuesto` o `sin impacto`.                                                                                                                                                                                                           | Con `sin impacto`, no hay deformación.                                                                                      |
| `danos_posteriores[]`                                    | Lo mismo por cada impacto posterior, con `evento_id`, `t` (s; el primer impacto es t = 0) y `delta_v_kmh`.                                                                                                                                     | Aplicar ese daño en su instante `t`, encima del anterior.                                                                   |

**El instante del daño:** el del primer impacto es t = 0; el de cada posterior, su `t`. Antes de ese instante el vehículo está intacto.

**Lo medido manda en el 3D (René, 2026-11-26; contrato #345, solver #349):** si el daño trae `dano.medido_m` (C1–C6 que midió el perito, en metros, con la misma convención que `perfil_m`), **Unity dibuja lo medido**: es la evidencia del vehículo real. Sin `medido_m`, dibuja `perfil_m`, lo que calcula el solver con la energía del choque. Con lo medido se usan también `ancho_m` y `centro_m`, que ya vienen con el ancho medido. Los demás campos nuevos (`energia_medida_j` y `rigidez`, con `fuente` y `nota`) son para la web; Unity no los necesita. Cuando lo medido pide más energía de la que el choque puede dar (AXA: 223 kJ contra 62 kJ), la web lo avisa en Análisis; el 3D no cambia por eso.

**Un roce sin deformación (René, 2026-11-26, la reversa):** si `perfil_m` viene en cero en todo el ancho, `energia_j` es mayor que cero y hay `cdc`, el choque fue un roce que no pasó el umbral de deformación de CRASH3 (A²/2B por `ancho_m`, con `rigidez`). Unity no hunde la carrocería (0 cm es lo correcto) y dibuja **rayones** en la zona del CDC, en `ancho_m` alrededor de `centro_m`, en la dirección del deslizamiento (`pdof_horas`). La web explica en Análisis por qué no hay deformación, con las dos energías. Es decoración: no entra a ninguna cifra.

**Pedazos:** salen del punto del primer impacto (`resultado.punto_impacto`) en la dirección de `pdof_horas`; los de un impacto posterior, de donde está el vehículo en el `t` de su evento (`resultado.eventos[]`, con su `t` y sus `actores`). El área donde quedaron los restos, si la narración la da, viene en `escenario.evidencias`. Su cantidad escala con `energia_j`. Son decoración: no entran a ninguna cifra.

## 2. «¿Y si…?»

**Qué es:** el perito cambia la velocidad de un vehículo en la Reconstrucción y ve cómo habría sido el choque. Es una hipótesis: la cifra reconstruida no cambia. La web corre el solver hacia adelante con esa velocidad, sin la inversión, y obtiene otro `resultado`.

**Cómo llega a Unity (se puede leer desde hoy):** en el campo `fantasma` del paquete caso-3d, que ya está en la 1.3.0:

| Campo                | Qué es                                                                        |
| -------------------- | ----------------------------------------------------------------------------- |
| `fantasma.etiqueta`  | El nombre en pantalla, por ejemplo «¿Y si…? A · Jetta a 60 km/h (hipótesis)». |
| `fantasma.resultado` | Un `resultado` completo, con el mismo esquema que el de la reconstrucción.    |

Dentro de `fantasma.resultado`:

- **Posiciones y rumbos por cuadro:** `vehiculos[].trayectoria`, arreglos de la misma longitud (`t`, `x`, `y`, `rumbo`, `vx`, `vy`, `vel_angular` y, si hay relieve, `z`) en una rejilla alineada a t = 0. Se interpola entre cuadros con el mismo reloj que la reconstrucción.
- **El impacto:** `eventos[]` del tipo `impacto_vehiculo_vehiculo` o `impacto_vehiculo_objeto`, con su `t` y sus `actores`; el punto del primero, en `punto_impacto`. Con otra velocidad, el impacto puede pasar en otro instante y otro lugar, o **no pasar**: entonces no hay evento de impacto y los vehículos siguen de largo.
- **Las posiciones finales:** `vehiculos[].pose_final` y `en_reposo`.
- **Su daño:** `vehiculos[].dano`, igual que en la reconstrucción.

**Cómo se dibuja:** translúcido, sobre la reconstrucción y con el mismo reloj, como ya se hace con el fantasma de lo que declaró un conductor. La etiqueta va siempre a la vista. La leyenda «Hipótesis: la cifra reconstruida no cambia» la pone la web.

**Cuando el perito cambia la velocidad:** la web vuelve a mandar `cargarCaso` con el nuevo `fantasma`. Si recargar el caso resulta lento para la animación, el PR del «¿Y si…?» agrega al puente (1.4.0) un mensaje `fantasma` con `etiqueta` y `resultado` para cambiar solo el fantasma sin recargar. Es propuesto: no se usa hasta que esté en `main` y en `visor-puente.md`.

## 3. Lo demás que pidió René

Esto ya está en el contrato y no necesita cambios:

- **Cámara lenta:** el mensaje `velocidad` con `x` 0.25, 0.5 o 1.
- **Entorno (camellón, desierto):** `escenario.entorno` trae la zona (`rural` o `urbana`), los árboles, edificios, postes, cercas, señales, cerros y la silueta; `escenario.via`, `suelo` y `terreno`, la calle, el piso y el relieve. Si hace falta un dato que no esté (por ejemplo, el ancho del camellón), se pide en un PR `contract:` pequeño antes de usarlo.
- **Camellón (Alberto, 2026-11-26):** no necesita campo nuevo. Unity lo saca de las calles de OSM del caso (`escena.lugar.red_vial.vias`): dos `way` principales de un sentido, casi paralelos y en sentidos contrarios, con el mismo nombre; el camellón es lo que queda entre sus orillas de adentro, con el ancho de calzada de `viaWidthM`. Quita del entorno procedural lo que cae dentro (edificios, postes, señales y cercas) y le pone pasto, guarnición, matas y árboles.
- **Paisaje árido (propuesto en este PR `contract:`):** `escenario.entorno.paisaje`, opcional, `arido` o `templado`. **Lo calcula la web** con OSM alrededor del lugar (mismo radio que las calles): «árido» si el área de `natural=scrub|sand|bare_rock|scree|desert` es mayor que la de `natural=wood|grassland|heath` y `landuse=forest|meadow|farmland|orchard|grass`; si no, o sin datos, «templado» (o no se manda). Unity lo lee en cuanto esté en `main`: tierra en vez de pasto, matas secas y ralas, y pocos pirules en vez de fresnos. No cambia ninguna cifra.

## Cómo pedir un cambio

Un PR `contract:` pequeño a `main` que toque el esquema (`caso3d.schema.json` o `resultado.schema.json`, de donde se generan Zod, Pydantic y C#), `visor-puente.md` y este documento. Los PR que solo cambian `apps/visor-unity/**` los fusiona el Claude Code de René con CI en verde.
