# ADR 0131 — C3 y O4: el terreno entra en la física

- **Fecha:** 2026-11-10
- **Estado:** aceptada
- **Contexto:** CESVI pidió (C3 y O4, plan v4 §1 y §3.4, fase W5) que el terreno afecte la reconstrucción: el relieve real del lugar, superficies por zona con su fricción, zonas onduladas y topes. El plan exige que cada efecto lleve fuente o quede como supuesto declarado con rango, y que un terreno plano dé exactamente el resultado de antes. El contrato (2.3.0, ADR 0111) ya tenía `lugar.terreno` y la malla de relieve en el paquete caso-3d.

## Decisiones

1. **Sin terreno, el solver no cambia de camino.** `Terrain.from_spec` devuelve `None` si no hay zonas, ondulaciones ni topes y la malla falta o es plana. Entonces corre el código de siempre y el resultado es idéntico bit a bit (prueba en Python y en TS con cuatro escenas).
2. **La altura es la suma de relieve, ondulaciones y topes.** El relieve es la malla con interpolación bilineal. La ondulación es un seno de valle a cresta que se desvanece en 3 m hacia la orilla de su zona. El tope es un arco de círculo de cuerda `largo_m` y flecha `alto_m`: con 1.40 m y 0.10 m da el radio de 2.5 m del reductor circular de la NOM-034-SCT2/SEDATU-2022 (tabla 38). El visor de Unity dibuja el tope con ese mismo arco.
3. **Gravedad por el gradiente bajo las llantas.** La pendiente que siente un vehículo es la del plano de sus contactos. Antes del impacto, el frenado se integra cada 5 cm con la fórmula de siempre y la pendiente y la fricción del lugar donde va. Después del impacto, cada paso suma la componente de la gravedad cuesta abajo. `lugar.pendiente` conserva su significado y se suma a la del terreno.
4. **Fricción por zona, con su rango en el Monte Carlo y en la inversión.** Bajo cada llanta vale la de la zona que la contiene. El valor por omisión sale de `friction.json` para el tipo de la zona y el estado del lugar. El pasto es nuevo en la tabla: frenado con llantas bloqueadas de Cenek, Jamieson y McLarin (seco, 0.21 a 0.38; mojado, 0.17 a 0.24).
5. **El tope lleva dos supuestos declarados con rango,** porque no se encontró una medición que los fije:
   - **Energía:** cada eje que cruza disipa η veces (su carga × la altura del tope), con η = 1 (0.5 a 1.5).
   - **Contacto:** sobre el tope, la carga de la llanta baja una fracción κ = 0.5 (0 a 1) de lo que perdería una rueda rígida en la cresta, 1 − v²/(gR).
   - Van en `parametros.perdida_energia_tope` y `perdida_contacto_tope`, y la interfaz los dice en palabras. No se muestrean en el Monte Carlo: cambiarían la secuencia de números al azar de todas las escenas, y su efecto se lee mejor como dos casos límite que mezclado con lo demás.
   - Cada cruce deja el evento `cruce_tope` con su velocidad.
6. **La pose sale del plano de las cuatro llantas** (`z`, `cabeceo`, `alabeo`), solo cuando el terreno tiene altura. Unity solo la reproduce.
7. **La malla de relieve no viaja en la escena; se adjunta en memoria.** `with_relief` / `withRelief` la cuelga de `lugar.terreno.relieve` con una llave que no es del contrato y nunca se guarda. Así la inversión y el Monte Carlo, que reconstruyen cientos de veces, la usan sin pasarla de mano en mano. Si la escena cita un relieve y la malla no llega, el solver reconstruye en plano y lo avisa (`relieve_sin_malla`).
8. **El relieve real sale de tres fuentes, en este orden** (`/api/relieve`, `apps/web/src/server/relieve.ts`):
   1. **INEGI, modelo de terreno LiDAR de 5 m**, por los Terrain Tiles de AWS. El Continuo de Elevaciones Mexicano solo se descarga a mano desde la página del INEGI; los Terrain Tiles llevan el relieve del INEGI en México y cada mosaico dice de qué archivos salió.
   2. **Copernicus GLO-30**, donde el INEGI no tiene LiDAR. Se le esperan 12 s.
   3. **SRTM de 30 m**, el que traen los Terrain Tiles fuera del LiDAR.
   - El plan ponía a Copernicus antes que los Terrain Tiles. Se invirtió donde hay LiDAR por lo que se midió (`eval/results/w5_relieve.json`): Copernicus es un modelo de **superficie** y en ciudad mete los edificios como pendiente.
   - En el centro de Mérida, que es plano, Copernicus da 15.18 m de desnivel en 600 m y 5.3 % de pendiente en el punto; el LiDAR de terreno da 4.84 m y 0.5 %.
   - En el centro de Toluca: 4.3 % contra 1.1 %.
   - Desde la laptop, la malla con LiDAR llegó en 594 y 433 ms; Copernicus tardó de 13 a 60 s con esa red.
   - Que `mx_lidar/…_b` sea el modelo de terreno (y no el de superficie) se infiere de esa comparación y de la ficha del INEGI, que publica los dos tipos; el generador de los mosaicos no lo documenta.
