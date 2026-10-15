# ADR 0018 — BeamNG sale del proyecto; E5 y F10 validan contra autos reales

- **Estado:** aceptado (2026-10-15, decisión de René)
- **Contexto:** el plan validaba la deformación del visor (E5) y ofrecía un modo de alta fidelidad con BeamNG.tech (F10). Eso tenía tres problemas:
  - requería una licencia académica que solo René podía tramitar;
  - probablemente pedía un equipo con más RAM que la laptop de 8 GB;
  - comparaba contra otra simulación, no contra autos chocados.

## Decisión

1. **Sin BeamNG.** El puente BeamNGpy, el modo de alta fidelidad y la licencia salen del plan. PLAN.md y CLAUDE.md se reemplazan por las versiones que dio René.
2. **E5: deformación contra autos reales**, en tres partes:
   - **(a) Pruebas de NHTSA:** cada prueba de la Vehicle Crash Test Database se reproduce en Croquis con la misma clase, masa, velocidad y ángulo. El perfil de aplastamiento de la malla se compara con el medido en el vehículo después de la prueba.
   - **(b) Casos CISS:** lo mismo, con el aplastamiento C1–C6 que midieron los investigadores.
   - **(c) Comparación visual** lado a lado contra las fotos del vehículo.

   **Métricas:** error por punto C1–C6 y error en profundidad máxima, ancho dañado y área, por tipo de impacto (frontal, frontal desplazado, lateral, alcance, poste).

   **Líneas base:** deformación lineal simple y deformación uniforme en la zona de impacto.

3. **F10: validación del daño contra autos reales.**
   - **Pasos:** ingesta de reportes y casos, reproducción de cada caso, medición del perfil sobre la malla deformada y galería contra las fotos.
   - **Ajuste:** la deformación (caída, ancho, arrugas) se ajusta solo con el conjunto de desarrollo. La evaluación final usa un conjunto de prueba separado, congelado antes de medir, como los candados de Relatos-MX.
   - **Requisitos:** corre en la laptop, sin software externo con licencia.
4. **Primer paso de E5:** un inventario de cuántas pruebas de NHTSA y casos CISS traen medidas completas de aplastamiento y fotos útiles, documentado en `docs/data.md` con el tamaño de muestra.
5. **Siguiente paso documentado, fuera de las fases:** comparar contra elementos finitos con software libre (OpenRadioss y modelos públicos de vehículos) cuando haya una máquina potente.

## Consecuencias

- **Validación del daño:** se mide contra la realidad y no contra otra simulación. El costo es una muestra limitada por las pruebas y casos con medidas completas; el tamaño real y los tipos de impacto no cubiertos se reportan como límite.
- **Volcadura 3D:** pierde su validación prevista, porque E5 no cubre volcaduras. Se intentará con casos de volcadura de CISS si traen medidas útiles; si no, queda como límite declarado.
- **Lo que existía de BeamNG:** solo una carpeta vacía y sin versionar, `tools/beamng-bridge`, que se borró. Las menciones en el README, `docs/` y `PROGRESS.md` se cambiaron al plan nuevo, y la licencia salió de "Bloqueado — necesita a René".
- **Datos ya ingeridos:** la ingesta de la CTD (`data/croquis_data/nhtsa_ctd.py`) y de CISS (E3) ya existe. F10 la extiende a los reportes con fotos y a las medidas C1–C6 por caso.
