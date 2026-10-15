# ADR 0016 — Fase de las marcas: contrato 1.1.0 y resultado 1.5.0

- **Estado:** aceptado (2026-10-15; pendiente 4 de F7)
- **Contexto:** el contrato 1.0.0 no decía si unas marcas en el piso quedaron antes o después del impacto.
  - El solver tomaba toda `marcas_frenado` como frenado de antes del impacto (fija la distancia de frenado) e ignoraba `marcas_derrape`.
  - Una raspadura o un derrape de después del choque, como el de la moto de `motociclista` ("la moto se arrastró… una raspadura de seis metros"), no restringía nada. Unas marcas de frenado de después del impacto se habrían leído como frenado previo.

## Decisiones

1. **Contrato 1.1.0:** `evidencias[].fase`, opcional, con `antes_impacto` o `despues_impacto`. Cambiar el contrato implica versión nueva, migración y fixtures regenerados (ADR 0004 §9).
2. **Sin fase, el significado de 1.0.0:** unas `marcas_frenado` son de antes del impacto y unas `marcas_derrape` tienen fase desconocida y no se usan. Por eso la migración 1.0.0 → 1.1.0 solo cambia la versión. Está registrada en TS y en Python, con una prueba que migra una escena 1.0.0 y la valida.
3. **Qué restringe cada marca** (`inversion.py`, `consistency.py` y su port TS):
   - **antes del impacto, de frenado:** la distancia de frenado, como antes;
   - **después del impacto, de frenado o de derrape:** un residuo nuevo, lo que el vehículo se desliza desde el impacto hasta el reposo contra el largo de las marcas, con σ = 1.5 m (supuesto, como la proyección: un largo que da el relato);
   - **antes del impacto, de derrape:** no se usa. Pediría un modelo de velocidad crítica en curva que el solver no tiene; queda documentado.

   La bandera `marcas_vs_velocidad` solo compara marcas de frenado de antes del impacto.

4. **Resultado 1.5.0:** la lista de evidencia de `inversion` admite `marcas_despues:<vehículo>`.
5. **Fixtures:** las siete marcas de las escenas canónicas llevan su fase según el relato. La de `motociclista` es de después del impacto; las demás, de antes. Los constructores de specs de Python y TS emiten 1.1.0 y siguen sin fase, así que sus marcas de frenado conservan la convención.

## Consecuencias

- Cambia la inversión de `motociclista`: la raspadura entra como evidencia. El solver desliza la moto menos de un metro después del choque, contra los seis que dice el relato (residuo de −3.4 σ). No modela una moto caída que se arrastra de lado, así que la evidencia queda sin reproducir y se reporta.
  - La bandera de velocidad que ya tenía la escena se mantiene (el vehículo B a 32–38 km/h por la evidencia, contra 40–60 declarados).
  - **Pendiente:** la moto caída que se desliza, con una fricción de deslizamiento con fuente.
- **Extracción:** el contrato admite la fase, pero la extracción todavía no la lee del relato. Hace falta en el prompt, en las reglas y en la anotación de los relatos de dev. Queda pendiente; los tests congelados no se tocan.
- La paridad E7 se mantiene: la inversión llega al port TS en F9.
