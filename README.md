# Croquis

> Reconstrucción 3D de percances viales a partir del relato de quien los vivió.
> **Reconstrucción ilustrativa. No es un peritaje, una prueba legal ni un dictamen de responsabilidad.**

Croquis toma lo que una persona cuenta ("iba por Tollocan, el de la camioneta gris se me cerró…"), lo convierte con un LLM en una escena estructurada donde cada dato está ligado a la frase que lo respalda o marcado como supuesto, lo deja corregir en un croquis 2D, reconstruye la física con un solver propio y lo muestra en 3D en el navegador. **La IA traduce, la física decide y el visor muestra.**

Estado: **F4 — Daño** (ver `docs/PROGRESS.md`). Este README se completa fase por fase siguiendo el estándar de PLAN §15; toda cifra que aparece aquí sale de un script en `eval/` con su salida en `eval/results/`.

## Problema

Cifras calculadas desde los datos abiertos de INEGI ATUS 1997–2025 con `uv run croquis-eval atus-summary` (fuente y definiciones en `data/SOURCES.md`; salida en [`eval/results/atus_summary.json`](eval/results/atus_summary.json)).

| Indicador (zonas urbanas y suburbanas de México) |    2024 |    2025 |   Cambio |
| ------------------------------------------------ | ------: | ------: | -------: |
| Accidentes de tránsito registrados               | 374,949 | 380,391 |  +1.45 % |
| Personas fallecidas en el lugar                  |   4,656 |   4,571 |  −1.83 % |
| Personas heridas                                 |  85,980 |  86,956 |  +1.14 % |
| Colisiones con motocicleta                       |  61,869 |  68,505 | +10.73 % |
| Volcaduras                                       |  13,371 |  15,412 | +15.26 % |
| Peatones fallecidos en el lugar                  |     901 |     776 | −13.87 % |
| Pasajeros fallecidos en el lugar                 |     972 |   1,004 |  +3.29 % |

- En 2025 el **Estado de México** fue la entidad con más personas fallecidas en el lugar (460, con 25,032 accidentes), seguido de Jalisco (391), Puebla (291), Chihuahua (271) y Ciudad de México (269).
- Distribución por tipo en 2025: colisión con vehículo automotor 58.4 %, con motocicleta 18.0 %, con objeto fijo 11.4 %, volcadura 4.1 %, con peatón 2.8 %, salida del camino 2.6 %, con ciclista 1.1 %. Esta distribución guía la composición del benchmark Relatos-MX (F6).
- El total de 2021 recalculado desde el archivo (340,415) coincide con la cifra publicada por el INEGI que citaba el plan.

Después de un percance, quien lo vivió tiene que explicarlo (a su aseguradora, al ajustador, al otro conductor, a su familia) con palabras y, a lo mucho, un croquis a mano. Las herramientas profesionales de reconstrucción son caras, cerradas y para peritos; las animaciones genéricas no respetan la física.

## Qué hay hoy

