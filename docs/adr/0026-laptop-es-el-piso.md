# ADR 0026 — La laptop es el piso: cuatro niveles de calidad y E6 por nivel

- **Estado:** aceptado (2026-10-17)
- **Contexto:** hasta ahora el presupuesto de PLAN §7.8 se medía en la laptop de René (GPU integrada Intel UHD, 8 GB) para los dos niveles altos del visor: media ≥ 60 fps y alta ≥ 30 fps. Con el entorno de F8 (ADR 0020–0025), media quedó justo en el límite: según la corrida, la escena más lenta dio entre 55.7 y 63.8 fps (`eval/results/e6_performance_f8_corte_mip.json` y `e6_performance_f8_tercera.json`). Entre corridas el mismo código varió ±15–20 % por el estado del equipo, y la corrida «mejor de 2 repeticiones» dejó pasar repeticiones que se contradecían.
- **Decisión de René (2026-10-17):** su laptop es el piso, no el techo. Las demos se harán en una computadora más potente, así que la calidad visual de los niveles altos no se limita por la laptop. René reemplazó PLAN.md (§7.8 y la fila de E6 de §8).

## Decisiones

1. **Cuatro niveles: baja, media, alta y ultra.**
   - **Elección automática:** según la GPU que reporta el navegador (las integradas arrancan en media; las dedicadas, en alta). Luego se ajusta con los fps medidos, con histéresis.
   - **Cambio manual:** siempre disponible en el visor.
2. **Alta y ultra se diseñan para la máxima calidad visual.**
   - **Qué llevan:** luces reales de faros y alumbrado, texturas completas, sombras (también de los focos) y efectos.
   - **Nunca se les quita nada por el rendimiento de la laptop.** Por eso la sombra de la luna, que ADR 0025 quitó de noche en todos los niveles, vuelve en alta y ultra aunque no se note: allí no se recorta nada.
   - **Lo nuevo que solo corre bien en una GPU potente** se agrega en estos niveles.
3. **Baja y media se ajustan a la laptop:** media ≥ 60 fps y baja ≥ 30 fps a 1080p.
   - **Lectura estricta de §7.8:** el plan pide el presupuesto en «la escena de referencia» (2 vehículos, 2 personas, intersección con árboles), y ninguna escena canónica coincide exactamente. E6 exige el presupuesto en **todas** las escenas canónicas, lo que incluye a cualquier escena de referencia. No se elige una escena fácil para pasar.
   - **Orden de trabajo en estos niveles:** primero se optimiza sin cambiar el aspecto (culling de luces por distancia y por cámara, luz horneada o proyectada que se vea igual, LOD y mipmaps del pasto, merge o instancing del piso, resolución de sombras), midiendo antes y después de cada cambio. Que el aspecto no cambia se mide con la diferencia por píxel, como en `eval/lib/visual-diff.mjs`.
   - **Si aun así hace falta quitar un efecto en media,** se le pregunta a René.
4. **E6 con protocolo robusto:**
   - **Repeticiones:** tres por configuración, en orden alterno de escenas, y se reporta la **mediana**, no la mejor.
   - **Re-medición:** si una repetición tiene tirones externos se vuelve a medir, con un máximo de intentos. Un tirón externo es una tarea larga del hilo principal en un nivel cuyos cuadros normales duran mucho menos de 50 ms, con el promedio claramente por debajo de las otras repeticiones.
   - **Condiciones registradas:** si el equipo está conectado o en batería, la carga, el plan de energía, la memoria libre, la GPU y la versión del navegador, al inicio y al final.
   - **Alcance en la laptop:** baja y media son el criterio. Alta y ultra se miden solo como información; su meta es la computadora de demo.
