# ADR 0017 — Motocicleta caída que se desliza después del impacto

- **Estado:** aceptado (2026-10-15; pendiente de ADR 0016)
- **Contexto:** después del impacto, el solver trataba una motocicleta como un auto: llantas bloqueadas si frenaba, o rodando con un arrastre de 0.35 μ (supuesto) si no. Una moto que choca casi siempre cae y se arrastra de lado. Su desaceleración está medida, y es distinta a la de una llanta.

## Decisiones

1. **Arrastre medido** (`friction.json`, entrada `moto_caida`): Peck, Focha y Gloekler, _Motorcycle Sliding Friction for Accident Investigation_, ifz Forschungsheft 16, 2014.
   - **Mediciones:** 15 choques reales en pista medidos con GPS, −0.45 g (DE 0.09); 14 pruebas controladas sin deslizadores, −0.48 g (DE 0.08); el único evento en asfalto mojado, −0.41 g.
   - **Valores:** nominal 0.45 (los choques reales); rango 0.36–0.56 (la media menos una DE de los choques reales a la media más una DE de las pruebas).
   - **Estado del piso:** no cuenta. El evento en mojado cae dentro del rango en seco.
   - **Superficies:** el valor es `primaria` solo en asfalto. En otras superficies se usa el mismo rango como `supuesto`, porque no hay medición accesible. Day y Smith (SAE 840250) midieron grava y pasto, pero sus valores no están en una fuente abierta.
   - **Registro:** la copia consultada tiene SHA-256 fijo en `friction.json` y se registra en `data/SOURCES.md`.
2. **Modelo:** después del impacto, una `motocicleta` o un `scooter` caídos se deslizan con todos sus puntos de contacto en deslizamiento y ese arrastre. Se reusa el integrador de 3 GDL con los contactos bloqueados. La bicicleta conserva el modelo de llantas porque no hay medición de su arrastre caída (pendiente).
3. **Incertidumbre:** el arrastre se muestrea en su rango en Monte Carlo (ruta `parametros.friccion_moto_caida`) y en cada reestimación de la inversión. Se sortea al final para no mover los sorteos de lo demás. `reconstruct` lo recibe como `downed_mu` (`downedMu` en TS); sin él usa el nominal.
4. **Resultado 1.6.0:** el parámetro `friccion_moto_caida` (valor, rango, fuente y tipo), solo si una moto o un scooter está involucrado. La ruta de un campo muestreado puede ser `parametros.<nombre>`.

## Consecuencias

- **`motociclista`:** la moto se desliza 1.33 m después del choque (antes, 0.99 m). La raspadura del relato dice seis, así que esa evidencia sigue sin reproducirse (−3.1 σ). La velocidad que da la evidencia queda en 32–40 km/h, contra 40–60 declarados, y la bandera se mantiene.
  - El rumbo final de la moto también se aleja del declarado: su residuo pasa de −4.0 σ a −5.5 σ, porque deslizar caída la gira distinto que rodar.
  - La diferencia sugiere que el impacto deja a la moto con menos velocidad que la que implica la raspadura.
  - El relato no permite separar un error del modelo de impacto moto–auto de un largo de raspadura impreciso. Se reporta como está.
- **Las otras nueve escenas no cambian.** E7 pasa: el port TS reproduce el resultado.
- **Fuera de alcance, registrado:** una moto que cae antes del impacto y llega deslizándose. Hace falta una fase previa con caída y el contrato no la describe.