- **El contrato `EscenaSpec` v1** (`packages/scene-schema/escena.schema.json`): cada dato lleva `fuente` (relato, usuario, supuesto o default), `confianza` y el fragmento literal del relato que lo respalda. Zod y Pydantic se generan desde el esquema y CI verifica que estén al día.
- **Diez escenas canónicas** con relato (alcance, lateral en intersección, frontal en curva, peatón en cruce, motociclista, árbol, poste, volcadura, nocturno con lluvia, glorieta) que validan en TypeScript y en Python.
- **Un validador semántico** con paridad TS ↔ Python: referencias rotas, evidencia faltante, rangos declarados, masas y dimensiones fuera de la clase (tabla construida desde 47 fichas técnicas), velocidades implausibles, vehículos encimados, roles y eventos incoherentes. Los mensajes nunca asignan culpa.
- **El visor 3D** (`/visor`): las diez escenas reconstruidas por el solver en el navegador, con vía, banquetas y rayas del mismo modelo que el croquis, vehículos genéricos sin marcas a sus dimensiones reales, personas articuladas, sol según fecha, hora y lugar, línea de tiempo con cámara lenta y cuadro por cuadro, cámaras libre, cenital, del conductor (con lo que podía ver), cinematográfica, de daño y que sigue a la persona, y la tabla de ΔV, dirección de la fuerza y energía con la fuente de cada parámetro. Usa `WebGPURenderer` de three.js y elige por medición entre WebGPU y WebGL 2.
- **El daño** que calcula el solver se ve en cada vehículo: la carrocería se hunde con la forma y la profundidad del perfil de aplastamiento C1–C6 (una prueba lo mide sobre la malla), con pintura transferida, rayones, parabrisas agrietado, vidrios y piezas desprendidas simulados con Rapier, bolsas de aire con umbrales del IIHS y marcas de frenado y derrape sacadas de las trayectorias. Las reglas que no salen del solver están marcadas como ilustrativas.
- **Las personas** son cuerpos de MakeHuman (CC0), sin rasgos de sexo ni etnia y con ropa neutra; la edad elige la variante y la complexión sale de la masa y la estatura. Quien camina lo hace con una marcha de curvas biomecánicas publicadas. Quien es golpeado sale proyectado con un ragdoll de Rapier que cae dentro de los límites de Searle. Los ocupantes van en su asiento y se mueven en el impacto según el solver (con y sin cinturón), con aros azules neutros donde tocan el interior; Croquis no estima lesiones. La cámara del conductor marca qué podía ver y qué lo tapaba, y la volcadura se ve como secuencia ilustrativa.
- **El croquis 2D** (`/croquis`): arrastra y gira vehículos, personas, objetos y marcas; el JSON y el dibujo son la misma escena y lo que la persona mueve queda marcado como suyo.
- **El relato** (`/relato`): la persona escribe con sus palabras. Los nombres, placas, teléfonos, correos, CURP, RFC y números de domicilio se quitan en el navegador antes de enviar (el mismo redactor en Python y en TypeScript, con paridad probada en 517 textos). Un glosario de español mexicano reconoce expresiones como "se me cerró" o "le di un alcance". La extracción usa Claude con salida estructurada cuando hay llave (si no, una línea base de reglas) y siempre termina en el mismo constructor de `EscenaSpec`: cada dato del relato lleva su cita literal y lo que no tiene cita baja a `supuesto`. Después se pregunta, como máximo tres veces por ronda, solo lo que más cambia la reconstrucción (contradicciones que detecta el solver y sensibilidad con semilla), sin culpar a nadie, y la escena se abre en el croquis.
- **Relatos-MX** (`data/relatos-mx`): 320 relatos sintéticos con su `EscenaSpec` de referencia, distribuidos como los tipos de accidente de ATUS, en cinco registros (coloquial, formal, con faltas, desordenado, breve), con datos personales sintéticos y 197 variantes contrafactuales. El test (160) está congelado por hash.
- **Rangos, inversión y consistencia** (F7): cada resultado trae el intervalo del 80 % (Monte Carlo con semilla sobre velocidades, masas, fricción y frenado). La inversión busca las velocidades y direcciones con las que el solver reproduce la evidencia declarada (posiciones y orientación final, marcas de frenado, distancia de proyección, daño), y dice cuándo la evidencia no basta para estimar algo. Lo declarado que no cabe en ninguna solución física se marca en lenguaje llano, sin culpar, y en `/relato` se convierte en pregunta. En el visor se comparan hasta tres hipótesis ("¿y si iba a 60?") como vehículos fantasma, con la diferencia en un panel.
- **El solver de referencia** (`solver/croquis_solver`): impacto por impulso entre cuerpos rígidos planos, energía de deformación CRASH3 con rigidez por clase medida en pruebas de NHTSA, frenado y trayectorias previas, movimiento posterior hasta el reposo, objetos fijos, proyección de peatones y jinetes (Searle), cinemática de ocupantes, visibilidad desde el ojo de cada conductor y criterio de inicio de volcadura. Reconstruye las diez escenas de forma determinista; la conservación de momento se prueba con Hypothesis.

## Cómo probarlo

### En local (Windows, PowerShell)

Requisitos: Node 24, pnpm 12, Python 3.14 y uv 0.13 (ver `docs/adr/0001-stack.md`).

```powershell
pnpm install
uv sync --all-packages --all-groups
pnpm dev            # web en http://localhost:3000 (relato en /relato, croquis en /croquis, visor 3D en /visor)
uv run uvicorn croquis_api.main:app --port 8000   # API para /relato (con ANTHROPIC_API_KEY usa Claude; sin ella, reglas)
uv run pytest       # pruebas Python
pnpm test           # pruebas TypeScript
pnpm --filter @croquis/web test:e2e   # Playwright (requiere `playwright install chromium`)
```

### En vivo

Pendiente de F11 (despliegue dev y prod).

## Resultados medidos

Cada evaluación tiene un script en `eval/`, su salida versionada en `eval/results/` y una alternativa simple contra la que se compara (PLAN §8).

