# Ronda 2 · B: pasada completa de producto

Pedido de René (2026-11-16): recorrer todo como perito y, en cada pantalla, quitar lo que es de la app y no del perito, decir mejor la honestidad del método y corregir lo que se vea mal. Por la orden de trabajo («E»), esta pasada **solo corrige**: lo que pide rediseño queda para Fable, en `para-fable.md`.

**Cómo se recorrió:** con `apps/web/e2e/pasada-ronda2.spec.ts`, en claro y oscuro a 1440×900 y en ventana chica a 900×620.

- **Flujos:** caso nuevo con la narración de ejemplo (y cada pregunta del mapa), medir, reconstruir, daños, números, Presentar y exportar; cargar un reporte; AXA paso a paso con su 3D y Presentar; guardar y volver a abrir un caso; una carambola de los reportes y la reproducción.
- **Lecturas de Claude:** las grabadas de CI. **No se gastó API.**
- **Antes:** producción (`main` en `9579a81f`). **Después:** el build local de `feat/ronda2-b`.
- **Capturas:** las parejas de evidencia están en `evidencia/b/` (y las de A en `evidencia/a/`). El juego completo se regenera con el recorrido y no va a git.

Ningún número cambia: todo lo de abajo es texto, nombres, acomodo y estados.

## Lo que se encontró y qué se hizo

### Lo que es de la app y no del perito

| #   | Dónde                                                                                             | Antes                                                                | Qué se hizo                                                                                                                                                                                                        | Evidencia                       |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| 1   | Reconstrucción, comparación con la declaración, dictamen, mensajes de error                       | «El solver de Croquis…», «con el mismo solver», «El solver no pudo…» | «Croquis…», «con la misma física», «La reconstrucción…»                                                                                                                                                            | `b01-reconstruccion-*.jpg`      |
| 2   | Dos hipótesis (pantalla y dictamen)                                                               | «Costo del ajuste: 0.075», «la de menor costo»                       | «Desajuste con la evidencia: 0.075», «la que menos se aparta de la evidencia», con la nota de que menor es mejor                                                                                                   | `b02-hipotesis-*.jpg`           |
| 3   | Notas del rango, gráfica de las simulaciones, conductores, dictamen, límite de cobertura, reversa | «p10–p90», «p50»                                                     | «el rango donde cae el 80 % de las simulaciones», «la mediana» (los rangos se quedan, dichos mejor)                                                                                                                | `b01`, `b02`                    |
| 4   | Cálculos y supuestos                                                                              | «(ADR 0048)», «(ADR 0091)»                                           | Fuera                                                                                                                                                                                                              | —                               |
| 5   | Relieve real                                                                                      | «donde el INEGI no tiene LiDAR»                                      | «donde el INEGI no tiene levantamiento láser»                                                                                                                                                                      | `b10-chica-terreno-despues.jpg` |
| 6   | Supuestos                                                                                         | «Supuesto del solver: …»; «El reporte no la da» en un caso narrado   | «Supuesto de Croquis: …»; «El caso no la da»                                                                                                                                                                       | `b03-danos-*.jpg`               |
| 7   | Trazabilidad del dictamen                                                                         | «solver de Croquis 2.x, lectura narracion-cesvi-v1»                  | «reconstrucción física de Croquis (versión 2.x) y verificación con el método de CESVI», sin la versión del prompt                                                                                                  | —                               |
| 8   | Sello del dictamen firmado                                                                        | «huella de las entradas abc123…», «SHA-256 abc123…»                  | **Se quedó**, como «huella digital (SHA-256)»: el sello con la huella SHA-256 está en el diseño del dictamen que pidió René (`docs/cesvi/rediseno/laboratorio/prompt-laboratorio.md`). **Decide René** si se quita | —                               |
| 9   | Mensajes de error                                                                                 | «no cumple el contrato», «El solver falló»                           | En palabras del perito                                                                                                                                                                                             | —                               |
| 10  | Bitácora de los agentes                                                                           | En la reconstrucción y el dictamen                                   | Fuera (bloque A, A7)                                                                                                                                                                                               | `evidencia/a/a7-*.jpg`          |

