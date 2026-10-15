# ADR 0015 — Inercia de guiñada medida por grupo de carrocería

- **Estado:** aceptado (2026-10-15; pendiente 3 de F7)
- **Contexto:** el solver usaba la placa rectangular uniforme, $I_z = m (L^2 + W^2)/12$, para la inercia de guiñada de todos los vehículos. Esa inercia decide cuánto gira cada vehículo después del impacto, y con ello sus trayectorias y posiciones finales. El pendiente era sustituirla por mediciones (Heydinger et al., SAE 1999-01-1336).

## Decisiones

1. **Fuente: la base de parámetros inerciales de vehículos ligeros de NHTSA** (VRTC), en su PDF métrico oficial.
   - El servidor de NHTSA rechaza descargas automáticas, así que se baja la copia del Internet Archive del 2022-07-09, fijada por SHA-256 (`croquis-data inercia download|build`).
   - El PDF trae tres tablas con los mismos vehículos: especificaciones; centro de masa e inercias; y VIN, fecha y largo.
   - Las páginas vienen giradas, así que las celdas de cada fila se emparejan por la posición de la fila en la matriz de texto, no por su orden. Una celda vacía queda vacía en vez de correr las siguientes.
   - Las tres tablas se verifican campo por campo, y una fila que no se reconoce detiene la lectura: 495 vehículos.
2. **Modelo: el radio de giro proporcional al largo,** $k_z = c\,L$, con $c$ la mediana del grupo de carrocería (auto, SUV/MPV, pickup, van). Es la forma que reportó Johnson (2011) para autos con la misma base (29.1 % del largo); aquí sale 28.85 %.
3. **Filtros contados:** guiñada, masa, largo, centro de masa y vías medidos; sin lastre y con 0 o 1 ocupantes; sin estabilizadores ni instrumentación anotados; cada vehículo una vez. Quedan **164**: 78 autos, 28 SUV, 35 pickups y 23 vans.
4. **Evaluación, dejando uno fuera por grupo** (`eval/results/inercia_guinada.json`), contra dos alternativas que no usan la base:

   | Grupo  | $c$ (mediana ± desv.) | Modelo | Placa uniforme       | $I_z = m\,a\,b$ |
   | ------ | --------------------- | ------ | -------------------- | --------------- |
   | Auto   | 0.2885 ± 0.0102       | 5.4 %  | 12.1 % (sesgo +11.9) | 9.0 %           |
   | SUV    | 0.3100 ± 0.0111       | 5.5 %  | 5.4 %                | 7.0 %           |
   | Pickup | 0.2867 ± 0.0096       | 4.8 %  | 11.8 % (sesgo +11.2) | 5.8 %           |
   | Van    | 0.3183 ± 0.0108       | 5.2 %  | 6.2 %                | 7.6 %           |
   | Todos  |                       | 5.3 %  | 10.0 % (sesgo +7.5)  | 7.8 %           |

   Error relativo medio de $I_z$. Para la placa, el ancho es la vía media más 0.20 m, porque la base no trae el ancho; es un supuesto con poco peso, porque el largo domina.

5. **Clases sin grupo** (autobús, camión unitario, tractocamión, motocicleta, bicicleta, scooter): siguen con la placa, marcada como supuesto. `microbus_combi` va con las vans, por su carrocería.
6. **Misma tabla en la referencia y en el port.** `solver/croquis_solver/data/yaw_inertia.json` la escribe la evaluación. El solver Python (`inertia.py`) y el port TS (`inertia.ts`) la leen, y `generate-data` la copia.
7. **El contrato no cambia.** `parametros` es un objeto cerrado y la inercia no se reportaba antes. Su origen queda en `docs/physics.md` y en esta tabla.

## Consecuencias

- Cambian siete escenas canónicas con choque entre vehículos y, con ellas, las capturas que dependen de la trayectoria posterior. La paridad E7 se mantiene.
- F7 en las escenas cambia un poco (`eval/results/f7_inversion.json`), porque la inversión reconstruye las mismas escenas.
- **Límites:**
  - La base es de modelos 1971–1998, y los vehículos actuales pueden repartir su masa distinto.
  - La dispersión de $c$ dentro de cada grupo (±3.5 % en $k$) no se muestrea en Monte Carlo; queda registrada como pendiente.