| ID        | Qué se mide                                                                                                                                                                                              | Croquis                                                                                                                                                                                                                                   | Alternativa simple                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| E2        | Velocidad de impacto a partir del aplastamiento, contra barrera rígida frontal; coeficientes CRASH3 por clase, dejar-uno-fuera (1316 pruebas de NHTSA, 8 clases)                                         | error absoluto medio **8.1 km/h**                                                                                                                                                                                                         | recta global ΔV = c·C̄ sin clase ni masa: 9.03 km/h; regla de Emori (1 mph por pulgada): 27.74 km/h |
| E2        | Aplastamiento medio a partir de la velocidad, mismas pruebas                                                                                                                                             | error absoluto medio **75.4 mm**                                                                                                                                                                                                          | recta global: 74.4 mm                                                                              |
| E4        | Velocidad de impacto a partir de la distancia de proyección de un peatón, 17 casos publicados (impactos escenificados del IPTM, pruebas con maniquí y casos reales)                                      | error absoluto medio **5.215 km/h**; el intervalo cubre **65 %** de los casos (ancho medio 12.685 km/h)                                                                                                                                   | Searle sola: 5.813 km/h, cobertura 24 % (ancho 5.831 km/h); Wood: 6.156 km/h                       |
| E4        | Distancia de proyección a partir de la velocidad medida, mismos casos                                                                                                                                    | error absoluto medio **2.543 m**                                                                                                                                                                                                          | Searle sola: 2.912 m                                                                               |
| F5        | Ragdoll del visor dentro de los límites de Searle (460 corridas con semilla: escenas canónicas y barrido de 20 a 70 km/h con tres cuerpos)                                                               | **100 %** con la calibración; **94.6 %** con la física sola                                                                                                                                                                               | criterio de PLAN §13: ≥ 95 %                                                                       |
| E6        | Rendimiento del visor con daño y personas en la laptop de referencia (i5-10210U, Intel UHD, 8 GB): 10 escenas a 1920×1080, cámara en movimiento, sin tope de vsync, mejor de 2 corridas en orden alterno | modo automático: calidad media **61.4 fps** mínimo entre escenas; alta **30.3 fps**; carga inicial **3.1 MB**                                                                                                                             | presupuesto de PLAN §7.8: ≥ 60 fps en media, ≥ 30 fps en alta, ≤ 8 MB                              |
| E1        | Extracción del relato en el test congelado de Relatos-MX (160 relatos sintéticos de 9 tipos de ATUS y 5 registros); prompt v1 sin ajuste con datos, verificador de evidencia                             | **Claude Sonnet 5.5**: F1 micro **0.875** (macro 0.904), vehículos exactos 91.9 %; **Claude Haiku 5.5**: 0.852 (macro 0.878), 92.5 %. Citas sin respaldo literal antes del verificador: Sonnet 0 de 1468, Haiku 8 de 1416; después: **0** | línea base de reglas: F1 micro 0.714 (macro 0.557), vehículos exactos 69.4 %                       |
| E1        | Costo y latencia de la extracción, mismo test                                                                                                                                                            | Sonnet **$9.96** por 1,000 relatos, p50 4.5 s (p95 10.6 s); Haiku $1.31, p50 10.6 s (p95 14.3 s)                                                                                                                                          | reglas: $0, p50 2.3 ms                                                                             |
| E1        | Fuga de datos personales del redactor en el navegador, mismo test (110 datos sintéticos; es común a los tres métodos)                                                                                    | **7.3 %** se filtran (6 nombres, 2 placas); 2 tramos redactados de más                                                                                                                                                                    | sin redactor: 100 %                                                                                |
| E1        | Diferencia contrafactual: cambiar sexo, edad o vehículo no debe cambiar velocidades ni maniobras (160 pares), frente a repetir el mismo relato                                                           | Sonnet **11.2 %** de los pares cambian, igual que al repetir el mismo relato (11.2 %); Haiku 15.6 %, menos que al repetirlo (21.2 %): no hay diferencia atribuible a sexo, edad o vehículo más allá de la variación propia del modelo     | reglas: 3.8 % (deterministas: 0.0 % al repetir)                                                    |
| E1        | Preguntas (≤ 3 por ronda): errores de extracción en velocidad, maniobra, frenado, clase y estado del piso que cubren, y preguntas no redundantes                                                         | sobre Sonnet: 5.4 % de 129 errores, 92.1 % no redundantes; sobre Haiku: 8.6 % de 162, 92.4 %                                                                                                                                              | sobre reglas: 33.9 % de 174, 94.7 %                                                                |
| E3        | ΔV a partir del aplastamiento medido, contra el ΔV que registró el EDR, en NHTSA CISS: test 2022–2024 (2,205 vehículos con EDR y ΔV de WinSMASH); la única constante libre se calibró con 2017–2021      | error absoluto medio **11.49 km/h** (mediano 7.89), sesgo +3.97 km/h, 59.5 % a ±10 km/h; el intervalo p10–p90 cubre **81.7 %** de los casos                                                                                               | WinSMASH (lo reconstruye CISS): 8.19 km/h (mediano 5.70), sesgo −3.45, 72.6 % a ±10 km/h           |
| E3        | Por grupo, mismos casos                                                                                                                                                                                  | EDR ≥ 48 km/h (254): 19.56 km/h, sesgo **−3.14**; frontales (1455): 10.74; laterales (494): 11.04; traseros (256): 16.59, sesgo +11.55                                                                                                    | WinSMASH: 17.54, sesgo −14.37; 8.65; 7.32; 7.26, sesgo +1.87                                       |
| E5, E7–E9 | Deformación BeamNG, paridad, determinismo, usabilidad                                                                                                                                                    | pendientes (F10, F9, F9, F11)                                                                                                                                                                                                             |                                                                                                    |