### Nombres inconsistentes (A/B contra V1/V2)

| #   | Dónde                         | Antes                                                                | Qué se hizo                                                               | Evidencia                  |
| --- | ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------- |
| 11  | Tarjetas de las dos hipótesis | «V2: 57 (55–78)», «V1 termina a…»                                    | «B · Tacoma: 57 (55–78) km/h»                                             | `b02-hipotesis-*.jpg`      |
| 12  | Aviso de vehículos encimados  | «V1 y V2 quedaron encimados»                                         | «A · Jetta y B · Camaro quedaron encimados»                               | `b01-reconstruccion-*.jpg` |
| 13  | Preguntas de Croquis          | «¿Con qué zona entró en contacto V2…?», «V1 con V2, luego V3 con V2» | «…Toyota Tacoma (B)…»; las opciones con letras («A con B, luego C con B») | `b04-preguntas-*.jpg`      |
| 14  | Presentar                     | «Vehículo 1 · A · Jetta»                                             | «Vehículo A · Jetta»                                                      | `b07-presentar-*.jpg`      |
| 15  | Lo leído (bloque A)           | Lista con «V1 · VW Jetta 2002» e «Impacto 1: V1 y V2»                | Los impactos con letras en «Lo que Croquis leyó»                          | `evidencia/a/a2-*.jpg`     |

### Textos cortados, encimados y tapados

| #   | Dónde                                       | Antes                                                                | Qué se hizo                                                                                                                                        | Evidencia                        |
| --- | ------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 16  | Barra de actos, ventana chica               | Los nombres de los actos se pisaban                                  | El acto actual dice su nombre completo; los demás, su número (el nombre sigue en la etiqueta accesible). En grande, igual que antes                | `b09-chica-paso1-*.jpg`          |
| 17  | Paso 1, ventana chica                       | El mapa tapaba el texto y los botones «Anterior» y «Continuar»       | El panel ya no se encoge bajo el mapa                                                                                                              | `b09-chica-paso1-*.jpg`          |
| 18  | Hoja de la pregunta (A4)                    | El texto del relieve, detrás de «Es pavimento liso»                  | Ningún renglón se encoge; la hoja hace scroll                                                                                                      | `b10-chica-terreno-despues.jpg`  |
| 19  | Barra de avance de La escena, ventana chica | Se salía por la derecha y escondía «Ver la reconstrucción»           | Solo la pregunta actual dice su nombre; las demás, su palomita o su número                                                                         | `b10-chica-terreno-despues.jpg`  |
| 20  | «¡La escena está lista!»                    | Sus botones quedaban debajo de la barra de avance (aun a 1440×900)   | La tarjeta queda arriba de la barra                                                                                                                | `b05-escena-lista-*.jpg`         |
| 21  | Avisos del mapa y la banda de medición      | Tapaban «Deshacer»                                                   | Bajan a 72 px en pantallas medianas y grandes                                                                                                      | `b11-mapa-avisos-antes.jpg` / `b11-medir-y-avisos-despues.jpg` |
| 22  | Presentar con 3D                            | El degradado de la izquierda tapaba la leyenda ilustrativa del visor | La leyenda completa va en la capa de la página: «Reconstrucción ilustrativa · entorno procedural: no es el lugar real · el dictamen es del perito» | `b07-presentar-*.jpg`            |
| 23  | Líneas del mapa (trayectos y medida)        | No se dibujaban mientras el mapa cargaba                             | Se dibujan en cuanto el mapa queda quieto (bloque A)                                                                                               | `b11-mapa-avisos-antes.jpg` / `b11-medir-y-avisos-despues.jpg` |

### Estados vacíos, botones y detalles a medio hacer