5. **Meta en la computadora de demo:** ≥ 60 fps en alta o ultra en todas las escenas canónicas. Queda en «Bloqueado — necesita a René» hasta que esa computadora esté disponible.
6. **Condiciones de medición de E6** (decididas al medir la línea base, 2026-10-17):
   - **Un navegador nuevo por medición.** Con uno solo para decenas de escenas, el proceso de GPU acumula estado. En la línea base larga, `frontal_curva` dio 58 fps de promedio contra 84 de mediana, y reintentar no ayudó. La misma escena sola, en un navegador nuevo, dio 61.2 fps con promedio igual a la mediana en las tres repeticiones.
   - **Modo de energía «Mejor rendimiento» durante la medición.** En «Equilibrado» la GPU integrada cambia de frecuencia por su cuenta: medidas intercaladas de la misma escena saltaron entre ~54, ~57, ~63 y ~69 fps.
     - **Cómo se aplica:** E6 guarda el modo que había, activa «Mejor rendimiento» con la API de Windows (`powrprof.dll`) y lo restaura al terminar, también si falla o se interrumpe (`eval/lib/power-mode.mjs`).
     - **Registro:** el modo de antes y el de durante quedan en `condiciones.modo_energia`.
     - **Por qué se decide sin preguntar:** es un cambio reversible que se restaura solo (regla de autonomía de `CLAUDE.md`).
7. **Media: MSAA 2× y superficies sin textura** (decisión de René, 2026-10-17; alta y ultra conservan MSAA 4× y las texturas).
   - **Costo por componente:** medido con `eval/e6_ab.mjs` (variantes intercaladas por ronda, diferencia pareada e IC 90 %), en calidad media sobre la base de antes del cambio.

     | Escena            | MSAA 4×                | Texturas del entorno | Sombras del sol     | Dos focos de faros  | Ruido del pasto  |
     | ----------------- | ---------------------- | -------------------- | ------------------- | ------------------- | ---------------- |
     | `glorieta`        | 4.75 ms (IC 4.12–5.56) | 3.07 ms (2.72–3.78)  | 1.91 ms (1.48–2.24) | —                   | no significativo |
     | `nocturno_lluvia` | 6.22 ms (5.71–7.06)    | 3.97 ms (3.48–4.64)  | —                   | 3.12 ms (2.82–3.79) | —                |

     Fuentes: `eval/results/e6_ab_costos_glorieta.json` y `e6_ab_costos_nocturno.json`. Las variantes usaron interruptores temporales que no quedaron en el código.

   - **Antes, se intentó optimizar sin cambiar el aspecto.**
     - **Rama de los focos:** saltar el modelo de iluminación de cada foco donde su color vale cero. Se descartó porque cambiaba la imagen: desaparecía el charco de luz del alumbrado.
     - **SMAA en lugar de MSAA:** no ahorró de forma significativa, 0.40 ms (IC −0.32 a 1.18), por el costo del pase de posproceso (`eval/results/e6_ab_aa_glorieta.json`).
   - **Opciones medidas** (`eval/results/e6_ab_aa_*.json`):
     - MSAA 2×: `glorieta` 61.3 fps y `nocturno_lluvia` 54.9.
     - MSAA 2× sin texturas: `nocturno_lluvia` 66.2.
     - MSAA 2× sin la luz real de los faros: `nocturno_lluvia` 62.9; se descartó porque quita los haces de los faros, que importan para la visibilidad nocturna.
   - **Antes y después**, con E6 en las mismas condiciones (modo «Mejor rendimiento», navegador nuevo, mediana de 3; `eval/results/e6_media_decision7_antes.json` y `e6_media_decision7_despues.json`):

     | Escena            | Antes    | Después  |
     | ----------------- | -------- | -------- |
     | `nocturno_lluvia` | 54.2 fps | 62.7 fps |
     | `frontal_curva`   | 58.1 fps | 79.2 fps |
     | `alcance`         | 59.5 fps | 86.0 fps |
     | `glorieta`        | 59.9 fps | 85.4 fps |

   - **Regla nueva de René** (en `CLAUDE.md`): los ajustes que solo tocan baja o media y cumplen §7.8, después de intentar optimizar sin cambio visible, sin quitarle nada a alta ni a ultra y sin perder ninguna función, se deciden sin preguntar y se documentan con sus números de antes y después.

## Consecuencias

- La fila de E6 del README cambia de forma: baja y media en la laptop (criterio) y alta y ultra como información, por ahora.
- La corrida oficial de E6 tarda más (tres repeticiones), pero un resultado ya no depende de una repetición afortunada.
- Las corridas de E6 que no cumplieron se conservan como evidencia en `eval/results/` (`e6_performance_f8_*.json`).