Scripts: `uv run croquis-eval e2-barrier` → [`eval/results/e2_barrier.json`](eval/results/e2_barrier.json); `uv run croquis-eval e3-ciss` (tras `uv run croquis-data ciss download` y `build`) → [`eval/results/e3_ciss.json`](eval/results/e3_ciss.json); `node eval/e6_performance.mjs` (tras `pnpm --filter @croquis/web build`) → [`eval/results/e6_performance.json`](eval/results/e6_performance.json). E6 mide ambos backends; el modo automático decide en cada escena: WebGPU si alcanza 60 fps y, si no, el más rápido.

Lectura honesta de E1:

- **Quién escribió el benchmark:** lo escribieron agentes de IA (los lotes de test, agentes que no vieron la línea base, y otros que los auditaron). Mide español escrito por un modelo, no por personas; E9 lo contrastará con relatos reales.
- **Brecha dev–test:** la línea base y el redactor se ajustaron solo con el dev. Allí dan F1 0.759 y 0 % de fuga, contra 0.714 y 7.3 % en el test congelado.
- **Clase de vehículo:** es el único campo donde Claude queda por debajo de las reglas (F1 0.638 Sonnet, 0.614 Haiku, 0.802 reglas). Cuando el relato solo nombra el modelo ("Aveo", "Jetta"), el prompt v1 no le da la tabla de modelos y le pide no precisar lo que no se dice, así que omite la clase. Se descubrió con el test, así que no se corrigió contra él (PLAN §5.2); el prompt v2 se valida en el dev y se medirá en un test nuevo.
- **Script:** `uv run croquis-eval e1-extraction --split test` → [`eval/results/e1_extraction.json`](eval/results/e1_extraction.json). Las 962 respuestas de Claude están grabadas en `extraction/grabaciones` y CI las reproduce sin llamar a la API.

Lectura honesta de E3:

- **Croquis queda detrás de WinSMASH en conjunto.** WinSMASH usa rigidez por vehículo y años de ajuste de NHTSA; Croquis usa rigidez por clase y un modelo abierto. La ventaja está en los choques fuertes: con ΔV del EDR de 48 km/h o más, WinSMASH subestima en promedio 14.37 km/h y Croquis 3.14.
- **Traseros y laterales son la debilidad.** Solo hay rigidez medida para el frente (pruebas de barrera de NHTSA). Atrás y a los lados se usa un respaldo genérico marcado `supuesto`, y en traseros Croquis sobreestima 11.55 km/h. Ajustar esa rigidez con el EDR de CISS mezclaría validación y calibración. Se tomará de las pruebas laterales y traseras de NHTSA (pendiente en `docs/PROGRESS.md`).
- **Baja velocidad:** con EDR de 0 a 16 km/h Croquis sobreestima 11.37 km/h. El umbral sin deformación permanente ($b_0$) es el de literatura y no se ajustó con estos datos.
- **El intervalo sí es honesto:** el p10–p90 cubre el 81.7 % de los casos de test, contra el 80 % que se fijó en desarrollo. Por eso el visor muestra rangos y no un solo número.

Lectura honesta de E2: separar por clase y normalizar por masa y ancho mejora la estimación de velocidad frente a la mejor recta global, pero no la de aplastamiento. La dispersión de rigidez dentro de cada clase domina el error (desviación mediana por clase en `e2_barrier.json`). Por eso el solver reportará rangos en F7 y marca el origen de cada coeficiente.

## Mapa del repo

Ver PLAN §3.2. Resumen: `apps/web` (Next.js), `packages/scene-schema` (contrato, generadores, fixtures, validador), `packages/croquis-2d` (editor 2D), `packages/solver-ts` y `packages/viewer` (en fases siguientes), `services/api` (FastAPI), `solver` (referencia Python), `extraction` (comprensión del relato), `data` y `eval` (datos y evidencia), `assets`, `infra`, `docs`.

## Datos, licencias e IA responsable

- `data/SOURCES.md` y `assets/ASSETS.md` registran origen y licencia de cada dato y asset. Los datos de accidentes son del INEGI (ATUS) bajo sus Términos de Libre Uso; las masas y dimensiones de vehículos vienen de fichas técnicas públicas de los fabricantes (URL por modelo).
- `docs/responsible-ai.md` detalla las medidas de PLAN §10.
- Código bajo licencia MIT (`LICENSE`).

## Límites y siguiente paso

Se documentan al cierre de cada fase en `docs/PROGRESS.md`.
