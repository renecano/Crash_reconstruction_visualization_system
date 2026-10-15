# ADR 0013 — Rigidez lateral desde las pruebas de barrera móvil de NHTSA

- **Estado:** aceptado (2026-10-15; pendiente 2 de F7)
- **Contexto:** E3 mostró que costados y partes traseras son la debilidad de Croquis. Solo había rigidez medida para el frente (E2, pruebas contra barrera rígida). Atrás y a los lados se usaba un respaldo genérico marcado `supuesto`. La regla es no ajustar esa rigidez con el EDR de CISS, porque se mezclaría validación con calibración: tiene que salir de pruebas físicas.

## Decisiones

1. **Fuente: pruebas `ITV` de la Vehicle Crash Test Database** (impactor contra vehículo; `croquis-data nhtsa download|process --config ITV`, 2,517 pruebas). Para el costado se usan las de FMVSS 214 y del NCAP lateral:
   - barrera móvil deformable de NHTSA de 1,340 a 1,400 kg (1,368 kg nominales; 3,015 lb en 49 CFR 587);
   - avance oblicuo de 26–27° (la línea de avance forma 63° con el eje del vehículo, FMVSS 214 S8.10);
   - vehículo de producción, modelo 1995 o posterior, perfil DPD1–DPD6 medido (sin los centinelas 9999 de la base) y largo de daño de al menos 0.5 m.

   Quedan **1,265 pruebas** en 8 clases.

2. **Inversa exacta del cálculo del solver.** El solver obtiene el ΔV entre dos cuerpos con la energía de ambos, momento en 1-D y restitución cero (`delta_v_pair`), y la energía de cada uno con CRASH3 y la corrección (1 + tan²θ) por PDOF. La derivación hace lo mismo al revés:
   - energía total $E = \tfrac12 \mu v^2$ con la velocidad y las masas de la prueba;
   - la parte del vehículo, con su perfil, su largo de daño y su PDOF;
   - se despeja $d_1$ por bisección.

   Con la rigidez de cada prueba, el solver reproduce el ΔV de esa prueba (lo verifica una prueba unitaria).

3. **Forma de WinSMASH con $d_0$ de NHTSA.** $A = d_0 d_1$, $B = d_1^2$, $G = d_0^2/2$, con $d_0 = 63.3\ \sqrt{N}$, el valor que usa NHTSA para costados (Prasad 1991; Sharma et al. 2007). Las pruebas son a una o dos velocidades fijas y no permiten ajustar $d_0$.
4. **La barrera se lleva el 13.6 % de la energía.** Es el promedio que calculó Johnson (2011) en 70 pruebas laterales de NHTSA con el aplastamiento de la cara registrado en los reportes; varía de 2.49 % a 49.1 %.
   - NHTSA (WinSMASH) supone 5 %. Johnson muestra que ese supuesto infla la rigidez lateral y que WinSMASH sobreestima el ΔV de los costados.
   - La API no trae el aplastamiento de la cara, así que la fracción no puede salir de cada prueba.
   - Como sensibilidad, `e2_mdb.json` trae por clase los coeficientes con el 5 % de NHTSA: A sube de 6 % a 7 % y B de 13 % a 14 %.
5. **Equilibrio de fuerzas, probado y descartado antes de E3.** Se intentó repartir la energía igualando, en el aplastamiento máximo, la fuerza del costado (modelo lineal sobre el largo de daño) con la de la cara de la barrera (rigidez medida por Johnson contra un muro rígido). Daba a la barrera una mediana de 54 %, incompatible con lo calculado con el aplastamiento real de la cara. Además, la rigidez corregida de la cara y el 13.6 % de Johnson salen de caracterizaciones distintas (la suya y la de Struble et al. 2001), así que tampoco sirven juntas como verificación por prueba.
6. **Mediana por clase y bootstrap.** Igual que la zona frontal: la tabla guarda la mediana de A y B y los pares (A, B) de cada prueba, y la inversión los muestrea juntos. `e2-barrier` y `e2-mdb` escriben la misma tabla y cada uno conserva la zona del otro: el archivo sale idéntico en cualquier orden, y una prueba lo reproduce desde los CSV versionados.
7. **Trasera: sigue el respaldo `supuesto`.**
   - Las 170 pruebas de FMVSS 301 desde 2007 (barrera deformable a 80 km/h con 70 % de traslape) vienen en la API sin masa, largo ni perfil del vehículo, ni masa ni velocidad de la barrera.
   - Las completas son de modelos 1978–1994, y desde 1995 solo hay 8 utilizables.

   Los datos están en los reportes PDF de cada prueba (peso de prueba, masa de la barrera, velocidad medida y aplastamiento en tres puntos). Leerlos es la siguiente tarea, en su propia rama (`docs/PROGRESS.md`).

## Resultados (medidos)

- **E2 lateral** (`eval/results/e2_mdb.json`), dejar uno fuera por clase: el ΔV de cada prueba con la mediana de las demás tiene un error absoluto medio de **6.19 km/h**, contra 14.95 km/h con el respaldo genérico.
- **E3 en el test de CISS (2022–2024)**, que no se usó para nada de lo anterior (`eval/results/e3_ciss.json`):
  - **Costados:** el error absoluto medio baja de 11.04 a **8.51 km/h**, el sesgo de +6.26 a **+2.44** y la proporción a ±10 km/h sube de 56.3 % a **69.2 %**. WinSMASH: 7.32 km/h, sesgo −3.39.
  - **En conjunto:** de 11.49 a **10.30 km/h**, sesgo de +3.97 a +1.92. Mejoran también los frontales (9.83 contra 10.74), porque el otro vehículo suele tener el daño en el costado.
  - **Empeora** el grupo con EDR ≥ 48 km/h: de 19.56 a 19.94 km/h y sesgo de −3.14 a −5.19.
  - Los traseros no cambian (16.45 km/h, sesgo +11.40): siguen con el respaldo.
  - La recalibración de σ en el dev (el diseño de E3) da 0.4658, y la cobertura del intervalo en el test queda en 82.0 %.
- **E7:** la paridad del solver TS se mantiene (61,888 números, diferencia máxima 4.3e-5).

## Consecuencias

- Cambian los resultados de cuatro escenas canónicas con daño lateral o del otro vehículo de lado (`glorieta`, `lateral_interseccion`, `motociclista`, `volcadura`). Su daño ahora dice `origen_rigidez: nhtsa`.
- La tabla crece a ~170 KB por los pares de 1,265 pruebas; el port TS la importa.
- La fracción de la barrera es un promedio: en una prueba concreta puede estar entre 2.5 % y 49 %. Esa variación queda dentro de la dispersión de las muestras por clase, no se modela aparte.
- Se apoya en vehículos de prueba de EE. UU., como la rigidez frontal.