9. **La malla lleva un nodo cada 10 m** (600 m de lado, 61 × 61) desde los mosaicos de zoom 14, y cada 30 m desde Copernicus. Declara su resolución de origen (5 o 30 m), su fuente y el aviso de su licencia. En el navegador se lleva al marco de la escena, con altura 0 en el punto de impacto.
10. **El PNG de los mosaicos se decodifica con código propio** (`decodificarPng`, 8 bits, RGB o RGBA, sin entrelazar), con `node:zlib`. Evita una dependencia con binarios en la función de Vercel. Para Copernicus se usa `geotiff` 3.0.5 (MIT).
11. **En el expediente** (`packages/cesvi/src/terreno.ts`): `expediente.terreno` guarda lo que marca el perito en coordenadas del mapa y `especDeExpediente` lo pasa a `lugar.terreno` en metros.
    - Una zona sin fricción fijada lleva la de la tabla con su rango.
    - Un tope nuevo lleva las medidas de la norma (circular, 0.10 × 1.40 m; sinusoidal, 0.12 × 3.40 m; trapecial, 0.10 × 5.40 m) hasta que el perito lo mide.
    - Una ondulación nueva lleva 0.10 m de valle a cresta y crestas cada 6 m como **supuesto**: no hay fuente que la fije, y la reconstrucción lo dice en sus límites hasta que el perito la mide.
12. **En la escena fácil,** después de las preguntas de C1: «¿Cómo es el terreno?», con opciones con su muestra (terracería, grava, pasto, otro, ondulado, tope) y un toque en el mapa para colocar cada una. «Es pavimento liso» la contesta sin marcar nada. Lo marcado se toca después para moverlo, girarlo, cambiar su tamaño o sus medidas.
13. **Dónde se ve:** el perfil de elevación del camino de cada vehículo, los cruces de tope con su velocidad y los supuestos, en Reconstrucción; las zonas, los topes y las curvas de nivel, en la maqueta del caso (el croquis del dictamen).

## Límites

- **El relieve no ve lo chico.** Una rampa de 2 m, el bombeo de la vía y los topes no salen de la malla: se declaran.
- **Fuera del LiDAR, el relieve es de 30 m** y, con Copernicus, de superficie. La fuente de cada malla se muestra junto al perfil.
- **La suspensión no se modela.** La pose es la del plano de las llantas y el tope usa los dos supuestos.
- **La volcadura, los peatones y las proyecciones siguen en plano.**
- **Los agentes reactivos frenan con la desaceleración nominal del lugar,** no con la de la zona.
- **Un tope sinusoidal o trapecial se trata como un arco** con su largo y su altura.
- **El paquete caso-3d de la web todavía no lleva la malla al visor de Unity:** falta en la integración de U (U6).

## Consecuencias

- `terraceria_topes` es la escena canónica 14 y la quinta de D1. Su resultado y su paquete caso-3d están versionados y entran en la prueba de paridad.
- `caso3d.schema.json`: `relieve.licencia` acepta hasta 400 caracteres (el aviso de Copernicus pasa de 120).
- La escena fácil tiene una pregunta más; las e2e que la recorren contestan «Es pavimento liso».