| #   | Dónde                   | Antes                                                                                                                     | Qué se hizo                                                                                              | Evidencia                     |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 24  | Daños                   | «Narrados: frontal; frontal.»                                                                                             | Sin repetir: «Daños narrados: frontal.»                                                                  | `b03-danos-*.jpg`             |
| 25  | Daños, caso narrado     | «Del reporte: sin dato (el reporte no trae la medida de la deformación de V1)»                                            | «Deformación medida: sin dato (el texto no trae la medida de la deformación)»                            | `b03-danos-*.jpg`             |
| 26  | Daños, poca energía     | «perfil estimado 0 · 0 · 0 · 0 · 0 · 0 cm» junto a 3.0 kJ                                                                 | «menos de 0.5 cm en todo el ancho». Es la misma cifra: cada punto redondea a cero                        | `b03-danos-*.jpg`             |
| 27  | Supuestos               | «ya dentro del rango» (no se entendía)                                                                                    | «cada uno varía dentro de su rango»                                                                      | `b03-danos-*.jpg`             |
| 28  | Dictamen                | Botones «.croquis» y «Guardar aquí»                                                                                       | «Descargar el caso» y «Guardar en este navegador», con su explicación al pasar el puntero                | `b08-dictamen-*.jpg`          |
| 29  | Lista de casos y paso 1 | «Abrir archivo · .croquis», «Abrir un caso guardado (.croquis)», «Los archivos de caso de antes (.json) también se abren» | «Abrir archivo · Un caso que descargaste de Croquis», «Abrir un caso guardado»; la nota del .json, fuera | `b09-chica-paso1-despues.jpg` |
| 30  | Título del hecho        | En la carambola, la meta decía «Tramo está construido en concreto hidráulico…»                                            | Solo se toma el nombre de un tramo («Tramo Los Mochis-Navojoa»), no una frase                            | `b06-titulo-*.jpg`            |
| 31  | Modo oscuro             | Los mismos textos                                                                                                         | Las correcciones valen en claro y en oscuro                                                              | `b12-oscuro-*.jpg`            |

### Lo que se quedó a propósito (honestidad del método, dicho mejor)

- Los supuestos con su justificación, los rangos, los límites (incluido el de cobertura, 410 de 578), las dos hipótesis, la fuente de cada dato («del reporte», «del perito», «supuesto»), la leyenda ilustrativa del 3D y «el dictamen es del perito».
- Las referencias de las fuentes (NHTSA, Fricke 2010, INEGI): dicen de dónde sale un valor, que es parte del método.
- Los percentiles de «Cómo se reparten las simulaciones»: van plegados y cada uno se explica en una frase al pasar el puntero.

## Lo que la pasada encontró y no se corrigió aquí

| Qué                                                                                                                                                                                | Por qué no aquí                                                          | Dónde quedó                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| Pasar de «Daños» a «Los números» congela la página más de 15 s (producción y build local)                                                                                          | Es rendimiento, no texto: hay que medirlo y mover el cálculo a un worker | `docs/PROGRESS.md`, «Endurecimiento pendiente» |
| El sello SHA-256 del dictamen                                                                                                                                                      | Está en `docs/cesvi/`: se le pregunta a René                             | Arriba, fila 8                                 |
| El paso 1 del caso (A1) y la pantalla antes de Reconstruir (A6)                                                                                                                    | Rediseño                                                                 | `para-fable.md`                                |
| La composición de Presentar con 3D, «Lado a lado» en Contra CESVI, las tarjetas de las hipótesis apretadas, el vacío de la tarjeta de daños, las etiquetas que se pisan en el mapa | Rediseño                                                                 | `para-fable.md`                                |

## Pruebas

Unitarias en verde:

- `hecho-laboratorio.test.ts`: nombres en las preguntas, impactos en palabras y tramo.
- `medir.test.ts`.
- `dictamen-caso.test.ts`: sin bitácora, con la huella dicha en palabras.
- `presentar-lab.test.ts`, `reconstruccion-lab.test.ts`, `axa-lectura-fisica.test.ts`.
- En `@croquis/cesvi`: `supuestos.test.ts` y `muestras.test.ts`, más el paquete completo.

Las e2e de los flujos principales corren en CI.
