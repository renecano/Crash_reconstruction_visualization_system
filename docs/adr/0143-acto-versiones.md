# ADR 0143 · El acto «Versiones»: declaraciones e hipótesis con la misma física

- **Fecha:** 2026-11-18
- **Estado:** aceptada.
- **Pedido:** René, ronda 4, punto 8 («la propuesta 1 con la entrada de la 2»; propuestas en `docs/cesvi/ronda-4/propuestas-hipotesis.md`).

## Decisión

### 1. Un acto propio, entre Reconstrucción y Análisis

- **El paso `versiones`** va en `CLAVES_PASOS` y el acto «Versiones» en `ACTOS`.
  - El recorrido ya no compara índices a mano (`actual === 3`), sino claves (`actual === P.reconstruccion`). Así, un paso nuevo no recorre ningún número.
  - En las e2e, los pasos de Análisis en adelante subieron uno.
- **El escenario es el de la reconstrucción:** grande, con su barra. La versión elegida se dibuja como fantasma solo en este acto, para que la reconstrucción se vea limpia en los demás.
- **Opcional:** el acto nunca bloquea. Sin versiones, abre con los dos formularios a la vista.
- **La entrada de la propuesta 2:** «Comparar con una versión», bajo la cifra de Reconstrucción.

### 2. Se mueve, no se duplica

- **La declaración del conductor** (antes al fondo de «Ver el detalle») y **«Probar una hipótesis»** (antes al fondo de «Los números») viven solo aquí.
- **Una declaración por conductor:** la nueva reemplaza a la anterior.
- **Hipótesis:** hasta seis. Al probar la séptima, sale la más vieja.

### 3. Lo que cambia, en el lenguaje del perito

- **En la declaración:** tarjetas «Declaró» contra «La evidencia», primero lo que no coincide, con los vehículos por su nombre («B · GM Camaro»).
- **En la hipótesis** (`cambiosDeHipotesis`), contra los mismos conductores sin ella (ADR 0088):
  - si se tocan;
  - la velocidad de cada vehículo al contacto;
  - dónde está el vehículo de la hipótesis al contacto;
  - cuánto se separa su trayectoria.
- **Si sin la hipótesis los conductores no dan el impacto de la reconstrucción,** un aviso lo dice junto a las tarjetas, no solo en el detalle.

### 4. Las trayectorias del «¿y si…?» (el solver)

- **Qué agrega el solver:** el bloque `agentes` del resultado lleva `trayectorias` en `resultado` y en `linea_base`. Es cada vehículo, del inicio hasta el primer contacto (o el fin del horizonte), cada 0.1 s y en el instante final, con posición, rumbo y velocidad.
  - Va en Python (la referencia) y en el port TS.
  - El contrato es opcional, dentro de 2.3.0, como en el ADR 0142.
- **Ninguna cifra cambia:** la posición de cada agente es cerrada en t, así que muestrearla después de simular da lo mismo que durante la simulación.
  - En los cinco resultados de referencia de los agentes, solo cambia el campo nuevo.
  - La paridad TS pasa.
- **El resultado dibujable** (`resultadoDeHipotesis`) es el de la reconstrucción con esas trayectorias.
  - Lleva el daño en ceros, sin eventos ni personas: la simulación de los conductores no calcula el choque, y Unity no dibuja daño con el perfil en ceros.
  - La velocidad angular sale de las diferencias del rumbo.

### 5. Presentar y el dictamen

- **Presentar:** un capítulo «Versiones», antes de «Contra CESVI», con cada versión marcada como «Declaración» o «Hipótesis del perito».
- **El dictamen:** la sección «Versiones del caso». Cada declaración va con su tabla y su sugerencia, si se pidió. Cada hipótesis va con sus cambios y la nota de que es una prueba ilustrativa del perito, no evidencia ni un juicio sobre ningún conductor.

## Consecuencias

- **El 3D alterna entre la reconstrucción y la versión** (ADR 0123). El fantasma superpuesto en Unity pide un build nuevo.
- **El prototipo de las propuestas** (`/cesvi/propuestas/hipotesis`) no entra a `main`: se queda en la rama `feat/ronda4-c-hipotesis`.
